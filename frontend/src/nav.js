// Cross-tab navigation without a router: write the query string the target
// tab reads on mount, then tell App to switch. App remounts the tab even when
// it is already the active one, so the new params always take effect.
export const goTo = (view, params = {}) => {
  const q = new URLSearchParams({ view });
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v); });
  window.history.replaceState(null, '', `?${q.toString()}`);
  window.dispatchEvent(new CustomEvent('alphalab:view', { detail: view }));
};

// Keys pressed while typing belong to the field, not to the app.
export const inField = (target) =>
  !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
