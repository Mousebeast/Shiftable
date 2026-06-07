import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Broadcast() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({ groupId: '', title: '', body: '' });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/groups', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setGroups(d.groups || []))
      .catch(() => {});
  }, []);

  if (user?.role === 'staff') return <Navigate to="/" replace />;

  async function handleSend(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    setResult(null);
    try {
      const body = {
        title: form.title,
        body: form.body,
        ...(form.groupId ? { groupId: Number(form.groupId) } : {}),
      };
      const r = await fetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok) {
        setResult(d);
        setForm(p => ({ ...p, title: '', body: '' }));
      } else {
        setError(d.error || 'Failed to send broadcast');
      }
    } catch {
      setError('Failed to send broadcast');
    }
    setSending(false);
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <div className="sticky top-[57px] z-10 bg-gray-950 pb-2">
        <h2 className="text-lg font-bold text-gray-100">Broadcast Message</h2>
        <p className="text-xs text-gray-500">Push a notification to all staff or a specific group</p>
      </div>

      <form onSubmit={handleSend} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Recipient</label>
          <select
            value={form.groupId}
            onChange={e => setForm(p => ({ ...p, groupId: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
          >
            <option value="">All Staff</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Title</label>
          <input
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            maxLength={80}
            required
            placeholder="e.g. Staff meeting tonight"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Message</label>
          <textarea
            value={form.body}
            onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
            required
            rows={4}
            placeholder="Write your message here…"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 resize-none"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {result && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-3">
            <p className="text-sm text-green-400">
              Sent to {result.sent} staff member{result.sent !== 1 ? 's' : ''}.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={sending}
          className="w-full py-2.5 text-sm font-medium bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
