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

function rowMode(row) {
  if (!row) return 'open';
  if (row.is_blocked) return 'blocked';
  if (row.start_time === '00:00' && row.end_time === '23:59') return 'open';
  return 'hours';
}

function buildEntries(current) {
  return Array.from({ length: 7 }, (_, i) => {
    const row = current.find((c) => c.day_of_week === i);
    const mode = rowMode(row);
    return {
      day_of_week: i,
      mode,
      start_time: mode === 'hours' ? row.start_time : '09:00',
      end_time: mode === 'hours' ? row.end_time : '17:00',
    };
  });
}

function toLocalISO(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getNextMonday() {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return toLocalISO(d);
}

function StateBadge({ mode, start_time, end_time }) {
  if (mode === 'blocked') return <span className="text-xs text-red-400 font-medium">Not available</span>;
  if (mode === 'hours') return <span className="text-xs text-blue-400 font-medium">Only {toDisplayTime(start_time)} – {toDisplayTime(end_time)}</span>;
  return <span className="text-xs text-gray-500">Open</span>;
}

function hasChanged(e, orig) {
  if (e.mode !== orig.mode) return true;
  if (e.mode === 'hours' && (e.start_time !== orig.start_time || e.end_time !== orig.end_time)) return true;
  return false;
}

export default function Availability() {
  const [current, setCurrent] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(getNextMonday);
  const [entries, setEntries] = useState([]);
  const [originalEntries, setOriginalEntries] = useState([]);
  const [expandedDay, setExpandedDay] = useState(null);
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

  function openForm() {
    const built = buildEntries(current);
    setEntries(built);
    setOriginalEntries(built);
    setExpandedDay(null);
    setError('');
    setSuccess('');
    setShowForm(true);
  }

  function setDayMode(i, mode) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, mode } : e)));
    if (mode !== 'hours') setExpandedDay(null);
  }

  function setDayTime(i, field, value) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  }

  function toggleExpand(i) {
    setExpandedDay((prev) => (prev === i ? null : i));
  }

  const changedDays = entries.filter((e, i) => hasChanged(e, originalEntries[i] || e));

  async function handleSubmit() {
    setError('');
    if (changedDays.length === 0) {
      setError('No changes to submit');
      return;
    }
    const apiEntries = changedDays.map((e) => ({
      day_of_week: e.day_of_week,
      is_blocked: e.mode === 'blocked',
      start_time: e.mode === 'hours' ? e.start_time : '00:00',
      end_time: e.mode === 'hours' ? e.end_time : e.mode === 'open' ? '23:59' : '00:00',
    }));
    const res = await fetch('/api/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ entries: apiEntries, effectiveFrom }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || 'Failed to submit');
      return;
    }
    setSuccess('Request submitted — pending manager approval');
    setShowForm(false);
    fetch('/api/availability', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { setCurrent(d.current || []); setHistory(d.history || []); })
      .catch(() => {});
  }

  if (loading) return <p className="p-4 text-gray-400">Loading…</p>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800 sticky top-[57px] z-10">
        <h1 className="font-semibold text-gray-100">Availability</h1>
        {!showForm && (
          <button onClick={openForm} className="text-sm text-blue-400 font-medium">
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
            Tap any day to restrict it. Days left as <span className="text-gray-300">Open</span> mean you can be scheduled any time. Changes require manager approval.
          </p>

          <div>
            <label className="text-xs font-medium text-gray-300 block mb-1">Effective from</label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEffectiveFrom((w) => { const d = new Date(w + 'T00:00:00'); d.setDate(d.getDate() - 7); return toLocalISO(d); })}
                disabled={effectiveFrom <= getNextMonday()}
                className="px-2 py-1.5 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-base leading-none"
              >‹</button>
              <span className="flex-1 text-center text-sm text-gray-100 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                {fmtDate(effectiveFrom)}
              </span>
              <button
                type="button"
                onClick={() => setEffectiveFrom((w) => { const d = new Date(w + 'T00:00:00'); d.setDate(d.getDate() + 7); return toLocalISO(d); })}
                className="px-2 py-1.5 text-gray-400 hover:text-gray-200 text-base leading-none"
              >›</button>
            </div>
          </div>

          <div className="space-y-2">
            {entries.map((e, i) => {
              const changed = hasChanged(e, originalEntries[i] || e);
              const expanded = expandedDay === i;
              return (
                <div
                  key={i}
                  className={`rounded-xl border overflow-hidden transition-colors ${
                    expanded ? 'border-blue-500' : changed ? 'border-blue-800' : 'border-gray-700'
                  } bg-gray-800`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(i)}
                    className="w-full flex items-center justify-between px-3 py-3 hover:bg-gray-700/50 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-100 w-10 text-left">{DAYS[i]}</span>
                    <StateBadge mode={e.mode} start_time={e.start_time} end_time={e.end_time} />
                    <span className="text-gray-500 text-xs ml-2">{expanded ? '▲' : '▼'}</span>
                  </button>

                  {expanded && (
                    <div className="border-t border-gray-700 px-3 py-3 bg-gray-900/40 space-y-3">
                      <div className="flex gap-2">
                        {[
                          { id: 'open', label: 'Open' },
                          { id: 'blocked', label: 'Not available' },
                          { id: 'hours', label: 'Hours only' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setDayMode(i, opt.id)}
                            className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                              e.mode === opt.id
                                ? opt.id === 'blocked'
                                  ? 'border-red-500 bg-red-900/30 text-red-400'
                                  : 'border-blue-500 bg-blue-900/30 text-blue-400'
                                : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {e.mode === 'hours' && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 shrink-0">Only</span>
                          <input
                            type="time"
                            value={e.start_time}
                            onChange={(ev) => setDayTime(i, 'start_time', ev.target.value)}
                            className="bg-gray-800 border border-gray-700 text-gray-100 rounded px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <span className="text-gray-400">–</span>
                          <input
                            type="time"
                            value={e.end_time}
                            onChange={(ev) => setDayTime(i, 'end_time', ev.target.value)}
                            className="bg-gray-800 border border-gray-700 text-gray-100 rounded px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
              disabled={changedDays.length === 0}
              className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Submit{changedDays.length > 0 ? ` (${changedDays.length})` : ''} change{changedDays.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Current Approved Availability
            </p>
            {(() => {
              const restricted = Array.from({ length: 7 }, (_, i) => {
                const row = current.find((c) => c.day_of_week === i);
                return { i, row, mode: rowMode(row) };
              }).filter(({ mode }) => mode !== 'open');
              return restricted.length === 0 ? (
                <p className="text-sm text-gray-400">No restrictions — you may be scheduled any day</p>
              ) : (
                <div className="space-y-1">
                  {restricted.map(({ i, row, mode }) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="font-medium text-gray-100">{DAYS[i]}</span>
                      <StateBadge mode={mode} start_time={row?.start_time} end_time={row?.end_time} />
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

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
            groups.forEach((g) => {
              const statuses = new Set(g.days.map((d) => d.status));
              g.status = statuses.has('pending') ? 'pending' : statuses.has('approved') ? 'approved' : 'denied';
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
                          <span className="font-medium text-gray-100">Effective {fmtDate(g.effectiveFrom)}</span>
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
                                <StateBadge mode={rowMode(d)} start_time={d.start_time} end_time={d.end_time} />
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
