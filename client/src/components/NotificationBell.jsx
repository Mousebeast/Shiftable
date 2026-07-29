import { Bell } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export default function NotificationBell({ unreadCount = 0 }) {
  return (
    <NavLink to="/notifications" className="relative p-1">
      <Bell size={20} className="text-gray-400" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </NavLink>
  );
}
