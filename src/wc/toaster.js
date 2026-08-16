import { LitElement, html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { subscribe, dismiss } from '../lib/toast.js';
import { iconSvg } from '../lib/icons.js';

// Status glyphs (feather-style, MIT).
const S = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const ICONS = {
  message: `<svg ${S}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  success: `<svg ${S}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
  error: `<svg ${S}><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
  warning: `<svg ${S}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  loading: `<svg ${S}><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`,
};

export class AppToaster extends LitElement {
  static properties = {
    items: { state: true },
  };

  static styles = [
    css`
      :host {
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        pointer-events: none;
        max-width: min(92vw, 24rem);
      }
      .toast {
        pointer-events: auto;
        display: flex;
        align-items: flex-start;
        gap: 0.6rem;
        padding: 0.75rem 1rem;
        border-radius: 0.75rem;
        background: #141414;
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #fff;
        font: 500 0.875rem/1.4 Inter, system-ui, sans-serif;
        box-shadow: 0 12px 40px -12px rgba(0, 0, 0, 0.7);
        animation: t-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .toast svg { flex: 0 0 auto; margin-top: 1px; }
      .success svg { color: #34d399; }
      .error, .error svg { color: #f87171; }
      .warning svg { color: #fbbf24; }
      .loading svg { animation: spin 1s linear infinite; color: #22d3ee; }
      .msg { flex: 1 1 auto; word-break: break-word; }
      .close {
        flex: 0 0 auto;
        border: 0;
        background: transparent;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        font-size: 1rem;
        line-height: 1;
        padding: 0 0.1rem;
      }
      .close:hover { color: #fff; }
      .custom { display: block; }
      @keyframes t-in {
        from { opacity: 0; transform: translateX(12px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `,
  ];

  constructor() {
    super();
    this.items = [];
    this._unsub = subscribe((items) => {
      this.items = items;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsub?.();
  }

  render() {
    return html`<div style="display:contents">
      ${this.items.map((t) => html`
        <div class="toast ${t.type}">
          ${t.type === 'custom' && t.html
            ? html`<span class="custom">${unsafeHTML(t.html)}</span>`
            : html`<span>${unsafeHTML(ICONS[t.type] ?? ICONS.success)}</span><span class="msg">${t.message}</span>`}
          <button class="close" @click=${() => dismiss(t.id)} aria-label="Dismiss">&times;</button>
        </div>
      `)}
    </div>`;
  }
}

customElements.define('app-toaster', AppToaster);
