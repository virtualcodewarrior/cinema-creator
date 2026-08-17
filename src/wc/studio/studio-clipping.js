// Port of packages/studio/src/components/ClippingStudio.jsx.
// Video highlight clipping: upload/URL input, aspect + highlights-limit
// dropdowns, coordinates-only toggle, dual output views (clips grid /
// timeline-seek), persisted history.
//
// Porting notes:
// - The original renders a dedicated react-hot-toast instance
//   (toasterId "clipping-studio", bottom-right, custom white/red ErrorToast
//   card, max 3 visible, 7 s). Reproduced here as a fixed-position container
//   inside the element's shadow root with the same card markup and the same
//   max-3/dismiss behavior. The global <app-toaster> is NOT used for these.
// - `fullscreenUrl`, `elapsedTime`, and `generateError` mirror the original,
//   which sets state for them without any render site (dead UI — kept for
//   parity, incl. the running 1 s timer during generation).
// - `ClockIcon` is referenced by the original but never defined there (the
//   timeline-seek view would crash in React); defined here so the view renders.
// - The styled-jsx `.custom-scrollbar` block is already in the studio sheet.
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { runClipping, uploadFile } from 'studio/muapi.js';
import { formatErrorMessage } from 'studio/utils/formatError.js';
import { scopedPersistKey, migrateLegacyPersistKey } from 'studio/persistKey.js';
import {
  GenerationCopyButtons,
  MobileGenerationActions,
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
  PROMPT_MEDIA_PREVIEW_CLASS,
  PROMPT_CONTROL_LABEL_CLASS,
  PromptAspectRatioIcon,
  PromptDurationIcon,
} from './prompt-composer.js';

const MAX_VIDEO_SIZE_MB = 100;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;
const VIDEO_TOO_LARGE_FOR_MODE_MESSAGE =
  'The file is too large for this mode. Compress or trim the video, then upload a smaller file.';
const MAX_VISIBLE_ERROR_TOASTS = 3;
const ERROR_TOAST_DURATION_MS = 7000;

const LEGACY_PERSIST_KEY = 'hg_clipping_studio_persistent';

// ── Inline SVG Icons ─────────────────────────────────────────────────────────
const svgOf = (markup) => unsafeHTML(markup);

const ScissorsIcon = (className = 'text-[#22d3ee]') =>
  svgOf(
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}">` +
      '<circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />' +
      '<line x1="9.8" y1="8.2" x2="21" y2="19.4" /><line x1="9.8" y1="15.8" x2="21" y2="4.6" /></svg>',
  );

const TrashIcon = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<polyline points="3 6 5 6 21 6" />' +
    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />' +
    '<line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>',
);

const PlayIcon = svgOf(
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>',
);

const DownloadIcon = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>',
);

const CopyIcon = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>',
);

// Original references <ClockIcon /> without ever defining it (latent React
// crash in the timeline-seek view); a 12 px clock keeps the view functional.
const ClockIcon = svgOf(
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>',
);

const BackIcon = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>',
);

const UploadVideoIcon = svgOf(
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40 group-hover:text-[#22d3ee] transition-colors">' +
    '<polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>',
);

const ErrorCardIcon = svgOf(
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><path d="M12 17h.01" /></svg>',
);

const DismissIcon = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M18 6 6 18M6 6l12 12" /></svg>',
);

const getAspectClass = (ar) => {
  switch (ar) {
    case '16:9':
      return 'aspect-video';
    case '1:1':
      return 'aspect-square';
    case '4:5':
      return 'aspect-[4/5]';
    case '4:3':
      return 'aspect-[4/3]';
    case '3:4':
      return 'aspect-[3/4]';
    case '9:16':
    default:
      return 'aspect-[9/16]';
  }
};

const isFileSizeError = (error) => {
  const message = String(error?.message || error || '');
  return /(?:\b413\b|payload too large|request entity too large|file(?: size)? (?:is )?too large|file is too heavy|exceeds?.*(?:size|limit)|слишком (?:больш|тяж)|превышает.*(?:размер|лимит))/i.test(
    message,
  );
};

const formatSeconds = (totalSeconds) => {
  if (
    isNaN(totalSeconds) ||
    totalSeconds === null ||
    totalSeconds === undefined
  )
    return '0:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const ASPECT_RATIOS = [
  { label: '9:16 (TikTok / Reels / Shorts)', value: '9:16' },
  { label: '16:9 (YouTube / TV)', value: '16:9' },
  { label: '1:1 (Instagram Square)', value: '1:1' },
  { label: '4:5 (Instagram Portrait)', value: '4:5' },
  { label: '4:3 (Classic Video)', value: '4:3' },
  { label: '3:4 (Portrait)', value: '3:4' },
];

export class StudioClipping extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    // White-label contract props (were React props).
    apiKey: { type: String },
    onGenerationStart: { attribute: false },
    onGenerationEnd: { attribute: false },
    onGenerationComplete: { attribute: false },
    onGenerationError: { attribute: false },
    droppedFiles: { attribute: false },
    onFilesHandled: { attribute: false },

    videoUrl: { state: true },
    numHighlights: { state: true },
    aspectRatio: { state: true },
    returnCoordinatesOnly: { state: true },
    prompt: { state: true },
    aspectDropdownOpen: { state: true },
    highlightsDropdownOpen: { state: true },
    videoUploading: { state: true },
    videoProgress: { state: true },
    isGenerating: { state: true },
    generateError: { state: true },
    fullscreenUrl: { state: true },
    elapsedTime: { state: true },
    result: { state: true },
    activeHighlightIndex: { state: true },
    history: { state: true },
    errorToasts: { state: true },
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
    this.droppedFiles = null;
    this.onFilesHandled = null;

    this.videoUrl = '';
    this.numHighlights = 3;
    this.aspectRatio = '9:16';
    this.returnCoordinatesOnly = false;
    this.prompt = '';

    this.aspectDropdownOpen = false;
    this.highlightsDropdownOpen = false;

    this.videoUploading = false;
    this.videoProgress = 0;

    this.isGenerating = false;
    this.generateError = null;
    this.fullscreenUrl = null;
    this.elapsedTime = 0;

    this.result = null;
    this.activeHighlightIndex = 0;

    this.history = [];

    this.errorToasts = [];
    this._toastSeq = 0;
    this._toastDismissed = new Set();
    this._timer = null;
    this._outsideMouseDownBound = null;
    this._toastForgetTimers = new Map();
  }

  connectedCallback() {
    super.connectedCallback();
    this._persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey);
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, this._persistKey);
    try {
      const stored = localStorage.getItem(this._persistKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.videoUrl) this.videoUrl = data.videoUrl;
        if (data.numHighlights) this.numHighlights = data.numHighlights;
        if (data.aspectRatio) this.aspectRatio = data.aspectRatio;
        if (data.returnCoordinatesOnly !== undefined)
          this.returnCoordinatesOnly = data.returnCoordinatesOnly;
        if (data.history) this.history = data.history;
        if (data.result) this.result = data.result;
      }
    } catch (err) {
      console.warn('Failed to load ClippingStudio persistent state:', err);
    }
  }

  firstUpdated() {
    this._outsideMouseDownBound = (e) => {
      const arNode = this.renderRoot.querySelector('[data-drop="ar"]');
      const hlNode = this.renderRoot.querySelector('[data-drop="hl"]');
      const path = e.composedPath();
      if (arNode && !path.includes(arNode)) this.aspectDropdownOpen = false;
      if (hlNode && !path.includes(hlNode))
        this.highlightsDropdownOpen = false;
    };
    document.addEventListener('mousedown', this._outsideMouseDownBound);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._outsideMouseDownBound)
      document.removeEventListener('mousedown', this._outsideMouseDownBound);
    this.stopTimer();
    for (const t of this._toastForgetTimers.values()) clearTimeout(t);
    this._toastForgetTimers.clear();
  }

  // React save effect: 500 ms debounce over the persisted slice.
  _maybeSaveOnUpdate(changed) {
    const saveKeys = new Set([
      'videoUrl',
      'numHighlights',
      'aspectRatio',
      'returnCoordinatesOnly',
      'history',
      'result',
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
          videoUrl: this.videoUrl,
          numHighlights: this.numHighlights,
          aspectRatio: this.aspectRatio,
          returnCoordinatesOnly: this.returnCoordinatesOnly,
          history: this.history,
          result: this.result,
        };
        localStorage.setItem(this._persistKey, JSON.stringify(state));
      } catch (err) {
        console.warn('Failed to save ClippingStudio persistent state:', err);
      }
    }, 500);
  }

  // React droppedFiles effect.
  _handleDroppedFiles() {
    if (this.droppedFiles && this.droppedFiles.length > 0) {
      const videoFiles = this.droppedFiles.filter((f) =>
        f.type.startsWith('video/'),
      );
      if (videoFiles.length > 0) {
        const file = videoFiles[0];
        if (file.size > MAX_VIDEO_SIZE_BYTES) {
          this.showVideoSizeLimitToast();
          this.onFilesHandled?.();
          return;
        }
        this.videoUploading = true;
        this.videoProgress = 0;
        uploadFile(this.apiKey, file, (pct) => {
          this.videoProgress = pct;
        })
          .then((url) => {
            this.videoUrl = url;
            this.videoUploading = false;
          })
          .catch((err) => {
            this.videoUploading = false;
            this.showVideoUploadError(err);
          });
      }
      this.onFilesHandled?.();
    }
  }

  startTimer() {
    this.elapsedTime = 0;
    this._timer = setInterval(() => {
      this.elapsedTime = this.elapsedTime + 1;
    }, 1000);
  }

  stopTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  // ── Custom error toasts (replaces the dedicated react-hot-toast instance) ──
  showErrorToast(message) {
    while (this.errorToasts.length >= MAX_VISIBLE_ERROR_TOASTS) {
      this.removeErrorToast(this.errorToasts[0].id);
    }
    const id = ++this._toastSeq;
    this.errorToasts = [...this.errorToasts, { id, message, visible: true }];
    const t = setTimeout(() => this.forgetErrorToast(id), ERROR_TOAST_DURATION_MS + 1000);
    this._toastForgetTimers.set(id, t);
  }

  forgetErrorToast(id) {
    const t = this._toastForgetTimers.get(id);
    if (t) {
      clearTimeout(t);
      this._toastForgetTimers.delete(id);
    }
    if (this._toastDismissed.has(id)) return;
    this.errorToasts = this.errorToasts.filter((x) => x.id !== id);
  }

  dismissErrorToast(id) {
    this._toastDismissed.add(id);
    this.errorToasts = this.errorToasts.map((x) =>
      x.id === id ? { ...x, visible: false } : x,
    );
    setTimeout(() => this.forgetErrorToast(id), 250);
  }

  removeErrorToast(id) {
    this._toastDismissed.add(id);
    this.errorToasts = this.errorToasts.filter((x) => x.id !== id);
  }

  showVideoSizeLimitToast() {
    this.showErrorToast(`Video exceeds ${MAX_VIDEO_SIZE_MB}MB limit.`);
  }

  showVideoUploadError(error) {
    if (isFileSizeError(error)) {
      this.showErrorToast(VIDEO_TOO_LARGE_FOR_MODE_MESSAGE);
      return;
    }
    const message = formatErrorMessage(
      error,
      'Video upload failed. Please try again.',
    );
    this.showErrorToast(message);
  }

  // ── Highlight seeking ──
  seekToHighlight(startSec) {
    const v = this.renderRoot.querySelector('[data-main-video]');
    if (v) {
      v.currentTime = startSec;
      v.play().catch(() => {});
    }
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    alert('URL copied to clipboard!');
  }

  async downloadVideo(url, title = 'clipped_video') {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${title.replace(/\s+/g, '_')}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  }

  handlePromptInput(val) {
    if (val.trim().match(/^https?:\/\/[^\s]+$/i)) {
      this.videoUrl = val.trim();
      this.prompt = '';
      return;
    }
    this.prompt = val;
  }

  async handleVideoFileChange(e) {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) return;
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      this.showVideoSizeLimitToast();
      e.target.value = '';
      return;
    }
    this.videoUploading = true;
    this.videoProgress = 0;
    try {
      const url = await uploadFile(this.apiKey, file, (pct) => {
        this.videoProgress = pct;
      });
      this.videoUrl = url;
    } catch (err) {
      console.error('[ClippingStudio] Video upload failed:', err);
      this.showVideoUploadError(err);
    } finally {
      this.videoUploading = false;
      this.videoProgress = 0;
      e.target.value = '';
    }
  }

  clearVideoUpload() {
    this.videoUrl = '';
  }

  async handleGenerate() {
    if (!this.videoUrl) {
      alert('Please upload a video or paste a video URL first.');
      return;
    }

    this.onGenerationStart?.();
    this.isGenerating = true;
    this.generateError = null;
    this.result = null;
    this.startTimer();

    try {
      const params = {
        video_url: this.videoUrl,
        num_highlights: this.numHighlights,
        aspect_ratio: this.aspectRatio,
        return_coordinates_only: this.returnCoordinatesOnly,
      };

      const res = await runClipping(this.apiKey, params);

      // Parse the result
      const clips = res.outputs || [];
      const outputCoordinates =
        res.output?.coordinates ||
        res.coordinates ||
        res.output?.timings ||
        res.timings ||
        [];

      const newResult = {
        id: res.id || Date.now().toString(),
        videoUrl: this.videoUrl,
        clips: clips,
        coordinates: Array.isArray(outputCoordinates)
          ? outputCoordinates
          : res.output?.clips || [],
        returnCoordinatesOnly: this.returnCoordinatesOnly,
        aspectRatio: this.aspectRatio,
        timestamp: new Date().toISOString(),
      };

      // Mock coordinates if API succeeded but modal coordinates are empty in coordinate-only mode
      if (newResult.returnCoordinatesOnly && newResult.coordinates.length === 0) {
        newResult.coordinates = Array.from({
          length: this.numHighlights,
        }).map((_, idx) => ({
          label: `Highlight #${idx + 1}`,
          start_time: idx * 15,
          end_time: (idx + 1) * 15,
          start: idx * 15,
          end: (idx + 1) * 15,
          score: 0.95 - (idx * 0.05),
        }));
      }

      this.result = newResult;
      this.activeHighlightIndex = 0;

      // Append to history
      this.history = [newResult, ...this.history].slice(0, 30);

      if (this.onGenerationComplete) {
        this.onGenerationComplete({
          url: clips[0] || this.videoUrl,
          model: 'ai-clipping',
          type: 'video',
        });
      }
    } catch (err) {
      console.error('[ClippingStudio] Error generating clips:', err);
      const errMsg = formatErrorMessage(err, 'Failed to process AI clipping.');
      const notificationMessage = isFileSizeError(err)
        ? VIDEO_TOO_LARGE_FOR_MODE_MESSAGE
        : errMsg;
      if (this.onGenerationError) this.onGenerationError(notificationMessage);
      else this.showErrorToast(notificationMessage);
    } finally {
      this.isGenerating = false;
      this.stopTimer();
      this.onGenerationEnd?.();
    }
  }

  handleSelectHistory(entry) {
    this.result = entry;
    this.activeHighlightIndex = 0;
    this.videoUrl = entry.videoUrl;
    this.numHighlights = entry.numHighlights || 3;
    this.aspectRatio = entry.aspectRatio || '9:16';
    this.returnCoordinatesOnly = entry.returnCoordinatesOnly || false;
  }

  deleteFromHistory(id) {
    this.history = this.history.filter((h) => h.id !== id);
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  renderErrorToasts() {
    if (this.errorToasts.length === 0) return nothing;
    return html`
      <div
        class="fixed flex flex-col gap-2 pointer-events-none"
        style="z-index: 99999; right: 20px; bottom: 20px"
      >
        ${[...this.errorToasts].reverse().map(
          (t) => html`
            <div
              class="pointer-events-auto flex w-[340px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-xl border border-red-400/40 bg-white px-3.5 py-3 text-[13px] text-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.15)] transition-all duration-200 ${
                t.visible
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-2 opacity-0'
              }"
              role="alert"
            >
              <span
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-400/40 bg-red-50 text-red-600"
              >
                ${ErrorCardIcon}
              </span>
              <span
                class="min-w-0 flex-1 py-1 font-medium leading-5 text-zinc-900"
                >${t.message}</span
              >
              <button
                type="button"
                @click=${() => this.dismissErrorToast(t.id)}
                class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-300"
                aria-label="Dismiss notification"
              >
                ${DismissIcon}
              </button>
            </div>
          `,
        )}
      </div>
    `;
  }

  renderEmptyState() {
    return html`
      <div
        class="flex flex-col items-center justify-center h-full animate-fade-in-up transition-all duration-700 min-h-[50vh]"
      >
        <!-- Overlapping floating cards -->
        <div
          class="flex items-center justify-center gap-1.5 md:gap-3 mb-10 select-none scale-90 sm:scale-100"
        >
          <div class="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-white/10 shadow-2xl -rotate-[12deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] flex-shrink-0">
            <img src="/assets/videomodels/sdxl-image.avif" alt="Creative asset 1" class="w-full h-full object-cover" />
          </div>
          <div class="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-white/10 shadow-2xl -rotate-[4deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] -ml-3 sm:-ml-4 flex-shrink-0">
            <img src="/assets/videomodels/chroma-image.avif" alt="Creative asset 2" class="w-full h-full object-cover" />
          </div>
          <div class="w-18 h-18 sm:w-24 sm:h-24 rounded-full border border-white/10 shadow-2xl rotate-[6deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] -ml-3 sm:-ml-4 flex-shrink-0">
            <img src="/assets/videomodels/neta-lumina.avif" alt="Creative asset 3" class="w-full h-full object-cover" />
          </div>
          <div class="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-white/10 shadow-2xl rotate-[12deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] -ml-3 sm:-ml-4 flex-shrink-0">
            <img src="/assets/videomodels/perfect-pony-xl.avif" alt="Creative asset 4" class="w-full h-full object-cover" />
          </div>
        </div>

        <h1 class="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-center px-4 flex flex-col items-center">
          <span class="text-white font-black uppercase text-xl sm:text-3xl tracking-wide mb-1 opacity-90">START CREATING WITH</span>
          <span class="text-[#22d3ee] font-black uppercase text-2xl sm:text-4xl sm:mt-1 tracking-tight">AI CLIPPING STUDIO</span>
        </h1>
        <p class="text-white/40 text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4">
          Extract viral highlights and precise timings from your videos automatically.
        </p>
      </div>
    `;
  }

  renderHistoryCard(entry, idx) {
    return html`
      <div
        @click=${() => this.handleSelectHistory(entry)}
        class="relative group rounded-lg overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-xl hover:border-primary/50 transition-all duration-300 flex flex-col cursor-pointer"
      >
        <div class="aspect-video bg-zinc-950 flex items-center justify-center border-b border-white/5 relative overflow-hidden">
          <video
            src=${entry.videoUrl}
            class="w-full h-full object-cover opacity-60 group-hover:opacity-85 transition-opacity animate-fade-in"
            preload="metadata"
            muted
            loop
            playsinline
            @mouseover=${(e) => e.target.play()}
            @mouseout=${(e) => {
              e.target.pause();
              e.target.currentTime = 0;
            }}
          >
          </video>

          <!-- Overlay actions -->
          <div
            class="absolute top-2 right-2 z-10 hidden md:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <button
              type="button"
              title="Delete from history"
              @click=${(e) => {
                e.stopPropagation();
                this.deleteFromHistory(entry.id);
              }}
              class="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-red-500 hover:text-white transition-all border border-white/10"
            >
              ${TrashIcon}
            </button>
          </div>
          <mobile-generation-actions
            .actions=${[
              {
                kind: 'delete',
                label: 'Delete',
                danger: true,
                onSelect: () => this.deleteFromHistory(entry.id),
              },
            ]}
          ></mobile-generation-actions>
        </div>
        <div
          class="p-3 bg-black/80 backdrop-blur-sm border-t border-white/5 flex-1 flex flex-col justify-between gap-2"
        >
          <div class="flex flex-col gap-1">
            <h4
              class="text-xs font-bold text-white truncate"
              title=${(entry.videoUrl || '').split('/').pop()}
            >
              ${(entry.videoUrl || '').split('/').pop() || 'source_video.mp4'}
            </h4>
            <p
              class="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider"
            >
              ${entry.returnCoordinatesOnly
                ? 'Timeline Seek Mode'
                : 'Clips Gallery Mode'}
            </p>
          </div>
          <div class="flex items-center justify-between mt-1">
            <span
              class="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20"
            >
              ${entry.aspectRatio}
            </span>
            <span class="text-[10px] text-white/40">
              ${entry.returnCoordinatesOnly
                ? `${entry.coordinates?.length || 0} Highlights`
                : `${entry.clips?.length || 0} Clips`}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  renderTimelineResult() {
    const result = this.result;
    return html`
      <div class="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        <!-- Left Side: Original Player -->
        <div
          class="flex-1 bg-black border border-zinc-900 rounded-lg overflow-hidden flex flex-col shadow-2xl relative min-h-[300px] lg:min-h-0"
        >
          <div
            class="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-md border border-white/5 z-10 text-[10px] uppercase font-bold tracking-wider text-primary"
          >
            Original Video Player
          </div>
          <video
            data-main-video
            src=${result.videoUrl}
            controls
            class="w-full flex-1 object-contain bg-zinc-950"
            preload="auto"
          >
          </video>
        </div>

        <!-- Right Side: Highlights list -->
        <div
          class="w-full lg:w-[350px] border border-zinc-900 bg-zinc-950/40 backdrop-blur-md rounded-lg p-5 flex flex-col min-h-[350px] lg:min-h-0"
        >
          <div
            class="pb-4 border-b border-zinc-900 flex items-center justify-between"
          >
            <h3 class="text-xs font-black text-white uppercase tracking-widest">
              Highlights Timeline
            </h3>
            <span
              class="text-[10px] font-bold text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800"
            >
              ${result.coordinates?.length || 0} Matches
            </span>
          </div>

          <div class="flex-1 overflow-y-auto custom-scrollbar mt-4 space-y-3 pr-1">
            ${result.coordinates && result.coordinates.length > 0
              ? result.coordinates.map((hl, i) => {
                  const start = hl.start_time !== undefined ? hl.start_time : (hl.start || 0);
                  const end = hl.end_time !== undefined ? hl.end_time : (hl.end || 0);
                  const isActive = this.activeHighlightIndex === i;
                  return html`
                    <button
                      type="button"
                      @click=${() => {
                        this.activeHighlightIndex = i;
                        this.seekToHighlight(start);
                      }}
                      class="w-full p-4 border rounded-lg text-left transition-all hover:bg-zinc-900/60 flex flex-col gap-2 group/hl ${
                        isActive
                          ? 'border-primary bg-primary/5 shadow-[0_0_12px_rgba(34,211,238,0.03)]'
                          : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                      }"
                    >
                      <div class="flex items-center justify-between w-full">
                        <span
                          class="text-xs font-bold transition-colors ${
                            isActive ? 'text-primary' : 'text-white'
                          }"
                        >
                          ${hl.label || `Highlight #${i + 1}`}
                        </span>
                        ${hl.score
                          ? html`
                              <span
                                class="text-[9px] font-black text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/20"
                              >
                                ${(hl.score * 100).toFixed(0)}% Score
                              </span>
                            `
                          : nothing}
                      </div>
                      <div
                        class="flex items-center gap-2 text-[10px] text-zinc-400 font-semibold"
                      >
                        ${ClockIcon}
                        <span
                          >${formatSeconds(start)} - ${formatSeconds(end)}</span
                        >
                        <span class="text-zinc-650">•</span>
                        <span class="text-primary/80 font-bold"
                          >${(end - start).toFixed(0)}s duration</span
                        >
                      </div>

                      <div
                        class="flex items-center gap-1.5 text-[10px] font-bold text-primary mt-1 opacity-0 group-hover/hl:opacity-100 transition-opacity"
                      >
                        ${PlayIcon} Seek & Play
                      </div>
                    </button>
                  `;
                })
              : html`
                  <div
                    class="text-center py-8 text-xs text-zinc-500 font-semibold"
                  >
                    No highlights extracted.
                  </div>
                `}
          </div>
        </div>
      </div>
    `;
  }

  renderClipsResult() {
    const result = this.result;
    return html`
      <div class="space-y-5">
        <div
          class="flex items-center justify-between border-b border-zinc-900 pb-3.5"
        >
          <h3 class="text-xs font-black text-white uppercase tracking-widest">
            Extracted Video Clips
          </h3>
          <span
            class="text-[10px] font-bold text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded border border-zinc-800"
          >
            Aspect Ratio: ${result.aspectRatio}
          </span>
        </div>

        ${result.clips && result.clips.length > 0
          ? html`
              <div
                class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6"
              >
                ${result.clips.map(
                  (clipUrl, i) => html`
                    <div
                      @click=${() => (this.fullscreenUrl = clipUrl)}
                      class="relative group rounded-lg overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-xl hover:border-primary/50 transition-all duration-300 flex flex-col cursor-pointer"
                    >
                      <div
                        class="relative group/vid border-b border-white/5 overflow-hidden bg-black/40"
                      >
                        <video
                          src=${clipUrl}
                          class="w-full ${getAspectClass(result.aspectRatio)} object-cover bg-black/40 hover:opacity-85 transition-opacity"
                          loop
                          muted
                          playsinline
                          @mouseover=${(e) => e.target.play()}
                          @mouseout=${(e) => {
                            e.target.pause();
                            e.target.currentTime = 0;
                          }}
                        >
                        </video>

                        <!-- Overlay actions -->
                        <div
                          class="absolute top-2 right-2 z-10 hidden md:flex flex-col gap-2 opacity-0 group-hover/vid:opacity-100 transition-opacity"
                        >
                          <generation-copy-buttons
                            .prompt=${result.prompt}
                            .onCopyError=${this.onGenerationError}
                          ></generation-copy-buttons>
                          <button
                            type="button"
                            title="Copy Link"
                            @click=${(e) => {
                              e.stopPropagation();
                              this.copyToClipboard(clipUrl);
                            }}
                            class="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                          >
                            ${CopyIcon}
                          </button>
                          <button
                            type="button"
                            title="Download"
                            @click=${(e) => {
                              e.stopPropagation();
                              this.downloadVideo(clipUrl, `clip-${i + 1}.mp4`);
                            }}
                            class="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                          >
                            ${DownloadIcon}
                          </button>
                        </div>
                        <mobile-generation-actions
                          .prompt=${result.prompt}
                          .onCopyError=${this.onGenerationError}
                          .actions=${[
                            {
                              kind: 'copy',
                              label: 'Copy link',
                              onSelect: () => this.copyToClipboard(clipUrl),
                            },
                            {
                              kind: 'download',
                              label: 'Download',
                              onSelect: () =>
                                this.downloadVideo(clipUrl, `clip-${i + 1}.mp4`),
                            },
                          ]}
                        ></mobile-generation-actions>

                        <div
                          class="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/5 text-[9px] uppercase font-black tracking-wider text-primary"
                        >
                          Clip #${i + 1}
                        </div>
                      </div>

                      <div
                        class="p-3 bg-black/80 backdrop-blur-sm border-t border-white/5 flex-1 flex flex-col justify-between gap-2"
                      >
                        ${result.prompt
                          ? html`
                              <p
                                class="text-white/70 text-xs line-clamp-2 leading-relaxed"
                                title=${result.prompt}
                              >
                                ${result.prompt}
                              </p>
                            `
                          : nothing}
                        <div
                          class="flex items-center justify-between mt-1"
                        >
                          <div class="flex items-center gap-2">
                            <span
                              class="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20 whitespace-nowrap"
                            >
                              AI Clipping
                            </span>
                            <span class="text-[10px] text-white/40"
                              >${
                                result.aspectRatio || `Clip #${i + 1}`
                              }</span
                            >
                          </div>
                        </div>
                      </div>
                    </div>
                  `,
                )}
              </div>
            `
          : html`
              <div
                class="py-20 text-center text-xs text-zinc-500 font-semibold border border-zinc-900 rounded bg-zinc-950/20"
              >
                No video clips generated. Try re-running.
              </div>
            `}
      </div>
    `;
  }

  renderComposer() {
    return html`
      <prompt-composer>
        <!-- Inline list of uploaded media files -->
        ${this.videoUrl
          ? html`
              <div class="flex items-center gap-2.5 px-1 pb-1">
                <div class=${PROMPT_MEDIA_PREVIEW_CLASS}>
                  <video
                    src=${this.videoUrl}
                    class="w-full h-full object-cover"
                    muted
                    playsinline
                  >
                  </video>
                  <button
                    type="button"
                    @click=${this.clearVideoUpload}
                    class="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 hover:text-white text-[8px] border border-white/5"
                    title="Clear video"
                    >×</button
                  >
                </div>
              </div>
            `
          : nothing}

        <!-- Upper row: upload button & prompt field -->
        <div class="flex items-start gap-3 px-1">
          <!-- Hidden file input -->
          <input
            data-video-file
            type="file"
            accept="video/*"
            class="hidden"
            @change=${this.handleVideoFileChange}
          />

          <!-- Sleek round upload button -->
          ${!this.videoUrl
            ? html`
                <button
                  type="button"
                  title="Upload source video"
                  @click=${() =>
                    this.renderRoot
                      .querySelector('[data-video-file]')
                      ?.click()}
                  class=${promptMediaButtonClassName({
                    active: Boolean(this.videoUrl),
                  })}
                >
                  ${this.videoUploading
                    ? html`
                        <div
                          class="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/85 z-20 backdrop-blur-[1px]"
                        >
                          <svg class="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                            <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2" fill="transparent" class="text-white/10" />
                            <circle
                              cx="16"
                              cy="16"
                              r="14"
                              stroke="currentColor"
                              stroke-width="2"
                              fill="transparent"
                              stroke-dasharray="88"
                              stroke-dashoffset=${88 - (88 * this.videoProgress) / 100}
                              class="text-[#22d3ee] transition-all duration-300"
                            />
                          </svg>
                          <span
                            class="absolute text-[8px] font-black text-[#22d3ee] leading-none ${
                              this.videoProgress >= 100 ? 'animate-pulse' : ''
                            }"
                          >
                            ${this.videoProgress >= 100
                              ? '...'
                              : `${this.videoProgress}%`}
                          </span>
                        </div>
                      `
                    : nothing}

                  ${UploadVideoIcon}
                </button>
              `
            : nothing}

          <!-- Prompt textarea (supports direct URL pasting too) -->
          <div class="flex-1 flex flex-col gap-1">
            <prompt-textarea
              .value=${this.prompt}
              @input=${(e) =>
                this.handlePromptInput(e.currentTarget.value)}
              placeholder="Describe prompt / highlights to extract"
            ></prompt-textarea>
          </div>
        </div>

        <!-- Bottom row: controls + generate button -->
        <prompt-footer>
          <prompt-controls>
            <!-- Model Identifier (C) -->
            <div class=${promptControlClassName()}>
              <div
                class="w-4 h-4 bg-[#22d3ee] rounded flex items-center justify-center shadow-lg shadow-[#22d3ee]/10"
              >
                <span class="text-[9px] font-bold text-black uppercase">C</span>
              </div>
              <span class=${PROMPT_CONTROL_LABEL_CLASS}>AI Clipping</span>
            </div>

            <!-- Aspect Ratio selector -->
            <div class="relative" data-drop="ar">
              <button
                type="button"
                @click=${() =>
                  (this.aspectDropdownOpen = !this.aspectDropdownOpen)}
                class=${promptControlClassName({
                  active: this.aspectDropdownOpen,
                })}
              >
                ${PromptAspectRatioIcon()}
                <span class=${PROMPT_CONTROL_LABEL_CLASS}
                  >${this.aspectRatio}</span
                >
              </button>
              ${this.aspectDropdownOpen
                ? html`
                    <prompt-popover>
                      ${promptPopoverHeader('Aspect Ratio')}
                      ${promptMenuList(
                        ASPECT_RATIOS.map(
                          (r) =>
                            promptMenuItem({
                              children: r.value,
                              selected: this.aspectRatio === r.value,
                              onClick: () => {
                                this.aspectRatio = r.value;
                                this.aspectDropdownOpen = false;
                              },
                            }),
                        ),
                      )}
                    </prompt-popover>
                  `
                : nothing}
            </div>

            <!-- Highlights Limit selector -->
            <div class="relative" data-drop="hl">
              <button
                type="button"
                @click=${() =>
                  (this.highlightsDropdownOpen = !this.highlightsDropdownOpen)}
                class=${promptControlClassName({
                  active: this.highlightsDropdownOpen,
                })}
              >
                ${PromptDurationIcon()}
                <span class=${PROMPT_CONTROL_LABEL_CLASS}
                  >${this.numHighlights} Highlights</span
                >
              </button>
              ${this.highlightsDropdownOpen
                ? html`
                    <prompt-popover .className=${'min-w-[180px] overflow-visible'}>
                      ${promptPopoverHeader('Max Highlights', 'mb-3')}
                      <div class="space-y-3">
                        <div
                          class="flex items-center justify-between"
                        >
                          <span class="text-xs text-white/60">Limit:</span>
                          <span
                            class="text-xs font-black text-primary bg-primary/10 px-2.5 py-0.5 rounded"
                          >
                            ${this.numHighlights}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="60"
                          step="1"
                          .value=${this.numHighlights}
                          @input=${(e) =>
                            (this.numHighlights = Number(e.target.value))}
                          class="w-full h-1 bg-zinc-850 rounded appearance-none cursor-pointer accent-primary"
                        />
                      </div>
                    </prompt-popover>
                  `
                : nothing}
            </div>

            <!-- Return Coordinates Toggle -->
            <button
              type="button"
              @click=${() =>
                (this.returnCoordinatesOnly = !this.returnCoordinatesOnly)}
              class=${promptControlClassName({
                active: this.returnCoordinatesOnly,
                className: this.returnCoordinatesOnly
                  ? 'text-[#22d3ee]'
                  : 'text-white/70 hover:text-white',
              })}
            >
              ${ScissorsIcon('w-4 h-4 text-current')}
              <span class="text-xs font-semibold">Coordinates Only</span>
            </button>
          </prompt-controls>

          <!-- Generate button -->
          <prompt-action
            .disabled=${this.isGenerating}
            @click=${this.handleGenerate}
          >
            ${this.isGenerating
              ? html`
                  <span class="animate-spin inline-block text-black">◌</span>
                  <span>Generating...</span>
                `
              : html`
                  <span>Generate ✦ 5</span>
                `}
          </prompt-action>
        </prompt-footer>
      </prompt-composer>
    `;
  }

  render() {
    return html`
      <div
        class="w-full h-full flex flex-col items-center justify-center bg-app-bg text-white relative overflow-hidden"
      >
        <!-- ─── CENTRAL AREA ─── -->
        <div
          class="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-40 lg:pb-32 px-2"
        >
          <!-- Error Message -->
          ${this.generateError
            ? html`
                <div
                  class="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded text-xs font-semibold leading-relaxed mb-6"
                >
                  ${this.generateError}
                </div>
              `
            : nothing}

          <!-- 1. Empty State (No history, no result active) -->
          ${!this.result && this.history.length === 0
            ? this.renderEmptyState()
            : nothing}

          <!-- 2. History Gallery List (Active result is null, history has items) -->
          ${!this.result && this.history.length > 0
            ? html`
                <div class="space-y-6 pt-4">
                  <div
                    class="flex items-center justify-between border-b border-white/5 pb-4"
                  >
                    <h2 class="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      ${ScissorsIcon('text-primary w-4 h-4')}
                      Clipping History Runs
                    </h2>
                    <span
                      class="text-xs font-bold text-zinc-400 bg-white/5 border border-white/5 px-2.5 py-1 rounded"
                    >
                      ${this.history.length} Saved Generations
                    </span>
                  </div>

                  <div
                    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full animate-fade-in-up"
                  >
                    ${this.history.map((entry, idx) =>
                      this.renderHistoryCard(entry, idx),
                    )}
                  </div>
                </div>
              `
            : nothing}

          <!-- 3. Active Result Preview (Result is loaded) -->
          ${this.result
            ? html`
                <div class="flex-1 flex flex-col min-h-0">
                  <!-- Header / Back Action -->
                  <div
                    class="flex items-center justify-between mb-6 pb-4 border-b border-white/5"
                  >
                    <button
                      type="button"
                      @click=${() => (this.result = null)}
                      class="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
                    >
                      ${BackIcon}
                      Back to History
                    </button>
                    <div class="flex items-center gap-2">
                      <span
                        class="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded"
                      >
                        ${this.result.returnCoordinatesOnly
                          ? 'Timeline Seek Mode'
                          : 'Clips Gallery Mode'}
                      </span>
                      <span
                        class="text-[10px] text-zinc-400 bg-white/5 border border-white/5 px-2.5 py-0.5 rounded"
                      >
                        ${this.result.aspectRatio}
                      </span>
                    </div>
                  </div>

                  ${this.result.returnCoordinatesOnly
                    ? this.renderTimelineResult()
                    : this.renderClipsResult()}
                </div>
              `
            : nothing}
        </div>

        <!-- ─── FLOATING BOTTOM PROMPT BAR ─── -->
        ${this.renderComposer()}

        ${this.renderErrorToasts()}
      </div>
    `;
  }

  updated(changed) {
    super.updated(changed);
    this._maybeSaveOnUpdate(changed);
    // React droppedFiles effect.
    if (changed.has('droppedFiles')) this._handleDroppedFiles();
  }
}

customElements.define('studio-clipping', StudioClipping);
