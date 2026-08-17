// Port of packages/studio/src/components/VideoStudio.jsx.
// Text/Image/Video-to-video studio: t2v/i2v/v2v model dropdown (4 category
// tabs + provider sidebar + "Video Tools" v2v section), ar/duration/resolution
// controls, effect selector for i2v models, start/end-frame + multi-image +
// video reference uploads with progress rings, v2v motion-control flow,
// Seedance 2.0 extend flow, "Draw" canvas modal, hover-to-play gallery.
//
// Porting notes:
// - ModelDropdown became <video-model-dropdown> (React-local state element,
//   same pattern as the image studio's picker).
// - DrawModal is reused from the image studio (<draw-modal> is always
//   rendered; `isOpen` nulls its output so draft state survives).
// - Outside-click closes the open control dropdown via a window 'click'
//   listener attached while any dropdown is open; it checks the click's
//   composedPath against the <prompt-controls> host (React's single
//   dropdownRef on PromptControls contains() check).
// - `generateError`, `canvasUrl`, `canvasModel`, `showCanvas`,
//   `activeHistoryIdx` mirror the original's set-but-never-rendered state;
//   `isSeedance2Canvas` is a dead derived value in the original and is
//   omitted.
// - `historyItems`/`onDeleteHistoryItem`/`droppedFiles`/`onFilesHandled`/
//   `onGenerationStart`/`onGenerationEnd`/`onGenerationComplete`/
//   `onGenerationError` props are never passed by the shell (standalone
//   studio) — omitted; the error toast goes through the shared toaster.
// - React's `console.error("[VideoStudio]", e)` in the generate catch is kept
//   verbatim (no "Generation failed:" prefix, unlike the image studio).
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import toast from '../../lib/toast.js';
import { generateVideo, generateI2V, processV2V, uploadFile } from 'studio/muapi.js';
import { formatErrorMessage } from 'studio/utils/formatError.js';
import { scopedPersistKey, migrateLegacyPersistKey } from 'studio/persistKey.js';
import {
  t2vModels,
  i2vModels,
  v2vModels,
  getAspectRatiosForVideoModel,
  getDurationsForModel,
  getResolutionsForVideoModel,
  getAspectRatiosForI2VModel,
  getDurationsForI2VModel,
  getResolutionsForI2VModel,
  getEffectsForI2VModel,
  getDefaultEffectForI2VModel,
  getModesForModel,
  getMaxImagesForI2VModel,
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
  promptMediaButtonClassName,
  PROMPT_MEDIA_PREVIEW_CLASS,
  PROMPT_CONTROL_LABEL_CLASS,
  PromptChevronIcon,
  PromptAspectRatioIcon,
  PromptDurationIcon,
  PromptQualityIcon,
} from './prompt-composer.js';
import { VideoModelDropdown } from './video-model-dropdown.js';
import { DrawModal } from './draw-modal.js';

const LEGACY_PERSIST_KEY = 'hg_video_studio_persistent';

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

function getQualitiesForModel(modelList, modelId) {
  const model = modelList.find((m) => m.id === modelId);
  return model?.inputs?.quality?.enum || [];
}

async function downloadFile(url, filename) {
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

export class StudioVideo extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    apiKey: { type: String },
    imageMode: { state: true },
    v2vMode: { state: true },
    selectedModel: { state: true },
    selectedModelName: { state: true },
    selectedAr: { state: true },
    selectedDuration: { state: true },
    selectedResolution: { state: true },
    selectedQuality: { state: true },
    selectedMode: { state: true },
    selectedEffect: { state: true },
    imageProgress: { state: true },
    videoProgress: { state: true },
    showAr: { state: true },
    showDuration: { state: true },
    showResolution: { state: true },
    showQuality: { state: true },
    showMode: { state: true },
    showEffect: { state: true },
    uploadedImageUrl: { state: true },
    uploadedImageUrls: { state: true },
    imageUploading: { state: true },
    uploadedEndImageUrl: { state: true },
    endImageUploading: { state: true },
    endImageProgress: { state: true },
    uploadedVideoUrl: { state: true },
    videoUploading: { state: true },
    uploadedVideoName: { state: true },
    generating: { state: true },
    generateError: { state: true },
    fullscreenUrl: { state: true },
    canvasUrl: { state: true },
    canvasModel: { state: true },
    showCanvas: { state: true },
    isDrawModalOpen: { state: true },
    lastGenerationId: { state: true },
    lastGenerationModel: { state: true },
    localHistory: { state: true },
    activeHistoryIdx: { state: true },
    openDropdown: { state: true },
    prompt: { state: true },
    promptDisabled: { state: true },
  };

  constructor() {
    super();
    const defaultModel = t2vModels[0];
    this.apiKey = '';
    this.imageMode = false;
    this.v2vMode = false;
    this.selectedModel = defaultModel.id;
    this.selectedModelName = defaultModel.name;
    this.selectedAr = defaultModel.inputs?.aspect_ratio?.default || '16:9';
    this.selectedDuration = defaultModel.inputs?.duration?.default || 5;
    this.selectedResolution = defaultModel.inputs?.resolution?.default || '';
    this.selectedQuality = defaultModel.inputs?.quality?.default || '';
    this.selectedMode = '';
    this.selectedEffect = '';
    this.imageProgress = 0;
    this.videoProgress = 0;
    this.showAr = true;
    this.showDuration = true;
    this.showResolution = false;
    this.showQuality = false;
    this.showMode = false;
    this.showEffect = false;
    this.uploadedImageUrl = null;
    this.uploadedImageUrls = [];
    this.imageUploading = false;
    this.uploadedEndImageUrl = null;
    this.endImageUploading = false;
    this.endImageProgress = 0;
    this.uploadedVideoUrl = null;
    this.videoUploading = false;
    this.uploadedVideoName = null;
    this.generating = false;
    this.generateError = null;
    this.fullscreenUrl = null;
    this.canvasUrl = null;
    this.canvasModel = null;
    this.showCanvas = false;
    this.isDrawModalOpen = false;
    this.lastGenerationId = null;
    this.lastGenerationModel = null;
    this.localHistory = [];
    this.activeHistoryIdx = 0;
    this.openDropdown = null;
    this.prompt = '';
    this.promptDisabled = false;
    this._persistKey = LEGACY_PERSIST_KEY;
    this._hasRestored = false;
    this._outsideClickBound = (e) => {
      const controls = this.renderRoot.querySelector('prompt-controls');
      if (!controls) return;
      if (!e.composedPath().includes(controls)) this.openDropdown = null;
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey);
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, this._persistKey);
    // React: persistence load effect (runs on mount), then the "init controls
    // for default model" effect that skips when storage was restored.
    const defaultModel = t2vModels[0];
    try {
      const stored = localStorage.getItem(this._persistKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.imageMode !== undefined) this.imageMode = data.imageMode;
        if (data.v2vMode !== undefined) this.v2vMode = data.v2vMode;
        if (data.selectedModel) this.selectedModel = data.selectedModel;
        if (data.selectedModelName) this.selectedModelName = data.selectedModelName;
        if (data.selectedAr) this.selectedAr = data.selectedAr;
        if (data.selectedDuration) this.selectedDuration = data.selectedDuration;
        if (data.selectedResolution) this.selectedResolution = data.selectedResolution;
        if (data.selectedQuality) this.selectedQuality = data.selectedQuality;
        if (data.selectedMode) this.selectedMode = data.selectedMode;
        if (data.selectedEffect) this.selectedEffect = data.selectedEffect;
        if (data.uploadedImageUrl) this.uploadedImageUrl = data.uploadedImageUrl;
        if (data.uploadedImageUrls) {
          this.uploadedImageUrls = data.uploadedImageUrls;
        } else if (data.uploadedImageUrl) {
          this.uploadedImageUrls = [data.uploadedImageUrl];
        }
        if (data.uploadedVideoUrl) this.uploadedVideoUrl = data.uploadedVideoUrl;
        if (data.uploadedVideoName) this.uploadedVideoName = data.uploadedVideoName;
        if (data.prompt) this.prompt = data.prompt;
        if (data.localHistory) this.localHistory = data.localHistory;

        this._applyControlsForModel(
          data.selectedModel || defaultModel.id,
          !!data.imageMode,
          !!data.v2vMode,
        );
      }
    } catch (err) {
      console.warn('Failed to load VideoStudio persistence:', err);
    } finally {
      this._hasRestored = true;
    }
    // React "Initialise controls for default model on mount" effect: always
    // skipped — the persistence load effect (defined earlier, hence runs
    // first) sets hasRestored in its finally block. Kept for fidelity.
    if (!this._hasRestored) {
      this._applyControlsForModel(defaultModel.id, false, false);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('click', this._outsideClickBound);
    if (this._saveTimer) clearTimeout(this._saveTimer);
  }

  updated(changed) {
    if (changed.has('openDropdown')) {
      if (this.openDropdown) window.addEventListener('click', this._outsideClickBound);
      else window.removeEventListener('click', this._outsideClickBound);
    }
    const saveKeys = new Set([
      'imageMode',
      'v2vMode',
      'selectedModel',
      'selectedModelName',
      'selectedAr',
      'selectedDuration',
      'selectedResolution',
      'selectedQuality',
      'selectedMode',
      'selectedEffect',
      'uploadedImageUrl',
      'uploadedImageUrls',
      'uploadedVideoUrl',
      'uploadedVideoName',
      'prompt',
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
          v2vMode: this.v2vMode,
          selectedModel: this.selectedModel,
          selectedModelName: this.selectedModelName,
          selectedAr: this.selectedAr,
          selectedDuration: this.selectedDuration,
          selectedResolution: this.selectedResolution,
          selectedQuality: this.selectedQuality,
          selectedMode: this.selectedMode,
          selectedEffect: this.selectedEffect,
          uploadedImageUrl: this.uploadedImageUrl,
          uploadedImageUrls: this.uploadedImageUrls,
          uploadedVideoUrl: this.uploadedVideoUrl,
          uploadedVideoName: this.uploadedVideoName,
          prompt: this.prompt,
          localHistory: this.localHistory,
        };
        localStorage.setItem(this._persistKey, JSON.stringify(state));
      } catch (err) {
        console.warn('Failed to save VideoStudio persistence:', err);
      }
    }, 500);
  }

  // ── model / mode helpers ───────────────────────────────────────────────────
  getCurrentModels() {
    if (this.v2vMode) return v2vModels;
    return this.imageMode ? i2vModels : t2vModels;
  }

  getCurrentAspectRatios(id) {
    return this.imageMode ? getAspectRatiosForI2VModel(id) : getAspectRatiosForVideoModel(id);
  }

  getCurrentDurations(id) {
    return this.imageMode ? getDurationsForI2VModel(id) : getDurationsForModel(id);
  }

  getCurrentResolutions(id) {
    return this.imageMode ? getResolutionsForI2VModel(id) : getResolutionsForVideoModel(id);
  }

  getCurrentModel() {
    return this.getCurrentModels().find((m) => m.id === this.selectedModel);
  }

  isMotionControlSelection(modelId, isV2v) {
    if (!isV2v) return false;
    const m = v2vModels.find((x) => x.id === modelId);
    return !!m?.imageField;
  }

  // ── update controls when model/mode changes ───────────────────────────────
  _applyControlsForModel(modelId, isImageMode, isV2vMode) {
    if (isV2vMode) {
      this.showAr = false;
      this.showDuration = false;
      this.showResolution = false;
      this.showQuality = false;
      this.showMode = false;
      this.showEffect = false;
      return;
    }

    const modelList = isImageMode ? i2vModels : t2vModels;
    const model = modelList.find((m) => m.id === modelId);

    const ars = isImageMode
      ? getAspectRatiosForI2VModel(modelId)
      : getAspectRatiosForVideoModel(modelId);
    if (ars.length > 0) {
      this.selectedAr = ars[0];
      this.showAr = true;
    } else {
      this.showAr = false;
    }

    const durations = isImageMode ? getDurationsForI2VModel(modelId) : getDurationsForModel(modelId);
    if (durations.length > 0) {
      this.selectedDuration = durations[0];
      this.showDuration = true;
    } else {
      this.showDuration = false;
    }

    const resolutions = isImageMode
      ? getResolutionsForI2VModel(modelId)
      : getResolutionsForVideoModel(modelId);
    if (resolutions.length > 0) {
      this.selectedResolution = resolutions[0];
      this.showResolution = true;
    } else {
      this.showResolution = false;
    }

    const qualities = getQualitiesForModel(modelList, modelId);
    if (qualities.length > 0) {
      this.selectedQuality = model?.inputs?.quality?.default || qualities[0];
      this.showQuality = true;
    } else {
      this.selectedQuality = '';
      this.showQuality = false;
    }

    const modes = getModesForModel(modelId);
    if (modes.length > 0) {
      this.selectedMode = model?.inputs?.mode?.default || modes[0];
      this.showMode = true;
    } else {
      this.selectedMode = '';
      this.showMode = false;
    }

    const effects = isImageMode ? getEffectsForI2VModel(modelId) : [];
    if (effects.length > 0) {
      this.selectedEffect = getDefaultEffectForI2VModel(modelId) || effects[0];
      this.showEffect = true;
    } else {
      this.selectedEffect = '';
      this.showEffect = false;
    }
  }

  // ── image reference wiring ─────────────────────────────────────────────────
  applyImageReferenceUrl(url) {
    if (!url) return;

    this.uploadedImageUrl = url;

    // Motion-control models use the image alongside the uploaded video.
    if (this.isMotionControlSelection(this.selectedModel, this.v2vMode)) {
      this.uploadedImageUrls = [url];
      this.promptDisabled = false;
      return;
    }

    const currentT2V = t2vModels.find((model) => model.id === this.selectedModel);

    // Models with native image inputs stay in their current mode.
    if (currentT2V?.inputs?.images_list) {
      const maxImages = currentT2V.inputs.images_list.maxItems || 8;
      const previousUrls = this.uploadedImageUrls;
      this.uploadedImageUrls = previousUrls.includes(url)
        ? previousUrls
        : [...previousUrls, url].slice(0, maxImages);
      this.promptDisabled = false;
      return;
    }

    this.uploadedVideoUrl = null;
    this.uploadedVideoName = null;
    this.v2vMode = false;

    const sibling = currentT2V?.family
      ? i2vModels.find((model) => model.family === currentT2V.family)
      : null;
    const targetModel = this.imageMode
      ? i2vModels.find((model) => model.id === this.selectedModel)
      : sibling || i2vModels[0];

    if (!targetModel) return;

    if (!this.imageMode) {
      this.imageMode = true;
      this.selectedModel = targetModel.id;
      this.selectedModelName = targetModel.name;
      this._applyControlsForModel(targetModel.id, true, false);
    }

    const maxImages = getMaxImagesForI2VModel(targetModel.id);
    if (maxImages > 2) {
      const previousUrls = this.uploadedImageUrls;
      this.uploadedImageUrls = previousUrls.includes(url)
        ? previousUrls
        : [...previousUrls, url].slice(0, maxImages);
    } else {
      this.uploadedImageUrls = [url];
    }
    this.promptDisabled = false;
  }

  handleDrawReference(entry) {
    this.applyImageReferenceUrl(entry?.url);
  }

  async uploadImageReference(file) {
    if (file.size > 10 * 1024 * 1024) {
      alert('Image exceeds 10MB limit.');
      return;
    }

    this.imageUploading = true;
    this.imageProgress = 0;
    try {
      const url = await uploadFile(this.apiKey, file, (pct) => (this.imageProgress = pct));
      this.applyImageReferenceUrl(url);
    } catch (err) {
      console.error('[VideoStudio] Image upload failed:', err);
      alert(`Image upload failed: ${err.message}`);
    } finally {
      this.imageUploading = false;
      this.imageProgress = 0;
    }
  }

  // ── drop handlers (props never passed by the shell — kept for parity) ────
  async processDroppedVideo(file) {
    if (file.size > 50 * 1024 * 1024) {
      alert('Video exceeds 50MB limit.');
      return;
    }
    this.videoUploading = true;
    this.videoProgress = 0;
    try {
      const url = await uploadFile(this.apiKey, file, (pct) => (this.videoProgress = pct));
      this.uploadedVideoUrl = url;
      this.uploadedVideoName = file.name;
      if (this.imageMode) {
        this.uploadedImageUrl = null;
        this.imageMode = false;
      }
      this.v2vMode = true;
      const firstV2V = v2vModels[0];
      this.selectedModel = firstV2V.id;
      this.selectedModelName = firstV2V.name;
      this._applyControlsForModel(firstV2V.id, false, true);
      this.prompt = '';
      this.promptDisabled = true;
    } catch (err) {
      alert(`Video upload failed: ${err.message}`);
    } finally {
      this.videoUploading = false;
      this.videoProgress = 0;
    }
  }

  // ── image upload ───────────────────────────────────────────────────────────
  async handleImageFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    // React clears via imageFileInputRef.current (stable node ref); e.target
    // is nulled by the browser once the dispatch completes, so capture the
    // node at event time exactly like the ref.
    const input = e.currentTarget;
    try {
      await this.uploadImageReference(file);
    } finally {
      if (input) input.value = '';
    }
  }

  clearImageUpload() {
    this.uploadedImageUrl = null;
    this.uploadedImageUrls = [];
    this.uploadedEndImageUrl = null;
    // Motion-control v2v or model with inputs.images_list: keep model, just drop the image
    if (this.isMotionControlSelection(this.selectedModel, this.v2vMode)) return;
    const currentT2V = t2vModels.find((m) => m.id === this.selectedModel);
    if (currentT2V?.inputs?.images_list) return;
    this.imageMode = false;
    const first = t2vModels[0];
    this.selectedModel = first.id;
    this.selectedModelName = first.name;
    this._applyControlsForModel(first.id, false, false);
    this.promptDisabled = false;
  }

  removeImageAtIndex(idx) {
    const nextUrls = this.uploadedImageUrls.filter((_, i) => i !== idx);
    this.uploadedImageUrls = nextUrls;
    if (nextUrls.length === 0) {
      this.uploadedImageUrl = null;
      // Reset to text-to-video if empty list
      if (this.isMotionControlSelection(this.selectedModel, this.v2vMode)) return;
      this.imageMode = false;
      const first = t2vModels[0];
      this.selectedModel = first.id;
      this.selectedModelName = first.name;
      this._applyControlsForModel(first.id, false, false);
      this.promptDisabled = false;
    } else {
      this.uploadedImageUrl = nextUrls[0];
    }
  }

  // ── end-frame upload (FLF i2v models) ──────────────────────────────────────
  async handleEndImageFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Image exceeds 10MB limit.');
      return;
    }
    this.endImageUploading = true;
    this.endImageProgress = 0;
    const input = e.currentTarget;
    try {
      const url = await uploadFile(this.apiKey, file, (pct) => {
        this.endImageProgress = pct;
      });
      this.uploadedEndImageUrl = url;
    } catch (err) {
      alert(`End frame upload failed: ${err.message}`);
    } finally {
      this.endImageUploading = false;
      this.endImageProgress = 0;
      if (input) input.value = '';
    }
  }

  clearEndImage() {
    this.uploadedEndImageUrl = null;
  }

  // ── video upload ───────────────────────────────────────────────────────────
  async handleVideoFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert('Video exceeds 50MB limit.');
      return;
    }
    this.videoUploading = true;
    this.videoProgress = 0;
    const input = e.currentTarget;
    try {
      const url = await uploadFile(this.apiKey, file, (pct) => {
        this.videoProgress = pct;
      });
      this.uploadedVideoUrl = url;
      this.uploadedVideoName = file.name;

      if (this.isMotionControlSelection(this.selectedModel, this.v2vMode)) {
        // Already in motion-control mode — keep model and image, allow prompt
        this.promptDisabled = false;
      } else {
        // Model-native video reference (e.g. Seedance 2.0 Extend with inputs.video_files):
        // keep the current model & mode; just store the video URL as a reference
        const currentT2VOrExtend = t2vModels.find((m) => m.id === this.selectedModel);
        if (currentT2VOrExtend?.inputs?.video_files) {
          this.promptDisabled = false;
        } else {
          // Default v2v flow (e.g. watermark remover) — auto-pick the first v2v model
          if (this.imageMode) {
            this.uploadedImageUrl = null;
            this.imageMode = false;
          }
          this.v2vMode = true;
          const firstV2V = v2vModels[0];
          this.selectedModel = firstV2V.id;
          this.selectedModelName = firstV2V.name;
          this._applyControlsForModel(firstV2V.id, false, true);
          this.prompt = '';
          this.promptDisabled = true;
        }
      }
    } catch (err) {
      console.error('[VideoStudio] Video upload failed:', err);
      alert(`Video upload failed: ${err.message}`);
    } finally {
      this.videoUploading = false;
      this.videoProgress = 0;
      if (input) input.value = '';
    }
  }

  clearVideoUpload() {
    this.uploadedVideoUrl = null;
    this.uploadedVideoName = null;
    this.v2vMode = false;
    const first = t2vModels[0];
    this.selectedModel = first.id;
    this.selectedModelName = first.name;
    this._applyControlsForModel(first.id, false, false);
    this.promptDisabled = false;
  }

  // ── model selection from dropdown ─────────────────────────────────────────
  handleModelSelect(m, category) {
    if (category === undefined) category = this.imageMode ? 'i2v' : 't2v';
    const isV2V = category === 'v2v';
    if (isV2V) {
      this.v2vMode = true;
      this.imageMode = false;
      const isMC = !!m.imageField;
      if (!isMC) {
        // Single-input v2v (watermark remover etc.) — drop any image
        this.uploadedImageUrl = null;
      }
      this.selectedModel = m.id;
      this.selectedModelName = m.name;
      this._applyControlsForModel(m.id, false, true);
      if (isMC) {
        // Motion-control: prompt is editable, video+image are needed
        this.promptDisabled = false;
      } else {
        this.prompt = '';
        this.promptDisabled = true;
      }
    } else {
      if (this.v2vMode) {
        this.v2vMode = false;
        this.uploadedVideoUrl = null;
        this.uploadedVideoName = null;
        this.promptDisabled = false;
      }
      const nextImageMode = category === 'i2v';
      if (!nextImageMode && this.imageMode) {
        this.uploadedImageUrl = null;
        this.uploadedImageUrls = [];
        this.uploadedEndImageUrl = null;
      }
      this.imageMode = nextImageMode;
      this.selectedModel = m.id;
      this.selectedModelName = m.name;
      this._applyControlsForModel(m.id, nextImageMode, false);
    }
  }

  // ── history ────────────────────────────────────────────────────────────────
  addToLocalHistory(entry) {
    this.localHistory = [entry, ...this.localHistory].slice(0, 30);
    this.activeHistoryIdx = 0;
  }

  showVideoInCanvas(url, model) {
    this.canvasUrl = url;
    this.canvasModel = model;
    this.showCanvas = true;
  }

  handleDeleteEntry(entry, idx) {
    this.localHistory = this.localHistory.filter((_, i) => i !== idx);
  }

  // ── generate ───────────────────────────────────────────────────────────────
  async handleGenerate() {
    if (this.generating) return;
    const currentModel = this.getCurrentModel();
    const isExtendMode = currentModel?.requiresRequestId;
    const trimmedPrompt = this.prompt.trim();

    if (this.v2vMode) {
      if (!this.uploadedVideoUrl) {
        alert('Please upload a video first.');
        return;
      }
      if (currentModel?.imageField && !this.uploadedImageUrl) {
        alert('Please upload a reference image for motion control.');
        return;
      }
      if (currentModel?.promptRequired && !trimmedPrompt) {
        alert('Please describe the motion you want.');
        return;
      }
    } else if (isExtendMode) {
      if (!this.lastGenerationId) {
        alert('No Seedance 2.0 generation found to extend. Generate a video first.');
        return;
      }
    } else if (this.imageMode) {
      const maxImgs = getMaxImagesForI2VModel(this.selectedModel);
      if (maxImgs > 2) {
        if (this.uploadedImageUrls.length === 0) {
          alert('Please upload at least one reference image first.');
          return;
        }
      } else {
        if (!this.uploadedImageUrl) {
          alert('Please upload a start frame image first.');
          return;
        }
      }
    } else {
      if (!trimmedPrompt) {
        alert('Please enter a prompt to generate a video.');
        return;
      }
    }

    this.generating = true;
    this.generateError = null;

    try {
      let res;

      if (this.v2vMode) {
        // V2V: dedicated processV2V handles single-input tools (e.g. watermark
        // remover) and motion-control models (which take video + image + prompt)
        const v2vParams = {
          model: this.selectedModel,
          video_url: this.uploadedVideoUrl,
        };
        if (currentModel?.imageField && this.uploadedImageUrl) {
          v2vParams.image_url = this.uploadedImageUrl;
        }
        if (currentModel?.hasPrompt && trimmedPrompt) {
          v2vParams.prompt = trimmedPrompt;
        }
        res = await processV2V(this.apiKey, v2vParams);
        if (!res?.url) throw new Error('No video URL returned by API');

        const genId = res.id || Date.now().toString();
        this.lastGenerationId = null;
        this.lastGenerationModel = null;
        const entry = {
          id: genId,
          url: res.url,
          prompt: currentModel?.hasPrompt ? trimmedPrompt : '',
          model: this.selectedModel,
          timestamp: new Date().toISOString(),
        };
        this.addToLocalHistory(entry);
        this.showVideoInCanvas(res.url, this.selectedModel);
      } else if (this.imageMode) {
        const maxImgs = getMaxImagesForI2VModel(this.selectedModel);
        const i2vParams = { model: this.selectedModel };
        if (maxImgs > 2) {
          i2vParams.images_list = this.uploadedImageUrls;
        } else {
          i2vParams.image_url = this.uploadedImageUrl;
        }
        if (trimmedPrompt) i2vParams.prompt = trimmedPrompt;
        i2vParams.aspect_ratio = this.selectedAr;
        const i2vModel = i2vModels.find((m) => m.id === this.selectedModel);
        if (this.uploadedEndImageUrl && i2vModel?.lastImageField) {
          i2vParams.last_image = this.uploadedEndImageUrl;
        }
        const durations = getDurationsForI2VModel(this.selectedModel);
        if (durations.length > 0) i2vParams.duration = this.selectedDuration;
        const resolutions = getResolutionsForI2VModel(this.selectedModel);
        if (resolutions.length > 0) i2vParams.resolution = this.selectedResolution;
        if (this.selectedQuality) i2vParams.quality = this.selectedQuality;
        if (this.selectedMode) i2vParams.mode = this.selectedMode;
        if (this.showEffect && this.selectedEffect) i2vParams.name = this.selectedEffect;

        res = await generateI2V(this.apiKey, i2vParams);
        if (!res?.url) throw new Error('No video URL returned by API');

        const genId = res.id || Date.now().toString();
        if (this.selectedModel === 'seedance-v2.0-i2v') {
          this.lastGenerationId = genId;
          this.lastGenerationModel = this.selectedModel;
        } else {
          this.lastGenerationId = null;
          this.lastGenerationModel = null;
        }
        const entry = {
          id: genId,
          url: res.url,
          prompt: trimmedPrompt,
          model: this.selectedModel,
          aspect_ratio: this.selectedAr,
          duration: this.selectedDuration,
          timestamp: new Date().toISOString(),
        };
        this.addToLocalHistory(entry);
        this.showVideoInCanvas(res.url, this.selectedModel);
      } else {
        // T2V (including extend mode)
        const params = { model: this.selectedModel };
        if (trimmedPrompt) params.prompt = trimmedPrompt;

        if (isExtendMode) {
          params.request_id = this.lastGenerationId;
          // Optional reference media for Seedance 2.0 Extend:
          // images map to @image2…@image9 and videos map to @video1…@video3 in the prompt
          if (this.uploadedImageUrls.length > 0) {
            params.images_list = this.uploadedImageUrls;
          }
          if (this.uploadedVideoUrl) {
            params.videos_list = [this.uploadedVideoUrl];
          }
        } else {
          params.aspect_ratio = this.selectedAr;
        }

        const durations = getDurationsForModel(this.selectedModel);
        if (durations.length > 0) params.duration = this.selectedDuration;
        const resolutions = getResolutionsForVideoModel(this.selectedModel);
        if (resolutions.length > 0) params.resolution = this.selectedResolution;
        if (this.selectedQuality) params.quality = this.selectedQuality;
        if (this.selectedMode) params.mode = this.selectedMode;

        res = await generateVideo(this.apiKey, params);
        if (!res?.url) throw new Error('No video URL returned by API');

        const genId = res.id || Date.now().toString();
        if (
          this.selectedModel === 'seedance-v2.0-t2v' ||
          this.selectedModel === 'seedance-v2.0-i2v'
        ) {
          this.lastGenerationId = genId;
          this.lastGenerationModel = this.selectedModel;
        } else {
          this.lastGenerationId = null;
          this.lastGenerationModel = null;
        }
        const entry = {
          id: genId,
          url: res.url,
          prompt: trimmedPrompt,
          model: this.selectedModel,
          aspect_ratio: this.selectedAr,
          duration: this.selectedDuration,
          timestamp: new Date().toISOString(),
        };
        this.addToLocalHistory(entry);
        this.showVideoInCanvas(res.url, this.selectedModel);
      }
    } catch (e) {
      console.error('[VideoStudio]', e);
      const errMsg = formatErrorMessage(e, 'Video generation failed');
      toast.error(errMsg);
    } finally {
      this.generating = false;
    }
  }

  // ── reset to prompt bar ────────────────────────────────────────────────────
  resetToPromptBar() {
    this.showCanvas = false;
  }

  handleNewPrompt() {
    this.resetToPromptBar();
    this.prompt = '';
    this.uploadedImageUrl = null;
    this.uploadedImageUrls = [];
    this.imageMode = false;
    this.uploadedVideoUrl = null;
    this.uploadedVideoName = null;
    this.v2vMode = false;
    const first = t2vModels[0];
    this.selectedModel = first.id;
    this.selectedModelName = first.name;
    this._applyControlsForModel(first.id, false, false);
    this.promptDisabled = false;
    setTimeout(() => this.renderRoot.querySelector('prompt-textarea')?.focus(), 50);
  }

  handleExtend() {
    if (!this.lastGenerationId) return;
    this.resetToPromptBar();
    this.prompt = '';
    this.uploadedImageUrl = null;
    this.uploadedImageUrls = [];
    this.imageMode = false;
    this.selectedModel = 'seedance-v2.0-extend';
    this.selectedModelName = 'Seedance 2.0 Extend';
    this._applyControlsForModel('seedance-v2.0-extend', false, false);
    this.promptDisabled = false;
    setTimeout(() => this.renderRoot.querySelector('prompt-textarea')?.focus(), 50);
  }

  // ── derived UI values ──────────────────────────────────────────────────────
  get promptPlaceholder() {
    const currentModelObj = this.getCurrentModel();
    if (this.v2vMode) {
      if (currentModelObj?.imageField) {
        return currentModelObj?.promptRequired
          ? 'Describe the motion'
          : 'Describe the motion (optional)';
      }
      return 'Video ready — click Generate to remove watermark';
    }
    const isExtendMode = currentModelObj?.requiresRequestId;
    if (this.imageMode) return 'Describe the motion or effect (optional)';
    if (isExtendMode) return 'Optional: describe how to continue the video...';
    return 'Describe the video you want to create';
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  _simpleDropdown(title, options, selected, onPick, itemFormat) {
    return html`
      ${promptPopoverHeader(title)}
      ${promptMenuList(
        html`
          ${options.map(
            (opt) =>
              promptMenuItem({
                children: itemFormat ? itemFormat(opt) : opt,
                selected: selected === opt,
                onClick: (e) => {
                  e.stopPropagation();
                  onPick(opt);
                  this.openDropdown = null;
                },
              }),
          )}
        `,
      )}
    `;
  }

  _uploadRing(progress) {
    return html`
      <div class="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-black/80 z-20 backdrop-blur-[2px]">
        <svg class="w-8 h-8 -rotate-90">
          <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2" fill="transparent" class="text-white/10" />
          <circle
            cx="16"
            cy="16"
            r="14"
            stroke="currentColor"
            stroke-width="2"
            fill="transparent"
            stroke-dasharray="88"
            stroke-dashoffset=${88 - (88 * progress) / 100}
            class="text-[#22d3ee] transition-all duration-300"
          />
        </svg>
        <span class="absolute text-[9px] font-black text-[#22d3ee] leading-none">${progress}%</span>
      </div>
    `;
  }

  _renderHistoryCards() {
    return html`
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full pt-4 animate-fade-in-up">
        ${this.localHistory.map((entry, idx) => {
          const isSeedance2 =
            entry.model === 'seedance-v2.0-t2v' || entry.model === 'seedance-v2.0-i2v';
          return html`
            <div
              class="relative group rounded-lg overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-xl hover:border-primary/50 transition-all duration-300 flex flex-col cursor-pointer"
              @click=${() => (this.fullscreenUrl = entry.url)}
            >
              <video
                src=${entry.url}
                class="w-full aspect-video object-cover bg-black/40 hover:opacity-80 transition-opacity"
                loop
                muted
                playsinline
                @mouseover=${(e) => e.currentTarget.play()}
                @mouseout=${(e) => {
                  e.currentTarget.pause();
                  e.currentTarget.currentTime = 0;
                }}
              ></video>

              <div
                class="absolute top-2 right-2 hidden md:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <generation-copy-buttons .prompt=${entry.prompt}></generation-copy-buttons>
                <button
                  type="button"
                  title="Download"
                  @click=${(e) => {
                    e.stopPropagation();
                    downloadFile(entry.url, `video-${entry.id || idx}.mp4`);
                  }}
                  class="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                </button>
                ${isSeedance2
                  ? html`
                      <button
                        type="button"
                        title="Extend this video using Seedance 2.0 Extend"
                        @click=${(e) => {
                          e.stopPropagation();
                          this.lastGenerationId = entry.id;
                          this.handleExtend();
                        }}
                        class="p-2 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-primary hover:text-black transition-all border border-white/10"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </button>
                    `
                  : nothing}
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
                .actions=${[
                  {
                    kind: 'download',
                    label: 'Download',
                    onSelect: () => downloadFile(entry.url, `video-${entry.id || idx}.mp4`),
                  },
                  isSeedance2
                    ? {
                        kind: 'extend',
                        label: 'Extend',
                        onSelect: () => {
                          this.lastGenerationId = entry.id;
                          this.handleExtend();
                        },
                      }
                    : null,
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

              <div
                class="p-3 bg-black/80 backdrop-blur-sm border-t border-white/5 flex-1 flex flex-col justify-between gap-2"
              >
                <p class="text-white/70 text-xs line-clamp-3 leading-relaxed" title=${entry.prompt}>
                  ${entry.prompt || 'No prompt provided'}
                </p>
                <div class="flex items-center justify-between mt-1 flex-wrap gap-1">
                  <div class="flex items-center gap-2">
                    <span
                      class="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20 whitespace-nowrap capitalize"
                    >
                      ${(entry.model && entry.model.replace('-', ' ')) || 'Video Studio'}
                    </span>
                    <div class="flex gap-2">
                      ${entry.resolution
                        ? html`<span class="text-[10px] text-white/40">${entry.resolution}</span>`
                        : nothing}
                      ${entry.duration
                        ? html`<span class="text-[10px] text-white/40">${entry.duration}s</span>`
                        : nothing}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  _renderEmptyState() {
    return html`
      <div
        class="flex flex-col items-center justify-center h-full animate-fade-in-up transition-all duration-700 min-h-[50vh]"
      >
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
        <h1
          class="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-center px-4 flex flex-col items-center"
        >
          <span
            class="text-white font-black uppercase text-xl sm:text-3xl tracking-wide mb-1 opacity-90"
            >START CREATING WITH</span
          ><span
            class="text-[#22d3ee] font-black uppercase text-2xl sm:text-4xl sm:mt-1 tracking-tight"
            >${this.selectedModelName}</span
          >
        </h1>
        <p
          class="text-white/40 text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4"
        >
          Animate images into stunning AI videos with motion effects
        </p>
      </div>
    `;
  }

  render() {
    const currentModelObj = this.getCurrentModel();
    const isExtendMode = currentModelObj?.requiresRequestId;
    const canUploadImageReference =
      (!this.v2vMode || this.isMotionControlSelection(this.selectedModel, this.v2vMode)) &&
      (!isExtendMode || currentModelObj?.inputs?.images_list);

    const allCurrentModels = [...t2vModels, ...i2vModels, ...v2vModels];
    const selectedModelObj = allCurrentModels.find((m) => m.id === this.selectedModel);
    const selectedModelProvider = (selectedModelObj && selectedModelObj.provider) || 'self-hosted';

    const maxImgs = getMaxImagesForI2VModel(this.selectedModel);
    const showMultiImages = this.imageMode && maxImgs > 2;

    return html`
      <div class="w-full h-full flex flex-col items-center justify-center bg-app-bg relative overflow-hidden">
        <div
          class="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-40 lg:pb-32 px-2"
        >
          ${this.localHistory.length > 0
            ? this._renderHistoryCards()
            : this._renderEmptyState()}
        </div>

        <prompt-composer>
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-2.5 flex-wrap">
              ${this.uploadedImageUrl
                ? html`
                    <div class=${PROMPT_MEDIA_PREVIEW_CLASS}>
                      <img src=${this.uploadedImageUrl} alt="" class="w-full h-full object-cover" />
                      <button
                        type="button"
                        @click=${() => this.clearImageUpload()}
                        class="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 hover:text-white text-[8px] border border-white/5"
                      >×</button>
                    </div>
                  `
                : nothing}

              ${this.uploadedEndImageUrl
                ? html`
                    <div class=${PROMPT_MEDIA_PREVIEW_CLASS}>
                      <img src=${this.uploadedEndImageUrl} alt="" class="w-full h-full object-cover" />
                      <button
                        type="button"
                        @click=${() => this.clearEndImage()}
                        class="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 hover:text-white text-[8px] border border-white/5"
                      >×</button>
                      <span
                        class="absolute bottom-0.5 left-0.5 px-1 h-3.5 bg-black/60 rounded-md text-[7px] font-black text-[#22d3ee] leading-none flex items-center justify-center pointer-events-none"
                      >
                        END
                      </span>
                    </div>
                  `
                : nothing}

              ${this.uploadedVideoUrl
                ? html`
                    <div class=${PROMPT_MEDIA_PREVIEW_CLASS}>
                      <video src=${this.uploadedVideoUrl} class="w-full h-full object-cover" muted></video>
                      <button
                        type="button"
                        @click=${() => this.clearVideoUpload()}
                        class="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 hover:text-white text-[8px] border border-white/5"
                      >×</button>
                    </div>
                  `
                : nothing}

              ${showMultiImages
                ? this.uploadedImageUrls.map(
                    (url, idx) => html`
                      <div class=${PROMPT_MEDIA_PREVIEW_CLASS}>
                        <img src=${url} alt="" class="w-full h-full object-cover" />
                        <button
                          type="button"
                          @click=${() => this.removeImageAtIndex(idx)}
                          class="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/85 hover:text-white text-[8px] border border-white/5"
                        >×</button>
                        <span
                          class="absolute bottom-0.5 right-0.5 px-1 h-3.5 bg-black/60 rounded-full text-[8px] font-black text-[#22d3ee] leading-none flex items-center justify-center pointer-events-none"
                        >
                          ${idx + 1}
                        </span>
                      </div>
                    `,
                  )
                : nothing}

              ${canUploadImageReference &&
              (maxImgs > 2
                ? this.uploadedImageUrls.length < maxImgs
                : !this.uploadedImageUrl)
                ? html`
                    <div class="relative">
                      <input
                        type="file"
                        accept="image/*"
                        class="hidden"
                        data-image-file
                        @change=${(e) => this.handleImageFileChange(e)}
                      />
                      <button
                        type="button"
                        title="Upload reference image"
                        @click=${() =>
                          this.renderRoot.querySelector('input[data-image-file]')?.click()}
                        class=${promptMediaButtonClassName()}
                      >
                        ${this.imageUploading
                          ? this._uploadRing(this.imageProgress)
                          : html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-white/40 group-hover:text-[#22d3ee] transition-colors">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>`}
                      </button>
                    </div>
                  `
                : nothing}

              ${
                this.imageMode &&
                i2vModels.find((m) => m.id === this.selectedModel)?.lastImageField &&
                !this.uploadedEndImageUrl
                  ? html`
                      <div class="relative">
                        <input
                          type="file"
                          accept="image/*"
                          class="hidden"
                          data-end-image
                          @change=${(e) => this.handleEndImageFileChange(e)}
                        />
                        <button
                          type="button"
                          title="Upload end frame (optional)"
                          @click=${() =>
                            this.renderRoot.querySelector('input[data-end-image]')?.click()}
                          class=${promptMediaButtonClassName()}
                        >
                          ${this.endImageUploading
                            ? this._uploadRing(this.endImageProgress)
                            : html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-white/40 group-hover:text-[#22d3ee] transition-colors">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                              </svg>`}
                        </button>
                      </div>
                    `
                  : nothing}

              ${
                !this.uploadedVideoUrl &&
                (this.v2vMode || currentModelObj?.inputs?.video_files)
                  ? html`
                      <div class="relative">
                        <input
                          type="file"
                          accept="video/*"
                          class="hidden"
                          data-video-file
                          @change=${(e) => this.handleVideoFileChange(e)}
                        />
                        <button
                          type="button"
                          title="Upload video to remove watermark"
                          @click=${() =>
                            this.renderRoot.querySelector('input[data-video-file]')?.click()}
                          class=${promptMediaButtonClassName()}
                        >
                          ${this.videoUploading
                            ? this._uploadRing(this.videoProgress)
                            : html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-white/40 group-hover:text-[#22d3ee] transition-colors">
                                <polygon points="23 7 16 12 23 17 23 7" fill="currentColor" />
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" fill="currentColor" />
                              </svg>`}
                        </button>
                      </div>
                    `
                  : nothing}
            </div>

            <div class="flex-1 flex flex-col gap-1">
              <prompt-textarea
                .value=${this.prompt}
                placeholder=${this.promptPlaceholder}
                ?disabled=${this.promptDisabled}
                @input=${(e) => (this.prompt = e.currentTarget.value)}
              ></prompt-textarea>
            </div>
          </div>

          ${isExtendMode
            ? html`
                <div
                  class="flex items-center gap-2 px-3 py-1.5 mx-3 bg-primary/5 border border-primary/10 rounded-lg text-[10px] text-primary/80 font-medium tracking-tight"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  <span>Extending previous Seedance 2.0 generation</span>
                </div>
              `
            : nothing}

          <prompt-footer>
            <prompt-controls>
              <div class="relative">
                <button
                  type="button"
                  @click=${(e) => {
                    e.stopPropagation();
                    this.openDropdown = this.openDropdown === 'model' ? null : 'model';
                  }}
                  class=${promptControlClassName({ active: this.openDropdown === 'model' })}
                >
                  <div
                    class="w-4 h-4 rounded overflow-hidden shrink-0 flex items-center justify-center bg-white/5"
                  >
                    ${PROVIDER_LOGOS[selectedModelProvider]
                      ? html`<img
                          src=${PROVIDER_LOGOS[selectedModelProvider]}
                          alt=""
                          class=${'w-full h-full object-contain '}${invertLogos.includes(
                            selectedModelProvider,
                          )
                            ? 'invert'
                            : ''}
                        />`
                      : html`<span class="text-[9px] font-bold text-black uppercase">V</span>`}
                  </div>
                  <span class=${PROMPT_CONTROL_LABEL_CLASS}>${this.selectedModelName}</span>${PromptChevronIcon()}
                </button>
                ${this.openDropdown === 'model'
                  ? html`
                      <prompt-popover
                        className="w-[calc(100vw-2rem)] md:w-[480px] max-w-md md:max-w-none max-h-[70vh]"
                        @click=${(e) => e.stopPropagation()}
                      >
                        ${promptPopoverHeader('Model')}
                        <video-model-dropdown
                          .selectedModel=${this.selectedModel}
                          @select=${(e) => this.handleModelSelect(e.detail.model, e.detail.category)}
                          @close=${() => (this.openDropdown = null)}
                        ></video-model-dropdown>
                      </prompt-popover>
                    `
                  : nothing}
              </div>

              ${this.showAr
                ? html`
                    <div class="relative">
                      <button
                        type="button"
                        @click=${(e) => {
                          e.stopPropagation();
                          this.openDropdown = this.openDropdown === 'ar' ? null : 'ar';
                        }}
                        class=${promptControlClassName({ active: this.openDropdown === 'ar' })}
                      >${PromptAspectRatioIcon()}<span
                          class=${PROMPT_CONTROL_LABEL_CLASS}
                          >${this.selectedAr}</span
                        >
                      </button>
                      ${this.openDropdown === 'ar'
                        ? html`
                            <prompt-popover @click=${(e) => e.stopPropagation()}>
                              ${this._simpleDropdown(
                                'Aspect Ratio',
                                this.getCurrentAspectRatios(this.selectedModel),
                                this.selectedAr,
                                (val) => (this.selectedAr = val),
                              )}
                            </prompt-popover>
                          `
                        : nothing}
                    </div>
                  `
                : nothing}

              ${this.showEffect
                ? html`
                    <div class="relative">
                      <button
                        type="button"
                        @click=${(e) => {
                          e.stopPropagation();
                          this.openDropdown = this.openDropdown === 'effect' ? null : 'effect';
                        }}
                        class=${promptControlClassName({ active: this.openDropdown === 'effect' })}
                      >
                        ${unsafeHTML(
                          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-40 text-white"><path d="M5 3l14 9-14 9V3z" /></svg>',
                        )}<span class=${PROMPT_CONTROL_LABEL_CLASS + ' max-w-[140px] truncate'}
                          >${this.selectedEffect || 'Effect'}</span
                        >
                      </button>
                      ${this.openDropdown === 'effect'
                        ? html`
                            <prompt-popover className="min-w-[200px]" @click=${(e) => e.stopPropagation()}>
                              ${this._simpleDropdown(
                                'Effect Type',
                                getEffectsForI2VModel(this.selectedModel),
                                this.selectedEffect,
                                (val) => (this.selectedEffect = val),
                              )}
                            </prompt-popover>
                          `
                        : nothing}
                    </div>
                  `
                : nothing}

              ${this.showDuration
                ? html`
                    <div class="relative">
                      <button
                        type="button"
                        @click=${(e) => {
                          e.stopPropagation();
                          this.openDropdown =
                            this.openDropdown === 'duration' ? null : 'duration';
                        }}
                        class=${promptControlClassName({ active: this.openDropdown === 'duration' })}
                      >${PromptDurationIcon()}<span class=${PROMPT_CONTROL_LABEL_CLASS}
                          >${this.selectedDuration}s</span
                        >
                      </button>
                      ${this.openDropdown === 'duration'
                        ? html`
                            <prompt-popover @click=${(e) => e.stopPropagation()}>
                              ${this._simpleDropdown(
                                'Duration',
                                this.getCurrentDurations(this.selectedModel),
                                this.selectedDuration,
                                (val) => (this.selectedDuration = val),
                                (d) => `${d}s`,
                              )}
                            </prompt-popover>
                          `
                        : nothing}
                    </div>
                  `
                : nothing}

              ${this.showResolution
                ? html`
                    <div class="relative">
                      <button
                        type="button"
                        @click=${(e) => {
                          e.stopPropagation();
                          this.openDropdown =
                            this.openDropdown === 'resolution' ? null : 'resolution';
                        }}
                        class=${promptControlClassName({ active: this.openDropdown === 'resolution' })}
                      >${PromptQualityIcon()}<span class=${PROMPT_CONTROL_LABEL_CLASS}
                          >${this.selectedResolution || '720p'}</span
                        >
                      </button>
                      ${this.openDropdown === 'resolution'
                        ? html`
                            <prompt-popover @click=${(e) => e.stopPropagation()}>
                              ${this._simpleDropdown(
                                'Resolution',
                                this.getCurrentResolutions(this.selectedModel),
                                this.selectedResolution,
                                (val) => (this.selectedResolution = val),
                              )}
                            </prompt-popover>
                          `
                        : nothing}
                    </div>
                  `
                : nothing}

              ${canUploadImageReference
                ? html`
                    <button
                      type="button"
                      class=${promptControlClassName()}
                      @click=${() => (this.isDrawModalOpen = true)}
                    >
                      ${unsafeHTML(
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-40 text-white group-hover:text-[#22d3ee] transition-colors"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>',
                      )}<span class=${PROMPT_CONTROL_LABEL_CLASS}>Draw</span>
                    </button>
                  `
                : nothing}
            </prompt-controls>

            <prompt-action
              ?disabled=${this.generating}
              @click=${() => this.handleGenerate()}
            >
              ${this.generating
                ? html`<span class="animate-spin inline-block text-black">◌</span> Generating...`
                : html`<span>Generate</span>`}
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
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
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
            `
          : nothing}

        <draw-modal
          .isOpen=${this.isDrawModalOpen}
          .apiKey=${this.apiKey}
          .batchSize=${1}
          @add-history-item=${(e) => this.handleDrawReference(e.detail)}
          @close=${() => (this.isDrawModalOpen = false)}
        ></draw-modal>
      </div>
    `;
  }
}

customElements.define('studio-video', StudioVideo);
