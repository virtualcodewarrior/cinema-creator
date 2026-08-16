// App entry (vanilla JS, no JSX).
// P1: the app shell is the <app-shell> web component; studios still render
// React inside its outlet, and the /agents/* routes render via a temporary
// React bridge in light DOM. Each flips to native as its phase completes.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { route, start } from './lib/router.js';
import { loadWcCss, SHEET_KEYS } from './lib/wc-base.js';
import { initTheme } from './lib/theme.js';
import './globals.css';
import './wc/toaster.js';
import './wc/shell.js';
// React pages for the bridge (kept until agents migrate in P2)
import AgentChatPage from './pages/AgentChatPage.jsx';
import AgentCreatePage from '../app/agents/create/page.jsx';
import AgentEditPage from '../app/agents/edit/[id]/page.jsx';

let shell = null;
let bridgeRoot = null;

function rootEl() {
  return document.getElementById('root');
}

function clearBridge() {
  if (bridgeRoot) {
    bridgeRoot.unmount();
    bridgeRoot = null;
  }
}

function renderShell(studio) {
  const root = rootEl();
  clearBridge();
  if (!shell || !root.contains(shell)) {
    shell = document.createElement('app-shell');
    root.innerHTML = '';
    root.appendChild(shell);
  }
  shell.setStudio(studio);
}

// Temporary React host for not-yet-migrated routes (light DOM, global CSS).
// Declares the same param routes the old App.jsx had so useParams works.
function renderBridge() {
  const root = rootEl();
  if (shell) {
    shell.remove();
    shell = null;
  }
  root.innerHTML = '';
  const div = document.createElement('div');
  root.appendChild(div);
  bridgeRoot = ReactDOM.createRoot(div);
  bridgeRoot.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(
        BrowserRouter,
        null,
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: '/agents/create', element: React.createElement(AgentCreatePage) }),
          React.createElement(Route, { path: '/agents/edit/:id', element: React.createElement(AgentEditPage) }),
          React.createElement(Route, { path: '/agents/:agentId', element: React.createElement(AgentChatPage) }),
        ),
      ),
    ),
  );
}

// Registration order = match priority (specific before param routes).
route('/', () => renderShell('image'));
route('/workflow', () => renderShell('image'));
route('/workflow/*', () => renderShell('image'));
route('/studio/:name', (p) => renderShell(p.name));
route('/agents/create', () => renderBridge());
route('/agents/edit/:id', () => renderBridge());
route('/agents/*', () => renderBridge());
// Unknown paths render nothing (same as the old react-router config).

const toaster = document.createElement('app-toaster');
document.body.appendChild(toaster);

initTheme();
loadWcCss(SHEET_KEYS).catch((err) => console.warn('[wc] failed to pre-load style sheets:', err));
start();
