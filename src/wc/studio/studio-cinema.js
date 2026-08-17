// Port of packages/studio/src/components/CinemaStudio.jsx.
// Cinematic image generation: reference-image upload, prompt, aspect/res
// dropdowns, camera-settings overlay (four grab-to-scroll <scroll-column>s),
// history grid, fullscreen preview.
//
// Porting notes:
// - `canvasUrl` mirrors the original, which sets it (result "canvas view")
//   without any render site — kept (it feeds the original's download flow).
// - `activeHistoryIndex`, `handleRegenerate`, and `resetToPrompt` are dead in
//   the original (declared/defined with no render or call sites) — omitted.
// - The reference-image upload button is cinema-specific (ready preview =
//   image + hover X, 8% progress text) and differs from
//   <media-picker-button>, so it lives inline here.
// - Errors surface only through the (unpassed in this shell)
//   onGenerationError callback — the original has no toast fallback; kept.
// - `animate-fade-in`/`animate-scale-up` have no keyframe definitions in the
//   original app either (the class names are inert there);
//   `animate-fade-in-up` comes from globals.css in the studio sheet.
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { generateImage, uploadFile } from 'studio/muapi.js';
import { scopedPersistKey, migrateLegacyPersistKey } from 'studio/persistKey.js';
import {
  MobileGenerationActions,
  CopyContentIcon,
} from './mobile-generation-actions.js';
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
  promptControlClassName,
  promptMediaButtonClassName,
  PromptAspectRatioIcon,
  PromptQualityIcon,
} from './prompt-composer.js';
import { ScrollColumn } from './scroll-column.js';

const LEGACY_PERSIST_KEY = 'hg_cinema_studio_persistent';

// ─── Constants (inlined from promptUtils) ───────────────────────────────────

const CAMERA_MAP = {
  'Modular 8K Digital': 'modular 8K digital cinema camera',
  'Full-Frame Cine Digital': 'full-frame digital cinema camera',
  'Grand Format 70mm Film': 'grand format 70mm film camera',
  'Studio Digital S35': 'Super 35 studio digital camera',
  'Classic 16mm Film': 'classic 16mm film camera',
  'Premium Large Format Digital':
    'premium large-format digital cinema camera',
};

const LENS_MAP = {
  'Creative Tilt Lens': 'creative tilt lens effect',
  'Compact Anamorphic': 'compact anamorphic lens',
  'Extreme Macro': 'extreme macro lens',
  '70s Cinema Prime': '1970s cinema prime lens',
  'Classic Anamorphic': 'classic anamorphic lens',
  'Premium Modern Prime': 'premium modern prime lens',
  'Warm Cinema Prime': 'warm-toned cinema prime lens',
  'Swirl Bokeh Portrait': 'swirl bokeh portrait lens',
  'Vintage Prime': 'vintage prime lens',
  'Halation Diffusion': 'halation diffusion filter',
  'Clinical Sharp Prime': 'ultra-sharp clinical prime lens',
};

const FOCAL_PERSPECTIVE = {
  8: 'ultra-wide perspective',
  14: 'wide-angle perspective',
  24: 'wide-angle dynamic perspective',
  35: 'natural cinematic perspective',
  50: 'standard portrait perspective',
  85: 'classic portrait perspective',
};

const APERTURE_EFFECT = {
  'f/1.4': 'shallow depth of field, creamy bokeh',
  'f/4': 'balanced depth of field',
  'f/11': 'deep focus clarity, sharp foreground to background',
};

const ASPECT_RATIOS = ['16:9', '21:9', '9:16', '1:1', '4:5'];
const RESOLUTIONS = ['1K', '2K', '4K'];
const CAMERAS = Object.keys(CAMERA_MAP);
const LENSES = Object.keys(LENS_MAP);
const FOCAL_LENGTHS = Object.keys(FOCAL_PERSPECTIVE).map((k) => parseInt(k));
const APERTURES = Object.keys(APERTURE_EFFECT);

function buildNanoBananaPrompt(
  basePrompt,
  camera,
  lens,
  focalLength,
  aperture,
) {
  const cameraDesc = CAMERA_MAP[camera] || camera;
  const lensDesc = LENS_MAP[lens] || lens;
  const perspective = FOCAL_PERSPECTIVE[focalLength] || '';
  const depthEffect = APERTURE_EFFECT[aperture] || '';
  const qualityTags = [
    'professional photography',
    'ultra-detailed',
    '8K resolution',
  ];
  const parts = [
    basePrompt,
    `shot on a ${cameraDesc}`,
    `using a ${lensDesc} at ${focalLength}mm ${perspective ? `(${perspective})` : ''}`,
    `aperture ${aperture}`,
    depthEffect,
    'cinematic lighting',
    'natural color science',
    'high dynamic range',
    qualityTags.join(', '),
  ];
  return parts.filter((p) => p && p.trim() !== '').join(', ');
}

async function fetchImageAsPngBlob(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image request failed with status ${response.status}.`);
  }

  const sourceBlob = await response.blob();
  if (sourceBlob.type === 'image/png') return sourceBlob;

  const objectUrl = URL.createObjectURL(sourceBlob);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Could not decode the image.'));
      element.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create an image clipboard canvas.');
    }

    context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('Could not convert the image to PNG.')),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// ── Inline SVG icons ─────────────────────────────────────────────────────────
const svgOf = (markup) => unsafeHTML(markup);

const CheckIcon = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<path d="M5 12l4 4L19 6" /></svg>',
);

const DownloadIcon = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>',
);

const TrashIcon = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<polyline points="3 6 5 6 21 6" />' +
    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />' +
    '<line x1="10" y1="11" x2="10" y2="17" />' +
    '<line x1="14" y1="11" x2="14" y2="17" />' +
    '</svg>',
);

const UploadIdleIcon = svgOf(
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-white/40 group-hover:text-[#22d3ee] transition-colors">' +
    '<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />' +
    '<circle cx="8.5" cy="8.5" r="1.5" />' +
    '<polyline points="21 15 16 10 5 21" />' +
    '</svg>',
);

const UploadClearIcon = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-white">' +
    '<path d="M18 6L6 18M6 6l12 12" /></svg>',
);

const CameraBadgeIcon = svgOf(
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M14.5 4H9.5L8 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3Z" />' +
    '<circle cx="12" cy="12.5" r="3.5" /></svg>',
);

const OverlayCloseIcon = svgOf(
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M18 6L6 18M6 6l12 12" /></svg>',
);

export class StudioCinema extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    // White-label contract props (were React props).
    apiKey: { type: String },
    onGenerationStart: { attribute: false },
    onGenerationEnd: { attribute: false },
    onGenerationComplete: { attribute: false },
    onGenerationError: { attribute: false },
    historyItems: { attribute: false },

    settings: { state: true },
    resolution: { state: true },
    isOverlayOpen: { state: true },
    isGenerating: { state: true },
    canvasUrl: { state: true },
    fullscreenUrl: { state: true },
    uploadedImage: { state: true },
    isUploadingImage: { state: true },
    imageUploadProgress: { state: true },
    internalHistory: { state: true },
    openDropdown: { state: true },
    copiedPromptIndex: { state: true },
    copiedImageIndex: { state: true },
  };

  static styles = [
    css`
      :host {
        display: block;
        height: 100%;
      }
    `,
  ];

  constructor() {
    super();
    this.apiKey = '';
    this.onGenerationStart = null;
    this.onGenerationEnd = null;
    this.onGenerationComplete = null;
    this.onGenerationError = null;
    this.historyItems = null;

    this.settings = {
      prompt: '',
      aspect_ratio: '16:9',
      camera: CAMERAS[0],
      lens: LENSES[0],
      focal: 35,
      aperture: 'f/1.4',
    };
    this.resolution = '2K';

    this.isOverlayOpen = false;
    this.isGenerating = false;
    this.canvasUrl = null;
    this.fullscreenUrl = null;
    this.uploadedImage = null;
    this.isUploadingImage = false;
    this.imageUploadProgress = 0;

    this.internalHistory = [];
    this.openDropdown = null;
    this.copiedPromptIndex = null;
    this.copiedImageIndex = null;

    this._persistKey = null;
    this._saveTimer = null;
    this._copiedTimers = new Map();
    this._outsideMouseDownBound = null;
    this._escBound = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey);
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, this._persistKey);
    try {
      const stored = localStorage.getItem(this._persistKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.settings) this.settings = data.settings;
        if (data.resolution) this.resolution = data.resolution;
        if (data.internalHistory) this.internalHistory = data.internalHistory;
        if (data.uploadedImage) this.uploadedImage = data.uploadedImage;
      }
    } catch (err) {
      console.warn('Failed to load CinemaStudio persistence:', err);
    }
  }

  get history() {
    return this.historyItems != null ? this.historyItems : this.internalHistory;
  }

  firstUpdated() {
    this._outsideMouseDownBound = (e) => {
      if (!this.openDropdown) return;
      const node = this.renderRoot.querySelector(
        `[data-drop="${this.openDropdown}"]`,
      );
      const path = e.composedPath();
      if (node && !path.includes(node)) this.openDropdown = null;
    };
    document.addEventListener('mousedown', this._outsideMouseDownBound);
    this._escBound = (event) => {
      if (event.key === 'Escape') this.setOverlayOpen(false);
    };
    // Original [historyItems] effect: canvasUrl = first history entry.
    this.canvasUrl = this.history[0]?.url || null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._outsideMouseDownBound)
      document.removeEventListener('mousedown', this._outsideMouseDownBound);
    document.removeEventListener('keydown', this._escBound);
    if (this._saveTimer) clearTimeout(this._saveTimer);
    for (const t of this._copiedTimers.values()) clearTimeout(t);
    this._copiedTimers.clear();
  }

  setOverlayOpen(open) {
    if (this.isOverlayOpen === open) {
      // keep the listener state in sync even on same-value calls
    }
    this.isOverlayOpen = open;
    if (open) document.addEventListener('keydown', this._escBound);
    else document.removeEventListener('keydown', this._escBound);
  }

  // React save effect: 500 ms debounce over the persisted slice.
  _maybeSaveOnUpdate(changed) {
    const saveKeys = new Set([
      'settings',
      'resolution',
      'internalHistory',
      'uploadedImage',
    ]);
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
      this._saveTimer = null;
      try {
        const state = {
          settings: this.settings,
          resolution: this.resolution,
          internalHistory: this.internalHistory,
          uploadedImage: this.uploadedImage,
        };
        localStorage.setItem(this._persistKey, JSON.stringify(state));
      } catch (err) {
        console.warn('Failed to save CinemaStudio persistence:', err);
      }
    }, 500);
  }

  // ── Reference image upload ────────────────────────────────────────────────
  async handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    this.isUploadingImage = true;
    this.imageUploadProgress = 0;

    try {
      const url = await uploadFile(this.apiKey, file, (progress) => {
        this.imageUploadProgress = progress;
      });
      if (url) this.uploadedImage = url;
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      this.isUploadingImage = false;
      this.imageUploadProgress = 0;
      const input = this.renderRoot.querySelector('input[type="file"]');
      if (input) input.value = '';
    }
  }

  // ── Copy helpers ──────────────────────────────────────────────────────────
  async handleCopyPrompt(prompt, index) {
    if (!prompt) return;

    try {
      await navigator.clipboard.writeText(prompt);
      this.copiedPromptIndex = index;
      const timer = window.setTimeout(() => {
        this._copiedTimers.delete(`p${index}`);
        if (this.copiedPromptIndex === index) this.copiedPromptIndex = null;
      }, 1600);
      this._copiedTimers.set(`p${index}`, timer);
    } catch (error) {
      console.error('Failed to copy the prompt:', error);
      this.onGenerationError?.(
        'Could not copy the prompt to the clipboard.',
      );
    }
  }

  async handleCopyImage(url, index) {
    if (!url) return;

    try {
      if (
        !window.isSecureContext ||
        !navigator.clipboard?.write ||
        typeof window.ClipboardItem === 'undefined'
      ) {
        throw new Error('Image clipboard access requires HTTPS or localhost.');
      }

      await navigator.clipboard.write([
        new window.ClipboardItem({
          'image/png': fetchImageAsPngBlob(url),
        }),
      ]);
      this.copiedImageIndex = index;
      const timer = window.setTimeout(() => {
        this._copiedTimers.delete(`i${index}`);
        if (this.copiedImageIndex === index) this.copiedImageIndex = null;
      }, 1600);
      this._copiedTimers.set(`i${index}`, timer);
    } catch (error) {
      console.error('Failed to copy the image:', error);
      this.onGenerationError?.(
        'Could not copy the image. Image copy requires HTTPS or localhost.',
      );
    }
  }

  downloadBlob = (url, filename) =>
    (async () => {
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
    })();

  deleteHistoryEntry(idx) {
    if (confirm('Are you sure you want to delete this generated item?')) {
      this.internalHistory = this.internalHistory.filter(
        (_, i) => i !== idx,
      );
    }
  }

  formatSummaryValue() {
    return `${this.settings.lens}, ${this.settings.focal}mm, ${this.settings.aperture}`;
  }

  // ── Generate ─────────────────────────────────────────────────────────────
  async handleGenerate() {
    const basePrompt = this.settings.prompt.trim();
    if (!basePrompt || this.isGenerating) return;

    this.onGenerationStart?.();
    this.isGenerating = true;

    const finalPrompt = buildNanoBananaPrompt(
      basePrompt,
      this.settings.camera,
      this.settings.lens,
      this.settings.focal,
      this.settings.aperture,
    );

    try {
      const res = await generateImage(this.apiKey, {
        model: this.uploadedImage ? 'nano-banana-pro-edit' : 'nano-banana-pro',
        prompt: finalPrompt,
        aspect_ratio: this.settings.aspect_ratio,
        resolution: this.resolution.toLowerCase(),
        negative_prompt: 'blurry, low quality, distortion, bad composition',
        images_list: this.uploadedImage ? [this.uploadedImage] : [],
      });

      if (res && res.url) {
        const entry = {
          url: res.url,
          timestamp: Date.now(),
          settings: {
            prompt: basePrompt,
            camera: this.settings.camera,
            lens: this.settings.lens,
            focal: this.settings.focal,
            aperture: this.settings.aperture,
            aspect_ratio: this.settings.aspect_ratio,
            resolution: this.resolution,
          },
        };

        if (this.historyItems == null) {
          this.internalHistory = [entry, ...this.internalHistory].slice(0, 50);
        }

        this.canvasUrl = res.url;

        if (this.onGenerationComplete) {
          this.onGenerationComplete({
            url: res.url,
            model: 'nano-banana-pro',
            prompt: basePrompt,
            type: 'cinema',
          });
        }
      } else {
        throw new Error('No data returned');
      }
    } catch (e) {
      console.error(e);
      this.onGenerationError?.(
        e.message?.slice(0, 120) || 'Cinema generation failed',
      );
    } finally {
      this.isGenerating = false;
      this.onGenerationEnd?.();
    }
  }

  // ── Scroll column changes ─────────────────────────────────────────────────
  handleColumnChange(columnKey) {
    return (e) => {
      this.settings = { ...this.settings, [columnKey]: e.detail };
    };
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  renderHistoryCard(entry, idx) {
    const promptCopied = this.copiedPromptIndex === idx;
    const imageCopied = this.copiedImageIndex === idx;
    const download = () =>
      this.downloadBlob(entry.url, `cinema-shot-${entry.id || idx}.jpg`);
    return html`
      <div
        class="relative group rounded-lg overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-xl hover:border-[#22d3ee]/50 transition-all duration-300 flex flex-col cursor-pointer"
        @click=${() => (this.fullscreenUrl = entry.url)}
      >
        <img
          src=${entry.url}
          alt="History item ${idx + 1}"
          class="w-full aspect-[4/3] object-cover bg-black/40"
        />

        <!-- Overlay actions -->
        <div
          class="absolute top-2 right-2 hidden md:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <button
            type="button"
            title=${promptCopied ? 'Prompt copied' : 'Copy prompt'}
            aria-label=${promptCopied ? 'Prompt copied' : 'Copy prompt'}
            @click=${(event) => {
              event.stopPropagation();
              this.handleCopyPrompt(entry.settings?.prompt, idx);
            }}
            class="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 font-black backdrop-blur-md transition-all hover:bg-[#22d3ee] hover:text-black ${
              promptCopied ? 'text-[#22d3ee]' : 'text-white'
            }"
          >
            ${promptCopied ? CheckIcon : CopyContentIcon('text', 17)}
          </button>
          <button
            type="button"
            title=${imageCopied ? 'Image copied' : 'Copy image'}
            aria-label=${imageCopied ? 'Image copied' : 'Copy image'}
            @click=${(event) => {
              event.stopPropagation();
              this.handleCopyImage(entry.url, idx);
            }}
            class="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 font-black backdrop-blur-md transition-all hover:bg-[#22d3ee] hover:text-black ${
              imageCopied ? 'text-[#22d3ee]' : 'text-white'
            }"
          >
            ${imageCopied ? CheckIcon : CopyContentIcon('image', 17)}
          </button>
          <button
            type="button"
            title="Download"
            @click=${(e) => {
              e.stopPropagation();
              download();
            }}
            class="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-[#22d3ee] hover:text-black transition-all border border-white/10"
          >
            ${DownloadIcon}
          </button>
          <button
            type="button"
            title="Delete"
            @click=${(e) => {
              e.stopPropagation();
              this.deleteHistoryEntry(idx);
            }}
            class="p-2 bg-black/60 backdrop-blur-md rounded-full text-red-400 hover:bg-red-500 hover:text-white transition-all border border-white/10"
          >
            ${TrashIcon}
          </button>
        </div>
        <mobile-generation-actions
          .actions=${[
            {
              kind: 'text',
              label: 'Copy prompt',
              onSelect: () =>
                this.handleCopyPrompt(entry.settings?.prompt, idx),
            },
            {
              kind: 'image',
              label: 'Copy image',
              onSelect: () => this.handleCopyImage(entry.url, idx),
            },
            { kind: 'download', label: 'Download', onSelect: download },
            {
              kind: 'delete',
              label: 'Delete',
              danger: true,
              onSelect: () => this.deleteHistoryEntry(idx),
            },
          ]}
        ></mobile-generation-actions>

        <!-- Details -->
        <div
          class="p-3 bg-black/80 backdrop-blur-sm border-t border-white/5 flex-1 flex flex-col justify-between gap-2"
        >
          <p
            class="w-full text-left text-xs line-clamp-3 leading-relaxed text-white/70"
            title=${entry.settings?.prompt || 'No prompt'}
          >
            ${entry.settings?.prompt || 'No prompt'}
          </p>
          <span class="sr-only" aria-live="polite">${promptCopied
              ? 'Prompt copied'
              : imageCopied
                ? 'Image copied'
                : ''}</span
          >
          <div class="flex items-center mt-1 flex-wrap gap-1">
            <div class="flex items-center gap-2">
              <span
                class="text-[10px] font-bold text-[#22d3ee] px-2 py-0.5 bg-[#22d3ee]/10 rounded border border-[#22d3ee]/20"
                >Cinema Studio</span
              >
              ${entry.settings?.camera
                ? html`<span class="text-[10px] text-white/40">${entry.settings.camera}</span>`
                : nothing}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderEmptyState() {
    const cardClass =
      'border border-white/10 shadow-2xl transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] flex-shrink-0';
    return html`
      <div
        class="flex flex-col items-center justify-center h-full text-center px-4 animate-fade-in-up transition-all duration-700 min-h-[50vh]"
      >
        <!-- Overlapping floating cards -->
        <div
          class="flex items-center justify-center gap-1.5 md:gap-3 mb-10 select-none scale-90 sm:scale-100"
        >
          <div
            class="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl -rotate-[12deg] ${cardClass}"
          >
            <img
              src="/assets/videomodels/sdxl-image.avif"
              alt="Creative asset 1"
              class="w-full h-full object-cover"
            />
          </div>
          <div
            class="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl -rotate-[4deg] -ml-3 sm:-ml-4 ${cardClass}"
          >
            <img
              src="/assets/videomodels/chroma-image.avif"
              alt="Creative asset 2"
              class="w-full h-full object-cover"
            />
          </div>
          <div
            class="w-18 h-18 sm:w-24 sm:h-24 rounded-full rotate-[6deg] -ml-3 sm:-ml-4 ${cardClass}"
          >
            <img
              src="/assets/videomodels/neta-lumina.avif"
              alt="Creative asset 3"
              class="w-full h-full object-cover"
            />
          </div>
          <div
            class="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl rotate-[12deg] -ml-3 sm:-ml-4 ${cardClass}"
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
            >START CREATING WITH</span><span
              class="text-[#22d3ee] font-black uppercase text-2xl sm:text-4xl sm:mt-1 tracking-tight"
              >CINEMA STUDIO</span
            >
        </h1>
        <p
          class="text-white/40 text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4"
        >
          What would you shoot with infinite budget? Control cameras, lighting, lenses, and prompt high-end cinematic scenes.
        </p>
      </div>
    `;
  }

  renderUploadButton() {
    return html`
      <div class="relative pt-0.5">
        <input
          type="file"
          class="hidden"
          accept="image/*"
          @change=${this.handleImageUpload}
        />

        <button
          type="button"
          @click=${() => {
            if (this.uploadedImage) {
              this.uploadedImage = null;
            } else {
              this.renderRoot
                .querySelector('input[type="file"]')
                ?.click();
            }
          }}
          ?disabled=${this.isUploadingImage}
          class=${promptMediaButtonClassName({
            active: Boolean(this.uploadedImage),
          })}
        >
          ${this.isUploadingImage
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
                      stroke-dashoffset=${88 -
                      (88 * this.imageUploadProgress) /
                      100}
                      class="text-primary transition-all duration-300"
                    ></circle>
                  </svg>
                  <span class="absolute text-[8px] font-bold text-white"
                    >${this.imageUploadProgress}%</span
                  >
                </div>
              `
            : this.uploadedImage
              ? html`
                  <div class="relative w-full h-full group">
                    <img
                      src=${this.uploadedImage}
                      alt="Reference"
                      class="w-full h-full object-cover opacity-80 group-hover:opacity-40 transition-opacity"
                    />
                    <div
                      class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ${UploadClearIcon}
                    </div>
                  </div>
                `
              : UploadIdleIcon}
        </button>
      </div>
    `;
  }

  renderComposer() {
    const dropdown = (
      key,
      active,
      trigger,
      title,
      items,
      selected,
      onSelect,
    ) => html`
      <div class="relative" data-drop=${key}>
        ${trigger}
        ${active
          ? html`
              <prompt-popover @click=${(e) => e.stopPropagation()}>
                ${promptPopoverHeader(title)}
                ${promptMenuList(html`
                  ${items.map((item) =>
                    promptMenuItem({
                      children: item,
                      selected: item === selected,
                      onClick: (e) => {
                        e.stopPropagation();
                        onSelect(item);
                        this.openDropdown = null;
                      },
                    }),
                  )}
                `)}
              </prompt-popover>
            `
          : nothing}
      </div>
    `;

    return html`
      <prompt-composer
        .positionClassName=${'absolute bottom-4 left-4 right-4 md:left-0 md:right-0 md:mx-auto md:max-w-[95%] lg:max-w-4xl z-30 transition-all duration-700 animate-fade-in-up'}
      >
        <!-- Upper Row: Image Upload & Textarea -->
        <div class="flex items-start gap-4 w-full px-1">
          ${this.renderUploadButton()}

          <prompt-textarea
            .value=${this.settings.prompt}
            @input=${(e) =>
              (this.settings = {
                ...this.settings,
                prompt: e.currentTarget.value,
              })}
            placeholder="Describe your cinema scene..."
          ></prompt-textarea>
        </div>

        <!-- Bottom Row: Controls & Generate -->
        <prompt-footer>
          <prompt-controls>
            <!-- Aspect Ratio Button -->
            ${dropdown(
              'ar',
              this.openDropdown === 'ar',
              html`
                <button
                  type="button"
                  class=${promptControlClassName({
                    active: this.openDropdown === 'ar',
                    className: 'text-xs font-semibold',
                  })}
                  @click=${() =>
                    (this.openDropdown =
                      this.openDropdown === 'ar' ? null : 'ar')}
                >${PromptAspectRatioIcon()}${this.settings.aspect_ratio}</button
                >
              `,
              'Aspect Ratio',
              ASPECT_RATIOS,
              this.settings.aspect_ratio,
              (val) =>
                (this.settings = {
                  ...this.settings,
                  aspect_ratio: val,
                }),
            )}

            <!-- Resolution Button -->
            ${dropdown(
              'res',
              this.openDropdown === 'res',
              html`
                <button
                  type="button"
                  class=${promptControlClassName({
                    active: this.openDropdown === 'res',
                    className: 'text-xs font-semibold',
                  })}
                  @click=${() =>
                    (this.openDropdown =
                      this.openDropdown === 'res' ? null : 'res')}
                >${PromptQualityIcon()}${this.resolution}</button>
              `,
              'Resolution',
              RESOLUTIONS,
              this.resolution,
              (val) => (this.resolution = val),
            )}

            <!-- Summary Card (triggers overlay) -->
            <button
              type="button"
              class=${promptControlClassName({
                className:
                  'text-left overflow-hidden text-xs font-semibold text-white/70 hover:text-white',
              })}
              @click=${() => this.setOverlayOpen(true)}
            ><div
                class="w-1.5 h-1.5 bg-[#22d3ee] rounded-full shadow-lg shadow-[#22d3ee]/20 shrink-0"
              ></div
              ><span
                class="max-w-[120px] truncate text-xs font-semibold text-white/70 group-hover:text-[#22d3ee] transition-colors"
                >${this.settings.camera} · ${this.formatSummaryValue()}</span
              ></button
            >
          </prompt-controls>

          <!-- Generate Button -->
          <prompt-action
            ?disabled=${this.isGenerating || !this.settings.prompt.trim()}
            @click=${() => this.handleGenerate()}
          >
            ${this.isGenerating
              ? html`<span class="animate-spin inline-block text-black">◌</span> <span>Generating...</span>`
              : html`<span>Shoot ✦ 10</span>`}
          </prompt-action>
        </prompt-footer>
      </prompt-composer>
    `;
  }

  renderCameraOverlay() {
    if (!this.isOverlayOpen) return nothing;
    return html`
      <div
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl animate-fade-in"
        @click=${(e) => {
          if (e.target === e.currentTarget) this.setOverlayOpen(false);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-config-title"
          aria-describedby="camera-config-description"
          class="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0a0a0b]/95 shadow-[0_24px_100px_rgba(0,0,0,0.75)] backdrop-blur-2xl animate-scale-up"
        >
          <div
            class="flex items-start justify-between border-b border-white/[0.05] px-5 py-5 md:px-7 md:py-6"
          >
            <div>
              <div
                class="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#22d3ee]"
              >
                ${CameraBadgeIcon}Cinema Studio
              </div>
              <h2
                id="camera-config-title"
                class="text-xl font-semibold tracking-tight text-white md:text-2xl"
                >Camera settings</h2
              >
              <p
                id="camera-config-description"
                class="mt-1.5 max-w-2xl text-xs leading-relaxed text-white/45 md:text-sm"
              >
                Build a consistent cinematic look by choosing the camera, lens,
                focal length, and depth of field.
              </p>
            </div>
            <button
              type="button"
              @click=${() => this.setOverlayOpen(false)}
              aria-label="Close camera settings"
              title="Close"
              class="ml-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03] text-white/40 transition-all hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
            >
              ${OverlayCloseIcon}
            </button>
          </div>

          <div
            class="overflow-x-auto px-5 py-6 no-scrollbar md:px-7 md:py-7"
          >
            <div
              class="mx-auto flex w-max min-w-full justify-start gap-3 sm:justify-center md:gap-5"
            >
              <scroll-column
                title="Camera"
                .items=${CAMERAS}
                columnKey="camera"
                .value=${this.settings.camera}
                @change=${this.handleColumnChange('camera')}
              ></scroll-column>
              <scroll-column
                title="Lens"
                .items=${LENSES}
                columnKey="lens"
                .value=${this.settings.lens}
                @change=${this.handleColumnChange('lens')}
              ></scroll-column>
              <scroll-column
                title="Focal length"
                .items=${FOCAL_LENGTHS}
                columnKey="focal"
                .value=${this.settings.focal}
                @change=${this.handleColumnChange('focal')}
              ></scroll-column>
              <scroll-column
                title="Aperture"
                .items=${APERTURES}
                columnKey="aperture"
                .value=${this.settings.aperture}
                @change=${this.handleColumnChange('aperture')}
              ></scroll-column>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderFullscreen() {
    if (!this.fullscreenUrl) return nothing;
    return html`
      <div
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
        @click=${() => (this.fullscreenUrl = null)}
      >
        <button
          type="button"
          class="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/10"
          @click=${(e) => {
            e.stopPropagation();
            this.fullscreenUrl = null;
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <img
          src=${this.fullscreenUrl}
          alt="Fullscreen Preview"
          class="max-w-[95vw] max-h-[95vh] rounded-2xl shadow-2xl object-contain animate-scale-up"
          @click=${(e) => e.stopPropagation()}
        />
      </div>
    `;
  }

  render() {
    const history = this.history;
    return html`
      <div
        class="w-full h-full flex flex-col items-center justify-center bg-black relative overflow-hidden"
      >
        <!-- ── CENTRAL GALLERY AREA ── -->
        <div
          class="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-40 lg:pb-32 px-2"
        >
          ${history.length > 0
            ? html`
                <div
                  class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full pt-4 animate-fade-in-up"
                >
                  ${history.map((entry, idx) =>
                    this.renderHistoryCard(entry, idx),
                  )}
                </div>
              `
            : this.renderEmptyState()}
        </div>

        <!-- ── BOTTOM PROMPT BAR ── -->
        ${this.renderComposer()}
        ${this.renderFullscreen()}
        <!-- ── Camera Controls Overlay ── -->
        ${this.renderCameraOverlay()}
      </div>
    `;
  }

  updated(changed) {
    super.updated(changed);
    this._maybeSaveOnUpdate(changed);
  }
}

customElements.define('studio-cinema', StudioCinema);
