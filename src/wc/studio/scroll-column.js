// Port of the ScrollColumn sub-component from
// packages/studio/src/components/CinemaStudio.jsx — a grab-to-scroll option
// column that selects the item nearest the center highlight band. Emits a
// composed 'change' CustomEvent (detail = item value, a number for the
// focal column) when the nearest item changes.
import { html, css, nothing } from 'lit';
import { BaseElement } from '../../lib/wc-base.js';

const ASSET_URLS = {
  'Modular 8K Digital': '/assets/cinema/modular_8k_digital.webp',
  'Full-Frame Cine Digital': '/assets/cinema/full_frame_cine_digital.webp',
  'Grand Format 70mm Film': '/assets/cinema/grand_format_70mm_film.webp',
  'Studio Digital S35': '/assets/cinema/studio_digital_s35.webp',
  'Classic 16mm Film': '/assets/cinema/classic_16mm_film.webp',
  'Premium Large Format Digital':
    '/assets/cinema/premium_large_format_digital.webp',
  'Creative Tilt Lens': '/assets/cinema/creative_tilt_lens.webp',
  'Compact Anamorphic': '/assets/cinema/compact_anamorphic.webp',
  'Extreme Macro': '/assets/cinema/extreme_macro.webp',
  '70s Cinema Prime': '/assets/cinema/70s_cinema_prime.webp',
  'Classic Anamorphic': '/assets/cinema/classic_anamorphic.webp',
  'Premium Modern Prime': '/assets/cinema/premium_modern_prime.webp',
  'Warm Cinema Prime': '/assets/cinema/warm_cinema_prime.webp',
  'Swirl Bokeh Portrait': '/assets/cinema/swirl_bokeh_portrait.webp',
  'Vintage Prime': '/assets/cinema/vintage_prime.webp',
  'Halation Diffusion': '/assets/cinema/halation_diffusion.webp',
  'Clinical Sharp Prime': '/assets/cinema/clinical_sharp_prime.webp',
  'f/1.4': '/assets/cinema/f_1_4.webp',
  'f/4': '/assets/cinema/f_4.webp',
  'f/11': '/assets/cinema/f_11.webp',
};

export class ScrollColumn extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    title: { type: String },
    items: { attribute: false },
    columnKey: { type: String },
    value: { attribute: false },
  };

  static styles = [
    css`
      :host {
        display: block;
      }
    `,
  ];

  constructor() {
    super();
    this.title = '';
    this.items = [];
    this.columnKey = 'camera';
    this.value = null;
    this._dragging = false;
    this._startY = 0;
    this._scrollTopStart = 0;
    this._initialTimer = null;
    this._syncTimer = null;
    this._scrollListener = null;
  }

  _list() {
    return this.renderRoot?.querySelector('[role="listbox"]');
  }

  firstUpdated() {
    const list = this._list();
    if (!list) return;
    // Original: one-shot 100 ms centering of the current value on mount.
    this._initialTimer = setTimeout(() => {
      const target = Array.from(list.children).find(
        (child) => child.dataset.value === String(this.value),
      );
      target?.scrollIntoView({ block: 'center' });
    }, 100);
    // Original: scroll listener + a 150 ms initial sync pass.
    this._scrollListener = () => this._syncFromScroll();
    list.addEventListener('scroll', this._scrollListener);
    this._syncTimer = setTimeout(() => this._syncFromScroll(), 150);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._initialTimer) clearTimeout(this._initialTimer);
    if (this._syncTimer) clearTimeout(this._syncTimer);
    const list = this._list();
    if (list && this._scrollListener)
      list.removeEventListener('scroll', this._scrollListener);
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, composed: true }));
  }

  _syncFromScroll() {
    const list = this._list();
    if (!list) return;

    const centerY = list.scrollTop + list.clientHeight / 2;
    const children = Array.from(list.children).filter(
      (child) => child.dataset.value,
    );
    let closest = null;
    let minimumDistance = Infinity;

    children.forEach((child) => {
      const childCenter = child.offsetTop + child.offsetHeight / 2;
      const distance = Math.abs(centerY - childCenter);
      if (distance < minimumDistance) {
        minimumDistance = distance;
        closest = child;
      }
    });

    children.forEach((child) => {
      const selected = child === closest;
      child.dataset.selected = String(selected);
      child.setAttribute('aria-selected', String(selected));
    });

    if (closest) {
      const nextValue =
        this.columnKey === 'focal'
          ? parseInt(closest.dataset.value, 10)
          : closest.dataset.value;
      if (String(nextValue) !== String(this.value))
        this._emit('change', nextValue);
    }
  }

  _handleMouseDown(event) {
    const list = this._list();
    if (!list) return;

    this._dragging = true;
    list.classList.add('cursor-grabbing');
    list.classList.remove('snap-y');
    this._startY = event.pageY - list.offsetTop;
    this._scrollTopStart = list.scrollTop;
    event.preventDefault();
  }

  _stopDragging() {
    this._dragging = false;
    const list = this._list();
    if (!list) return;
    list.classList.remove('cursor-grabbing');
    list.classList.add('snap-y');
  }

  _handleMouseMove(event) {
    const list = this._list();
    if (!this._dragging || !list) return;

    event.preventDefault();
    const y = event.pageY - list.offsetTop;
    list.scrollTop = this._scrollTopStart - (y - this._startY) * 1.5;
  }

  _handleItemClick(item) {
    const list = this._list();
    if (!list) return;

    const target = Array.from(list.children).find(
      (child) => child.dataset.value === String(item),
    );
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  render() {
    return html`
      <section
        class="flex w-[170px] shrink-0 snap-center flex-col md:w-[190px]"
      >
        <div class="mb-3 flex items-center justify-between px-1">
          <h3 class="text-xs font-semibold text-white/75">${this.title}</h3>
          <span
            class="h-1.5 w-1.5 rounded-full bg-gradient-to-b from-[#22d3ee] to-[#a855f7] shadow-[0_0_6px_rgba(34,211,238,0.5)]"
          ></span>
        </div>

        <div
          class="relative h-[320px] overflow-hidden rounded-2xl border border-white/[0.06] bg-[#030303] shadow-inner"
        >
          <div
            class="pointer-events-none absolute inset-x-2 top-1/2 z-0 h-[82px] -translate-y-1/2 rounded-xl border border-[#22d3ee]/20 bg-gradient-to-r from-[#22d3ee]/15 to-purple-500/10 shadow-[0_0_15px_rgba(34,211,238,0.1)]"
          ></div>
          <div
            class="pointer-events-none absolute inset-x-0 top-0 z-20 h-20 bg-gradient-to-b from-[#030303] via-[#030303]/85 to-transparent"
          ></div>
          <div
            class="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-20 bg-gradient-to-t from-[#030303] via-[#030303]/85 to-transparent"
          ></div>

          <div
            role="listbox"
            aria-label=${this.title}
            class="relative z-10 h-full cursor-grab snap-y snap-mandatory overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            @mousedown=${this._handleMouseDown}
            @mouseleave=${this._stopDragging}
            @mouseup=${this._stopDragging}
            @mousemove=${this._handleMouseMove}
          >
            <div aria-hidden="true" style="height: calc(50% - 41px)"></div>
            ${this.items.map((item) => {
              const imageUrl = ASSET_URLS[item];
              const selected = String(item) === String(this.value);
              return html`
                <button
                  type="button"
                  role="option"
                  aria-selected=${String(selected)}
                  data-value=${String(item)}
                  data-selected=${String(selected)}
                  @click=${() => this._handleItemClick(item)}
                  class="group flex h-[82px] w-full snap-center select-none items-center justify-center gap-2.5 px-4 text-left opacity-30 transition-all duration-200 data-[selected=true]:opacity-100"
                >
                  <span
                    class="flex shrink-0 items-center justify-center font-semibold transition-colors ${imageUrl
                      ? 'h-10 w-10'
                      : 'text-base text-white/55 group-data-[selected=true]:text-[#22d3ee]'}"
                  >
                    ${imageUrl
                      ? html`
                          <img
                            src=${imageUrl}
                            alt=""
                            class="h-full w-full object-contain"
                          />
                        `
                      : html`${item}${this.columnKey === 'focal' ? 'mm' : ''}`}
                  </span>
                  ${this.columnKey !== 'focal'
                    ? html`
                        <span
                          class="line-clamp-2 min-w-0 text-[10px] font-medium leading-snug text-white/60 transition-colors group-data-[selected=true]:text-white"
                          >${item}</span
                        >
                      `
                    : nothing}
                </button>
              `;
            })}
            <div aria-hidden="true" style="height: calc(50% - 41px)"></div>
          </div>
        </div>
      </section>
    `;
  }
}

customElements.define('scroll-column', ScrollColumn);
