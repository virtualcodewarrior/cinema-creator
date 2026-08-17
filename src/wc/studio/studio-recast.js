// Port of packages/studio/src/components/RecastStudio.jsx.
// Body swap: source video + character image pickers, model/aspect/orientation
// dropdowns, persisted tabbed asset library, hover-play history grid,
// fullscreen preview (image or video by URL sniffing).
//
// Porting notes:
// - Upload state machine + progress ring live in <media-picker-button>;
//   this element holds the persisted urls + names and mirrors the original's
//   "add to asset library" side effects on successful picks.
// - The asset library persists under its own fixed key
//   (hg_recast_studio_assets, unscoped, no debounce) in the original;
//   mirrored exactly (sync write on change + initial mount write).
// - `generateError` and `showPrompt` mirror the original, where they are
//   set/derived without any effect on the rendered output — kept (state) /
//   omitted (pure derived value) accordingly.
// - The `hasRestored` ref is set by the load effect but consumed by nothing
//   in this component (unlike LipSyncStudio) — omitted.
// - The "Use" button in the library is a visual no-op in the original too;
//   selection is the row's (bubbling) click.
// - `animate-fade-in`/`animate-scale-up` have no keyframe definitions in the
//   original app either (the class names are inert there).
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import toast from '../../lib/toast.js';
import { processRecast } from 'studio/muapi.js';
import { formatErrorMessage } from 'studio/utils/formatError.js';
import { scopedPersistKey, migrateLegacyPersistKey } from 'studio/persistKey.js';
import {
  recastModels,
  getRecastModelById,
  getAspectRatiosForRecastModel,
} from 'studio/models.js';
import { matchesOrigin } from 'studio/modelOrigin.js';
import { modelOriginBadge, originFilterPills } from './origin-filter.js';
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
  PROMPT_CONTROL_LABEL_CLASS,
  PromptChevronIcon,
  PromptAspectRatioIcon,
} from './prompt-composer.js';
import { MediaPickerButton } from './media-picker-button.js';
import { AssetsLibraryDropdown } from './assets-library-dropdown.js';

const LEGACY_PERSIST_KEY = 'hg_recast_studio_persistent';
const ASSETS_PERSIST_KEY = 'hg_recast_studio_assets';

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

const LibraryIcon = svgOf(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/50 group-hover:text-[#22d3ee] transition-colors">' +
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />' +
    '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />' +
    '</svg>',
);

// Idle-state picker icons — plain strings (property-bound into
// <media-picker-button>; unsafeHTML is stamped inside that element).
const VIDEO_PICKER_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40 group-hover:text-[#22d3ee] transition-colors">' +
  '<polygon points="23 7 16 12 23 17 23 7" />' +
  '<rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>';

const IMAGE_PICKER_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/40 group-hover:text-[#22d3ee] transition-colors">' +
  '<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />' +
  '<circle cx="8.5" cy="8.5" r="1.5" />' +
  '<polyline points="21 15 16 10 5 21" /></svg>';

export class StudioRecast extends BaseElement {
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

    selectedModelId: { state: true },
    selectedAspectRatio: { state: true },
    videoUrl: { state: true },
    videoName: { state: true },
    imageUrl: { state: true },
    imageName: { state: true },
    prompt: { state: true },
    characterOrientation: { state: true },
    assetVideos: { state: true },
    assetImages: { state: true },
    assetResults: { state: true },
    isGenerating: { state: true },
    generateError: { state: true },
    fullscreenUrl: { state: true },
    internalHistory: { state: true },
    openDropdown: { state: true },
    modelOriginFilter: { state: true },
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

    const firstModel = recastModels[0];
    this.selectedModelId = firstModel?.id ?? '';
    this.selectedAspectRatio =
      firstModel?.inputs?.aspect_ratio?.default ?? '16:9';

    this.videoUrl = null;
    this.videoName = '';
    this.imageUrl = null;
    this.imageName = '';

    this.prompt = '';
    this.characterOrientation = 'image';

    this.assetVideos = [];
    this.assetImages = [];
    this.assetResults = [];

    this.isGenerating = false;
    this.generateError = null;
    this.fullscreenUrl = null;

    this.internalHistory = [];
    this.openDropdown = null;
    this.modelOriginFilter = 'all';

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
        if (data.selectedModelId) this.selectedModelId = data.selectedModelId;
        if (data.selectedAspectRatio)
          this.selectedAspectRatio = data.selectedAspectRatio;
        if (data.characterOrientation)
          this.characterOrientation = data.characterOrientation;
        if (data.videoUrl) this.videoUrl = data.videoUrl;
        if (data.imageUrl) this.imageUrl = data.imageUrl;
        if (data.videoName) this.videoName = data.videoName;
        if (data.imageName) this.imageName = data.imageName;
        if (data.prompt) this.prompt = data.prompt;
        if (data.internalHistory) this.internalHistory = data.internalHistory;
      }
    } catch (err) {
      console.warn('Failed to load RecastStudio persistence:', err);
    }
    // Unscoped asset library (original uses three separate useState
    // initializers, each reading the same key).
    try {
      const stored = localStorage.getItem(ASSETS_PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.assetVideos = data.videos || [];
        this.assetImages = data.images || [];
        this.assetResults = data.results || [];
      }
    } catch (err) {}
  }

  firstUpdated() {
    // Mirrors the original's per-dropdown outside-click handlers: only the
    // OPEN dropdown's handler is active, so a mousedown on another control's
    // trigger closes it (rather than being treated as "inside").
    this._outsideMouseDownBound = (e) => {
      if (!this.openDropdown) return;
      const node = this.renderRoot.querySelector(
        `[data-drop="${this.openDropdown}"]`,
      );
      const path = e.composedPath();
      if (node && !path.includes(node)) this.openDropdown = null;
    };
    document.addEventListener('mousedown', this._outsideMouseDownBound);
    // The original's save-assets effect also runs once on mount.
    this._saveAssets();
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

  // React save-assets effect: synchronous (no debounce) on list changes.
  _maybeSaveAssets(changed) {
    for (const key of changed.keys()) {
      if (
        key === 'assetVideos' ||
        key === 'assetImages' ||
        key === 'assetResults'
      ) {
        this._saveAssets();
        break;
      }
    }
  }

  _saveAssets() {
    try {
      localStorage.setItem(
        ASSETS_PERSIST_KEY,
        JSON.stringify({
          videos: this.assetVideos,
          images: this.assetImages,
          results: this.assetResults,
        }),
      );
    } catch (err) {
      console.warn('Failed to save RecastStudio assets:', err);
    }
  }

  // React save effect: 500 ms debounce over the persisted slice.
  _maybeSaveOnUpdate(changed) {
    const saveKeys = new Set([
      'selectedModelId',
      'selectedAspectRatio',
      'characterOrientation',
      'videoUrl',
      'videoName',
      'imageUrl',
      'imageName',
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
          selectedModelId: this.selectedModelId,
          selectedAspectRatio: this.selectedAspectRatio,
          characterOrientation: this.characterOrientation,
          videoUrl: this.videoUrl,
          videoName: this.videoName,
          imageUrl: this.imageUrl,
          imageName: this.imageName,
          prompt: this.prompt,
          internalHistory: this.internalHistory,
        };
        localStorage.setItem(this._persistKey, JSON.stringify(state));
      } catch (err) {
        console.warn('Failed to save RecastStudio persistence:', err);
      }
    }, 500);
  }

  _picker(accept) {
    return this.renderRoot.querySelector(
      `media-picker-button[accept="${accept}"]`,
    );
  }

  _addToAssetList(list, url, name) {
    const exists = list.some((item) => item.url === url);
    if (exists) return list;
    return [
      { url, name, timestamp: new Date().toISOString() },
      ...list,
    ].slice(0, 30);
  }

  // ── Media picker results ───────────────────────────────────────────────────
  handleVideoPicked(e) {
    if (e.detail) {
      const { url, name } = e.detail;
      this.videoUrl = url;
      this.videoName = name;
      this.assetVideos = this._addToAssetList(this.assetVideos, url, name);
    } else {
      this.videoUrl = null;
      this.videoName = '';
    }
  }

  handleImagePicked(e) {
    if (e.detail) {
      const { url, name } = e.detail;
      this.imageUrl = url;
      this.imageName = name;
      this.assetImages = this._addToAssetList(this.assetImages, url, name);
    } else {
      this.imageUrl = null;
      this.imageName = '';
    }
  }

  // ── Asset library events ───────────────────────────────────────────────────
  handleAssetSelect(e) {
    const { tab, url, name } = e.detail;
    if (tab === 'videos') {
      this.videoUrl = url;
      this.videoName = name || 'Selected Video';
    } else if (tab === 'images') {
      this.imageUrl = url;
      this.imageName = name || 'Selected Image';
    } else {
      this.videoUrl = url;
      this.videoName = name || 'Result Video';
    }
    this.openDropdown = null;
  }

  handleAssetDelete(e) {
    const { tab, url } = e.detail;
    if (tab === 'videos') {
      this.assetVideos = this.assetVideos.filter((item) => item.url !== url);
    } else if (tab === 'images') {
      this.assetImages = this.assetImages.filter((item) => item.url !== url);
    } else {
      this.assetResults = this.assetResults.filter((item) => item.url !== url);
    }
  }

  handleAssetPreview(e) {
    this.fullscreenUrl = e.detail;
  }

  // React droppedFiles effect (independent ifs — a drop containing both a
  // video and an image uploads both).
  _handleDroppedFiles() {
    if (this.droppedFiles && this.droppedFiles.length > 0) {
      const imageFiles = this.droppedFiles.filter((f) =>
        f.type.startsWith('image/'),
      );
      const videoFiles = this.droppedFiles.filter((f) =>
        f.type.startsWith('video/'),
      );
      if (videoFiles.length > 0)
        this._picker('video/*')?.startUpload(videoFiles[0]);
      if (imageFiles.length > 0)
        this._picker('image/*')?.startUpload(imageFiles[0]);
      this.onFilesHandled?.();
    }
  }

  // ── Model selection ────────────────────────────────────────────────────────
  handleModelSelect(model) {
    this.selectedModelId = model.id;
    const ratios = getAspectRatiosForRecastModel(model.id);
    if (ratios.length > 0) {
      this.selectedAspectRatio =
        model.inputs?.aspect_ratio?.default ?? ratios[0];
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
    if (!this.videoUrl) {
      alert('Please upload a source video first.');
      return;
    }
    if (!this.imageUrl) {
      alert('Please upload a character image first.');
      return;
    }

    this.onGenerationStart?.();
    this.isGenerating = true;
    this.generateError = null;

    try {
      const selectedModel = getRecastModelById(this.selectedModelId);
      const aspectOptions = getAspectRatiosForRecastModel(
        this.selectedModelId,
      );
      const showAspect = aspectOptions.length > 0;

      const params = {
        model: this.selectedModelId,
        video_url: this.videoUrl,
        image_url: this.imageUrl,
      };
      if (showAspect) params.aspect_ratio = this.selectedAspectRatio;
      if (this.prompt && selectedModel?.hasPrompt) params.prompt = this.prompt;
      if (this.selectedModelId === 'kling-v3.0-pro-recast') {
        params.character_orientation = this.characterOrientation;
      }

      const res = await processRecast(this.apiKey, params);

      if (!res?.url) throw new Error('No video URL returned by API');

      const genId = res.id || Date.now().toString();
      const entry = {
        id: genId,
        url: res.url,
        prompt: this.prompt,
        model: selectedModel?.name || this.selectedModelId,
        timestamp: new Date().toISOString(),
      };

      if (!this.historyItems) this._addToInternalHistory(entry);

      // Add to assets
      const resultName = this.prompt
        ? this.prompt.slice(0, 20) + '...'
        : `Result ${new Date().toLocaleTimeString()}`;
      const exists = this.assetResults.some((item) => item.url === res.url);
      if (!exists) {
        this.assetResults = this._addToAssetList(
          this.assetResults,
          res.url,
          resultName,
        );
      }

      if (this.onGenerationComplete) {
        this.onGenerationComplete({
          url: res.url,
          model: this.selectedModelId,
          prompt: this.prompt,
          type: 'recast',
        });
      }
    } catch (e) {
      console.error('[RecastStudio]', e);
      const errMsg = formatErrorMessage(e, 'Body swap generation failed');
      if (this.onGenerationError) this.onGenerationError(errMsg);
      else toast.error(errMsg);
    } finally {
      this.isGenerating = false;
      this.onGenerationEnd?.();
    }
  }

  _isImageUrl(url) {
    return !!(
      url.match(/\.(jpeg|jpg|gif|png|webp|avif)/i) ||
      url.includes('/ai-images/') ||
      url.includes('image') ||
      url.startsWith('data:image')
    );
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  renderHistoryCard(entry, idx) {
    const download = () =>
      this.downloadFile(entry.url, `bodyswap-${entry.id || idx}.mp4`);
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
            <span
              class="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20 whitespace-nowrap"
              >Body Swap</span
            >
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
            >BODY SWAP STUDIO</span
          >
        </h1>
        <p
          class="text-white/40 text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4"
        >
          Swap the character in any video dynamically by choosing a video clip and a target character image.
        </p>
      </div>
    `;
  }

  renderComposer() {
    const selectedModel = getRecastModelById(this.selectedModelId);
    const aspectOptions = getAspectRatiosForRecastModel(this.selectedModelId);
    const showAspect = aspectOptions.length > 0;
    const aspectDropdownItems = aspectOptions.map((r) => ({ id: r, name: r }));

    const dropdownPopover = (
      open,
      dataDrop,
      trigger,
      content,
      popoverClassName,
    ) => html`
      <div class="relative" data-drop=${dataDrop}>
        ${trigger}
        ${open ? content(popoverClassName) : nothing}
      </div>
    `;

    return html`
      <prompt-composer>
        <!-- Uploads row -->
        <div class="flex items-center gap-2 px-1">
          <div class="flex items-center gap-2">
            <!-- Source video -->
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

            <!-- Character image -->
            <media-picker-button
              accept="image/*"
              label="Character image"
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
          </div>

          <!-- Prompt textarea -->
          <div class="flex-1 flex flex-col">
            <prompt-textarea
              .value=${this.prompt}
              @input=${(e) => (this.prompt = e.currentTarget.value)}
              placeholder="Optional — describe the motion or scene..."
            ></prompt-textarea>
          </div>
        </div>

        <!-- Bottom controls row -->
        <prompt-footer>
          <prompt-controls>
            <!-- Model selector -->
            ${dropdownPopover(
              this.openDropdown === 'model',
              'model',
              html`
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
                  ><span class="text-[9px] font-black text-black">R</span></div
                  ><span class=${PROMPT_CONTROL_LABEL_CLASS}>${selectedModel?.name ??
                    'Select model'}</span
                  >${PromptChevronIcon()}</button
                >
              `,
              (popoverClassName) => html`
                <prompt-popover
                  .className=${popoverClassName}
                  @click=${(e) => e.stopPropagation()}
                >
                  ${promptPopoverHeader('Model')}
                  <div class="px-1 pb-2">
                    ${originFilterPills(this.modelOriginFilter, (o) => (this.modelOriginFilter = o))}
                  </div>
                  ${recastModels.filter((m) => matchesOrigin(m, this.modelOriginFilter)).length === 0
                    ? html`<div class="text-xs text-white/30 text-center py-4">No models found</div>`
                    : promptMenuList(html`
                        ${recastModels.filter((m) => matchesOrigin(m, this.modelOriginFilter)).map((item) =>
                          promptMenuItem({
                            children: html`<span class="flex items-center gap-1.5 min-w-0">
                              <span class="truncate">${item.name}</span>${modelOriginBadge(item)}
                            </span>`,
                            description: item.description?.slice(0, 75),
                            selected: item.id === this.selectedModelId,
                            onClick: () => {
                              this.handleModelSelect(item);
                              this.openDropdown = null;
                            },
                          }),
                        )}
                      `)}
                </prompt-popover>
              `,
              'w-80 max-w-[calc(100vw-2rem)]',
            )}

            <!-- Aspect ratio selector -->
            ${showAspect
              ? dropdownPopover(
                  this.openDropdown === 'aspect',
                  'aspect',
                  html`
                    <button
                      type="button"
                      @click=${(e) => {
                        e.stopPropagation();
                        this.openDropdown =
                          this.openDropdown === 'aspect'
                            ? null
                            : 'aspect';
                      }}
                      class=${promptControlClassName({
                        active: this.openDropdown === 'aspect',
                      })}
                    >${PromptAspectRatioIcon()}<span
                        class=${PROMPT_CONTROL_LABEL_CLASS}
                        >${this.selectedAspectRatio}</span
                      >${PromptChevronIcon()}</button
                    >
                  `,
                  (popoverClassName) => html`
                    <prompt-popover
                      .className=${popoverClassName}
                      @click=${(e) => e.stopPropagation()}
                    >
                      ${promptPopoverHeader('Aspect Ratio')}
                      ${promptMenuList(html`
                        ${aspectDropdownItems.map((item) =>
                          promptMenuItem({
                            children: item.name,
                            selected: item.id === this.selectedAspectRatio,
                            onClick: () => {
                              this.selectedAspectRatio = item.id;
                              this.openDropdown = null;
                            },
                          }),
                        )}
                      `)}
                    </prompt-popover>
                  `,
                  '',
                )
              : nothing}

            <!-- Character Orientation selector -->
            ${this.selectedModelId === 'kling-v3.0-pro-recast'
              ? dropdownPopover(
                  this.openDropdown === 'orientation',
                  'orientation',
                  html`
                    <button
                      type="button"
                      @click=${(e) => {
                        e.stopPropagation();
                        this.openDropdown =
                          this.openDropdown === 'orientation'
                            ? null
                            : 'orientation';
                      }}
                      class=${promptControlClassName({
                        active: this.openDropdown === 'orientation',
                      })}
                    ><span
                        class="text-xs font-semibold text-current opacity-50 group-hover:opacity-100 transition-opacity"
                        >Orientation:</span
                      ><span class="text-xs font-semibold text-current capitalize"
                        >${this.characterOrientation}</span
                      >${PromptChevronIcon()}</button
                    >
                  `,
                  (popoverClassName) => html`
                    <prompt-popover
                      .className=${popoverClassName}
                      @click=${(e) => e.stopPropagation()}
                    >
                      ${promptPopoverHeader('Orientation')}
                      ${promptMenuList(html`
                        ${promptMenuItem({
                          children: 'Image',
                          description: 'Use image orientation (Max 10s video)',
                          selected: this.characterOrientation === 'image',
                          onClick: () => {
                            this.characterOrientation = 'image';
                            this.openDropdown = null;
                          },
                        })}
                        ${promptMenuItem({
                          children: 'Video',
                          description: 'Use video orientation (Max 30s video)',
                          selected: this.characterOrientation === 'video',
                          onClick: () => {
                            this.characterOrientation = 'video';
                            this.openDropdown = null;
                          },
                        })}
                      `)}
                    </prompt-popover>
                  `,
                  'w-64',
                )
              : nothing}

            <!-- Assets Library selector -->
            ${dropdownPopover(
              this.openDropdown === 'assets',
              'assets',
              html`
                <button
                  type="button"
                  @click=${(e) => {
                    e.stopPropagation();
                    this.openDropdown =
                      this.openDropdown === 'assets' ? null : 'assets';
                  }}
                  class=${promptControlClassName({
                    active: this.openDropdown === 'assets',
                  })}
                >${LibraryIcon}<span
                    class="text-xs font-semibold text-white/70 group-hover:text-[#22d3ee] transition-colors"
                    >Library</span
                  >${PromptChevronIcon()}</button
                >
              `,
              (popoverClassName) => html`
                <assets-library-dropdown
                  .videos=${this.assetVideos}
                  .images=${this.assetImages}
                  .results=${this.assetResults}
                  @select=${this.handleAssetSelect}
                  @delete=${this.handleAssetDelete}
                  @preview=${this.handleAssetPreview}
                ></assets-library-dropdown>
              `,
              '',
            )}
          </prompt-controls>

          <!-- Generate button -->
          <prompt-action
            ?disabled=${this.isGenerating}
            @click=${() => this.handleGenerate()}
          >
            ${this.isGenerating
              ? html`<span class="animate-spin inline-block text-black">◌</span> Swapping...`
              : html`<span>Swap Body</span>`}
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
        ${this._isImageUrl(this.fullscreenUrl)
          ? html`
              <img
                src=${this.fullscreenUrl}
                alt="Fullscreen Preview"
                class="max-w-[95vw] max-h-[95vh] rounded-2xl shadow-2xl object-contain animate-scale-up"
                @click=${(e) => e.stopPropagation()}
              />
            `
          : html`
              <video
                src=${this.fullscreenUrl}
                controls
                autoplay
                loop
                class="max-w-[95vw] max-h-[95vh] rounded-2xl shadow-2xl object-contain animate-scale-up"
                @click=${(e) => e.stopPropagation()}
              ></video>
            `}
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
    this._maybeSaveAssets(changed);
    if (changed.has('droppedFiles')) this._handleDroppedFiles();
    // Tab reset parity with the original's per-open remount.
    if (changed.has('openDropdown') && this.openDropdown === 'assets') {
      this.renderRoot
        .querySelector('assets-library-dropdown')
        ?.resetTab();
    }
  }
}

customElements.define('studio-recast', StudioRecast);
