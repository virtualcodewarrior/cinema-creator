// Port of packages/studio/src/components/AudioStudio.jsx.
// Inner components became elements (audio-file-uploader /
// premium-audio-player); the React white-label props (callbacks,
// historyItems, droppedFiles) are kept as element properties, so the
// embedding contract is unchanged. <Toaster> dropped (global app-toaster).
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import toast from '../../lib/toast.js';
import './audio-file-uploader.js';
import './premium-audio-player.js';
import { generateAudio, uploadFile } from 'studio/muapi.js';
import { formatErrorMessage } from 'studio/utils/formatError.js';
import { scopedPersistKey, migrateLegacyPersistKey } from 'studio/persistKey.js';
import { audioModels, getAudioModelById } from 'studio/models.js';
import { matchesOrigin } from 'studio/modelOrigin.js';
import { modelOriginBadge, originFilterPills } from './origin-filter.js';

const svg = (markup) => unsafeHTML(markup);

const ModelChevronIcon = (rotated) =>
  svg(
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="transition-transform duration-200 ${
      rotated ? 'rotate-180' : ''
    }"><polyline points="6 9 12 15 18 9" /></svg>`,
  );
const ParamChevronIcon = (rotated) =>
  svg(
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="transition-transform duration-200 ${
      rotated ? 'rotate-185' : ''
    }"><polyline points="6 9 12 15 18 9" /></svg>`,
  );
const GeneratePlayIcon = svg(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">' +
    '<path d="M5 3l14 9-14 9V3z" /></svg>',
);
const ErrorIcon = svg(
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<circle cx="12" cy="12" r="10" />' +
    '<line x1="12" y1="8" x2="12" y2="12" />' +
    '<line x1="12" y1="16" x2="12.01" y2="16" />' +
    '</svg>',
);
const BackIcon = svg(
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<line x1="19" y1="12" x2="5" y2="12" />' +
    '<polyline points="12 19 5 12 12 5" />' +
    '</svg>',
);
const HistoryVolumeIcon = svg(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />' +
    '</svg>',
);
const MusicIcon = (className) =>
  svg(
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' +
      (className || '') +
      '"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>',
  );

const LEGACY_PERSIST_KEY = 'hg_audio_studio_persistent';

export class StudioAudio extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    // White-label contract props (were React props). The Vite host never
    // passes them; embedders can.
    apiKey: { type: String },
    onGenerationStart: { attribute: false },
    onGenerationEnd: { attribute: false },
    onGenerationComplete: { attribute: false },
    onGenerationError: { attribute: false },
    historyItems: { attribute: false },
    droppedFiles: { attribute: false },
    onFilesHandled: { attribute: false },

    selectedModelId: { state: true },
    params: { state: true },
    openDropdown: { state: true },
    openParamDropdown: { state: true },
    isGenerating: { state: true },
    generateError: { state: true },
    activeResultUrl: { state: true },
    activeResultTitle: { state: true },
    view: { state: true },
    internalHistory: { state: true },
    activeHistoryIdx: { state: true },
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
    // Mode & model state
    this.selectedModelId = audioModels[0]?.id ?? '';
    this.params = {};
    this.openDropdown = false;
    this.openParamDropdown = null;
    // Generation state
    this.isGenerating = false;
    this.generateError = null;
    this.activeResultUrl = null;
    this.activeResultTitle = '';
    this.view = 'input'; // 'input' | 'result'
    // History state
    this.internalHistory = [];
    this.activeHistoryIdx = 0;
    this.modelOriginFilter = 'all';

    this.apiKey = '';
    this.onGenerationStart = null;
    this.onGenerationEnd = null;
    this.onGenerationComplete = null;
    this.onGenerationError = null;
    this.historyItems = null;
    this.droppedFiles = null;
    this.onFilesHandled = null;

    this._persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey);
    this._saveTimer = null;
    this._outsideClickBound = null;
  }

  get history() {
    return this.historyItems ?? this.internalHistory;
  }

  get selectedModel() {
    return getAudioModelById(this.selectedModelId);
  }

  connectedCallback() {
    super.connectedCallback();
    // Persistence key can change with apiKey; migrate + load before the first
    // render (React did this in mount effects).
    if (this._persistKey !== scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey)) {
      this._persistKey = scopedPersistKey(LEGACY_PERSIST_KEY, this.apiKey);
    }
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, this._persistKey);
    try {
      const stored = localStorage.getItem(this._persistKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.selectedModelId) this.selectedModelId = data.selectedModelId;
        if (data.params) this.params = data.params;
        if (data.internalHistory) this.internalHistory = data.internalHistory;
        if (data.activeResultUrl) this.activeResultUrl = data.activeResultUrl;
        if (data.activeResultTitle)
          this.activeResultTitle = data.activeResultTitle;
        if (data.view) this.view = data.view;
      }
    } catch (err) {
      console.warn('Failed to load AudioStudio persistence:', err);
    }
  }

  willUpdate(changed) {
    // Init params when the model changes (React effect on [selectedModelId]).
    if (changed.has('selectedModelId')) {
      const model = this.selectedModel;
      if (!model) return;
      const initial = {};
      Object.entries(model.inputs || {}).forEach(([key, schema]) => {
        // Don't overwrite parameters like vocal upload, list etc. if they are
        // already in state
        if (this.params[key] !== undefined) {
          initial[key] = this.params[key];
        } else {
          initial[key] = schema.default !== undefined ? schema.default : '';
        }
      });
      this.params = initial;
    }
  }

  firstUpdated() {
    this._outsideClickBound = (e) => {
      const sidebar = this.renderRoot.querySelector('[data-sidebar]');
      if (!sidebar) return;
      // composedPath: clicks inside this shadow tree retarget to the host,
      // so e.target containment alone would close on inner clicks.
      const path = e.composedPath();
      const inSidebar = path.includes(sidebar);
      if (!inSidebar) {
        this.openDropdown = false;
        this.openParamDropdown = null;
      }
    };
    window.addEventListener('click', this._outsideClickBound);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._outsideClickBound)
      window.removeEventListener('click', this._outsideClickBound);
    if (this._saveTimer) clearTimeout(this._saveTimer);
  }

  updated(changed) {
    if (changed.has('droppedFiles')) this._handleDroppedFiles();
    const saveKeys = new Set([
      'selectedModelId',
      'params',
      'internalHistory',
      'activeResultUrl',
      'activeResultTitle',
      'view',
    ]);
    // changed is a Map — iterate keys, not entries.
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
      try {
        const state = {
          selectedModelId: this.selectedModelId,
          params: this.params,
          internalHistory: this.internalHistory,
          activeResultUrl: this.activeResultUrl,
          activeResultTitle: this.activeResultTitle,
          view: this.view,
        };
        localStorage.setItem(this._persistKey, JSON.stringify(state));
      } catch (err) {
        console.warn('Failed to save AudioStudio persistence:', err);
      }
    }, 500);
  }

  // Handle Dropped Files (React effect on [droppedFiles, ...])
  _handleDroppedFiles() {
    if (this.droppedFiles && this.droppedFiles.length > 0) {
      const audioFiles = this.droppedFiles.filter((f) =>
        f.type.startsWith('audio/'),
      );
      const model = this.selectedModel;
      if (audioFiles.length > 0 && model) {
        // Find the first audio input field in the current model
        const firstAudioField = Object.entries(model.inputs || {}).find(
          ([_, schema]) => schema.field === 'audio',
        );
        const firstAudioListField = Object.entries(model.inputs || {}).find(
          ([_, schema]) => schema.field === 'audios_list',
        );

        if (firstAudioField) {
          const [key] = firstAudioField;
          // Trigger file upload helper
          uploadFile(this.apiKey, audioFiles[0], () => {})
            .then((url) => {
              this.params = { ...this.params, [key]: url };
            })
            .catch((err) =>
              alert(`Failed to upload dropped file: ${err.message}`),
            );
        } else if (firstAudioListField) {
          const [key] = firstAudioListField;
          uploadFile(this.apiKey, audioFiles[0], () => {})
            .then((url) => {
              // React used a functional setParams(prev => ...); state here is
              // read directly (uploads are sequential per drop, same as React
              // where the effect only fires on new droppedFiles).
              const currentList = Array.isArray(this.params[key])
                ? [...this.params[key]]
                : [];
              if (currentList.length < 2) currentList.push(url);
              this.params = { ...this.params, [key]: currentList };
            })
            .catch((err) =>
              alert(`Failed to upload dropped file: ${err.message}`),
            );
        }
      }
      this.onFilesHandled?.();
    }
  }

  addToInternalHistory(entry) {
    this.internalHistory = [entry, ...this.internalHistory].slice(0, 30);
  }

  handleSelectHistory(entry, index) {
    this.activeResultUrl = entry.url;
    this.activeResultTitle =
      entry.title || entry.prompt || 'Generated Track';
    this.activeHistoryIdx = index;
    this.view = 'result';
  }

  _setParam(key, value) {
    this.params = { ...this.params, [key]: value };
  }

  _setListParam(key, index, url) {
    const items = [...(this.params[key] || [])];
    if (url) {
      items[index] = url;
    } else {
      items.splice(index, 1);
    }
    this._setParam(key, items.filter(Boolean));
  }

  async handleGenerate() {
    const model = this.selectedModel;
    if (!model) return;

    // Check required fields
    if (model.required) {
      for (const field of model.required) {
        if (
          !this.params[field] ||
          (Array.isArray(this.params[field]) &&
            this.params[field].length === 0)
        ) {
          alert(
            `Please complete the required field: ${model.inputs?.[field]?.title || field}`,
          );
          return;
        }
      }
    }

    this.onGenerationStart?.();
    this.isGenerating = true;
    this.generateError = null;

    try {
      const audioParams = {
        ...this.params,
        _modelId: this.selectedModelId,
      };

      // Call generateAudio
      const res = await generateAudio(this.apiKey, audioParams);

      if (!res?.url) {
        throw new Error('No audio URL returned by the API.');
      }

      const title =
        this.params.title ||
        this.params.prompt ||
        `Generated ${model.name}`;
      const entry = {
        id: res.id || Date.now().toString(),
        url: res.url,
        title,
        prompt: this.params.prompt || '',
        model: this.selectedModelId,
        timestamp: new Date().toISOString(),
      };

      if (!this.historyItems) this.addToInternalHistory(entry);

      this.activeResultUrl = res.url;
      this.activeResultTitle = title;
      this.view = 'result';
      this.activeHistoryIdx = 0;

      if (this.onGenerationComplete) {
        this.onGenerationComplete({
          url: res.url,
          model: this.selectedModelId,
          prompt: this.params.prompt,
          type: 'audio',
        });
      }
    } catch (e) {
      console.error('[AudioStudio]', e);
      const errMsg = formatErrorMessage(e, 'Audio generation failed');
      if (this.onGenerationError) this.onGenerationError(errMsg);
      else toast.error(errMsg);
    } finally {
      this.isGenerating = false;
      this.onGenerationEnd?.();
    }
  }

  handleNew() {
    this.view = 'input';
    this.activeResultUrl = null;
    this.activeResultTitle = '';
    // Keep parameters to avoid having to reupload files if they wish to
    // adjust details
  }

  render() {
    const model = this.selectedModel;
    return html`
      <div
        class="w-full h-full flex bg-app-bg text-white overflow-hidden relative"
      >
        <!-- LEFT CONFIGURATION SIDEBAR -->
        <div
          data-sidebar
          class="w-full lg:w-[400px] border-r border-zinc-900 flex flex-col bg-zinc-950/40 backdrop-blur-lg flex-shrink-0 z-30"
        >
          <div class="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6 pb-24">
            <!-- Model Selector -->
            <div class="space-y-2 relative">
              <label
                class="text-xs font-bold text-zinc-300 uppercase tracking-wider block"
                >Audio Model</label
              >
              <button
                type="button"
                @click=${() => (this.openDropdown = !this.openDropdown)}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-4 py-3.5 text-sm text-left font-bold text-white flex items-center justify-between hover:bg-zinc-850 hover:border-primary/50 transition-all"
              >
                <span>${model?.name ?? 'Select Model'}</span>
                ${ModelChevronIcon(this.openDropdown)}
              </button>

              ${this.openDropdown
                ? html`<div
                    class="absolute left-0 right-0 mt-2 z-50 bg-[#161618] border border-zinc-700 rounded shadow-3xl max-h-60 overflow-y-auto custom-scrollbar p-1.5"
                  >
                    <div class="px-1.5 pb-2 pt-0.5">${originFilterPills(this.modelOriginFilter, (o) => (this.modelOriginFilter = o))}</div>
                    ${audioModels.filter((m) => matchesOrigin(m, this.modelOriginFilter)).length === 0
                      ? html`<div class="text-xs text-white/30 text-center py-4">No models found</div>`
                      : audioModels.filter((m) => matchesOrigin(m, this.modelOriginFilter)).map(
                          (m) => html`
                            <button
                              type="button"
                              @click=${() => {
                                this.selectedModelId = m.id;
                                this.openDropdown = false;
                              }}
                              class="w-full text-left px-4 py-2.5 rounded text-xs font-bold transition-all flex flex-col gap-1.5 border ${
                                m.id === this.selectedModelId
                                  ? 'text-primary bg-primary/10 border-primary/20'
                                  : 'text-zinc-200 border-transparent hover:bg-zinc-900 hover:text-white'
                              }"
                            >
                              <span class="flex items-center gap-1.5 min-w-0">
                                <span class="truncate">${m.name}</span>${modelOriginBadge(m)}
                              </span>
                              ${m.description
                                ? html`<span
                                    class="text-[10px] text-zinc-300 truncate max-w-[320px] font-normal"
                                    >${m.description}</span
                                  >`
                                : nothing}
                            </button>
                          `,
                        )}
                  </div>`
                : nothing}
            </div>

            <!-- Model Description -->
            ${model?.description
              ? html`<div>
                  <span
                    class="text-[10px] font-bold text-primary uppercase tracking-wider block mb-1.5"
                    >Description</span
                  >
                  <p
                    class="text-zinc-400 text-xs leading-relaxed font-semibold"
                    >${model.description}</p
                  >
                </div>`
              : nothing}

            <!-- Dynamic Configuration Form -->
            <div class="space-y-5">
              ${model
                ? Object.entries(model.inputs || {}).map(
                    ([key, schema]) => this.renderParamField(key, schema),
                  )
                : nothing}
            </div>
          </div>

          <!-- Dynamic Cost & Generate Section -->
          <div
            class="p-4 border-t border-zinc-900 bg-zinc-950/80 backdrop-blur-xl absolute bottom-0 left-0 w-full lg:w-[400px] z-40"
          >
            <button
              type="button"
              @click=${this.handleGenerate}
              ?disabled=${this.isGenerating || !model}
              class="w-full py-4 bg-primary text-black text-base font-bold rounded hover:bg-white transition-all transform hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:grayscale shadow-glow flex items-center justify-center gap-3"
            >
              ${this.isGenerating
                ? html`
                    <div
                      class="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"
                    ></div>
                    <span>Generating Audio...</span>
                  `
                : html`
                    ${GeneratePlayIcon}
                    <span>Generate Track</span>
                  `}
            </button>
          </div>
        </div>

        <!-- RIGHT CONTENT AREA -->
        <div class="flex-1 flex flex-col min-w-0 h-full relative z-20">
          <!-- Main Display panel -->
          <div
            class="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 flex flex-col justify-between"
          >
            <div
              class="flex-1 flex items-center justify-center min-h-[400px] mb-8"
            >
              <!-- 1. Error Display -->
              ${this.generateError
                ? html`<div
                    class="w-full max-w-md p-6 bg-red-500/10 border border-red-500/20 rounded flex flex-col items-center gap-4 animate-shake"
                  >
                    <div
                      class="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 border border-red-500/30 shadow-lg"
                    >
                      ${ErrorIcon}
                    </div>
                    <div class="text-center">
                      <span
                        class="text-xs font-black text-red-500 uppercase tracking-widest block mb-1"
                        >Generation Error</span
                      >
                      <p
                        class="text-white font-medium text-sm leading-relaxed"
                        >${this.generateError}</p
                      >
                    </div>
                  </div>`
                : nothing}

              <!-- 2. Generating / Loading View -->
              ${this.isGenerating && !this.generateError
                ? html`<div class="flex flex-col items-center gap-6 animate-fade-in">
                    <div class="relative">
                      <div
                        class="w-24 h-24 border-[3px] border-zinc-800 border-t-primary rounded-full animate-spin shadow-glow"
                      ></div>
                      <div
                        class="absolute inset-0 flex items-center justify-center text-primary"
                      >
                        ${MusicIcon('animate-pulse text-primary')}
                      </div>
                    </div>
                    <div class="text-center space-y-2">
                      <div
                        class="text-xs font-black text-primary uppercase tracking-[0.3em] animate-pulse"
                        >Generating Soundtrack</div
                      >
                      <div class="text-sm text-zinc-200 font-bold">
                        Rendering audio waveforms and vocals...
                      </div>
                    </div>
                  </div>`
                : nothing}

              <!-- 3. Empty State (no audio, not loading, no error) -->
              ${this.view === 'input' &&
              !this.isGenerating &&
              !this.generateError
                ? html`<div
                    class="flex flex-col items-center gap-6 max-w-md text-center p-8 bg-zinc-900/40 border border-zinc-800 rounded backdrop-blur-sm relative group animate-fade-in-up"
                  >
                    <!-- Glow behind the icon -->
                    <div
                      class="absolute inset-0 bg-primary/5 blur-3xl rounded-full opacity-25 group-hover:opacity-40 transition-opacity duration-1000 pointer-events-none"
                    ></div>
                    <div
                      class="w-20 h-20 bg-zinc-900 border border-zinc-705 rounded flex items-center justify-center shadow-inner relative z-10 transition-transform duration-500 group-hover:scale-105"
                    >
                      ${MusicIcon(
                        'text-primary w-8 h-8 filter drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]',
                      )}
                    </div>
                    <div class="relative z-10">
                      <h3
                        class="text-white font-black text-xl mb-3 tracking-tight"
                        >Audio Studio</h3
                      >
                      <p
                        class="text-sm text-zinc-200 font-medium leading-relaxed px-4"
                      >
                        Choose an AI music model, voice cloner, or sound generator. Modify variables on the left and craft your next high-fidelity track.
                      </p>
                    </div>
                  </div>`
                : nothing}

              <!-- 4. Active Result Player Display -->
              ${this.view === 'result' &&
              this.activeResultUrl &&
              !this.isGenerating &&
              !this.generateError
                ? html`<div class="w-full max-w-2xl animate-fade-in-up space-y-4">
                    <div class="flex items-center justify-between px-1">
                      <button
                        @click=${this.handleNew}
                        class="text-xs font-bold text-zinc-200 hover:text-primary flex items-center gap-2 transition-all bg-zinc-905 border border-zinc-700 hover:border-primary/30 px-4 py-2 rounded-full"
                        type="button"
                      >
                        ${BackIcon}
                        <span>New Generation</span>
                      </button>
                      <span
                        class="text-[11px] font-bold text-green-400 px-3.5 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full flex items-center gap-2"
                      >
                        <div
                          class="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"
                        ></div>
                        Success
                      </span>
                    </div>
                    <premium-audio-player
                      .url=${this.activeResultUrl}
                      .title=${this.activeResultTitle}
                    ></premium-audio-player>
                  </div>`
                : nothing}
            </div>

            <!-- BOTTOM HISTORY FOOTER -->
            ${this.history.length > 0
              ? html`
                  <div
                    class="border-t border-zinc-900 pt-6 w-full animate-fade-in-up"
                  >
                    <h4
                      class="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-4 px-1"
                    >
                      Generation History (${this.history.length})
                    </h4>
                    <div
                      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                    >
                      ${this.history.map((entry, idx) => html`
                        <div
                          @click=${() =>
                            this.handleSelectHistory(entry, idx)}
                          class="p-3.5 bg-zinc-900 border rounded cursor-pointer transition-all flex flex-col justify-between h-28 border-zinc-700/80 hover:bg-zinc-850 hover:border-zinc-500 ${
                            this.activeResultUrl === entry.url &&
                            this.view === 'result'
                              ? 'border-primary bg-primary/5 shadow-glow'
                              : ''
                          }"
                        >
                          <div class="flex items-center gap-2">
                            <div
                              class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${
                                this.activeResultUrl === entry.url &&
                                this.view === 'result'
                                  ? 'bg-primary/20 text-primary'
                                  : 'bg-zinc-800 text-zinc-200'
                              }"
                            >
                              ${HistoryVolumeIcon}
                            </div>
                            <span
                              class="text-[10px] font-bold text-primary uppercase tracking-wider truncate"
                              >${entry.model
                                ? entry.model.split('-').slice(0, 2).join(' ')
                                : 'Audio'}</span
                            >
                          </div>
                          <p
                            class="text-[11px] font-semibold text-white line-clamp-2 leading-tight"
                          >
                            ${entry.title ||
                            entry.prompt ||
                            'Untitled Audio'}
                          </p>
                        </div>
                      `)}
                    </div>
                  </div>
                `
              : nothing}
          </div>
        </div>
      </div>
    `;
  }

  renderParamField(key, schema) {
    // Skip model switcher itself (if it's in schemas)
    if (key === 'model') return nothing;

    // Audio URL file upload (single)
    if (schema.type === 'string' && schema.field === 'audio') {
      return html`
        <audio-file-uploader
          .label=${schema.title || key}
          .value=${this.params[key] || ''}
          .apiKey=${this.apiKey}
          @change=${(e) => this._setParam(key, e.detail)}
        ></audio-file-uploader>
      `;
    }

    // Audio URLs list file upload (multiple)
    if (schema.type === 'array' && schema.field === 'audios_list') {
      const value = this.params[key] || [];
      const maxItems = schema.maxItems || 2;
      return html`
        <div class="space-y-4">
          <label
            class="block text-xs font-bold text-zinc-200 uppercase tracking-wider"
            >${schema.title || key} (Max ${maxItems})</label
          >
          <div class="space-y-3">
            ${Array.from({ length: maxItems }).map(
              (_, i) => html`
                <audio-file-uploader
                  .label=${`Track #${i + 1}`}
                  .value=${value[i] || null}
                  .apiKey=${this.apiKey}
                  @change=${(e) => this._setListParam(key, i, e.detail)}
                ></audio-file-uploader>
              `,
            )}
          </div>
        </div>
      `;
    }

    // Boolean Toggles
    if (schema.type === 'boolean') {
      return html`
        <div
          class="flex items-center justify-between bg-zinc-900 border border-zinc-700/80 rounded p-4 transition-all hover:border-zinc-600"
        >
          <div class="flex-1 pr-4">
            <span class="block text-xs font-bold text-white tracking-tight"
              >${schema.title || key}</span
            >
            ${schema.description
              ? html`<span
                  class="block text-[11px] text-zinc-300 leading-normal mt-1"
                  >${schema.description}</span
                >`
              : nothing}
          </div>
          <button
            type="button"
            @click=${() =>
              this._setParam(key, !this.params[key])}
            class="w-11 h-6 rounded-full p-1 transition-all duration-300 relative shrink-0 ${
              this.params[key] ? 'bg-primary' : 'bg-zinc-800'
            }"
          >
            <div
              class="w-4 h-4 rounded-full bg-black shadow-md transform transition-all duration-300 ${
                this.params[key] ? 'translate-x-5 bg-white' : 'translate-x-0'
              }"
            ></div>
          </button>
        </div>
      `;
    }

    // Enum Dropdowns
    if (schema.enum) {
      const isOpen = this.openParamDropdown === key;
      return html`
        <div class="space-y-2 relative">
          <label
            class="block text-xs font-bold text-zinc-300 uppercase tracking-wider"
            >${schema.title || key}</label
          >
          <button
            type="button"
            @click=${() => {
              this.openDropdown = false;
              this.openParamDropdown = isOpen ? null : key;
            }}
            class="w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-600 rounded px-4 py-3.5 text-xs text-left font-bold text-white flex items-center justify-between transition-all cursor-pointer"
          >
            <span>${this.params[key] || 'Select option'}</span>
            ${ParamChevronIcon(isOpen)}
          </button>

          ${isOpen
            ? html`<div
                class="absolute left-0 right-0 mt-1 z-50 bg-[#161618] border border-zinc-700 rounded shadow-3xl max-h-60 overflow-y-auto custom-scrollbar p-1"
              >
                ${schema.enum.map((opt) => {
                  const optionValue =
                    typeof opt === 'object' ? opt.value : opt;
                  const optionLabel =
                    typeof opt === 'object'
                      ? opt.label || opt.value
                      : opt;
                  return html`
                    <button
                      type="button"
                      @click=${() => {
                        this._setParam(key, optionValue);
                        this.openParamDropdown = null;
                      }}
                      class="w-full text-left px-4 py-2.5 rounded text-xs font-bold transition-all border ${
                        this.params[key] === optionValue
                          ? 'text-primary bg-primary/10 border-primary/20'
                          : 'text-zinc-200 border-transparent hover:bg-zinc-900 hover:text-white'
                      }"
                    >
                      ${optionLabel}
                    </button>
                  `;
                })}
              </div>`
            : nothing}
          ${schema.description
            ? html`<span
                class="block text-[11px] text-zinc-300 leading-normal"
                >${schema.description}</span
              >`
            : nothing}
        </div>
      `;
    }

    // Number Sliders & Ranges
    const isNumber =
      schema.type === 'int' ||
      schema.type === 'integer' ||
      schema.type === 'float' ||
      schema.type === 'number';
    const hasMinMax =
      schema.minValue !== undefined && schema.maxValue !== undefined;
    if (isNumber && hasMinMax) {
      const step = schema.step || (schema.type === 'float' ? 0.05 : 1);
      return html`
        <div
          class="space-y-3 bg-zinc-900 border border-zinc-700/80 rounded p-4 transition-all hover:border-zinc-600"
        >
          <div class="flex items-center justify-between text-xs font-bold">
            <span class="text-white tracking-tight"
              >${schema.title || key}</span
            >
            <span
              class="text-primary font-mono bg-primary/10 px-2 py-0.5 rounded border border-primary/20"
              >${this.params[key] !== undefined
                ? this.params[key]
                : schema.default}</span
            >
          </div>
          <div class="flex items-center gap-2">
            <span
              class="text-[10px] text-zinc-300 font-medium w-6 text-right"
              >${schema.minValue}</span
            >
            <input
              type="range"
              min=${schema.minValue}
              max=${schema.maxValue}
              step=${step}
              value=${this.params[key] !== undefined
                ? this.params[key]
                : schema.default || 0}
              @input=${(e) =>
                this._setParam(
                  key,
                  parseFloat(e.target.value),
                )}
              class="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary hover:bg-zinc-700 transition-all"
            />
            <span
              class="text-[10px] text-zinc-300 font-medium w-6 text-left"
              >${schema.maxValue}</span
            >
          </div>
          ${schema.description
            ? html`<span
                class="block text-[11px] text-zinc-300 leading-normal"
                >${schema.description}</span
              >`
            : nothing}
        </div>
      `;
    }

    // Prompt / Textarea Input
    if (key === 'prompt') {
      return html`
        <div class="space-y-2">
          <label
            class="block text-xs font-bold text-zinc-200 uppercase tracking-wider"
            >${schema.title || 'Lyrics / Prompt'}</label
          >
          <textarea
            .value=${this.params[key] || ''}
            @input=${(e) => this._setParam(key, e.target.value)}
            class="w-full bg-zinc-900 border border-zinc-700 focus:border-primary/85 rounded p-3 text-xs text-white placeholder:text-zinc-400 focus:outline-none transition-all min-h-[100px] resize-none leading-relaxed shadow-inner"
            placeholder=${schema.description || 'Enter what you want generated...'}
          ></textarea>
          ${schema.examples && Array.isArray(schema.examples)
            ? html`<div class="flex flex-wrap gap-1.5 mt-2">
                ${schema.examples.map(
                  (ex, idx) => html`
                    <button
                      type="button"
                      @click=${() => this._setParam(key, ex)}
                      class="text-[11px] px-3 py-1 bg-zinc-800/80 border border-zinc-700 hover:bg-primary/20 hover:border-primary/45 hover:text-white rounded-full transition-all font-semibold text-zinc-100"
                    >
                      "${ex.slice(0, 35)}..."
                    </button>
                  `,
                )}
              </div>`
            : nothing}
        </div>
      `;
    }

    // Standard Text / Input fields
    return html`
      <div class="space-y-2">
        <label
          class="block text-xs font-bold text-zinc-200 uppercase tracking-wider"
          >${schema.title || key}</label
        >
        <input
          type=${isNumber ? 'number' : 'text'}
          .value=${this.params[key] !== undefined ? this.params[key] : ''}
          placeholder=${schema.placeholder ||
          schema.description ||
          `Enter ${key}...`}
          @input=${(e) => {
            const val = isNumber
              ? e.target.value === ''
                ? ''
                : parseFloat(e.target.value)
              : e.target.value;
            this._setParam(key, val);
          }}
          class="w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-600 focus:border-primary/80 rounded px-4 py-3.5 text-xs text-white placeholder:text-zinc-400 focus:outline-none transition-all shadow-inner"
        />
        ${schema.description
          ? html`<span
              class="block text-[11px] text-zinc-300 leading-normal"
              >${schema.description}</span
            >`
          : nothing}
      </div>
    `;
  }
}

customElements.define('studio-audio', StudioAudio);
