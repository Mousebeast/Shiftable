import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import PinKeypad from '../components/PinKeypad';

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [restaurantName, setRestaurantName] = useState('Shiftable');
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/admin/settings/public')
      .then((r) => r.json())
      .then((d) => { if (d.restaurantName) setRestaurantName(d.restaurantName); })
      .catch(() => {});
  }, []);

  async function submitPin(pinValue) {
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ pin: pinValue }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Invalid PIN');
      setPin('');
      return;
    }
    login(data.user, data.restaurantName);
    navigate('/', { replace: true });
  }

  function handlePinChange(val) {
    setPin(val);
    if (val.length === 4) {
      submitPin(val);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setResetStatus('');
    await fetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail }),
    });
    setResetStatus('If that email is on file, a reset link is on its way.');
  }

  if (showReset) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-6 bg-gray-950">
        <h1 className="text-2xl font-bold mb-1 text-gray-100">Forgot PIN?</h1>
        <p className="text-gray-400 mb-8 text-sm text-center">
          Enter your email and we'll send a reset link.
        </p>
        {resetStatus ? (
          <p className="text-green-400 text-sm text-center mb-6">{resetStatus}</p>
        ) : (
          <form onSubmit={handleReset} className="w-full space-y-3">
            <input
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 active:bg-blue-700"
            >
              Send reset link
            </button>
          </form>
        )}
        <button
          onClick={() => { setShowReset(false); setResetEmail(''); setResetStatus(''); }}
          className="mt-6 text-xs text-gray-500 underline"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-6 bg-gray-950">
      <h1 className="text-3xl font-bold mb-1 text-gray-100">{restaurantName}</h1>
      <p className="text-gray-400 mb-8 text-sm">Enter your PIN to sign in</p>
      {error && (
        <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
      )}
      <PinKeypad value={pin} onChange={handlePinChange} />
      <button
        onClick={() => setShowReset(true)}
        className="mt-8 text-xs text-gray-500 underline"
      >
        Forgot PIN?
      </button>
    </div>
  );
}
