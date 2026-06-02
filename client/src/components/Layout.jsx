import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { CalendarDays, ArrowLeftRight, Clock, LayoutDashboard, CalendarCheck, HelpCircle } from 'lucide-react';
import NotificationBell from './NotificationBell';
import InstallBanner from './InstallBanner';
import HelpDrawer from './HelpDrawer';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';

export default function Layout() {
  const { user, logout, restaurantName } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);

  const navItems = [
    { to: '/', label: 'Home', Icon: LayoutDashboard },
    { to: '/schedule', label: 'Schedule', Icon: CalendarDays },
    { to: '/swaps', label: 'Swaps', Icon: ArrowLeftRight },
    { to: '/timeoff', label: 'Time Off', Icon: Clock },
    { to: '/availability', label: 'Availability', Icon: CalendarCheck },
  ];
  const { unreadCount } = useNotifications();

  return (
    <div className="flex flex-col min-h-screen bg-gray-950">
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-base text-gray-100">{restaurantName}</span>
          <span className="text-gray-600">·</span>
          <span className="text-sm text-gray-400">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400 hidden sm:block">{user?.name}</span>
          <NotificationBell unreadCount={unreadCount} />
          <button
            onClick={() => setHelpOpen(true)}
            className="text-gray-500 hover:text-gray-300"
            aria-label="Help"
          >
            <HelpCircle size={20} />
          </button>
          <button
            onClick={logout}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 pb-16 pt-2">
        <Outlet />
      </main>

      <nav className="bg-gray-900 border-t border-gray-800 fixed bottom-0 left-0 right-0 flex z-10">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${
                isActive ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
              }`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <InstallBanner />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
