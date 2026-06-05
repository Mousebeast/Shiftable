import { useState, useEffect, useCallback } from 'react';

export function useGroups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/groups', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('HTTP error'); return r.json(); })
      .then(d => { setGroups(d.groups ?? []); setLoading(false); })
      .catch(() => { setError('Failed to load groups'); setLoading(false); });
  }, []);

  const createGroup = useCallback(async ({ name, color }) => {
    const r = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, color }),
    });
    const d = await r.json();
    if (r.ok) setGroups(prev => [...prev, d.group]);
    return { ok: r.ok, data: d };
  }, []);

  const updateGroup = useCallback(async (id, { name, color }) => {
    const r = await fetch(`/api/groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, color }),
    });
    const d = await r.json();
    if (r.ok) setGroups(prev => prev.map(g => g.id === id ? d.group : g));
    return { ok: r.ok, data: d };
  }, []);

  const deleteGroup = useCallback(async (id) => {
    const r = await fetch(`/api/groups/${id}`, { method: 'DELETE', credentials: 'include' });
    const d = await r.json();
    if (r.ok) setGroups(prev => prev.filter(g => g.id !== id));
    return { ok: r.ok, data: d };
  }, []);

  return { groups, loading, error, createGroup, updateGroup, deleteGroup };
}

export function useGroupDetail(groupId) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!groupId) { setDetail(null); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/groups/${groupId}`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('HTTP error'); return r.json(); })
      .then(d => { setDetail(d); setLoading(false); })
      .catch(() => { setError('Failed to load group'); setLoading(false); });
  }, [groupId]);

  const addTemplate = useCallback(async ({ name, startTime, hours }) => {
    const r = await fetch(`/api/groups/${groupId}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, startTime, hours }),
    });
    const d = await r.json();
    if (r.ok) setDetail(prev => ({ ...prev, templates: [...prev.templates, d.template] }));
    return { ok: r.ok, data: d };
  }, [groupId]);

  const updateTemplate = useCallback(async (tid, { name, startTime, hours }) => {
    const r = await fetch(`/api/groups/${groupId}/templates/${tid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, startTime, hours }),
    });
    const d = await r.json();
    if (r.ok) setDetail(prev => ({ ...prev, templates: prev.templates.map(t => t.id === tid ? d.template : t) }));
    return { ok: r.ok, data: d };
  }, [groupId]);

  const deleteTemplate = useCallback(async (tid) => {
    const r = await fetch(`/api/groups/${groupId}/templates/${tid}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) setDetail(prev => ({ ...prev, templates: prev.templates.filter(t => t.id !== tid) }));
    return { ok: r.ok };
  }, [groupId]);

  const upsertCoverage = useCallback(async ({ dayOfWeek, templateId, minStaff }) => {
    const r = await fetch(`/api/groups/${groupId}/coverage`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dayOfWeek, templateId, minStaff }),
    });
    const d = await r.json();
    if (r.ok) {
      setDetail(prev => {
        const idx = prev.coverage.findIndex(
          c => c.day_of_week === dayOfWeek && c.shift_template_id === templateId
        );
        const newCoverage = idx >= 0
          ? prev.coverage.map((c, i) => i === idx ? d.rule : c)
          : [...prev.coverage, d.rule];
        return { ...prev, coverage: newCoverage };
      });
    }
    return { ok: r.ok, data: d };
  }, [groupId]);

  const deleteCoverage = useCallback(async (ruleId) => {
    const r = await fetch(`/api/groups/${groupId}/coverage/${ruleId}`, { method: 'DELETE', credentials: 'include' });
    if (r.ok) setDetail(prev => ({ ...prev, coverage: prev.coverage.filter(c => c.id !== ruleId) }));
    return { ok: r.ok };
  }, [groupId]);

  return { detail, loading, error, addTemplate, updateTemplate, deleteTemplate, upsertCoverage, deleteCoverage };
}
