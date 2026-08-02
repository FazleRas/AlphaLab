import { useState } from 'react';
import { supabase } from '../supabaseClient';

// Email + password sign in / sign up form, styled to match the terminal UI.
export default function Auth() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const submit = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    setNotice(null);

    const fn = mode === 'signin'
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });

    const { data, error: authError } = await fn;

    if (authError) {
      setError(authError.message);
    } else if (mode === 'signup' && !data.session) {
      // Email confirmation is on — no session until the user confirms.
      setNotice('Check your email to confirm your account, then sign in.');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-sm mx-auto mt-8">
      <div className="p-6" style={{ border: '1px solid var(--color-divider)' }}>
        <p className="font-mono text-xs mb-6 tracking-widest" style={{ color: 'var(--color-muted)' }}>
          {mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
        </p>

        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="email"
          type="email"
          autoComplete="email"
          className="w-full px-4 py-3 mb-3 font-mono text-sm outline-none"
          style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-divider)', color: 'var(--color-text)' }}
        />
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="password"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          className="w-full px-4 py-3 mb-4 font-mono text-sm outline-none"
          style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-divider)', color: 'var(--color-text)' }}
        />

        <button
          onClick={submit}
          disabled={loading}
          className="w-full px-6 py-3 mb-4 font-mono text-sm"
          style={{ backgroundColor: 'var(--color-accent)', color: '#fff', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '...' : (mode === 'signin' ? 'SIGN IN' : 'SIGN UP')}
        </button>

        {error && <p className="font-mono text-xs mb-3" style={{ color: 'var(--color-neg)' }}>{error}</p>}
        {notice && <p className="font-mono text-xs mb-3" style={{ color: 'var(--color-pos)' }}>{notice}</p>}

        <button
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null); }}
          className="font-mono text-xs"
          style={{ color: 'var(--color-muted)' }}
        >
          {mode === 'signin'
            ? "No account? Create one →"
            : '← Have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
