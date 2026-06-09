import { useState, useEffect, useCallback, useRef } from 'react';

export function useScheduleBuilder(weekStart) {
  const [data, setData] = useState({
    schedule: null, shifts: [], warnings: [], groups: [],
    permanentClosedDays: [], dayOverrides: {},
    hasDraft: false, liveSchedule: null, closedDays: [], timeOffDates: [],
    events: {}, eventCoverage: [], swapConflicts: 0, viewers: [],
  });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [republishing, setRepublishing] = useState(false);
  const [forking, setForking] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [copying, setCopying] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [error, setError] = useState(null);
  const [violations, setViolations] = useState([]);
  const [hasEdits, setHasEdits] = useState(false);
  const scheduleStatusRef = useRef(null);

  useEffect(() => {
    scheduleStatusRef.current = data.schedule?.status ?? null;
  }, [data.schedule?.status]);

  const load = useCallback(() => {
    if (!weekStart) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setViolations([]);
    setHasEdits(false);
    fetch(`/api/schedule/builder?week=${weekStart}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (!cancelled) {
          setData({
            schedule: d.schedule,
            shifts: d.shifts || [],
            warnings: [],
            groups: d.groups || [],
            permanentClosedDays: d.permanentClosedDays || [],
            dayOverrides: d.dayOverrides || {},
            hasDraft: d.hasDraft || false,
            liveSchedule: d.liveSchedule || null,
            closedDays: d.closedDays || [],
            timeOffDates: d.timeOffDates || [],
            events: d.events || {},
            eventCoverage: d.eventCoverage || [],
            swapConflicts: d.swapConflicts || 0,
            viewers: d.viewers || [],
          });
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [weekStart]);

  useEffect(() => load(), [load]);

  const generate = useCallback(async ({ force = false } = {}) => {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ week: weekStart, force }),
      });
      const d = await r.json();
      if (r.ok) {
        setData(prev => ({
          ...prev,
          schedule: d.schedule,
          shifts: d.shifts,
          warnings: d.warnings || [],
          hasDraft: d.hasDraft || false,
          liveSchedule: d.liveSchedule || null,
        }));
        setViolations([]);
        setHasEdits(false);
        recheck(d.schedule.id);
      } else {
        setError(d.error || 'Failed to generate schedule');
      }
    } catch {
      setError('Failed to generate schedule');
    } finally {
      setGenerating(false);
    }
  }, [weekStart]);

  const publish = useCallback(async (scheduleId) => {
    setPublishing(true);
    setError(null);
    try {
      const r = await fetch(`/api/schedule/${scheduleId}/publish`, {
        method: 'PATCH',
        credentials: 'include',
      });
      const d = await r.json();
      if (r.ok) {
        setData(prev => ({
          ...prev,
          schedule: d.schedule,
          hasDraft: false,
          liveSchedule: null,
        }));
        setHasEdits(false);
      } else {
        setError(d.error || 'Failed to publish schedule');
      }
    } catch {
      setError('Failed to publish schedule');
    } finally {
      setPublishing(false);
    }
  }, []);

  const republish = useCallback(async (draftId) => {
    setRepublishing(true);
    setError(null);
    try {
      const r = await fetch(`/api/schedule/${draftId}/republish`, {
        method: 'PATCH',
        credentials: 'include',
      });
      const d = await r.json();
      if (r.ok) {
        setData(prev => ({
          ...prev,
          schedule: d.schedule,
          hasDraft: false,
          liveSchedule: null,
        }));
        setHasEdits(false);
        setViolations([]);
      } else {
        setError(d.error || 'Failed to re-publish schedule');
      }
    } catch {
      setError('Failed to re-publish schedule');
    } finally {
      setRepublishing(false);
    }
  }, []);

  const fork = useCallback(async (publishedId) => {
    setForking(true);
    setError(null);
    try {
      const r = await fetch(`/api/schedule/${publishedId}/fork`, {
        method: 'POST',
        credentials: 'include',
      });
      const d = await r.json();
      if (r.ok) {
        setData(prev => ({
          ...prev,
          schedule: d.schedule,
          shifts: d.shifts || [],
          hasDraft: true,
          liveSchedule: d.liveSchedule || null,
        }));
        setViolations([]);
        setHasEdits(false);
      } else {
        setError(d.error || 'Failed to start editing');
      }
    } catch {
      setError('Failed to start editing');
    } finally {
      setForking(false);
    }
  }, []);

  const copyWeek = useCallback(async (sourceWeek) => {
    setCopying(true);
    setError(null);
    try {
      const r = await fetch('/api/schedule/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sourceWeek, targetWeek: weekStart }),
      });
      const d = await r.json();
      if (r.ok) {
        setData(prev => ({
          ...prev,
          schedule: d.schedule,
          shifts: d.shifts || [],
          warnings: d.warnings || [],
          hasDraft: true,
          liveSchedule: null,
        }));
        setViolations((d.violations || []).map(v => ({ ...v })));
      } else {
        setError(d.error || 'Failed to copy week');
      }
    } catch {
      setError('Failed to copy week');
    } finally {
      setCopying(false);
    }
  }, [weekStart]);

  const applyTemplate = useCallback(async (templateId) => {
    setApplyingTemplate(true);
    setError(null);
    try {
      const r = await fetch(`/api/schedule/templates/${templateId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetWeek: weekStart }),
      });
      const d = await r.json();
      if (r.ok) {
        setData(prev => ({
          ...prev,
          schedule: d.schedule,
          shifts: d.shifts || [],
          warnings: d.warnings || [],
          hasDraft: true,
          liveSchedule: null,
        }));
        setViolations((d.violations || []).map(v => ({ ...v })));
      } else {
        setError(d.error || 'Failed to apply template');
      }
    } catch {
      setError('Failed to apply template');
    } finally {
      setApplyingTemplate(false);
    }
  }, [weekStart]);

  const discardDraft = useCallback(async (draftId) => {
    setDiscarding(true);
    setError(null);
    try {
      const r = await fetch(`/api/schedule/${draftId}/draft`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const d = await r.json();
      if (r.ok) {
        setData(prev => ({
          ...prev,
          schedule: d.schedule,
          shifts: d.shifts || [],
          hasDraft: false,
          liveSchedule: d.liveSchedule || null,
        }));
        setViolations([]);
        setHasEdits(false);
      } else {
        setError(d.error || 'Failed to discard draft');
      }
    } catch {
      setError('Failed to discard draft');
    } finally {
      setDiscarding(false);
    }
  }, []);

  const updateShift = useCallback(async (shiftId, { groupId, templateId, startTime, hours, note }) => {
    const r = await fetch(`/api/schedule/shifts/${shiftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ groupId, templateId, startTime, hours, note }),
    });
    const d = await r.json();
    if (r.ok) {
      setData(prev => ({ ...prev, shifts: prev.shifts.map(s => s.id === shiftId ? d.shift : s) }));
      setViolations(prev => [
        ...prev.filter(v => v.shiftId !== shiftId),
        ...(d.violations || []).map(v => ({ ...v, shiftId })),
      ]);
      setHasEdits(true);
    }
    return d;
  }, []);

  const removeShift = useCallback(async (shiftId) => {
    const r = await fetch(`/api/schedule/shifts/${shiftId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const d = await r.json();
    if (r.ok) {
      setData(prev => ({ ...prev, shifts: prev.shifts.filter(s => s.id !== shiftId) }));
      setViolations(prev => [
        ...prev.filter(v => v.shiftId !== shiftId),
        ...(d.violations || []).map(v => ({ ...v, shiftId: null })),
      ]);
      setHasEdits(true);
    }
    return d;
  }, []);

  const addShift = useCallback(async (scheduleId, { userId, date, groupId, templateId, startTime, hours, note }) => {
    const r = await fetch(`/api/schedule/${scheduleId}/shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId, date, groupId, templateId, startTime, hours, note }),
    });
    const d = await r.json();
    if (r.ok) {
      setData(prev => ({ ...prev, shifts: [...prev.shifts, d.shift] }));
      if (d.violations?.length) {
        setViolations(prev => [...prev, ...d.violations.map(v => ({ ...v, shiftId: d.shift.id }))]);
      }
      setHasEdits(true);
    }
    return d;
  }, []);

  const recheck = useCallback(async (scheduleId) => {
    if (!scheduleId) return;
    const r = await fetch(`/api/schedule/${scheduleId}/validate`, { credentials: 'include' });
    if (r.ok) {
      const d = await r.json();
      setData(prev => ({ ...prev, warnings: d.warnings || [] }));
      const raw = d.violations || [];
      setViolations(
        scheduleStatusRef.current === 'published'
          ? raw.filter(v => v.type !== 'closed_day')
          : raw
      );
    }
  }, []);

  // Auto-validate whenever we land on a new schedule (load, generate, fork)
  useEffect(() => {
    if (data.schedule?.id) recheck(data.schedule.id);
  }, [data.schedule?.id, recheck]);

  const updatePermanentClosedDays = useCallback(async (days) => {
    const r = await fetch('/api/schedule/closed-days', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ permanentClosedDays: days }),
    });
    if (r.ok) setData(prev => ({ ...prev, permanentClosedDays: days }));
  }, []);

  const setDayOverride = useCallback(async (scheduleId, dayOfWeek) => {
    const r = await fetch(`/api/schedule/${scheduleId}/day-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dayOfWeek }),
    });
    const d = await r.json();
    if (r.ok) setData(prev => ({ ...prev, dayOverrides: d.dayOverrides }));
    return d;
  }, []);

  const removeDayOverride = useCallback(async (scheduleId, dayOfWeek) => {
    const r = await fetch(`/api/schedule/${scheduleId}/day-override/${dayOfWeek}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const d = await r.json();
    if (r.ok) setData(prev => ({ ...prev, dayOverrides: d.dayOverrides }));
    return d;
  }, []);

  const closeDay = useCallback(async (scheduleId, date) => {
    const r = await fetch(`/api/schedule/${scheduleId}/close-day`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ date }),
    });
    const d = await r.json();
    if (r.ok) {
      const newShiftIds = new Set((d.shifts || []).map(s => s.id));
      setData(prev => ({ ...prev, shifts: d.shifts, closedDays: d.closedDays }));
      setViolations(prev => prev.filter(v => v.shiftId === null || newShiftIds.has(v.shiftId)));
      setHasEdits(true);
    }
    return d;
  }, []);

  const openDay = useCallback(async (scheduleId, date) => {
    const r = await fetch(`/api/schedule/${scheduleId}/close-day/${date}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const d = await r.json();
    if (r.ok) {
      setData(prev => ({ ...prev, closedDays: d.closedDays }));
      setHasEdits(true);
    }
    return d;
  }, []);

  const addEventTitle = useCallback(async (weekStart, date, title) => {
    const r = await fetch('/api/events/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ week: weekStart, date, title }),
    });
    const d = await r.json();
    if (r.ok) {
      setData(prev => {
        const dayTitles = prev.events[date] || [];
        return {
          ...prev,
          events: { ...prev.events, [date]: [...dayTitles, d.event] },
        };
      });
    }
    return d;
  }, []);

  const deleteEventTitle = useCallback(async (id, weekStart, date) => {
    const r = await fetch(`/api/events/title/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (r.ok) {
      setData(prev => {
        const dayTitles = (prev.events[date] || []).filter(t => t.id !== id);
        const newEvents = { ...prev.events };
        if (dayTitles.length === 0) {
          delete newEvents[date];
        } else {
          newEvents[date] = dayTitles;
        }
        return { ...prev, events: newEvents };
      });
    }
    return r.ok;
  }, []);

  const saveEventCoverage = useCallback(async (weekStart, date, groupId, templateId, requiredStaff) => {
    const r = await fetch('/api/events/coverage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ week: weekStart, date, groupId, templateId, requiredStaff }),
    });
    const d = await r.json();
    if (r.ok) {
      setData(prev => {
        const filtered = prev.eventCoverage.filter(ec => !(ec.date === date && ec.group_id === groupId && ec.shift_template_id === templateId));
        return {
          ...prev,
          eventCoverage: [...filtered, { date, group_id: groupId, shift_template_id: templateId, required_staff: requiredStaff }],
        };
      });
    }
    return d;
  }, []);

  const removeEventCoverageRow = useCallback(async (weekStart, date, groupId, templateId) => {
    const r = await fetch(`/api/events/coverage/${weekStart}/${date}/${groupId}/${templateId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (r.ok) {
      setData(prev => ({
        ...prev,
        eventCoverage: prev.eventCoverage.filter(ec => !(ec.date === date && ec.group_id === groupId && ec.shift_template_id === templateId)),
      }));
    }
    return r.ok;
  }, []);

  const removeEventCoverage = useCallback(async (weekStart, date) => {
    const r = await fetch(`/api/events/coverage/${weekStart}/${date}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (r.ok) {
      setData(prev => ({
        ...prev,
        eventCoverage: prev.eventCoverage.filter(ec => ec.date !== date),
      }));
    }
    return r.ok;
  }, []);

  return {
    ...data,
    loading, generating, publishing, republishing, forking, discarding, copying, applyingTemplate, error,
    violations, hasEdits,
    generate, publish, republish, fork, discardDraft, copyWeek, applyTemplate,
    updateShift, removeShift, addShift,
    updatePermanentClosedDays,
    setDayOverride, removeDayOverride,
    closeDay, openDay, recheck,
    addEventTitle, deleteEventTitle, saveEventCoverage, removeEventCoverageRow, removeEventCoverage,
  };
}
