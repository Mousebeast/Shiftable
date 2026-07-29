import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ArrowLeftRight, Clock, CalendarCheck, Settings, Wrench, ClipboardList, Users, Layers, Megaphone, BarChart2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

function SetupGuide({ onDismiss }) {
  const steps = [
    {
      Icon: Layers,
      title: 'Create a Group',
      desc: 'Groups are your roles — Servers, Bartenders, Hosts, etc. Tap the Groups tile below and create at least one.',
    },
    {
      Icon: Users,
      title: 'Add Staff',
      desc: 'Add your team members from the Staff tile. Each person gets a link to claim their account and set a PIN.',
    },
    {
      Icon: Layers,
      title: 'Assign Staff to the Group',
      desc: 'Open the Group you created and add your staff to it so the scheduler knows who covers what.',
    },
    {
      Icon: Wrench,
      title: 'Build your first schedule',
      desc: 'Head to Schedule Builder, pick a week, and hit Generate.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-gray-800 border border-gray-700 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-100 mb-1">Welcome to Shiftable</h2>
        <p className="text-sm text-gray-400 mb-5">Here&apos;s how to get started:</p>
        <ol className="space-y-4">
          {steps.map(({ Icon, title, desc }, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {i + 1}
                </span>
                {i < steps.length - 1 && <div className="w-px flex-1 bg-gray-700 mt-1" />}
              </div>
              <div className="pb-1">
                <p className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">
                  <Icon size={13} className="text-blue-400 shrink-0" />
                  {title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
        <button
          onClick={onDismiss}
          className="mt-6 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-colors"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatDateShort(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
}

function NextShiftCard() {
  const [data, setData] = useState(undefined);

  useEffect(() => {
    fetch('/api/schedule/next', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ shift: null, weekHours: 0 }));
  }, []);

  if (data === undefined) {
    return <div className="rounded-2xl bg-gray-800 border border-gray-700 p-4 animate-pulse h-20" />;
  }

  const { shift, weekHours } = data;

  if (!shift) {
    return (
      <div className="rounded-2xl bg-gray-800 border border-gray-700 p-4 text-center text-sm text-gray-400">
        No upcoming shifts scheduled
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl bg-gray-800 border border-gray-700 p-4 h-full"
      style={{ borderLeft: `4px solid ${shift.group_color || '#3b82f6'}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gray-400 mb-1">Next shift</p>
        {weekHours > 0 && (
          <span className="text-xs text-gray-500 shrink-0">{weekHours}h this week</span>
        )}
      </div>
      <p className="font-semibold text-lg text-gray-100 leading-tight">{shift.group_name}</p>
      <p className="text-sm text-gray-400">
        {formatDate(shift.date)} · {formatTime(shift.start_time)} · {shift.hours}h
      </p>
    </div>
  );
}

function OpenShiftsCard({ shifts, onClaim, claiming }) {
  const [idx, setIdx] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [fading, setFading] = useState(false);
  const confirmTimer = useRef(null);
  const dragStartX = useRef(null);
  const pendingIdx = useRef(null);

  const clampedIdx = Math.min(idx, shifts.length - 1);
  const shift = shifts[clampedIdx];

  // Reset confirm when shift changes
  useEffect(() => {
    setConfirming(false);
    clearTimeout(confirmTimer.current);
  }, [clampedIdx]);

  // Fade: swap content at midpoint
  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => {
      setIdx(pendingIdx.current);
      setFading(false);
    }, 120);
    return () => clearTimeout(t);
  }, [fading]);

  if (!shift) return null;

  function navigate(newIdx) {
    if (newIdx < 0 || newIdx >= shifts.length || newIdx === clampedIdx) return;
    pendingIdx.current = newIdx;
    setFading(true);
  }

  function handleDragStart(x) { dragStartX.current = x; }

  function handleDragEnd(x) {
    if (dragStartX.current === null) return;
    const delta = x - dragStartX.current;
    dragStartX.current = null;
    if (Math.abs(delta) < 50) return;
    navigate(delta < 0 ? clampedIdx + 1 : clampedIdx - 1);
  }

  function handleMouseDown(e) {
    e.preventDefault();
    handleDragStart(e.clientX);
    const onUp = (e2) => {
      window.removeEventListener('mouseup', onUp);
      handleDragEnd(e2.clientX);
    };
    window.addEventListener('mouseup', onUp);
  }

  function handleClaimTap() {
    if (claiming) return;
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = setTimeout(() => setConfirming(false), 3000);
    } else {
      clearTimeout(confirmTimer.current);
      setConfirming(false);
      onClaim(shift.id);
    }
  }

  return (
    <div
      className="rounded-2xl bg-gray-800 border border-gray-700 p-4 flex flex-col h-full select-none cursor-grab active:cursor-grabbing"
      style={{ borderLeft: `4px solid ${shift.group_color || '#22c55e'}` }}
      onTouchStart={e => handleDragStart(e.touches[0].clientX)}
      onTouchEnd={e => handleDragEnd(e.changedTouches[0].clientX)}
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-start justify-between mb-1">
        <p className="text-xs text-gray-400">Open shift</p>
        {shifts.length > 1 && (
          <div className="flex items-center gap-1 mt-0.5">
            {shifts.map((_, i) => (
              <span
                key={i}
                className={`rounded-full transition-all duration-150 ${
                  i === clampedIdx ? 'w-2 h-2 bg-white' : 'w-1.5 h-1.5 bg-gray-600'
                }`}
              />
            ))}
          </div>
        )}
      </div>
      <div className={`transition-opacity duration-[120ms] ${fading ? 'opacity-0' : 'opacity-100'}`}>
        <p className="font-semibold text-base text-gray-100 leading-tight">{shift.group_name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatDateShort(shift.date)} · {formatTime(shift.start_time)} · {shift.hours}h
        </p>
        {shift.note && (
          <p className="text-xs text-gray-500 italic mt-1 line-clamp-1">{shift.note}</p>
        )}
      </div>
      <div className="mt-auto pt-3">
        <button
          onClick={handleClaimTap}
          disabled={claiming}
          className={`w-full py-1.5 text-xs font-medium text-white rounded transition-colors disabled:opacity-50 ${
            confirming
              ? 'bg-green-600 hover:bg-green-500'
              : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          {claiming ? '…' : confirming ? 'Confirm claim?' : 'Claim'}
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [openShifts, setOpenShifts] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  useEffect(() => {
    fetch('/api/open-shifts', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setOpenShifts(d.openShifts || []))
      .catch(() => setOpenShifts([]));
  }, []);

  useEffect(() => {
    if (user?.role === 'staff') return;
    fetch('/api/groups', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.groups) && d.groups.length === 0) setShowSetupGuide(true); })
      .catch(() => {});
  }, [user?.role]);

  async function handleClaim(id) {
    if (claiming) return;
    setClaiming(true);
    setClaimResult(null);
    try {
      const r = await fetch(`/api/open-shifts/${id}/claim`, { method: 'POST', credentials: 'include' });
      if (r.ok) {
        setClaimResult('approved');
        const r2 = await fetch('/api/open-shifts', { credentials: 'include' });
        const d2 = await r2.json();
        setOpenShifts(d2.openShifts || []);
      }
    } finally {
      setClaiming(false);
    }
  }

  const tiles = user?.role === 'staff'
    ? [
        { to: '/schedule', label: 'View Schedule', Icon: CalendarDays },
        { to: '/swaps', label: 'Swap Shift', Icon: ArrowLeftRight },
        { to: '/timeoff', label: 'Time Off', Icon: Clock },
        { to: '/availability', label: 'Availability', Icon: CalendarCheck },
      ]
    : [
        { to: '/schedule', label: 'View Schedule', Icon: CalendarDays },
        { to: '/swaps', label: 'Swap Shift', Icon: ArrowLeftRight },
        { to: '/timeoff', label: 'Time Off', Icon: Clock },
        { to: '/availability', label: 'Availability', Icon: CalendarCheck },
        { to: '/builder', label: 'Schedule Builder', Icon: Wrench, mgr: true },
        { to: '/approvals', label: 'Approvals', Icon: ClipboardList, mgr: true },
        { to: '/staff', label: 'Staff', Icon: Users, mgr: true },
        { to: '/groups', label: 'Groups', Icon: Layers, mgr: true },
        { to: '/broadcast', label: 'Broadcast', Icon: Megaphone, mgr: true },
        { to: '/reports', label: 'Reports', Icon: BarChart2, mgr: true },
        ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin', Icon: Settings, mgr: true }] : []),
      ];

  const hasOpenShifts = openShifts && openShifts.length > 0;

  return (
    <>
    {showSetupGuide && <SetupGuide onDismiss={() => setShowSetupGuide(false)} />}
    <div className="max-w-lg mx-auto p-4 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-100">
          Hi, {user?.name?.split(' ')[0]}
        </h2>
        <p className="text-sm text-gray-500">Here&apos;s what&apos;s coming up</p>
      </div>

      <div className={hasOpenShifts ? 'flex gap-3' : undefined}>
        <div className={hasOpenShifts ? 'flex-1 min-w-0' : undefined}>
          <NextShiftCard />
        </div>
        {hasOpenShifts && (
          <div className="flex-1 min-w-0">
            <OpenShiftsCard shifts={openShifts} onClaim={handleClaim} claiming={claiming} />
          </div>
        )}
      </div>

      {claimResult === 'approved' && (
        <div className="rounded-lg px-4 py-2 text-xs font-medium bg-green-900/40 border border-green-700 text-green-400">
          Shift claimed — it&apos;s on your schedule.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {tiles.map(({ to, label, Icon, mgr }) => (
          <Link
            key={to}
            to={to}
            className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-5 border min-h-[96px] transition-colors ${
              mgr
                ? 'bg-indigo-950 border-indigo-800 hover:bg-indigo-900'
                : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
            }`}
          >
            <Icon size={24} className="text-blue-400" />
            <span className="text-sm font-medium text-gray-100 text-center">{label}</span>
          </Link>
        ))}
      </div>
    </div>
    </>
  );
}
