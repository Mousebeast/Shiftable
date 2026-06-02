'use strict';

const express = require('express');
const { requireStaff, requireManager } = require('../middleware/auth');
const {
  getLiveScheduleForWeek, getPublishedScheduleForWeek,
  getShiftsForSchedule, getUpcomingShiftForUser,
  createFreshDraftSchedule, forkDraftFromPublished,
  republishSchedule, discardDraft,
  getScheduleById, clearShiftsForSchedule,
  insertShifts, publishSchedule, getSchedulerInputs, getDraftScheduleForWeek,
  getShiftById, updateShift, deleteShift, insertOverrideShift,
  getOverrideShiftsForSchedule, checkShiftViolations,
  validateScheduleShifts,
  getClosedDays, addClosedDay, removeClosedDay, clearShiftsForDate,
  getTimeOffForWeek,
} = require('../db/schedule');
const { getEventsForWeek, getEventCoverageForWeek } = require('../db/events');
const { generateSchedule } = require('../services/scheduler');
const { createNotification } = require('../db/notifications');
const { sendToUsers } = require('../services/push');

const router = express.Router();

// GET /api/schedule/next — caller's next upcoming shift
router.get('/next', requireStaff, (req, res) => {
  const shift = getUpcomingShiftForUser(req.user.userId);
  return res.json({ shift: shift || null });
});

// GET /api/schedule/builder?week=YYYY-MM-DD — manager+
router.get('/builder', requireManager, (req, res) => {
  const { week } = req.query;
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return res.status(400).json({ error: 'week parameter required (YYYY-MM-DD)' });
  }
  const liveSchedule = getLiveScheduleForWeek(week);
  const draft = getDraftScheduleForWeek(week);
  const schedule = draft || liveSchedule;
  if (!schedule) return res.json({ schedule: null, shifts: [], closedDays: [], timeOffDates: [], events: {}, eventCoverage: [], hasDraft: false, liveSchedule: null });
  const shifts = getShiftsForSchedule(schedule.id);
  const closedDays = getClosedDays(schedule.id);
  const timeOffDates = getTimeOffForWeek(week);
  return res.json({
    schedule,
    shifts,
    closedDays,
    timeOffDates,
    events: getEventsForWeek(week),
    eventCoverage: getEventCoverageForWeek(week),
    hasDraft: !!draft,
    liveSchedule: draft ? liveSchedule : null,
  });
});

// GET /api/schedule?week=YYYY-MM-DD
router.get('/', requireStaff, (req, res) => {
  const { week } = req.query;
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return res.status(400).json({ error: 'week parameter required (YYYY-MM-DD)' });
  }
  const schedule = getPublishedScheduleForWeek(week);
  if (!schedule) return res.json({ schedule: null, shifts: [] });
  const shifts = getShiftsForSchedule(schedule.id);
  return res.json({ schedule, shifts, events: getEventsForWeek(week) });
});

// POST /api/schedule/generate — manager+
router.post('/generate', requireManager, (req, res) => {
  const { week, force } = req.body;
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return res.status(400).json({ error: 'week is required (YYYY-MM-DD)' });
  }
  const date = new Date(week + 'T00:00:00Z');
  if (date.getUTCDay() !== 1) {
    return res.status(400).json({ error: 'week must be a Monday' });
  }

  const liveSchedule = getLiveScheduleForWeek(week);
  if (liveSchedule && !force) {
    return res.status(409).json({ error: 'A published schedule already exists for this week' });
  }

  // Get or create the working draft
  let draft = getDraftScheduleForWeek(week);
  if (!draft) {
    draft = liveSchedule
      ? forkDraftFromPublished(liveSchedule.id, req.user.userId)
      : createFreshDraftSchedule(week, req.user.userId);
  }

  // Snapshot override shifts BEFORE clearing (preserves manager edits across re-generates)
  const overrideShifts = getOverrideShiftsForSchedule(draft.id);
  const closedDays = getClosedDays(draft.id);
  const closedDates = new Set(closedDays);

  const inputs = getSchedulerInputs(week);
  const { shifts, warnings } = generateSchedule({ ...inputs, overrideShifts, closedDates });
  clearShiftsForSchedule(draft.id);
  if (shifts.length > 0) insertShifts(draft.id, shifts);

  const resultShifts = getShiftsForSchedule(draft.id);
  return res.status(201).json({
    schedule: draft,
    shifts: resultShifts,
    warnings,
    hasDraft: true,
    liveSchedule: liveSchedule || null,
  });
});

// PATCH /api/schedule/shifts/:id — update a single shift (manager override)
router.patch('/shifts/:id', requireManager, (req, res) => {
  const shiftId = Number(req.params.id);
  const shift = getShiftById(shiftId);
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  const shiftSchedule = getScheduleById(shift.schedule_id);
  if (shiftSchedule?.status !== 'draft') {
    return res.status(409).json({ error: 'Cannot edit shifts on a published schedule — use Start Editing first' });
  }

  const { templateId, groupId, startTime, hours } = req.body;
  const finalGroupId = groupId != null ? Number(groupId) : shift.group_id;
  const finalTemplateId = templateId != null ? Number(templateId) : shift.shift_template_id;
  const finalStartTime = startTime ?? shift.start_time;
  const finalHours = hours != null ? Number(hours) : shift.hours;

  const violations = checkShiftViolations({
    scheduleId: shift.schedule_id,
    userId: shift.user_id,
    date: shift.date,
    groupId: finalGroupId,
    startTime: finalStartTime,
    hours: finalHours,
    excludeShiftId: shiftId,
  });

  updateShift(shiftId, { groupId: finalGroupId, templateId: finalTemplateId, startTime: finalStartTime, hours: finalHours });
  const resultShifts = getShiftsForSchedule(shift.schedule_id);
  const updatedShift = resultShifts.find(s => s.id === shiftId);
  return res.json({ shift: updatedShift, violations });
});

// DELETE /api/schedule/shifts/:id — remove a single shift
router.delete('/shifts/:id', requireManager, (req, res) => {
  const shiftId = Number(req.params.id);
  const shift = getShiftById(shiftId);
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  const shiftSchedule = getScheduleById(shift.schedule_id);
  if (shiftSchedule?.status !== 'draft') {
    return res.status(409).json({ error: 'Cannot edit shifts on a published schedule — use Start Editing first' });
  }

  const violations = checkShiftViolations({
    scheduleId: shift.schedule_id,
    userId: shift.user_id,
    date: shift.date,
    groupId: shift.group_id,
    startTime: shift.start_time,
    hours: shift.hours,
    excludeShiftId: shiftId,
  });
  const relevant = violations.filter(v => ['coverage_gap', 'fixed_conflict'].includes(v.type));

  deleteShift(shiftId);
  return res.json({ ok: true, violations: relevant });
});

// POST /api/schedule/:id/shifts — add an override shift to an existing schedule
router.post('/:id/shifts', requireManager, (req, res) => {
  const scheduleId = Number(req.params.id);
  const schedule = getScheduleById(scheduleId);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

  const { userId, date, groupId, templateId, startTime, hours } = req.body;
  if (!userId || !date || !groupId || !startTime || hours == null) {
    return res.status(400).json({ error: 'userId, date, groupId, startTime, hours are required' });
  }

  const violations = checkShiftViolations({
    scheduleId,
    userId: Number(userId),
    date,
    groupId: Number(groupId),
    startTime,
    hours: Number(hours),
    excludeShiftId: null,
  });

  const inserted = insertOverrideShift(scheduleId, {
    userId: Number(userId),
    groupId: Number(groupId),
    templateId: templateId ? Number(templateId) : null,
    startTime,
    hours: Number(hours),
    date,
  });
  const resultShifts = getShiftsForSchedule(scheduleId);
  const enriched = resultShifts.find(s => s.id === inserted.id);  // PK lookup, unambiguous
  return res.status(201).json({ shift: enriched, violations });
});

// GET /api/schedule/:id/validate — recheck coverage + per-shift violations against current shifts
router.get('/:id/validate', requireManager, (req, res) => {
  const scheduleId = Number(req.params.id);
  const schedule = getScheduleById(scheduleId);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  const { warnings, violations } = validateScheduleShifts(scheduleId);
  return res.json({ warnings, violations });
});

// POST /api/schedule/:id/close-day — mark a date as closed (removes all shifts, locks column)
router.post('/:id/close-day', requireManager, (req, res) => {
  const scheduleId = Number(req.params.id);
  const { date } = req.body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  }
  const schedule = getScheduleById(scheduleId);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  if (schedule.status !== 'draft') return res.status(400).json({ error: 'Can only close days on a draft schedule' });
  clearShiftsForDate(scheduleId, date);
  addClosedDay(scheduleId, date);
  const closedDays = getClosedDays(scheduleId);
  const shifts = getShiftsForSchedule(scheduleId);
  return res.json({ closedDays, shifts });
});

// DELETE /api/schedule/:id/close-day/:date — reopen a previously closed day
router.delete('/:id/close-day/:date', requireManager, (req, res) => {
  const scheduleId = Number(req.params.id);
  const { date } = req.params;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  }
  const schedule = getScheduleById(scheduleId);
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  if (schedule.status !== 'draft') return res.status(400).json({ error: 'Can only modify closed days on a draft schedule' });
  removeClosedDay(scheduleId, date);
  const closedDays = getClosedDays(scheduleId);
  return res.json({ closedDays });
});

// POST /api/schedule/:id/fork — create a working draft from a published schedule ("Start Editing")
router.post('/:id/fork', requireManager, (req, res) => {
  const published = getScheduleById(Number(req.params.id));
  if (!published) return res.status(404).json({ error: 'Schedule not found' });
  if (published.status !== 'published') {
    return res.status(409).json({ error: 'Only published schedules can be forked' });
  }
  const existing = getDraftScheduleForWeek(published.week_start_date);
  if (existing) {
    const shifts = getShiftsForSchedule(existing.id);
    return res.json({ schedule: existing, shifts, hasDraft: true, liveSchedule: published });
  }
  const draft = forkDraftFromPublished(published.id, req.user.userId);
  const shifts = getShiftsForSchedule(draft.id);
  return res.status(201).json({ schedule: draft, shifts, hasDraft: true, liveSchedule: published });
});

// DELETE /api/schedule/:id/draft — discard a working draft ("Discard Draft")
router.delete('/:id/draft', requireManager, (req, res) => {
  const schedule = getScheduleById(Number(req.params.id));
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  if (schedule.status !== 'draft') {
    return res.status(409).json({ error: 'Only draft schedules can be discarded' });
  }
  discardDraft(schedule.id);
  const live = getLiveScheduleForWeek(schedule.week_start_date);
  const shifts = live ? getShiftsForSchedule(live.id) : [];
  return res.json({ schedule: live || null, shifts, hasDraft: false, liveSchedule: null });
});

// PATCH /api/schedule/:id/republish — transactional: archive old published, promote draft, notify staff
router.patch('/:id/republish', requireManager, (req, res) => {
  const draft = getScheduleById(Number(req.params.id));
  if (!draft) return res.status(404).json({ error: 'Schedule not found' });
  if (draft.status !== 'draft') {
    return res.status(409).json({ error: 'Only draft schedules can be re-published' });
  }

  const { schedule, deniedSwaps } = republishSchedule(draft.id, req.user.userId);
  const shifts = getShiftsForSchedule(schedule.id);
  const userIds = [...new Set(shifts.map(s => s.user_id))];

  if (userIds.length > 0) {
    const week = schedule.week_start_date;
    const title = 'Schedule Updated';
    const body = `Your schedule for the week of ${week} has been updated.`;
    const data = { url: `/schedule?week=${week}` };
    for (const userId of userIds) {
      createNotification({ userId, type: 'schedule_published', title, body, data });
    }
    sendToUsers(userIds, { title, body, data });
  }

  // Notify users whose swaps were auto-denied
  for (const swap of deniedSwaps) {
    const affected = [swap.requester_id, swap.claimer_id].filter(Boolean);
    for (const userId of affected) {
      createNotification({
        userId,
        type: 'swap_resolved',
        title: 'Shift Swap Cancelled',
        body: 'Your shift swap was cancelled because the schedule was updated by a manager.',
        data: { url: '/swaps' },
      });
    }
    if (affected.length > 0) {
      sendToUsers(affected, {
        title: 'Shift Swap Cancelled',
        body: 'Your shift swap was cancelled because the schedule was updated.',
        data: { url: '/swaps' },
      });
    }
  }

  return res.json({ schedule });
});

// PATCH /api/schedule/:id/publish — manager+
router.patch('/:id/publish', requireManager, (req, res) => {
  const schedule = getScheduleById(Number(req.params.id));
  if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
  if (schedule.status !== 'draft') {
    return res.status(409).json({ error: 'Only draft schedules can be published' });
  }
  const published = publishSchedule(schedule.id, req.user.userId);
  const shifts = getShiftsForSchedule(schedule.id);
  const userIds = [...new Set(shifts.map(s => s.user_id))];
  if (userIds.length > 0) {
    const week = published.week_start_date;
    const title = 'Schedule Published';
    const body = `Your schedule for the week of ${week} is ready.`;
    const data = { url: `/schedule?week=${week}` };
    for (const userId of userIds) {
      createNotification({ userId, type: 'schedule_published', title, body, data });
    }
    sendToUsers(userIds, { title, body, data }); // fire-and-forget
  }
  return res.json({ schedule: published });
});

module.exports = router;
