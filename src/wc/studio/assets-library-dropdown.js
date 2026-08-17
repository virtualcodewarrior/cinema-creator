// Port of the AssetsDropdown sub-component from
// packages/studio/src/components/RecastStudio.jsx — the tabbed
// (videos / images / results) asset-library popover. The element owns the
// active tab; hosts react via composed events:
//   'select'  detail { tab, url, name }   (row or "Use" click — the Use
//             button is a visual no-op in the original too, selection is the
//             row's bubbling click)
//   'delete'  detail { tab, url }
//   'preview' detail url                  (enlarge-overlay click; the
//             original stops propagation so the library stays open under the
//             fullscreen modal)
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import {
  PromptPopover,
  promptPopoverHeader,
} from './prompt-composer.js';

const svgOf = (markup) => unsafeHTML(markup);

const EnlargeIcon = svgOf(
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<circle cx="11" cy="11" r="8" />' +
    '<line x1="21" y1="21" x2="16.65" y2="16.65" />' +
    '<line x1="11" y1="8" x2="11" y2="14" />' +
    '<line x1="8" y1="11" x2="14" y2="11" />' +
    '</svg>',
);

const AssetTrashIcon = svgOf(
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<polyline points="3 6 5 6 21 6" />' +
    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />' +
    '</svg>',
);

export class AssetsLibraryDropdown extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    videos: { attribute: false },
    images: { attribute: false },
    results: { attribute: false },
    tab: { state: true },
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
    this.videos = [];
    this.images = [];
    this.results = [];
    this.tab = 'videos';
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, composed: true }));
  }

  // React remounts the dropdown on every open (fresh activeTab="videos");
  // the element instance survives close/open here, so the host resets the
  // tab after each open.
  resetTab() {
    this.tab = 'videos';
  }

  render() {
    const items =
      this.tab === 'videos'
        ? this.videos
        : this.tab === 'images'
          ? this.images
          : this.results;
    return html`
      <prompt-popover
        .className=${'w-80 max-h-80 overflow-hidden flex flex-col gap-2'}
        @click=${(e) => e.stopPropagation()}
      >
        ${promptPopoverHeader('Asset Library', 'mb-0')}
        <!-- Tabs -->
        <div class="flex border-b border-white/5 pb-1">
          ${['videos', 'images', 'results'].map(
            (t) => html`
              <button
                type="button"
                @click=${() => (this.tab = t)}
                class="flex-1 text-center py-1 text-xs font-bold capitalize transition-colors ${
                  this.tab === t
                    ? 'text-[#22d3ee] border-b border-[#22d3ee]'
                    : 'text-white/40 hover:text-white/80'
                }"
              >
                ${t}
              </button>
            `,
          )}
        </div>

        <!-- Items list -->
        <div
          class="overflow-y-auto custom-scrollbar flex-1 flex flex-col gap-1.5 min-h-[180px] max-h-60"
        >
          ${items.length === 0
            ? html`
                <div
                  class="flex flex-col items-center justify-center flex-1 py-10 text-xs text-white/20"
                >
                  No assets found
                </div>
              `
            : items.map(
                (item) => html`
                  <div
                    @click=${() =>
                      this._emit('select', {
                        tab: this.tab,
                        url: item.url,
                        name: item.name,
                      })}
                    class="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/5 hover:border-white/10 transition-all gap-2 group/item cursor-pointer"
                  >
                    <!-- Media Preview Thumbnail -->
                    <div
                      class="w-10 h-10 rounded-lg overflow-hidden bg-white/5 flex-shrink-0 relative"
                    >
                      ${this.tab === 'images'
                        ? html`
                            <img
                              src=${item.url}
                              alt=""
                              class="w-full h-full object-cover"
                            />
                          `
                        : html`
                            <video
                              src=${item.url}
                              class="w-full h-full object-cover"
                              muted
                              playsinline
                              loop
                            ></video>
                          `}
                      <!-- Enlarge preview overlay -->
                      <button
                        type="button"
                        title="Enlarge preview"
                        @click=${(e) => {
                          e.stopPropagation();
                          this._emit('preview', item.url);
                        }}
                        class="absolute inset-0 bg-black/60 opacity-0 group-hover/item:opacity-100 flex items-center justify-center transition-opacity text-white hover:text-[#22d3ee]"
                      >
                        ${EnlargeIcon}
                      </button>
                    </div>

                    <!-- Info -->
                    <div class="flex-1 min-w-0 flex flex-col">
                      <span
                        class="text-xs text-white/95 font-semibold truncate"
                        title=${item.name}
                        >${item.name}</span
                      >
                      <span class="text-[9px] text-white/30 truncate mt-0.5"
                        >${new Date(item.timestamp || Date.now()).toLocaleDateString()}</span
                      >
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        class="text-xs text-black font-black px-2.5 py-1 bg-[#22d3ee] rounded-md hover:bg-[#22d3ee]/90 transition-colors"
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        title="Delete from Library"
                        @click=${(e) => {
                          e.stopPropagation();
                          this._emit('delete', { tab: this.tab, url: item.url });
                        }}
                        class="p-1.5 text-white/30 hover:text-red-500 rounded hover:bg-white/5 transition-colors"
                      >
                        ${AssetTrashIcon}
                      </button>
                    </div>
                  </div>
                `,
              )}
        </div>
      </prompt-popover>
    `;
  }
}

customElements.define('assets-library-dropdown', AssetsLibraryDropdown);
