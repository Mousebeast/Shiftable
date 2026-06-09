import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isStandalone() {
  return (
    navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export default function InstallBanner() {
  const { restaurantName } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || sessionStorage.getItem('installDismissed')) return;
    if (isIOS()) {
      setShowIOSBanner(true);
      return;
    }
    function handler(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    sessionStorage.setItem('installDismissed', '1');
    setShowIOSBanner(false);
    setDeferredPrompt(null);
    setDismissed(true);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === 'accepted') setDismissed(true);
  }

  if (dismissed) return null;

  if (showIOSBanner) {
    return (
      <div className="fixed bottom-16 left-0 right-0 z-40 bg-gray-800 border-t border-gray-700 p-4 flex items-start gap-3">
        <p className="flex-1 text-sm text-gray-200">
          Install {restaurantName}: tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.
        </p>
        <button onClick={dismiss} className="text-gray-400 hover:text-gray-200 text-xl leading-none">×</button>
      </div>
    );
  }

  if (deferredPrompt) {
    return (
      <div className="fixed bottom-16 left-0 right-0 z-40 bg-gray-800 border-t border-gray-700 p-4 flex items-center gap-3">
        <p className="flex-1 text-sm text-gray-200">Add {restaurantName} to your home screen for the best experience.</p>
        <button
          onClick={handleInstall}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded"
        >
          Install
        </button>
        <button onClick={dismiss} className="text-gray-400 hover:text-gray-200 text-xl leading-none">×</button>
      </div>
    );
  }

  return null;
}
