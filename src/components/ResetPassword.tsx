import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import rbLogo from '../assets/rb-logo-hat.webp';
import { Loader2, CheckCircle2 } from 'lucide-react';

export function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError(null);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <img src={rbLogo} alt="RecipeBytes" className="w-9 h-9 object-contain" />
          <span className="font-display text-[20px] font-semibold text-stone-900">RecipeBytes</span>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-7">
          {done ? (
            <div className="text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <h1 className="font-display text-[22px] font-semibold text-stone-900 mb-2">Password updated</h1>
              <p className="text-[14px] text-stone-500 mb-5">You can now sign in with your new password.</p>
              <a href="/" className="inline-block px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-[13px] font-medium rounded-lg">Go to sign in</a>
            </div>
          ) : !token ? (
            <div className="text-center">
              <h1 className="font-display text-[22px] font-semibold text-stone-900 mb-2">Invalid link</h1>
              <p className="text-[14px] text-stone-500 mb-5">This reset link is missing or malformed. Request a new one from the sign-in page.</p>
              <a href="/" className="text-[13px] font-medium text-accent-700 hover:underline">Back to sign in</a>
            </div>
          ) : (
            <>
              <h1 className="font-display text-[22px] font-semibold text-stone-900 mb-1">Choose a new password</h1>
              <p className="text-[14px] text-stone-500 mb-5">Enter a new password for your account.</p>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                className="w-full px-3.5 py-2.5 text-[14px] bg-stone-50 border border-stone-200 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
              />
              <input
                type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                placeholder="Confirm new password"
                className="w-full px-3.5 py-2.5 text-[14px] bg-stone-50 border border-stone-200 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
              />
              {error && <div className="mb-3 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
              <button
                onClick={submit} disabled={busy}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white text-[13px] font-medium rounded-lg"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {busy ? 'Updating…' : 'Update password'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
