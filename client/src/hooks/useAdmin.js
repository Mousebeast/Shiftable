import { useState, useEffect, useCallback } from 'react';

export function useAdmin() {
  const [settings, setSettings] = useState({});
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch('/api/admin/settings', { credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('/api/admin/users', { credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    ])
      .then(([s, u]) => {
        if (cancelled) return;
        setSettings(s.settings ?? {});
        setUsers(u.users ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load admin data');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const saveSettings = useCallback(async (data) => {
    const r = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ settings: data }),
    });
    const d = await r.json();
    if (r.ok) setSettings(d.settings ?? {});
    return { ok: r.ok, data: d };
  }, []);

  const promoteUser = useCallback(async (id, role) => {
    const r = await fetch(`/api/admin/users/${id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role }),
    });
    const d = await r.json();
    if (r.ok) setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
    return { ok: r.ok, data: d };
  }, []);

  const hardDelete = useCallback(async (id) => {
    const r = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const d = await r.json();
    if (r.ok) setUsers(prev => prev.filter(u => u.id !== id));
    return { ok: r.ok, data: d };
  }, []);

  const getLoginHistory = useCallback(async (id) => {
    const r = await fetch(`/api/admin/users/${id}/login-history`, { credentials: 'include' });
    const d = await r.json();
    return d.events ?? [];
  }, []);

  const resetPin = useCallback(async (id) => {
    const r = await fetch(`/api/users/${id}/regenerate-link`, {
      method: 'POST',
      credentials: 'include',
    });
    const d = await r.json();
    return { ok: r.ok, claimUrl: d.claimUrl };
  }, []);

  return { settings, users, loading, error, saveSettings, promoteUser, hardDelete, getLoginHistory, resetPin };
}
