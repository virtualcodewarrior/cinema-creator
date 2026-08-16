// Minimal history-based path router (replaces react-router-dom).
// Register with route('/studio/:name', handler); first match wins.
// :name segments capture one path segment, '*' captures the remainder.

const routes = [];
let current = null;
let started = false;

function compile(pattern) {
  const names = [];
  const source = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        names.push(seg.slice(1));
        return '([^/]+)';
      }
      if (seg === '*') return '(.*)';
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp('^' + source + '$'), names };
}

export function route(pattern, handler) {
  routes.push({ pattern, ...compile(pattern), handler });
  if (started) dispatch();
}

export function matchPath(pathname) {
  for (const r of routes) {
    const m = r.regex.exec(pathname);
    if (!m) continue;
    const params = { _: null };
    r.names.forEach((n, i) => {
      params[n] = decodeURIComponent(m[i + 1] ?? '');
    });
    const wildcard = r.pattern.endsWith('/*') ? r.names.length : -1;
    if (wildcard >= 0 && m[wildcard + 1] != null) params._ = m[wildcard + 1];
    return { pattern, params };
  }
  return null;
}

export function navigate(path, { replace = false } = {}) {
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  dispatch();
}

export function back() {
  window.history.back();
}

export function currentRoute() {
  return current;
}

export function dispatch() {
  const pathname = window.location.pathname;
  const search = window.location.search;
  const match = matchPath(pathname);
  current = match ? { ...match, pathname, search } : { pattern: null, params: {}, pathname, search };
  if (match) match.handler({ ...match.params, pathname, search });
  return current;
}

export function start() {
  window.addEventListener('popstate', dispatch);
  started = true;
  dispatch();
}
