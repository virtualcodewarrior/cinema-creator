// Port of the UploadButton function in packages/studio/src/components/ImageStudio.jsx.
// Round media trigger + "Reference Images" panel: multi-select grid with
// per-entry upload progress placeholders, hover-remove, selection badges,
// restored-URL injection, and a persisted upload history owned by the parent.
//
// Porting notes:
// - React owns `uploadHistory` here and mirrors it up via onHistoryChange;
//   the parent re-injects it as persistedHistory. Mirrored with a
//   `historychange` event + `persistedHistory` property, merging only missing
//   urls (no-op loop, same as the original's merge effect).
// - The window outside-click handler is installed once and guarded, matching
//   the original's mount-time listener (React registers it only while open;
//   the guard makes the observable behavior identical).
// - `e.target` at the window level is shadow-retargeted, so the outside check
//   uses composedPath() instead of the original's contains().
import { html, nothing } from 'lit';
import { BaseElement } from '../../lib/wc-base.js';
import { uploadFile } from 'studio/muapi.js';
import { promptMediaButtonClassName } from './prompt-composer.js';

export class ImageUploadButton extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    apiKey: { type: String },
    maxImages: { type: Number },
    initialUrls: { type: Array },
    persistedHistory: { type: Array },
    label: { type: String },
    panelOpen: { state: true },
    uploading: { state: true },
    selectedEntries: { state: true },
    uploadHistory: { state: true },
    lastUploadProgress: { state: true },
  };

  constructor() {
    super();
    this.apiKey = '';
    this.maxImages = 1;
    this.initialUrls = [];
    this.persistedHistory = null;
    this.label = null;
    this.panelOpen = false;
    this.uploading = false;
    this.selectedEntries = [];
    this.uploadHistory = [];
    this.lastUploadProgress = 0;
    this._outsideClickBound = (e) => {
      if (!this.panelOpen) return;
      const path = e.composedPath();
      const panel = this.renderRoot.querySelector('[data-upload-panel]');
      const trigger = this.renderRoot.querySelector('button[data-upload-trigger]');
      if (
        (panel && !path.includes(panel)) ||
        (trigger && !path.includes(trigger) && (panel || true))
      ) {
        // React: close when the click is outside BOTH the panel and the trigger.
        const inPanel = panel ? path.includes(panel) : false;
        const inTrigger = trigger ? path.includes(trigger) : false;
        if (!inPanel && !inTrigger) this.panelOpen = false;
      }
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.uploadHistory = this.persistedHistory ? [...this.persistedHistory] : [];
    window.addEventListener('click', this._outsideClickBound);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('click', this._outsideClickBound);
  }

  updated(changed) {
    // React: sync from a new persistedHistory prop (merge missing urls).
    if (changed.has('persistedHistory') && this.persistedHistory) {
      const persisted = this.persistedHistory;
      if (persisted.length > 0) {
        const existingUrls = new Set(this.uploadHistory.map((h) => h.url));
        const missing = persisted.filter((h) => h.url && !existingUrls.has(h.url));
        if (missing.length > 0) this.uploadHistory = [...this.uploadHistory, ...missing];
      }
    }
    // React: sync initialUrls from the parent (restored selections).
    if (changed.has('initialUrls') && this.initialUrls && this.initialUrls.length > 0) {
      const currentUrls = this.selectedEntries.map((e) => e.url);
      const isSame =
        this.initialUrls.length === currentUrls.length &&
        this.initialUrls.every((u) => currentUrls.includes(u));
      if (!isSame) {
        this.selectedEntries = this.initialUrls.map((url) => ({ url }));
        const prev = this.uploadHistory;
        const existingUrls = prev.map((h) => h.url);
        const missing = this.initialUrls
          .filter((u) => !existingUrls.includes(u))
          .map((u) => ({ id: `restored-${u}`, name: 'Restored Image', url: u, progress: 100 }));
        this.uploadHistory = [...missing, ...prev];
      }
    }
    // React: when maxImages changes, trim excess selections + input.multiple.
    if (changed.has('maxImages')) {
      if (this.selectedEntries.length > this.maxImages) {
        const trimmed = this.selectedEntries.slice(0, this.maxImages);
        this.selectedEntries = trimmed;
        if (trimmed.length === 0) this._fireClear();
      }
      const input = this.renderRoot.querySelector('input[type="file"]');
      if (input) input.multiple = this.maxImages > 1;
    }
    // React: effect [uploadHistory] -> onHistoryChange(uploadHistory).
    if (changed.has('uploadHistory')) {
      this.dispatchEvent(
        new CustomEvent('historychange', {
          detail: this.uploadHistory,
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  _fireSelect(entries) {
    if (!entries.length) return;
    const urls = entries.map((e) => e.url);
    this.dispatchEvent(
      new CustomEvent('select', {
        detail: { url: urls[0], urls, thumbnail: entries[0].url },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _fireClear() {
    this.dispatchEvent(new CustomEvent('clear', { bubbles: true, composed: true }));
  }

  async _handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const tooLarge = files.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (tooLarge.length > 0) {
      alert(`The following images are too large (max 10MB): ${tooLarge.map((f) => f.name).join(', ')}`);
      return;
    }

    this.uploading = true;
    try {
      const toUpload =
        this.maxImages === 1
          ? files.slice(0, 1)
          : files.slice(0, this.maxImages - this.selectedEntries.length || 1);

      await Promise.all(
        toUpload.map(async (file) => {
          const id = Date.now().toString() + Math.random();
          this.uploadHistory = [{ id, name: file.name, url: null, progress: 0 }, ...this.uploadHistory];
          try {
            const uploadedUrl = await uploadFile(this.apiKey, file, (pct) => {
              this.lastUploadProgress = pct;
              this.uploadHistory = this.uploadHistory.map((h) =>
                h.id === id ? { ...h, progress: pct } : h,
              );
            });
            this.uploadHistory = this.uploadHistory.map((h) =>
              h.id === id ? { ...h, url: uploadedUrl, progress: 100 } : h,
            );
            if (this.selectedEntries.length < this.maxImages) {
              const newEntry = { url: uploadedUrl };
              this.selectedEntries = [...this.selectedEntries, newEntry];
              if (this.maxImages === 1) {
                this._fireSelect([newEntry]);
                this.panelOpen = false;
              }
            }
          } catch (err) {
            console.error('[UploadButton] Upload failed for', file.name, err);
            this.uploadHistory = this.uploadHistory.filter((h) => h.id !== id);
            throw err;
          }
        }),
      );
    } catch (err) {
      alert(`Image upload failed: ${err.message}`);
    } finally {
      this.uploading = false;
      this.lastUploadProgress = 0;
    }
  }

  _handleCellClick(entry) {
    const selIdx = this.selectedEntries.findIndex((e) => e.url === entry.url);
    const isSelected = selIdx !== -1;
    const atMax =
      this.maxImages > 1 && !isSelected && this.selectedEntries.length >= this.maxImages;
    if (atMax) return;

    if (this.maxImages === 1) {
      const newSelected = [{ url: entry.url, localUrl: entry.localUrl }];
      this.selectedEntries = newSelected;
      this._fireSelect(newSelected);
      this.panelOpen = false;
    } else {
      let next;
      if (isSelected) {
        next = this.selectedEntries.filter((_, i) => i !== selIdx);
        if (next.length === 0) this._fireClear();
      } else {
        next = [...this.selectedEntries, { url: entry.url, localUrl: entry.localUrl }];
      }
      this.selectedEntries = next;
    }
  }

  _handleRemoveFromHistory(e, entry) {
    e.stopPropagation();
    if (entry.localUrl) URL.revokeObjectURL(entry.localUrl);
    this.uploadHistory = this.uploadHistory.filter((h) => h.id !== entry.id);
    const next = this.selectedEntries.filter((s) => s.url !== entry.url);
    if (next.length !== this.selectedEntries.length) {
      this.selectedEntries = next;
      if (next.length === 0) this._fireClear();
    }
  }

  _handleDone(e) {
    e.stopPropagation();
    this._fireSelect(this.selectedEntries);
    this.panelOpen = false;
  }

  _renderTriggerContent() {
    if (this.uploading) {
      return html`
        <div class="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/80 z-20 backdrop-blur-[2px]">
          <svg class="w-8 h-8 -rotate-90">
            <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2" fill="transparent" class="text-white/10"></circle>
            <circle
              cx="16"
              cy="16"
              r="14"
              stroke="currentColor"
              stroke-width="2"
              fill="transparent"
              stroke-dasharray="88"
              stroke-dashoffset=${88 - (88 * this.lastUploadProgress) / 100}
              class="text-[#22d3ee] transition-all duration-300"
            ></circle>
          </svg>
          <span class="absolute text-[9px] font-black text-[#22d3ee] leading-none">${this.lastUploadProgress}%</span>
        </div>
      `;
    }
    if (this.label === 'Swap Face') {
      if (this.selectedEntries.length > 0) {
        return html`<img src=${this.selectedEntries[0].url} alt="" class="w-full h-full object-cover" />`;
      }
      return html`<span class="text-[10px] font-bold text-white/50">Face</span>`;
    }
    return html`
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-white/40 group-hover:text-[#22d3ee] transition-colors">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    `;
  }

  render() {
    const isMulti = this.maxImages > 1;
    const count = this.selectedEntries.length;
    const hasSelection = count > 0;

    const defaultLabel = isMulti ? `Add up to ${this.maxImages} images` : 'Reference image';
    const triggerTitle = hasSelection
      ? count > 1
        ? `${count} of ${this.maxImages} images selected — click to manage`
        : isMulti
          ? `1 image selected — click to add more (up to ${this.maxImages})`
          : this.label || 'Reference image'
      : this.label || defaultLabel;

    return html`
      <div class="relative">
        <input
          type="file"
          .multiple=${isMulti}
          accept="image/*"
          class="hidden"
          @change=${this._handleFileChange}
        />
        <button
          type="button"
          data-upload-trigger
          title=${triggerTitle}
          @click=${(e) => {
            e.stopPropagation();
            this.panelOpen = !this.panelOpen;
          }}
          class=${promptMediaButtonClassName({ active: hasSelection })}
        >${this._renderTriggerContent()}</button>

        ${this.panelOpen
          ? html`
              <prompt-popover
                className="w-96 max-w-[calc(100vw-2rem)]"
                @click=${(e) => e.stopPropagation()}
              >
                <div data-upload-panel>
                  <div class="flex items-center justify-between px-1 pb-3 mb-2 border-b border-white/5">
                    <div class="flex flex-col gap-0.5">
                      <span class="text-xs font-bold text-secondary">Reference Images</span>${isMulti
                        ? html`<span class="text-[9px] text-muted">Select up to ${this.maxImages} images</span>`
                        : nothing}
                    </div>
                    <div class="flex items-center gap-2">
                      ${isMulti && hasSelection
                        ? html`
                            <button
                              type="button"
                              @click=${this._handleDone}
                              class="flex items-center gap-1 px-3 py-1.5 bg-primary text-black rounded-xl text-xs font-black transition-all hover:scale-105"
                            >✓ Done (${count})</button>
                          `
                        : nothing}
                      <button
                        type="button"
                        @click=${(e) => {
                          e.stopPropagation();
                          this.panelOpen = false;
                          this.renderRoot.querySelector('input[type="file"]')?.click();
                        }}
                        class="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-full text-xs font-bold transition-all border border-primary/20"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        ${isMulti ? 'Upload files' : 'Upload new'}
                      </button>
                    </div>
                  </div>

                  ${this.uploadHistory.length === 0
                    ? html`
                        <div class="py-6 flex flex-col items-center gap-2 opacity-40">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-secondary">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          <span class="text-xs text-secondary">No uploads yet</span>
                        </div>
                      `
                    : html`
                        <div class="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
                          ${this.uploadHistory.map(
                            (entry) => {
                              const selIdx = this.selectedEntries.findIndex(
                                (e) => e.url === entry.url,
                              );
                              const isSelected = selIdx !== -1;
                              const atMax =
                                isMulti && !isSelected && this.selectedEntries.length >= this.maxImages;
                              return html`
                                <div
                                  title=${entry.name}
                                  @click=${() => entry.url && this._handleCellClick(entry)}
                                  class=${'relative rounded-xl overflow-hidden border-2 cursor-pointer group/cell aspect-square transition-all ' +
                                    (isSelected
                                      ? 'border-primary shadow-glow'
                                      : 'border-white/10 hover:border-white/30') +
                                    ' ' +
                                    (atMax ? 'opacity-40 cursor-not-allowed' : '') +
                                    ' ' +
                                    (!entry.url ? 'cursor-wait' : '')}
                                >
                                  ${entry.url
                                    ? html`<img src=${entry.url} alt=${entry.name} class="w-full h-full object-cover" />`
                                    : html`
                                        <div class="w-full h-full bg-white/5 flex flex-col items-center justify-center">
                                          <div class="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-1"></div>
                                          <span class="text-[10px] font-black text-primary">${entry.progress}%</span>
                                        </div>
                                      `}
                                  ${entry.url
                                    ? html`
                                        <div class="absolute inset-0 bg-black/60 opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-end justify-end p-1">
                                          <button
                                            type="button"
                                            title="Remove from history"
                                            @click=${(e) => this._handleRemoveFromHistory(e, entry)}
                                            class="w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded-md flex items-center justify-center transition-colors"
                                          >
                                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                                              <line x1="18" y1="6" x2="6" y2="18" />
                                              <line x1="6" y1="6" x2="18" y2="18" />
                                            </svg>
                                          </button>
                                        </div>
                                      `
                                    : nothing}
                                  ${isSelected
                                    ? html`
                                        <div class="absolute top-1 left-1 min-w-[20px] h-5 bg-primary rounded-full flex items-center justify-center px-1">
                                          ${isMulti
                                            ? html`<span class="text-[10px] font-black text-black">${selIdx + 1}</span>`
                                            : html`<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="4">
                                                <polyline points="20 6 9 17 4 12" />
                                              </svg>`}
                                        </div>
                                      `
                                    : nothing}
                                </div>
                              `;
                            },
                          )}
                        </div>
                      `}

                  ${isMulti && hasSelection
                    ? html`
                        <div class="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                          <span class="text-xs text-secondary">${count} of ${this.maxImages} selected</span>
                          <button
                            type="button"
                            @click=${this._handleDone}
                            class="px-4 py-1.5 bg-primary text-black rounded-xl text-xs font-black transition-all hover:scale-105"
                          >Use Selected</button>
                        </div>
                      `
                    : nothing}
                </div>
              </prompt-popover>
            `
          : nothing}
      </div>
    `;
  }
}

customElements.define('image-upload-button', ImageUploadButton);
