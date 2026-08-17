import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
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

// P3: studios flipped to native web components map to an element tag; they
// render into #studio-outlet instead of the React root below.
const NATIVE_STUDIOS = {
  apps: 'studio-apps',
  audio: 'studio-audio',
  marketing: 'studio-marketing',
  vibemotion: 'studio-motion',
  influencer: 'studio-influencer',
  agents: 'studio-agents',
  clipping: 'studio-clipping',
  lipsync: 'studio-lipsync',
  recast: 'studio-recast',
};

import ImageStudio from '../../packages/studio/src/components/ImageStudio';
import VideoStudio from '../../packages/studio/src/components/VideoStudio';
import CinemaStudio from '../../packages/studio/src/components/CinemaStudio';
import LipSyncStudio from '../../packages/studio/src/components/LipSyncStudio';
import WorkflowStudio from '../../packages/studio/src/components/WorkflowStudio';
import AgentStudio from '../../packages/studio/src/components/AgentStudio';
import AppsStudio from '../../packages/studio/src/components/AppsStudio';
import AudioStudio from '../../packages/studio/src/components/AudioStudio';
import MarketingStudio from '../../packages/studio/src/components/MarketingStudio';
import RecastStudio from '../../packages/studio/src/components/RecastStudio';
import VibeMotionStudio from '../../packages/studio/src/components/VibeMotionStudio';
import ClippingStudio from '../../packages/studio/src/components/ClippingStudio';
import LayersStudio from '../../packages/studio/src/components/LayersStudio';
import DesignAgentStudio from '../../packages/studio/src/components/DesignAgentStudio';
import AiInfluencerStudio from '../../packages/studio/src/components/AiInfluencerStudio';

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

const STUDIO_COMPONENTS = {
  image: ImageStudio,
  video: VideoStudio,
  cinema: CinemaStudio,
  lipsync: LipSyncStudio,
  workflow: WorkflowStudio,
  agents: AgentStudio,
  apps: AppsStudio,
  audio: AudioStudio,
  marketing: MarketingStudio,
  recast: RecastStudio,
  vibemotion: VibeMotionStudio,
  clipping: ClippingStudio,
  layers: LayersStudio,
  design: DesignAgentStudio,
  influencer: AiInfluencerStudio,
};

// Port of app/app-shell.jsx. The sidebar and settings overlay are now web
// components; the active studio still renders as React (until each studio is
// migrated in P3+) inside #studio-outlet, styled via the adopted studio sheet.
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
    this._studioRoot = null;
  }

  setStudio(name) {
    const next = STUDIO_COMPONENTS[name] ? name : 'image';
    if (!this.hasUpdated) {
      this.studio = next;
      return;
    }
    if (next !== this.studio) this.studio = next;
    this._renderStudio(this.studio);
  }

  firstUpdated() {
    this._outlet = this.renderRoot.querySelector('#studio-outlet');
    this._renderStudio(this.studio);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._studioRoot) {
      this._studioRoot.unmount();
      this._studioRoot = null;
    }
    this._outlet = null;
  }

  _renderStudio(name) {
    if (!this._outlet) return;
    const tag = NATIVE_STUDIOS[name];
    if (tag) {
      // Native path: no React root involved.
      if (this._studioRoot) {
        this._studioRoot.unmount();
        this._studioRoot = null;
      }
      this._outlet.replaceChildren();
      const el = document.createElement(tag);
      this._outlet.appendChild(el);
      return;
    }
    const Studio = STUDIO_COMPONENTS[name] ?? ImageStudio;
    if (!this._studioRoot) this._studioRoot = ReactDOM.createRoot(this._outlet);
    // Studios read react-router (useNavigate/Links) like WorkflowStudio and
    // CreativeCanvas do, so the outlet root carries its own router context.
    this._studioRoot.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(BrowserRouter, null, React.createElement(Studio)),
      ),
    );
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
