// Port of packages/studio/src/components/VibeMotionStudio.jsx.
// PromptComposer family + MobileGenerationActions/GenerationCopyButtons come
// from the shared P3.3 modules. Notable porting decisions:
// - outside-click uses document 'mousedown' (like the original), tested
//   against the prompt-controls area via composedPath
// - Ctrl/Cmd+Enter in the textarea generates (native keydown events are
//   composed, so the host receives them)
// - remix flow: editMode + editSourceId, stale-edit error detection
// - history persists as a bare JSON array; the in-memory-only canEdit flag
//   is stripped on save and dropped on load (as in the original)
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import toast from '../../lib/toast.js';
import { runMotionGraphics, runMotionGraphicsEdit } from 'studio/muapi.js';
import { formatErrorMessage } from 'studio/utils/formatError.js';
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
  promptSegmentedControl,
  promptSegmentOption,
  PromptChevronIcon,
  PromptAspectRatioIcon,
  PromptDurationIcon,
  promptControlClassName,
  PROMPT_CONTROL_LABEL_CLASS,
} from './prompt-composer.js';
import {
  GenerationCopyButtons,
  MobileGenerationActions,
} from './mobile-generation-actions.js';

const svgOf = (markup) => unsafeHTML(markup);

const CheckSvg = svgOf(
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="4"><polyline points="20 6 9 17 4 12" /></svg>',
);

const DownloadSvg = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>',
);

const EditSvg = (cls = '') =>
  svgOf(
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="${cls}">` +
      '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
      '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>' +
      (cls === 'legacy' ? '<line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2"/>' : '') +
      '</svg>',
  );

const TrashSvg = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6" />' +
    '<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />' +
    '<line x1="10" y1="11" x2="10" y2="17" />' +
    '<line x1="14" y1="11" x2="14" y2="17" /></svg>',
);

const StarSvg = svgOf(
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-violet-400 animate-pulse"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>',
);

const TinySpinSvg = svgOf(
  '<svg class="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10" stroke-opacity="0.2"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>',
);

const ErrorSvg = svgOf(
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
);

const EditBannerSvg = svgOf(
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="flex-shrink-0"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
);

const EditMiniSvg = svgOf(
  '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
);

async function downloadFile(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
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

const formatTime = (s) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const LEGACY_PERSIST_KEY = 'hg_vibe_motion_studio_persistent';
const ASPECT_RATIOS = ['16:9', '9:16', '1:1'];
const DURATION_OPTIONS = [5, 6, 8, 10, 12, 15, 20, 25, 30];

export class StudioMotion extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    // White-label contract props (were React props).
    apiKey: { type: String },
    onGenerationStart: { attribute: false },
    onGenerationEnd: { attribute: false },
    onGenerationComplete: { attribute: false },
    onGenerationError: { attribute: false },

    prompt: { state: true },
    aspectRatio: { state: true },
    duration: { state: true },
    editMode: { state: true },
    editSourceId: { state: true },
    openDropdown: { state: true }, // "ar" | "dur" | "source"
    generating: { state: true },
    generateError: { state: true },
    elapsedTime: { state: true },
    history: { state: true },
    fullscreenUrl: { state: true },
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

    this.prompt = '';
    this.aspectRatio = '16:9';
    this.duration = 6;
    this.editMode = false;
    this.editSourceId = null;
    this.openDropdown = null;
    this.generating = false;
    this.generateError = null;
    this.elapsedTime = 0;
    this.history = [];
    this.fullscreenUrl = null;

    this._persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey);
    this._timer = null;
    this._pendingRequestId = null;
    this._outsideMouseDownBound = null;
  }

  get editSources() {
    // Show all entries with a requestId as editable UNLESS they are
    // explicitly marked canEdit:false (entries loaded from localStorage
    // without the flag are treated as optimistically editable)
    return this.history.filter((h) => h.requestId && h.canEdit !== false);
  }

  get sourceEntry() {
    return this.editSources.find((h) => h.requestId === this.editSourceId);
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._persistKey !== scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey)) {
      this._persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey);
    }
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, this._persistKey);
    try {
      const saved = JSON.parse(localStorage.getItem(this._persistKey) || '[]');
      if (Array.isArray(saved)) {
        // Strip any wrongly-persisted canEdit:false flags from old bug —
        // restore all entries as remixable
        this.history = saved.map((h) => {
          const { canEdit, ...rest } = h;
          return rest;
        });
      }
    } catch (_) {}
  }

  firstUpdated() {
    // Original: document 'mousedown' outside the controls area closes
    // whichever dropdown is open.
    this._outsideMouseDownBound = (e) => {
      if (!this.openDropdown) return;
      const controls = this.renderRoot.querySelector('prompt-controls');
      const path = e.composedPath();
      if (controls && path.includes(controls)) return;
      this.openDropdown = null;
    };
    document.addEventListener('mousedown', this._outsideMouseDownBound);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._outsideMouseDownBound)
      document.removeEventListener('mousedown', this._outsideMouseDownBound);
    this.stopTimer();
  }

  saveHistory(items) {
    this.history = items;
    // Strip canEdit from persisted data — it is an in-memory hint only
    const stripped = items.map(({ canEdit, ...rest }) => rest);
    try {
      localStorage.setItem(this._persistKey, JSON.stringify(stripped));
    } catch (_) {}
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

  async handleGenerate() {
    if (!this.prompt.trim() || this.generating) return;
    this.onGenerationStart?.();
    this.generating = true;
    this.generateError = null;
    this.startTimer();
    try {
      let result;
      if (this.editMode) {
        result = await runMotionGraphicsEdit(this.apiKey, {
          request_id: this.editSourceId,
          edit_prompt: this.prompt.trim(),
          aspect_ratio: this.aspectRatio,
          duration_seconds: this.duration,
          onRequestId: (id) => {
            this._pendingRequestId = id;
          },
        });
      } else {
        result = await runMotionGraphics(this.apiKey, {
          prompt: this.prompt.trim(),
          aspect_ratio: this.aspectRatio,
          duration_seconds: this.duration,
          onRequestId: (id) => {
            this._pendingRequestId = id;
          },
        });
      }

      const videoUrl =
        result?.output?.video || result?.url || result?.outputs?.[0];
      const requestId =
        result?.id || result?.request_id || this._pendingRequestId;

      const entry = {
        id: requestId || Date.now().toString(),
        requestId,
        url: videoUrl,
        prompt: this.prompt.trim(),
        aspectRatio: this.aspectRatio,
        duration: this.duration,
        mode: this.editMode ? 'edit' : 'generate',
        sourceId: this.editMode ? this.editSourceId : null,
        timestamp: new Date().toISOString(),
        // Mark as editable — only generations created with saved animation
        // code can be remixed
        canEdit: true,
      };

      this.saveHistory([entry, ...this.history].slice(0, 30));
      this.onGenerationComplete?.({ url: videoUrl, type: 'video' });
    } catch (err) {
      // Detect the backend's "animation code not saved" limitation
      const raw = err.message || '';
      const isStaleEdit =
        raw.includes('animation code') ||
        raw.includes('does not have saved') ||
        raw.includes('Original generation does not');

      if (isStaleEdit) {
        console.warn('[VibeMotionStudio] Remix unavailable:', raw.slice(0, 120));
        const msg =
          "This generation can't be remixed — the animation code wasn't saved server-side. Generate a new motion graphic first, then remix that result.";
        if (this.onGenerationError) this.onGenerationError(msg);
        else toast.error(msg);
        this.editMode = false;
        this.editSourceId = null;
      } else {
        console.error('[VibeMotionStudio]', err);
        const errMsg = formatErrorMessage(
          raw || err,
          'Vibe Motion generation failed',
        );
        if (this.onGenerationError) this.onGenerationError(errMsg);
        else toast.error(errMsg);
      }
    } finally {
      this.generating = false;
      this.stopTimer();
      this.onGenerationEnd?.();
    }
  }

  handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.handleGenerate();
  }

  toggleDropdown(type) {
    return (e) => {
      e.stopPropagation();
      this.openDropdown = this.openDropdown === type ? null : type;
    };
  }

  startRemix(entry) {
    this.editMode = true;
    this.editSourceId = entry.requestId;
    this.prompt = '';
    setTimeout(() => {
      this.renderRoot.querySelector('prompt-textarea')?.focus();
    }, 50);
  }

  renderDropdownItem(label, selected, onClick) {
    return promptMenuItem({
      children: label,
      selected,
      onClick,
    });
  }

  render() {
    return html`
      <div
        class="w-full h-full flex flex-col items-center justify-center bg-app-bg relative overflow-hidden"
      >
        <!-- Fullscreen overlay -->
        ${this.fullscreenUrl
          ? html`
              <div
                class="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
                @click=${() => (this.fullscreenUrl = null)}
              >
                <video
                  src=${this.fullscreenUrl}
                  autoPlay
                  loop
                  controls
                  class="max-h-[90vh] max-w-[90vw] rounded shadow-2xl"
                  @click=${(e) => e.stopPropagation()}
                ></video>
                <button
                  class="absolute top-6 right-6 text-white/60 hover:text-white transition-colors text-3xl font-light leading-none"
                  @click=${() => (this.fullscreenUrl = null)}
                >
                  ×
                </button>
              </div>
            `
          : nothing}

        <!-- GALLERY AREA -->
        <div
          class="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-40 lg:pb-32 px-2"
        >
          ${this.generating
            ? html`
                <div class="w-full pt-6 flex justify-center animate-fade-in-up">
                  <div class="flex flex-col items-center gap-4 py-16">
                    <div class="relative w-20 h-20">
                      <div
                        class="absolute inset-0 rounded-full border-2 border-violet-500/20 animate-ping"
                      ></div>
                      <div
                        class="absolute inset-2 rounded-full border-2 border-[#22d3ee]/30 animate-spin"
                      ></div>
                      <div
                        class="absolute inset-4 rounded-full border-2 border-violet-400/50 animate-[spin_1.5s_linear_infinite_reverse]"
                      ></div>
                      <div
                        class="absolute inset-0 flex items-center justify-center"
                      >
                        ${StarSvg}
                      </div>
                    </div>
                    <div class="flex flex-col items-center gap-1">
                      <span class="text-white/80 font-semibold text-sm">
                        ${this.editMode
                          ? 'Remixing motion graphics…'
                          : 'Generating motion graphics…'}
                      </span>
                      <span class="text-white/30 text-xs"
                        >React/Remotion rendering on Modal</span
                      >
                    </div>
                    <div
                      class="flex items-center gap-2 text-white/30 text-xs bg-white/[0.03] px-4 py-1.5 rounded-full border border-white/[0.05]"
                    >
                      ${TinySpinSvg}
                      ${formatTime(this.elapsedTime)}
                    </div>
                  </div>
                </div>
              `
            : nothing}

          ${!this.generating && this.history.length > 0
            ? html`
                <div
                  class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full pt-4 animate-fade-in-up"
                >
                  ${this.history.map(
                    (entry, idx) => this.renderHistoryCard(entry, idx),
                  )}
                </div>
              `
            : !this.generating
              ? html`
                  <!-- Empty State -->
                  ${this.renderEmptyState()}
                `
              : nothing}
        </div>

        ${this.renderComposer()}
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
            >VIBE MOTION STUDIO</span
          >
        </h1>
        <p
          class="text-white/40 text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4"
        >
          Generate animated motion graphics from a text prompt — kinetic typography, data charts, logo reveals, and more.
        </p>
      </div>
    `;
  }

  renderHistoryCard(entry, idx) {
    const canRemix = entry.requestId && entry.canEdit !== false;
    return html`
      <div
        @click=${() => (this.fullscreenUrl = entry.url)}
        class="relative group rounded overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-xl hover:border-primary/50 transition-all duration-300 flex flex-col cursor-pointer"
      >
        <!-- Video thumbnail -->
        <video
          src=${entry.url}
          class="w-full aspect-video object-cover bg-black/40 hover:opacity-80 transition-opacity"
          loop
          muted
          playsinline
          @mouseover=${(e) => e.target.play()}
          @mouseout=${(e) => {
            e.target.pause();
            e.target.currentTime = 0;
          }}
        ></video>

        <!-- Mode tag (top-left) -->
        <div
          class="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider backdrop-blur-sm border ${
            entry.mode === 'edit'
              ? 'bg-[#22d3ee]/20 text-[#22d3ee] border-[#22d3ee]/30'
              : 'bg-violet-600/30 text-violet-300 border-violet-500/30'
          }"
        >
          ${entry.mode === 'edit' ? '✏ Edit' : '✦ Generated'}
        </div>

        <!-- Hover overlay actions -->
        <div
          class="absolute top-2 right-2 hidden md:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <generation-copy-buttons
            .prompt=${entry.prompt}
            .onCopyError=${this.onGenerationError}
          ></generation-copy-buttons>
          <button
            type="button"
            title="Download"
            @click=${(e) => {
              e.stopPropagation();
              downloadFile(entry.url, `motion-${entry.id || idx}.mp4`);
            }}
            class="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
          >
            ${DownloadSvg}
          </button>
          ${canRemix
            ? html`
                <button
                  type="button"
                  title="Remix this generation"
                  @click=${(e) => {
                    e.stopPropagation();
                    this.startRemix(entry);
                  }}
                  class="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-[#22d3ee] hover:text-black transition-all border border-white/10"
                >
                  ${EditSvg()}
                </button>
              `
            : entry.requestId && entry.canEdit === false
              ? html`
                  <div
                    title="Legacy generation — remix not available. Generate a new motion graphic to enable editing."
                    class="p-2 bg-black/60 backdrop-blur-md rounded-full text-white/20 border border-white/5 cursor-not-allowed"
                  >
                    ${EditSvg('legacy opacity-40')}
                  </div>
                `
              : nothing}
          <button
            type="button"
            title="Delete"
            @click=${(e) => {
              e.stopPropagation();
              if (
                confirm('Are you sure you want to delete this generated item?')
              ) {
                // Original updates state only (no persistence) — parity bug kept
                this.history = this.history.filter((_, i) => i !== idx);
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
                downloadFile(entry.url, `motion-${entry.id || idx}.mp4`),
            },
            entry.requestId &&
            entry.canEdit !== false && {
              kind: 'remix',
              label: 'Remix',
              onSelect: () => this.startRemix(entry),
            },
            {
              kind: 'delete',
              label: 'Delete',
              danger: true,
              onSelect: () => {
                if (
                  confirm('Are you sure you want to delete this generated item?')
                ) {
                  // Original updates state only (no persistence) — parity bug kept
                  this.history = this.history.filter((_, i) => i !== idx);
                }
              },
            },
          ]}
        ></mobile-generation-actions>

        <!-- Card footer: prompt + metadata -->
        <div
          class="p-3 bg-black/80 backdrop-blur-sm border-t border-white/5 flex-1 flex flex-col justify-between gap-2"
        >
          <p
            class="text-white/70 text-xs line-clamp-3 leading-relaxed"
            title=${entry.prompt}
          >
            ${entry.prompt || 'No prompt'}
          </p>
          <div class="flex items-center justify-between mt-1 flex-wrap gap-1">
            <div class="flex items-center gap-2">
              <span
                class="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20 whitespace-nowrap"
                >Vibe Motion</span
              >
              <div class="flex gap-2">
                ${entry.aspectRatio
                  ? html`<span class="text-[10px] text-white/40"
                      >${entry.aspectRatio}</span
                    >`
                  : nothing}
                ${entry.duration
                  ? html`<span class="text-[10px] text-white/40"
                      >${entry.duration}s</span
                    >`
                  : nothing}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderComposer() {
    const sources = this.editSources;
    const sourceEntry = this.sourceEntry;
    return html`
      <prompt-composer>
        <!-- Top Row: Mode Toggle & Edit Source Banner -->
        <div class="flex items-center justify-between gap-3 px-1">
          <!-- Left: Mode toggle pill -->
          ${promptSegmentedControl(
            html`
              ${promptSegmentOption({
                children: 'Generate',
                selected: !this.editMode,
                onClick: () => {
                  this.editMode = false;
                  this.editSourceId = null;
                },
              })}
              ${promptSegmentOption({
                children: 'Edit',
                selected: this.editMode,
                disabled: sources.length === 0,
                className: 'disabled:opacity-30 disabled:cursor-not-allowed',
                onClick: () => {
                  this.editMode = true;
                },
              })}
            `,
            'flex-shrink-0',
          )}

          <!-- Right: Edit mode status banner beside toggle buttons -->
          ${this.editMode
            ? html`
                <div
                  class="flex items-center gap-2 px-3 py-1 bg-[#22d3ee]/5 border border-[#22d3ee]/10 rounded-full text-[11px] text-[#22d3ee] font-medium tracking-tight min-w-0 max-w-full overflow-hidden"
                >
                  ${EditBannerSvg}
                  <span class="truncate">
                    ${sourceEntry
                      ? `Editing: "${sourceEntry.prompt?.slice(0, 45)}${sourceEntry.prompt?.length > 45 ? '…' : ''}"`
                      : 'Select a source generation from the gallery'}
                  </span>
                  <button
                    @click=${() => {
                      this.editMode = false;
                      this.editSourceId = null;
                      this.prompt = '';
                    }}
                    class="ml-auto text-[#22d3ee]/40 hover:text-[#22d3ee] transition-colors text-sm leading-none flex-shrink-0"
                    title="Cancel Edit Mode"
                  >
                    ×
                  </button>
                </div>
              `
            : nothing}
        </div>

        <!-- Bottom: Textarea full width -->
        <div class="w-full">
          <prompt-textarea
            .value=${this.prompt}
            @input=${(e) => (this.prompt = e.currentTarget.value)}
            @keydown=${this.handleKeyDown}
            placeholder=${this.editMode
              ? "Describe what to change — 'change background to dark navy, make bars gold, add particles…'"
              : "Describe the motion graphic — 'Animated sales dashboard with glowing bar charts and rising numbers'"}
          ></prompt-textarea>
        </div>

        <!-- Error banner -->
        ${this.generateError
          ? html`
              <div
                class="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs"
              >
                ${ErrorSvg}
                ${this.generateError}
              </div>
            `
          : nothing}

        <!-- Controls row: dropdowns + generate button -->
        <prompt-footer>
          <prompt-controls>
            <!-- Aspect Ratio dropdown -->
            <div class="relative">
              <button
                type="button"
                @click=${this.toggleDropdown('ar')}
                class=${promptControlClassName({
                  active: this.openDropdown === 'ar',
                })}
              >
                ${PromptAspectRatioIcon()}
                <span class=${PROMPT_CONTROL_LABEL_CLASS}
                  >${this.aspectRatio}</span
                >
              </button>
              ${this.openDropdown === 'ar'
                ? html`
                    <prompt-popover>
                      ${promptPopoverHeader('Aspect Ratio')}
                      ${promptMenuList(
                        ASPECT_RATIOS.map(
                          (ar) =>
                            this.renderDropdownItem(
                              ar,
                              this.aspectRatio === ar,
                              () => {
                                this.aspectRatio = ar;
                                this.openDropdown = null;
                              },
                            ),
                        ),
                      )}
                    </prompt-popover>
                  `
                : nothing}
            </div>

            <!-- Duration dropdown -->
            <div class="relative">
              <button
                type="button"
                @click=${this.toggleDropdown('dur')}
                class=${promptControlClassName({
                  active: this.openDropdown === 'dur',
                })}
              >
                ${PromptDurationIcon()}
                <span class=${PROMPT_CONTROL_LABEL_CLASS}
                  >${this.duration}s</span
                >
              </button>
              ${this.openDropdown === 'dur'
                ? html`
                    <prompt-popover>
                      ${promptPopoverHeader('Duration')}
                      ${promptMenuList(
                        DURATION_OPTIONS.map(
                          (d) =>
                            this.renderDropdownItem(
                              `${d}s`,
                              this.duration === d,
                              () => {
                                this.duration = d;
                                this.openDropdown = null;
                              },
                            ),
                        ),
                      )}
                    </prompt-popover>
                  `
                : nothing}
            </div>

            <!-- Edit source picker dropdown — only shown in edit mode -->
            ${this.editMode && sources.length > 0
              ? html`
                  <div class="relative">
                    <button
                      type="button"
                      @click=${this.toggleDropdown('source')}
                      class=${promptControlClassName({ active: true })}
                    >
                      <div
                        class="w-4 h-4 bg-[#22d3ee]/20 rounded flex items-center justify-center border border-[#22d3ee]/30"
                        >${EditMiniSvg}</div
                      >
                      <span
                        class="${PROMPT_CONTROL_LABEL_CLASS} text-[#22d3ee]/70 max-w-[120px] truncate"
                        >${sourceEntry
                          ? `Source: ${sourceEntry.prompt?.slice(0, 20)}…`
                          : 'Pick source…'}</span
                      >${PromptChevronIcon()}
                    </button>
                    ${this.openDropdown === 'source'
                      ? html`
                          <prompt-popover class="w-64">
                            ${promptPopoverHeader('Source Generation')}
                            <div class="flex flex-col gap-1">
                              ${sources.map(
                                (src) => html`
                                  <div
                                    class="flex items-center gap-3 p-2 hover:bg-white/5 rounded cursor-pointer transition-all group/opt"
                                    @click=${() => {
                                      this.editSourceId = src.requestId;
                                      this.openDropdown = null;
                                    }}
                                  >
                                    <div
                                      class="w-10 h-7 rounded overflow-hidden bg-black/40 flex-shrink-0 border border-white/5"
                                    >
                                      <video
                                        src=${src.url}
                                        class="w-full h-full object-cover"
                                        muted
                                        playsinline
                                      ></video>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                      <p
                                        class="text-[11px] text-white/70 truncate leading-tight group-hover/opt:text-white"
                                        >${src.prompt}</p
                                      >
                                      <p class="text-[9px] text-white/30 mt-0.5"
                                        >${src.aspectRatio} · ${src.duration}s</p
                                      >
                                    </div>
                                    ${this.editSourceId === src.requestId
                                      ? CheckSvg
                                      : nothing}
                                  </div>
                                `,
                              )}
                            </div>
                          </prompt-popover>
                        `
                      : nothing}
                  </div>
                `
              : nothing}

            <span class="text-[10px] text-white/20 hidden sm:block ml-2"
              >Ctrl+Enter to run</span
            >
          </prompt-controls>

          <!-- Generate Button -->
          <prompt-action
            .disabled=${
              this.generating ||
              !this.prompt.trim() ||
              (this.editMode && !this.editSourceId)
            }
            @click=${this.handleGenerate}
          >
            ${this.generating
              ? html`
                  <span class="animate-spin inline-block text-black">◌</span>
                  ${this.editMode ? 'Remixing...' : 'Generating...'}
                `
              : this.editMode
                ? html`<span>Remix</span>`
                : html`<span>Generate</span>`}
          </prompt-action>
        </prompt-footer>
      </prompt-composer>
    `;
  }
}

customElements.define('studio-motion', StudioMotion);
