import { useState, useEffect } from 'react';

const STATUS_STYLES = {
  pending: 'bg-yellow-900/30 text-yellow-400',
  approved: 'bg-green-900/30 text-green-400',
  denied: 'bg-red-900/30 text-red-400',
};

function formatRange(start, end) {
  const fmt = (d) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

export default function TimeOff() {
  const [tab, setTab] = useState('request');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function loadRequests() {
    fetch('/api/timeoff', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { setRequests(d.requests || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadRequests(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!startDate || !endDate) { setError('Start and end dates required'); return; }
    if (startDate > endDate) { setError('End date must be on or after start date'); return; }
    setSubmitting(true);
    const res = await fetch('/api/timeoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ startDate, endDate, reason }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || 'Failed to submit');
      return;
    }
    setSuccess('Request submitted!');
    setStartDate('');
    setEndDate('');
    setReason('');
    setTab('history');
    loadRequests();
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center px-4 py-3 border-b border-gray-700 bg-gray-800 sticky top-[57px] z-10">
        <h1 className="font-semibold text-gray-100">Time Off</h1>
      </div>
      {/* Tab bar */}
      <div className="flex border-b border-gray-700 bg-gray-800 sticky top-[101px] z-10">
        {['request', 'history'].map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSuccess(''); setError(''); }}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 capitalize transition-colors ${
              tab === t ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-500'
            }`}
          >
            {t === 'request' ? 'Request' : 'My Requests'}
          </button>
        ))}
      </div>

      {tab === 'request' && (
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {success && (
            <div className="rounded-lg bg-green-900/30 border border-green-700 p-3 text-sm text-green-400">
              {success}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-700 rounded-lg px-3 py-2 text-sm w-full bg-gray-800 text-gray-100"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-1">End date</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-700 rounded-lg px-3 py-2 text-sm w-full bg-gray-800 text-gray-100"
                required
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-300 block mb-1">
              Reason <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="border border-gray-700 rounded-lg px-3 py-2 text-sm w-full resize-none bg-gray-800 text-gray-100"
              placeholder="Vacation, personal day, etc."
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium text-sm disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </form>
      )}

      {tab === 'history' && (
        <div>
          {loading && <p className="p-4 text-gray-400">Loading…</p>}
          {!loading && requests.length === 0 && (
            <p className="p-4 text-sm text-gray-400">No requests yet</p>
          )}
          <div className="divide-y divide-gray-700">
            {requests.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-100">{formatRange(r.start_date, r.end_date)}</p>
                    {r.reason && <p className="text-xs text-gray-500 mt-0.5">{r.reason}</p>}
                    {r.manager_note && (
                      <p className="text-xs text-gray-400 italic mt-0.5">"{r.manager_note}"</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-2 flex-shrink-0 ${STATUS_STYLES[r.status]}`}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
