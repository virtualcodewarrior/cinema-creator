// Port of packages/studio/src/components/MobileGenerationActions.jsx's
// consumer: packages/studio/src/components/MarketingStudio.jsx.
// PromptComposer family -> elements (see prompt-composer.js);
// MobileGenerationActions / GenerationCopyButtons -> elements;
// UploadSlot + asset dropdowns stay template functions (parent-owned state).
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { uploadFile, generateMarketingStudioAd } from 'studio/muapi.js';
import { scopedPersistKey, migrateLegacyPersistKey } from 'studio/persistKey.js';
import {
  PromptComposer,
  PromptTextarea,
  PromptPopover,
  PromptFooter,
  PromptControls,
  PromptAction,
  promptPopoverHeader,
  promptMenuList,
  promptMenuItem,
  PromptChevronIcon,
  PromptAspectRatioIcon,
  PromptDurationIcon,
  PromptQualityIcon,
  promptControlClassName,
  promptMediaButtonClassName,
  PROMPT_CONTROL_LABEL_CLASS,
  joinClasses,
} from './prompt-composer.js';
import {
  GenerationCopyButtons,
  MobileGenerationActions,
} from './mobile-generation-actions.js';

const svgOf = (markup) => unsafeHTML(markup);

// ── Icons ────────────────────────────────────────────────────────────────────

const CheckSvg = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="4"><polyline points="20 6 9 17 4 12" /></svg>',
);

const CloseSvg = svgOf(
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>',
);

const ProductIcon = svgOf(
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M21 8l-2-2H5L3 8v10a2 2 0 002 2h14a2 2 0 002-2V8z" />' +
    '<path d="M3 10h18" />' +
    '<path d="M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></svg>',
);

const AvatarIcon = svgOf(
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />' +
    '<circle cx="12" cy="7" r="4" /></svg>',
);

const RefIcon = svgOf(
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />' +
    '<circle cx="8.5" cy="8.5" r="1.5" />' +
    '<polyline points="21 15 16 10 5 21" /></svg>',
);

const SearchPlusIcon = svgOf(
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<circle cx="11" cy="11" r="8" />' +
    '<line x1="21" y1="21" x2="16.65" y2="16.65" />' +
    '<line x1="11" y1="8" x2="11" y2="14" />' +
    '<line x1="8" y1="11" x2="14" y2="11" /></svg>',
);

const DownloadSvg = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>',
);

const TrashSvg = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<polyline points="3 6 5 6 21 6" />' +
    '<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />' +
    '<line x1="10" y1="11" x2="10" y2="17" />' +
    '<line x1="14" y1="11" x2="14" y2="17" /></svg>',
);

const LeftArrowSvg = svgOf(
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>',
);

const RightArrowSvg = svgOf(
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>',
);

// ── Assets ───────────────────────────────────────────────────────────────────

const ASSETS = {
  avatar: [
    { id: 'aa252283-8591-4d14-91a8-41ce54187992', name: 'Priya', url: '/assets/marketing/Priya.webp' },
    { id: 'ba6c9b18-f79c-4dab-9649-88a181d0a038', name: 'Elena', url: '/assets/marketing/Elena.webp' },
    { id: '30e2cadd-987c-4a7a-81c3-094d4fb3a65e', name: 'Kai', url: '/assets/marketing/Kai.webp' },
    { id: 'fbed59e1-4b8d-4625-9140-ef2044e0be72', name: 'Sora', url: '/assets/marketing/Sora.webp' },
    { id: 'bcd9e6ee-c000-48e6-9f4b-a20fc2a674f7', name: 'Minji', url: '/assets/marketing/Minji.webp' },
    { id: '1da384ed-3856-45e4-bf4c-a496c7aa95ff', name: 'Margot', url: '/assets/marketing/Margot.webp' },
    { id: 'b799c8f5-fb6e-4905-b33b-cdefac153ec3', name: 'Niko', url: '/assets/marketing/Niko.webp' },
    { id: 'b6971dd4-55fa-4e64-b318-392b16504284', name: 'Jin', url: '/assets/marketing/Jin.webp' },
  ],
  ugc: [
    { id: 1, name: 'UGC', url: '/assets/marketing/ugc.mp4' },
    { id: 2, name: 'Tutorial', url: '/assets/marketing/ugc_how_to.mp4' },
    { id: 3, name: 'Unboxing', url: '/assets/marketing/ugc_unboxing.mp4' },
    { id: 4, name: 'Hyper Motion', url: '/assets/marketing/hyper-motion-mini.mp4' },
    { id: 5, name: 'Product Review', url: '/assets/marketing/product_review.mp4' },
    { id: 6, name: 'TV Spot', url: '/assets/marketing/tv-spot-mini.mp4' },
  ],
};

const OPTIONS = {
  ratio: ['9:16', '3:4', '4:3', '16:9', '1:1'],
  res: ['720p', '1080p'],
  duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
};

const LEGACY_PERSIST_KEY = 'hg_marketing_studio_persistent';

export class StudioMarketing extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    // White-label contract props (were React props).
    apiKey: { type: String },
    droppedFiles: { attribute: false },
    onFilesHandled: { attribute: false },
    onGenerationStart: { attribute: false },
    onGenerationEnd: { attribute: false },
    onGenerationComplete: { attribute: false },
    onGenerationError: { attribute: false },
    historyItems: { attribute: false },

    prompt: { state: true },
    productImage: { state: true },
    avatarImage: { state: true },
    additionalImages: { state: true },
    params: { state: true },
    localHistory: { state: true },
    isGenerating: { state: true },
    dropdown: { state: true }, // 'format' | 'avatar' | 'ratio' | 'res' | 'duration'
    uploadProgress: { state: true },
    fullscreenUrl: { state: true },
    previewAvatar: { state: true },
    slideDirection: { state: true }, // 'next' | 'prev'
  };

  static styles = [
    css`
      :host {
        display: block;
        height: 100%;
      }
      /* From the original's inline <style> block (SCROLLBAR_STYLE). */
      .custom-scrollbar-thin::-webkit-scrollbar {
        height: 4px;
      }
      .custom-scrollbar-thin::-webkit-scrollbar-track {
        background: transparent;
      }
      .custom-scrollbar-thin::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
      }
      .custom-scrollbar-thin::-webkit-scrollbar-thumb:hover {
        background: rgba(34, 211, 238, 0.3);
      }
      /* From the avatar preview modal's dynamic <style> block. */
      @keyframes slide-in-next {
        0% {
          transform: translateX(80px) scale(0.95);
          filter: blur(4px);
          opacity: 0.5;
        }
        100% {
          transform: translateX(0) scale(1);
          filter: blur(0);
          opacity: 1;
        }
      }
      @keyframes slide-in-prev {
        0% {
          transform: translateX(-80px) scale(0.95);
          filter: blur(4px);
          opacity: 0.5;
        }
        100% {
          transform: translateX(0) scale(1);
          filter: blur(0);
          opacity: 1;
        }
      }
      .animate-slide-next {
        animation: slide-in-next 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .animate-slide-prev {
        animation: slide-in-prev 350ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
    `,
  ];

  constructor() {
    super();
    this.apiKey = '';
    this.droppedFiles = null;
    this.onFilesHandled = null;
    this.onGenerationStart = null;
    this.onGenerationEnd = null;
    this.onGenerationComplete = null;
    this.onGenerationError = null;
    this.historyItems = null;

    this.prompt = '';
    this.productImage = null;
    this.avatarImage = null;
    this.additionalImages = [];
    this.params = {
      ratio: '9:16',
      format: ASSETS.ugc[0].name,
      videoUrl: ASSETS.ugc[0].url,
      res: '1080p',
      duration: 5,
    };
    this.localHistory = [];
    this.isGenerating = false;
    this.dropdown = null;
    this.uploadProgress = { product: 0, avatar: 0, additional: 0 };
    this.fullscreenUrl = null;
    this.previewAvatar = null;
    this.slideDirection = 'next';

    this._persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey);
    this._saveTimer = null;
    this._outsideClickBound = null;
  }

  get history() {
    return this.historyItems ?? this.localHistory;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._persistKey !== scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey)) {
      this._persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey);
    }
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, this._persistKey);
    try {
      const stored = localStorage.getItem(this._persistKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.prompt) this.prompt = data.prompt;
        if (data.params) this.params = data.params;
        if (data.productImage) this.productImage = data.productImage;
        if (data.avatarImage) this.avatarImage = data.avatarImage;
        if (data.additionalImages)
          this.additionalImages = data.additionalImages;
        if (data.localHistory) this.localHistory = data.localHistory;
        else if (data.history) this.localHistory = data.history;
      }
    } catch (err) {
      console.warn('Load failed', err);
    }
  }

  firstUpdated() {
    // Equivalent of the per-Dropdown outside-click effects: one listener for
    // whichever dropdown is open. Popover content is found via the
    // data-popover marker (composedPath, shadow-safe).
    this._outsideClickBound = (e) => {
      if (!this.dropdown) return;
      // The [data-popover] div lives inside the <prompt-popover> element's
      // own shadow root — look through it.
      const host = this.renderRoot.querySelector('prompt-popover');
      const popover = host?.shadowRoot?.querySelector('[data-popover]');
      if (popover && e.composedPath().includes(popover)) return;
      this.dropdown = null;
    };
    window.addEventListener('click', this._outsideClickBound);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._outsideClickBound)
      window.removeEventListener('click', this._outsideClickBound);
    if (this._saveTimer) clearTimeout(this._saveTimer);
  }

  updated(changed) {
    const saveKeys = new Set([
      'prompt',
      'params',
      'productImage',
      'avatarImage',
      'additionalImages',
      'localHistory',
    ]);
    // changed is a Map — iterate keys, not entries.
    for (const key of changed.keys()) {
      if (saveKeys.has(key)) {
        this._scheduleSave();
        break;
      }
    }
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      const state = {
        prompt: this.prompt,
        params: this.params,
        productImage: this.productImage,
        avatarImage: this.avatarImage,
        additionalImages: this.additionalImages,
        localHistory: this.localHistory,
      };
      try {
        localStorage.setItem(this._persistKey, JSON.stringify(state));
      } catch (err) {
        console.warn('Save failed', err);
      }
    }, 500);
  }

  // ── Handlers ───────────────────────────────────────────────────────────

  async downloadFile(url, filename) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  }

  async handleUpload(e, target) {
    // Uncontrolled input, like the React original: no value reset, so
    // re-selecting the same file does not re-fire change.
    const files = Array.from(e.target.files);
    if (!files.length) return;

    if (target === 'additional') {
      const remaining = 6 - this.additionalImages.length;
      const toUpload = files.slice(0, remaining);
      for (const file of toUpload) {
        try {
          const url = await uploadFile(this.apiKey, file, (pct) => {
            this.uploadProgress = {
              ...this.uploadProgress,
              additional: pct,
            };
          });
          this.additionalImages = [...this.additionalImages, url].slice(0, 6);
        } catch (err) {
          alert(err.message);
        }
      }
    } else {
      const file = files[0];
      try {
        const url = await uploadFile(this.apiKey, file, (pct) => {
          this.uploadProgress = {
            ...this.uploadProgress,
            [target]: pct,
          };
        });
        if (target === 'product') this.productImage = url;
        else this.avatarImage = url;
      } catch (err) {
        alert(err.message);
      }
    }
    this.uploadProgress = {
      ...this.uploadProgress,
      [target]: 0,
    };
  }

  async handleGenerate() {
    if (!this.prompt.trim()) return alert('Please enter an ad script.');
    if (!this.productImage) return alert('Please upload a product image.');

    this.onGenerationStart?.();
    this.isGenerating = true;
    try {
      const result = await generateMarketingStudioAd(this.apiKey, {
        prompt: this.prompt,
        aspect_ratio: this.params.ratio,
        duration: this.params.duration,
        resolution: this.params.res,
        images_list: [
          this.productImage,
          this.avatarImage,
          ...this.additionalImages,
        ].filter(Boolean),
        video_files: this.params.videoUrl ? [this.params.videoUrl] : [],
      });

      if (result?.url) {
        const entry = {
          id: Date.now(),
          url: result.url,
          prompt: this.prompt,
          format: this.params.format,
          timestamp: new Date().toISOString(),
        };
        if (!this.historyItems) {
          this.localHistory = [entry, ...this.localHistory];
        }
        this.fullscreenUrl = result.url;
        this.onGenerationComplete?.({ url: result.url, type: 'video' });
      }
    } catch (err) {
      this.onGenerationError?.(
        err.message?.slice(0, 120) || 'Marketing generation failed',
      );
    } finally {
      this.isGenerating = false;
      this.onGenerationEnd?.();
    }
  }

  _setParams(patch) {
    this.params = { ...this.params, ...patch };
  }

  renderUploadSlot({ icon, url, progress, label, target, multiple = false }) {
    return html`
      <div class="relative group/slot flex items-center">
        <div
          @click=${() =>
            this.renderRoot
              .querySelector(`input[data-slot="${target}"]`)
              ?.click()}
          title="Upload ${label}"
          class=${promptMediaButtonClassName({
            active: Boolean(url),
            className: 'cursor-pointer',
          })}
        >
          <input
            data-slot=${target}
            type="file"
            accept="image/*"
            class="hidden"
            ?multiple=${multiple}
            @change=${(e) => this.handleUpload(e, target)}
          />

          ${progress > 0 && progress < 100
            ? html`
                <div
                  class="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center z-10"
                >
                  <span class="text-[8px] font-black text-primary"
                    >${progress}%</span
                  >
                </div>
              `
            : url
              ? html`
                  <div
                    class="w-full h-full rounded-full overflow-hidden border border-black/20"
                  >
                    <img
                      src=${url}
                      class="w-full h-full object-cover"
                      alt=${label}
                    />
                  </div>
                `
              : html`
                  <div
                    class="text-white/40 group-hover:text-primary transition-colors"
                    >${icon}</div
                  >
                `}

          <!-- Clear Button (Single) -->
          ${url && !multiple
            ? html`
                <button
                  @click=${(e) => {
                    e.stopPropagation();
                    if (target === 'product') this.productImage = null;
                    else if (target === 'avatar') this.avatarImage = null;
                    else this.additionalImages = [];
                  }}
                  class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity shadow-lg"
                >
                  ${CloseSvg}
                </button>
              `
            : nothing}
        </div>
      </div>
    `;
  }

  renderAssetDropdown({ title, items, selectedId, onSelect, isVideo = false, onPreview = null, wide = false }) {
    return html`
      <prompt-popover
        class=${wide ? 'w-[420px] max-w-[calc(100vw-2rem)]' : ''}
      >
        ${promptPopoverHeader(
          title,
          wide ? 'mb-3' : '',
        )}
        ${wide
          ? html`
              <div
                class="grid grid-cols-3 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-1"
              >
                ${items.map(
                  (item) => html`
                    <div
                      @click=${() => onSelect(item)}
                      class="relative rounded overflow-hidden border-2 transition-all group cursor-pointer ${
                        selectedId === item.id || selectedId === item.url
                          ? 'border-primary shadow-glow'
                          : 'border-white/5 hover:border-white/20'
                      }"
                    >
                      ${onPreview && !isVideo
                        ? html`
                            <button
                              type="button"
                              title="Enlarge preview"
                              @click=${(e) => {
                                e.stopPropagation();
                                onPreview(item);
                              }}
                              class="absolute top-1.5 left-1.5 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#22d3ee] hover:text-black transition-all border border-white/10 z-20 text-white"
                            >
                              ${SearchPlusIcon}
                            </button>
                          `
                        : nothing}

                      ${isVideo
                        ? html`
                            <video
                              src=${item.url}
                              autoPlay
                              loop
                              muted
                              class="w-full aspect-[3/4] object-cover group-hover:scale-105 transition-all duration-500"
                            ></video>
                          `
                        : html`
                            <img
                              src=${item.url}
                              class="w-full aspect-square object-cover group-hover:scale-105 transition-all duration-500"
                              alt=${item.name}
                            />
                          `}
                      <div
                        class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <span
                          class="text-[9px] font-black text-white uppercase tracking-tight"
                          >${item.name}</span
                        >
                      </div>
                      ${selectedId === item.id || selectedId === item.url
                        ? html`
                            <div
                              class="absolute top-1.5 right-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center shadow-lg"
                            >
                              ${CheckSvg}
                            </div>
                          `
                        : nothing}
                    </div>
                  `,
                )}
              </div>
            `
          : html`
              ${promptMenuList(
                items.map(
                  (opt) =>
                    promptMenuItem({
                      children: opt,
                      selected: selectedId === opt,
                      onClick: () => {
                        onSelect(opt);
                        this.dropdown = null;
                      },
                    }),
                ),
              )}
            `}
      </prompt-popover>
    `;
  }

  render() {
    const history = this.history;
    return html`
      <div
        class="w-full h-full flex flex-col items-center justify-center bg-app-bg relative overflow-hidden"
      >
        <!-- MAIN CONTENT AREA -->
        <div
          class="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-40 lg:pb-32 px-2"
        >
          ${history.length > 0
            ? html`
                <div
                  class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full pt-4 animate-fade-in-up"
                >
                  ${history.map(
                    (entry) => html`
                      <div
                        @click=${(e) => {
                          // Let the action layers stopPropagation their own
                          // clicks; the card click opens the fullscreen player.
                          this.fullscreenUrl = entry.url;
                        }}
                        class="relative group rounded-lg overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-xl hover:border-primary/50 transition-all duration-300 flex flex-col cursor-pointer"
                      >
                        <video
                          src=${entry.url}
                          class="w-full aspect-video object-cover hover:opacity-80 transition-opacity"
                          muted
                          loop
                          @mouseover=${(e) => e.target.play()}
                          @mouseout=${(e) => {
                            e.target.pause();
                            e.target.currentTime = 0;
                          }}
                        ></video>

                        <!-- Actions Overlay -->
                        <div
                          class="absolute top-2 right-2 hidden md:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <generation-copy-buttons
                            .prompt=${entry.prompt}
                            .onCopyError=${this.onGenerationError}
                          ></generation-copy-buttons>
                          <button
                            @click=${(e) => {
                              e.stopPropagation();
                              this.downloadFile(
                                entry.url,
                                `marketing-ad-${entry.id}.mp4`,
                              );
                            }}
                            class="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                            title="Download"
                          >
                            ${DownloadSvg}
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            @click=${(e) => {
                              e.stopPropagation();
                              if (
                                confirm(
                                  'Are you sure you want to delete this generated item?',
                                )
                              ) {
                                if (!this.historyItems) {
                                  this.localHistory = this.localHistory.filter(
                                    (h) => h.id !== entry.id,
                                  );
                                }
                              }
                            }}
                            class="p-2 bg-black/60 backdrop-blur-md rounded-full text-red-400 hover:bg-red-500 hover:text-white transition-all border border-white/10"
                          >
                            ${TrashSvg}
                          </button>
                        </div>
                        <mobile-generation-actions
                          .prompt=${entry.prompt}
                          .onCopyError=${this.onGenerationError}
                          .actions=${[
                            {
                              kind: 'download',
                              label: 'Download',
                              onSelect: () =>
                                this.downloadFile(
                                  entry.url,
                                  `marketing-ad-${entry.id}.mp4`,
                                ),
                            },
                            {
                              kind: 'delete',
                              label: 'Delete',
                              danger: true,
                              onSelect: () => {
                                if (
                                  confirm(
                                    'Are you sure you want to delete this generated item?',
                                  )
                                ) {
                                  if (!this.historyItems) {
                                    this.localHistory = this.localHistory.filter(
                                      (item) => item.id !== entry.id,
                                    );
                                  }
                                }
                              },
                            },
                          ]}
                        ></mobile-generation-actions>

                        <div
                          class="p-3 bg-black/80 backdrop-blur-sm border-t border-white/5 flex items-center justify-between gap-2"
                        >
                          <div class="flex items-center gap-2">
                            <span
                              class="text-[9px] font-black text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20 uppercase tracking-tighter"
                              >Marketing Studio</span
                            >
                            ${entry.format
                              ? html`<span
                                  class="text-[9px] text-white/40 font-bold"
                                  >${entry.format}</span
                                >`
                              : nothing}
                          </div>
                        </div>
                      </div>
                    `,
                  )}
                </div>
              `
            : html`
                <div
                  class="flex flex-col items-center justify-center h-full animate-fade-in-up transition-all duration-700 min-h-[50vh]"
                >
                  <!-- Overlapping floating cards -->
                  <div
                    class="flex items-center justify-center gap-1.5 md:gap-3 mb-10 select-none scale-90 sm:scale-100"
                  >
                    <div
                      class="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-white/10 shadow-2xl -rotate-[12deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] flex-shrink-0"
                    >
                      <img
                        src="/assets/videomodels/sdxl-image.avif"
                        alt="Creative asset 1"
                        class="w-full h-full object-cover"
                      />
                    </div>
                    <div
                      class="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-white/10 shadow-2xl -rotate-[4deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] -ml-3 sm:-ml-4 flex-shrink-0"
                    >
                      <img
                        src="/assets/videomodels/chroma-image.avif"
                        alt="Creative asset 2"
                        class="w-full h-full object-cover"
                      />
                    </div>
                    <div
                      class="w-18 h-18 sm:w-24 sm:h-24 rounded-full border border-white/10 shadow-2xl rotate-[6deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] -ml-3 sm:-ml-4 flex-shrink-0"
                    >
                      <img
                        src="/assets/videomodels/neta-lumina.avif"
                        alt="Creative asset 3"
                        class="w-full h-full object-cover"
                      />
                    </div>
                    <div
                      class="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-white/10 shadow-2xl rotate-[12deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] -ml-3 sm:-ml-4 flex-shrink-0"
                    >
                      <img
                        src="/assets/videomodels/perfect-pony-xl.avif"
                        alt="Creative asset 4"
                        class="w-full h-full object-cover"
                      />
                    </div>
                  </div>

                  <h1
                    class="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-center px-4 flex flex-col items-center"
                  >
                    <span
                      class="text-white font-black uppercase text-xl sm:text-3xl tracking-wide mb-1 opacity-90"
                      >START CREATING WITH</span
                    >
                    <span
                      class="text-[#22d3ee] font-black uppercase text-2xl sm:text-4xl sm:mt-1 tracking-tight"
                      >MARKETING STUDIO</span
                    >
                  </h1>
                  <p
                    class="text-white/40 text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4"
                  >
                    Describe your scene, upload your product, and watch high-converting AI video ads come to life.
                  </p>
                </div>
              `}
        </div>

        <!-- BOTTOM PROMPT BAR -->
        <prompt-composer>
          ${this.additionalImages.length > 0
            ? html`
                <div class="flex items-center gap-1.5">
                  ${this.additionalImages.map(
                    (img, idx) => html`
                      <div class="relative group/img flex-shrink-0">
                        <img
                          src=${img}
                          class="w-9 h-9 rounded-full object-cover border border-white/10"
                        />
                        <button
                          @click=${() =>
                            (this.additionalImages = this.additionalImages.filter(
                              (_, i) => i !== idx,
                            ))}
                          class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity border border-white/10"
                        >
                          ${CloseSvg}
                        </button>
                      </div>
                    `,
                  )}
                </div>
              `
            : nothing}
          <!-- Top Row: Full-width Textarea -->
          <div class="w-full relative">
            <prompt-textarea
              .value=${this.prompt}
              placeholder="Describe your ad script... Use @image1 for product, @image2 for avatar."
              @input=${(e) => (this.prompt = e.currentTarget.value)}
            ></prompt-textarea>
          </div>

          <!-- Bottom Row: Uploads + Controls + Generate -->
          <prompt-footer>
            <prompt-controls>
              <!-- Asset Uploads Group -->
              <div
                class="flex items-center gap-1.5 pr-3 border-r border-white/10"
              >
                ${this.renderUploadSlot({
                  label: 'Product',
                  icon: ProductIcon,
                  url: this.productImage,
                  progress: this.uploadProgress.product,
                  target: 'product',
                })}
                ${this.renderUploadSlot({
                  label: 'Avatar',
                  icon: AvatarIcon,
                  url: this.avatarImage,
                  progress: this.uploadProgress.avatar,
                  target: 'avatar',
                })}
                ${this.renderUploadSlot({
                  label: 'References',
                  icon: RefIcon,
                  url: this.additionalImages[0],
                  progress: this.uploadProgress.additional,
                  target: 'additional',
                  multiple: true,
                })}
              </div>

              <!-- Format Button -->
              <div class="relative">
                <button
                  @click=${(e) => {
                    e.stopPropagation();
                    this.dropdown =
                      this.dropdown === 'format' ? null : 'format';
                  }}
                  class=${promptControlClassName({
                    active: this.dropdown === 'format',
                  })}
                >
                  <div
                    class="w-4 h-4 bg-primary/10 rounded flex items-center justify-center border border-primary/20"
                  ><span class="text-[8px] font-black text-primary uppercase">U</span></div
                  ><span class=${PROMPT_CONTROL_LABEL_CLASS}>${this.params.format}</span
                  >${PromptChevronIcon()}
                </button>
                ${this.dropdown === 'format'
                  ? this.renderAssetDropdown({
                      title: 'Video Format Presets',
                      items: ASSETS.ugc,
                      selectedId: this.params.format,
                      onSelect: (item) =>
                        this._setParams({
                          format: item.name,
                          videoUrl: item.url,
                        }),
                      isVideo: true,
                      wide: true,
                    })
                  : nothing}
              </div>

              <!-- Avatar Preset Button -->
              <div class="relative flex items-center gap-1.5">
                <button
                  @click=${(e) => {
                    e.stopPropagation();
                    this.dropdown =
                      this.dropdown === 'avatar' ? null : 'avatar';
                  }}
                  class=${promptControlClassName({
                    active: this.dropdown === 'avatar',
                  })}
                >
                  <div
                    class="w-4 h-4 rounded-full overflow-hidden border border-white/20 shadow-inner"
                  >
                    <img
                      src=${this.avatarImage || ASSETS.avatar[0].url}
                      class="w-full h-full object-cover"
                    />
                  </div>
                  <span class=${PROMPT_CONTROL_LABEL_CLASS}>
                    ${ASSETS.avatar.find((a) => a.url === this.avatarImage)?.name ||
                    'Select Avatar'}
                  </span>
                  ${PromptChevronIcon()}
                </button>

                ${this.avatarImage
                  ? html`
                      <button
                        type="button"
                        title="Enlarge selected avatar"
                        @click=${(e) => {
                          e.stopPropagation();
                          const currentAvatar = ASSETS.avatar.find(
                            (a) => a.url === this.avatarImage,
                          );
                          if (currentAvatar) {
                            this.previewAvatar = currentAvatar;
                          } else {
                            this.previewAvatar = {
                              id: 'custom',
                              name: 'Custom Uploaded Avatar',
                              url: this.avatarImage,
                            };
                          }
                        }}
                        class=${promptControlClassName({
                          iconOnly: true,
                          className: 'text-white/40 hover:text-[#22d3ee]',
                        })}
                      >
                        ${SearchPlusIcon}
                      </button>
                    `
                  : nothing}

                ${this.dropdown === 'avatar'
                  ? this.renderAssetDropdown({
                      title: 'Avatar Presets',
                      items: ASSETS.avatar,
                      selectedId: this.avatarImage,
                      onSelect: (item) => (this.avatarImage = item.url),
                      onPreview: (item) => (this.previewAvatar = item),
                      wide: true,
                    })
                  : nothing}
              </div>

              <!-- Simple Controls -->
              ${['ratio', 'res', 'duration'].map(
                (key) => html`
                  <div class="relative">
                    <button
                      @click=${(e) => {
                        e.stopPropagation();
                        this.dropdown =
                          this.dropdown === key ? null : key;
                      }}
                      class=${promptControlClassName({
                        active: this.dropdown === key,
                        className:
                          this.dropdown === key
                            ? 'text-xs font-semibold text-[#22d3ee]'
                            : 'text-xs font-semibold text-white/70',
                      })}
                    >
                      ${key === 'ratio'
                        ? PromptAspectRatioIcon()
                        : key === 'res'
                          ? PromptQualityIcon()
                          : PromptDurationIcon()}
                      <span class=${PROMPT_CONTROL_LABEL_CLASS}>
                        ${key === 'duration'
                          ? `${this.params[key]}s`
                          : this.params[key]}
                      </span>
                    </button>
                    ${this.dropdown === key
                      ? this.renderAssetDropdown({
                          title:
                            key === 'ratio'
                              ? 'Aspect Ratio'
                              : key === 'res'
                                ? 'Resolution'
                                : 'Duration',
                          items: OPTIONS[key],
                          selectedId: this.params[key],
                          onSelect: (val) => this._setParams({ [key]: val }),
                        })
                      : nothing}
                  </div>
                `,
              )}
            </prompt-controls>

            <prompt-action
              .disabled=${this.isGenerating}
              @click=${this.handleGenerate}
            >
              ${this.isGenerating
                ? html`
                    <span class="animate-spin inline-block text-black">◌</span>
                    Generating...
                  `
                : html`<span>Launch</span>`}
            </prompt-action>
          </prompt-footer>
        </prompt-composer>

        ${this.renderFullscreens()}
      </div>
    `;
  }

  renderFullscreens() {
    return html`
      <!-- Fullscreen Preview -->
      ${this.fullscreenUrl
        ? html`
            <div
              class="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
              @click=${() => (this.fullscreenUrl = null)}
            >
              <button
                class="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white border border-white/10 transition-colors shadow-2xl"
              >
                ${CloseSvg}
              </button>
              <video
                src=${this.fullscreenUrl}
                controls
                autoPlay
                class="max-w-[95vw] max-h-[95vh] rounded-lg shadow-4xl animate-scale-up"
                @click=${(e) => e.stopPropagation()}
              ></video>
            </div>
          `
        : nothing}

      <!-- AVATAR FULLSCREEN PREVIEW MODAL -->
      ${this.previewAvatar
        ? html`
            <div
              class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md animate-fade-in select-none"
              @click=${() => (this.previewAvatar = null)}
            >
              <!-- Close button (cross) in the right corner -->
              <button
                type="button"
                class="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/10 z-50 animate-fade-in"
                @click=${(e) => {
                  e.stopPropagation();
                  this.previewAvatar = null;
                }}
              >
                ${CloseSvg}
              </button>

              <!-- Left Arrow Button -->
              ${this.previewAvatar.id !== 'custom'
                ? html`
                    <button
                      type="button"
                      class="absolute left-6 p-4 bg-white/5 hover:bg-white/10 hover:text-primary rounded-full text-white transition-all border border-white/10 z-50"
                      @click=${(e) => {
                        e.stopPropagation();
                        const currentIndex = ASSETS.avatar.findIndex(
                          (a) => a.id === this.previewAvatar.id,
                        );
                        if (currentIndex !== -1) {
                          const prevAvatar =
                            ASSETS.avatar[
                              (currentIndex - 1 + ASSETS.avatar.length) %
                                ASSETS.avatar.length
                            ];
                          this.slideDirection = 'prev';
                          this.previewAvatar = prevAvatar;
                        }
                      }}
                    >
                      ${LeftArrowSvg}
                    </button>
                  `
                : nothing}

              <!-- Right Arrow Button -->
              ${this.previewAvatar.id !== 'custom'
                ? html`
                    <button
                      type="button"
                      class="absolute right-6 p-4 bg-white/5 hover:bg-white/10 hover:text-primary rounded-full text-white transition-all border border-white/10 z-50"
                      @click=${(e) => {
                        e.stopPropagation();
                        const currentIndex = ASSETS.avatar.findIndex(
                          (a) => a.id === this.previewAvatar.id,
                        );
                        if (currentIndex !== -1) {
                          const nextAvatar =
                            ASSETS.avatar[
                              (currentIndex + 1) % ASSETS.avatar.length
                            ];
                          this.slideDirection = 'next';
                          this.previewAvatar = nextAvatar;
                        }
                      }}
                    >
                      ${RightArrowSvg}
                    </button>
                  `
                : nothing}

              <!-- Enlarged Image Card and side displays -->
              <div
                class="flex items-center gap-6 md:gap-12 max-w-[95vw] justify-center relative"
              >
                <!-- Previous Avatar Card (Left side) -->
                ${this.previewAvatar.id !== 'custom'
                  ? html`
                      <div
                        @click=${(e) => {
                          e.stopPropagation();
                          const currentIndex = ASSETS.avatar.findIndex(
                            (a) => a.id === this.previewAvatar.id,
                          );
                          if (currentIndex !== -1) {
                            const prevAvatar =
                              ASSETS.avatar[
                                (currentIndex - 1 + ASSETS.avatar.length) %
                                  ASSETS.avatar.length
                              ];
                            this.slideDirection = 'prev';
                            this.previewAvatar = prevAvatar;
                          }
                        }}
                        class="hidden md:flex flex-col items-center opacity-50 hover:opacity-60 scale-75 hover:scale-80 transition-all duration-300 cursor-pointer select-none max-w-[15vw] max-h-[50vh] rounded-xl overflow-hidden border border-white/5 bg-[#0d0d0f]/50"
                      >
                        <img
                          src=${ASSETS.avatar[
                            (ASSETS.avatar.findIndex(
                              (a) => a.id === this.previewAvatar.id,
                            ) -
                              1 +
                              ASSETS.avatar.length) %
                            ASSETS.avatar.length
                          ].url}
                          alt="Previous Avatar"
                          class="w-full h-full object-cover aspect-[3/4]"
                        />
                      </div>
                    `
                  : nothing}

                <!-- Main Active Avatar Card -->
                <div
                  class="relative flex flex-col items-center max-w-[90vw] md:max-w-[45vw] max-h-[85vh] z-10 ${
                    this.slideDirection === 'next'
                      ? 'animate-slide-next'
                      : 'animate-slide-prev'
                  }"
                  @click=${(e) => e.stopPropagation()}
                >
                  <div
                    class="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0d0d0f] shadow-2xl"
                  >
                    <img
                      src=${this.previewAvatar.url}
                      alt=${this.previewAvatar.name}
                      class="max-w-[80vw] md:max-w-[40vw] max-h-[70vh] md:max-h-[65vh] object-contain"
                    />

                    <!-- Overlay with Name of the Avatar -->
                    <div
                      class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-10 flex flex-col items-center justify-end gap-3"
                    >
                      <h2
                        class="text-xl font-black text-white tracking-wide uppercase"
                      >
                        ${this.previewAvatar.name}
                      </h2>

                      <!-- Select button on the enlarged image -->
                      <button
                        type="button"
                        @click=${() => {
                          this.avatarImage = this.previewAvatar.url;
                          this.previewAvatar = null;
                          this.dropdown = null;
                        }}
                        class="bg-[#22d3ee] text-black px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-95 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-[#22d3ee]/20"
                      >
                        ${CheckSvg}
                        Select Avatar
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Next Avatar Card (Right side) -->
                ${this.previewAvatar.id !== 'custom'
                  ? html`
                      <div
                        @click=${(e) => {
                          e.stopPropagation();
                          const currentIndex = ASSETS.avatar.findIndex(
                            (a) => a.id === this.previewAvatar.id,
                          );
                          if (currentIndex !== -1) {
                            const nextAvatar =
                              ASSETS.avatar[
                                (currentIndex + 1) % ASSETS.avatar.length
                              ];
                            this.slideDirection = 'next';
                            this.previewAvatar = nextAvatar;
                          }
                        }}
                        class="hidden md:flex flex-col items-center opacity-50 hover:opacity-60 scale-75 hover:scale-80 transition-all duration-300 cursor-pointer select-none max-w-[15vw] max-h-[50vh] rounded-xl overflow-hidden border border-white/5 bg-[#0d0d0f]/50"
                      >
                        <img
                          src=${ASSETS.avatar[
                            (ASSETS.avatar.findIndex(
                              (a) => a.id === this.previewAvatar.id,
                            ) +
                              1) %
                            ASSETS.avatar.length
                          ].url}
                          alt="Next Avatar"
                          class="w-full h-full object-cover aspect-[3/4]"
                        />
                      </div>
                    `
                  : nothing}
              </div>
            </div>
          `
        : nothing}
    `;
  }
}

customElements.define('studio-marketing', StudioMarketing);