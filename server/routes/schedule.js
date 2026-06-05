'use strict';

const express = require('express');
const { requireStaff, requireManager } = require('../middleware/auth');
const {
  getLiveScheduleForWeek, getPublishedScheduleForWeek,
  getShiftsForSchedule, getUpcomingShiftForUser, getWeekHoursForUser,
  createFreshDraftSchedule, forkDraftFromPublished,
  republishSchedule, discardDraft,
  getScheduleById, clearShiftsForSchedule,
  insertShifts, publishSchedule, getSchedulerInputs, getDraftScheduleForWeek,
  getShiftById, updateShift, deleteShift, insertOverrideShift,
  getOverrideShiftsForSchedule, checkShiftViolations,
  validateScheduleShifts,
  getClosedDays, addClosedDay, removeClosedDay, clearShiftsForDate,
  getTimeOffForWeek, recordScheduleView, getScheduleViewers,
  getPublishedShiftsForIcal,
} = require('../db/schedule');
const { getOrCreateIcalToken, regenerateIcalToken } = require('../db/users');
const { getEventsForWeek, getEventCoverageForWeek } = require('../db/events');
const { generateSchedule } = require('../services/scheduler');
const { createNotification } = require('../db/notifications');
const { sendToUsers } = require('../services/push');
const { countResolvedSwapsSince } = require('../db/swaps');

const router = express.Router();

// GET /api/schedule/next — caller's next upcoming shift + week hours total
router.get('/next', requireStaff, (req, res) => {
  const shift = getUpcomingShiftForUser(req.user.userId);
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  const weekStart = monday.toISOString().slice(0, 10);
  const weekHours = getWeekHoursForUser(req.user.userId, weekStart);
  return res.json({ shift: shift || null, weekHours });
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
  const swapConflicts = (draft && liveSchedule)
    ? countResolvedSwapsSince(liveSchedule.id, draft.created_at)
    : 0;
  const publishedId = liveSchedule?.id ?? (schedule?.status === 'published' ? schedule.id : null);
  const viewers = publishedId ? getScheduleViewers(publishedId) : [];
  return res.json({
    schedule,
    shifts,
    closedDays,
    timeOffDates,
    events: getEventsForWeek(week),
    eventCoverage: getEventCoverageForWeek(week),
    hasDraft: !!draft,
    liveSchedule: draft ? liveSchedule : null,
    swapConflicts,
    viewers,
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
  if (req.user.role === 'staff') recordScheduleView(schedule.id, req.user.userId);
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

  const { templateId, groupId, startTime, hours, note } = req.body;
  const finalGroupId = groupId != null ? Number(groupId) : shift.group_id;
  const finalTemplateId = templateId != null ? Number(templateId) : shift.shift_template_id;
  const finalStartTime = startTime ?? shift.start_time;
  const finalHours = hours != null ? Number(hours) : shift.hours;
  const finalNote = 'note' in req.body ? (note || null) : (shift.note || null);
  if (!/^\d{2}:\d{2}$/.test(finalStartTime)) {
    return res.status(400).json({ error: 'startTime must be HH:MM' });
  }
  if (!Number.isFinite(finalHours) || finalHours <= 0) {
    return res.status(400).json({ error: 'hours must be a positive number' });
  }

  const violations = checkShiftViolations({
    scheduleId: shift.schedule_id,
    userId: shift.user_id,
    date: shift.date,
    groupId: finalGroupId,
    startTime: finalStartTime,
    hours: finalHours,
    excludeShiftId: shiftId,
  });

  updateShift(shiftId, { groupId: finalGroupId, templateId: finalTemplateId, startTime: finalStartTime, hours: finalHours, note: finalNote });
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
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return res.status(400).json({ error: 'startTime must be HH:MM' });
  }
  if (!Number.isFinite(Number(hours)) || Number(hours) <= 0) {
    return res.status(400).json({ error: 'hours must be a positive number' });
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
    note: req.body.note || null,
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

// GET /api/schedule/ical-token — return (or lazily create) caller's iCal feed token
router.get('/ical-token', requireStaff, (req, res) => {
  const token = getOrCreateIcalToken(req.user.userId);
  return res.json({ token });
});

// POST /api/schedule/ical-token/regenerate — rotate caller's iCal feed token
router.post('/ical-token/regenerate', requireStaff, (req, res) => {
  const token = regenerateIcalToken(req.user.userId);
  return res.json({ token });
});

// GET /api/schedule/ical/:token — public unauthenticated iCal feed
router.get('/ical/:token', (req, res) => {
  const shifts = getPublishedShiftsForIcal(req.params.token);
  if (shifts === null) return res.status(404).send('Not found');

  const db = require('../db/db');
  const setting = db.prepare(`SELECT value FROM app_settings WHERE key = 'restaurant_name'`).get();
  const calName = setting?.value || 'Shiftable';

  const dtstamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  function endDateTime(dateStr, startHHMM, hours) {
    const [h, m] = startHHMM.split(':').map(Number);
    const totalMin = h * 60 + m + Math.round(hours * 60);
    const endH = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
    const endM = String(totalMin % 60).padStart(2, '0');
    const daysOver = Math.floor(totalMin / 1440);
    let endDate = dateStr.replace(/-/g, '');
    if (daysOver > 0) {
      const d = new Date(dateStr + 'T00:00:00');
      d.setDate(d.getDate() + daysOver);
      endDate = d.toISOString().slice(0, 10).replace(/-/g, '');
    }
    return `${endDate}T${endH}${endM}00`;
  }

  function escapeIcalText(str) {
    return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shiftable//Work Schedule//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${calName} Schedule`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ];

  for (const s of shifts) {
    const dateCompact = s.date.replace(/-/g, '');
    const startCompact = s.start_time.replace(':', '');
    const desc = escapeIcalText(`${s.hours}h${s.note ? '\n' + s.note : ''}`);
    lines.push(
      'BEGIN:VEVENT',
      `UID:shiftable-${s.id}@shiftable`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${dateCompact}T${startCompact}00`,
      `DTEND:${endDateTime(s.date, s.start_time, s.hours)}`,
      `SUMMARY:${s.group_name}`,
      `DESCRIPTION:${desc}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="schedule.ics"');
  return res.send(lines.join('\r\n'));
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
