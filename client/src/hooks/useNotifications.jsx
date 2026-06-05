import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch('/api/notifications', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setNotifications(d.notifications || []);
        setUnreadCount(d.unreadCount || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const markAllRead = useCallback(async () => {
    await fetch('/api/notifications/read-all', { method: 'PATCH', credentials: 'include' });
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: Math.floor(Date.now() / 1000) })));
  }, []);

  const clearAll = useCallback(async () => {
    await fetch('/api/notifications', { method: 'DELETE', credentials: 'include' });
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, loading, markAllRead, clearAll, reload: load }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be inside NotificationsProvider');
  return ctx;
}
