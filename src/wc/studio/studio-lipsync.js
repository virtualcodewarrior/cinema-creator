// Port of packages/studio/src/components/LipSyncStudio.jsx.
// Portrait-image or source-video + audio lipsync: mode toggle, circular
// media pickers (<media-picker-button>), model + resolution dropdowns,
// persisted draft/history, hover-play gallery grid and fullscreen preview.
//
// Porting notes:
// - `view`, `activeResultUrl`, `activeHistoryIdx`, and `generateError` mirror
//   the original, which sets state for them without any render site (there is
//   no "result" pane and no New/Reset button) — kept for parity.
// - `HistoryThumb`, `mediaStatusText`, and `hasHistory` are unused in the
//   original's rendered output, so they are omitted.
// - The original's inputMode model-sync effect is gated on a `hasRestored`
//   ref that is always true by the time it can run (the load effect sets it
//   in its finally on mount), so it can never fire; the explicit
//   model/resolution reset inside switchToImage/switchToVideo is all that
//   remains.
// - Upload state (state machine + progress ring) lives in
//   <media-picker-button>; this element holds the persisted urls + names.
// - `animate-fade-in`/`animate-scale-up` have no keyframe definitions in the
//   original app either (the class names are inert there), so they are left
//   undefined here; `animate-fade-in-up` comes from globals.css, which the
//   studio sheet already includes.
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import toast from '../../lib/toast.js';
import { processLipSync } from 'studio/muapi.js';
import { formatErrorMessage } from 'studio/utils/formatError.js';
import { scopedPersistKey, migrateLegacyPersistKey } from 'studio/persistKey.js';
import {
  lipsyncModels,
  imageLipSyncModels,
  videoLipSyncModels,
  getResolutionsForLipSyncModel,
} from 'studio/models.js';
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
  promptSegmentedControl,
  promptSegmentOption,
  PROMPT_CONTROL_LABEL_CLASS,
  PromptChevronIcon,
  PromptQualityIcon,
} from './prompt-composer.js';
import { MediaPickerButton } from './media-picker-button.js';

const LEGACY_PERSIST_KEY = 'hg_lipsync_studio_persistent';

// ── Inline SVG icons ─────────────────────────────────────────────────────────
const svgOf = (markup) => unsafeHTML(markup);

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

// Idle-state picker icons. Plain markup strings: they cross into
// <media-picker-button> through a property binding (.icon), and unsafeHTML
// directive instances may only be stamped in child bindings — the element
// wraps them itself when rendering.
const IMAGE_PICKER_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40 group-hover:text-[#22d3ee] transition-colors">' +
  '<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />' +
  '<circle cx="8.5" cy="8.5" r="1.5" />' +
  '<polyline points="21 15 16 10 5 21" /></svg>';

const VIDEO_PICKER_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40 group-hover:text-[#22d3ee] transition-colors">' +
  '<polygon points="23 7 16 12 23 17 23 7" />' +
  '<rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>';

const MIC_PICKER_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40 group-hover:text-[#22d3ee] transition-colors">' +
  '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />' +
  '<path d="M19 10v2a7 7 0 0 1-14 0v-2" />' +
  '<line x1="12" y1="19" x2="12" y2="23" /></svg>';

const PortraitSegmentIcon = svgOf(
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<rect x="3" y="3" width="18" height="18" rx="2" />' +
    '<circle cx="8.5" cy="8.5" r="1.5" />' +
    '<path d="m21 15-5-5L5 21" /></svg>',
);

const VideoSegmentIcon = svgOf(
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<rect x="2" y="5" width="15" height="14" rx="2" />' +
    '<path d="m17 10 5-3v10l-5-3" /></svg>',
);

export class StudioLipSync extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    // White-label contract props (were React props).
    apiKey: { type: String },
    onGenerationStart: { attribute: false },
    onGenerationEnd: { attribute: false },
    onGenerationComplete: { attribute: false },
    onGenerationError: { attribute: false },
    historyItems: { attribute: false },
    droppedFiles: { attribute: false },
    onFilesHandled: { attribute: false },

    inputMode: { state: true },
    selectedModelId: { state: true },
    selectedResolution: { state: true },
    imageUrl: { state: true },
    imageName: { state: true },
    videoUrl: { state: true },
    videoName: { state: true },
    audioUrl: { state: true },
    audioName: { state: true },
    prompt: { state: true },
    isGenerating: { state: true },
    generateError: { state: true },
    fullscreenUrl: { state: true },
    view: { state: true },
    activeResultUrl: { state: true },
    activeHistoryIdx: { state: true },
    internalHistory: { state: true },
    openDropdown: { state: true },
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
    this.droppedFiles = null;
    this.onFilesHandled = null;

    const first = imageLipSyncModels[0];
    this.inputMode = 'image';
    this.selectedModelId = first?.id ?? '';
    this.selectedResolution = first?.inputs?.resolution?.default ?? '480p';

    this.imageUrl = null;
    this.imageName = '';
    this.videoUrl = null;
    this.videoName = '';
    this.audioUrl = null;
    this.audioName = '';

    this.prompt = '';

    this.isGenerating = false;
    this.generateError = null;
    this.fullscreenUrl = null;
    this.view = 'input';
    this.activeResultUrl = null;
    this.activeHistoryIdx = 0;

    this.internalHistory = [];
    this.openDropdown = null;

    this._persistKey = null;
    this._saveTimer = null;
    this._outsideMouseDownBound = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey);
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, this._persistKey);
    try {
      const stored = localStorage.getItem(this._persistKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.inputMode) this.inputMode = data.inputMode;
        if (data.selectedModelId) this.selectedModelId = data.selectedModelId;
        if (data.selectedResolution)
          this.selectedResolution = data.selectedResolution;
        if (data.imageUrl) this.imageUrl = data.imageUrl;
        if (data.videoUrl) this.videoUrl = data.videoUrl;
        if (data.audioUrl) this.audioUrl = data.audioUrl;
        if (data.imageName) this.imageName = data.imageName;
        if (data.videoName) this.videoName = data.videoName;
        if (data.audioName) this.audioName = data.audioName;
        if (data.prompt) this.prompt = data.prompt;
        if (data.internalHistory) this.internalHistory = data.internalHistory;
      }
    } catch (err) {
      console.warn('Failed to load LipSyncStudio persistence:', err);
    }
  }

  firstUpdated() {
    this._outsideMouseDownBound = (e) => {
      const modelNode = this.renderRoot.querySelector('[data-drop="model"]');
      const resNode = this.renderRoot.querySelector(
        '[data-drop="resolution"]',
      );
      const path = e.composedPath();
      if (
        this.openDropdown === 'model' &&
        modelNode &&
        !path.includes(modelNode)
      )
        this.openDropdown = null;
      if (
        this.openDropdown === 'resolution' &&
        resNode &&
        !path.includes(resNode)
      )
        this.openDropdown = null;
    };
    document.addEventListener('mousedown', this._outsideMouseDownBound);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._outsideMouseDownBound)
      document.removeEventListener('mousedown', this._outsideMouseDownBound);
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = null;
  }

  get history() {
    return this.historyItems ?? this.internalHistory;
  }

  // React save effect: 500 ms debounce over the persisted slice.
  _maybeSaveOnUpdate(changed) {
    const saveKeys = new Set([
      'inputMode',
      'selectedModelId',
      'selectedResolution',
      'imageUrl',
      'imageName',
      'videoUrl',
      'videoName',
      'audioUrl',
      'audioName',
      'prompt',
      'internalHistory',
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
          inputMode: this.inputMode,
          selectedModelId: this.selectedModelId,
          selectedResolution: this.selectedResolution,
          imageUrl: this.imageUrl,
          imageName: this.imageName,
          videoUrl: this.videoUrl,
          videoName: this.videoName,
          audioUrl: this.audioUrl,
          audioName: this.audioName,
          prompt: this.prompt,
          internalHistory: this.internalHistory,
        };
        localStorage.setItem(this._persistKey, JSON.stringify(state));
      } catch (err) {
        console.warn('Failed to save LipSyncStudio persistence:', err);
      }
    }, 500);
  }

  // ── Mode toggle ────────────────────────────────────────────────────────────
  switchToImage() {
    if (this.inputMode === 'image') return;
    this.inputMode = 'image';
    this.videoUrl = null;
    this.videoName = '';
    const first = imageLipSyncModels[0];
    if (first) {
      this.selectedModelId = first.id;
      this.selectedResolution =
        first.inputs?.resolution?.default ?? '480p';
    }
  }

  switchToVideo() {
    if (this.inputMode === 'video') return;
    this.inputMode = 'video';
    this.imageUrl = null;
    this.imageName = '';
    const first = videoLipSyncModels[0];
    if (first) {
      this.selectedModelId = first.id;
      this.selectedResolution =
        first.inputs?.resolution?.default ?? '480p';
    }
  }

  // ── Model selection ────────────────────────────────────────────────────────
  handleModelSelect(model) {
    this.selectedModelId = model.id;
    const resolutions = getResolutionsForLipSyncModel(model.id);
    if (resolutions.length > 0) {
      this.selectedResolution =
        model.inputs?.resolution?.default ?? resolutions[0];
    }
  }

  // ── Media picker results ───────────────────────────────────────────────────
  _picker(accept) {
    return this.renderRoot.querySelector(
      `media-picker-button[accept="${accept}"]`,
    );
  }

  handleImagePicked(e) {
    if (e.detail) {
      this.imageUrl = e.detail.url;
      this.imageName = e.detail.name;
    } else {
      this.imageUrl = null;
      this.imageName = '';
    }
  }

  handleVideoPicked(e) {
    if (e.detail) {
      this.videoUrl = e.detail.url;
      this.videoName = e.detail.name;
    } else {
      this.videoUrl = null;
      this.videoName = '';
    }
  }

  handleAudioPicked(e) {
    if (e.detail) {
      this.audioUrl = e.detail.url;
      this.audioName = e.detail.name;
    } else {
      this.audioUrl = null;
      this.audioName = '';
    }
  }

  // React droppedFiles effect.
  async _handleDroppedFiles() {
    if (this.droppedFiles && this.droppedFiles.length > 0) {
      const imageFiles = this.droppedFiles.filter((f) =>
        f.type.startsWith('image/'),
      );
      const videoFiles = this.droppedFiles.filter((f) =>
        f.type.startsWith('video/'),
      );
      const audioFiles = this.droppedFiles.filter((f) =>
        f.type.startsWith('audio/'),
      );

      if (audioFiles.length > 0) {
        this._picker('audio/*')?.startUpload(audioFiles[0]);
      } else if (videoFiles.length > 0) {
        this.switchToVideo();
        await this.updateComplete;
        this._picker('video/*')?.startUpload(videoFiles[0]);
      } else if (imageFiles.length > 0) {
        this.switchToImage();
        await this.updateComplete;
        this._picker('image/*')?.startUpload(imageFiles[0]);
      }
      this.onFilesHandled?.();
    }
  }

  // ── History helpers ────────────────────────────────────────────────────────
  _addToInternalHistory(entry) {
    this.internalHistory = [entry, ...this.internalHistory].slice(0, 30);
  }

  deleteHistoryEntry(idx) {
    if (confirm('Are you sure you want to delete this generated item?')) {
      this.internalHistory = this.internalHistory.filter((_, i) => i !== idx);
    }
  }

  downloadFile = async (url, filename) => {
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
  };

  // ── Generation ─────────────────────────────────────────────────────────────
  async handleGenerate() {
    if (!this.audioUrl) {
      alert('Please upload an audio file first.');
      return;
    }
    if (this.inputMode === 'image' && !this.imageUrl) {
      alert('Please upload a portrait image first.');
      return;
    }
    if (this.inputMode === 'video' && !this.videoUrl) {
      alert('Please upload a source video first.');
      return;
    }

    this.onGenerationStart?.();
    this.isGenerating = true;
    this.generateError = null;

    try {
      const selectedModel = lipsyncModels.find(
        (m) => m.id === this.selectedModelId,
      );
      const resolutionOptions = getResolutionsForLipSyncModel(
        this.selectedModelId,
      );
      const showResolution = resolutionOptions.length > 0;

      const lipsyncParams = {
        model: this.selectedModelId,
        audio_url: this.audioUrl,
      };
      if (this.inputMode === 'image') lipsyncParams.image_url = this.imageUrl;
      else lipsyncParams.video_url = this.videoUrl;
      if (this.prompt && selectedModel?.hasPrompt)
        lipsyncParams.prompt = this.prompt;
      if (showResolution)
        lipsyncParams.resolution = this.selectedResolution;
      if (selectedModel?.hasSeed) lipsyncParams.seed = -1;

      const res = await processLipSync(this.apiKey, lipsyncParams);

      if (!res?.url) throw new Error('No video URL returned by API');

      const genId = res.id || Date.now().toString();
      const entry = {
        id: genId,
        url: res.url,
        prompt: this.prompt,
        model: this.selectedModelId,
        timestamp: new Date().toISOString(),
      };

      if (!this.historyItems) this._addToInternalHistory(entry);

      this.activeResultUrl = res.url;
      this.activeHistoryIdx = 0;
      this.view = 'result';

      if (this.onGenerationComplete) {
        this.onGenerationComplete({
          url: res.url,
          model: this.selectedModelId,
          prompt: this.prompt,
          type: 'lipsync',
        });
      }
    } catch (e) {
      console.error('[LipSyncStudio]', e);
      const errMsg = formatErrorMessage(e, 'Lip sync generation failed');
      if (this.onGenerationError) this.onGenerationError(errMsg);
      else toast.error(errMsg);
    } finally {
      this.isGenerating = false;
      this.onGenerationEnd?.();
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  renderHistoryCard(entry, idx) {
    const download = () =>
      this.downloadFile(entry.url, `lipsync-${entry.id || idx}.mp4`);
    return html`
      <div
        class="relative group rounded-2xl overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-xl hover:border-primary/50 transition-all duration-300 flex flex-col cursor-pointer"
        @click=${() => (this.fullscreenUrl = entry.url)}
      >
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

        <!-- Overlay actions -->
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
              download();
            }}
            class="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
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
          .prompt=${entry.prompt}
          .onCopyError=${this.onGenerationError}
          .actions=${[
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
          ${entry.prompt
            ? html`
                <p
                  class="text-white/70 text-xs line-clamp-2 leading-relaxed"
                  title=${entry.prompt}
                  >${entry.prompt}</p
                >
              `
            : nothing}
          <div
            class="flex items-center justify-between flex-wrap gap-1 mt-1"
          >
            <div class="flex items-center gap-2">
              <span
                class="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20 whitespace-nowrap"
                >Lip Sync</span
              >
              ${entry.resolution
                ? html`<span class="text-[10px] text-white/40">${entry.resolution}</span>`
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
        class="flex flex-col items-center justify-center h-full animate-fade-in-up transition-all duration-700 min-h-[50vh]"
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
            >START CREATING WITH</span
          >
          <span
            class="text-[#22d3ee] font-black uppercase text-2xl sm:text-4xl sm:mt-1 tracking-tight"
            >LIP SYNC STUDIO</span
          >
        </h1>
        <p
          class="text-white/40 text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4"
        >
          Sync any voice with any face video to create premium talking avatars and videos.
        </p>
      </div>
    `;
  }

  renderComposer() {
    const currentModels =
      this.inputMode === 'image' ? imageLipSyncModels : videoLipSyncModels;
    const selectedModel = lipsyncModels.find(
      (m) => m.id === this.selectedModelId,
    );
    const resolutionOptions = getResolutionsForLipSyncModel(
      this.selectedModelId,
    );
    const showResolution = resolutionOptions.length > 0;

    return html`
      <prompt-composer>
        <!-- Mode toggle row -->
        <div class="flex items-center px-1">
          ${promptSegmentedControl(html`
            ${promptSegmentOption({
              selected: this.inputMode === 'image',
              onClick: () => this.switchToImage(),
              children: html`${PortraitSegmentIcon}Portrait Image`,
            })}
            ${promptSegmentOption({
              selected: this.inputMode === 'video',
              onClick: () => this.switchToVideo(),
              children: html`${VideoSegmentIcon}Video`,
            })}
          `)}
        </div>

        <!-- Uploads row -->
        <div class="flex items-center gap-2 px-1">
          <div class="flex items-center gap-2">
            ${this.inputMode === 'image'
              ? html`
                  <media-picker-button
                    accept="image/*"
                    label="Image"
                    .icon=${IMAGE_PICKER_ICON}
                    .apiKey=${this.apiKey}
                    noun="Image"
                    .maxMb=${10}
                    sizeMessage="Image exceeds 10MB limit."
                    ?preview=${true}
                    .value=${this.imageUrl}
                    .fileName=${this.imageName}
                    @change=${this.handleImagePicked}
                  ></media-picker-button>
                `
              : html`
                  <media-picker-button
                    accept="video/*"
                    label="Video"
                    .icon=${VIDEO_PICKER_ICON}
                    .apiKey=${this.apiKey}
                    noun="Video"
                    .maxMb=${50}
                    sizeMessage="Video exceeds 50MB limit."
                    ?preview=${true}
                    ?isVideo=${true}
                    .value=${this.videoUrl}
                    .fileName=${this.videoName}
                    @change=${this.handleVideoPicked}
                  ></media-picker-button>
                `}

            <media-picker-button
              accept="audio/*"
              label="Audio"
              .icon=${MIC_PICKER_ICON}
              .apiKey=${this.apiKey}
              noun="Audio"
              .maxMb=${10}
              sizeMessage="Audio file exceeds 10MB limit."
              ?preview=${false}
              .value=${this.audioUrl}
              .fileName=${this.audioName}
              @change=${this.handleAudioPicked}
            ></media-picker-button>
          </div>

          <!-- Prompt textarea -->
          <div class="flex-1 flex flex-col">
            <prompt-textarea
              .value=${this.prompt}
              @input=${(e) => (this.prompt = e.currentTarget.value)}
              placeholder="Describe speech style..."
            ></prompt-textarea>
          </div>
        </div>

        <!-- Bottom controls row -->
        <prompt-footer>
          <prompt-controls>
            <!-- Model selector -->
            <div class="relative" data-drop="model">
              <button
                type="button"
                @click=${(e) => {
                  e.stopPropagation();
                  this.openDropdown =
                    this.openDropdown === 'model' ? null : 'model';
                }}
                class=${promptControlClassName({
                  active: this.openDropdown === 'model',
                })}
              ><div
                  class="w-3.5 h-3.5 bg-[#22d3ee] rounded-sm flex items-center justify-center"
                ><span class="text-[9px] font-black text-black">S</span></div
                ><span class=${PROMPT_CONTROL_LABEL_CLASS}>${selectedModel?.name ??
                  'Select model'}</span
                >${PromptChevronIcon()}</button
              >
              ${this.openDropdown === 'model'
                ? html`
                    <prompt-popover
                      .className=${'w-80 max-w-[calc(100vw-3rem)]'}
                      @click=${(e) => e.stopPropagation()}
                    >
                      ${promptPopoverHeader('Model')}
                      ${promptMenuList(html`
                        ${currentModels.map((item) =>
                          promptMenuItem({
                            children: item.name,
                            description: item.description
                              ? `${item.description.slice(0, 60)}${item.description.length > 60 ? '...' : ''}`
                              : undefined,
                            selected: item.id === this.selectedModelId,
                            onClick: () => {
                              this.handleModelSelect(item);
                              this.openDropdown = null;
                            },
                          }),
                        )}
                      `)}
                    </prompt-popover>
                  `
                : nothing}
            </div>

            <!-- Resolution selector -->
            ${showResolution
              ? html`
                  <div class="relative" data-drop="resolution">
                    <button
                      type="button"
                      @click=${(e) => {
                        e.stopPropagation();
                        this.openDropdown =
                          this.openDropdown === 'resolution'
                            ? null
                            : 'resolution';
                      }}
                      class=${promptControlClassName({
                        active: this.openDropdown === 'resolution',
                      })}
                    >
                      ${PromptQualityIcon()}
                      <span class=${PROMPT_CONTROL_LABEL_CLASS}>${this.selectedResolution}</span>
                    </button>
                    ${this.openDropdown === 'resolution'
                      ? html`
                          <prompt-popover @click=${(e) => e.stopPropagation()}>
                            ${promptPopoverHeader('Resolution')}
                            ${promptMenuList(html`
                              ${resolutionOptions.map(
                                (r) =>
                                  promptMenuItem({
                                    children: r,
                                    selected: r === this.selectedResolution,
                                    onClick: () => {
                                      this.selectedResolution = r;
                                      this.openDropdown = null;
                                    },
                                  }),
                              )}
                            `)}
                          </prompt-popover>
                        `
                      : nothing}
                  </div>
                `
              : nothing}
          </prompt-controls>

          <!-- Generate button -->
          <prompt-action
            ?disabled=${this.isGenerating}
            @click=${() => this.handleGenerate()}
          >
            ${this.isGenerating
              ? html`<span class="animate-spin inline-block text-black">◌</span> Generating...`
              : html`<span>Sync Lip</span>`}
          </prompt-action>
        </prompt-footer>
      </prompt-composer>
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
        <video
          src=${this.fullscreenUrl}
          controls
          autoplay
          loop
          class="max-w-[95vw] max-h-[95vh] rounded-2xl shadow-2xl object-contain animate-scale-up"
          @click=${(e) => e.stopPropagation()}
        ></video>
      </div>
    `;
  }

  render() {
    const history = this.history;
    return html`
      <div
        class="w-full h-full flex flex-col items-center justify-center bg-app-bg relative overflow-hidden"
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

        <!-- ── FULLSCREEN MEDIA MODAL ── -->
        ${this.renderFullscreen()}
      </div>
    `;
  }

  updated(changed) {
    super.updated(changed);
    this._maybeSaveOnUpdate(changed);
    if (changed.has('droppedFiles')) this._handleDroppedFiles();
  }
}

customElements.define('studio-lipsync', StudioLipSync);
