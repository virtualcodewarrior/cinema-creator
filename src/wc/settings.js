import { html, css, nothing } from 'lit';
import { BaseElement } from '../lib/wc-base.js';
import { iconSvg } from '../lib/icons.js';

const STORAGE_KEY = 'ai_cinema_api_key';

function getBackendUrl() {
  const envUrl = localStorage.getItem('deno_backend_url');
  if (envUrl) return envUrl;
  return window.location.origin;
}

// Port of components/SettingsPanel.jsx (settings modal content).
// Behavior preserved: API key read from localStorage on open, model list +
// disk usage via /api/models with x-api-key, per-model download with 2s status
// polling, delete stub error, auxiliary file downloads.
export class AppSettings extends BaseElement {
  static sheetKey = 'shell';

  static properties = {
    apiKey: { state: true },
    models: { state: true },
    downloading: { state: true },
    loading: { state: true },
    error: { state: true },
    diskUsage: { state: true },
  };

  static styles = [
    css`
      :host {
        display: block;
      }
    `,
  ];

  constructor() {
    super();
    this.apiKey = '';
    this.models = [];
    this.downloading = {};
    this.loading = true;
    this.error = null;
    this.diskUsage = 0;
    this._pollTimers = [];
  }

  connectedCallback() {
    super.connectedCallback();
    const key = localStorage.getItem(STORAGE_KEY);
    if (key) this.apiKey = key;
    this.fetchModels();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._pollTimers.forEach((t) => clearTimeout(t));
    this._pollTimers = [];
  }

  async fetchModels() {
    if (!this.apiKey) return;
    try {
      this.loading = true;
      this.error = null;
      const response = await fetch(`${getBackendUrl()}/api/models`, {
        headers: { 'x-api-key': this.apiKey },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.ok) {
        this.models = data.data;
        this.diskUsage = data.data.reduce((sum, m) => sum + (m.state === 'downloaded' ? m.sizeGB : 0), 0);
      } else {
        this.error = data.error;
      }
    } catch (err) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  async handleDownload(modelId) {
    if (!this.apiKey || this.downloading[modelId]) return;
    try {
      this.downloading = { ...this.downloading, [modelId]: true };
      this.error = null;
      const response = await fetch(`${getBackendUrl()}/api/models/${modelId}/download`, {
        method: 'POST',
        headers: { 'x-api-key': this.apiKey },
      });
      const data = await response.json();
      if (!data.ok) {
        this.error = data.error;
      } else {
        this.pollDownloadStatus(modelId);
      }
    } catch (err) {
      this.error = err.message;
    } finally {
      this.downloading = { ...this.downloading, [modelId]: false };
    }
  }

  pollDownloadStatus(modelId) {
    const poll = async () => {
      if (!this.apiKey) return;
      try {
        const response = await fetch(`${getBackendUrl()}/api/download/status?modelId=${modelId}`, {
          headers: { 'x-api-key': this.apiKey },
        });
        const data = await response.json();
        if (data.ok && !data.data.downloading) {
          this.fetchModels();
        } else {
          this._pollTimers.push(setTimeout(poll, 2000));
        }
      } catch {
        this.fetchModels();
      }
    };
    poll();
  }

  async handleDelete(modelId) {
    if (!this.apiKey) return;
    if (!confirm('Delete this model? This cannot be undone.')) return;
    // Mirror of current stub: delete endpoint not yet implemented server-side.
    this.error = 'Model deletion not yet implemented. Delete manually from ~/.ai-cinema/models/';
  }

  async handleAuxDownload(auxKey) {
    if (!this.apiKey || this.downloading[auxKey]) return;
    try {
      this.downloading = { ...this.downloading, [auxKey]: true };
      this.error = null;
      const response = await fetch(`${getBackendUrl()}/api/aux/${auxKey}/download`, {
        method: 'POST',
        headers: { 'x-api-key': this.apiKey },
      });
      const data = await response.json();
      if (!data.ok) {
        this.error = data.error;
      } else {
        this.pollAuxDownloadStatus(auxKey);
      }
    } catch (err) {
      this.error = err.message;
    } finally {
      this.downloading = { ...this.downloading, [auxKey]: false };
    }
  }

  pollAuxDownloadStatus(auxKey) {
    const poll = async () => {
      if (!this.apiKey) return;
      try {
        const response = await fetch(`${getBackendUrl()}/api/download/status?auxKey=${auxKey}`, {
          headers: { 'x-api-key': this.apiKey },
        });
        const data = await response.json();
        if (data.ok && !data.data.downloading) {
          this.fetchModels();
        } else {
          this._pollTimers.push(setTimeout(poll, 2000));
        }
      } catch {
        this.fetchModels();
      }
    };
    poll();
  }

  dismiss() {
    this.dispatchEvent(new CustomEvent('dismissed', { bubbles: true }));
  }

  renderModelCard(model) {
    const badge =
      model.state === 'downloaded'
        ? html`<span class="inline-block mt-2 text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded">Downloaded</span>`
        : model.state === 'partial'
          ? html`<span class="inline-block mt-2 text-xs bg-yellow-900/30 text-yellow-400 px-2 py-0.5 rounded">Partial Download</span>`
          : html`<span class="inline-block mt-2 text-xs bg-gray-800 text-white/60 px-2 py-0.5 rounded">Not Downloaded</span>`;
    return html`
      <div class="bg-black border border-white/10 rounded p-4">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h4 class="font-medium">${model.name}</h4>
            <p class="text-sm text-white/60 mt-1">${model.description || model.type} · ${model.sizeGB} GB</p>
            ${badge}
          </div>
          <div class="flex gap-2">
            ${model.state !== 'downloaded'
              ? html`<button
                  class="px-3 py-1.5 bg-white text-black rounded text-sm hover:bg-white/90 disabled:opacity-50"
                  ?disabled=${this.downloading[model.id]}
                  @click=${() => this.handleDownload(model.id)}
                >
                  ${this.downloading[model.id] ? 'Downloading...' : 'Download'}
                </button>`
              : html`<button
                  class="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-500/30 rounded text-sm hover:bg-red-900/50"
                  @click=${() => this.handleDelete(model.id)}
                >
                  Delete
                </button>`}
          </div>
        </div>
      </div>
    `;
  }

  renderAuxFile(name, size, auxKey) {
    return html`
      <div class="flex items-center justify-between bg-black border border-white/10 rounded p-3">
        <div>
          <p class="text-sm">${name}</p>
          <p class="text-xs text-white/60">${size}</p>
        </div>
        <button
          class="px-3 py-1.5 bg-white text-black rounded text-sm hover:bg-white/90 disabled:opacity-50"
          ?disabled=${this.downloading[auxKey]}
          @click=${() => this.handleAuxDownload(auxKey)}
        >
          ${this.downloading[auxKey] ? 'Downloading...' : 'Download'}
        </button>
      </div>
    `;
  }

  render() {
    return html`
      <div class="bg-gray-900 border border-white/10 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-bold">Settings</h2>
          <button class="text-white/60 hover:text-white" @click=${() => this.dismiss()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="mb-6">
          <label class="block text-sm font-medium text-white/80 mb-2" for="api-key">API Key</label>
          <input
            id="api-key"
            type="password"
            .value=${this.apiKey}
            @input=${(e) => {
              this.apiKey = e.target.value;
              this.fetchModels();
            }}
            placeholder="Enter API key..."
            class="w-full bg-black border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-white/40"
          />
          <p class="text-xs text-white/40 mt-1">
            Stored locally in your browser. Used to authenticate with the Deno backend.
          </p>
        </div>

        <div>
          <h3 class="text-lg font-semibold mb-4">Local Models</h3>
          <p class="text-sm text-white/60 mb-4">Disk usage: ${this.diskUsage.toFixed(1)} GB</p>

          ${this.loading ? html`<div class="text-white/60">Loading models...</div>` : nothing}
          ${this.error
            ? html`<div class="bg-red-900/20 border border-red-500/30 rounded p-3 mb-4 text-red-400 text-sm">${this.error}</div>`
            : nothing}

          <div class="space-y-3">
            ${this.models.map((model) => this.renderModelCard(model))}
          </div>

          <div class="mt-6">
            <h4 class="text-sm font-medium text-white/80 mb-3">Auxiliary Files (for Z-Image models)</h4>
            <div class="space-y-2">
              ${this.renderAuxFile('Qwen3-4B Text Encoder', '2.4 GB', 'llm')}
              ${this.renderAuxFile('FLUX VAE', '335 MB', 'vae')}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('app-settings', AppSettings);
