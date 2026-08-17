// Shared Local/API indicator UI for every model picker: the per-model
// badge and the All / Local / API filter pills.
import { html } from 'lit';
import { modelOrigin } from 'studio/modelOrigin.js';

export const ORIGIN_FILTERS = [
  { id: 'all', label: 'All', title: 'Show all models' },
  { id: 'local', label: 'Local', title: 'Only models that run locally on your server (no API key)' },
  { id: 'api', label: 'API', title: 'Only 3rd-party API models (API key required)' },
];

const BADGE_CLASS =
  'text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded shrink-0 ';

export function modelOriginBadge(model) {
  const origin = modelOrigin(model);
  return html`<span
    class="${BADGE_CLASS}${origin === 'local' ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}"
    title=${origin === 'local'
      ? 'Runs locally on your server — no API key required'
      : '3rd-party API — API key required'}
  >${origin === 'local' ? 'Local' : 'API'}</span>`;
}

export function originFilterPills(selected, onPick) {
  return html`<div class="flex items-center gap-1 shrink-0">
    ${ORIGIN_FILTERS.map((f) => {
      const active = selected === f.id;
      const activeClass =
        f.id === 'local'
          ? 'bg-green-900/30 text-green-400 border-green-500/20'
          : f.id === 'api'
            ? 'bg-yellow-900/30 text-yellow-400 border-yellow-500/25'
            : 'bg-primary/15 text-primary border-primary/30';
      return html`<button
        type="button"
        title=${f.title}
        @click=${(e) => {
          e.stopPropagation();
          onPick(f.id);
        }}
        class=${'shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors border '}${active
          ? activeClass
          : 'bg-white/[0.02] text-white/50 border-white/[0.04] hover:bg-white/5 hover:text-white'}
      >${f.label}</button>`;
    })}
  </div>`;
}
