import { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Scanner from './components/Scanner';
import Backtest from './components/Backtest';
import Watchlist from './components/Watchlist';
import Auth from './components/Auth';
import ErrorBoundary from './components/ErrorBoundary';
import useAuth from './hooks/useAuth';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const TABS = ['dashboard', 'scanner', 'backtest', 'watchlist'];
// Read from package.json so the header badge can't drift from the release
// version again (it sat at v1.0.0 through two releases).
const APP_VERSION = `v${require('../package.json').version}`;

const THEME_KEY = 'alphalab:theme';
const PAGE_WIDTH = 940;

// Every all-caps label in the UI is this. One rule covers most of the chrome.
const labelStyle = {
  fontSize: '10.5px',
  letterSpacing: '0.16em',
  color: 'var(--color-muted)',
};

const getInitialTab = () => {
  const v = new URLSearchParams(window.location.search).get('view');
  return TABS.includes(v) ? v : 'dashboard';
};

const getInitialTheme = () => {
  // index.html has already applied this to <html> before first paint; read the
  // same source here so React's state agrees with what's on screen.
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (e) {
    // Private mode / blocked storage: fall through to the default.
  }
  return 'dark';
};

function ThemeToggle({ theme, onToggle }) {
  const Icon = theme === 'dark' ? Moon : Sun;
  return (
    <button
      onClick={onToggle}
      className="btn-ghost btn-ghost--sm"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      <Icon size={12} strokeWidth={1.5} aria-hidden="true" />
      {theme === 'dark' ? 'DARK' : 'LIGHT'}
    </button>
  );
}

// Sign-in / signed-in control shown in the header.
function AuthStatus({ user }) {
  if (!isSupabaseConfigured) return null;
  if (!user) {
    return <span style={labelStyle}>NOT SIGNED IN</span>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={labelStyle}>{user.email}</span>
      <button onClick={() => supabase.auth.signOut()} className="btn-ghost btn-ghost--sm">
        SIGN OUT
      </button>
    </div>
  );
}

// The watchlist tab requires auth; everything else stays public.
function WatchlistTab({ user, loading }) {
  if (!isSupabaseConfigured) {
    return (
      <p style={{ color: 'var(--color-muted)' }}>
        Supabase isn't configured yet. Set REACT_APP_SUPABASE_URL and
        REACT_APP_SUPABASE_ANON_KEY to enable saved watchlists.
      </p>
    );
  }
  if (loading) {
    return <p style={{ color: 'var(--color-muted)' }}>...</p>;
  }
  if (!user) return <Auth />;
  return <Watchlist user={user} />;
}

function App() {
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [theme, setTheme] = useState(getInitialTheme);
  const { user, loading } = useAuth();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      // Theme still applies for this session; it just won't persist.
    }
  }, [theme]);

  const selectTab = (tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set('view', tab);
    window.history.replaceState(null, '', `?${params.toString()}`);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          maxWidth: PAGE_WIDTH,
          margin: '0 auto',
          padding: '20px 20px 0',
        }}
      >
        <span style={{ fontSize: '13px', letterSpacing: '0.3em', color: 'var(--color-text)' }}>
          ALPHALAB
        </span>
        <span style={{ ...labelStyle, marginRight: 'auto' }}>{APP_VERSION.toUpperCase()}</span>
        <AuthStatus user={user} />
        <ThemeToggle theme={theme} onToggle={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))} />
      </header>

      <nav
        style={{
          display: 'flex',
          maxWidth: PAGE_WIDTH,
          margin: '0 auto',
          padding: '0 20px',
          borderBottom: '1px solid var(--color-divider)',
        }}
      >
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => selectTab(tab)}
            style={{
              padding: '12px 0',
              marginRight: '26px',
              background: 'none',
              border: 0,
              borderBottom: '1px solid transparent',
              borderBottomColor: activeTab === tab ? 'var(--color-accent)' : 'transparent',
              color: activeTab === tab ? 'var(--color-text)' : 'var(--color-muted)',
              fontFamily: 'inherit',
              fontSize: '10.5px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: PAGE_WIDTH, margin: '0 auto', padding: '28px 20px 80px' }}>
        {/* key resets the boundary when switching tabs, so a crash in one
            tab never blocks the others */}
        <ErrorBoundary key={activeTab}>
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'scanner' && <Scanner />}
          {activeTab === 'backtest' && <Backtest user={user} />}
          {activeTab === 'watchlist' && <WatchlistTab user={user} loading={loading} />}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
