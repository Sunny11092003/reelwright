import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { authErrorMessage, useAuth } from '../contexts/AuthContext';
import { firebaseConfigured } from '../config/firebase';

export function Login() {
  const { user, loading, signIn, signUp, google, reset } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  if (!loading && user) return <Navigate to="/" replace />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); } catch (e) { setError(authErrorMessage(e)); } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void run(() => (mode === 'in' ? signIn(email, password) : signUp(email, password))); };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-harbor-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2.5"><svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden><rect width="32" height="32" rx="7" fill="#E9A63A" /><rect x="7" y="9" width="18" height="14" rx="2" fill="none" stroke="#0A1F20" strokeWidth="2" /><path d="M14 13l5 3-5 3z" fill="#0A1F20" /></svg><span className="font-display text-xl font-bold">Reelwright</span></div>
        <div>
          <h1 className="font-display text-5xl font-bold leading-[1.05]">One video in.<br />Three channels out.</h1>
          <p className="mt-5 max-w-md text-harbor-100/80">Upload a video once. Reelwright watches it, researches the keywords, writes separate posts for Instagram, Facebook and your website, and publishes when you approve.</p>
        </div>
        <div className="flex gap-1.5" aria-hidden>{Array.from({ length: 14 }).map((_, i) => <span key={i} className="h-10 w-7 rounded-sm bg-harbor-800" style={{ opacity: 0.35 + (i % 5) * 0.12 }} />)}</div>
      </section>
      <section className="flex items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-2xl font-bold">{mode === 'in' ? 'Sign in' : 'Create your account'}</h2>
          {!firebaseConfigured && <p role="alert" className="mt-4 rounded-lg bg-signal-amberbg p-3 text-sm text-signal-amber">Firebase is not configured. Copy frontend/.env.example to frontend/.env and fill in your Firebase web app values.</p>}
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className="label" htmlFor="password">Password</label><input id="password" type="password" required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
            {info && <p role="status" className="text-sm text-signal-green">{info}</p>}
            <button className="btn-primary w-full" disabled={busy || !firebaseConfigured}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'in' ? 'Sign in' : 'Create account'}</button>
          </form>
          <button className="btn-secondary mt-3 w-full" disabled={busy || !firebaseConfigured} onClick={() => run(google)}>Continue with Google</button>
          <div className="mt-5 flex justify-between text-sm">
            <button className="text-harbor-700 underline" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Create an account' : 'I already have an account'}</button>
            {mode === 'in' && <button className="text-harbor-700 underline" onClick={() => email ? run(async () => { await reset(email); setInfo('Password reset email sent.'); }) : setError('Enter your email first.')}>Forgot password?</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
