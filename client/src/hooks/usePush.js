import { useState, useEffect, useCallback } from 'react';

/* global Buffer -- deliberate: the atob path below falls back to Buffer for
   non-browser environments (the test runner). Both branches are guarded, so
   Buffer is never reached in a browser. */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  let raw;
  if (typeof atob === 'function') {
    try {
      raw = atob(base64);
    } catch {
      // fallback for non-browser environments (e.g., test runners)
      raw = Buffer.from(base64, 'base64').toString('binary');
    }
  } else {
    raw = Buffer.from(base64, 'base64').toString('binary');
  }
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function usePush() {
  const isSupported = typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState('default');

  useEffect(() => {
    if (!isSupported) return;
    let cancelled = false;
    setPermission(Notification.permission);
    navigator.serviceWorker.ready.then(sw => {
      sw.pushManager.getSubscription().then(sub => {
        if (!cancelled) setIsSubscribed(!!sub);
      });
    });
    return () => { cancelled = true; };
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) return { ok: false, error: 'Push not supported' };
    try {
      const keyRes = await fetch('/api/push/vapid-key', { credentials: 'include' });
      const { publicKey } = await keyRes.json();
      const sw = await navigator.serviceWorker.ready;
      const sub = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const r = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(sub),
      });
      if (r.ok) setIsSubscribed(true);
      return { ok: r.ok };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    try {
      const sw = await navigator.serviceWorker.ready;
      const sub = await sw.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      setIsSubscribed(false);
    } catch {
      // best effort
    }
  }, [isSupported]);

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe };
}
