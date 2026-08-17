// Port of packages/studio/src/components/ImageStudio.jsx.
// The default studio: t2i/i2i model dropdown (provider sidebar + search),
// aspect/quality/effect controls, batch stepper, reference-image picker with
// persisted upload history, auto t2i→i2i mode switching with model-sibling
// mapping, "Draw to Edit" canvas modal, batched generation, gallery.
//
// Porting notes:
// - UploadButton and ModelDropdown became <image-upload-button> and
//   <image-model-dropdown> elements (each owns React-local state); the
//   upload history state stays here (parent-owned, mirrored down as in the
//   original's persistedHistory/onHistoryChange wiring).
// - DrawModal is always rendered (React keeps it mounted, `isOpen` nulls the
//   output), so its draft state survives close/reopen exactly as before.
// - Outside-click closes any open control dropdown unless the click is inside
//   the <prompt-controls> host (React's single dropdownRef on PromptControls).
// - `generateError`, `currentImageUrl`, `activeHistoryIdx`, `resetToPrompt`
//   mirror the original's set-but-never-rendered state / dead handler.
// - `historyItems`/`onDeleteHistoryItem`/`droppedFiles`/`onFilesHandled`
//   props are never passed by the shell (standalone studio) — omitted.
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import toast from '../../lib/toast.js';
import { generateImage, generateI2I } from 'studio/muapi.js';
import { formatErrorMessage } from 'studio/utils/formatError.js';
import { scopedPersistKey, migrateLegacyPersistKey } from 'studio/persistKey.js';
import {
  t2iModels,
  i2iModels,
  getAspectRatiosForModel,
  getResolutionsForModel,
  getQualityFieldForModel,
  getAspectRatiosForI2IModel,
  getResolutionsForI2IModel,
  getQualityFieldForI2IModel,
  getMaxImagesForI2IModel,
  getEffectsForI2IModel,
  getDefaultEffectForI2IModel,
  getI2IModelById,
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
  PROMPT_MEDIA_PREVIEW_CLASS,
  PROMPT_CONTROL_LABEL_CLASS,
  PromptChevronIcon,
  PromptAspectRatioIcon,
  PromptQualityIcon,
} from './prompt-composer.js';
import { ImageUploadButton } from './image-upload-button.js';
import { ImageModelDropdown } from './image-model-dropdown.js';
import { DrawModal } from './draw-modal.js';

const LEGACY_PERSIST_KEY = 'hg_image_studio_persistent';

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

// t2i → i2i naming exceptions (hardcoded in the original)
const I2I_EXCEPTIONS = {
  'reve-text-to-image': 'reve-image-edit',
  'wan2.1-text-to-image': 'wan2.5-image-edit',
  'wan2.5-text-to-image': 'wan2.5-image-edit',
  'wan2.6-text-to-image': 'wan2.6-image-edit',
  'kling-o1-text-to-image': 'kling-o1-edit-image',
  'vidu-q2-text-to-image': 'vidu-q2-reference-to-image',
  'bytedance-seedream-v3': 'bytedance-seededit-v3',
  'bytedance-seedream-v4': 'bytedance-seedream-edit-v4',
  'ideogram-v3-t2i': 'ideogram-v3-reframe',
};
const T2I_REVERSE_EXCEPTIONS = {
  'reve-image-edit': 'reve-text-to-image',
  'wan2.5-image-edit': 'wan2.5-text-to-image',
  'wan2.6-image-edit': 'wan2.6-text-to-image',
  'kling-o1-edit-image': 'kling-o1-text-to-image',
  'vidu-q2-reference-to-image': 'vidu-q2-text-to-image',
  'bytedance-seededit-v3': 'bytedance-seedream-v3',
  'bytedance-seedream-edit-v4': 'bytedance-seedream-v4',
  'ideogram-v3-reframe': 'ideogram-v3-t2i',
};

async function downloadImage(url, filename) {
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

const uid = () => Math.random().toString(36).substring(7);

export class StudioImage extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    apiKey: { type: String },
    imageMode: { state: true },
    selectedModelId: { state: true },
    selectedModelName: { state: true },
    selectedAr: { state: true },
    selectedQuality: { state: true },
    selectedEffect: { state: true },
    maxImages: { state: true },
    prompt: { state: true },
    uploadedImageUrls: { state: true },
    swapImageUrl: { state: true },
    uploadHistory: { state: true },
    dropdownOpen: { state: true },
    generating: { state: true },
    fullscreenUrl: { state: true },
    isDrawModalOpen: { state: true },
    currentImageUrl: { state: true },
    activeHistoryIdx: { state: true },
    batchSize: { state: true },
    localHistory: { state: true },
  };

  constructor() {
    super();
    this.apiKey = '';
    this.imageMode = false;
    this.selectedModelId = t2iModels[0].id;
    this.selectedModelName = t2iModels[0].name;
    this.selectedAr = t2iModels[0].inputs?.aspect_ratio?.default || '1:1';
    this.selectedQuality = getResolutionsForModel(t2iModels[0].id)[0] || null;
    this.selectedEffect = '';
    this.maxImages = 1;
    this.prompt = '';
    this.uploadedImageUrls = [];
    this.swapImageUrl = null;
    this.uploadHistory = [];
    this.dropdownOpen = null;
    this.generating = false;
    this.fullscreenUrl = null;
    this.isDrawModalOpen = false;
    this.currentImageUrl = null;
    this.activeHistoryIdx = 0;
    this.batchSize = 1;
    this.localHistory = [];
    this._persistKey = LEGACY_PERSIST_KEY;
    this._outsideClickBound = (e) => {
      const controls = this.renderRoot.querySelector('prompt-controls');
      if (!controls) return;
      if (!e.composedPath().includes(controls)) this.dropdownOpen = null;
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey);
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, this._persistKey);
    try {
      const stored = localStorage.getItem(this._persistKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.imageMode !== undefined) this.imageMode = data.imageMode;
        if (data.selectedModelId) this.selectedModelId = data.selectedModelId;
        if (data.selectedModelName) this.selectedModelName = data.selectedModelName;
        if (data.selectedAr) this.selectedAr = data.selectedAr;
        if (data.selectedQuality) this.selectedQuality = data.selectedQuality;
        if (data.selectedEffect) this.selectedEffect = data.selectedEffect;
        if (data.maxImages) this.maxImages = data.maxImages;
        if (data.prompt) this.prompt = data.prompt;
        if (data.uploadedImageUrls) this.uploadedImageUrls = data.uploadedImageUrls;
        if (data.uploadHistory) this.uploadHistory = data.uploadHistory;
        if (data.batchSize) this.batchSize = data.batchSize;
        if (data.localHistory) this.localHistory = data.localHistory;
      }
    } catch (err) {
      console.warn('Failed to load ImageStudio persistence:', err);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('click', this._outsideClickBound);
    if (this._saveTimer) clearTimeout(this._saveTimer);
  }

  updated(changed) {
    if (changed.has('dropdownOpen')) {
      if (this.dropdownOpen) window.addEventListener('click', this._outsideClickBound);
      else window.removeEventListener('click', this._outsideClickBound);
    }
    const saveKeys = new Set([
      'imageMode',
      'selectedModelId',
      'selectedModelName',
      'selectedAr',
      'selectedQuality',
      'selectedEffect',
      'maxImages',
      'prompt',
      'uploadedImageUrls',
      'uploadHistory',
      'batchSize',
      'localHistory',
    ]);
    for (const key of changed.keys()) {
      if (saveKeys.has(key)) {
        this._maybeSave();
        break;
      }
    }
  }

  _maybeSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        const state = {
          imageMode: this.imageMode,
          selectedModelId: this.selectedModelId,
          selectedModelName: this.selectedModelName,
          selectedAr: this.selectedAr,
          selectedQuality: this.selectedQuality,
          selectedEffect: this.selectedEffect,
          maxImages: this.maxImages,
          prompt: this.prompt,
          uploadedImageUrls: this.uploadedImageUrls,
          uploadHistory: this.uploadHistory,
          batchSize: this.batchSize,
          localHistory: this.localHistory,
        };
        localStorage.setItem(this._persistKey, JSON.stringify(state));
      } catch (err) {
        console.warn('Failed to save ImageStudio persistence:', err);
      }
    }, 500);
  }

  // ── Upload callbacks ──────────────────────────────────────────────────────
  handleUploadSelect({ url, urls }) {
    const newUrls = urls || [url];
    this.uploadedImageUrls = newUrls;

    if (!this.imageMode) {
      const curId = this.selectedModelId;
      const findI2I = (id) => i2iModels.find((m) => m.id === id) ?? null;
      const target =
        findI2I(I2I_EXCEPTIONS[curId]) ||
        findI2I(curId) ||
        findI2I(`${curId}-edit`) ||
        (curId.includes('-t2i') && findI2I(curId.replace('-t2i', '-i2i'))) ||
        (curId.includes('text-to-image') &&
          findI2I(curId.replace('text-to-image', 'image-to-image'))) ||
        i2iModels.find((m) => m.id.startsWith(curId)) ||
        i2iModels[0];

      const ars = getAspectRatiosForI2IModel(target.id);
      const resolutions = getResolutionsForI2IModel(target.id);
      const effects = getEffectsForI2IModel(target.id);
      this.imageMode = true;
      this.selectedModelId = target.id;
      this.selectedModelName = target.name;
      this.selectedAr = ars[0] || '1:1';
      this.selectedQuality = resolutions[0] || null;
      this.selectedEffect = effects.length > 0 ? (getDefaultEffectForI2IModel(target.id) || effects[0]) : '';
      this.maxImages = getMaxImagesForI2IModel(target.id);
    }
  }

  handleUploadClear() {
    this.uploadedImageUrls = [];
    this.imageMode = false;

    const curId = this.selectedModelId;
    const findT2I = (id) => (id ? t2iModels.find((m) => m.id === id) ?? null : null);
    const target =
      findT2I(T2I_REVERSE_EXCEPTIONS[curId]) ||
      findT2I(curId) ||
      (curId.endsWith('-edit') && findT2I(curId.slice(0, -5))) ||
      (curId.includes('-i2i') && findT2I(curId.replace('-i2i', '-t2i'))) ||
      (curId.includes('image-to-image') &&
        findT2I(curId.replace('image-to-image', 'text-to-image'))) ||
      t2iModels[0];

    const ars = getAspectRatiosForModel(target.id);
    const resolutions = getResolutionsForModel(target.id);
    this.selectedModelId = target.id;
    this.selectedModelName = target.name;
    this.selectedAr = ars[0] || '1:1';
    this.selectedQuality = resolutions[0] || null;
    this.selectedEffect = '';
    this.maxImages = 1;
  }

  // ── Model selection ───────────────────────────────────────────────────────
  handleModelSelect(m, category) {
    if (category === undefined) category = this.imageMode ? 'i2i' : 't2i';
    const nextImageMode = category === 'i2i';
    const ars = nextImageMode ? getAspectRatiosForI2IModel(m.id) : getAspectRatiosForModel(m.id);
    const resolutions = nextImageMode ? getResolutionsForI2IModel(m.id) : getResolutionsForModel(m.id);
    if (!nextImageMode && this.imageMode) {
      this.uploadedImageUrls = [];
      this.swapImageUrl = null;
    }
    this.imageMode = nextImageMode;
    this.selectedModelId = m.id;
    this.selectedModelName = m.name;
    this.selectedAr = ars[0] || '1:1';
    this.selectedQuality = resolutions[0] || null;
    this.swapImageUrl = null;
    if (nextImageMode) {
      this.maxImages = getMaxImagesForI2IModel(m.id);
      const effects = getEffectsForI2IModel(m.id);
      this.selectedEffect = effects.length > 0 ? (getDefaultEffectForI2IModel(m.id) || effects[0]) : '';
    } else {
      this.maxImages = 1;
      this.selectedEffect = '';
    }
  }

  // ── History ───────────────────────────────────────────────────────────────
  addToHistory(entry) {
    this.localHistory = [entry, ...this.localHistory.slice(0, 49)];
    this.activeHistoryIdx = 0;
    this.currentImageUrl = entry.url;
  }

  handleDeleteEntry(entry, idx) {
    this.localHistory = this.localHistory.filter((_, i) => i !== idx);
  }

  // ── Generation ────────────────────────────────────────────────────────────
  async handleGenerate() {
    if (this.generating) return;

    if (this.imageMode) {
      if (this.uploadedImageUrls.length === 0) {
        alert('Please upload a reference image first.');
        return;
      }
      const modelInfo = getI2IModelById(this.selectedModelId);
      if (modelInfo?.swapField && !this.swapImageUrl) {
        alert('Please upload a swap face image.');
        return;
      }
    } else {
      if (!this.prompt.trim()) {
        alert('Please enter a prompt to generate an image.');
        return;
      }
    }

    this.generating = true;

    try {
      const results = await Promise.all(
        Array.from({ length: this.batchSize }).map(async () => {
          if (this.imageMode) {
            const genParams = {
              model: this.selectedModelId,
              images_list: this.uploadedImageUrls,
              image_url: this.uploadedImageUrls[0],
              aspect_ratio: this.selectedAr,
            };
            if (this.swapImageUrl) genParams.swap_url = this.swapImageUrl;
            if (this.prompt.trim()) genParams.prompt = this.prompt.trim();
            const qualityField = getQualityFieldForI2IModel(this.selectedModelId);
            if (qualityField && this.selectedQuality) genParams[qualityField] = this.selectedQuality;
            const effects = getEffectsForI2IModel(this.selectedModelId);
            if (effects.length > 0 && this.selectedEffect) genParams.name = this.selectedEffect;
            return await generateI2I(this.apiKey, genParams);
          }
          const genParams = {
            model: this.selectedModelId,
            prompt: this.prompt.trim(),
            aspect_ratio: this.selectedAr,
          };
          const qualityField = getQualityFieldForModel(this.selectedModelId);
          if (qualityField && this.selectedQuality) genParams[qualityField] = this.selectedQuality;
          return await generateImage(this.apiKey, genParams);
        }),
      );

      results.forEach((res) => {
        if (res && res.url) {
          this.addToHistory({
            id: res.id || uid(),
            url: res.url,
            prompt: this.prompt.trim(),
            model: this.selectedModelId,
            aspect_ratio: this.selectedAr,
            timestamp: new Date().toISOString(),
          });
        }
      });
    } catch (e) {
      console.error('[ImageStudio] Generation failed:', e);
      const errMsg = formatErrorMessage(e, 'Image generation failed');
      toast.error(errMsg);
    } finally {
      this.generating = false;
    }
  }

  get placeholderText() {
    if (this.uploadedImageUrls.length > 1) {
      return `${this.uploadedImageUrls.length} images selected — describe the transformation (optional)`;
    }
    if (this.imageMode) return 'Describe how to transform this image (optional)';
    return 'Describe the image you want to create';
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  _simpleDropdown(title, options, selected, onPick) {
    return html`
      ${promptPopoverHeader(title)}
      ${promptMenuList(
        html`
          ${options.map(
            (opt) =>
              promptMenuItem({
                children: opt,
                selected: selected === opt,
                onClick: (e) => {
                  e.stopPropagation();
                  onPick(opt);
                  this.dropdownOpen = null;
                },
              }),
          )}
        `,
      )}
    `;
  }

  _renderHistoryCards() {
    return html`
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full pt-4 animate-fade-in-up">
        ${this.localHistory.map((entry, idx) => html`
          <div
            class="relative group rounded-lg overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-xl hover:border-primary/50 transition-all duration-300 flex flex-col cursor-pointer"
            @click=${() => (this.fullscreenUrl = entry.url)}
          >
            <img
              src=${entry.url}
              alt=${(entry.prompt && entry.prompt.substring(0, 30)) || 'Generated image'}
              class="w-full aspect-square object-cover bg-black/40 hover:opacity-80 transition-opacity"
            />
            <div class="absolute top-2 right-2 hidden md:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <generation-copy-buttons .prompt=${entry.prompt} .imageUrl=${entry.url}></generation-copy-buttons>
              <button
                type="button"
                title="Download"
                @click=${(e) => {
                  e.stopPropagation();
                  downloadImage(entry.url, `muapi-${entry.id || idx}.jpg`);
                }}
                class="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              </button>
              <button
                type="button"
                title="Delete"
                @click=${(e) => {
                  e.stopPropagation();
                  if (confirm('Are you sure you want to delete this generated item?')) {
                    this.handleDeleteEntry(entry, idx);
                  }
                }}
                class="p-2 bg-black/60 backdrop-blur-md rounded-full text-red-400 hover:bg-red-500 hover:text-white transition-all border border-white/10"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <mobile-generation-actions
              .prompt=${entry.prompt}
              .imageUrl=${entry.url}
              .actions=${[
                {
                  kind: 'download',
                  label: 'Download',
                  onSelect: () => downloadImage(entry.url, `muapi-${entry.id || idx}.jpg`),
                },
                {
                  kind: 'delete',
                  label: 'Delete',
                  danger: true,
                  onSelect: () => {
                    if (confirm('Are you sure you want to delete this generated item?')) {
                      this.handleDeleteEntry(entry, idx);
                    }
                  },
                },
              ]}
            ></mobile-generation-actions>
            <div class="p-3 bg-black/80 backdrop-blur-sm border-t border-white/5 flex-1 flex flex-col justify-between gap-2">
              <p class="text-white/70 text-xs line-clamp-3 leading-relaxed" title=${entry.prompt}>
                ${entry.prompt || 'No prompt provided'}
              </p>
              <div class="flex items-center justify-between mt-1">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20 capitalize">
                    ${(entry.model && entry.model.replace('-', ' ')) || 'Image Studio'}
                  </span>
                  <span class="text-[10px] text-white/40">${entry.aspect_ratio}</span>
                </div>
              </div>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  _renderEmptyState() {
    return html`
      <div class="flex flex-col items-center justify-center h-full animate-fade-in-up transition-all duration-700 min-h-[50vh]">
        <div class="flex items-center justify-center gap-1.5 md:gap-3 mb-10 select-none scale-90 sm:scale-100">
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
          <span
            class="text-white font-black uppercase text-xl sm:text-3xl tracking-wide mb-1 opacity-90"
            >START CREATING WITH</span
          ><span
            class="text-[#22d3ee] font-black uppercase text-2xl sm:text-4xl sm:mt-1 tracking-tight"
            >${this.selectedModelName}</span
          >
        </h1>
        <p class="text-white/40 text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4">
          Describe a scene, character, mood, or style — and watch it come to life
        </p>
      </div>
    `;
  }

  render() {
    const currentModels = this.imageMode ? i2iModels : t2iModels;
    const currentAspectRatios = this.imageMode
      ? getAspectRatiosForI2IModel(this.selectedModelId)
      : getAspectRatiosForModel(this.selectedModelId);
    const currentResolutions = this.imageMode
      ? getResolutionsForI2IModel(this.selectedModelId)
      : getResolutionsForModel(this.selectedModelId);
    const currentQualityField = this.imageMode
      ? getQualityFieldForI2IModel(this.selectedModelId)
      : getQualityFieldForModel(this.selectedModelId);
    const showQualityBtn = currentResolutions.length > 0;
    const currentEffects = this.imageMode ? getEffectsForI2IModel(this.selectedModelId) : [];
    const showEffectBtn = currentEffects.length > 0;

    const selectedModelObj = currentModels.find((m) => m.id === this.selectedModelId);
    const selectedModelProvider = (selectedModelObj && selectedModelObj.provider) || 'self-hosted';

    const history = this.localHistory;

    return html`
      <div class="w-full h-full flex flex-col items-center justify-center bg-app-bg relative p-4 md:p-6 overflow-hidden">
        <div class="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-40 lg:pb-32 px-2">
          ${history.length > 0 ? this._renderHistoryCards() : this._renderEmptyState()}
        </div>

        <prompt-composer>
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-2.5 flex-wrap">
              ${this.uploadedImageUrls.map(
                (url, idx) => html`
                  <div class=${PROMPT_MEDIA_PREVIEW_CLASS}>
                    <img src=${url} alt="" class="w-full h-full object-cover" />
                    <button
                      type="button"
                      @click=${() => {
                        const next = this.uploadedImageUrls.filter((_, i) => i !== idx);
                        this.uploadedImageUrls = next;
                        if (next.length === 0) this.handleUploadClear();
                      }}
                      class="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 hover:text-white text-[8px] border border-white/5"
                    >×</button>
                  </div>
                `,
              )}
              ${this.uploadedImageUrls.length < this.maxImages
                ? html`
                    <image-upload-button
                      .apiKey=${this.apiKey}
                      .maxImages=${this.maxImages}
                      .initialUrls=${this.uploadedImageUrls}
                      .persistedHistory=${this.uploadHistory}
                      @select=${(e) => this.handleUploadSelect(e.detail)}
                      @clear=${() => this.handleUploadClear()}
                      @historychange=${(e) => {
                        if (e.detail !== this.uploadHistory) this.uploadHistory = e.detail;
                      }}
                    ></image-upload-button>
                  `
                : nothing}
              ${this.imageMode && getI2IModelById(this.selectedModelId)?.swapField
                ? html`
                    <image-upload-button
                      .apiKey=${this.apiKey}
                      .maxImages=${1}
                      .initialUrls=${this.swapImageUrl ? [this.swapImageUrl] : []}
                      label="Swap Face"
                      @select=${(e) => (this.swapImageUrl = e.detail.urls[0] || null)}
                      @clear=${() => (this.swapImageUrl = null)}
                    ></image-upload-button>
                  `
                : nothing}
            </div>
            <prompt-textarea
              .value=${this.prompt}
              @input=${(e) => (this.prompt = e.currentTarget.value)}
              placeholder=${this.placeholderText}
            ></prompt-textarea>
          </div>

          <prompt-footer>
            <prompt-controls>
              <div class="relative">
                <button
                  type="button"
                  @click=${(e) => {
                    e.stopPropagation();
                    this.dropdownOpen = this.dropdownOpen === 'model' ? null : 'model';
                  }}
                  class=${promptControlClassName({ active: this.dropdownOpen === 'model' })}
                >
                  <div class="w-4 h-4 rounded overflow-hidden shrink-0 flex items-center justify-center bg-white/5">
                    ${PROVIDER_LOGOS[selectedModelProvider]
                      ? html`<img
                          src=${PROVIDER_LOGOS[selectedModelProvider]}
                          alt=""
                          class=${'w-full h-full object-contain '}${invertLogos.includes(selectedModelProvider)
                            ? 'invert'
                            : ''}
                        />`
                      : html`<span class="text-[9px] font-bold text-black uppercase">G</span>`}
                  </div>
                  <span class=${PROMPT_CONTROL_LABEL_CLASS}>${this.selectedModelName}</span>${PromptChevronIcon()}
                </button>
                ${this.dropdownOpen === 'model'
                  ? html`
                      <prompt-popover
                        className="w-[calc(100vw-2rem)] md:w-[480px] max-w-md md:max-w-none max-h-[70vh]"
                        @click=${(e) => e.stopPropagation()}
                      >
                        ${promptPopoverHeader('Model')}
                        <image-model-dropdown
                          .selectedModel=${this.selectedModelId}
                          @select=${(e) => this.handleModelSelect(e.detail.model, e.detail.category)}
                          @close=${() => (this.dropdownOpen = null)}
                        ></image-model-dropdown>
                      </prompt-popover>
                    `
                  : nothing}
              </div>

              <div class="relative">
                <button
                  type="button"
                  @click=${(e) => {
                    e.stopPropagation();
                    this.dropdownOpen = this.dropdownOpen === 'ar' ? null : 'ar';
                  }}
                  class=${promptControlClassName({ active: this.dropdownOpen === 'ar' })}
                >${PromptAspectRatioIcon()}<span class=${PROMPT_CONTROL_LABEL_CLASS}>${this.selectedAr}</span></button>
                ${this.dropdownOpen === 'ar'
                  ? html`
                      <prompt-popover @click=${(e) => e.stopPropagation()}>
                        ${this._simpleDropdown('Aspect Ratio', currentAspectRatios, this.selectedAr, (val) => {
                          this.selectedAr = val;
                        })}
                      </prompt-popover>
                    `
                  : nothing}
              </div>

              ${showQualityBtn
                ? html`
                    <div class="relative">
                      <button
                        type="button"
                        @click=${(e) => {
                          e.stopPropagation();
                          this.dropdownOpen = this.dropdownOpen === 'quality' ? null : 'quality';
                        }}
                        class=${promptControlClassName({ active: this.dropdownOpen === 'quality' })}
                      >${PromptQualityIcon()}<span
                          class=${PROMPT_CONTROL_LABEL_CLASS}
                          >${this.selectedQuality || currentResolutions[0]}</span
                        >
                      </button>
                      ${this.dropdownOpen === 'quality'
                        ? html`
                            <prompt-popover @click=${(e) => e.stopPropagation()}>
                              ${this._simpleDropdown('Resolution', currentResolutions, this.selectedQuality, (val) => {
                                this.selectedQuality = val;
                              })}
                            </prompt-popover>
                          `
                        : nothing}
                    </div>
                  `
                : nothing}

              ${showEffectBtn
                ? html`
                    <div class="relative">
                      <button
                        type="button"
                        @click=${(e) => {
                          e.stopPropagation();
                          this.dropdownOpen = this.dropdownOpen === 'effect' ? null : 'effect';
                        }}
                        class=${promptControlClassName({ active: this.dropdownOpen === 'effect' })}
                      >
                        ${unsafeHTML(
                          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-40 text-white flex-shrink-0"><path d="M5 3l14 9-14 9V3z" /></svg>',
                        )}<span class=${PROMPT_CONTROL_LABEL_CLASS + ' max-w-[140px] truncate'}
                          >${this.selectedEffect || 'Effect'}</span
                        >
                      </button>
                      ${this.dropdownOpen === 'effect'
                        ? html`
                            <prompt-popover className="min-w-[200px]" @click=${(e) => e.stopPropagation()}>
                              ${this._simpleDropdown('Effect Type', currentEffects, this.selectedEffect, (val) => {
                                this.selectedEffect = val;
                              })}
                            </prompt-popover>
                          `
                        : nothing}
                    </div>
                  `
                : nothing}

              <div class=${promptControlClassName({ compact: true, className: 'select-none' })}>
                <button
                  type="button"
                  @click=${() => (this.batchSize = Math.max(1, this.batchSize - 1))}
                  class="text-white/40 hover:text-white/80 font-extrabold text-xs transition-colors px-1"
                >-</button
                ><span class="text-xs font-semibold text-white/70 min-w-[24px] text-center"
                  >${this.batchSize}/4</span
                >
                <button
                  type="button"
                  @click=${() => (this.batchSize = Math.min(4, this.batchSize + 1))}
                  class="text-white/40 hover:text-white/80 font-extrabold text-xs transition-colors px-1"
                >+</button
                >
              </div>

              <button
                type="button"
                class=${promptControlClassName()}
                @click=${() => (this.isDrawModalOpen = true)}
              >
                ${unsafeHTML(
                  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-40 text-white group-hover:text-[#22d3ee] transition-colors flex-shrink-0"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>',
                )}<span class=${PROMPT_CONTROL_LABEL_CLASS}>Draw</span>
              </button>
            </prompt-controls>

            <prompt-action
              ?disabled=${this.generating}
              @click=${() => this.handleGenerate()}
            >
              ${this.generating
                ? html`<span class="animate-spin inline-block text-black">◌</span>Generating...`
                : html`<span>Generate ✦</span>`}
            </prompt-action>
          </prompt-footer>
        </prompt-composer>

        ${this.fullscreenUrl
          ? html`
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
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
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
            `
          : nothing}

        <draw-modal
          .isOpen=${this.isDrawModalOpen}
          .apiKey=${this.apiKey}
          .batchSize=${1}
          @add-history-item=${(e) => this.addToHistory(e.detail)}
          @close=${() => (this.isDrawModalOpen = false)}
        ></draw-modal>
      </div>
    `;
  }

}

customElements.define('studio-image', StudioImage);
