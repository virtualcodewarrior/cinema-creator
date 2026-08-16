import { LitElement } from 'lit';

// Per-package Tailwind-generated utility sheets live in /public/wc/<key>.css.
// Each shadow root adopts its package sheet via adoptedStyleSheets so utility
// classes keep working inside encapsulated styles.
export const SHEET_KEYS = ['shell', 'studio', 'workflow', 'agents', 'design'];
const loaded = new Map(); // key -> CSSStyleSheet
const pending = new Map(); // key -> Promise<CSSStyleSheet>

function sheetUrl(key) {
  return new URL('wc/' + key + '.css', document.baseURI).href;
}

export function loadWcSheet(key) {
  if (loaded.has(key)) return Promise.resolve(loaded.get(key));
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    const res = await fetch(sheetUrl(key));
    if (!res.ok) throw new Error('wc sheet ' + key + ' -> ' + res.status);
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await res.text());
    loaded.set(key, sheet);
    pending.delete(key);
    return sheet;
  })();
  pending.set(key, p);
  return p;
}

export function loadWcCss(keys = SHEET_KEYS) {
  return Promise.all(keys.map((k) => loadWcSheet(k).catch((e) => console.warn('[wc]', e))));
}

function applySheet(root, key) {
  const ready = loaded.get(key);
  if (ready) {
    root.adoptedStyleSheets = [...(root.adoptedStyleSheets || []), ready];
    return;
  }
  loadWcSheet(key)
    .then((sheet) => {
      root.adoptedStyleSheets = [...(root.adoptedStyleSheets || []), sheet];
    })
    .catch(() => {});
}

export class BaseElement extends LitElement {
  // Subclasses set: static sheetKey = 'studio' | 'workflow' | ...
  static sheetKey = null;

  createRenderRoot() {
    const root = super.createRenderRoot();
    const key = this.constructor.sheetKey;
    if (key) applySheet(root, key);
    return root;
  }
}
