import { useState, useEffect } from 'react';
import { toDisplayTime } from '../components/TimeSelect';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_STYLES = {
  pending: 'bg-yellow-900/30 text-yellow-400',
  approved: 'bg-green-900/30 text-green-400',
  denied: 'bg-red-900/30 text-red-400',
};

function fmtDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildEntriesFromCurrent(current) {
  return Array.from({ length: 7 }, (_, i) => {
    const row = current.find((c) => c.day_of_week === i);
    return row
      ? { day_of_week: i, enabled: true, start_time: row.start_time, end_time: row.end_time }
      : { day_of_week: i, enabled: false, start_time: '09:00', end_time: '17:00' };
  });
}

function getNextMonday() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function Availability() {
  const [current, setCurrent] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(getNextMonday);
  const [entries, setEntries] = useState(
    Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i,
      enabled: false,
      start_time: '09:00',
      end_time: '17:00',
    }))
  );
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  useEffect(() => {
    fetch('/api/availability', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setCurrent(d.current || []);
        setHistory(d.history || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function toggleDay(i) {
    setEntries((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, enabled: !e.enabled } : e))
    );
  }

  function updateTime(i, field, val) {
    setEntries((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, [field]: val } : e))
    );
  }

  async function handleSubmit() {
    setError('');
    const enabled = entries.filter((e) => e.enabled);
    if (enabled.length === 0) {
      setError('Select at least one day');
      return;
    }
    const res = await fetch('/api/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        entries: enabled.map(({ day_of_week, start_time, end_time }) => ({
          day_of_week,
          start_time,
          end_time,
        })),
        effectiveFrom,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || 'Failed to submit');
      return;
    }
    setSuccess('Request submitted — pending manager approval');
    setShowForm(false);
    // Reload
    fetch('/api/availability', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setCurrent(d.current || []);
        setHistory(d.history || []);
      })
      .catch(() => {});
  }

  if (loading) return <p className="p-4 text-gray-400">Loading…</p>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800 sticky top-[57px] z-10">
        <h1 className="font-semibold text-gray-100">Availability</h1>
        {!showForm && (
          <button
            onClick={() => {
              setEntries(buildEntriesFromCurrent(current));
              setShowForm(true);
              setSuccess('');
            }}
            className="text-sm text-blue-400 font-medium"
          >
            Request change
          </button>
        )}
      </div>

      {success && (
        <div className="mx-4 mt-3 rounded-lg bg-green-900/30 border border-green-700 p-3 text-sm text-green-400">
          {success}
        </div>
      )}

      {showForm ? (
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-400">
            Your current availability is pre-filled below — adjust what you want to change. Unchecked days mean you&apos;re not available to be scheduled. Changes require manager approval.
          </p>
          <div>
            <label className="text-xs font-medium text-gray-300 block mb-1">
              Effective from
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEffectiveFrom(w => { const d = new Date(w + 'T00:00:00'); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })}
                disabled={effectiveFrom <= getNextMonday()}
                className="px-2 py-1.5 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-base leading-none"
              >‹</button>
              <span className="flex-1 text-center text-sm text-gray-100 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                {fmtDate(effectiveFrom)}
              </span>
              <button
                type="button"
                onClick={() => setEffectiveFrom(w => { const d = new Date(w + 'T00:00:00'); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })}
                className="px-2 py-1.5 text-gray-400 hover:text-gray-200 text-base leading-none"
              >›</button>
            </div>
          </div>
          <div className="space-y-2">
            {entries.map((e, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3 ${
                  e.enabled
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-gray-700 bg-gray-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={e.enabled}
                    onChange={() => toggleDay(i)}
                    className="w-4 h-4 accent-blue-400"
                  />
                  <span className="text-sm font-medium w-10 text-gray-100">
                    {DAYS[i]}
                  </span>
                  {e.enabled && (
                    <div className="flex items-center gap-2 ml-auto text-sm flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const isAllDay = e.start_time === '00:00' && e.end_time === '23:59';
                          updateTime(i, 'start_time', isAllDay ? '09:00' : '00:00');
                          updateTime(i, 'end_time', isAllDay ? '17:00' : '23:59');
                        }}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          e.start_time === '00:00' && e.end_time === '23:59'
                            ? 'border-blue-400 text-blue-400 bg-blue-900/20'
                            : 'border-gray-600 text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        All day
                      </button>
                      {!(e.start_time === '00:00' && e.end_time === '23:59') && (
                        <>
                          <input
                            type="time"
                            value={e.start_time}
                            onChange={(ev) => updateTime(i, 'start_time', ev.target.value)}
                            className="bg-gray-800 border border-gray-700 text-gray-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <span className="text-gray-400">–</span>
                          <input
                            type="time"
                            value={e.end_time}
                            onChange={(ev) => updateTime(i, 'end_time', ev.target.value)}
                            className="bg-gray-800 border border-gray-700 text-gray-100 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-2 rounded-xl border border-gray-700 text-sm text-gray-400 hover:bg-gray-700 active:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 active:bg-blue-700"
            >
              Submit request
            </button>
          </div>
        </div>
      ) : (
        <div>
          {/* Current pattern */}
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Current Approved Availability
            </p>
            {current.length === 0 ? (
              <p className="text-sm text-gray-400">
                No availability set — you may be scheduled any day
              </p>
            ) : (
              <div className="space-y-1">
                {current.map((row) => (
                  <div
                    key={row.day_of_week}
                    className="flex justify-between text-sm"
                  >
                    <span className="font-medium text-gray-100">
                      {DAYS[row.day_of_week]}
                    </span>
                    <span className="text-gray-500">
                      {row.start_time === '00:00' && row.end_time === '23:59' ? 'All day' : `${toDisplayTime(row.start_time)} – ${toDisplayTime(row.end_time)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (() => {
            const groups = [];
            const seen = {};
            for (const h of history) {
              const key = String(h.created_at);
              if (!seen[key]) {
                seen[key] = { effectiveFrom: h.effective_from, createdAt: h.created_at, days: [] };
                groups.push(seen[key]);
              }
              seen[key].days.push(h);
            }
            groups.forEach(g => {
              const statuses = new Set(g.days.map(d => d.status));
              g.status = statuses.has('pending') ? 'pending'
                : statuses.has('approved') ? 'approved'
                : 'denied';
            });
            return (
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Request History
                </p>
                <div className="space-y-1">
                  {groups.map((g) => {
                    const key = String(g.createdAt);
                    const expanded = expandedGroups.has(key);
                    return (
                      <div key={key} className="rounded-xl border border-gray-700 overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-gray-700 active:bg-gray-600 transition-colors"
                          onClick={() => setExpandedGroups((prev) => {
                            const next = new Set(prev);
                            expanded ? next.delete(key) : next.add(key);
                            return next;
                          })}
                        >
                          <span className="font-medium text-gray-100">
                            Effective {fmtDate(g.effectiveFrom)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[g.status] || 'bg-gray-800 text-gray-400'}`}>
                              {g.status}
                            </span>
                            <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
                          </div>
                        </button>
                        {expanded && (
                          <div className="border-t border-gray-700 px-3 py-2 space-y-1 bg-gray-900/40">
                            {g.days.map((d) => (
                              <div key={d.id} className="flex justify-between text-sm">
                                <span className="text-gray-300">{DAYS[d.day_of_week]}</span>
                                <span className="text-gray-500">
                                  {d.start_time === '00:00' && d.end_time === '23:59'
                                    ? 'All day'
                                    : `${toDisplayTime(d.start_time)} – ${toDisplayTime(d.end_time)}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
