// Port of packages/studio/src/components/prompt/PromptComposer.jsx.
// Layout pieces with a single job are elements (composer/textarea/popover/
// footer/controls/action) per the plan's element inventory; class-name
// helpers and small presentational parts (header, menu list/items,
// segmented control, icons) stay template functions — no over-elementing.
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';

export function joinClasses(...classes) {
  return classes.filter(Boolean).join(' ');
}

export const PROMPT_COMPOSER_POSITION_CLASS =
  'absolute bottom-4 w-full max-w-[95%] lg:max-w-4xl z-30 animate-fade-in-up';

const DEFAULT_PANEL_CLASS =
  'w-full bg-gradient-to-b from-[#18181c]/90 via-[#0f0f12]/90 to-[#0c0c0e]/95 backdrop-blur-2xl rounded-[2rem] border border-white/[0.08] p-4 flex flex-col gap-3 shadow-[0_15px_50px_rgba(0,0,0,0.8)]';

const DEFAULT_TEXTAREA_CLASS =
  'w-full bg-transparent border-none text-white text-sm placeholder:text-white/20 focus:outline-none resize-none pt-1 leading-relaxed min-h-[40px] max-h-[150px] md:max-h-[250px] overflow-y-auto custom-scrollbar disabled:opacity-40';

const DEFAULT_ACTION_CLASS =
  'bg-[#22d3ee] text-black px-7 py-3 rounded-full font-bold text-sm hover:opacity-95 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 w-full sm:w-auto shadow-lg shadow-[#22d3ee]/20 hover:shadow-[#22d3ee]/35 border border-[#22d3ee]/10 z-10 disabled:opacity-50 disabled:cursor-not-allowed';

const CONTROL_LAYOUT_CLASS =
  'h-[38px] flex items-center gap-2 rounded-md transition-all border group whitespace-nowrap shadow-inner focus:outline-none focus-visible:border-[#22d3ee]/45 focus-visible:ring-1 focus-visible:ring-[#22d3ee]/30';

const CONTROL_IDLE_CLASS =
  'text-white bg-[#16161a]/60 hover:bg-[#202026]/80 border-white/[0.06]';

const CONTROL_ACTIVE_CLASS =
  'text-[#22d3ee] bg-[#22d3ee]/10 hover:bg-[#22d3ee]/15 border-[#22d3ee]/25';

const MEDIA_CONTROL_LAYOUT_CLASS =
  'w-10 h-10 shrink-0 rounded-full border transition-all flex items-center justify-center relative overflow-hidden group focus:outline-none focus-visible:border-[#22d3ee]/45 focus-visible:ring-1 focus-visible:ring-[#22d3ee]/30';

export const DEFAULT_POPOVER_POSITION_CLASS =
  'absolute bottom-[calc(100%+12px)] left-0 z-50';

const DEFAULT_POPOVER_CLASS =
  'bg-[#0c0c0f]/95 rounded-xl p-3.5 shadow-[0_10px_40px_rgba(0,0,0,0.8)] border border-white/[0.08] backdrop-blur-2xl min-w-[160px] max-h-[40vh] overflow-y-auto custom-scrollbar';

export function promptControlClassName({
  active = false,
  compact = false,
  iconOnly = false,
  className = '',
} = {}) {
  return joinClasses(
    CONTROL_LAYOUT_CLASS,
    iconOnly
      ? 'w-[38px] px-0 justify-center'
      : compact
        ? 'px-3'
        : 'px-4',
    active ? CONTROL_ACTIVE_CLASS : CONTROL_IDLE_CLASS,
    className,
  );
}

export function promptMediaButtonClassName({
  active = false,
  className = '',
} = {}) {
  return joinClasses(
    MEDIA_CONTROL_LAYOUT_CLASS,
    active
      ? 'border-[#22d3ee]/60 bg-[#22d3ee]/5 hover:border-[#22d3ee]/70'
      : 'border-white/[0.03] bg-white/[0.03] hover:bg-white/[0.06] hover:border-[#22d3ee]/40',
    className,
  );
}

export const PROMPT_MEDIA_PREVIEW_CLASS =
  'relative w-10 h-10 shrink-0 rounded-full border border-white/10 overflow-hidden shadow-md group';

export const PROMPT_CONTROL_LABEL_CLASS =
  'text-xs font-semibold text-current opacity-70 group-hover:text-[#22d3ee] group-hover:opacity-100 transition-all';

// ── Icons ────────────────────────────────────────────────────────────────────

const svgOf = (markup) => unsafeHTML(markup);

export const PromptChevronIcon = (className = '') =>
  svgOf(
    '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="' +
      joinClasses(
        'text-current opacity-[0.45] group-hover:opacity-100 flex-shrink-0 transition-opacity',
        className,
      ) +
      '" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>',
  );

export const PromptAspectRatioIcon = (className = '') =>
  svgOf(
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="' +
      joinClasses('text-current opacity-[0.45] flex-shrink-0', className) +
      '" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /></svg>',
  );

export const PromptDurationIcon = (className = '') =>
  svgOf(
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' +
      joinClasses('text-current opacity-[0.45] flex-shrink-0', className) +
      '" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>',
  );

export const PromptQualityIcon = (className = '') =>
  svgOf(
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' +
      joinClasses('text-current opacity-[0.70] flex-shrink-0', className) +
      '" aria-hidden="true"><path d="M6.5 3.5h11L22 9 12 21 2 9l4.5-5.5Z" /><path d="M2 9h20" /><path d="m6.5 3.5 3 5.5L12 21" /><path d="m17.5 3.5-3 5.5L12 21" /></svg>',
  );

// Note: the React source used opacity-70 here.

// ── Template helpers (presentational) ────────────────────────────────────────

export const promptPopoverHeader = (children, className = '') =>
  html`
    <div
      class="${joinClasses(
        'text-[11px] font-semibold text-white/30 uppercase tracking-wider pb-2 border-b border-white/[0.05] mb-2 px-1',
        className,
      )}"
    >
      ${children}
    </div>
  `;

export const promptMenuList = (children, className = '') =>
  html`
    <div role="menu" class="${joinClasses('flex flex-col gap-1', className)}">
      ${children}
    </div>
  `;

export function promptMenuItem({
  children,
  description,
  selected = false,
  className = '',
  type = 'button',
  onClick,
}) {
  return html`
    <button
      type=${type}
      ?aria-checked=${selected}
      role="menuitemradio"
      @click=${onClick}
      class="${joinClasses(
        'w-full min-h-10 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-all group/menu-item',
        'text-xs font-semibold text-white/70 hover:bg-[#22d3ee]/10 hover:text-[#22d3ee] focus:outline-none focus-visible:bg-[#22d3ee]/10 focus-visible:text-[#22d3ee]',
        className,
      )}"
    >
      <span class="min-w-0">
        <span class="block truncate">${children}</span>
        ${description
          ? html`<span
              class="block text-[9px] font-medium text-white/35 mt-0.5 truncate group-hover/menu-item:text-white/50"
              >${description}</span
            >`
          : nothing}
      </span>
      ${selected
        ? svgOf(
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="4.5" class="flex-shrink-0" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>',
          )
        : nothing}
    </button>
  `;
}

export const promptSegmentedControl = (children, className = '') =>
  html`
    <div
      class="${joinClasses(
        'inline-flex items-center gap-1 bg-white/[0.03] border border-white/[0.05] rounded-full p-0.5',
        className,
      )}"
    >
      ${children}
    </div>
  `;

export function promptSegmentOption({
  children,
  selected = false,
  className = '',
  type = 'button',
  disabled = false,
  onClick,
}) {
  return html`
    <button
      type=${type}
      ?aria-pressed=${selected}
      ?disabled=${disabled}
      @click=${onClick}
      class="${joinClasses(
        'min-h-7 px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center justify-center gap-1.5',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#22d3ee]/40',
        selected
          ? 'bg-[#22d3ee] text-black shadow-md shadow-[#22d3ee]/20'
          : 'text-white/40 hover:text-white/70',
        className,
      )}"
    >
      ${children}
    </button>
  `;
}

// ── Elements (layout wrappers + the auto-sizing textarea) ───────────────────

const hostBlock = css`
  :host {
    display: contents;
  }
`;

export class PromptComposer extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    positionClassName: { type: String },
    panelClassName: { type: String },
    animationDelay: { type: String },
  };

  static styles = [
    css`
      :host {
        display: contents;
      }
    `,
  ];

  constructor() {
    super();
    this.positionClassName = PROMPT_COMPOSER_POSITION_CLASS;
    this.panelClassName = '';
    this.animationDelay = '0.2s';
  }

  render() {
    return html`
      <div
        class="${this.positionClassName}"
        style="animation-delay: ${this.animationDelay}"
      >
        <div class="${joinClasses(DEFAULT_PANEL_CLASS, this.panelClassName)}">
          <slot></slot>
        </div>
      </div>
    `;
  }
}

customElements.define('prompt-composer', PromptComposer);

export class PromptTextarea extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    value: { type: String },
    placeholder: { type: String },
    rows: { type: Number },
    disabled: { type: Boolean },
    className: { type: String },
    maxHeightMobile: { type: Number },
    maxHeightDesktop: { type: Number },
  };

  static styles = [
    css`
      :host {
        display: contents;
      }
    `,
  ];

  constructor() {
    super();
    this.value = '';
    this.placeholder = '';
    this.rows = 1;
    this.disabled = false;
    this.className = '';
    this.maxHeightMobile = 150;
    this.maxHeightDesktop = 250;
  }

  updated(changed) {
    if (changed.has('value')) this._resize();
  }

  _resize() {
    const el = this.renderRoot.querySelector('textarea');
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight =
      window.innerWidth < 768 ? this.maxHeightMobile : this.maxHeightDesktop;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }

  handleInput(e) {
    this.value = e.target.value;
    this._resize();
  }

  focus(options) {
    const el = this.renderRoot.querySelector('textarea');
    el?.focus(options);
  }

  get selectionStart() {
    return this.renderRoot.querySelector('textarea')?.selectionStart;
  }

  setSelectionRange(start, end) {
    this.renderRoot.querySelector('textarea')?.setSelectionRange(start, end);
  }

  render() {
    return html`
      <textarea
        .value=${this.value}
        placeholder=${this.placeholder}
        ?disabled=${this.disabled}
        rows=${this.rows}
        @input=${this.handleInput}
        class="${joinClasses(DEFAULT_TEXTAREA_CLASS, this.className)}"
      ></textarea>
    `;
  }
}

customElements.define('prompt-textarea', PromptTextarea);

export class PromptPopover extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    className: { type: String },
    positionClassName: { type: String },
  };

  static styles = [
    css`
      :host {
        display: contents;
      }
    `,
  ];

  constructor() {
    super();
    this.className = '';
    this.positionClassName = DEFAULT_POPOVER_POSITION_CLASS;
  }

  render() {
    // data-popover markers let host elements run outside-click checks via
    // composedPath().
    return html`
      <div
        data-popover
        class="${joinClasses(
          this.positionClassName,
          DEFAULT_POPOVER_CLASS,
          this.className,
        )}"
      >
        <slot></slot>
      </div>
    `;
  }
}

customElements.define('prompt-popover', PromptPopover);

export class PromptFooter extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    className: { type: String },
  };

  static styles = [hostBlock];

  constructor() {
    super();
    this.className = '';
  }

  render() {
    return html`
      <div
        class="${joinClasses(
          'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-3 border-t border-white/[0.03] relative',
          this.className,
        )}"
      >
        <slot></slot>
      </div>
    `;
  }
}

customElements.define('prompt-footer', PromptFooter);

export class PromptControls extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    className: { type: String },
  };

  static styles = [hostBlock];

  constructor() {
    super();
    this.className = '';
  }

  render() {
    return html`
      <div
        class="${joinClasses(
          'flex items-center gap-2 relative flex-wrap pb-1 md:pb-0',
          this.className,
        )}"
      >
        <slot></slot>
      </div>
    `;
  }
}

customElements.define('prompt-controls', PromptControls);

export class PromptAction extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    className: { type: String },
    type: { type: String },
    disabled: { type: Boolean },
  };

  static styles = [
    css`
      :host {
        display: contents;
      }
    `,
  ];

  constructor() {
    super();
    this.className = '';
    this.type = 'button';
    this.disabled = false;
  }

  render() {
    return html`
      <button type=${this.type} ?disabled=${this.disabled} class="${joinClasses(DEFAULT_ACTION_CLASS, this.className)}">
        <slot></slot>
      </button>
    `;
  }
}

customElements.define('prompt-action', PromptAction);
