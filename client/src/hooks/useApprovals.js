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
  const [processing, setProcessing] = useState(new Set());

  const startProcessing = (key) => setProcessing(prev => new Set([...prev, key]));
  const stopProcessing = (key) => setProcessing(prev => { const next = new Set(prev); next.delete(key); return next; });

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/approvals/pending', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setPending({
          timeoff: d.timeoff || [],
          availabilityGroups: groupAvailability(d.availability || []),
          swaps: d.swaps || [],
        });
        setLoading(false);
      })
      .catch(() => { setError('Failed to load'); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const approveTimeOff = useCallback(async (id, note, force = false) => {
    const key = `timeoff-${id}`;
    if (processing.has(key)) return null;
    startProcessing(key);
    try {
      const r = await fetch(`/api/timeoff/${id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ managerNote: note || null, force }),
      });
      if (r.ok) {
        setPending(prev => ({ ...prev, timeoff: prev.timeoff.filter(t => t.id !== id) }));
        return { ok: true };
      }
      if (r.status === 409) {
        const d = await r.json();
        return { conflicts: d.conflicts };
      }
      return { error: true };
    } finally {
      stopProcessing(key);
    }
  }, [processing]);

  const denyTimeOff = useCallback(async (id, note) => {
    const key = `timeoff-deny-${id}`;
    if (processing.has(key)) return;
    startProcessing(key);
    try {
      const r = await fetch(`/api/timeoff/${id}/deny`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ managerNote: note || null }),
      });
      if (r.ok) setPending(prev => ({ ...prev, timeoff: prev.timeoff.filter(t => t.id !== id) }));
    } finally {
      stopProcessing(key);
    }
  }, [processing]);

  const approveAvailabilityGroup = useCallback(async (group) => {
    const key = `avail-${group.key}`;
    if (processing.has(key)) return;
    startProcessing(key);
    try {
      const results = await Promise.all(
        group.rows.map(row =>
          fetch(`/api/availability/${row.id}/approve`, { method: 'PATCH', credentials: 'include' })
        )
      );
      if (results.every(r => r.ok)) {
        setPending(prev => ({ ...prev, availabilityGroups: prev.availabilityGroups.filter(g => g.key !== group.key) }));
      } else {
        // Partial failure — some rows may already be approved; reload to reflect actual server state
        load();
      }
    } finally {
      stopProcessing(key);
    }
  }, [processing, load]);

  const denyAvailabilityGroup = useCallback(async (group) => {
    const key = `avail-deny-${group.key}`;
    if (processing.has(key)) return;
    startProcessing(key);
    try {
      const results = await Promise.all(
        group.rows.map(row =>
          fetch(`/api/availability/${row.id}/deny`, { method: 'PATCH', credentials: 'include' })
        )
      );
      if (results.every(r => r.ok)) {
        setPending(prev => ({ ...prev, availabilityGroups: prev.availabilityGroups.filter(g => g.key !== group.key) }));
      } else {
        load();
      }
    } finally {
      stopProcessing(key);
    }
  }, [processing, load]);

  const approveSwap = useCallback(async (id) => {
    const key = `swap-${id}`;
    if (processing.has(key)) return;
    startProcessing(key);
    try {
      const r = await fetch(`/api/swaps/${id}/approve`, { method: 'PATCH', credentials: 'include' });
      if (r.ok) {
        setPending(prev => ({ ...prev, swaps: prev.swaps.filter(s => s.id !== id) }));
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d.error || 'Failed to approve swap');
      }
    } finally {
      stopProcessing(key);
    }
  }, [processing]);

  const denySwap = useCallback(async (id) => {
    const key = `swap-deny-${id}`;
    if (processing.has(key)) return;
    startProcessing(key);
    try {
      const r = await fetch(`/api/swaps/${id}/deny`, { method: 'PATCH', credentials: 'include' });
      if (r.ok) {
        setPending(prev => ({ ...prev, swaps: prev.swaps.filter(s => s.id !== id) }));
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d.error || 'Failed to deny swap');
      }
    } finally {
      stopProcessing(key);
    }
  }, [processing]);

  return { pending, loading, error, processing, approveTimeOff, denyTimeOff, approveAvailabilityGroup, denyAvailabilityGroup, approveSwap, denySwap };
}
