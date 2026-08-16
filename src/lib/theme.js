// Theme: data-theme attribute on <html> + CSS custom properties.
// Replaces next-themes (which required a Next context to function).
import { appStore } from './store.js';

const KEY = 'theme';

export function getTheme() {
  return document.documentElement.dataset.theme || 'dark';
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode */
  }
  appStore.setState({ theme });
}

export function initTheme() {
  let theme = 'dark';
  try {
    theme = localStorage.getItem(KEY) || 'dark';
  } catch {
    /* ignore */
  }
  document.documentElement.dataset.theme = theme;
  appStore.setState({ theme });
  return theme;
}
