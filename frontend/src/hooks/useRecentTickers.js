import { useState, useCallback } from 'react';

const KEY = 'alphalab:recent';
const MAX = 6;

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter(s => typeof s === 'string').slice(0, MAX) : [];
  } catch (e) {
    return [];
  }
};

// Most-recent-first list of tickers the user has looked up, kept in
// localStorage so the dashboard has something to offer before a search.
export default function useRecentTickers() {
  const [recent, setRecent] = useState(read);
  const add = useCallback((symbol) => {
    setRecent(prev => {
      const next = [symbol, ...prev.filter(t => t !== symbol)].slice(0, MAX);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* session only */ }
      return next;
    });
  }, []);
  return [recent, add];
}
