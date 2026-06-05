import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useApprovals } from '../hooks/useApprovals';

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function TimeOffCard({ item, onApprove, onDeny, processing }) {
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [conflicts, setConflicts] = useState(null);
  const approving = processing.has(`timeoff-${item.id}`);
  const denying = processing.has(`timeoff-deny-${item.id}`);

  const handleApprove = async (force = false) => {
    const result = await onApprove(item.id, note, force);
    if (result?.conflicts) {
      setConflicts(result.conflicts);
    } else {
      setConflicts(null);
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-100">{item.user_name}</p>
        <p className="text-xs text-gray-400">
          {formatDate(item.start_date)} – {formatDate(item.end_date)}
        </p>
        {item.reason && (
          <p className="text-xs text-gray-400 mt-1 italic">"{item.reason}"</p>
        )}
      </div>
      {conflicts && (
        <div className="bg-yellow-950 border border-yellow-700 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-yellow-400">Already scheduled on these days:</p>
          <div className="space-y-1">
            {conflicts.map((c, i) => (
              <p key={i} className="text-xs text-yellow-300">
                {formatDate(c.date)} — {c.group_name} @ {formatTime(c.start_time)} ({c.hours}h)
              </p>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => handleApprove(true)}
              disabled={approving}
              className="flex-1 py-2 text-xs font-medium bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {approving ? '…' : 'Approve Anyway'}
            </button>
            <button
              onClick={() => setConflicts(null)}
              className="flex-1 py-2 text-xs text-gray-400 border border-gray-600 rounded-lg hover:border-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {showNote && (
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Manager note (optional)"
          className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-gray-100 placeholder-gray-500 resize-none"
          rows={2}
        />
      )}
      {!conflicts && (
        <div className="flex gap-2">
          <button
            onClick={() => handleApprove(false)}
            disabled={approving || denying}
            className="flex-1 py-2 text-xs font-medium bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {approving ? '…' : 'Approve'}
          </button>
          <button
            onClick={() => setShowNote(s => !s)}
            className="px-3 py-2 text-xs text-gray-400 border border-gray-600 rounded-lg hover:border-gray-400 transition-colors"
          >
            {showNote ? 'Hide Note' : 'Note'}
          </button>
          <button
            onClick={() => onDeny(item.id, note)}
            disabled={approving || denying}
            className="flex-1 py-2 text-xs font-medium bg-red-900 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {denying ? '…' : 'Deny'}
          </button>
        </div>
      )}
    </div>
  );
}

function AvailabilityCard({ group, onApprove, onDeny, processing }) {
  const approving = processing.has(`avail-${group.key}`);
  const denying = processing.has(`avail-deny-${group.key}`);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-100">{group.user_name}</p>
        <p className="text-xs text-gray-400">Effective {formatDate(group.effective_from)}</p>
      </div>
      <div className="space-y-1">
        {group.rows
          .slice()
          .sort((a, b) => a.day_of_week - b.day_of_week)
          .map(row => (
            <p key={row.id} className="text-xs text-gray-300">
              {DAY_NAMES[row.day_of_week]}: {row.is_blocked ? 'Not available' : `${formatTime(row.start_time)}–${formatTime(row.end_time)}`}
            </p>
          ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onApprove(group)}
          disabled={approving || denying}
          className="flex-1 py-2 text-xs font-medium bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {approving ? '…' : 'Approve All'}
        </button>
        <button
          onClick={() => onDeny(group)}
          disabled={approving || denying}
          className="flex-1 py-2 text-xs font-medium bg-red-900 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {denying ? '…' : 'Deny All'}
        </button>
      </div>
    </div>
  );
}

function SwapCard({ swap, onApprove, onDeny, processing }) {
  const approving = processing.has(`swap-${swap.id}`);
  const denying = processing.has(`swap-deny-${swap.id}`);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-100">
          {swap.requester_name} → {swap.claimer_name}
        </p>
        <p className="text-xs text-gray-400">
          {swap.group_name} · {formatDate(swap.date)} @ {formatTime(swap.start_time)} ({swap.hours}h)
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onApprove(swap.id)}
          disabled={approving || denying}
          className="flex-1 py-2 text-xs font-medium bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {approving ? '…' : 'Approve'}
        </button>
        <button
          onClick={() => onDeny(swap.id)}
          disabled={approving || denying}
          className="flex-1 py-2 text-xs font-medium bg-red-900 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {denying ? '…' : 'Deny'}
        </button>
      </div>
    </div>
  );
}

export default function Approvals() {
  const { user } = useAuth();
  const {
    pending, loading, processing,
    approveTimeOff, denyTimeOff,
    approveAvailabilityGroup, denyAvailabilityGroup,
    approveSwap, denySwap,
  } = useApprovals();

  if (user?.role === 'staff') return <Navigate to="/" replace />;

  const totalCount = pending.timeoff.length + pending.availabilityGroups.length + pending.swaps.length;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <div className="sticky top-[57px] z-10 bg-gray-950 pb-2">
        <h2 className="text-lg font-bold text-gray-100">Pending Approvals</h2>
        {!loading && (
          <p className="text-xs text-gray-500">
            {totalCount === 0 ? 'Nothing to review' : `${totalCount} item${totalCount !== 1 ? 's' : ''} need review`}
          </p>
        )}
      </div>

      {loading ? (
        <p className="p-4 text-gray-400 text-sm">Loading…</p>
      ) : totalCount === 0 ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-gray-400 text-sm">All caught up!</p>
          <p className="text-gray-500 text-xs">No pending requests.</p>
        </div>
      ) : (
        <>
          {pending.timeoff.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Time-off requests ({pending.timeoff.length})
              </h3>
              {pending.timeoff.map(item => (
                <TimeOffCard
                  key={item.id}
                  item={item}
                  onApprove={approveTimeOff}
                  onDeny={denyTimeOff}
                  processing={processing}
                />
              ))}
            </section>
          )}

          {pending.availabilityGroups.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Availability changes ({pending.availabilityGroups.length})
              </h3>
              {pending.availabilityGroups.map(group => (
                <AvailabilityCard
                  key={group.key}
                  group={group}
                  onApprove={approveAvailabilityGroup}
                  onDeny={denyAvailabilityGroup}
                  processing={processing}
                />
              ))}
            </section>
          )}

          {pending.swaps.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Shift swaps ({pending.swaps.length})
              </h3>
              {pending.swaps.map(swap => (
                <SwapCard
                  key={swap.id}
                  swap={swap}
                  onApprove={approveSwap}
                  onDeny={denySwap}
                  processing={processing}
                />
              ))}
            </section>
          )}

        </>
      )}
    </div>
  );
}
