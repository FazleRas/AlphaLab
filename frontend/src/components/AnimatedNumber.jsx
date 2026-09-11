import { useEffect, useRef, useState } from 'react';

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
};

/**
 * Tween a number toward `target`. The first value counts up from zero; later
 * changes tween from wherever the previous run settled.
 */
export function useCountUp(target, duration = 700) {
  const num = Number(target);
  const finite = target != null && Number.isFinite(num);
  const [value, setValue] = useState(finite ? 0 : num);
  const fromRef = useRef(null);

  useEffect(() => {
    if (!finite) return undefined;
    if (reducedMotion()) {
      fromRef.current = num;
      setValue(num);
      return undefined;
    }
    const from = fromRef.current ?? 0;
    if (from === num) {
      setValue(num);
      return undefined;
    }
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (num - from) * easeOut(t);
      setValue(t < 1 ? v : num);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = num;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = num;
    };
  }, [num, finite, duration]);

  return finite ? value : target;
}

/**
 * A number that counts up into place and flashes green or red when it later
 * changes. `format` receives an in-between float, so it should round.
 */
export default function AnimatedNumber({ value, format = (v) => v, empty = '—', flash = true, className, style }) {
  const shown = useCountUp(value);
  const prev = useRef(value);
  const [flashClass, setFlashClass] = useState('');

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (!flash || before == null || value == null || before === value) return undefined;
    setFlashClass(Number(value) > Number(before) ? 'flash-pos' : 'flash-neg');
    const t = setTimeout(() => setFlashClass(''), 800);
    return () => clearTimeout(t);
  }, [value, flash]);

  const finite = value != null && Number.isFinite(Number(value));
  const classes = [className, flashClass].filter(Boolean).join(' ') || undefined;
  return (
    <span className={classes} style={style}>
      {finite ? format(shown) : empty}
    </span>
  );
}
