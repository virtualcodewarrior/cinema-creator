// App entry (vanilla JS, no JSX).
// Phase 0: React still renders the app tree (identical to the old main.jsx),
// but the entry owns: WC style-sheet preload, theme init, and the global
// <app-toaster>. As surfaces migrate (P1+), this file keeps registering the
// new custom elements and the React tree shrinks via src/wc-bridge.js.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './globals.css';
import { loadWcCss, SHEET_KEYS } from './lib/wc-base.js';
import { initTheme } from './lib/theme.js';
import './wc/toaster.js';

(async () => {
  initTheme();
  try {
    await loadWcCss(SHEET_KEYS);
  } catch (err) {
    console.warn('[wc] failed to pre-load style sheets:', err);
  }

  const toaster = document.createElement('app-toaster');
  document.body.appendChild(toaster);

  ReactDOM.createRoot(document.getElementById('root')).render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(
        BrowserRouter,
        null,
        React.createElement(App),
      ),
    ),
  );
})();
