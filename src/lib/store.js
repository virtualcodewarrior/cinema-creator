// Tiny pub/sub store for app-level state shared between web components
// (replaces what React context/props-drilling handled for cross-cutting state).

export function createStore(initial = {}) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    getState: () => state,
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      for (const l of [...listeners]) l(state, next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const appStore = createStore({
  theme: 'dark',
  apiKey: '',
  userEmail: null,
  balance: null,
});
