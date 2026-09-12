import { useEffect, useMemo, useRef, useState } from 'react';
import { goTo } from '../nav';

const VIEWS = ['dashboard', 'scanner', 'backtest', 'watchlist'];
const TICKER_RE = /^[A-Z^.=-]{1,8}$/;

const SHORTCUTS = [
  ['/', 'SEARCH'],
  ['1–4', 'TABS'],
  ['← →', 'PERIOD'],
  ['C', 'CANDLES'],
  ['⌘K', 'PALETTE'],
  ['ESC', 'CLOSE'],
];

// What the box offers for a query: a typed symbol goes to any tab, view names
// and the theme toggle match by substring, recents fill the idle list.
const buildItems = (raw, recent, { onSelectTab, onToggleTheme }) => {
  const q = raw.trim().toUpperCase();
  const items = [];
  if (TICKER_RE.test(q)) {
    items.push(
      { key: `d:${q}`, label: q, hint: 'DASHBOARD', run: () => goTo('dashboard', { ticker: q }) },
      { key: `b:${q}`, label: q, hint: 'BACKTEST', run: () => goTo('backtest', { ticker: q }) },
      { key: `s:${q}`, label: q, hint: 'SCANNER', run: () => goTo('scanner', { tickers: q }) },
    );
  }
  VIEWS.forEach(v => {
    if (!q || v.toUpperCase().includes(q)) {
      items.push({ key: `v:${v}`, label: `GO TO ${v.toUpperCase()}`, hint: 'VIEW', run: () => onSelectTab(v) });
    }
  });
  if (!q || 'THEME'.includes(q) || 'LIGHT'.includes(q) || 'DARK'.includes(q)) {
    items.push({ key: 'theme', label: 'TOGGLE THEME', hint: 'VIEW', run: onToggleTheme });
  }
  recent
    .filter(t => t !== q && (!q || t.startsWith(q)))
    .forEach(t => items.push({ key: `r:${t}`, label: t, hint: 'RECENT', run: () => goTo('dashboard', { ticker: t }) }));
  return items;
};

/**
 * Command palette (Cmd/Ctrl+K). Type a symbol to open it anywhere, or a view
 * name to jump. Arrow keys move, Enter runs, Escape closes.
 */
export default function Palette({ open, onClose, onSelectTab, onToggleTheme, recent = [] }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  const items = useMemo(
    () => buildItems(q, recent, { onSelectTab, onToggleTheme }),
    [q, recent, onSelectTab, onToggleTheme]
  );

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      // Focus after the overlay has painted.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  useEffect(() => { setIdx(0); }, [q]);

  if (!open) return null;

  const run = (item) => {
    onClose();
    item.run();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && items[idx]) { e.preventDefault(); run(items[idx]); }
  };

  return (
    <div className="palette" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="palette__box">
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ticker or command"
          className="palette__input"
          spellCheck={false}
          autoComplete="off"
        />
        <ul className="palette__list" role="listbox">
          {items.length === 0 && <li className="palette__empty">NO MATCHES</li>}
          {items.map((item, i) => (
            <li
              key={item.key}
              role="option"
              aria-selected={i === idx}
              className={`palette__item${i === idx ? ' palette__item--active' : ''}`}
              onMouseEnter={() => setIdx(i)}
              onMouseDown={(e) => { e.preventDefault(); run(item); }}
            >
              <span>{item.label}</span>
              <span className="palette__hint">{item.hint}</span>
            </li>
          ))}
        </ul>
        <div className="palette__foot">
          {SHORTCUTS.map(([k, v]) => (
            <span key={k}><span className="palette__key">{k}</span> {v}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
