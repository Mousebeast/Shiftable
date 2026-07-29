import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import PinKeypad from '../components/PinKeypad';

function isStandalone() {
  return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function isAndroid() {
  return /Android/.test(navigator.userAgent);
}

function openInChrome() {
  const origin = window.location.origin;
  const host = window.location.host;
  window.location.href = `intent://${host}/#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(origin + '/')};end`;
}

export default function Claim() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [step, setStep] = useState('set'); // 'set' | 'confirm' | 'install'
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState('');
  const { login, restaurantName } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) navigate('/login', { replace: true });
  }, [token, navigate]);

  function handleSetPin(val) {
    setPin(val);
    if (val.length === 4) {
      setFirstPin(val);
      setPin('');
      setStep('confirm');
    }
  }

  async function handleConfirmPin(val) {
    setPin(val);
    if (val.length < firstPin.length) return;
    if (val !== firstPin) {
      setError('PINs do not match — try again');
      setPin('');
      setStep('set');
      setFirstPin('');
      return;
    }
    setError('');
    const res = await fetch('/api/auth/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, pin: val }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Claim failed');
      setPin('');
      setStep('set');
      setFirstPin('');
      return;
    }
    login(data.user);
    if (isStandalone()) {
      navigate('/', { replace: true });
      return;
    }
    if (window.__installPrompt) {
      const prompt = window.__installPrompt;
      window.__installPrompt = null;
      prompt.prompt();
      prompt.userChoice.then(({ outcome }) => {
        setStep(outcome === 'accepted' ? 'installed' : 'install');
      });
    } else {
      setStep('install');
    }
  }

  if (step === 'installed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-6 bg-gray-950">
        <div className="text-5xl mb-4">✓</div>
        <h1 className="text-2xl font-bold mb-2 text-gray-100">You're all set!</h1>
        {isAndroid() ? (
          <>
            <p className="text-gray-400 mb-6 text-sm text-center">Open the app from your home screen, or tap below to open it now in Chrome.</p>
            <button onClick={openInChrome} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-5 py-2.5 rounded-lg mb-4">
              Open in Chrome
            </button>
          </>
        ) : (
          <p className="text-gray-400 mb-8 text-sm text-center">Go to your home screen and tap the {restaurantName} icon to open it.</p>
        )}
        <button onClick={() => navigate('/', { replace: true })} className="text-blue-400 text-sm underline">
          Continue in browser instead
        </button>
      </div>
    );
  }

  if (step === 'install') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-6 bg-gray-950">
        <h1 className="text-2xl font-bold mb-2 text-gray-100">You're all set!</h1>
        <p className="text-gray-400 mb-6 text-sm text-center">Install the app for the best experience.</p>
        {isAndroid() ? (
          <>
            <p className="text-gray-400 mb-4 text-xs text-center">For a proper install, open the app in Chrome first.</p>
            <button onClick={openInChrome} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-5 py-2.5 rounded-lg mb-6">
              Open in Chrome to Install
            </button>
          </>
        ) : (
          <div className="bg-gray-800 rounded-xl p-5 max-w-xs w-full text-sm text-gray-300 mb-6 space-y-3">
            <p className="font-medium text-gray-100">Add to Home Screen</p>
            <p><span className="text-gray-400">iPhone:</span> tap <strong>Share</strong> (↑) → <strong>Add to Home Screen</strong></p>
          </div>
        )}
        <button onClick={() => navigate('/', { replace: true })} className="text-blue-400 text-sm underline">
          Skip, open in browser
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-6 bg-gray-950">
      <h1 className="text-2xl font-bold mb-1 text-gray-100">Welcome to {restaurantName}</h1>
      {step === 'set' ? (
        <p className="text-gray-400 mb-8 text-sm">Choose a 4-digit PIN</p>
      ) : (
        <p className="text-gray-400 mb-8 text-sm">Confirm your PIN</p>
      )}
      {error && (
        <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
      )}
      <PinKeypad
        value={pin}
        onChange={step === 'set' ? handleSetPin : handleConfirmPin}
        maxLength={4}
      />
    </div>
  );
}
