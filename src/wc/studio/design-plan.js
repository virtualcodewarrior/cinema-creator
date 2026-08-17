// Port of packages/Open-AI-Design-Agent/packages/design-agent/src/components/PlanVisualizer.jsx.
// Renders a DAG (Directed Acyclic Graph) of plan nodes, grouped by topological
// layers for a clean horizontal flow.
import { html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { iconSvg } from '../../lib/icons.js';

export class DesignPlan extends BaseElement {
  static sheetKey = 'design';

  static properties = {
    plan: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }
  `;

  constructor() {
    super();
    this.plan = null;
  }

  _layers() {
    const plan = this.plan;
    if (!plan || !plan.nodes) return [];
    const layers = [];
    const processed = new Set();
    let remaining = [...plan.nodes];

    while (remaining.length > 0) {
      const layer = remaining.filter(
        (n) =>
          !n.depends ||
          n.depends.length === 0 ||
          n.depends.every((d) => processed.has(d)),
      );
      if (layer.length === 0) break; // cycle or missing dep
      layers.push(layer);
      layer.forEach((n) => processed.add(n.id));
      remaining = remaining.filter((n) => !processed.has(n.id));
    }
    return layers;
  }

  render() {
    const plan = this.plan;
    if (!plan || !plan.nodes) return;
    const layers = this._layers();
    return html`<div
      class="mt-4 mb-4 p-4 rounded border shadow-xl bg-bg-page/50 backdrop-blur-sm border-divider shadow-black/40"
    >
      <div class="flex items-center justify-between mb-6">
        <div>
          <h3
            class="text-[13px] font-bold text-primary flex items-center gap-2 uppercase tracking-widest"
          >
            ${unsafeHTML(iconSvg('FiZap', { size: 14, className: 'animate-pulse' }))}
            Proposed Execution Plan
          </h3>
          <p class="text-[11px] text-secondary-text mt-1 italic"
            >“${plan.title}”</p
          >
        </div>
        <div class="text-right">
          <div class="text-[12px] font-bold text-primary-text">
            ${plan.total_credits}
            <span class="text-[10px] text-secondary-text font-normal"
              >credits</span
            >
          </div>
          <div
            class="text-[10px] text-secondary-text uppercase tracking-tight"
          >
            ${plan.nodes.length} steps
          </div>
        </div>
      </div>

      <div class="relative overflow-x-auto scrollbar-hide pb-4">
        <div class="flex items-start gap-12 min-w-max px-4">
          ${layers.map(
            (layer, lIdx) => html`<div
              class="flex flex-col gap-6 justify-center min-h-[200px]"
            >
              ${layer.map(
                (node) => html`<div
                  id="plan-node-${node.id}"
                  class="w-48 p-3 rounded bg-bg-card border border-divider shadow-sm hover:border-primary/50 transition-all group relative z-10"
                >
                  <div class="flex items-center justify-between mb-2">
                    <span
                      class="text-[10px] font-bold text-primary opacity-70"
                      >#${node.id}</span
                    >
                    <span
                      class="text-[10px] font-bold text-secondary-text bg-bg-page px-1.5 py-0.5 rounded border border-divider"
                      >${node.est_credits || 0} cr</span
                    >
                  </div>
                  <div
                    class="text-[12px] font-bold text-primary-text truncate group-hover:whitespace-normal group-hover:overflow-visible transition-all"
                  >
                    ${node.tool.replace(/_/g, ' ')}
                  </div>
                  <div
                    class="text-[11px] text-secondary-text mt-1.5 leading-tight line-clamp-2 italic"
                  >
                    ${node.label || 'Processing asset...'}
                  </div>

                  ${lIdx < layers.length - 1
                    ? html`<div
                        class="absolute top-1/2 -right-12 w-12 h-px bg-gradient-to-r from-divider to-transparent"
                      ></div>`
                    : ''}
                </div>`,
              )}
            </div>`,
          )}
        </div>
      </div>

      ${plan.notes && plan.notes.length > 0
        ? html`<div class="mt-4 pt-4 border-t border-divider">
            ${plan.notes.map(
              (note) => html`<div
                class="text-[10px] text-secondary-text flex items-center gap-2"
              >
                <span class="w-1 h-1 rounded-full bg-primary"></span> ${note}
              </div>`,
            )}
          </div>`
        : ''}
    </div>`;
  }
}

customElements.define('design-plan', DesignPlan);
