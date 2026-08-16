// Port of the PremiumAudioPlayer inner component from
// packages/studio/src/components/AudioStudio.jsx. Heavy state (audio element
// refs, 100ms visualizer interval, scrubbing) -> standalone element.
import { html, css } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';

const svg = (markup) => unsafeHTML(markup);

const PlayIcon = svg(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>',
);
const PauseIcon = svg(
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>',
);
const VolumeIcon = svg(
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />' +
    '<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />' +
    '<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />' +
    '</svg>',
);
const VolumeMuteIcon = svg(
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />' +
    '<line x1="23" y1="9" x2="17" y2="15" />' +
    '<line x1="17" y1="9" x2="23" y2="15" />' +
    '</svg>',
);
const musicIcon = (className) =>
  svg(
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' +
      (className || '') +
      '"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>',
  );
const DownloadIcon = svg(
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />' +
    '</svg>',
);

export class PremiumAudioPlayer extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    url: { type: String },
    title: { type: String },
    isPlaying: { state: true },
    currentTime: { state: true },
    duration: { state: true },
    volume: { state: true },
    isMuted: { state: true },
    visualizerHeights: { state: true },
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
    this.url = '';
    this.title = '';
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.volume = 1;
    this.isMuted = false;
    this.visualizerHeights = Array(18).fill(15);
    this._vizTimer = null;
    this._lastUrl = null;
  }

  get _audioEl() {
    return this.renderRoot.querySelector('audio');
  }

  updated(changed) {
    // Reset player when URL changes (matches the React effect on [url]).
    if (changed.has('url') && this.url !== this._lastUrl) {
      this._lastUrl = this.url;
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 0;
      if (this._audioEl) this._audioEl.load();
    }
    if (changed.has('isPlaying')) {
      if (this.isPlaying) {
        this._vizTimer = setInterval(() => {
          this.visualizerHeights = Array(18)
            .fill(0)
            .map(() => Math.floor(Math.random() * 32) + 6);
        }, 100);
      } else {
        if (this._vizTimer) clearInterval(this._vizTimer);
        this._vizTimer = null;
        this.visualizerHeights = Array(18).fill(12);
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._vizTimer) clearInterval(this._vizTimer);
    this._vizTimer = null;
  }

  onTimeUpdate() {
    if (this._audioEl) this.currentTime = this._audioEl.currentTime;
  }

  onLoadedMetadata() {
    if (this._audioEl) this.duration = this._audioEl.duration;
  }

  onAudioEnded() {
    this.isPlaying = false;
    this.currentTime = 0;
  }

  togglePlay() {
    if (!this._audioEl) return;
    if (this.isPlaying) {
      this._audioEl.pause();
      this.isPlaying = false;
    } else {
      this._audioEl
        .play()
        .then(() => {
          this.isPlaying = true;
        })
        .catch((err) => {
          console.error('Audio playback error:', err);
        });
    }
  }

  handleVolumeChange(e) {
    const val = parseFloat(e.target.value);
    this.volume = val;
    if (this._audioEl) this._audioEl.volume = val;
    this.isMuted = val === 0;
  }

  toggleMute() {
    if (!this._audioEl) return;
    if (this.isMuted) {
      this._audioEl.volume = this.volume;
      this.isMuted = false;
    } else {
      this._audioEl.volume = 0;
      this.isMuted = true;
    }
  }

  handleScrub(e) {
    if (!this._audioEl || this.duration === 0) return;
    const bar = this.renderRoot.querySelector('.progress-bar');
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const seekTime = Math.min(Math.max(pos * this.duration, 0), this.duration);
    this._audioEl.currentTime = seekTime;
    this.currentTime = seekTime;
  }

  formatTime(time) {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

  async downloadAudio() {
    try {
      const response = await fetch(this.url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = this.title
        ? `${this.title.replace(/\s+/g, '_')}.mp3`
        : 'generated_audio.mp3';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(this.url, '_blank');
    }
  }

  render() {
    const pct = (this.currentTime / (this.duration || 1)) * 100;
    return html`
      <div
        class="w-full bg-zinc-900 border border-zinc-700/80 rounded p-6 shadow-3xl space-y-6 backdrop-blur-md"
      >
        <audio
          src="${this.url}"
          @timeupdate=${this.onTimeUpdate}
          @loadedmetadata=${this.onLoadedMetadata}
          @ended=${this.onAudioEnded}
          preload="auto"
        ></audio>

        <div
          class="flex flex-col items-center justify-center py-6 relative rounded bg-black/60 overflow-hidden border border-zinc-800"
        >
          <div class="flex items-center gap-1.5 h-12 mb-4 justify-center">
            ${this.visualizerHeights.map(
              (h, i) => html`
                <div
                  class="w-1.5 rounded-full bg-gradient-to-t from-primary to-[#a855f7] transition-all duration-100"
                  style="height: ${h}px"
                ></div>
              `,
            )}
          </div>
          <div class="text-center px-4 max-w-full relative z-10">
            <span
              class="text-xs font-black text-primary uppercase tracking-[0.2em] block mb-1"
              >Now Playing</span
            >
            <p class="text-white font-bold text-base truncate max-w-xs"
              >${this.title || 'Generated Track'}</p
            >
          </div>
        </div>

        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-xs font-bold text-zinc-200 w-10 text-right"
              >${this.formatTime(this.currentTime)}</span
            >

            <div
              class="progress-bar flex-1 h-2 bg-zinc-700 hover:bg-zinc-650 rounded-full cursor-pointer relative group transition-colors"
              @click=${this.handleScrub}
            >
              <div
                class="absolute left-0 top-0 bottom-0 bg-primary rounded-full group-hover:bg-primary/95 transition-all"
                style="width: ${pct}%"
              ></div>
              <div
                class="absolute w-3.5 h-3.5 bg-white rounded-full -top-[3px] shadow-glow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style="left: calc(${pct}% - 7px)"
              ></div>
            </div>

            <span class="text-xs font-bold text-zinc-200 w-10 text-left"
              >${this.formatTime(this.duration)}</span
            >
          </div>

          <div class="flex items-center justify-between pt-2">
            <div class="flex items-center gap-2 group/volume w-24">
              <button
                @click=${this.toggleMute}
                class="p-2 bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-700 rounded text-zinc-200 hover:text-white transition-all"
                title="Mute/Unmute"
                type="button"
              >
                ${this.isMuted ? VolumeMuteIcon : VolumeIcon}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value=${this.isMuted ? 0 : this.volume}
                @input=${this.handleVolumeChange}
                class="w-16 h-1 bg-zinc-700 rounded appearance-none cursor-pointer accent-primary hover:bg-zinc-600 transition-all opacity-0 group-hover/volume:opacity-100"
              />
            </div>

            <button
              @click=${this.togglePlay}
              class="w-12 h-12 bg-primary hover:bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-glow"
              title=${this.isPlaying ? 'Pause' : 'Play'}
              type="button"
            >
              ${this.isPlaying ? PauseIcon : PlayIcon}
            </button>

            <button
              @click=${this.downloadAudio}
              class="px-4 py-2 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded text-xs font-bold text-white flex items-center gap-2 hover:border-primary/45 transition-all"
              title="Download Audio"
              type="button"
            >
              ${DownloadIcon}
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('premium-audio-player', PremiumAudioPlayer);
