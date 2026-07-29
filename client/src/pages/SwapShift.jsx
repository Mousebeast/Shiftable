import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getWeekStartOf } from '../lib/week';

const STATUS_LABELS = {
  open:             { label: 'Open',           style: 'bg-blue-900/30 text-blue-400' },
  claimed:          { label: 'Claimed',         style: 'bg-yellow-900/30 text-yellow-400' },
  auto_approved:    { label: 'Approved',        style: 'bg-green-900/30 text-green-400' },
  pending_manager:  { label: 'Pending review',  style: 'bg-orange-900/30 text-orange-400' },
  manager_approved: { label: 'Approved',        style: 'bg-green-900/30 text-green-400' },
  denied:           { label: 'Denied',          style: 'bg-red-900/30 text-red-400' },
  cancelled:        { label: 'Cancelled',       style: 'bg-gray-800 text-gray-500' },
};

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}
function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export default function SwapShift() {
  const { user } = useAuth();
  const [tab, setTab] = useState('available');
  const [open, setOpen] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(() => {
    fetch('/api/swaps', { credentials: 'include' })
      .then(r => r.json())
      .then(swapData => {
        setOpen(swapData.open || []);
        setMine(swapData.mine || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleClaim(swapId) {
    setError('');
    const res = await fetch(`/api/swaps/${swapId}/claim`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Failed to claim'); return; }
    setSuccess(
      data.status === 'auto_approved'
        ? 'Swap approved automatically!'
        : 'Swap claimed — pending manager approval'
    );
    load();
  }

  async function handleCancel(swapId) {
    setError('');
    const res = await fetch(`/api/swaps/${swapId}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to cancel swap');
      return;
    }
    load();
  }

  const [offerMode, setOfferMode] = useState(false);
  const [upcomingShifts, setUpcomingShifts] = useState([]);

  async function loadUpcomingShifts() {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const thisWeekStart = getWeekStartOf(now);
    const weeks = [0, 1, 2].map(n => {
      const d = new Date(thisWeekStart + 'T00:00:00');
      d.setDate(d.getDate() + n * 7);
      return getWeekStartOf(d);
    });
    const results = await Promise.all(
      weeks.map(w => fetch(`/api/schedule?week=${w}`, { credentials: 'include' }).then(r => r.json()))
    );
    const shifts = results
      .flatMap(data => data.shifts || [])
      .filter(s => s.user_id === user.id && s.date >= today);
    setUpcomingShifts(shifts);
    setOfferMode(true);
  }

  async function handleOffer(shiftId) {
    setError('');
    const res = await fetch('/api/swaps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ shiftId }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Failed to offer shift'); return; }
    setSuccess('Shift offered for swap!');
    setOfferMode(false);
    load();
  }

  if (loading) return <p className="p-4 text-gray-400">Loading…</p>;

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800 sticky top-[57px] z-10">
        <h1 className="font-semibold">Shift Swaps</h1>
        {!offerMode && (
          <button
            onClick={loadUpcomingShifts}
            className="text-sm text-blue-400 font-medium"
          >
            Offer a shift
          </button>
        )}
      </div>

      {offerMode ? (
        /* Offer mode: pick a shift to offer */
        <div className="p-4">
          {error && (
            <div className="mb-3 rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          <p className="text-sm text-gray-300 mb-3">Which shift do you want to offer?</p>
          {upcomingShifts.length === 0 && (
            <p className="text-sm text-gray-400">No upcoming shifts found.</p>
          )}
          <div className="space-y-2">
            {upcomingShifts.map((s) => (
              <button
                key={s.id}
                onClick={() => handleOffer(s.id)}
                className="w-full text-left rounded-xl border border-gray-700 p-3 hover:bg-gray-700 active:bg-gray-600"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.group_color }} />
                  <span className="text-sm font-medium">{s.group_name}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {formatDate(s.date)} · {formatTime(s.start_time)} · {s.hours}h
                </p>
              </button>
            ))}
          </div>
          <button
            onClick={() => setOfferMode(false)}
            className="mt-4 w-full py-2 rounded-xl border border-gray-700 text-sm text-gray-400"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex border-b border-gray-700 bg-gray-800">
            {[['available', 'Available'], ['mine', 'My Offers']].map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-500'
                }`}
              >
                {label}
                {t === 'available' && open.length > 0 && (
                  <span className="ml-1.5 bg-blue-900/40 text-blue-400 text-xs rounded-full px-1.5">
                    {open.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Feedback banners */}
          {success && (
            <div className="mx-4 mt-3 rounded-lg bg-green-900/30 border border-green-700 p-3 text-sm text-green-400">
              {success}
            </div>
          )}
          {error && (
            <div className="mx-4 mt-3 rounded-lg bg-red-900/30 border border-red-700 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Available swaps tab */}
          {tab === 'available' && (
            <div className="divide-y divide-gray-700">
              {open.length === 0 && (
                <div className="flex flex-col items-center py-12 text-gray-500">
                  <ArrowLeftRight size={36} />
                  <p className="mt-3 text-sm">No open swaps in your group</p>
                </div>
              )}
              {open.map((sw) => (
                <div key={sw.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{sw.group_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDate(sw.date)} · {formatTime(sw.start_time)} · {sw.hours}h
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Offered by {sw.requester_name}
                      </p>
                    </div>
                    <button
                      onClick={() => handleClaim(sw.id)}
                      className="flex-shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-medium"
                    >
                      Claim
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* My offers tab */}
          {tab === 'mine' && (
            <div className="divide-y divide-gray-700">
              {mine.length === 0 && (
                <p className="p-4 text-sm text-gray-400">No swap offers yet</p>
              )}
              {mine.map((sw) => {
                const st = STATUS_LABELS[sw.status] || { label: sw.status, style: 'bg-gray-800 text-gray-500' };
                return (
                  <div key={sw.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{sw.group_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatDate(sw.date)} · {formatTime(sw.start_time)} · {sw.hours}h
                        </p>
                        {sw.claimer_name && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Claimed by {sw.claimer_name}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.style}`}>
                          {st.label}
                        </span>
                        {sw.status === 'open' && (
                          <button
                            onClick={() => handleCancel(sw.id)}
                            className="text-xs text-red-400 hover:underline"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
