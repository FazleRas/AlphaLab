import { useState } from 'react';
import Dashboard from './components/Dashboard';
import Scanner from './components/Scanner';
import Backtest from './components/Backtest';

const TABS = ['dashboard', 'scanner', 'backtest'];

const getInitialTab = () => {
  const v = new URLSearchParams(window.location.search).get('view');
  return TABS.includes(v) ? v : 'dashboard';
};

function App() {
  const [activeTab, setActiveTab] = useState(getInitialTab);

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
        <span className="font-mono text-xs" style={{ color: '#6b7280' }}>MARKET INTELLIGENCE</span>
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
      </div>
    </div>
  );
}

export default App;