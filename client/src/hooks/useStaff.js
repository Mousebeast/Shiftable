import { useState, useEffect, useCallback } from 'react';

export function useStaff() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/users?includeInactive=true', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setUsers(d.users ?? []); setLoading(false); })
      .catch(() => { setError('Failed to load staff'); setLoading(false); });
  }, []);

  const createUser = useCallback(async (data) => {
    const r = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    const d = await r.json();
    if (r.ok) setUsers(prev => [...prev, d.user]);
    return { ok: r.ok, data: d };
  }, []);

  const updateUser = useCallback(async (id, data) => {
    const r = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    const d = await r.json();
    if (r.ok) setUsers(prev => prev.map(u => u.id === id ? d.user : u));
    return { ok: r.ok, data: d };
  }, []);

  const deactivateUser = useCallback(async (id) => {
    // No body expected — state updated optimistically from local id
    const r = await fetch(`/api/users/${id}/deactivate`, { method: 'PATCH', credentials: 'include' });
    if (r.ok) setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: 0 } : u));
    return { ok: r.ok };
  }, []);

  const regenerateLink = useCallback(async (id) => {
    const r = await fetch(`/api/users/${id}/regenerate-link`, { method: 'POST', credentials: 'include' });
    const d = await r.json();
    return { ok: r.ok, claimUrl: d.claimUrl };
  }, []);

  return { users, loading, error, createUser, updateUser, deactivateUser, regenerateLink };
}
