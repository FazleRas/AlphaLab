import { useState, useEffect, useCallback } from 'react';
import { Moon, Sun } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Scanner from './components/Scanner';
import Backtest from './components/Backtest';
import Watchlist from './components/Watchlist';
import Auth from './components/Auth';
import ErrorBoundary from './components/ErrorBoundary';
import Logo from './components/Logo';
import Tape from './components/Tape';
import Palette from './components/Palette';
import useRecentTickers from './hooks/useRecentTickers';
import { inField } from './nav';
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
    return <span className="sm-hide" style={labelStyle}>NOT SIGNED IN</span>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span className="sm-hide" style={labelStyle}>{user.email}</span>
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
  // Bumped when a tab is asked to reload with new params while already open.
  const [viewKey, setViewKey] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { user, loading } = useAuth();
  const [recent] = useRecentTickers();
  const toggleTheme = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      // Theme still applies for this session; it just won't persist.
    }
  }, [theme]);

  const selectTab = useCallback((tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set('view', tab);
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, []);

  // goTo() in nav.js has already written the query string; switch tabs and
  // remount so the target reads it even when it is the current tab.
  useEffect(() => {
    const onView = (e) => {
      if (TABS.includes(e.detail)) setActiveTab(e.detail);
      setViewKey(k => k + 1);
    };
    window.addEventListener('alphalab:view', onView);
    return () => window.removeEventListener('alphalab:view', onView);
  }, []);

  // Global keys. Anything typed into a field stays in the field; the palette
  // handles its own keys while open.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
        return;
      }
      if (paletteOpen || inField(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector('[data-search]')?.focus();
      } else if (e.key >= '1' && e.key <= '4') {
        selectTab(TABS[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, selectTab]);

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
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--color-text)',
          }}
        >
          <Logo size={20} />
          <span style={{ fontSize: '13px', letterSpacing: '0.3em' }}>ALPHALAB</span>
        </span>
        <span className="sm-hide" style={labelStyle}>{APP_VERSION.toUpperCase()}</span>
        <span style={{ marginRight: 'auto' }} />
        <AuthStatus user={user} />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      <nav
        className="nav"
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
            className="nav__tab"
            style={{
              padding: '12px 0',
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

      <div style={{ maxWidth: PAGE_WIDTH, margin: '0 auto', padding: '0 20px' }}>
        <Tape />
      </div>

      <main style={{ maxWidth: PAGE_WIDTH, margin: '0 auto', padding: '28px 20px 80px' }}>
        {/* key resets the boundary when switching tabs, so a crash in one
            tab never blocks the others */}
        <ErrorBoundary key={`${activeTab}:${viewKey}`}>
          <div className="fade-up">
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'scanner' && <Scanner />}
            {activeTab === 'backtest' && <Backtest user={user} />}
            {activeTab === 'watchlist' && <WatchlistTab user={user} loading={loading} />}
          </div>
        </ErrorBoundary>
      </main>

      <Palette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectTab={selectTab}
        onToggleTheme={toggleTheme}
        recent={recent}
      />
    </div>
  );
}

export default App;
