import { LitElement, html } from 'lit';

// Last React remnant (for P6): the reactflow workflow builder
// (packages/Vibe-Workflow/packages/workflow-builder, ~12k lines) is only
// instantiated when a real workflow API returns node schemas + workflow data.
// Self-hosted muapi.js stubs those endpoints, so this bridge is never
// instantiated in this deployment; the native <studio-workflow> covers the
// reachable surface. Kept as a lazy React mount (mirroring the original
// React.lazy(WorkflowUI)) so a real backend would still get the full builder.
class WorkflowBuilderBridge extends LitElement {
  static properties = {
    apiKey: { type: String },
    workflowId: { type: String },
    nodeSchemas: { attribute: false },
    workflowData: { attribute: false },
  };

  constructor() {
    super();
    this.apiKey = undefined;
    this.workflowId = null;
    this.nodeSchemas = null;
    this.workflowData = null;
    this._root = null;
    this._mods = null;
  }

  async connectedCallback() {
    super.connectedCallback();
    try {
      const [wf, react, reactDom, router] = await Promise.all([
        import('../../../packages/studio/src/components/WorkflowUI.jsx'),
        import('react'),
        import('react-dom/client'),
        import('react-router-dom'),
      ]);
      this._mods = { wf, react, reactDom, router };
      this._mount();
    } catch (err) {
      console.error('Workflow builder failed to load:', err);
    }
  }

  _mount() {
    if (!this._mods || this._root) return;
    const { wf, react, reactDom, router } = this._mods;
    this._root = reactDom.createRoot(this.renderRoot.querySelector('#builder-host'));
    this._render();
  }

  _render() {
    if (!this._root) return;
    const { wf, react, router } = this._mods;
    this._root.render(
      react.default.createElement(
        react.default.StrictMode,
        null,
        react.default.createElement(
          router.BrowserRouter,
          null,
          react.default.createElement(wf.default, {
            apiKey: this.apiKey,
            workflowId: this.workflowId,
            initialNodeSchemas: this.nodeSchemas ?? [],
            initialWorkflowData: this.workflowData ?? { nodes: [], edges: [] },
            costType: 'dollars',
          }),
        ),
      ),
    );
  }

  // Props may be applied after the async module load resolves.
  updated(changed) {
    if (this._root && changed.hasAny('apiKey', 'workflowId', 'nodeSchemas', 'workflowData'))
      this._render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._root?.unmount();
    this._root = null;
  }

  render() {
    return html`<div id="builder-host" class="w-full h-full bg-black"></div>`;
  }
}
customElements.define('workflow-builder-bridge', WorkflowBuilderBridge);
