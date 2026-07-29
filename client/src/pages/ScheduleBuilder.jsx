'use strict';

import { useState, useEffect } from 'react';
import { Lock, CheckCircle2, ChevronDown, RefreshCw, Printer, Eye, StickyNote, BookmarkPlus } from 'lucide-react';
import { useScheduleBuilder } from '../hooks/useScheduleBuilder';
import { toDisplayTime, toCompactTime } from '../components/TimeSelect';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DAY_NAMES as DAYS, getWeekStartOf } from '../lib/week';

// Returns the highest-priority group (lowest priority number) for a user's groups array.
function primaryGroup(groups) {
  if (!groups || groups.length === 0) return null;
  return groups.reduce((best, g) => g.priority < best.priority ? g : best);
}

function sortByGroupThenName(items, getGroups, getName) {
  return [...items].sort((a, b) => {
    const pA = primaryGroup(getGroups(a))?.priority ?? Infinity;
    const pB = primaryGroup(getGroups(b))?.priority ?? Infinity;
    if (pA !== pB) return pA - pB;
    return getName(a).localeCompare(getName(b));
  });
}

function toLocalISO(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
}

function EditableDraftGrid({ weekStart, shifts, violations, warnings = [], timeOffDates = [], onUpdateShift, onRemoveShift, onAddShift, scheduleId, readOnly, closedDays, onCloseDay, onOpenDay, events = {}, eventCoverage = [], onAddEventTitle, onDeleteEventTitle, onSaveEventCoverage, onRemoveEventCoverageRow, onRemoveEventCoverage, viewers = [], rateByGroupId = {}, permClosedSet = new Set(), dayOverrides = {}, onSetDayOverride, onRemoveDayOverride, dailyOverheadRate = 0, onSetOverheadRate }) {
  const [refData, setRefData] = useState({ users: [], templates: [] });
  const [popover, setPopover] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [noteValue, setNoteValue] = useState('');
  const [dayPopover, setDayPopover] = useState(null);
  const [dayBusy, setDayBusy] = useState(false);
  const [openShiftPopover, setOpenShiftPopover] = useState(null);
  const [overheadPopover, setOverheadPopover] = useState(null);
  const [overheadInput, setOverheadInput] = useState('');
  const [overheadSaving, setOverheadSaving] = useState(false);
  const [openShiftsForWeek, setOpenShiftsForWeek] = useState([]);
  const [clearedCells, setClearedCells] = useState(new Set());
  const [eventPopover, setEventPopover] = useState(null);

  useEffect(() => {
    if (!readOnly) return;
    fetch(`/api/open-shifts?week=${weekStart}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setOpenShiftsForWeek(d.openShifts || []))
      .catch(() => {});
  }, [readOnly, weekStart]);

  function refetchOpenShifts() {
    fetch(`/api/open-shifts?week=${weekStart}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setOpenShiftsForWeek(d.openShifts || []))
      .catch(() => {});
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/users', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/groups/all-templates', { credentials: 'include' }).then(r => r.json()),
    ]).then(([usersData, tplData]) => {
      setRefData({
        users: (usersData.users || []).filter(u => u.is_active),
        templates: tplData.templates || [],
      });
    }).catch(() => {});
  }, []);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const usersMap = {};
  shifts.forEach(s => { usersMap[s.user_id] = s.user_name; });
  // Append all active staff not yet in the map so every staff member has a row
  refData.users
    .filter(u => !usersMap[u.id])
    .forEach(u => { usersMap[u.id] = u.name; });
  const userPrimaryMap = Object.fromEntries(
    refData.users.map(u => [u.id, primaryGroup(u.groups)])
  );
  const userRows = sortByGroupThenName(
    Object.entries(usersMap),
    ([uid]) => refData.users.find(u => u.id === Number(uid))?.groups || [],
    ([, name]) => name
  );
  const viewerSet = new Set(viewers);

  const hoursMap = {};
  shifts.forEach(s => { hoursMap[s.user_id] = (hoursMap[s.user_id] || 0) + s.hours; });

  const laborByDay = {};
  let laborTotal = 0;
  shifts.forEach(s => {
    const rate = rateByGroupId[s.group_id];
    if (rate != null) {
      const cost = s.hours * rate;
      laborByDay[s.date] = (laborByDay[s.date] || 0) + cost;
      laborTotal += cost;
    }
  });
  if (dailyOverheadRate > 0) {
    days.forEach(d => {
      laborByDay[d] = (laborByDay[d] || 0) + dailyOverheadRate;
    });
    laborTotal += days.length * dailyOverheadRate;
  }
  const fmtLabor = n => `$${Math.round(n).toLocaleString()}`;

  // Time-off lookup: "userId|date" → true
  const timeOffSet = new Set(timeOffDates.map(t => `${t.user_id}|${t.date}`));

  // Coverage gap count per date column: scheduler warnings + manual-edit coverage_gap violations
  const coverageGapsByDate = {};
  warnings.forEach(w => {
    if (w.type === 'event_coverage_gap') {
      coverageGapsByDate[w.date] = (coverageGapsByDate[w.date] || 0) + 1;
    } else {
      const date = days[w.day_of_week];
      if (date) coverageGapsByDate[date] = (coverageGapsByDate[date] || 0) + 1;
    }
  });
  violations.forEach(v => {
    if (v.type !== 'coverage_gap' || !v.shiftId) return;
    const s = shifts.find(sh => sh.id === v.shiftId);
    if (s) coverageGapsByDate[s.date] = (coverageGapsByDate[s.date] || 0) + 1;
  });

  // Personal violation count per user: availability, hours cap, fixed conflict only
  // Deduplicate by type per user — hours_cap is a weekly issue, not per-shift
  const personalViolationTypes = new Set(['availability', 'not_available', 'time_off', 'hours_cap', 'fixed_conflict', 'min_hours', 'max_shifts', 'max_consecutive']);
  const userViolationCounts = {};
  const userSeenTypes = {};
  violations.forEach(v => {
    if (!personalViolationTypes.has(v.type)) return;
    let uid;
    if (v.type === 'min_hours') {
      uid = v.userId;
    } else {
      if (!v.shiftId) return;
      const s = shifts.find(sh => sh.id === v.shiftId);
      if (!s) return;
      uid = s.user_id;
    }
    if (!uid) return;
    if (!userSeenTypes[uid]) userSeenTypes[uid] = new Set();
    if (userSeenTypes[uid].has(v.type)) return;
    userSeenTypes[uid].add(v.type);
    userViolationCounts[uid] = (userViolationCounts[uid] || 0) + 1;
  });

  function openPopover(e, userId, userName, date) {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cellShifts = shifts.filter(s => s.user_id === Number(userId) && s.date === date);
    const userInfo = refData.users.find(u => u.id === Number(userId));
    const userGroupIds = (userInfo?.groups || []).map(g => g.id);
    setSelectedTemplateId(cellShifts[0]?.shift_template_id?.toString() || '');
    setNoteValue(cellShifts[0]?.note || '');
    setPopover({
      userId: Number(userId),
      userName,
      date,
      cellShifts,
      userGroupIds,
      x: rect.left,
      y: rect.bottom + 4,
    });
  }

  function closePopover() { setPopover(null); setSaving(false); setSelectedTemplateId(''); setNoteValue(''); setSaveError(''); }

  function openDayPopover(e, date) {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDayPopover({ date, x: rect.left, y: rect.bottom + 4 });
  }
  function closeDayPopover() { setDayPopover(null); setDayBusy(false); }

  async function saveOverhead() {
    if (!onSetOverheadRate) return;
    const rate = Math.max(0, Number(overheadInput) || 0);
    setOverheadSaving(true);
    await onSetOverheadRate(rate);
    setOverheadSaving(false);
    setOverheadPopover(null);
  }

  async function clearOverhead() {
    if (!onSetOverheadRate) return;
    setOverheadSaving(true);
    await onSetOverheadRate(0);
    setOverheadSaving(false);
    setOverheadPopover(null);
  }

  async function handleCloseDay() {
    if (!dayPopover || dayBusy) return;
    setDayBusy(true);
    try {
      await onCloseDay(dayPopover.date);
      setClearedCells(prev => {
        const next = new Set(prev);
        for (const key of [...next]) {
          if (key.endsWith(`|${dayPopover.date}`)) next.delete(key);
        }
        return next;
      });
    } finally {
      closeDayPopover();
    }
  }

  async function handleOpenDay() {
    if (!dayPopover || dayBusy) return;
    setDayBusy(true);
    try {
      await onOpenDay(dayPopover.date);
    } finally {
      closeDayPopover();
    }
  }

  async function handleSave() {
    if (!popover || saving || !selectedTemplateId) return;
    setSaving(true);
    const tpl = refData.templates.find(t => t.id === Number(selectedTemplateId));
    if (!tpl) { setSaving(false); return; }
    try {
      let result;
      if (popover.cellShifts.length > 0) {
        result = await onUpdateShift(popover.cellShifts[0].id, {
          groupId: tpl.group_id,
          templateId: tpl.id,
          startTime: tpl.start_time,
          hours: tpl.hours,
          note: noteValue,
        });
      } else {
        result = await onAddShift(scheduleId, {
          userId: popover.userId,
          date: popover.date,
          groupId: tpl.group_id,
          templateId: tpl.id,
          startTime: tpl.start_time,
          hours: tpl.hours,
          note: noteValue,
        });
      }
      if (result?.error) {
        setSaveError(result.error);
        setSaving(false);
        return;
      }
      setClearedCells(prev => { const next = new Set(prev); next.delete(`${popover.userId}|${popover.date}`); return next; });
      closePopover();
    } catch {
      setSaveError('Failed to save shift. Please try again.');
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!popover || saving || popover.cellShifts.length === 0) return;
    setSaving(true);
    try {
      await onRemoveShift(popover.cellShifts[0].id);
      setClearedCells(prev => new Set([...prev, `${popover.userId}|${popover.date}`]));
      closePopover();
    } catch {
      setSaveError('Failed to remove shift. Please try again.');
      setSaving(false);
    }
  }

  const eligibleTemplates = popover
    ? refData.templates.filter(t => popover.userGroupIds.includes(t.group_id))
    : [];
  const groupedTemplates = eligibleTemplates.reduce((acc, t) => {
    if (!acc[t.group_name]) acc[t.group_name] = [];
    acc[t.group_name].push(t);
    return acc;
  }, {});

  if (userRows.length === 0) {
    return <p className="p-4 text-gray-400 text-sm">No shifts in this schedule.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-gray-950">
              <th className="sticky left-0 bg-gray-950 border border-gray-700 px-2 py-2 text-left font-medium text-gray-300 min-w-[90px] z-10">
                Name
              </th>
              {days.map((d, dayIndex) => {
                const isClosed = closedDays?.has(d);
                const isPermanentlyClosed = permClosedSet.has(dayIndex);
                const isOverridden = dayOverrides?.[String(dayIndex)] === 'open';
                const isEffectivelyClosed = isClosed || isPermanentlyClosed;
                const openCount = openShiftsForWeek.filter(s => s.date === d).length;
                return (
                  <th
                    key={d}
                    onClick={isPermanentlyClosed ? undefined : readOnly ? (e) => { const rect = e.currentTarget.getBoundingClientRect(); setOpenShiftPopover({ date: d, x: rect.left, y: rect.bottom + 4 }); } : (e) => openDayPopover(e, d)}
                    className={`border border-gray-700 px-2 py-2 font-medium min-w-[80px] whitespace-nowrap text-center ${
                      isPermanentlyClosed ? 'bg-gray-900/40 text-gray-600' :
                      readOnly ? 'cursor-pointer hover:bg-green-900/20' : 'cursor-pointer hover:bg-blue-900/20'
                    } ${isEffectivelyClosed && !isPermanentlyClosed ? 'text-red-400' : ''}`}
                  >
                    {new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                    {isPermanentlyClosed && (
                      <span className="block text-[10px] font-normal text-gray-600">(Closed)</span>
                    )}
                    {!isPermanentlyClosed && isClosed && <span className="block text-[10px] font-normal">(Closed)</span>}
                    {!isEffectivelyClosed && coverageGapsByDate[d] > 0 && (
                      <span className="block text-[9px] font-bold text-amber-400">⚠{coverageGapsByDate[d]}</span>
                    )}
                    {readOnly && openCount > 0 && !isEffectivelyClosed && (
                      <span className="block text-[9px] font-bold text-green-400">+{openCount} open</span>
                    )}
                    {isPermanentlyClosed && !readOnly && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetDayOverride?.(dayIndex); }}
                        className="block mx-auto mt-0.5 text-[9px] text-blue-400 hover:text-blue-300"
                      >
                        Open this week
                      </button>
                    )}
                    {isOverridden && !readOnly && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveDayOverride?.(dayIndex); }}
                        className="block mx-auto mt-0.5 text-[9px] text-gray-500 hover:text-red-400"
                      >
                        Close again
                      </button>
                    )}
                  </th>
                );
              })}
              <th className="border border-gray-700 px-2 py-2 font-medium text-gray-300 min-w-[72px] text-center">
                Hrs
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="sticky left-0 bg-gray-900 border border-gray-700 px-2 py-2 font-bold text-gray-400 text-[10px] tracking-widest z-10 whitespace-nowrap">
                EVENTS
              </td>
              {days.map(date => {
                const dayTitles = events[date] || [];
                return (
                  <td
                    key={date}
                    onClick={readOnly ? undefined : (e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setEventPopover({ date, x: rect.left, y: rect.bottom + 4 });
                    }}
                    className={`border border-gray-700 px-1 py-1 align-top ${readOnly ? '' : 'cursor-pointer hover:bg-blue-900/20'}`}
                    style={{ maxWidth: '80px' }}
                  >
                    <div className="overflow-hidden print:overflow-visible min-h-[18px]">
                      {dayTitles.map(t => (
                        <span key={t.id} className="inline-flex items-center gap-0.5 bg-purple-900/50 border border-purple-700/50 text-purple-200 text-[9px] px-1 py-0.5 rounded mr-0.5 mb-0.5 max-w-full">
                          <span className="truncate max-w-[56px] print:max-w-none print:overflow-visible print:whitespace-normal">{t.title}</span>
                          {!readOnly && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onDeleteEventTitle && onDeleteEventTitle(t.id, weekStart, date); }}
                              className="text-purple-400 hover:text-red-400 leading-none flex-shrink-0"
                            >×</button>
                          )}
                        </span>
                      ))}
                      {dayTitles.length === 0 && !readOnly && (
                        <span className="text-gray-700 text-[10px] print:hidden">+</span>
                      )}
                    </div>
                  </td>
                );
              })}
              <td className="border border-gray-700 px-2 py-2" />
            </tr>
            {userRows.map(([userId, userName]) => (
              <tr key={userId} className="hover:bg-gray-700/30">
                <td
                  className="sticky left-0 bg-gray-800 border border-gray-700 px-2 py-2 font-medium text-gray-100 z-10 whitespace-nowrap"
                  style={{ borderLeft: `3px solid ${userPrimaryMap[Number(userId)]?.color || 'transparent'}` }}
                >
                  <span className="flex items-center gap-1">
                    {userName}
                    <span className="w-3.5 flex-shrink-0 flex items-center justify-center">
                      {viewerSet.has(Number(userId)) && <Eye size={11} className="text-green-500" />}
                    </span>
                    {userViolationCounts[Number(userId)] > 0 && (
                      <span className="text-[9px] font-bold text-amber-400 flex-shrink-0">⚠{userViolationCounts[Number(userId)]}</span>
                    )}
                  </span>
                </td>
                {days.map((date, dayIndex) => {
                  const isClosed = closedDays?.has(date) || permClosedSet.has(dayIndex);
                  const cellShifts = shifts.filter(s => s.user_id === Number(userId) && s.date === date);
                  const hasViolation = !isClosed && (violations || []).some(v => cellShifts.some(s => s.id === v.shiftId));
                  const isCleared = !isClosed && clearedCells.has(`${userId}|${date}`);
                  const onTimeOff = !isClosed && timeOffSet.has(`${userId}|${date}`);
                  // The "OFF" label still belongs to an empty cell only — a cell
                  // with a shift shows the shift. But the day being time off has
                  // to survive that, or scheduling straight over an approved
                  // request looks identical to a normal shift.
                  const isTimeOff = onTimeOff && cellShifts.length === 0;
                  const shiftOnTimeOff = onTimeOff && cellShifts.length > 0;
                  return (
                    <td
                      key={date}
                      onClick={readOnly ? undefined : (e) => openPopover(e, userId, userName, date)}
                      title={shiftOnTimeOff ? 'Scheduled on approved time off' : undefined}
                      className={`relative border px-1 py-1 align-top transition-colors ${
                        shiftOnTimeOff ? 'border-red-700/70 bg-red-950/30' : 'border-gray-700'
                      } ${
                        isClosed ? 'bg-gray-900/40 cursor-pointer hover:bg-blue-900/10' : 'cursor-pointer hover:bg-blue-900/20'
                      }`}
                    >
                      {hasViolation && (
                        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-500" />
                      )}
                      {isClosed ? (
                        <span className="flex items-center justify-center py-1">
                          <Lock size={10} className="text-gray-600" />
                        </span>
                      ) : cellShifts.length > 0 ? cellShifts.map(s => (
                        <div
                          key={s.id}
                          className="rounded px-1 py-0.5 mb-0.5 text-white text-[10px] leading-tight"
                          style={{ backgroundColor: s.group_color }}
                        >
                          {(s.is_fixed || s.is_override) ? <Lock size={8} className="inline mr-0.5 mb-0.5 print:hidden" /> : null}
                          {s.note ? <StickyNote size={8} className="inline mr-0.5 mb-0.5 print:hidden opacity-80" /> : null}
                          <span className="print:hidden">{s.group_name}<br />{formatTime(s.start_time)}</span>
                          <span className="hidden print:flex print:w-full print:justify-between print:items-baseline">
                            <span className="group-name-chip" style={{ backgroundColor: s.group_color }}>{s.group_name}</span>
                            <span>{formatTime(s.start_time)}</span>
                          </span>
                        </div>
                      ) ) : isTimeOff ? (
                        <span className="text-[10px] font-medium text-blue-400/70 flex items-center justify-center py-1">OFF</span>
                      ) : isCleared ? (
                        <span className="flex items-center justify-center py-1">
                          <Lock size={10} className="text-gray-600" />
                        </span>
                      ) : (
                        <span className="text-gray-700 text-[10px] flex items-center justify-center py-1 print:hidden">+</span>
                      )}
                    </td>
                  );
                })}
                <td className="border border-gray-700 px-2 py-2 text-center text-gray-400">
                  {hoursMap[Number(userId)] || 0}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                className="sticky left-0 bg-gray-800 border border-gray-700 px-2 py-3 text-[10px] font-medium text-gray-500 z-10 whitespace-nowrap print:hidden cursor-pointer hover:bg-gray-750 select-none"
                onClick={e => { setOverheadInput(dailyOverheadRate > 0 ? String(dailyOverheadRate) : ''); setOverheadPopover({ x: e.clientX, y: e.clientY }); }}
              >
                <div>Est. Labor</div>
                <div className={`text-[9px] mt-0.5 ${dailyOverheadRate > 0 ? 'text-gray-400' : 'text-gray-600'}`}>
                  +{fmtLabor(dailyOverheadRate)}/day
                </div>
              </td>
              {days.map(d => (
                <td key={d} className="border border-gray-700 px-2 py-3 text-center text-[10px] text-gray-400 bg-gray-800 align-middle print:hidden">
                  {fmtLabor(laborByDay[d] || 0)}
                </td>
              ))}
              <td className="border border-gray-700 px-2 py-3 text-center text-[10px] font-semibold text-blue-300 bg-blue-950 align-middle print:hidden">
                {fmtLabor(laborTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {dayPopover && (
        <>
          <div className="fixed inset-0 z-20" onClick={closeDayPopover} />
          <div
            className="fixed z-30 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-4 w-48"
            style={{
              top: Math.min(dayPopover.y, window.innerHeight - 120),
              left: Math.min(dayPopover.x, window.innerWidth - 200),
            }}
          >
            <p className="text-xs font-semibold text-gray-200 mb-3">
              {new Date(dayPopover.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
            {closedDays?.has(dayPopover.date) ? (
              <button
                onClick={handleOpenDay}
                disabled={dayBusy}
                className="w-full py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
              >
                {dayBusy ? 'Opening…' : 'Re-open Day'}
              </button>
            ) : (
              <button
                onClick={handleCloseDay}
                disabled={dayBusy}
                className="w-full py-1.5 text-xs font-medium bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded transition-colors"
              >
                {dayBusy ? 'Closing…' : 'Close Day'}
              </button>
            )}
          </div>
        </>
      )}

      {overheadPopover && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOverheadPopover(null)} />
          <div
            className="fixed z-30 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-4 w-52"
            style={{
              top: Math.max(8, overheadPopover.y - 162),
              left: Math.min(overheadPopover.x, window.innerWidth - 216),
            }}
          >
            <p className="text-xs font-semibold text-gray-200 mb-3">Daily overhead rate</p>
            <div className="flex items-center gap-1 mb-3">
              <span className="text-gray-400 text-sm flex-shrink-0">$</span>
              <input
                type="number"
                min="0"
                step="1"
                value={overheadInput}
                onChange={e => setOverheadInput(e.target.value)}
                placeholder="0"
                className="flex-1 min-w-0 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-100"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveOverhead(); }}
              />
              <span className="text-gray-400 text-xs flex-shrink-0">/day</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveOverhead}
                disabled={overheadSaving}
                className="flex-1 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
              >
                {overheadSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={clearOverhead}
                disabled={overheadSaving}
                className="flex-1 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 rounded transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </>
      )}

      {popover && (
        <>
          <div className="fixed inset-0 z-20" onClick={closePopover} />
          <div
            className="fixed z-30 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-4 w-56"
            style={{
              top: Math.min(popover.y, window.innerHeight - 290),
              left: Math.min(popover.x, window.innerWidth - 232),
            }}
          >
            <p className="text-xs font-semibold text-gray-200 mb-3">
              {popover.userName} — {new Date(popover.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
            <select
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 text-gray-100 rounded px-2 py-1.5 text-xs mb-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{refData.templates.length === 0 ? 'Loading…' : '— Select shift —'}</option>
              {Object.entries(groupedTemplates).map(([groupName, tpls]) => (
                <optgroup key={groupName} label={groupName}>
                  {tpls.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {toDisplayTime(t.start_time)} · {t.hours}h
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div className="relative mb-3">
              <input
                type="text"
                maxLength={120}
                value={noteValue}
                onChange={e => setNoteValue(e.target.value)}
                placeholder="Add note… (optional)"
                className="w-full bg-gray-900 border border-gray-700 text-gray-100 rounded px-2 py-1.5 text-xs pr-6 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-600"
              />
              {noteValue && (
                <button
                  type="button"
                  onClick={() => setNoteValue('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  ×
                </button>
              )}
            </div>
            {saveError && <p className="text-xs text-red-400 mb-2">{saveError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !selectedTemplateId}
                className="flex-1 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
              >
                {saving ? 'Saving…' : popover.cellShifts.length > 0 ? 'Change' : 'Add'}
              </button>
              {popover.cellShifts.length > 0 && (
                <button
                  onClick={handleRemove}
                  disabled={saving}
                  className="flex-1 py-1.5 text-xs font-medium border border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-700 rounded transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {openShiftPopover && (
        <OpenShiftDayPopover
          date={openShiftPopover.date}
          x={openShiftPopover.x}
          y={openShiftPopover.y}
          weekStart={weekStart}
          openShifts={openShiftsForWeek}
          allTemplates={refData.templates}
          onClose={() => setOpenShiftPopover(null)}
          onRefetch={refetchOpenShifts}
        />
      )}
      {eventPopover && (() => {
        const date = eventPopover.date;
        const dayTitles = events[date] || [];
        const existingCoverage = eventCoverage.filter(ec => ec.date === date);
        const uniqueGroups = [...new Map(refData.templates.map(t => [t.group_id, { id: t.group_id, name: t.group_name }])).values()];
        return (
          <EventCellPopover
            date={date}
            x={eventPopover.x}
            y={eventPopover.y}
            weekStart={weekStart}
            dayTitles={dayTitles}
            existingCoverage={existingCoverage}
            allGroups={uniqueGroups}
            allTemplates={refData.templates}
            onAddTitle={onAddEventTitle}
            onDeleteTitle={onDeleteEventTitle}
            onSaveCoverage={onSaveEventCoverage}
            onRemoveCoverageRow={onRemoveEventCoverageRow}
            onRemoveCoverage={onRemoveEventCoverage}
            onClose={() => setEventPopover(null)}
          />
        );
      })()}
    </div>
  );
}

function OpenShiftDayPopover({ date, x, y, weekStart, openShifts, allTemplates, onClose, onRefetch }) {
  const [showForm, setShowForm] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [cancelling, setCancelling] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [noteValue, setNoteValue] = useState('');

  const dateShifts = openShifts.filter(s => s.date === date);
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const uniqueGroups = [...new Map(allTemplates.map(t => [t.group_id, { id: t.group_id, name: t.group_name }])).values()];
  const groupTemplates = allTemplates.filter(t => t.group_id === Number(selectedGroup));

  async function handleCancel(id) {
    if (cancelling) return;
    setCancelling(id);
    try {
      await fetch(`/api/open-shifts/${id}`, { method: 'DELETE', credentials: 'include' });
      onRefetch();
    } finally {
      setCancelling(null);
    }
  }

  async function handlePost() {
    if (!selectedTemplate || posting) return;
    setPosting(true);
    setPostError('');
    const tpl = allTemplates.find(t => t.id === Number(selectedTemplate));
    try {
      const r = await fetch('/api/open-shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          groupId: Number(selectedGroup),
          shiftTemplateId: Number(selectedTemplate),
          date,
          startTime: tpl.start_time,
          hours: tpl.hours,
          note: noteValue || null,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setPostError(d.error || 'Failed to post shift');
        return;
      }
      setShowForm(false);
      setSelectedGroup('');
      setSelectedTemplate('');
      setNoteValue('');
      onRefetch();
    } catch {
      setPostError('Failed to post shift');
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className="fixed z-30 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-4 w-64"
        style={{
          top: Math.min(y, window.innerHeight - 380),
          left: Math.min(x, window.innerWidth - 268),
        }}
      >
        <p className="text-xs font-semibold text-gray-200 mb-3">Open Shifts — {dateLabel}</p>

        {dateShifts.length > 0 ? (
          <div className="space-y-2 mb-3">
            {dateShifts.map(s => (
              <div key={s.id} className="flex items-start justify-between gap-2 bg-gray-900/60 rounded px-2 py-1.5">
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-200">{s.group_name} · {s.template_name || 'Custom'}</p>
                  <p className="text-[10px] text-gray-400">{formatTime(s.start_time)} · {s.hours}h</p>
                  {s.note && <p className="text-[10px] text-gray-500 italic truncate">{s.note}</p>}
                  {s.claimer_id && (
                    <p className="text-[10px] text-amber-400">Claimed by {s.claimer_name} — pending</p>
                  )}
                </div>
                {!s.claimer_id && (
                  <button
                    onClick={() => handleCancel(s.id)}
                    disabled={cancelling === s.id}
                    className="text-gray-600 hover:text-red-400 text-sm leading-none flex-shrink-0 disabled:opacity-40"
                    title="Cancel"
                  >×</button>
                )}
              </div>
            ))}
            <div className="border-t border-gray-700 pt-2" />
          </div>
        ) : (
          <p className="text-xs text-gray-500 mb-3">No open shifts posted for this day.</p>
        )}

        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-1.5 text-xs font-medium bg-green-700 hover:bg-green-600 text-white rounded transition-colors"
          >
            + Post Open Shift
          </button>
        ) : (
          <>
            <select
              value={selectedGroup}
              onChange={e => { setSelectedGroup(e.target.value); setSelectedTemplate(''); }}
              className="w-full bg-gray-900 border border-gray-700 text-gray-100 rounded px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="">— Select group —</option>
              {uniqueGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {selectedGroup && (
              <select
                value={selectedTemplate}
                onChange={e => setSelectedTemplate(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-gray-100 rounded px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                <option value="">— Select shift —</option>
                {groupTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name} · {toDisplayTime(t.start_time)} · {t.hours}h</option>
                ))}
              </select>
            )}
            <div className="relative mb-3">
              <input
                type="text"
                maxLength={120}
                value={noteValue}
                onChange={e => setNoteValue(e.target.value)}
                placeholder="Note (optional)"
                className="w-full bg-gray-900 border border-gray-700 text-gray-100 rounded px-2 py-1.5 text-xs pr-6 focus:outline-none focus:ring-1 focus:ring-green-500 placeholder:text-gray-600"
              />
              {noteValue && (
                <button type="button" onClick={() => setNoteValue('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">×</button>
              )}
            </div>
            {postError && <p className="text-xs text-red-400 mb-2">{postError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handlePost}
                disabled={posting || !selectedTemplate}
                className="flex-1 py-1.5 text-xs font-medium bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded transition-colors"
              >
                {posting ? 'Posting…' : 'Post'}
              </button>
              <button
                onClick={() => { setShowForm(false); setSelectedGroup(''); setSelectedTemplate(''); setNoteValue(''); setPostError(''); }}
                className="px-3 py-1.5 text-xs text-gray-400 border border-gray-600 rounded hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function EventCellPopover({ date, x, y, weekStart, dayTitles, existingCoverage, allGroups, allTemplates, onAddTitle, onDeleteTitle, onSaveCoverage, onRemoveCoverageRow, onRemoveCoverage, onClose }) {
  const [titleInput, setTitleInput] = useState('');
  const [rows, setRows] = useState(existingCoverage || []);
  const [addGroup, setAddGroup] = useState('');
  const [addTemplate, setAddTemplate] = useState('');
  const [addQty, setAddQty] = useState(1);
  const [saving, setSaving] = useState(false);

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const addGroupTemplates = allTemplates.filter(t => t.group_id === Number(addGroup));

  async function handleAddTitle() {
    const trimmed = titleInput.trim();
    if (!trimmed || !onAddTitle) return;
    await onAddTitle(weekStart, date, trimmed);
    setTitleInput('');
  }

  async function handleAddRow() {
    if (!addGroup || !addTemplate || saving) return;
    setSaving(true);
    try {
      await onSaveCoverage?.(weekStart, date, Number(addGroup), Number(addTemplate), Number(addQty));
      const grp = allGroups.find(g => g.id === Number(addGroup));
      const tpl = allTemplates.find(t => t.id === Number(addTemplate));
      const newRow = { date, group_id: Number(addGroup), shift_template_id: Number(addTemplate), required_staff: Number(addQty), group_name: grp?.name, template_name: tpl?.name, start_time: tpl?.start_time, hours: tpl?.hours };
      setRows(prev => {
        const filtered = prev.filter(r => !(r.group_id === Number(addGroup) && r.shift_template_id === Number(addTemplate)));
        return [...filtered, newRow];
      });
      setAddGroup('');
      setAddTemplate('');
      setAddQty(1);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveRow(row) {
    await onRemoveCoverageRow?.(weekStart, date, row.group_id, row.shift_template_id);
    setRows(prev => prev.filter(r => !(r.group_id === row.group_id && r.shift_template_id === row.shift_template_id)));
  }

  async function handleClearAll() {
    await onRemoveCoverage?.(weekStart, date);
    setRows([]);
  }

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className="fixed z-30 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-4 w-72"
        style={{
          top: Math.min(y, window.innerHeight - 400),
          left: Math.min(x, window.innerWidth - 292),
        }}
      >
        <p className="text-xs font-semibold text-gray-200 mb-3">Events — {dateLabel}</p>

        {/* Title pills */}
        <div className="flex flex-wrap gap-1 mb-2 min-h-[22px]">
          {dayTitles.map(t => (
            <span key={t.id} className="inline-flex items-center gap-0.5 bg-purple-900/50 border border-purple-700/50 text-purple-200 text-[10px] px-1.5 py-0.5 rounded">
              {t.title}
              <button onClick={() => onDeleteTitle?.(t.id, weekStart, date)} className="text-purple-400 hover:text-red-400 ml-0.5 leading-none">×</button>
            </span>
          ))}
        </div>

        {/* Add title input */}
        <div className="flex gap-1.5 mb-4">
          <input
            type="text"
            value={titleInput}
            onChange={e => setTitleInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddTitle()}
            placeholder="Add event title…"
            maxLength={30}
            className="flex-1 bg-gray-900 border border-gray-700 text-gray-100 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder:text-gray-600"
          />
          <button
            onClick={handleAddTitle}
            disabled={!titleInput.trim()}
            className="px-2 py-1 text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white rounded transition-colors"
          >Add</button>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700 mb-3" />

        {/* Coverage section */}
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Coverage (optional)</p>

        {/* Saved coverage rows */}
        {rows.length > 0 && (
          <div className="space-y-1 mb-3">
            {rows.map(row => {
              const grpName = row.group_name || allGroups.find(g => g.id === row.group_id)?.name || '';
              const tpl = allTemplates.find(t => t.id === row.shift_template_id);
              const tplLabel = row.template_name || tpl?.name || '';
              const timeLabel = tpl ? ` · ${toDisplayTime(tpl.start_time)}` : '';
              return (
                <div key={`${row.group_id}-${row.shift_template_id}`} className="flex items-center gap-1.5 bg-gray-900/60 border border-gray-700 rounded px-2 py-1">
                  <span className="flex-1 text-[11px] text-gray-200 truncate">{grpName} — {tplLabel}{timeLabel}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">×{row.required_staff}</span>
                  <button onClick={() => handleRemoveRow(row)} className="text-gray-600 hover:text-red-400 text-xs leading-none shrink-0 ml-0.5">×</button>
                </div>
              );
            })}
            <button
              onClick={handleClearAll}
              className="w-full py-1 text-[11px] text-red-400 hover:text-red-300 border border-red-800/50 hover:border-red-700 rounded transition-colors"
            >Clear all coverage</button>
          </div>
        )}

        {/* Add a coverage row */}
        <select
          value={addGroup}
          onChange={e => { setAddGroup(e.target.value); setAddTemplate(''); }}
          className="w-full bg-gray-900 border border-gray-700 text-gray-100 rounded px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          <option value="">— Add coverage row —</option>
          {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>

        {addGroup && (
          <>
            <select
              value={addTemplate}
              onChange={e => setAddTemplate(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 text-gray-100 rounded px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="">— Select shift template —</option>
              {addGroupTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name} · {toDisplayTime(t.start_time)} · {t.hours}h</option>
              ))}
            </select>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-xs text-gray-400 flex-1">Staff needed</label>
              <input
                type="number"
                min={1}
                max={20}
                value={addQty}
                onChange={e => setAddQty(e.target.value)}
                className="w-12 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={handleAddRow}
              disabled={saving || !addTemplate}
              className="w-full mb-3 py-1.5 text-xs font-medium bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded transition-colors"
            >{saving ? 'Saving…' : '+ Add row'}</button>
          </>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={dayTitles.length === 0}
            className="flex-1 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded transition-colors"
          >
            Done
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-400 border border-gray-600 rounded hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

function ViolationsTray({ warnings = [], violations = [], shifts = [], onRecheck, onPrint, onSaveTemplate }) {
  const [expanded, setExpanded] = useState(false);
  const dayNames = DAYS;
  const groupNames = {};
  shifts.forEach(s => { groupNames[s.group_id] = s.group_name; });

  function shortWarning(w) {
    if (w.type === 'min_shifts_unmet') {
      // Prefer the carried name. The lookup below cannot work for the case this
      // warning exists to report — someone with no shifts at all.
      const name = (w.user_name ?? shifts.find(s => s.user_id === w.user_id)?.user_name ?? 'Staff')
        .split(' ')[0];
      return `${name}: ${w.assigned}/${w.needed} shifts`;
    }
    // Prefer the names the warning carries. Deriving them from `shifts` fails in
    // exactly the case that matters most: a group with nothing scheduled has no
    // shift to read a name from, so a total gap used to read "Group".
    const group = w.group_name || groupNames[w.group_id] || 'Group';
    const slot = [w.template_name, w.start_time && toCompactTime(w.start_time)]
      .filter(Boolean).join(' ');
    const label = slot ? `${group} ${slot}` : group;
    if (w.type === 'event_coverage_gap') {
      const dateLabel = new Date(w.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
      return `${label} ${dateLabel}: ${w.assigned}/${w.needed} for event`;
    }
    return `${label} ${dayNames[w.day_of_week]}: ${w.assigned}/${w.needed} staffed`;
  }

  function shortViolation(v) {
    const shift = shifts.find(s => s.id === v.shiftId);
    const firstName = shift ? shift.user_name.split(' ')[0] : (shifts.find(s => s.user_id === v.userId)?.user_name.split(' ')[0] ?? '?');
    const day = shift ? new Date(shift.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }) : '';
    switch (v.type) {
      case 'not_available': return `${firstName} ${day}: not available`;
      case 'availability': return `${firstName} ${day}: outside availability`;
      case 'hours_cap': {
        const m = v.message.match(/(\d+(?:\.\d+)?)h weekly cap \((\d+(?:\.\d+)?)h/);
        return m ? `${firstName}: ${m[2]}h (cap ${m[1]}h)` : `${firstName}: hours cap exceeded`;
      }
      case 'min_hours': return `${v.userName?.split(' ')[0] ?? firstName}: ${v.scheduled}h scheduled (${v.minimum}h min)`;
      // Both carry user_name, following the min_shifts_unmet rule: never derive
      // a name from the shifts, because the shift a violation arrived on may be
      // the one being removed when it fires.
      case 'max_shifts': {
        const m = v.message.match(/exceed (\d+) shifts this week \((\d+)/);
        const who = v.user_name?.split(' ')[0] ?? firstName;
        return m ? `${who}: ${m[2]} shifts (max ${m[1]})` : `${who}: over shift limit`;
      }
      case 'max_consecutive': {
        const m = v.message.match(/(\d+) days in a row, over the (\d+)/);
        const who = v.user_name?.split(' ')[0] ?? firstName;
        return m ? `${who}: ${m[1]} days in a row (max ${m[2]})` : `${who}: too many days in a row`;
      }
      case 'coverage_gap': {
        // Both the group and the day are carried, because this violation is
        // raised by removing a shift and removeShift nulls the shiftId — the
        // lookups above find nothing precisely when this fires.
        const group = v.group_name || shift?.group_name || 'Group';
        const slot = [v.template_name, v.start_time && toCompactTime(v.start_time)]
          .filter(Boolean).join(' ');
        const when = v.date
          ? new Date(v.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })
          : day;
        const counts = v.assigned != null && v.needed != null ? `: ${v.assigned}/${v.needed} staffed` : ': understaffed';
        return `${[group, slot].filter(Boolean).join(' ')} ${when}${counts}`.replace(/\s+/g, ' ').trim();
      }
      // Carries its own date: a shift removed from the grid nulls shiftId, and
      // the day lookup above then finds nothing.
      case 'time_off': {
        const when = v.date
          ? new Date(v.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })
          : day;
        return `${firstName} ${when}: on approved time off`;
      }
      case 'fixed_conflict':  return `${firstName} ${day}: overrides fixed`;
      case 'closed_day':     return `${firstName} ${day}: shift on closed day`;
      case 'inactive_user':  return `${firstName}: no longer active`;
      default: return v.message;
    }
  }

  // Deduplicate: hours_cap / min_hours once per user; all other types once per shift
  const seenKeys = new Set();
  const dedupedViolations = violations.filter(v => {
    const shift = shifts.find(s => s.id === v.shiftId);
    let key;
    if (v.type === 'hours_cap') key = `${shift?.user_id ?? '?'}|hours_cap`;
    else if (v.type === 'min_hours') key = `${v.userId}|min_hours`;
    // Both are weekly facts about a person, and the server emits them on every
    // shift that person has once the cap is breached. Key on the carried
    // user_id rather than the shift's, so the entry survives even if the shift
    // it arrived on is the one being removed.
    else if (v.type === 'max_shifts') key = `${v.user_id ?? shift?.user_id ?? '?'}|max_shifts`;
    else if (v.type === 'max_consecutive') key = `${v.user_id ?? shift?.user_id ?? '?'}|max_consecutive`;
    else key = `${v.shiftId}|${v.type}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const total = warnings.length + dedupedViolations.length;

  const coverageWarnings = warnings.filter(w => w.type !== 'min_shifts_unmet');
  const minShiftWarnings = warnings.filter(w => w.type === 'min_shifts_unmet');

  const coverageViolations = dedupedViolations.filter(v => v.type === 'coverage_gap');
  const availViolations = dedupedViolations.filter(v => v.type === 'availability' || v.type === 'not_available');
  const timeOffViolations = dedupedViolations.filter(v => v.type === 'time_off');
  const hoursViolations = dedupedViolations.filter(v => v.type === 'hours_cap');
  const minHoursViolations = dedupedViolations.filter(v => v.type === 'min_hours');
  const maxShiftViolations = dedupedViolations.filter(v => v.type === 'max_shifts');
  const maxConsecutiveViolations = dedupedViolations.filter(v => v.type === 'max_consecutive');
  const fixedViolations    = dedupedViolations.filter(v => v.type === 'fixed_conflict');
  const closedDayViolations = dedupedViolations.filter(v => v.type === 'closed_day');
  const inactiveViolations  = dedupedViolations.filter(v => v.type === 'inactive_user');

  return (
    <div className="mx-4 mt-2 mb-1 border border-gray-700 rounded-lg overflow-hidden">
      <div className={`flex items-center gap-3 px-3 py-3 ${total > 0 ? 'bg-amber-900/25 border-amber-800/50' : 'bg-gray-800/60'}`}>
        {total > 0 ? (
          <button
            className="flex items-center gap-1.5 flex-1 min-w-0"
            onClick={() => setExpanded(e => !e)}
          >
            <span className="text-xs font-semibold text-amber-400">⚠ {total} issue{total !== 1 ? 's' : ''}</span>
            <ChevronDown size={13} className={`text-amber-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        ) : (
          <span className="text-xs text-gray-500 flex-1">No issues</span>
        )}
        {onSaveTemplate && (
          <button
            onClick={onSaveTemplate}
            className="text-gray-500 hover:text-gray-300 p-0.5 flex-shrink-0 transition-colors"
            title="Save as template"
          >
            <BookmarkPlus size={16} />
          </button>
        )}
        {onPrint && (
          <button
            onClick={onPrint}
            className="text-gray-500 hover:text-gray-300 p-0.5 flex-shrink-0 transition-colors"
            title="Print schedule"
          >
            <Printer size={16} />
          </button>
        )}
        {onRecheck && (
          <button
            onClick={onRecheck}
            className="text-gray-500 hover:text-gray-300 p-0.5 flex-shrink-0 transition-colors"
            title="Re-check"
          >
            <RefreshCw size={16} />
          </button>
        )}
      </div>
      {expanded && total > 0 && (
        <div className="bg-gray-900/50 px-3 py-2 space-y-3">
          {(coverageWarnings.length > 0 || coverageViolations.length > 0) && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Coverage Gaps</p>
              {coverageWarnings.map((w, i) => (
                <p key={w.type === 'event_coverage_gap' ? `evt-${w.group_id}-${w.date}` : `cov-${w.group_id}-${w.day_of_week}-${i}`} className="text-xs text-amber-400">{shortWarning(w)}</p>
              ))}
              {coverageViolations.map((v, i) => (
                <p key={i} className="text-xs text-amber-400">{shortViolation(v)}</p>
              ))}
            </div>
          )}
          {availViolations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Availability</p>
              {availViolations.map((v, i) => (
                <p key={i} className="text-xs text-amber-400">{shortViolation(v)}</p>
              ))}
            </div>
          )}
          {timeOffViolations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Approved Time Off</p>
              {timeOffViolations.map((v, i) => (
                <p key={i} className="text-xs text-amber-400">{shortViolation(v)}</p>
              ))}
            </div>
          )}
          {hoursViolations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Hours Cap</p>
              {hoursViolations.map((v, i) => (
                <p key={i} className="text-xs text-amber-400">{shortViolation(v)}</p>
              ))}
            </div>
          )}
          {minHoursViolations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Under Minimum Hours</p>
              {minHoursViolations.map((v, i) => (
                <p key={i} className="text-xs text-amber-400">{shortViolation(v)}</p>
              ))}
            </div>
          )}
          {maxShiftViolations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Over Shift Limit</p>
              {maxShiftViolations.map((v, i) => (
                <p key={i} className="text-xs text-amber-400">{shortViolation(v)}</p>
              ))}
            </div>
          )}
          {maxConsecutiveViolations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Consecutive Days</p>
              {maxConsecutiveViolations.map((v, i) => (
                <p key={i} className="text-xs text-amber-400">{shortViolation(v)}</p>
              ))}
            </div>
          )}
          {fixedViolations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Fixed Conflicts</p>
              {fixedViolations.map((v, i) => (
                <p key={i} className="text-xs text-amber-400">{shortViolation(v)}</p>
              ))}
            </div>
          )}
          {closedDayViolations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Closed Day</p>
              {closedDayViolations.map((v, i) => (
                <p key={i} className="text-xs text-amber-400">{shortViolation(v)}</p>
              ))}
            </div>
          )}
          {inactiveViolations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Inactive Staff</p>
              {inactiveViolations.map((v, i) => (
                <p key={i} className="text-xs text-amber-400">{shortViolation(v)}</p>
              ))}
            </div>
          )}
          {minShiftWarnings.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Min Shifts Not Met</p>
              {minShiftWarnings.map(w => (
                <p key={`minshift-${w.user_id}`} className="text-xs text-amber-400">{shortWarning(w)}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CopyWeekModal({ targetWeek, onCopy, onCancel }) {
  const [weeks, setWeeks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/schedule/published-weeks?limit=6', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setWeeks(d.weeks || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <h3 className="text-base font-semibold text-gray-100">Copy from a previous week</h3>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : weeks.length === 0 ? (
          <p className="text-sm text-gray-400">No published weeks found.</p>
        ) : (
          <div className="space-y-2">
            {weeks.map(w => (
              <button
                key={w.week_start_date}
                onClick={() => setSelected(w.week_start_date)}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                  selected === w.week_start_date
                    ? 'border-blue-500 bg-blue-950 text-blue-200'
                    : 'border-gray-700 hover:border-gray-500 text-gray-300'
                }`}
              >
                Week of {new Date(w.week_start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => selected && onCopy(selected)}
            disabled={!selected}
            className="flex-1 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
          >
            Copy
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm text-gray-400 border border-gray-600 rounded-xl hover:border-gray-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveTemplateModal({ weekStart, onSave, onClose }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const err = await onSave(trimmed);
      if (err) { setError(err); setSaving(false); }
      else onClose();
    } catch {
      setError('Failed to save template');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <h3 className="text-base font-semibold text-gray-100">Save as template</h3>
        <p className="text-xs text-gray-400">Saves all shifts from the week of {new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} as a reusable pattern.</p>
        <input
          autoFocus
          type="text"
          placeholder="Template name, e.g. Typical week"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm text-gray-400 border border-gray-600 rounded-xl hover:border-gray-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ApplyTemplateModal({ onApply, onClose }) {
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch('/api/schedule/templates', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setSavedTemplates(d.templates || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    setDeleting(true);
    const r = await fetch(`/api/schedule/templates/${id}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) setSavedTemplates(prev => prev.filter(t => t.id !== id));
    setConfirmDeleteId(null);
    setDeleting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <h3 className="text-base font-semibold text-gray-100">Apply a template</h3>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : savedTemplates.length === 0 ? (
          <p className="text-sm text-gray-400">No templates saved yet. Use "Save as template" on any week that has shifts.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {savedTemplates.map(t => (
              <div key={t.id} className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-700 bg-gray-750">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-100 truncate">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.shift_count} shift{t.shift_count !== 1 ? 's' : ''}</p>
                </div>
                {confirmDeleteId === t.id ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={deleting}
                      className="px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => onApply(t.id)}
                      className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(t.id)}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full py-2.5 text-sm text-gray-400 border border-gray-600 rounded-xl hover:border-gray-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RepublishModal({ violations = [], shifts = [], swapConflicts = 0, onConfirm, onCancel }) {
  const activeViolations = violations.filter(v => v.shiftId !== null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-gray-100 mb-2">Re-publish schedule?</h2>
        {swapConflicts > 0 && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-yellow-900/30 border border-yellow-700/50">
            <p className="text-xs text-yellow-400">
              ⚠ {swapConflicts} swap{swapConflicts !== 1 ? 's were' : ' was'} approved since you started editing. Re-publishing will overwrite {swapConflicts !== 1 ? 'those assignments' : 'that assignment'}.
            </p>
          </div>
        )}
        {activeViolations.length > 0 ? (
          <>
            <p className="text-sm text-gray-400 mb-3">
              Staff will be notified. These violations will be published as-is:
            </p>
            <ul className="space-y-1.5 mb-5 max-h-40 overflow-y-auto">
              {activeViolations.map((v, i) => {
                const shift = shifts.find(s => s.id === v.shiftId);
                return (
                  <li key={i} className="text-xs text-yellow-400">
                    ⚠ {shift ? `${shift.user_name}, ${shift.date}` : 'Unknown'}: {v.message}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-sm text-gray-400 mb-5">
            Staff will be notified of the updated schedule.
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Re-Publish
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 border border-gray-600 text-gray-400 hover:text-gray-200 text-sm rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableGroupRow({ group, onCellClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });

  const rowStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <tr ref={setNodeRef} style={rowStyle}>
      <td
        className="sticky left-0 bg-gray-800 border border-gray-700 px-2 py-2 font-medium text-gray-100 z-10 whitespace-nowrap cursor-grab active:cursor-grabbing select-none"
        style={{ borderLeft: `3px solid ${group.color}` }}
        {...attributes}
        {...listeners}
      >
        <span className="text-gray-500 mr-1.5 text-base leading-none">⠿</span>
        {group.name}
      </td>
      {DAYS.map((_, dayIndex) => {
        const rules = group.coverage.filter(c => c.day_of_week === dayIndex);
        return (
          <td
            key={dayIndex}
            onClick={(e) => onCellClick(e, group.id, dayIndex)}
            className="border border-gray-700 px-1 py-2 cursor-pointer hover:bg-blue-900/20 transition-colors align-middle"
          >
            {rules.length > 0 ? (
              <div className="flex flex-col items-center justify-center gap-0.5">
                {rules.map(r => (
                  <span key={r.id} className="text-[10px] text-gray-300 whitespace-nowrap">
                    {r.template_name} {toCompactTime(r.start_time)} ({r.min_staff})
                  </span>
                ))}
              </div>
            ) : (
              <span className="flex items-center justify-center text-gray-600 text-[10px]">—</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function DayPriorityBadge({ rank, onTap }) {
  const isRanked = rank != null;
  return (
    <button
      onClick={e => { e.stopPropagation(); onTap(); }}
      className="absolute top-0.5 right-0.5 w-6 h-6 flex items-center justify-center focus:outline-none"
      title={isRanked ? `Fill priority ${rank} — tap to remove` : 'Tap to set fill priority'}
    >
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors
        ${isRanked ? 'bg-blue-500 text-white' : 'border border-gray-600/50'}`}>
        {isRanked ? rank : ''}
      </span>
    </button>
  );
}

function CoverageGrid({ permanentClosedDays = [], onToggleClosedDay }) {
  const [groups, setGroups] = useState([]);
  const [rankedDays, setRankedDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [popover, setPopover] = useState(null);
  const [addForm, setAddForm] = useState({ templateId: '', minStaff: 1 });
  const [saving, setSaving] = useState(false);
  const [fillOrder, setFillOrder] = useState('group_first');
  const [showFillHelp, setShowFillHelp] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  useEffect(() => {
    Promise.all([
      fetch('/api/groups/all-detail', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/schedule/day-priority', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/schedule/fill-order', { credentials: 'include' }).then(r => r.json()),
    ]).then(([groupData, priorityData, fillData]) => {
      setGroups(groupData.groups || []);
      setRankedDays(priorityData.rankedDays || []);
      setFillOrder(fillData.fillOrder || 'group_first');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleDayPriorityTap(dayIndex) {
    const newRanked = rankedDays.includes(dayIndex)
      ? rankedDays.filter(d => d !== dayIndex)
      : [...rankedDays, dayIndex];
    setRankedDays(newRanked);
    await fetch('/api/schedule/day-priority', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ rankedDays: newRanked }),
    });
  }

  async function handleToggleFillOrder() {
    const next = fillOrder === 'group_first' ? 'day_first' : 'group_first';
    setFillOrder(next);
    await fetch('/api/schedule/fill-order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fillOrder: next }),
    });
  }

  async function handleDragEnd(event) {
    setDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groups.findIndex(g => g.id === active.id);
    const newIndex = groups.findIndex(g => g.id === over.id);
    const newGroups = arrayMove(groups, oldIndex, newIndex);
    setGroups(newGroups);
    await fetch('/api/groups/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ groupIds: newGroups.map(g => g.id) }),
    });
  }

  const popoverGroup = popover ? groups.find(g => g.id === popover.groupId) : null;
  const popoverRules = popover
    ? (popoverGroup?.coverage || []).filter(c => c.day_of_week === popover.dayOfWeek)
    : [];

  function openPopover(e, groupId, dayOfWeek) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ groupId, dayOfWeek, x: rect.left, y: rect.bottom + 4 });
    setAddForm({ templateId: '', minStaff: 1 });
  }

  function closePopover() { setPopover(null); }

  async function handleAddRule() {
    if (!popover || !addForm.templateId || saving) return;
    setSaving(true);
    const res = await fetch(`/api/groups/${popover.groupId}/coverage`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        dayOfWeek: popover.dayOfWeek,
        templateId: Number(addForm.templateId),
        minStaff: Number(addForm.minStaff),
      }),
    });
    if (res.ok) {
      const { rule } = await res.json();
      // The PUT returns the coverage_rules row, which has no template name or
      // start_time — both live on shift_templates. Enrich from the template we
      // already hold so the new cell renders identically to a refetched one.
      const tpl = popoverGroup.templates.find(t => t.id === rule.shift_template_id);
      const enriched = { ...rule, template_name: tpl?.name || '', start_time: tpl?.start_time || '' };
      setGroups(prev => prev.map(g => {
        if (g.id !== popover.groupId) return g;
        const idx = g.coverage.findIndex(
          c => c.day_of_week === rule.day_of_week && c.shift_template_id === rule.shift_template_id
        );
        const newCoverage = idx >= 0
          ? g.coverage.map((c, i) => i === idx ? enriched : c)
          : [...g.coverage, enriched];
        return { ...g, coverage: newCoverage };
      }));
      setAddForm({ templateId: '', minStaff: 1 });
    }
    setSaving(false);
  }

  async function handleDeleteRule(ruleId) {
    if (!popover) return;
    const res = await fetch(`/api/groups/${popover.groupId}/coverage/${ruleId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      setGroups(prev => prev.map(g => {
        if (g.id !== popover.groupId) return g;
        return { ...g, coverage: g.coverage.filter(c => c.id !== ruleId) };
      }));
    }
  }

  if (loading) return <p className="p-4 text-gray-400 text-sm">Loading…</p>;
  if (groups.length === 0) return <p className="p-4 text-gray-400 text-sm">No groups found. Add groups first.</p>;

  return (
    <div>
      <div className="px-4 py-[18px] border-b border-gray-700 flex items-center gap-3">
        <p className="text-xs text-gray-500 flex-1">Drag a group row to reorder — top fills first when staff belong to multiple groups. Click any day cell to manage coverage rules.</p>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium ${fillOrder === 'group_first' ? 'text-amber-400' : 'text-blue-400'}`}>
            {fillOrder === 'group_first' ? 'Group Priority' : 'Day Priority'}
          </span>
          <button
            onClick={handleToggleFillOrder}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${fillOrder === 'group_first' ? 'bg-amber-500' : 'bg-blue-500'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${fillOrder === 'group_first' ? 'translate-x-4' : 'translate-x-1'}`} />
          </button>
          <button
            onClick={() => setShowFillHelp(true)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="About fill order"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>

      {showFillHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowFillHelp(false)}>
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-gray-100 font-semibold mb-3">Scheduler Fill Order</h3>
            <div className="space-y-4 text-sm text-gray-300">
              <div>
                <p className="text-amber-400 font-medium mb-1">Group Priority (recommended)</p>
                <p>The scheduler fills your most important groups across the entire week before considering any lower-priority groups. Critical roles — bartenders, event staff, specialized positions — get first pick of all eligible staff. Day priority still applies within each group's pass: your most critical day fills first for each group.</p>
              </div>
              <div>
                <p className="text-blue-400 font-medium mb-1">Day Priority</p>
                <p>The scheduler fills your most important days completely — all groups — before moving to less critical days. Within each day, groups still fill in priority order. Best suited for teams where staff work only one role and full-day coverage matters more than protecting specific positions.</p>
              </div>
              <p className="text-gray-500 text-xs">This setting applies globally to every schedule generation.</p>
            </div>
            <button onClick={() => setShowFillHelp(false)} className="mt-5 w-full bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-lg py-2 text-sm transition-colors">
              Got it
            </button>
          </div>
        </div>
      )}
      <div className={dragging ? 'overflow-hidden' : 'overflow-x-auto'}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => setDragging(true)} onDragEnd={handleDragEnd}>
          <table className="text-xs border-separate border-spacing-0 min-w-full">
            <thead>
              <tr className="bg-gray-950">
                <th className="sticky left-0 bg-gray-950 border border-gray-700 px-2 py-2 text-left font-medium text-gray-300 min-w-[110px] z-10">
                  Group
                </th>
                {DAYS.map((d, i) => {
                  const isClosed = permanentClosedDays.includes(i);
                  const rank = rankedDays.includes(i) ? rankedDays.indexOf(i) + 1 : null;
                  return (
                    <th key={d} className={`relative border border-gray-700 px-2 py-2 font-medium min-w-[80px] text-center ${isClosed ? 'text-gray-600' : 'text-gray-300'}`}>
                      <DayPriorityBadge rank={rank} onTap={() => handleDayPriorityTap(i)} />
                      <div>{d}</div>
                      <button
                        onClick={() => onToggleClosedDay?.(i)}
                        className={`text-[9px] font-normal mt-0.5 ${isClosed ? 'text-red-400 hover:text-red-300' : 'text-gray-600 hover:text-gray-400'}`}
                      >
                        {isClosed ? 'Closed' : '+ Close'}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <SortableContext items={groups.map(g => g.id)} strategy={verticalListSortingStrategy}>
              <tbody>
                {groups.map(g => (
                  <SortableGroupRow key={g.id} group={g} onCellClick={openPopover} />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      </div>

      {popover && popoverGroup && (
        <>
          <div className="fixed inset-0 z-20" onClick={closePopover} />
          <div
            className="fixed z-30 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-4 w-56"
            style={{
              top: Math.min(popover.y, window.innerHeight - 260),
              left: Math.min(popover.x, window.innerWidth - 232),
            }}
          >
            <p className="text-xs font-semibold text-gray-200 mb-3">
              {popoverGroup.name} — {DAYS[popover.dayOfWeek]}
            </p>

            {popoverRules.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {popoverRules.map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-300">{r.template_name} {toCompactTime(r.start_time)} ({r.min_staff})</span>
                    <button
                      onClick={() => handleDeleteRule(r.id)}
                      className="text-red-500 hover:text-red-400 text-xs flex-shrink-0"
                    >🗑</button>
                  </div>
                ))}
                <div className="border-t border-gray-700 pt-2" />
              </div>
            )}

            <select
              value={addForm.templateId}
              onChange={e => setAddForm(p => ({ ...p, templateId: e.target.value }))}
              className="w-full bg-gray-900 border border-gray-700 text-gray-100 rounded px-2 py-1.5 text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— Template —</option>
              {(popoverGroup.templates || []).map(t => (
                <option key={t.id} value={t.id}>{t.name} · {toDisplayTime(t.start_time)}</option>
              ))}
            </select>

            <div className="flex items-center gap-2 mb-3">
              <label className="text-xs text-gray-400 flex-1">Min staff</label>
              <input
                type="number"
                min={1}
                max={20}
                value={addForm.minStaff}
                onChange={e => setAddForm(p => ({ ...p, minStaff: e.target.value }))}
                className="w-12 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddRule}
                disabled={saving || !addForm.templateId}
                className="flex-1 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
              >
                {saving ? 'Saving…' : 'Add rule'}
              </button>
              <button
                onClick={closePopover}
                className="px-3 py-1.5 text-xs text-gray-400 border border-gray-600 rounded hover:text-gray-200 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FixedScheduleGrid() {
  const [staff, setStaff] = useState([]);
  const [fixedMap, setFixedMap] = useState({});
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [popover, setPopover] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/users', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/users/all-fixed-schedules', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/groups/all-templates', { credentials: 'include' }).then(r => r.json()),
    ]).then(([usersData, fixedData, tplData]) => {
      setStaff((usersData.users || []).filter(u => u.is_active));
      const map = {};
      for (const row of fixedData.schedules || []) {
        if (!map[row.user_id]) map[row.user_id] = {};
        map[row.user_id][row.day_of_week] = row;
      }
      setFixedMap(map);
      setTemplates(tplData.templates || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const groupedTemplates = templates.reduce((acc, t) => {
    if (!acc[t.group_name]) acc[t.group_name] = [];
    acc[t.group_name].push(t);
    return acc;
  }, {});

  function openPopover(e, member, dayOfWeek, existing) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({
      userId: member.id,
      dayOfWeek,
      x: rect.left, y: rect.bottom + 4,
      templateId: existing?.shift_template_id || '',
      hasExisting: !!existing,
      memberGroupIds: (member.groups || []).map(g => g.id),
    });
  }

  function closePopover() { setPopover(null); }

  async function handleSave() {
    if (!popover || saving || !popover.templateId) return;
    setSaving(true);
    const res = await fetch(`/api/users/${popover.userId}/fixed-schedules/${popover.dayOfWeek}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ templateId: Number(popover.templateId) }),
    });
    if (res.ok) {
      const tpl = templates.find(t => t.id === Number(popover.templateId));
      setFixedMap(prev => ({
        ...prev,
        [popover.userId]: {
          ...prev[popover.userId],
          [popover.dayOfWeek]: { shift_template_id: tpl.id, template_name: tpl.name, start_time: tpl.start_time, group_color: tpl.group_color },
        },
      }));
    }
    setSaving(false);
    closePopover();
  }

  async function handleClear() {
    if (!popover || saving) return;
    setSaving(true);
    const res = await fetch(`/api/users/${popover.userId}/fixed-schedules/${popover.dayOfWeek}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      setFixedMap(prev => {
        const next = { ...prev, [popover.userId]: { ...prev[popover.userId] } };
        delete next[popover.userId][popover.dayOfWeek];
        return next;
      });
    }
    setSaving(false);
    closePopover();
  }

  if (loading) return <p className="p-4 text-gray-400 text-sm">Loading…</p>;
  if (staff.length === 0) return <p className="p-4 text-gray-400 text-sm">No active staff found.</p>;

  return (
    <div>
      <div className="px-4 py-[18px] border-b border-gray-700">
        <p className="text-xs text-gray-500">Click any cell to assign or clear a fixed recurring shift.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-gray-950">
              <th className="sticky left-0 bg-gray-950 border border-gray-700 px-2 py-2 text-left font-medium text-gray-300 min-w-[90px] z-10">Name</th>
              {DAYS.map(d => (
                <th key={d} className="border border-gray-700 px-2 py-2 font-medium text-gray-300 min-w-[80px]">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortByGroupThenName(staff, m => m.groups, m => m.name).map(member => (
              <tr key={member.id} className="hover:bg-gray-700/30">
                <td
                  className="sticky left-0 bg-gray-800 border border-gray-700 px-2 py-2 font-medium text-gray-100 z-10 whitespace-nowrap"
                  style={{ borderLeft: `3px solid ${primaryGroup(member.groups)?.color || 'transparent'}` }}
                >{member.name}</td>
                {DAYS.map((_, dayIndex) => {
                  const cell = fixedMap[member.id]?.[dayIndex];
                  return (
                    <td
                      key={dayIndex}
                      onClick={(e) => openPopover(e, member, dayIndex, cell)}
                      className="border border-gray-700 px-1 py-2 text-center cursor-pointer hover:bg-blue-900/20 transition-colors"
                    >
                      {cell ? (
                        <span className="text-[10px] leading-tight" style={{ color: cell.group_color || '#60a5fa' }}>
                          {cell.template_name}<br />{toDisplayTime(cell.start_time)}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-[10px]">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {popover && (
        <>
          <div className="fixed inset-0 z-20" onClick={closePopover} />
          <div
            className="fixed z-30 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-4 w-56"
            style={{
              top: Math.min(popover.y, window.innerHeight - 200),
              left: Math.min(popover.x, window.innerWidth - 232),
            }}
          >
            <p className="text-xs font-semibold text-gray-200 mb-3">
              {staff.find(s => s.id === popover.userId)?.name} — {DAYS[popover.dayOfWeek]}
            </p>
            <select
              value={popover.templateId}
              onChange={e => setPopover(p => ({ ...p, templateId: e.target.value }))}
              className="w-full bg-gray-900 border border-gray-700 text-gray-100 rounded px-2 py-1.5 text-xs mb-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— Select shift —</option>
              {Object.entries(groupedTemplates)
                .filter(([, tpls]) => tpls.some(t => popover.memberGroupIds.includes(t.group_id)))
                .map(([groupName, tpls]) => (
                  <optgroup key={groupName} label={groupName}>
                    {tpls.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {toDisplayTime(t.start_time)} · {t.hours}h
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !popover.templateId}
                className="flex-1 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {popover.hasExisting && (
                <button
                  onClick={handleClear}
                  disabled={saving}
                  className="flex-1 py-1.5 text-xs font-medium border border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-700 rounded transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AvailabilityGrid() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [popover, setPopover] = useState(null);

  useEffect(() => {
    fetch('/api/availability/manager/all', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setStaff(d.staff || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function openPopover(e, userId, dayOfWeek, avail) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({
      userId,
      dayOfWeek,
      x: rect.left,
      y: rect.bottom + 4,
      startTime: avail?.start_time || '09:00',
      endTime: avail?.end_time || '17:00',
      isBlocked: !!avail?.is_blocked,
      hasExisting: !!avail,
    });
  }

  function closePopover() { setPopover(null); setSaveError(''); }

  async function handleSave() {
    if (!popover || saving) return;
    setSaving(true);
    setSaveError('');
    const startTime = popover.isBlocked ? '00:00' : popover.startTime;
    const endTime = popover.isBlocked ? '00:00' : popover.endTime;
    // Manager edits take effect from the current week, not the next one. Staff
    // requests stay future-dated — they are asking, and the schedule they are
    // asking about may already be published. A manager changing the grid is
    // stating a fact, and needs it to apply to the week being built right now.
    // Nothing already published is rewritten; this only changes what the next
    // generate/regenerate and the violation checks see.
    const effectiveFrom = getWeekStartOf(new Date());
    const res = await fetch(`/api/availability/manager/${popover.userId}/${popover.dayOfWeek}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ startTime, endTime, effectiveFrom, isBlocked: popover.isBlocked }),
    });
    if (res.ok) {
      setStaff(prev => prev.map(s => {
        if (s.id !== popover.userId) return s;
        const filtered = s.availability.filter(a => a.day_of_week !== popover.dayOfWeek);
        return { ...s, availability: [...filtered, { day_of_week: popover.dayOfWeek, start_time: startTime, end_time: endTime, is_blocked: popover.isBlocked ? 1 : 0 }] };
      }));
      setSaving(false);
      closePopover();
    } else {
      const d = await res.json().catch(() => ({}));
      setSaveError(d.error || 'Failed to save');
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!popover || saving) return;
    setSaving(true);
    const res = await fetch(`/api/availability/manager/${popover.userId}/${popover.dayOfWeek}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      setStaff(prev => prev.map(s => {
        if (s.id !== popover.userId) return s;
        return { ...s, availability: s.availability.filter(a => a.day_of_week !== popover.dayOfWeek) };
      }));
    }
    setSaving(false);
    closePopover();
  }

  if (loading) return <p className="p-4 text-gray-400 text-sm">Loading…</p>;
  if (staff.length === 0) return <p className="p-4 text-gray-400 text-sm">No active staff found.</p>;

  return (
    <div>
      <div className="px-4 py-[18px] border-b border-gray-700">
        <p className="text-xs text-gray-500">Click any cell to set the hours that person is available. Changes apply from this week — regenerate to see them in the schedule.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-gray-950">
              <th className="sticky left-0 bg-gray-950 border border-gray-700 px-2 py-2 text-left font-medium text-gray-300 min-w-[90px] z-10">
                Name
              </th>
              {DAYS.map(d => (
                <th key={d} className="border border-gray-700 px-2 py-2 font-medium text-gray-300 min-w-[80px]">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortByGroupThenName(staff, m => m.groups, m => m.name).map(member => (
              <tr key={member.id} className="hover:bg-gray-700/30">
                <td
                  className="sticky left-0 bg-gray-800 border border-gray-700 px-2 py-2 font-medium text-gray-100 z-10 whitespace-nowrap"
                  style={{ borderLeft: `3px solid ${primaryGroup(member.groups)?.color || 'transparent'}` }}
                >
                  {member.name}
                </td>
                {DAYS.map((_, dayIndex) => {
                  const avail = member.availability.find(a => a.day_of_week === dayIndex);
                  return (
                    <td
                      key={dayIndex}
                      onClick={(e) => openPopover(e, member.id, dayIndex, avail)}
                      className="border border-gray-700 px-1 py-2 text-center cursor-pointer hover:bg-blue-900/20 transition-colors"
                    >
                      {avail?.is_blocked ? (
                        <span className="text-red-400 text-[10px]">Off</span>
                      ) : avail && !(avail.start_time === '00:00' && avail.end_time === '23:59') ? (
                        <span className="text-green-400 text-[10px] leading-tight">
                          {toDisplayTime(avail.start_time)}<br />{toDisplayTime(avail.end_time)}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-[10px]">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {popover && (
        <>
          <div className="fixed inset-0 z-20" onClick={closePopover} />
          <div
            className="fixed z-30 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-4 w-60"
            style={{
              top: Math.min(popover.y, window.innerHeight - 220),
              left: Math.min(popover.x, window.innerWidth - 256),
            }}
          >
            <p className="text-xs font-semibold text-gray-200 mb-3">
              {staff.find(s => s.id === popover.userId)?.name} — {DAYS[popover.dayOfWeek]}
            </p>

            <button
              onClick={() => setPopover(p => ({ ...p, isBlocked: !p.isBlocked }))}
              className={`text-xs px-2 py-1 rounded border mb-3 transition-colors ${
                popover.isBlocked
                  ? 'border-red-400 text-red-400 bg-red-900/20'
                  : 'border-gray-600 text-gray-500 hover:text-gray-300'
              }`}
            >
              Not available
            </button>

            {!popover.isBlocked && (
              <>
                {/* Labelled because the inverse reading is silently destructive: a
                    manager who means "can't work 9–5" and types 9–5 makes that the
                    only window the scheduler will use. An inverted range is still a
                    valid one, so nothing downstream catches it. */}
                <label className="block text-[10px] font-medium text-gray-400 mb-1">Available between</label>
                <div className="flex items-center gap-1.5 mb-3">
                  <input
                    type="time"
                    value={popover.startTime}
                    onChange={(e) => setPopover(p => ({ ...p, startTime: e.target.value }))}
                    className="bg-gray-900 border border-gray-700 text-gray-100 rounded px-2 py-1 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-gray-500 flex-shrink-0">–</span>
                  <input
                    type="time"
                    value={popover.endTime}
                    onChange={(e) => setPopover(p => ({ ...p, endTime: e.target.value }))}
                    className="bg-gray-900 border border-gray-700 text-gray-100 rounded px-2 py-1 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            {saveError && <p className="text-xs text-red-400 mb-2">{saveError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {popover.hasExisting && (
                // Was "Clear", which named the operation rather than its result
                // and left the third state undiscoverable — nothing said that
                // removing the pattern means "available any time". Naming the
                // outcome puts all three states in front of the manager without
                // needing a mode picker: Not available / Available between /
                // All day. Also drops the red hover: this is not destructive in
                // the way deleting a fixed shift is, it just widens availability.
                <button
                  onClick={handleClear}
                  disabled={saving}
                  title="Remove this pattern — available any time this day"
                  className="flex-1 py-1.5 text-xs font-medium border border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-500 rounded transition-colors"
                >
                  All day
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Role enforcement lives in ProtectedRoute (roles={['manager','admin']}), which
// also gates on auth loading — this component never mounts for staff.
export default function ScheduleBuilder() {
  const [tab, setTab] = useState('schedule');
  const [weekStart, setWeekStart] = useState(() => getWeekStartOf(new Date()));
  const {
    schedule, shifts, warnings, groups, loading, generating, publishing,
    republishing, forking, discarding, copying, applyingTemplate, error, violations, hasDraft, liveSchedule,
    permanentClosedDays, dayOverrides,
    closedDays, timeOffDates, events, eventCoverage, swapConflicts, viewers,
    generate, publish, republish, fork, discardDraft, copyWeek, applyTemplate,
    updateShift, removeShift, addShift,
    updatePermanentClosedDays,
    setDayOverride, removeDayOverride,
    closeDay, openDay, recheck,
    addEventTitle, deleteEventTitle, saveEventCoverage, removeEventCoverageRow, removeEventCoverage,
  } = useScheduleBuilder(weekStart);

  function handleToggleClosedDay(dayIndex) {
    const next = (permanentClosedDays || []).includes(dayIndex)
      ? (permanentClosedDays || []).filter(d => d !== dayIndex)
      : [...(permanentClosedDays || []), dayIndex];
    updatePermanentClosedDays(next);
  }

  const permClosedSet = new Set(
    (permanentClosedDays || []).filter(d => !dayOverrides?.[String(d)])
  );

  const rateByGroupId = Object.fromEntries(
    (groups || []).filter(g => g.hourly_rate != null).map(g => [g.id, g.hourly_rate])
  );

  function prevWeek() { setWeekStart(w => addDays(w, -7)); }
  function nextWeek() { setWeekStart(w => addDays(w, 7)); }

  async function handleGenerate() { await generate(); }

  // Seeds the week with fixed shifts only — no coverage fill — for a manager who
  // wants to build the rest by hand.
  async function handleGenerateFixedOnly() { await generate({ mode: 'fixed-only' }); }

  async function handlePublish() {
    if (!window.confirm(`Publish the schedule for week of ${formatDate(weekStart)}?\n\nAll staff will be able to see it.`)) return;
    await publish(schedule.id);
  }

  const [showRepublishModal, setShowRepublishModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');
  const [dailyOverheadRate, setDailyOverheadRate] = useState(0);

  useEffect(() => {
    fetch('/api/schedule/app-name', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setRestaurantName(d.name || ''))
      .catch(() => {});
    fetch('/api/schedule/overhead-rate', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setDailyOverheadRate(d.rate || 0))
      .catch(() => {});
  }, []);

  async function handleSetOverheadRate(rate) {
    const r = await fetch('/api/schedule/overhead-rate', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ rate }),
    });
    const d = await r.json();
    if (r.ok) setDailyOverheadRate(d.rate);
  }

  async function handleReGenerate() {
    if (generating) return;
    if (!window.confirm(
      `Re-generate the schedule for the week of ${formatDate(weekStart)}?\n\n` +
      `Manually-edited shifts will be preserved. Staff continue seeing the current published schedule.`
    )) return;
    await generate({ force: true });
  }

  function handleRepublish() {
    setShowRepublishModal(true);
  }

  async function confirmRepublish() {
    if (!schedule) return;
    setShowRepublishModal(false);
    await republish(schedule.id);
  }

  async function handleStartEditing() {
    if (forking || !schedule) return;
    await fork(schedule.id);
  }

  async function handleDiscardDraft() {
    if (!schedule) return;
    const msg = isForkDraft
      ? 'Discard this working draft? The schedule will revert to the current published version.'
      : 'Discard this draft? It will be deleted entirely — there is no published version to revert to.';
    if (!window.confirm(msg)) return;
    await discardDraft(schedule.id);
  }

  const isPublished = schedule?.status === 'published' && !hasDraft;
  const isDraft = schedule?.status === 'draft';
  const isForkDraft = isDraft && !!liveSchedule;
  const isFreshDraft = isDraft && !liveSchedule;

  const scheduleContextText = loading ? ''
    : !schedule ? 'No schedule yet — choose how to start this week.'
    : isForkDraft ? 'Editing published schedule — staff see the live version while you work.'
    : isFreshDraft ? 'Draft — review shifts and publish when ready.'
    : isPublished ? 'Tap Start Editing to make changes, or tap a date to post open shifts.'
    : '';

  return (
    <div className="max-w-full">
      <div className="sticky top-[57px] z-20 print:hidden">
        <div className="flex bg-gray-800 border-b border-gray-700">
          {[['schedule', 'Schedule'], ['coverage', 'Coverage'], ['availability', 'Availability'], ['fixed', 'Fixed Shifts']].map(([key, label]) => {
            const dedupedCount = key === 'schedule' ? warnings.length + [...new Map(violations.map(v => {
              const s = shifts.find(sh => sh.id === v.shiftId);
              return [`${s?.user_id ?? '?'}|${v.type}`, v];
            })).values()].length : 0;
            const issueCount = dedupedCount;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === key ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {issueCount > 0 ? (
                  <span className="inline-flex items-center justify-center gap-1">
                    {label}
                    <span className="text-[10px] font-bold text-amber-400">⚠{issueCount}</span>
                  </span>
                ) : label}
              </button>
            );
          })}
        </div>

        {tab === 'schedule' && (
          <>
          {/* Context strip — text left, action buttons right */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-950 border-b border-gray-700 gap-2 print:hidden">
            <p className="text-xs text-gray-500">{scheduleContextText}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isForkDraft && (
                <button onClick={handleReGenerate} disabled={generating || loading}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 rounded transition-colors">
                  {generating ? 'Generating…' : 'Re-Generate'}
                </button>
              )}
              {isForkDraft && (
                <button onClick={handleDiscardDraft} disabled={generating || forking || discarding || republishing}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-700 disabled:opacity-50 rounded transition-colors">
                  {discarding ? 'Discarding…' : 'Discard Draft'}
                </button>
              )}
              {isPublished && (
                <>
                  <div className="flex items-center gap-1 text-green-400 text-xs font-medium">
                    <CheckCircle2 size={14} />
                    <span>Published</span>
                  </div>
                  <button onClick={handleStartEditing} disabled={forking || loading}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 rounded transition-colors">
                    {forking ? 'Starting…' : 'Start Editing'}
                  </button>
                </>
              )}
              {isFreshDraft && (
                <>
                  <button onClick={handleGenerate} disabled={generating || loading}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 rounded transition-colors">
                    {generating ? 'Generating…' : shifts.length > 0 ? 'Regenerate' : 'Generate'}
                  </button>
                  <button onClick={handleDiscardDraft} disabled={generating || discarding}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-700 disabled:opacity-50 rounded transition-colors">
                    {discarding ? 'Discarding…' : 'Discard Draft'}
                  </button>
                  <button onClick={handlePublish} disabled={publishing || !schedule}
                    className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded transition-colors">
                    {publishing ? 'Publishing…' : 'Publish'}
                  </button>
                </>
              )}
              {isForkDraft && (
                <button onClick={handleRepublish} disabled={republishing || discarding}
                  className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded transition-colors">
                  {republishing ? 'Publishing…' : 'Re-Publish'}
                </button>
              )}
            </div>
          </div>
          {/* Date nav — week navigation only */}
          <div className="flex items-center px-4 py-2 bg-gray-800 border-b border-gray-700 gap-1">
            <button onClick={prevWeek} className="px-2 py-1 text-gray-400 hover:text-gray-200 text-base leading-none">‹</button>
            <span className={`text-sm font-medium whitespace-nowrap ${weekStart === getWeekStartOf(new Date()) ? 'text-blue-400' : 'text-gray-100'}`}>Week of {formatDate(weekStart)}</span>
            <button onClick={nextWeek} className="px-2 py-1 text-gray-400 hover:text-gray-200 text-base leading-none">›</button>
          </div>
          </>
        )}
      </div>

      {tab === 'schedule' && (
        <>
          {error && (
            <div className="mx-4 mt-3 p-3 bg-red-900/40 border border-red-700 rounded-lg print:hidden">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
          {loading ? (
            <p className="p-4 text-gray-400 text-sm">Loading…</p>
          ) : isPublished || isDraft ? (
            <>
              <div className="hidden print:block pt-3 pb-1">
                <p className="text-lg font-bold text-black">{restaurantName ? `${restaurantName} — ` : ''}Schedule — Week of {formatDate(weekStart)}</p>
              </div>
              <div className="mt-2">
                <EditableDraftGrid
                  weekStart={weekStart}
                  shifts={shifts}
                  violations={violations}
                  warnings={warnings}
                  timeOffDates={timeOffDates}
                  scheduleId={schedule?.id}
                  onUpdateShift={updateShift}
                  onRemoveShift={removeShift}
                  onAddShift={addShift}
                  onCloseDay={(date) => closeDay(schedule.id, date)}
                  onOpenDay={(date) => openDay(schedule.id, date)}
                  closedDays={new Set(closedDays)}
                  readOnly={isPublished}
                  events={events}
                  eventCoverage={eventCoverage}
                  onAddEventTitle={addEventTitle}
                  onDeleteEventTitle={deleteEventTitle}
                  onSaveEventCoverage={saveEventCoverage}
                  onRemoveEventCoverageRow={removeEventCoverageRow}
                  onRemoveEventCoverage={removeEventCoverage}
                  viewers={viewers}
                  rateByGroupId={rateByGroupId}
                  permClosedSet={permClosedSet}
                  dayOverrides={dayOverrides}
                  onSetDayOverride={(dow) => setDayOverride(schedule.id, dow)}
                  onRemoveDayOverride={(dow) => removeDayOverride(schedule.id, dow)}
                  dailyOverheadRate={dailyOverheadRate}
                  onSetOverheadRate={handleSetOverheadRate}
                />
              </div>
              <div className="print:hidden">
                <ViolationsTray warnings={warnings} violations={violations} shifts={shifts} onRecheck={() => recheck(schedule?.id)} onPrint={() => window.print()} onSaveTemplate={shifts.length > 0 ? () => setShowSaveTemplateModal(true) : undefined} />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 gap-6 px-4">
              <p className="text-gray-400 text-sm">No schedule for this week</p>
              <div className="flex gap-4 flex-wrap justify-center">
                <button
                  onClick={handleGenerate}
                  disabled={generating || loading}
                  className="flex flex-col items-center gap-2 px-8 py-5 bg-gray-800 border border-gray-700 hover:border-gray-500 disabled:opacity-50 rounded-xl transition-colors"
                >
                  <span className="text-gray-100 font-medium text-sm">{generating ? 'Generating…' : 'Generate'}</span>
                  <span className="text-gray-500 text-xs">Auto-schedule</span>
                </button>
                <button
                  onClick={handleGenerateFixedOnly}
                  disabled={generating || loading}
                  className="flex flex-col items-center gap-2 px-8 py-5 bg-gray-800 border border-gray-700 hover:border-gray-500 disabled:opacity-50 rounded-xl transition-colors"
                >
                  <span className="text-gray-100 font-medium text-sm">{generating ? 'Working…' : 'Fixed shifts'}</span>
                  <span className="text-gray-500 text-xs">Fixed shifts only</span>
                </button>
                <button
                  onClick={() => setShowCopyModal(true)}
                  disabled={copying || loading}
                  className="flex flex-col items-center gap-2 px-8 py-5 bg-gray-800 border border-gray-700 hover:border-gray-500 disabled:opacity-50 rounded-xl transition-colors"
                >
                  <span className="text-gray-100 font-medium text-sm">Copy week</span>
                  <span className="text-gray-500 text-xs">From previous week</span>
                </button>
                <button
                  onClick={() => setShowApplyTemplateModal(true)}
                  disabled={applyingTemplate || loading}
                  className="flex flex-col items-center gap-2 px-8 py-5 bg-gray-800 border border-gray-700 hover:border-gray-500 disabled:opacity-50 rounded-xl transition-colors"
                >
                  <span className="text-gray-100 font-medium text-sm">{applyingTemplate ? 'Applying…' : 'Template'}</span>
                  <span className="text-gray-500 text-xs">From saved template</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'coverage' && <CoverageGrid permanentClosedDays={permanentClosedDays || []} onToggleClosedDay={handleToggleClosedDay} />}
      {tab === 'fixed' && <FixedScheduleGrid />}
      {tab === 'availability' && <AvailabilityGrid />}

      {showCopyModal && (
        <CopyWeekModal
          targetWeek={weekStart}
          onCopy={async (sourceWeek) => {
            setShowCopyModal(false);
            await copyWeek(sourceWeek);
          }}
          onCancel={() => setShowCopyModal(false)}
        />
      )}

      {showSaveTemplateModal && (
        <SaveTemplateModal
          weekStart={weekStart}
          onSave={async (name) => {
            const r = await fetch('/api/schedule/templates', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ name, weekStart }),
            });
            return r.ok ? null : (await r.json()).error || 'Failed to save template';
          }}
          onClose={() => setShowSaveTemplateModal(false)}
        />
      )}

      {showApplyTemplateModal && (
        <ApplyTemplateModal
          onApply={async (templateId) => {
            setShowApplyTemplateModal(false);
            await applyTemplate(templateId);
          }}
          onClose={() => setShowApplyTemplateModal(false)}
        />
      )}

      {showRepublishModal && (
        <RepublishModal
          violations={violations}
          shifts={shifts}
          swapConflicts={swapConflicts}
          onConfirm={confirmRepublish}
          onCancel={() => setShowRepublishModal(false)}
        />
      )}
    </div>
  );
}
