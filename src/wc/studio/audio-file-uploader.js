// Port of the AudioFileUploader inner component from
// packages/studio/src/components/AudioStudio.jsx. Stateful (upload state +
// progress) and reused per model input, so it is its own element.
// React onChange callback -> 'change' CustomEvent (detail = url | null).
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { uploadFile } from 'studio/muapi.js';

const svg = (markup) => unsafeHTML(markup);

const TrashIcon = svg(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<polyline points="3 6 5 6 21 6" />' +
    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />' +
    '<line x1="10" y1="11" x2="10" y2="17" />' +
    '<line x1="14" y1="11" x2="14" y2="17" />' +
    '</svg>',
);

const IdleUploadIcon = svg(
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>' +
    '</svg>',
);

const musicIcon = (className) =>
  svg(
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' +
      (className || '') +
      '"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>',
  );

const UPLOAD_STATE = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  READY: 'ready',
};

export class AudioFileUploader extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    label: { type: String },
    value: { type: String },
    apiKey: { attribute: false },
    uploadState: { state: true },
    progress: { state: true },
    fileName: { state: true },
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
    this.label = '';
    this.value = '';
    this.apiKey = '';
    this.uploadState = this.value ? UPLOAD_STATE.READY : UPLOAD_STATE.IDLE;
    this.progress = 0;
    this.fileName = this.value ? this.value.split('/').pop().slice(-30) : '';
  }

  updated(changed) {
    if (!changed.has('value')) return;
    if (!this.value) {
      this.uploadState = UPLOAD_STATE.IDLE;
      this.fileName = '';
      this.progress = 0;
    } else if (this.uploadState !== UPLOAD_STATE.READY) {
      this.uploadState = UPLOAD_STATE.READY;
      this.fileName = this.value.split('/').pop().slice(-30);
    }
  }

  emitChange(url) {
    this.dispatchEvent(
      new CustomEvent('change', { detail: url, composed: true }),
    );
  }

  async handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      alert('Audio file exceeds 20MB limit.');
      return;
    }

    this.uploadState = UPLOAD_STATE.UPLOADING;
    this.progress = 0;

    try {
      const url = await uploadFile(this.apiKey, file, (pct) => {
        this.progress = pct;
      });
      this.fileName = file.name;
      this.uploadState = UPLOAD_STATE.READY;
      this.emitChange(url);
    } catch (err) {
      this.uploadState = UPLOAD_STATE.IDLE;
      alert(`Upload failed: ${err.message}`);
    } finally {
      this.progress = 0;
    }
  }

  clearFile(e) {
    e.stopPropagation();
    this.emitChange(null);
  }

  openPicker() {
    if (this.uploadState !== UPLOAD_STATE.IDLE) return;
    const input = this.renderRoot.querySelector('input[type="file"]');
    input?.click();
  }

  render() {
    return html`
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-xs font-bold text-zinc-200 uppercase tracking-wider"
            >${this.label}</label
          >
          ${this.uploadState === UPLOAD_STATE.READY
            ? html`<button
                type="button"
                @click=${this.clearFile}
                class="text-xs font-bold text-red-400 hover:text-red-300 transition-colors uppercase tracking-wider flex items-center gap-1.5"
              >
                ${TrashIcon} Clear
              </button>`
            : nothing}
        </div>

        <div
          @click=${() => this.openPicker()}
          class="relative border rounded p-4 transition-all duration-300 flex items-center gap-3.5 cursor-pointer ${
            this.uploadState === UPLOAD_STATE.READY
              ? 'border-primary/60 bg-primary/10 shadow-[0_0_15px_rgba(34,211,238,0.05)]'
              : 'border-zinc-700 bg-zinc-900 hover:bg-zinc-850 hover:border-primary/50'
          }"
        >
          <input
            type="file"
            accept="audio/*"
            class="hidden"
            @change=${this.handleUpload}
          />

          ${this.uploadState === UPLOAD_STATE.IDLE
            ? html`
                <div
                  class="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center text-zinc-200 border border-zinc-700/50"
                >
                  ${IdleUploadIcon}
                </div>
                <div class="text-left">
                  <div class="text-xs font-bold text-white"
                    >Upload audio track</div
                  >
                  <div class="text-[11px] text-zinc-300 font-medium mt-0.5"
                    >MP3, WAV, M4A up to 20MB</div
                  >
                </div>
              `
            : nothing}

          ${this.uploadState === UPLOAD_STATE.UPLOADING
            ? html`
                <div class="w-full flex items-center gap-4">
                  <div class="flex-1">
                    <div
                      class="flex justify-between text-xs text-white/95 mb-1.5 font-bold"
                    >
                      <span>Uploading...</span>
                      <span>${this.progress}%</span>
                    </div>
                    <div
                      class="h-1.5 bg-zinc-800 rounded-full overflow-hidden"
                    >
                      <div
                        class="h-full bg-primary transition-all duration-300"
                        style="width: ${this.progress}%"
                      ></div>
                    </div>
                  </div>
                </div>
              `
            : nothing}

          ${this.uploadState === UPLOAD_STATE.READY
            ? html`
                <div
                  class="w-10 h-10 rounded bg-primary/20 flex items-center justify-center text-primary border border-primary/30"
                >
                  ${musicIcon('text-primary')}
                </div>
                <div class="text-left flex-1 min-w-0">
                  <div class="text-xs font-bold text-white truncate"
                    >${this.fileName}</div
                  >
                  <div class="text-[11px] text-primary font-bold mt-0.5"
                    >Ready to generate</div
                  >
                </div>
              `
            : nothing}
        </div>
      </div>
      `;
  }
}

customElements.define('audio-file-uploader', AudioFileUploader);
