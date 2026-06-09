import { createContext, useContext, useEffect, useState } from 'react';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined=loading, null=logged out
  const [loading, setLoading] = useState(true);
  const [restaurantName, setRestaurantName] = useState('Shiftable');

  useEffect(() => {
    // Intercept all fetch calls: any 401 on a non-auth endpoint means the
    // JWT expired mid-session — clear user state so ProtectedRoute redirects.
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? '');
        if (!url.includes('/api/auth/')) {
          setUser(null);
        }
      }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setUser(data?.user ?? null);
        if (data?.restaurantName) setRestaurantName(data.restaurantName);
        document.title = data?.restaurantName || 'Shiftable';
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, []);

  const login = (userData, name) => {
    setUser(userData);
    if (name) setRestaurantName(name);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'DELETE', credentials: 'include' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, restaurantName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
