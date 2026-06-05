import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Calendar, ArrowLeftRight, Clock, Megaphone, RefreshCw } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';

const TYPE_ICONS = {
  schedule_published: Calendar,
  swap_offered: ArrowLeftRight,
  swap_resolved: ArrowLeftRight,
  timeoff_resolved: Clock,
  availability_resolved: RefreshCw,
  shift_changed: Calendar,
  broadcast: Megaphone,
};

function timeAgo(unixTs) {
  const seconds = Math.floor(Date.now() / 1000) - unixTs;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getDeepLink(data) {
  try {
    const d = typeof data === 'string' ? JSON.parse(data) : data;
    return d?.url ?? null;
  } catch {
    return null;
  }
}

export default function Notifications() {
  const { notifications, unreadCount, loading, markAllRead, clearAll, reload } = useNotifications();
  const navigate = useNavigate();
  useEffect(() => { reload(); }, [reload]);

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800 sticky top-[57px] z-10">
        <h1 className="font-semibold text-gray-100">Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-xs text-blue-400 hover:underline">
            Mark all read
          </button>
        )}
        {unreadCount === 0 && notifications.length > 0 && (
          <button onClick={clearAll} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
            Clear all
          </button>
        )}
      </div>

      {loading && <p className="p-4 text-gray-400">Loading…</p>}

      {!loading && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Bell size={40} />
          <p className="mt-3 text-sm">No notifications yet</p>
        </div>
      )}

      <div className="divide-y divide-gray-700">
        {notifications.map((n) => {
          const Icon = TYPE_ICONS[n.type] || Bell;
          const isUnread = !n.read_at;
          const deepLink = getDeepLink(n.data);
          return (
            <div
              key={n.id}
              onClick={deepLink ? () => navigate(deepLink) : undefined}
              className={`flex gap-3 px-4 py-3 ${isUnread ? 'bg-blue-900/30' : ''} ${deepLink ? 'cursor-pointer hover:bg-gray-700 active:bg-gray-600' : ''}`}
            >
              <div className={`mt-0.5 flex-shrink-0 ${isUnread ? 'text-blue-400' : 'text-gray-500'}`}>
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${isUnread ? 'font-semibold text-gray-100' : 'font-medium text-gray-300'}`}>
                  {n.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                <p className="text-xs text-gray-600 mt-1">{timeAgo(n.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
