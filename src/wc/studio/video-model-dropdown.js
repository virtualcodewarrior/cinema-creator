// Port of the ModelDropdown function in packages/studio/src/components/VideoStudio.jsx.
// Two-pane model picker: provider icon sidebar, All/Text-to-Video/Image-to-Video/
// Video-Tools category tabs, search box, filtered list with a separate
// "Video Tools" section for v2v entries at the bottom. Emits `select`
// {model, category} and `close` (its own item click closes the parent popover).
//
// Porting notes:
// - React scrolls the active model row into view on mount; mirrored in
//   firstUpdated (the element mounts each time the popover opens).
// - `availableProviders` is derived from the ACTIVE category's entries in
//   the original (so provider tabs change with the selected category) —
//   kept exactly, including the first-seen ordering.
import { html, nothing } from 'lit';
import { BaseElement } from '../../lib/wc-base.js';
import { t2vModels, i2vModels, v2vModels } from 'studio/models.js';
import { matchesOrigin } from 'studio/modelOrigin.js';
import { modelOriginBadge, originFilterPills } from './origin-filter.js';

const PROVIDER_LOGOS = {
  openai: '/assets/models/openai.png',
  google: '/assets/models/gemini.png',
  kling: '/assets/models/kling.png',
  alibaba: '/assets/models/alibaba.png',
  bytedance: '/assets/models/bytedance.png',
  blackforest: '/assets/models/bfl.png',
  minimax: '/assets/models/minimax.png',
  suno: '/assets/models/suno.png',
  anthropic: '/assets/models/claude.png',
  meshy: '/assets/models/meshy-3.png',
  tripo3d: '/assets/models/tripo3d.png',
  grok: '/assets/models/xai.png',
  muapi: '/assets/models/muapi.png',
  midjourney: '/assets/models/midjourney.png',
  vidu: '/assets/models/vidu.png',
  runway: '/assets/models/runway.png',
  luma: '/assets/models/luma.png',
  ideogram: '/assets/models/ideogram.png',
  leonardoai: '/assets/models/leonardoai.png',
  hunyuan: '/assets/models/hunyuan.png',
  hidream: '/assets/models/hidream.png',
  lightricks: '/assets/models/lightricks.png',
  pixverse: '/assets/models/pixverse.png',
  reve: '/assets/models/reve.png',
  stability: '/assets/models/stability.png',
};

const invertLogos = ['openai', 'blackforest', 'runway', 'ideogram', 'lightricks', 'grok'];

const MODEL_CATEGORIES = [
  {
    id: 'all',
    label: 'All',
    entries: [
      ...t2vModels.map((model) => ({ model, category: 't2v' })),
      ...i2vModels.map((model) => ({ model, category: 'i2v' })),
      ...v2vModels.map((model) => ({ model, category: 'v2v' })),
    ],
  },
  {
    id: 't2v',
    label: 'Text to Video',
    entries: t2vModels.map((model) => ({ model, category: 't2v' })),
  },
  {
    id: 'i2v',
    label: 'Image to Video',
    entries: i2vModels.map((model) => ({ model, category: 'i2v' })),
  },
  {
    id: 'v2v',
    label: 'Video Tools',
    entries: v2vModels.map((model) => ({ model, category: 'v2v' })),
  },
];

function getProviderStyle(provider) {
  switch (provider) {
    case 'grok':
      return { text: 'xI', bg: 'bg-orange-500/10 text-orange-400 border-orange-500/25' };
    case 'openai':
      return { text: 'O', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' };
    case 'google':
      return { text: 'G', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/25' };
    case 'blackforest':
      return { text: 'BF', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/25' };
    case 'bytedance':
      return { text: 'BD', bg: 'bg-purple-500/10 text-purple-400 border-purple-500/25' };
    case 'midjourney':
      return { text: 'MJ', bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25' };
    case 'kling':
      return { text: 'KL', bg: 'bg-rose-500/10 text-rose-400 border-rose-500/25' };
    case 'vidu':
      return { text: 'VD', bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25' };
    case 'minimax':
      return { text: 'MX', bg: 'bg-pink-500/10 text-pink-400 border-pink-500/25' };
    case 'ideogram':
      return { text: 'ID', bg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' };
    case 'luma':
      return { text: 'LM', bg: 'bg-teal-500/10 text-teal-400 border-teal-500/25' };
    case 'alibaba':
      return { text: 'AL', bg: 'bg-sky-500/10 text-sky-400 border-sky-500/25' };
    case 'leonardoai':
      return { text: 'LE', bg: 'bg-violet-500/10 text-violet-400 border-violet-500/25' };
    case 'stability':
      return { text: 'SD', bg: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/25' };
    default: {
      const name = provider ? provider.toUpperCase() : 'AI';
      return { text: name.substring(0, 2), bg: 'bg-primary/10 text-primary border-primary/25' };
    }
  }
}

function getIconColor(m, isV2V) {
  if (isV2V) return 'bg-orange-500/10 text-orange-400 border-orange-500/10';
  if (m.id.includes('kling')) return 'bg-blue-500/10 text-blue-400 border-blue-500/10';
  if (m.id.includes('veo')) return 'bg-purple-500/10 text-purple-400 border-purple-500/10';
  if (m.id.includes('sora')) return 'bg-rose-500/10 text-rose-400 border-rose-500/10';
  return 'bg-primary/10 text-primary border-primary/10';
}

export class VideoModelDropdown extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    selectedModel: { type: String },
    search: { state: true },
    selectedCategory: { state: true },
    selectedProvider: { state: true },
    selectedOrigin: { state: true },
  };

  constructor() {
    super();
    this.selectedModel = '';
    this.search = '';
    this.selectedCategory = 'all';
    this.selectedProvider = 'all';
    this.selectedOrigin = 'all';
  }

  setOrigin(origin) {
    if (origin === this.selectedOrigin) return;
    this.selectedOrigin = origin;
    this.selectedProvider = 'all';
  }

  firstUpdated() {
    // React: scroll the active model into view on mount.
    const active = this.renderRoot.querySelector('[data-model-active]');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  get activeCategory() {
    return MODEL_CATEGORIES.find((c) => c.id === this.selectedCategory) || MODEL_CATEGORIES[0];
  }

  get originEntries() {
    return this.activeCategory.entries.filter(({ model: m }) => matchesOrigin(m, this.selectedOrigin));
  }

  get availableProviders() {
    const out = [];
    const seen = new Set();
    this.originEntries.forEach(({ model: m }) => {
      const pId = m.provider || 'self-hosted';
      const pName = m.provider_name || 'Muapi';
      if (!seen.has(pId)) {
        seen.add(pId);
        out.push({ id: pId, name: pName });
      }
    });
    return out;
  }

  get filteredEntries() {
    const query = this.search.toLowerCase();
    const provider = this.selectedProvider;
    const filterFn = ({ model: m }) => {
      if (provider !== 'all') {
        const pId = m.provider || 'self-hosted';
        if (pId !== provider) return false;
      }
      return m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query);
    };
    const matches = this.originEntries.filter(filterFn);
    return {
      main: matches.filter(({ category }) => category !== 'v2v'),
      v2v: matches.filter(({ category }) => category === 'v2v'),
    };
  }

  _pick(model, category) {
    this.dispatchEvent(
      new CustomEvent('select', { detail: { model, category }, bubbles: true, composed: true }),
    );
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  _renderItem(entry) {
    const { model: m, category } = entry;
    const isV2V = category === 'v2v';
    return html`
      <div
        data-model-active=${this.selectedModel === m.id ? '' : null}
        @click=${(e) => {
          e.stopPropagation();
          this._pick(m, category);
        }}
        class=${'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all border border-transparent hover:border-white/5 '}${
          this.selectedModel === m.id ? 'bg-white/5 border-white/5' : ''
        }
      >
        <div class="flex items-center gap-3.5">
          ${PROVIDER_LOGOS[m.provider]
            ? html`<div class="w-8 h-8 rounded-xl border border-white/5 overflow-hidden shrink-0 flex items-center justify-center bg-white/[0.02]">
                <img
                  src=${PROVIDER_LOGOS[m.provider]}
                  alt=${m.provider_name}
                  class=${'w-full h-full object-contain p-1 '}${invertLogos.includes(m.provider)
                    ? 'invert'
                    : ''}
                />
              </div>`
            : html`<div
                class=${'w-9 h-9 ' +
                  getIconColor(m, isV2V) +
                  ' border rounded-xl flex items-center justify-center font-black text-xs shadow-inner uppercase'}
              >${m.name.charAt(0)}</div>`}
          <div class="flex flex-col gap-0.5 min-w-0">
            <span class="flex items-center gap-1.5 min-w-0">
              <span class="text-xs font-bold text-white tracking-tight truncate">${m.name}</span>${modelOriginBadge(m)}
            </span>${
              isV2V
                ? html`<span class="text-[9px] text-orange-400/70">${
                    m.imageField ? 'Upload a video and image' : 'Upload a video to use'
                  }</span>`
                : this.selectedProvider === 'all' && m.provider_name
                  ? html`<span class="text-[9px] text-white/40">${m.provider_name}</span>`
                  : nothing
            }
          </div>
        </div>
        ${this.selectedModel === m.id
          ? html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="4">
              <polyline points="20 6 9 17 4 12" />
            </svg>`
          : nothing}
      </div>
    `;
  }

  render() {
    const { main, v2v } = this.filteredEntries;
    const providers = this.availableProviders;

    return html`
      <div class="flex gap-4 h-full max-h-[70vh] min-h-[350px]">
        <div
          class="flex flex-col gap-2.5 items-center pr-2 border-r border-white/5 shrink-0 select-none overflow-y-auto custom-scrollbar w-14 pt-0.5"
        >
          <button
            type="button"
            @click=${() => (this.selectedProvider = 'all')}
            class=${'w-8 h-8 rounded-full flex items-center justify-center border transition-all flex-shrink-0 cursor-pointer '}${
              this.selectedProvider === 'all'
                ? 'bg-white/10 text-yellow-400 border-yellow-500/30 shadow-md scale-105'
                : 'bg-white/[0.02] text-white/50 border-white/[0.03] hover:bg-white/5 hover:text-white'
            }
            title="All Providers"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill=${this.selectedProvider === 'all' ? 'currentColor' : 'none'}
              stroke="currentColor"
              stroke-width="2"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          ${providers.map(
            (p) => html`
              <button
                type="button"
                @click=${() => (this.selectedProvider = p.id)}
                class=${'w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center font-black text-[10px] border transition-all flex-shrink-0 cursor-pointer overflow-hidden '}${
                  this.selectedProvider === p.id
                    ? `${getProviderStyle(p.id).bg} border-white/25 scale-105 shadow-md`
                    : 'bg-white/[0.02] text-white/40 border-white/[0.02] hover:bg-white/5 hover:text-white/80'
                }
                title=${p.name}
              >${PROVIDER_LOGOS[p.id]
                ? html`<img
                    src=${PROVIDER_LOGOS[p.id]}
                    alt=${p.name}
                    class=${'w-full h-full rounded-full object-contain '}${invertLogos.includes(p.id)
                      ? 'invert'
                      : ''}
                  />`
                : getProviderStyle(p.id).text}</button>
            `,
          )}
        </div>

        <div class="flex-1 flex flex-col gap-2 min-w-0">
          <div class="px-1 pb-2 border-b border-white/5 shrink-0 space-y-2">
            <div class="flex gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
              ${MODEL_CATEGORIES.map(
                (category) => html`
                  <button
                    type="button"
                    @click=${() => {
                      this.selectedCategory = category.id;
                      this.selectedProvider = 'all';
                    }}
                    class=${'shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-colors border '}${
                      this.selectedCategory === category.id
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'bg-white/[0.02] text-white/50 border-white/[0.04] hover:bg-white/5 hover:text-white'
                    }
                  >${category.label}</button>
                `,
              )}
            </div>
            <div
              class="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2 border border-white/5 focus-within:border-primary/50 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-muted">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search models..."
                .value=${this.search}
                @click=${(e) => e.stopPropagation()}
                @input=${(e) => (this.search = e.currentTarget.value)}
                class="bg-transparent border-none text-xs text-white focus:ring-0 w-full p-0 focus:outline-none"
              />
            </div>
          </div>

          <div class="text-xs font-bold text-secondary px-2 py-1 shrink-0 flex items-center justify-between gap-2">
            <span class="min-w-0 truncate">${
              this.selectedOrigin === 'local'
                ? 'Local models'
                : this.selectedOrigin === 'api'
                  ? 'API (3rd party) models'
                  : `${this.activeCategory.label} models`
            }</span>
            <div class="flex items-center gap-2 shrink-0">${this.selectedProvider !== 'all'
              ? html`<span class="text-[10px] bg-white/5 px-2 py-0.5 rounded text-white/60">${
                  providers.find((p) => p.id === this.selectedProvider)?.name ||
                  this.selectedProvider
                }</span>`
              : nothing}${originFilterPills(this.selectedOrigin, (o) => this.setOrigin(o))}</div>
          </div>

          <div class="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2 flex-1">
            ${main.length === 0 && v2v.length === 0
              ? html`<div class="text-xs text-white/30 text-center py-6">No models found</div>`
              : html`
                  ${main.map((entry) => this._renderItem(entry))}
                  ${v2v.length > 0
                    ? html`
                        <div class="text-xs font-bold text-orange-400/70 px-3 py-2 mt-1 border-t border-white/5">
                          Video Tools
                        </div>
                        ${v2v.map((entry) => this._renderItem(entry))}
                      `
                    : nothing}
                `}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('video-model-dropdown', VideoModelDropdown);
