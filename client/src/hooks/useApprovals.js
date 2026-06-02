import { useState, useEffect, useCallback } from 'react';

function groupAvailability(rows) {
  const groups = {};
  rows.forEach(row => {
    const key = `${row.user_id}-${row.effective_from}`;
    if (!groups[key]) {
      groups[key] = { key, user_id: row.user_id, user_name: row.user_name, effective_from: row.effective_from, rows: [] };
    }
    groups[key].rows.push(row);
  });
  return Object.values(groups).sort((a, b) => a.effective_from.localeCompare(b.effective_from));
}

export function useApprovals() {
  const [pending, setPending] = useState({ timeoff: [], availabilityGroups: [], swaps: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/approvals/pending', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setPending({
          timeoff: d.timeoff,
          availabilityGroups: groupAvailability(d.availability),
          swaps: d.swaps,
        });
        setLoading(false);
      })
      .catch(() => { setError('Failed to load'); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const approveTimeOff = useCallback(async (id, note) => {
    const r = await fetch(`/api/timeoff/${id}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ managerNote: note || null }),
    });
    if (r.ok) setPending(prev => ({ ...prev, timeoff: prev.timeoff.filter(t => t.id !== id) }));
  }, []);

  const denyTimeOff = useCallback(async (id, note) => {
    const r = await fetch(`/api/timeoff/${id}/deny`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ managerNote: note || null }),
    });
    if (r.ok) setPending(prev => ({ ...prev, timeoff: prev.timeoff.filter(t => t.id !== id) }));
  }, []);

  const approveAvailabilityGroup = useCallback(async (group) => {
    const results = await Promise.all(
      group.rows.map(row =>
        fetch(`/api/availability/${row.id}/approve`, { method: 'PATCH', credentials: 'include' })
      )
    );
    if (results.every(r => r.ok)) {
      setPending(prev => ({ ...prev, availabilityGroups: prev.availabilityGroups.filter(g => g.key !== group.key) }));
    }
  }, []);

  const denyAvailabilityGroup = useCallback(async (group) => {
    const results = await Promise.all(
      group.rows.map(row =>
        fetch(`/api/availability/${row.id}/deny`, { method: 'PATCH', credentials: 'include' })
      )
    );
    if (results.every(r => r.ok)) {
      setPending(prev => ({ ...prev, availabilityGroups: prev.availabilityGroups.filter(g => g.key !== group.key) }));
    }
  }, []);

  const approveSwap = useCallback(async (id) => {
    const r = await fetch(`/api/swaps/${id}/approve`, { method: 'PATCH', credentials: 'include' });
    if (r.ok) setPending(prev => ({ ...prev, swaps: prev.swaps.filter(s => s.id !== id) }));
  }, []);

  const denySwap = useCallback(async (id) => {
    const r = await fetch(`/api/swaps/${id}/deny`, { method: 'PATCH', credentials: 'include' });
    if (r.ok) setPending(prev => ({ ...prev, swaps: prev.swaps.filter(s => s.id !== id) }));
  }, []);

  return { pending, loading, error, approveTimeOff, denyTimeOff, approveAvailabilityGroup, denyAvailabilityGroup, approveSwap, denySwap };
}
