// App entry (vanilla JS, no JSX).
// P2: the app shell and every /agents/* surface are native web components.
// Studios still render React inside the shell's outlet (each flips to native
// in P3–P5 as its phase completes).
import { route, start } from './lib/router.js';
import { loadWcCss, SHEET_KEYS } from './lib/wc-base.js';
import { initTheme } from './lib/theme.js';
import './wc/toaster.js';
import './wc/shell.js';
import './wc/agents/create-agent.js';
import './wc/agents/edit-agent.js';
import './wc/agents/agent-chat.js';
import './wc/agents/agent-profile.js';

let shell = null;

function rootEl() {
  return document.getElementById('root');
}

function renderShell(studio, search = window.location.search) {
  const root = rootEl();
  if (!shell || !root.contains(shell)) {
    shell = document.createElement('app-shell');
    root.innerHTML = '';
    root.appendChild(shell);
  }
  shell.setStudio(studio, search);
}

// Mount a native agents web component in #root (full page, no shell sidebar).
function renderAgent(tag, props = {}) {
  const root = rootEl();
  if (shell) {
    shell.remove();
    shell = null;
  }
  root.innerHTML = '';
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => (el[k] = v));
  root.appendChild(el);
}

// Registration order = match priority (specific before param routes).
route('/', () => renderShell('image'));
route('/workflow', () => renderShell('image'));
route('/workflow/*', () => renderShell('image'));
route('/studio/:name', (p) => renderShell(p.name, p.search));
route('/agents/create', () => renderAgent('agent-create'));
route('/agents/edit/:id', (p) => renderAgent('agent-edit', { agentId: p.id }));
// Must be registered before the conversation route: '/agents/x/profile' must
// not be captured by '/agents/:agentId/:conversationId'.
route('/agents/:agentId/profile', (p) =>
  renderAgent('agent-profile', { agentId: p.agentId }),
);
route('/agents/:agentId/:conversationId', (p) =>
  renderAgent('agent-chat', { agentId: p.agentId, conversationId: p.conversationId }),
);
route('/agents/:agentId', (p) => renderAgent('agent-chat', { agentId: p.agentId }));
// Unknown paths render nothing (same as the old react-router config).

const toaster = document.createElement('app-toaster');
document.body.appendChild(toaster);

initTheme();
loadWcCss(SHEET_KEYS).catch((err) => console.warn('[wc] failed to pre-load style sheets:', err));
start();
