// Port of packages/studio/src/components/MobileGenerationActions.jsx.
// Mobile (< md) action menu per generated item; also exports the
// GenerationCopyButtons row used on md+ and the CopyContentIcon SVG.
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';

async function getClipboardPngBlob(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image request failed with status ${response.status}.`);
  }

  const sourceBlob = await response.blob();
  if (sourceBlob.type === 'image/png') return sourceBlob;

  const objectUrl = URL.createObjectURL(sourceBlob);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Could not decode the image.'));
      element.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create an image clipboard canvas.');
    }

    context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('Could not convert the image to PNG.')),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function copyPrompt(prompt) {
  if (!prompt) return;
  await navigator.clipboard.writeText(prompt);
}

async function copyImage(url) {
  if (!url) return;
  if (
    !window.isSecureContext ||
    !navigator.clipboard?.write ||
    typeof window.ClipboardItem === 'undefined'
  ) {
    throw new Error('Image clipboard access requires HTTPS or localhost.');
  }

  await navigator.clipboard.write([
    new window.ClipboardItem({
      'image/png': getClipboardPngBlob(url),
    }),
  ]);
}

const svgOf = (markup) => unsafeHTML(markup);

// ── Icons ────────────────────────────────────────────────────────────────────

export const CopyContentIcon = (kind, size = 19) => {
  const isText = kind === 'text';
  const common =
    `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  if (!isText) {
    return svgOf(
      `<svg ${common}>` +
        '<path d="M6 5V4.5A2.5 2.5 0 018.5 2H19a3 3 0 013 3v10.5a2.5 2.5 0 01-2.5 2.5H19" opacity="0.65" />' +
        '<rect x="2" y="6" width="17" height="16" rx="2.5" stroke-width="2.2" />' +
        '<circle cx="6.5" cy="10.5" r="1.25" />' +
        '<path d="M3.5 19l4.2-4.4 3.1 3.1 2.4-2.5 4.3 4.2" stroke-width="2.2" />' +
        '</svg>',
    );
  }
  return svgOf(
    `<svg ${common}>` +
      '<path d="M2.5 3.5h13" stroke-width="2.7" />' +
      '<path d="M9 3.5v14" stroke-width="2.7" />' +
      '<path d="M19 15.25V14.2A1.2 1.2 0 0017.8 13h-3.6a1.2 1.2 0 00-1.2 1.2v3.6a1.2 1.2 0 001.2 1.2h1.05" stroke-width="1.6" />' +
      '<rect x="15.25" y="15.25" width="6.25" height="6.25" rx="1.15" stroke-width="1.6" />' +
      '</svg>',
  );
};

const CopiedIcon = (size = 15) =>
  svgOf(
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
      '<path d="M5 12l4 4L19 6" /></svg>',
  );

const actionIcon = (kind) => {
  if (kind === 'text') return CopyContentIcon('text');
  if (kind === 'image') return CopyContentIcon('image');
  if (kind === 'download') {
    return svgOf(
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />' +
        '<path d="M7 10l5 5 5-5M12 15V3" /></svg>',
    );
  }
  if (kind === 'delete') {
    return svgOf(
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />' +
        '<path d="M10 11v5M14 11v5" /></svg>',
    );
  }
  if (kind === 'extend') {
    return svgOf(
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M5 12h14M12 5l7 7-7 7" /></svg>',
    );
  }
  if (kind === 'remix') {
    return svgOf(
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M17 2l4 4-4 4" />' +
        '<path d="M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4" />' +
        '<path d="M21 13v2a3 3 0 01-3 3H3" /></svg>',
    );
  }
  if (kind === 'copy') {
    return svgOf(
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<rect x="9" y="9" width="11" height="11" rx="2" />' +
        '<path d="M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3" /></svg>',
    );
  }
  return svgOf(
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<circle cx="12" cy="12" r="9" />' +
      '<path d="M12 8v4l3 2" /></svg>',
  );
};

// ── GenerationCopyButtons (md+ overlay row) ─────────────────────────────────

export class GenerationCopyButtons extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    prompt: { attribute: false },
    imageUrl: { attribute: false },
    onCopyError: { attribute: false },
    copiedKind: { state: true },
  };

  // display:contents so the buttons are direct flex items of the card's
  // overlay (flex-col gap-2), exactly like the React fragment.
  static styles = [
    css`
      :host {
        display: contents;
      }
    `,
  ];

  constructor() {
    super();
    this.prompt = null;
    this.imageUrl = null;
    this.onCopyError = null;
    this.copiedKind = null;
    this._copiedTimer = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._copiedTimer) clearTimeout(this._copiedTimer);
  }

  async runCopy(event, kind) {
    event.stopPropagation();

    try {
      if (kind === 'text') {
        await copyPrompt(this.prompt);
      } else {
        await copyImage(this.imageUrl);
      }

      this.copiedKind = kind;
      window.setTimeout(() => {
        if (this.copiedKind === kind) this.copiedKind = null;
      }, 1600);
    } catch (error) {
      const contentLabel = kind === 'text' ? 'the prompt' : 'the image';
      console.error(`Failed to copy ${contentLabel}:`, error);
      this.onCopyError?.(
        kind === 'text'
          ? 'Could not copy the prompt to the clipboard.'
          : 'Could not copy the image. Image copy requires HTTPS or localhost.',
      );
    }
  }

  render() {
    const copyButton = (kind) => html`
      <button
        type="button"
        title=${this.copiedKind === kind ? `${kind[0].toUpperCase() + kind.slice(1)} copied` : `Copy ${kind}`}
        aria-label=${this.copiedKind === kind ? `${kind[0].toUpperCase() + kind.slice(1)} copied` : `Copy ${kind}`}
        @click=${(e) => this.runCopy(e, kind)}
        class="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 backdrop-blur-md transition-all hover:bg-[#22d3ee] hover:text-black ${
          this.copiedKind === kind ? 'text-[#22d3ee]' : 'text-white'
        }"
      >
        ${this.copiedKind === kind
          ? CopiedIcon()
          : CopyContentIcon(kind, 17)}
      </button>
    `;
    return html`
      ${this.prompt ? copyButton('text') : nothing}
      ${this.imageUrl ? copyButton('image') : nothing}
    `;
  }
}

customElements.define('generation-copy-buttons', GenerationCopyButtons);

// ── MobileGenerationActions (mobile < md card menu) ─────────────────────────┤

export class MobileGenerationActions extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    actions: { attribute: false },
    prompt: { attribute: false },
    imageUrl: { attribute: false },
    onCopyError: { attribute: false },
    open: { state: true },
  };

  static styles = [
    css`
      :host {
        display: block;
        position: absolute;
        right: 0.5rem;
        top: 0.5rem;
        z-index: 40;
      }
      @media (min-width: 768px) {
        :host {
          display: none;
        }
      }
    `,
  ];

  constructor() {
    super();
    this.actions = [];
    this.prompt = null;
    this.imageUrl = null;
    this.onCopyError = null;
    this.open = false;
  }

  firstUpdated() {
    // React root div had onClick={stopCardClick}.
    this.addEventListener('click', (e) => e.stopPropagation());
  }

  get availableActions() {
    const copyActions = [
      this.prompt
        ? {
            kind: 'text',
            label: 'Copy prompt',
            onSelect: async () => {
              try {
                await copyPrompt(this.prompt);
              } catch (error) {
                console.error('Failed to copy the prompt:', error);
                this.onCopyError?.(
                  'Could not copy the prompt to the clipboard.',
                );
              }
            },
          }
        : null,
      this.imageUrl
        ? {
            kind: 'image',
            label: 'Copy image',
            onSelect: async () => {
              try {
                await copyImage(this.imageUrl);
              } catch (error) {
                console.error('Failed to copy the image:', error);
                this.onCopyError?.(
                  'Could not copy the image. Image copy requires HTTPS or localhost.',
                );
              }
            },
          }
        : null,
    ];
    return [...copyActions, ...this.actions].filter(Boolean);
  }

  stopCardClick(event) {
    event.stopPropagation();
  }

  runAction(event, action) {
    event.stopPropagation();
    this.open = false;
    action.onSelect?.();
  }

  render() {
    const available = this.availableActions;
    // md:hidden equivalent lives in :host CSS; the null-return parity is
    // preserved (no children at all).
    if (available.length === 0) return nothing;

    return html`
      ${this.open
        ? html`
            <button
              type="button"
              aria-label="Close actions"
              class="fixed inset-0 z-40 cursor-default bg-transparent"
              @click=${(event) => {
                event.stopPropagation();
                this.open = false;
              }}
            ></button>
          `
        : nothing}

      <button
        type="button"
        aria-label="Generation actions"
        ?aria-expanded=${this.open}
        @click=${(event) => {
          event.stopPropagation();
          this.open = !this.open;
        }}
        class="relative z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white shadow-lg backdrop-blur-md active:scale-95"
      >
        ${svgOf(
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>',
        )}
      </button>

      ${this.open
        ? html`
            <div
              class="absolute right-0 top-12 z-50 min-w-[178px] overflow-hidden rounded-xl border border-white/15 bg-[#151515]/95 p-1.5 shadow-2xl backdrop-blur-xl"
            >
              ${available.map(
                (action) => html`
                  <button
                    type="button"
                    @click=${(event) => this.runAction(event, action)}
                    class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition-colors ${
                      action.danger
                        ? 'text-red-400 hover:bg-red-500/15 active:bg-red-500/20'
                        : 'text-white hover:bg-white/10 active:bg-white/15'
                    }"
                  >
                    <span class="flex h-6 w-6 items-center justify-center">
                      ${actionIcon(action.kind)}
                    </span>
                    <span>${action.label}</span>
                  </button>
                `,
              )}
            </div>
          `
        : nothing}
    `;
  }
}

customElements.define('mobile-generation-actions', MobileGenerationActions);
