// Drop-in toast service for web components.
// Replaces react-hot-toast (`toast.success/.error/.loading/.warn/.custom`) and
// react-toastify. Provides a global `toast.*` API that pushes items onto an
// <app-toaster> web component (rendered once in main.js).
//
// Public API kept compatible with react-hot-toast so existing call sites only
// change their import (react-hot-toast -> this module).

let seq = 0;
const queue = new Map(); // id -> item
const listeners = new Set();

function notify() {
  for (const l of [...listeners]) l([...queue.values()]);
}

function addItem(item) {
  const id = item.id ?? `t${Date.now()}-${seq++}`;
  const record = {
    id,
    type: item.type ?? 'message', // message | success | error | loading | warning | custom
    message: item.message ?? '',
    duration: item.duration ?? (item.type === 'loading' ? Infinity : 4000),
    icon: item.icon ?? null,
    html: item.html ?? null,
    createdAt: Date.now(),
    timer: null,
  };
  queue.set(id, record);
  if (record.duration !== Infinity && record.duration > 0) {
    record.timer = setTimeout(() => dismiss(id), record.duration);
  }
  notify();
  return id;
}

export function dismiss(id) {
  const item = id == null ? null : queue.get(id);
  if (item) clearTimeout(item.timer);
  if (id == null) {
    queue.forEach((i) => clearTimeout(i.timer));
    queue.clear();
  } else {
    queue.delete(id);
  }
  notify();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function snapshot() {
  return [...queue.values()];
}

const toast = {
  show(message, options = {}) {
    return addItem({ type: 'message', message, ...options });
  },
  success(message, options = {}) {
    return addItem({ type: 'success', message, ...options });
  },
  error(message, options = {}) {
    return addItem({ type: 'error', message, duration: options.duration ?? 5000, ...options });
  },
  warn(message, options = {}) {
    return addItem({ type: 'warning', message, ...options });
  },
  warning(message, options = {}) {
    return addItem({ type: 'warning', message, ...options });
  },
  loading(message, options = {}) {
    return addItem({ type: 'loading', message, ...options });
  },
  custom(node, options = {}) {
    return addItem({ type: 'custom', html: typeof node === 'string' ? node : null, message: '', ...options });
  },
  dismiss,
  // react-hot-toast uses toast.remove to drop the current toast
  remove: dismiss,
  // Re-target an existing toast by id (used for loading -> success/error).
  update(id, options = {}) {
    const item = queue.get(id);
    if (!item) return;
    if (options.type) item.type = options.type;
    if (options.message != null) item.message = options.message;
    if (options.duration != null) {
      item.duration = options.duration;
      clearTimeout(item.timer);
      if (item.duration !== Infinity && item.duration > 0) {
        item.timer = setTimeout(() => dismiss(id), item.duration);
      }
    }
    notify();
  },
};

export default toast;
