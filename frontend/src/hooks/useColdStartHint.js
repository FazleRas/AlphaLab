import { useState, useEffect } from 'react';

// Returns true once a request has been loading longer than `delay` ms — used to
// warn the user that the free-tier backend may be cold-starting (~30s) rather
// than broken. Resets as soon as loading finishes.
export default function useColdStartHint(loading, delay = 4000) {
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    if (!loading) {
      setWaking(false);
      return;
    }
    const timer = setTimeout(() => setWaking(true), delay);
    return () => clearTimeout(timer);
  }, [loading, delay]);

  return waking;
}
