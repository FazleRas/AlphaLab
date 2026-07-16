import { Component } from 'react';

// Catches render-time crashes so a bad payload breaks one panel with a
// visible message instead of the whole app. Without a boundary, React
// unmounts the entire tree on an uncaught render error - the "site goes
// black until you reload" failure mode.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-4xl mx-auto">
          <p className="font-mono text-sm mb-3" style={{ color: '#ff4d6d' }}>
            Something went wrong rendering this view: {String(this.state.error?.message || this.state.error)}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="font-mono text-xs px-3 py-1 rounded"
            style={{ backgroundColor: '#1e1e2e', color: '#e2e2e2', border: '1px solid #2563eb' }}
          >
            TRY AGAIN
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
