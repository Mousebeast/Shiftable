import { useState, useEffect, useCallback } from 'react';

export function useSchedule(weekStart) {
  const [data, setData] = useState({ schedule: null, shifts: [], events: {}, timeOffDates: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    if (!weekStart) return;
    setLoading(true);
    fetch(`/api/schedule?week=${weekStart}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { setData({ schedule: d.schedule || null, shifts: d.shifts || [], events: d.events || {}, timeOffDates: d.timeOffDates || [] }); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  return { ...data, loading, error, reload: load };
}
