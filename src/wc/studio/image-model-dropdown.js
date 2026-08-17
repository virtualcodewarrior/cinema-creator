// Port of the ModelDropdown function in packages/studio/src/components/ImageStudio.jsx.
// Two-pane model picker: provider icon sidebar, All/Text-to-Image/Image-to-Image
// category tabs, search box, filtered list. Emits `select` {model, category}
// and `close` (its own item click closes the parent popover).
//
// Porting notes:
// - React scrolls the active model row into view on mount; mirrored in
//   firstUpdated (the element mounts each time the popover opens).
// - `availableProviders` is derived from the ACTIVE category's entries in
//   the original (so provider tabs change with the selected category) —
//   kept exactly, including the first-seen ordering.
import { html, nothing } from 'lit';
import { BaseElement } from '../../lib/wc-base.js';
import { t2iModels, i2iModels } from 'studio/models.js';

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
      ...t2iModels.map((model) => ({ model, category: 't2i' })),
      ...i2iModels.map((model) => ({ model, category: 'i2i' })),
    ],
  },
  {
    id: 't2i',
    label: 'Text to Image',
    entries: t2iModels.map((model) => ({ model, category: 't2i' })),
  },
  {
    id: 'i2i',
    label: 'Image to Image',
    entries: i2iModels.map((model) => ({ model, category: 'i2i' })),
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

export class ImageModelDropdown extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    selectedModel: { type: String },
    search: { state: true },
    selectedCategory: { state: true },
    selectedProvider: { state: true },
  };

  constructor() {
    super();
    this.selectedModel = '';
    this.search = '';
    this.selectedCategory = 'all';
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

  get availableProviders() {
    const out = [];
    const seen = new Set();
    this.activeCategory.entries.forEach(({ model: m }) => {
      const pId = m.provider || 'self-hosted';
      const pName = m.provider_name || 'Muapi';
      if (!seen.has(pId)) {
        seen.add(pId);
        out.push({ id: pId, name: pName });
      }
    });
    return out;
  }

  get filtered() {
    const query = this.search.toLowerCase();
    const provider = this.selectedProvider;
    return this.activeCategory.entries.filter(({ model: m }) => {
      if (provider !== 'all') {
        const pId = m.provider || 'self-hosted';
        if (pId !== provider) return false;
      }
      return m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query);
    });
  }

  _pick(model, category) {
    this.dispatchEvent(
      new CustomEvent('select', { detail: { model, category }, bubbles: true, composed: true }),
    );
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  render() {
    const filtered = this.filtered;
    const providers = this.availableProviders;

    return html`
      <div class="flex gap-4 h-full max-h-[60vh] min-h-[350px] overflow-x-hidden">
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
          <div class="border-b border-white/5 shrink-0 pb-2 space-y-2">
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

          <div class="text-xs font-semibold text-secondary py-1 shrink-0 flex items-center justify-between">
            <span>${this.activeCategory.label} models</span>${this.selectedProvider !== 'all'
              ? html`<span class="text-[10px] bg-white/5 px-2 py-0.5 rounded text-white/60">${
                  providers.find((p) => p.id === this.selectedProvider)?.name ||
                  this.selectedProvider
                }</span>`
              : nothing}
          </div>

          <div class="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2 flex-1">
            ${filtered.length === 0
              ? html`<div class="text-xs text-white/30 text-center py-6">No models found</div>`
              : filtered.map(
                  ({ model: m, category }) => html`
                    <div
                      data-model-active=${this.selectedModel === m.id ? '' : null}
                      @click=${(e) => {
                        e.stopPropagation();
                        this._pick(m, category);
                      }}
                      class=${'flex items-center justify-between p-3 hover:bg-white/5 rounded-lg cursor-pointer transition-all border border-transparent hover:border-white/5 '}${
                        this.selectedModel === m.id ? 'bg-white/5 border-white/5' : ''
                      }
                    >
                      <div class="flex items-center gap-3">
                        ${PROVIDER_LOGOS[m.provider]
                          ? html`<div class="w-8 h-8 rounded-full border border-white/5 overflow-hidden shrink-0 flex items-center justify-center bg-white/[0.02]">
                              <img
                                src=${PROVIDER_LOGOS[m.provider]}
                                alt=${m.provider_name}
                                class=${'w-full h-full object-contain p-1 '}${invertLogos.includes(m.provider)
                                  ? 'invert'
                                  : ''}
                              />
                            </div>`
                           : html`<div
                               class=${'w-8 h-8 ' +
                                 (m.family === 'kontext'
                                   ? 'bg-blue-500/10 text-blue-400 border-blue-500/10'
                                   : m.family === 'effects'
                                     ? 'bg-purple-500/10 text-purple-400 border-purple-500/10'
                                     : 'bg-primary/10 text-primary border-primary/10') +
                                 ' border rounded-full flex items-center justify-center font-bold text-xs shadow-inner uppercase'}
                             >${m.name.charAt(0)}</div>`}
                        <div class="flex flex-col gap-0.5 min-w-0">
                          <span class="text-xs font-bold text-white tracking-tight truncate">${m.name}</span>${
                            this.selectedProvider === 'all' && m.provider_name
                              ? html`<span class="text-[9px] text-white/40">${m.provider_name}</span>`
                              : nothing
                          }
                        </div>
                      </div>
                      ${this.selectedModel === m.id
                        ? html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="4">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>`
                        : nothing}
                    </div>
                  `,
                )}
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('image-model-dropdown', ImageModelDropdown);
