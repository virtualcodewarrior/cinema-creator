import { html, nothing } from 'lit';
import { BaseElement } from '../../lib/wc-base.js';
import { navigate } from '../../lib/router.js';
import {
  getTemplateWorkflows,
  getUserWorkflows,
  getPublishedWorkflows,
  createWorkflow,
  updateWorkflowName,
  deleteWorkflow,
  getWorkflowInputs,
  executeWorkflow,
  getAllNodeSchemas,
  getWorkflowData,
} from '../../../packages/studio/src/muapi.js';
import './workflow-builder-bridge.js';

// Port of packages/studio/src/components/WorkflowStudio.jsx.
// In self-hosted mode the workflow APIs in muapi.js are stubs (empty lists,
// mutating calls throw), so the reachable surface is the listing view; the
// selected-workflow / playground / builder branches are ported 1:1 for
// fidelity even though the stubs make them unreachable here.

const LAYERS_SVG = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="opacity-20"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>`;

export class WorkflowCard extends BaseElement {
  static sheetKey = 'studio';
  static properties = {
    workflow: { attribute: false },
    activeTab: { attribute: false },
    showOptions: { state: true },
  };
  constructor() {
    super();
    this.workflow = null;
    this.activeTab = null;
    this.showOptions = false;
  }
  render() {
    const wf = this.workflow || {};
    return html`
      <div
        @click=${() => this.dispatchEvent(new CustomEvent('select', { bubbles: true, detail: wf }))}
        class="group relative aspect-[3/4] rounded-lg overflow-hidden cursor-pointer border border-white/5 bg-[#0a0a0a] transition-all hover:border-[#22d3ee]/30 hover:scale-[1.02] shadow-2xl"
      >
        ${wf.thumbnail
          ? html`<img
              src=${wf.thumbnail}
              alt=${wf.name}
              class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />`
          : html`<div
              class="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center"
              >${LAYERS_SVG}</div>`}
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>

        ${this.activeTab === 'my-workflows'
          ? html`<div
              class="absolute top-2 right-2 z-30"
              @click=${(e) => e.stopPropagation()}
            >
              <button
                @click=${() => (this.showOptions = !this.showOptions)}
                @blur=${() => setTimeout(() => (this.showOptions = false), 200)}
                class="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                  ><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg
                >
              </button>

              ${this.showOptions
                ? html`<div
                    class="absolute top-10 right-0 w-32 bg-[#111] border border-white/10 rounded-lg shadow-2xl py-1 animate-in fade-in zoom-in duration-200"
                  >
                    <button
                      @click=${() =>
                        this.dispatchEvent(
                          new CustomEvent('rename', { bubbles: true, detail: wf }),
                        )}
                      class="w-full px-4 py-2 text-left text-[11px] font-bold text-white/70 hover:text-[#22d3ee] hover:bg-white/5 transition-colors flex items-center gap-2"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                        ><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path
                          d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg
                      >
                      Rename
                    </button>
                    <button
                      @click=${() =>
                        this.dispatchEvent(
                          new CustomEvent('delete', { bubbles: true, detail: wf.id }),
                        )}
                      class="w-full px-4 py-2 text-left text-[11px] font-bold text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                        ><path
                          d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg
                      >
                      Delete
                    </button>
                  </div>`
                : nothing}
            </div>`
          : nothing}

        ${this.activeTab === 'published' && wf.user_name
          ? html`<div
              class="absolute top-2 left-2 z-20 flex items-center gap-2 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full border border-white/10"
            >
              <img
                src=${wf.user_profile || '/user_profile.png'}
                alt="profile"
                class="w-4 h-4 rounded-full"
              />
              <span class="text-[9px] font-black text-white/80 uppercase tracking-widest"
                >${wf.user_name}</span
              >
            </div>`
          : nothing}

        <div class="absolute inset-x-0 bottom-0 p-4">
          <div
            class="text-[10px] font-bold text-[#22d3ee] uppercase tracking-wider mb-1 opacity-80"
          >
            ${wf.category || 'General'}
          </div>
          <h3
            class="text-sm font-bold text-white truncate group-hover:text-[#22d3ee] transition-colors"
          >
            ${wf.name || 'Untitled Flow'}
          </h3>
        </div>
      </div>
    `;
  }
}
customElements.define('workflow-card', WorkflowCard);

export class StudioWorkflow extends BaseElement {
  static sheetKey = 'studio';
  static properties = {
    apiKey: { type: String },
    isHeaderVisible: { type: Boolean },
    workflows: { state: true },
    loading: { state: true },
    selectedWorkflow: { state: true },
    activeSubTab: { state: true },
    activeMainTab: { state: true },
    renamingWorkflow: { state: true },
    newWorkflowName: { state: true },
    isDeletingId: { state: true },
    inputSchema: { state: true },
    nodeSchemas: { state: true },
    workflowDef: { state: true },
    formData: { state: true },
    isExecuting: { state: true },
    result: { state: true },
    error: { state: true },
  };

  constructor() {
    super();
    this.apiKey = undefined;
    this.isHeaderVisible = true;
    this.workflows = [];
    this.loading = true;
    this.selectedWorkflow = null;
    this.activeSubTab = 'playground';
    this.activeMainTab = 'templates';
    this.renamingWorkflow = null;
    this.newWorkflowName = '';
    this.isDeletingId = null;
    this.inputSchema = null;
    this.nodeSchemas = null;
    this.workflowDef = null;
    this.formData = {};
    this.isExecuting = false;
    this.result = null;
    this.error = null;
    this._eff = null;
  }

  connectedCallback() {
    super.connectedCallback();
    // Seed the effect cache so the first updated() pass doesn't re-run the
    // initial list load kicked off here.
    this._eff = {
      apiKey: this.apiKey,
      activeMainTab: this.activeMainTab,
      selectedId: null,
      urlWorkflowId: null,
      urlTab: null,
    };
    this._loadWorkflows();
  }

  // Route equivalent of useParams() on /workflow/[id]/[tab]. The native app
  // never routes studio sub-paths (the /workflow/* legacy routes render the
  // image studio), so this only sees /studio/workflows/<id>/<tab> if one were
  // constructed directly.
  _url() {
    const m = window.location.pathname.match(
      /\/studio\/workflows?\/([^/]+)(?:\/([^/]+))?/,
    );
    if (m) return { id: m[1], tab: m[2] || null };
    return { id: null, tab: null };
  }

  updated(changed) {
    // React autoFocus on the rename modal's input.
    if (changed.has('renamingWorkflow') && this.renamingWorkflow) {
      const input = this.renderRoot.querySelector('input[type="text"]');
      requestAnimationFrame(() => input?.focus());
    }
    this._runEffects();
  }

  _runEffects() {
    const { id: urlWorkflowId, tab: urlTab } = this._url();
    const d = this._eff;
    if (
      !d ||
      d.apiKey !== this.apiKey ||
      d.activeMainTab !== this.activeMainTab
    ) {
      this._loadWorkflows();
    }

    if (
      this.selectedWorkflow?.id &&
      this.apiKey &&
      (!d || d.selectedId !== this.selectedWorkflow.id || d.apiKey !== this.apiKey)
    ) {
      this._loadWorkflowDetails();
    }

    // KEY FIX equivalent: /studio/workflows/[id] redirects to /workflow/[id].
    if (urlWorkflowId && urlWorkflowId !== 'new') {
      const path = window.location.pathname;
      if (path.startsWith('/studio/workflows/')) {
        const tab = urlTab || 'builder';
        const to = `/workflow/${urlWorkflowId}/${tab}`;
        if (window.location.pathname !== to) navigate(to, { replace: true });
      }
    }

    // 1. Sync state with URL on mount or URL change.
    if (!this.loading) {
      if (urlWorkflowId) {
        if (urlWorkflowId === 'new') {
          if (!this.selectedWorkflow || this.selectedWorkflow.id !== null)
            this._createWorkflow(true);
        } else {
          const found = this.workflows.find((wf) => wf.id === urlWorkflowId);
          if (found) {
            if (!this.selectedWorkflow || this.selectedWorkflow.id !== urlWorkflowId)
              this._selectWorkflow(found, true);
          } else if (!this.selectedWorkflow || this.selectedWorkflow.id !== urlWorkflowId) {
            this._selectWorkflow({ id: urlWorkflowId, name: 'Loading...' }, true);
          }
        }
      } else if (this.selectedWorkflow) {
        this.selectedWorkflow = null;
      }
    }

    // Handle reload on exit to clear builder CSS.
    const fromBuilder = sessionStorage.getItem('fromWorkflowBuilder');
    if (fromBuilder && (!urlWorkflowId || this.activeSubTab !== 'builder')) {
      sessionStorage.removeItem('fromWorkflowBuilder');
      window.location.reload();
    }

    this._eff = {
      apiKey: this.apiKey,
      activeMainTab: this.activeMainTab,
      selectedId: this.selectedWorkflow?.id ?? null,
      urlWorkflowId,
      urlTab,
    };
  }

  async _loadWorkflows() {
    try {
      this.loading = true;
      let data = [];
      if (this.activeMainTab === 'templates') data = await getTemplateWorkflows(this.apiKey);
      else if (this.activeMainTab === 'my-workflows') data = await getUserWorkflows(this.apiKey);
      else if (this.activeMainTab === 'published') data = await getPublishedWorkflows(this.apiKey);
      this.workflows = data;
    } catch (err) {
      console.error('Failed to load workflows:', err);
      this.error = 'Failed to load workflows list.';
    } finally {
      this.loading = false;
    }
  }

  _selectWorkflow(wf, fromUrl = false) {
    this.selectedWorkflow = wf;
    this.result = null;
    this.error = null;
    const targetTab = this._url().tab || 'playground';
    this.activeSubTab = targetTab;
    if (!fromUrl) navigate(`/workflow/${wf.id}/${targetTab}`);
  }

  async _loadWorkflowDetails() {
    try {
      this.loading = true;
      const wfId = this.selectedWorkflow.id;
      const results = await Promise.allSettled([
        getWorkflowInputs(this.apiKey, wfId),
        getAllNodeSchemas(this.apiKey, wfId),
        getWorkflowData(this.apiKey, wfId),
      ]);
      if (results[0].status === 'fulfilled') {
        const response = results[0].value;
        const schema = response.input_data || response;
        this.inputSchema = schema;
        const initial = {};
        Object.entries(schema.properties || {}).forEach(([key, prop]) => {
          initial[key] =
            prop.default || (Array.isArray(prop.examples) ? prop.examples[0] : prop.examples) || '';
        });
        this.formData = initial;
      } else {
        console.warn('Input schema not available for this workflow:', results[0].reason);
        this.inputSchema = null;
        this.formData = {};
      }
      const nodes = results[1].status === 'fulfilled' ? results[1].value : [];
      const def = results[2].status === 'fulfilled' ? results[2].value : { nodes: [], edges: [] };
      this.nodeSchemas = nodes;
      this.workflowDef = def;
      if (results[1].status === 'rejected' || results[2].status === 'rejected') {
        console.error(
          'Builder components failed to load:',
          results[1].reason,
          results[2].reason,
        );
        if (!nodes.length && !def.nodes?.length)
          this.error = 'Failed to load full builder data. Some features may be disabled.';
      }
    } catch (err) {
      console.error('Critical error loading pulse details:', err);
      this.error = 'Critical error loading builder: ' + err.message;
      this.nodeSchemas = [];
      this.workflowDef = { nodes: [], edges: [] };
    } finally {
      this.loading = false;
    }
  }

  async _createWorkflow(fromUrl = false) {
    try {
      this.loading = true;
      if (!fromUrl) {
        const payload = {
          workflow_id: null,
          name: 'Untitled Workflow',
          edges: [],
          data: { nodes: [] },
        };
        const response = await createWorkflow(this.apiKey, payload);
        if (this.apiKey) sessionStorage.setItem('wl_workflow_token', this.apiKey);
        navigate(`/workflow/${response.workflow_id}/builder`);
        return;
      }
      this.selectedWorkflow = { id: null, name: 'Untitled Workflow' };
      this.nodeSchemas = [];
      this.workflowDef = { nodes: [], edges: [] };
      this.activeSubTab = 'builder';
    } catch (err) {
      this.error = 'Failed to initialize workflow: ' + err.message;
    } finally {
      this.loading = false;
    }
  }

  async _deleteWorkflow(wfId) {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    this.isDeletingId = wfId;
    try {
      await deleteWorkflow(this.apiKey, wfId);
      this.workflows = this.workflows.filter((w) => w.id !== wfId);
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete workflow');
    } finally {
      this.isDeletingId = null;
    }
  }

  async _renameWorkflow(e) {
    e?.preventDefault();
    if (!this.renamingWorkflow || !this.newWorkflowName.trim()) return;
    const wfId = this.renamingWorkflow.id;
    try {
      await updateWorkflowName(this.apiKey, wfId, this.newWorkflowName);
      this.workflows = this.workflows.map((w) =>
        w.id === wfId ? { ...w, name: this.newWorkflowName } : w,
      );
      if (this.selectedWorkflow?.id === wfId)
        this.selectedWorkflow = { ...this.selectedWorkflow, name: this.newWorkflowName };
      this.renamingWorkflow = null;
    } catch (err) {
      console.error('Rename failed:', err);
      alert('Failed to rename workflow');
    }
  }

  async _run(e) {
    e.preventDefault();
    if (this.isExecuting) return;
    this.onGenerationStart?.();
    this.isExecuting = true;
    this.error = null;
    this.result = null;
    try {
      const inputs = {};
      Object.entries(this.formData).forEach(([key, value]) => {
        if (!value) return;
        if (key.startsWith('text')) inputs[key] = { prompt: value };
        else if (key.startsWith('image')) inputs[key] = { image_url: value };
        else if (key.startsWith('video')) inputs[key] = { video_url: value };
        else inputs[key] = value;
      });
      const data = await executeWorkflow(this.apiKey, this.selectedWorkflow.id, inputs);
      this.result = data;
      this.onGenerationComplete?.({
        url: data?.url || data?.output?.url || data?.outputs?.[0]?.url || null,
        type: 'workflow',
      });
    } catch (err) {
      console.error('Execution failed:', err);
      const message = err.message || 'Execution failed';
      this.error = message;
      this.onGenerationError?.(message);
    } finally {
      this.isExecuting = false;
      this.onGenerationEnd?.();
    }
  }

  // ─── Views ────────────────────────────────────────────────────────────────

  _loadingBuilder() {
    return html`
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="flex flex-col items-center gap-4">
          <div class="w-12 h-12 border-4 border-white/5 border-t-[#22d3ee] rounded-full animate-spin"></div>
          <div class="text-[10px] font-black text-white/20 uppercase tracking-widest"
            >Loading Builder...</div
          >
        </div>
      </div>
    `;
  }

  _header() {
    const wf = this.selectedWorkflow;
    if (this.isHeaderVisible) {
      return html`
        <div class="flex-shrink-0 h-14 border-b border-white/5 flex items-center justify-between px-6 bg-black/40 z-30">
          <div class="flex items-center gap-8 h-full">
            <button
              @click=${() => navigate('/studio/workflows')}
              class="flex items-center gap-2 text-xs font-bold text-white/50 hover:text-white transition-colors"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              All Workflows
            </button>
            <div class="h-4 w-[1px] bg-white/10"></div>
            <div class="flex h-full">
              <div class="flex bg-white/5 p-1 rounded-lg my-auto">
                <button
                  @click=${() => {
                    this.activeSubTab = 'playground';
                    if (this.selectedWorkflow?.id)
                      navigate(`/workflow/${this.selectedWorkflow.id}/playground`);
                  }}
                  type="button"
                  class="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${this.activeSubTab === 'playground'
                    ? 'bg-[#22d3ee] text-black shadow-[0_0_15px_rgba(34, 211, 238,0.2)]'
                    : 'text-white/40 hover:text-white'}"
                >
                  Playground
                </button>
                <button
                  @click=${() => {
                    this.activeSubTab = 'builder';
                    if (this.selectedWorkflow?.id) {
                      if (this.apiKey) sessionStorage.setItem('wl_workflow_token', this.apiKey);
                      navigate(`/workflow/${this.selectedWorkflow.id}/builder`);
                    }
                  }}
                  type="button"
                  class="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${this.activeSubTab === 'builder'
                    ? 'bg-[#22d3ee] text-black shadow-[0_0_15px_rgba(34, 211, 238,0.2)]'
                    : 'text-white/40 hover:text-white'}"
                >
                  Full Workflow
                </button>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-[11px] font-black text-[#22d3ee] uppercase tracking-widest"
              >${wf.name}</span
            >
            <button
              @click=${() => this.onToggleHeader?.(false)}
              class="p-1.5 bg-white/5 hover:bg-white/10 rounded-md transition-colors text-white/40 hover:text-white"
              title="Enter Zen Mode"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
            </button>
          </div>
        </div>
      `;
    }
    return html`
      <div class="absolute top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-4 py-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl animate-fade-in-down">
        <button
          @click=${() => navigate('/studio/workflows')}
          class="p-1.5 text-white/40 hover:text-white transition-colors"
          title="Back to All Workflows"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <div class="h-4 w-[1px] bg-white/10"></div>
        <div class="flex bg-white/5 p-1 rounded-lg">
          <button
            @click=${() => (this.activeSubTab = 'playground')}
            type="button"
            class="px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-all ${this.activeSubTab === 'playground'
              ? 'bg-[#22d3ee] text-black'
              : 'text-white/40'}"
          >
            Play
          </button>
          <button
            @click=${() => (this.activeSubTab = 'builder')}
            type="button"
            class="px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-all ${this.activeSubTab === 'builder'
              ? 'bg-[#22d3ee] text-black'
              : 'text-white/40'}"
          >
            Builder
          </button>
        </div>
        <div class="h-4 w-[1px] bg-white/10"></div>
        <button
          @click=${() => this.onToggleHeader?.(true)}
          class="px-3 py-1 bg-white/10 hover:bg-white/20 text-[9px] font-black text-white uppercase tracking-widest rounded-lg transition-colors flex items-center gap-2"
          type="button"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 14h6v6M20 10h-6V4M10 20l-7-7M14 4l7 7" /></svg>
          Exit Zen
        </button>
      </div>
    `;
  }

  _playground() {
    const schema = this.inputSchema;
    return html`
      <div class="w-full lg:w-[400px] border-r border-white/5 flex flex-col bg-black/20">
        <div class="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <form
            @submit=${(e) => {
              e.preventDefault();
              this._run(e);
            }}
            class="space-y-6"
          >
            <div>
              <h3 class="text-xs font-black text-white/30 uppercase tracking-widest mb-4"
                >Configuration</h3
              >
              <div class="space-y-4">
                ${schema
                  ? Object.entries(schema.properties || {}).map(
                      ([key, prop]) => html`
                        <div class="space-y-2">
                          <label
                            class="block text-[11px] font-bold text-white/80 uppercase tracking-wider"
                            >${prop.title || key}</label
                          >
                          ${prop.type === 'string' && !prop.enum
                            ? html`<textarea
                                .value=${this.formData[key] || ''}
                                @input=${(e) =>
                                  (this.formData = {
                                    ...this.formData,
                                    [key]: e.target.value,
                                  })}
                                class="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors min-h-[80px] resize-none"
                                placeholder=${prop.description || `Enter ${key}...`}
                              ></textarea>`
                            : prop.enum
                              ? html`<select
                                  .value=${this.formData[key] || ''}
                                  @change=${(e) =>
                                    (this.formData = {
                                      ...this.formData,
                                      [key]: e.target.value,
                                    })}
                                  class="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors"
                                >
                                  ${prop.enum.map(
                                    (opt) =>
                                      html`<option value=${opt} class="bg-black">${opt}</option>`,
                                  )}
                                </select>`
                              : html`<input
                                  type="text"
                                  .value=${this.formData[key] || ''}
                                  @input=${(e) =>
                                    (this.formData = {
                                      ...this.formData,
                                      [key]: e.target.value,
                                    })}
                                  class="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors"
                                  placeholder=${prop.description || `Enter ${key}...`}
                                />`}
                        </div>
                      `,
                    )
                  : nothing}
              </div>
            </div>
            <button
              type="submit"
              ?disabled=${this.isExecuting || !this.selectedWorkflow.id}
              class="w-full py-4 bg-[#22d3ee] text-black text-xs font-black uppercase tracking-[0.2em] rounded-xl hover:bg-white transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:grayscale shadow-[0_0_30px_rgba(34, 211, 238,0.15)] flex items-center justify-center gap-3 mt-8"
            >
              ${this.isExecuting
                ? html`
                    <div class="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                    <span>Generating...</span>
                  `
                : html`
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 3l14 9-14 9V3z" /></svg>
                    <span>Run Workflow</span>
                  `}
            </button>
            ${!this.selectedWorkflow.id
              ? html`<p class="text-[10px] text-white/30 text-center mt-4"
                  >Save your workflow first to enable execution.</p
                >`
              : nothing}
          </form>
        </div>
      </div>
      <div
        class="flex-1 overflow-y-auto p-8 lg:p-12 bg-[#050505] flex items-center justify-center min-h-[500px]"
      >
        ${this.error
          ? html`
              <div class="w-full max-w-md p-6 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col items-center gap-4 animate-shake">
                <div class="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-500">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                </div>
                <div class="text-center">
                  <span class="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-1"
                    >Execution Error</span
                  >
                  <p class="text-white/60 text-sm leading-relaxed">${this.error}</p>
                </div>
              </div>
            `
          : nothing}
        ${!this.isExecuting && !this.result && !this.error
          ? html`
              <div class="flex flex-col items-center gap-6 opacity-40">
                <div class="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-white/20">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                </div>
                <p class="text-xs text-white/40 max-w-[200px] mx-auto text-center font-medium"
                  >Configure parameters and run the workflow to see results.</p
                >
              </div>
            `
          : nothing}
        ${this.isExecuting
          ? html`
              <div class="flex flex-col items-center gap-6 animate-fade-in">
                <div class="relative">
                  <div class="w-24 h-24 border-[3px] border-white/5 border-t-[#22d3ee] rounded-full animate-spin shadow-[0_0_40px_rgba(34, 211, 238,0.1)]"></div>
                  <div class="absolute inset-0 flex items-center justify-center text-[#22d3ee]">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-pulse"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                  </div>
                </div>
                <div class="text-center space-y-2">
                  <div class="text-[10px] font-black text-[#22d3ee] uppercase tracking-[0.3em] animate-pulse"
                    >Running Pipeline</div
                  >
                  <div class="text-[13px] text-white/40 font-medium"
                    >Processing nodes and generating assets...</div
                  >
                </div>
              </div>
            `
          : nothing}
        ${this.result
          ? html`
              <div class="w-full max-w-4xl space-y-8 animate-fade-in-up">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="text-xs font-black text-white/30 uppercase tracking-widest"
                    >Workflow Results</h3
                  >
                  <div class="flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-[10px] font-bold border border-green-500/20">
                    <div class="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div> COMPLETED
                  </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  ${(this.result.outputs || []).map(
                    (out, idx) => html`
                      <div
                        class="group relative bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-[#22d3ee]/30 transition-all shadow-2xl"
                      >
                        ${out.type === 'image_url'
                          ? html`<img src=${out.value} class="w-full aspect-square object-cover" alt="Output" />`
                          : out.type === 'video_url'
                            ? html`<video src=${out.value} controls class="w-full aspect-square object-cover"></video>`
                            : html`<div class="p-6 min-h-[200px] flex items-center justify-center italic text-white/60">${out.value}</div>`}
                        <div class="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform">
                          <div class="flex items-center justify-between">
                            <span class="text-[10px] font-black text-[#22d3ee] uppercase tracking-widest"
                              >${out.id}</span
                            >
                            <a
                              href=${out.value}
                              target="_blank"
                              rel="noreferrer"
                              class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-[#22d3ee] hover:text-black transition-colors"
                              ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg
                            ></a>
                          </div>
                        </div>
                      </div>
                    `,
                  )}
                </div>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  _builder() {
    return html`
      <div class="flex-1 relative bg-[#050505]">
        ${this.nodeSchemas && this.workflowDef
          ? html`<workflow-builder-bridge
              .apiKey=${this.apiKey}
              .workflowId=${this.selectedWorkflow?.id ?? null}
              .nodeSchemas=${this.nodeSchemas}
              .workflowData=${{
                ...this.workflowDef,
                workflow_id: this.selectedWorkflow?.id,
              }}
            ></workflow-builder-bridge>`
          : this._loadingBuilder()}
      </div>
    `;
  }

  _listing() {
    const tabBtn = (tab, label) => html`
      <button
        @click=${() => (this.activeMainTab = tab)}
        class="px-6 py-4 text-xs font-black uppercase tracking-[0.2em] transition-all border-b-2 ${this.activeMainTab === tab
          ? 'text-[#22d3ee] border-[#22d3ee]'
          : 'text-white/30 border-transparent hover:text-white'}"
      >
        ${label}
      </button>
    `;
    return html`
      <div class="h-full w-full flex flex-col p-8 overflow-y-auto custom-scrollbar">
        <div class="max-w-7xl mx-auto w-full">
          <div class="flex flex-col gap-6 mb-12">
            <div class="flex items-end justify-between">
              <div>
                <h1 class="text-3xl font-bold text-white mb-2 tracking-tight">Workflows</h1>
                <p class="text-white/40 text-sm font-medium"
                  >Create and manage your asynchronous AI processing pipelines</p
                >
              </div>
              <button
                @click=${() => this._createWorkflow()}
                class="px-6 py-3 bg-[#22d3ee] text-black text-xs font-black uppercase tracking-widest rounded-lg hover:bg-white transition-all transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(34, 211, 238,0.3)] flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Create Workflow
              </button>
            </div>
            <div class="flex items-center gap-2 border-b border-white/5">
              ${tabBtn('templates', 'Templates')}
              ${tabBtn('my-workflows', 'My Workflows')}
              ${tabBtn('published', 'Community')}
            </div>
          </div>
          ${this.loading
            ? html`
                <div class="py-20 flex items-center justify-center">
                  <div class="w-10 h-10 border-4 border-white/5 border-t-[#22d3ee] rounded-full animate-spin"></div>
                </div>
              `
            : html`
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                  ${this.workflows.map(
                    (wf) => html`
                      <workflow-card
                        .workflow=${wf}
                        .activeTab=${this.activeMainTab}
                        @select=${(e) => this._selectWorkflow(e.detail)}
                        @rename=${(e) => {
                          this.renamingWorkflow = e.detail;
                          this.newWorkflowName = e.detail.name;
                        }}
                        @delete=${(e) => this._deleteWorkflow(e.detail)}
                      ></workflow-card>
                    `,
                  )}
                  ${!this.loading && this.workflows.length === 0
                    ? html`<div
                        class="col-span-full py-24 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]"
                      >
                        <div class="text-white/20 text-sm font-medium italic"
                          >No workflows found in this section.</div
                        >
                      </div>`
                    : nothing}
                </div>
              `}
        </div>
        ${this.renamingWorkflow
          ? html`
              <div class="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <div
                  class="absolute inset-0 bg-black/80 backdrop-blur-md"
                  @click=${() => (this.renamingWorkflow = null)}
                ></div>
                <form
                  @submit=${(e) => this._renameWorkflow(e)}
                  class="relative w-full max-w-sm bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300"
                >
                  <h3 class="text-xl font-bold text-white mb-2">Rename Workflow</h3>
                  <p class="text-white/40 text-sm mb-6"
                    >Enter a new descriptive name for your pipeline.</p
                  >
                  <div class="space-y-4">
                    <div class="space-y-2">
                      <label class="text-[10px] font-black text-[#22d3ee] uppercase tracking-widest"
                        >Workflow Name</label
                      >
                      <input
                        type="text"
                        .value=${this.newWorkflowName}
                        @input=${(e) => (this.newWorkflowName = e.target.value)}
                        placeholder="e.g. Cinematic Video Flow"
                        class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors"
                      />
                    </div>
                    <div class="flex gap-3 pt-4">
                      <button
                        type="button"
                        @click=${() => (this.renamingWorkflow = null)}
                        class="flex-1 px-4 py-3 text-xs font-black text-white/40 uppercase tracking-widest hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        class="flex-1 bg-[#22d3ee] text-black px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white transition-all transform hover:scale-105 active:scale-95"
                      >
                        Save Name
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  render() {
    if (this.loading && !this.selectedWorkflow) {
      return html`
        <div class="h-full flex items-center justify-center">
          <div class="animate-spin text-[#22d3ee] text-3xl">◌</div>
        </div>
      `;
    }
    if (this.selectedWorkflow) {
      return html`
        <div class="h-full flex flex-col bg-[#030303] text-white">
          ${this._header()}
          <div class="flex-1 overflow-hidden flex flex-col lg:flex-row">
            ${this.activeSubTab === 'playground' ? this._playground() : this._builder()}
          </div>
        </div>
      `;
    }
    return this._listing();
  }
}
customElements.define('studio-workflow', StudioWorkflow);
