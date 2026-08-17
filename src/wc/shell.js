import { html, css } from 'lit';
import { BaseElement } from '../lib/wc-base.js';
import { navigate } from '../lib/router.js';
import './settings.js';

import './studio/studio-apps.js';
import './studio/studio-audio.js';
import './studio/studio-marketing.js';
import './studio/studio-motion.js';
import './studio/studio-influencer.js';
import './studio/studio-agents.js';
import './studio/studio-clipping.js';
import './studio/studio-lipsync.js';
import './studio/studio-recast.js';
import './studio/studio-cinema.js';
import './studio/studio-image.js';
import './studio/studio-video.js';
import './studio/studio-layers.js';
import './studio/studio-design.js';
import './studio/studio-workflow.js';

// All studios render as native web components into #studio-outlet.
const NATIVE_STUDIOS = {
  layers: 'studio-layers',
  apps: 'studio-apps',
  audio: 'studio-audio',
  marketing: 'studio-marketing',
  vibemotion: 'studio-motion',
  influencer: 'studio-influencer',
  agents: 'studio-agents',
  clipping: 'studio-clipping',
  lipsync: 'studio-lipsync',
  recast: 'studio-recast',
  cinema: 'studio-cinema',
  image: 'studio-image',
  video: 'studio-video',
  design: 'studio-design',
  workflow: 'studio-workflow',
};

const STUDIO_NAV = [
  { label: 'Image', path: '/studio/image', icon: '🎨' },
  { label: 'Video', path: '/studio/video', icon: '🎬' },
  { label: 'Cinema', path: '/studio/cinema', icon: '🎥' },
  { label: 'Lip Sync', path: '/studio/lipsync', icon: '👄' },
  { label: 'Workflow', path: '/studio/workflow', icon: '🔗' },
  { label: 'Agents', path: '/studio/agents', icon: '🤖' },
  { label: 'Apps', path: '/studio/apps', icon: '📦' },
  { label: 'Audio', path: '/studio/audio', icon: '🎵' },
  { label: 'Marketing', path: '/studio/marketing', icon: '📢' },
  { label: 'Recast', path: '/studio/recast', icon: '🎭' },
  { label: 'Motion', path: '/studio/vibemotion', icon: '💃' },
  { label: 'Clipping', path: '/studio/clipping', icon: '✂️' },
  { label: 'Layers', path: '/studio/layers', icon: '🖼️' },
  { label: 'Design', path: '/studio/design', icon: '✏️' },
  { label: 'Influencer', path: '/studio/influencer', icon: '⭐' },
];

// Port of app/app-shell.jsx. Sidebar, settings overlay and every studio are
// native web components rendered inside #studio-outlet, styled via the
// adopted studio sheet.
export class AppShell extends BaseElement {
  static sheetKeys = ['shell', 'studio'];

  static properties = {
    studio: { state: true },
    settingsOpen: { state: true },
  };

  static styles = [
    css`
      :host {
        display: flex;
        height: 100vh;
        width: 100%;
        background: #0a0a0f;
        color: white;
      }
      #studio-outlet {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
      }
    `,
  ];

  constructor() {
    super();
    this.studio = 'image';
    this.settingsOpen = false;
    this._outlet = null;
  }

  setStudio(name, search) {
    const next = name in NATIVE_STUDIOS ? name : 'image';
    if (!this.hasUpdated) {
      this.studio = next;
      return;
    }
    if (next !== this.studio) this.studio = next;
    this._renderStudio(this.studio, search);
  }

  firstUpdated() {
    this._outlet = this.renderRoot.querySelector('#studio-outlet');
    this._renderStudio(this.studio);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._outlet = null;
  }

  _renderStudio(name, search) {
    if (!this._outlet) return;
    const tag = NATIVE_STUDIOS[name] || 'studio-image';
    const existing = this._outlet.firstElementChild;
    if (existing && existing.tagName.toLowerCase() === tag) {
      // Same studio already mounted: forward search-only navigations
      // (?session=… in the design agent) to the element instead of
      // remounting — the old React path reconciled on re-render.
      existing.setSearch?.(search ?? window.location.search);
      return;
    }
    this._outlet.replaceChildren();
    const el = document.createElement(tag);
    this._outlet.appendChild(el);
    el.setSearch?.(search ?? window.location.search);
  }

  openSettings() {
    this.settingsOpen = true;
  }

  closeSettings() {
    this.settingsOpen = false;
  }

  render() {
    return html`
      <div class="w-56 min-w-[140px] bg-[#12121a] border-r border-white/5 flex flex-col">
        <div class="p-4 border-b border-white/5">
          <h1 class="text-lg font-bold">AI Cinema</h1>
          <p class="text-xs text-white/40 mt-1">Self-Hosted Studio</p>
        </div>
        <nav class="flex-1 overflow-y-auto p-2">
          ${STUDIO_NAV.map(
            (item) => html`
              <button
                class="${'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 transition-colors '}${
                  this.studio === item.path.replace('/studio/', '')
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }"
                @click=${() => navigate(item.path)}
              >
                <span>${item.icon}</span><span>${item.label}</span>
              </button>
            `,
          )}
        </nav>
        <div class="p-2 border-t border-white/5">
          <button
            class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors"
            @click=${() => this.openSettings()}
          >
            <span>⚙️</span><span>Settings</span>
          </button>
        </div>
      </div>

      <div id="studio-outlet"></div>

      ${this.settingsOpen
        ? html`<div class="backdrop" @click=${() => this.closeSettings()}>
            <div @click=${(e) => e.stopPropagation()}>
              <app-settings @dismissed=${() => this.closeSettings()}></app-settings>
            </div>
          </div>`
        : ''}
    `;
  }
}

customElements.define('app-shell', AppShell);
