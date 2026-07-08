import { useState } from 'react';
import Dashboard from './components/Dashboard';
import Scanner from './components/Scanner';
import Backtest from './components/Backtest';
import Watchlist from './components/Watchlist';
import Auth from './components/Auth';
import useAuth from './hooks/useAuth';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const TABS = ['dashboard', 'scanner', 'backtest', 'watchlist'];

const getInitialTab = () => {
  const v = new URLSearchParams(window.location.search).get('view');
  return TABS.includes(v) ? v : 'dashboard';
};

// Sign-in / signed-in control shown in the header.
function AuthStatus({ user }) {
  if (!isSupabaseConfigured) return null;
  if (!user) {
    return <span className="font-mono text-xs" style={{ color: '#6b7280' }}>NOT SIGNED IN</span>;
  }
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs" style={{ color: '#6b7280' }}>{user.email}</span>
      <button
        onClick={() => supabase.auth.signOut()}
        className="font-mono text-xs px-3 py-1 rounded"
        style={{ backgroundColor: '#1e1e2e', color: '#6b7280' }}
      >
        SIGN OUT
      </button>
    </div>
  );
}

// The watchlist tab requires auth; everything else stays public.
function WatchlistTab({ user, loading }) {
  if (!isSupabaseConfigured) {
    return (
      <p className="font-mono text-sm max-w-4xl mx-auto" style={{ color: '#6b7280' }}>
        Supabase isn't configured yet. Set REACT_APP_SUPABASE_URL and
        REACT_APP_SUPABASE_ANON_KEY to enable saved watchlists.
      </p>
    );
  }
  if (loading) {
    return <p className="font-mono text-sm max-w-4xl mx-auto" style={{ color: '#6b7280' }}>...</p>;
  }
  if (!user) return <Auth />;
  return <Watchlist user={user} />;
}

function App() {
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const { user, loading } = useAuth();

  const selectTab = (tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set('view', tab);
    window.history.replaceState(null, '', `?${params.toString()}`);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0f', color: '#e2e2e2' }}>
      <div style={{ borderBottom: '1px solid #1e1e2e' }} className="px-8 py-4 flex items-center justify-between">
        <span className="font-mono text-lg tracking-widest" style={{ color: '#2563eb' }}>ALPHALAB</span>
        <AuthStatus user={user} />
      </div>
      <div style={{ borderBottom: '1px solid #1e1e2e' }} className="px-8 flex gap-8">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => selectTab(tab)}
            className="py-3 font-mono text-sm tracking-wider uppercase transition-all"
            style={{
              color: activeTab === tab ? '#2563eb' : '#6b7280',
              borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="px-8 py-6">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'scanner' && <Scanner />}
        {activeTab === 'backtest' && <Backtest />}
        {activeTab === 'watchlist' && <WatchlistTab user={user} loading={loading} />}
      </div>
    </div>
  );
}

export default App;
