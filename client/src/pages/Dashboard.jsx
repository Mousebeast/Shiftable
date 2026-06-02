import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ArrowLeftRight, Clock, Settings, Wrench, ClipboardList, Users, Layers, Megaphone } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
}

function NextShiftCard() {
  const [shift, setShift] = useState(undefined); // undefined = loading, null = no shift

  useEffect(() => {
    fetch('/api/schedule/next', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setShift(d.shift))
      .catch(() => setShift(null));
  }, []);

  if (shift === undefined) {
    return (
      <div className="rounded-2xl bg-gray-800 border border-gray-700 p-4 animate-pulse h-20" />
    );
  }
  if (!shift) {
    return (
      <div className="rounded-2xl bg-gray-800 border border-gray-700 p-4 text-center text-sm text-gray-400">
        No upcoming shifts scheduled
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl bg-gray-800 border border-gray-700 p-4"
      style={{ borderLeft: `4px solid ${shift.group_color || '#3b82f6'}` }}
    >
      <p className="text-xs text-gray-400 mb-1">Next shift</p>
      <p className="font-semibold text-lg text-gray-100">{shift.group_name}</p>
      <p className="text-sm text-gray-400">
        {formatDate(shift.date)} · {formatTime(shift.start_time)} · {shift.hours}h
      </p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();

  const tiles = user?.role === 'staff'
    ? [
        { to: '/schedule', label: 'View Schedule', Icon: CalendarDays },
        { to: '/swaps', label: 'Swap Shift', Icon: ArrowLeftRight },
        { to: '/timeoff', label: 'Time Off', Icon: Clock },
        { to: '/availability', label: 'Availability', Icon: Settings },
      ]
    : [
        { to: '/schedule', label: 'View Schedule', Icon: CalendarDays },
        { to: '/swaps', label: 'Swap Shift', Icon: ArrowLeftRight },
        { to: '/timeoff', label: 'Time Off', Icon: Clock },
        { to: '/availability', label: 'Availability', Icon: Settings },
        { to: '/builder', label: 'Schedule Builder', Icon: Wrench, mgr: true },
        { to: '/approvals', label: 'Approvals', Icon: ClipboardList, mgr: true },
        { to: '/staff', label: 'Staff', Icon: Users, mgr: true },
        { to: '/groups', label: 'Groups', Icon: Layers, mgr: true },
        { to: '/broadcast', label: 'Broadcast', Icon: Megaphone, mgr: true },
        ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin', Icon: Settings, mgr: true }] : []),
      ];

  return (
    <div className="max-w-lg mx-auto p-4 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-100">
          Hi, {user?.name?.split(' ')[0]}
        </h2>
        <p className="text-sm text-gray-500">Here&apos;s what&apos;s coming up</p>
      </div>

      <NextShiftCard />

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
  );
}
