// Port of the MediaPickerButton sub-component (40 px circular media upload
// button with idle / uploading / ready states) from
// packages/studio/src/components/LipSyncStudio.jsx. Shared by the ports that
// use the same pattern (Recast, Image, Video, Cinema).
// The element owns the upload (size check, progress ring, uploadFile) and
// dispatches a composed 'change' CustomEvent: detail = { url, name } after a
// successful upload, null when a READY button is clicked to clear.
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { uploadFile } from 'studio/muapi.js';
import { promptMediaButtonClassName } from './prompt-composer.js';

const svgOf = (markup) => unsafeHTML(markup);

// Shown in the READY overlay when the host did not pass a previewUrl (the
// audio picker always renders this music-note + extension fallback).
const MusicNoteIcon = svgOf(
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-primary mb-0.5">' +
    '<path d="M9 18V5l12-2v13" />' +
    '<circle cx="6" cy="18" r="3" />' +
    '<circle cx="18" cy="16" r="3" />' +
    '</svg>',
);

const UPLOAD_STATE = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  READY: 'ready',
};

export class MediaPickerButton extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    accept: { type: String },
    label: { type: String },
    // Idle-state icon SVG *markup string* (each host bakes its own hover
    // classes). A string — not a directive instance — because icons are
    // delivered via a property binding and unsafeHTML may only be stamped in
    // child bindings.
    icon: { type: String },
    apiKey: { attribute: false },
    // Alert wording pieces: `${noun} upload failed: ${err.message}` and the
    // full size-limit message (wording differs per picker in the original).
    noun: { type: String },
    maxMb: { type: Number },
    sizeMessage: { type: String },
    // Whether the READY overlay shows the uploaded media (image/video)
    // instead of the music-note + file-extension fallback.
    preview: { type: Boolean },
    isVideo: { type: Boolean },
    // Restored/uploaded media URL; setting it (or clearing to null) drives
    // the READY/IDLE state.
    value: { type: String },
    fileName: { state: true },
    uploadState: { state: true },
    progress: { state: true },
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
    this.accept = '';
    this.label = '';
    this.icon = null;
    this.apiKey = '';
    this.noun = 'File';
    this.maxMb = 0;
    this.sizeMessage = '';
    this.preview = true;
    this.isVideo = false;
    this.value = '';
    this.fileName = '';
    this.uploadState = this.value ? UPLOAD_STATE.READY : UPLOAD_STATE.IDLE;
    this.progress = 0;
  }

  updated(changed) {
    if (!changed.has('value')) return;
    if (!this.value) {
      this.uploadState = UPLOAD_STATE.IDLE;
      this.fileName = '';
      this.progress = 0;
    } else if (this.uploadState !== UPLOAD_STATE.READY) {
      this.uploadState = UPLOAD_STATE.READY;
      if (!this.fileName) {
        this.fileName = this.value.split('/').pop().slice(-30);
      }
    }
  }

  _emit(detail) {
    this.dispatchEvent(
      new CustomEvent('change', { detail, composed: true }),
    );
  }

  handleClick(e) {
    e.stopPropagation();
    if (this.uploadState === UPLOAD_STATE.READY) {
      this._emit(null);
      return;
    }
    this.renderRoot.querySelector('input[type="file"]')?.click();
  }

  // Shared by the <input type="file"> change and by hosts driving drops.
  async startUpload(file) {
    if (!file) return;
    if (this.maxMb > 0 && file.size > this.maxMb * 1024 * 1024) {
      alert(this.sizeMessage);
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
      this._emit({ url, name: file.name });
    } catch (err) {
      this.uploadState = UPLOAD_STATE.IDLE;
      alert(`${this.noun} upload failed: ${err.message}`);
    } finally {
      this.progress = 0;
    }
  }

  handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    this.startUpload(file);
  }

  render() {
    const ready = this.uploadState === UPLOAD_STATE.READY;
    return html`
      <button
        type="button"
        title=${ready
          ? `${this.fileName} — click to clear`
          : `Upload ${this.label.toLowerCase()} file`}
        @click=${this.handleClick}
        class=${promptMediaButtonClassName({ active: ready })}
      >
        <input
          type="file"
          accept=${this.accept}
          class="hidden"
          @change=${this.handleChange}
        />

        ${this.uploadState === UPLOAD_STATE.IDLE
          ? html`
              <div class="flex flex-col items-center justify-center gap-1 w-full h-full">
                ${this.icon ? svgOf(this.icon) : nothing}
              </div>
            `
          : nothing}

        ${this.uploadState === UPLOAD_STATE.UPLOADING
          ? html`
              <div
                class="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/80 z-20 backdrop-blur-[2px]"
              >
                <svg class="w-8 h-8 -rotate-90">
                  <circle
                    cx="16"
                    cy="16"
                    r="14"
                    stroke="currentColor"
                    stroke-width="2"
                    fill="transparent"
                    class="text-white/10"
                  ></circle>
                  <circle
                    cx="16"
                    cy="16"
                    r="14"
                    stroke="currentColor"
                    stroke-width="2"
                    fill="transparent"
                    stroke-dasharray="88"
                    stroke-dashoffset=${88 - (88 * this.progress) / 100}
                    class="text-primary transition-all duration-300"
                  ></circle>
                </svg>
                <span class="absolute text-[9px] font-black text-primary leading-none"
                  >${this.progress}%</span
                >
              </div>
            `
          : nothing}

        ${ready
          ? html`
              <div
                class="flex flex-col items-center justify-center gap-1 w-full h-full absolute inset-0 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-all"
              >
                ${this.preview && this.value
                  ? this.isVideo
                    ? html`
                        <video
                          src=${this.value}
                          class="w-full h-full object-cover"
                          muted
                        ></video>
                      `
                    : html`
                        <img
                          src=${this.value}
                          alt=""
                          class="w-full h-full object-cover"
                        />
                      `
                  : html`
                      <div class="flex flex-col items-center justify-center w-full px-1">
                        ${MusicNoteIcon}
                        <span
                          class="text-[7px] font-black text-primary uppercase truncate w-full text-center"
                          >${(this.fileName || '').split('.').pop() ||
                          'AUD'}</span
                        >
                      </div>
                    `}
              </div>
            `
          : nothing}
      </button>
    `;
  }
}

customElements.define('media-picker-button', MediaPickerButton);
