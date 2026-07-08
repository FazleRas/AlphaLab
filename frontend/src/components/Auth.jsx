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
      <div className="p-6 rounded" style={{ backgroundColor: '#111118', border: '1px solid #1e1e2e' }}>
        <p className="font-mono text-xs mb-6 tracking-widest" style={{ color: '#6b7280' }}>
          {mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
        </p>

        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="email"
          type="email"
          autoComplete="email"
          className="w-full px-4 py-3 mb-3 font-mono text-sm rounded outline-none"
          style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e', color: '#e2e2e2' }}
        />
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="password"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          className="w-full px-4 py-3 mb-4 font-mono text-sm rounded outline-none"
          style={{ backgroundColor: '#0a0a0f', border: '1px solid #1e1e2e', color: '#e2e2e2' }}
        />

        <button
          onClick={submit}
          disabled={loading}
          className="w-full px-6 py-3 mb-4 font-mono text-sm rounded"
          style={{ backgroundColor: '#2563eb', color: '#fff', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '...' : (mode === 'signin' ? 'SIGN IN' : 'SIGN UP')}
        </button>

        {error && <p className="font-mono text-xs mb-3" style={{ color: '#ff4d6d' }}>{error}</p>}
        {notice && <p className="font-mono text-xs mb-3" style={{ color: '#00c896' }}>{notice}</p>}

        <button
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null); }}
          className="font-mono text-xs"
          style={{ color: '#6b7280' }}
        >
          {mode === 'signin'
            ? "No account? Create one →"
            : '← Have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
