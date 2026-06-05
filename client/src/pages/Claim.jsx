import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import PinKeypad from '../components/PinKeypad';

export default function Claim() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [step, setStep] = useState('set'); // 'set' | 'confirm'
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
    navigate('/', { replace: true });
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
