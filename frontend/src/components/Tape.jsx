import { useEffect, useState } from 'react';
import API from '../config';

// Index tape under the nav. Refreshes each minute; the backend caches quotes
// for the same window, so a page full of tabs costs one Yahoo call a minute.
const TICKERS = ['SPY', 'QQQ', 'DIA', 'IWM', '^VIX'];
const REFRESH_MS = 60_000;

const symbol = (t) => t.replace(/^\^/, '');
const signed = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

// NYSE regular session: Monday to Friday, 09:30–16:00 New York time.
// Holidays aren't modelled; this is a marker, not a feed.
export const nyseOpen = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find(p => p.type === type)?.value;
  const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  return !['Sat', 'Sun'].includes(get('weekday')) && minutes >= 570 && minutes < 960;
};

const Item = ({ q }) => {
  const has = q.price != null;
  const dir = q.change_pct == null ? 'var(--color-muted)' : q.change_pct >= 0 ? 'var(--color-pos)' : 'var(--color-neg)';
  return (
    <span className="tape__item">
      <span className="tape__sym">{symbol(q.ticker)}</span>
      <span>{has ? q.price.toFixed(2) : '—'}</span>
      <span style={{ color: dir }}>{q.change_pct != null ? signed(q.change_pct) : ''}</span>
    </span>
  );
};

export default function Tape() {
  const [quotes, setQuotes] = useState(() => TICKERS.map(t => ({ ticker: t })));
  const [open, setOpen] = useState(() => nyseOpen());

  useEffect(() => {
    let live = true;
    const tick = async () => {
      setOpen(nyseOpen());
      try {
        const res = await fetch(`${API}/quotes?tickers=${encodeURIComponent(TICKERS.join(','))}`);
        if (!res.ok) return;
        const data = await res.json();
        const byTicker = new Map((data.quotes || []).map(q => [q.ticker, q]));
        // Keep the fixed order and a placeholder for anything that didn't come back.
        if (live) setQuotes(TICKERS.map(t => byTicker.get(t) || { ticker: t }));
      } catch (e) {
        // Leave the last good quotes on screen.
      }
    };
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => { live = false; clearInterval(id); };
  }, []);

  const loaded = quotes.some(q => q.price != null);
  const copies = loaded ? [0, 1] : [0];

  return (
    <div className="tape" aria-label="Index tape">
      <span className="tape__status">
        <span className={`tape__dot${open ? ' tape__dot--live' : ''}`} aria-hidden="true" />
        NYSE {open ? 'OPEN' : 'CLOSED'}
      </span>
      <div className="tape__track">
        {/* Two copies of the row make the loop seamless: the track slides one
            copy's width and snaps back to an identical frame. */}
        <div
          className={`tape__run${loaded ? ' tape__run--live' : ''}`}
          style={{ animationDuration: `${quotes.length * 7}s` }}
        >
          {copies.map(copy => (
            <span key={copy} className="tape__copy" aria-hidden={copy === 1 ? 'true' : undefined}>
              {quotes.map(q => <Item key={q.ticker} q={q} />)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
