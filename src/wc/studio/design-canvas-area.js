// Port of packages/Open-AI-Design-Agent/packages/design-agent/src/CanvasArea.jsx.
// react-konva → plain Konva: nodes are diffed imperatively against the four
// item arrays (images/videos/audios/texts) plus task loaders, mirroring how
// react-konva reconciles per-render. The ref API (addImage/addVideo/addAudio/
// getCanvasState/moveNode/placeNextToSource/replaceAt/arrangeNodes/
// zoomIn/zoomOut/resetZoom) is exposed unchanged as class methods.
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import Konva from 'konva';
import { BaseElement } from '../../lib/wc-base.js';
import toast from '../../lib/toast.js';

const GUIDELINE_OFFSET = 5; // scaled by 1/zoom in getLineGuide

export class DesignCanvasArea extends BaseElement {
  static sheetKey = 'design';

  static properties = {
    theme: { state: true, attribute: false },
    activeTasks: { state: true, attribute: false },
    images: { state: true, attribute: false },
    videos: { state: true, attribute: false },
    audios: { state: true, attribute: false },
    texts: { state: true, attribute: false },
    selectedId: { state: true, attribute: false },
    canvasSize: { state: true, attribute: false },
    zoom: { state: true, attribute: false },
    editingTextId: { state: true, attribute: false },
    contextMenu: { state: true, attribute: false },
  };

  static styles = css`
    :host {
      display: block;
    }
    .konva-host {
      position: absolute;
      inset: 0;
    }
  `;

  constructor() {
    super();
    this.theme = 'dark';
    this.activeTasks = [];
    this.images = [];
    this.videos = [];
    this.audios = [];
    this.texts = [];
    this.selectedId = null;
    this.canvasSize = { width: 800, height: 600 };
    this.zoom = 1;
    this.editingTextId = null;
    this.contextMenu = null;
    this._clipboard = null;

    // Parent callbacks (CreativeCanvas owns these pieces of state).
    this.setActiveTasks = () => {};
    this.onZoomChange = null;

    this._stage = null;
    this._layer = null;
    this._tr = null;
    this._nodes = new Map(); // id -> Konva node
    this._media = new Map(); // url -> media element cache
    this._anims = new Map(); // id -> Konva.Animation (video redraw / loader spin)
    this._guides = []; // active guide Lines
    this._labelGroup = null;
    this._labelFor = null;
    this._audioMeta = new Map(); // audio item id -> { card, label, prog, icon, audio, playing }
    this._ro = null;
    this._connected = false;
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this._connected) {
      this._connected = true;
      window.addEventListener('keydown', this._onKey);
      window.addEventListener('paste', this._onPaste);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._connected) {
      this._connected = false;
      window.removeEventListener('keydown', this._onKey);
      window.removeEventListener('paste', this._onPaste);
    }
    if (this._ro) this._ro.disconnect();
    this._anims.forEach((a) => a.stop());
    this._anims.clear();
    if (this._videoAnim) {
      this._videoAnim.stop();
      this._videoAnim = null;
    }
    if (this._stage) {
      this._stage.destroy();
    }
    this._stage = null;
    this._layer = null;
    this._tr = null;
    this._nodes.clear();
    this._media.clear();
    this._guides = [];
    this._labelGroup = null;
    this._labelFor = null;
    this._audioMeta.clear();
  }

  firstUpdated() {
    const host = this.renderRoot.querySelector('.konva-host');
    this._setupStage(host);
    this._ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) this.canvasSize = { width, height };
      }
    });
    this._ro.observe(host);
    this._sync();
  }

  updated(changed) {
    if (!this._stage) return;
    if (changed.has('canvasSize')) {
      this._stage.size(this.canvasSize);
    }
    if (
      changed.has('images') ||
      changed.has('videos') ||
      changed.has('audios') ||
      changed.has('texts') ||
      changed.has('activeTasks') ||
      changed.has('theme')
    ) {
      this._syncTasks();
      this._sync();
    }
    if (changed.has('selectedId') || changed.has('zoom')) this._refreshSelection();
    if (changed.has('contextMenu') && this.contextMenu) {
      const menu = this.renderRoot.querySelector('.ctx-menu');
      if (menu) {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth)
          menu.style.marginLeft = `-${rect.right - window.innerWidth + 10}px`;
        if (rect.bottom > window.innerHeight)
          menu.style.marginTop = `-${rect.bottom - window.innerHeight + 10}px`;
      }
    }
    if (changed.has('editingTextId') && this.editingTextId) {
      requestAnimationFrame(() => {
        const ta = this.renderRoot.querySelector('textarea');
        if (ta) ta.focus();
      });
    }
  }

  // ─── Stage scaffold ───────────────────────────────────────────────────────

  _setupStage(containerEl) {
    this._stage = new Konva.Stage({
      container: containerEl,
      width: this.canvasSize.width,
      height: this.canvasSize.height,
      scaleX: this.zoom,
      scaleY: this.zoom,
      draggable: true,
    });
    this._layer = new Konva.Layer();
    this._stage.add(this._layer);
    this._layer.add(
      new Konva.Rect({
        width: 10000,
        height: 10000,
        x: -5000,
        y: -5000,
        fill: '#ffffff03',
        listening: false,
      }),
    );
    this._tr = new Konva.Transformer();
    this._layer.add(this._tr);

    this._stage.on('mousedown', (e) => {
      if (e.evt.button === 2) return;
      if (e.target === e.target.getStage()) this.selectedId = null;
      this.contextMenu = null;
    });

    const containerRoot = this.renderRoot.querySelector('.canvas-container');
    this._stage.on('dragmove', (e) => {
      if (e.target === this._stage && containerRoot) {
        containerRoot.style.backgroundPosition = `${e.target.x()}px ${e.target.y()}px`;
      }
    });

    this._stage.on('wheel', (e) => this._handleWheel(e));

    containerEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const stage = this._stage;
      const pointer = stage.getPointerPosition();
      const hit = (pointer && stage.getIntersection(pointer)) || stage;
      const id = hit === stage ? '' : hit.id();
      this.contextMenu = {
        type: hit === stage ? 'canvas' : 'node',
        nodeId: id,
        x: e.clientX,
        y: e.clientY,
        stagePos: pointer
          ? { x: pointer.x, y: pointer.y }
          : null,
      };
      if (id) this.selectedId = id;
    });
  }

  updateZoom(newZoom, pos = null) {
    if (!newZoom || isNaN(newZoom)) return;
    this.zoom = newZoom;
    if (this.onZoomChange) this.onZoomChange(Math.round(newZoom * 100));
    const stage = this._stage;
    if (stage && typeof stage.scale === 'function') {
      stage.scale({ x: newZoom, y: newZoom });
      if (pos && typeof stage.position === 'function') stage.position(pos);
      if (typeof stage.batchDraw === 'function') stage.batchDraw();
    }
    const c = this.renderRoot.querySelector('.canvas-container');
    if (c) {
      c.style.backgroundSize = `${32 * newZoom}px ${32 * newZoom}px`;
      if (pos) c.style.backgroundPosition = `${pos.x}px ${pos.y}px`;
    }
  }

  _handleWheel(e) {
    e.evt.preventDefault();
    const stage = this._stage;
    if (!stage) return;
    const scaleBy = 1.05;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const boundedScale = Math.max(0.1, Math.min(5, newScale));
    this.updateZoom(boundedScale, {
      x: pointer.x - mousePointTo.x * boundedScale,
      y: pointer.y - mousePointTo.y * boundedScale,
    });
    this.contextMenu = null;
  }

  handleZoomToFit() {
    if (
      this.images.length === 0 &&
      this.videos.length === 0 &&
      this.texts.length === 0 &&
      this.audios.length === 0
    ) {
      this.updateZoom(1, { x: 0, y: 0 });
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const checkItem = (item) => {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + (item.width || 150));
      maxY = Math.max(maxY, item.y + (item.height || 50));
    };
    this.images.forEach(checkItem);
    this.videos.forEach(checkItem);
    this.audios.forEach(checkItem);
    this.texts.forEach(checkItem);
    const padding = 60;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    if (contentWidth <= 0 || contentHeight <= 0) {
      this.updateZoom(1, { x: 0, y: 0 });
      return;
    }
    const scaleX = (this.canvasSize.width - padding * 2) / contentWidth;
    const scaleY = (this.canvasSize.height - padding * 2) / contentHeight;
    const newZoom = Math.min(5, Math.max(0.1, Math.min(scaleX, scaleY)));
    const newPos = {
      x: this.canvasSize.width / 2 - (minX + contentWidth / 2) * newZoom,
      y: this.canvasSize.height / 2 - (minY + contentHeight / 2) * newZoom,
    };
    this.updateZoom(newZoom, newPos);
  }

  // ─── Node sync (diff items + tasks against the layer) ────────────────────

  _allItems() {
    return [...this.images, ...this.videos, ...this.audios, ...this.texts];
  }

  _sync() {
    if (!this._layer) return;
    const items = this._allItems().sort(
      (a, b) => (a.zIndex || 0) - (b.zIndex || 0),
    );
    const tasks = (this.activeTasks || []).filter((t) => !t.fullyMounted);
    const keep = new Set([...items.map((i) => i.id)]);

    for (const item of items) {
      keep.add(item.id);
      this._ensureNode(item);
    }
    for (const task of tasks) {
      keep.add(task.taskId);
      this._ensureLoader(task);
    }
    // Remove stale nodes.
    for (const id of [...this._nodes.keys()]) {
      if (!keep.has(id)) this._removeNode(id);
    }
    // Repaint order: items by zIndex then loaders (background rect stays first,
    // guides/transformer live above by z).
    const ordered = [
      ...items.map((i) => this._nodes.get(i.id)).filter(Boolean),
      ...tasks.map((t) => this._nodes.get(t.taskId)).filter(Boolean),
    ];
    ordered.forEach((n, i) => n.zIndex(i + 1));
    for (let i = 0; i < this._guides.length; i++)
      this._guides[i].zIndex(ordered.length + 1 + i);
    this._tr.zIndex(ordered.length + this._guides.length + 1);
    // Keep the always-redrawing animation alive while any video is present.
    if (this.videos.length > 0) this._startVideoAnim(this._layer);
    else if (this._videoAnim) {
      this._videoAnim.stop();
      this._videoAnim = null;
    }
    this._refreshSelection();
    this._layer.batchDraw();
  }


  // Items live in this.images/videos/audios/texts; node handlers are bound
  // once at creation, so they always re-resolve the CURRENT item by id.
  _liveItem(id) {
    return this._allItems().find((i) => i.id === id);
  }

  _removeNode(id) {
    const n = this._nodes.get(id);
    if (!n) return;
    this._nodes.delete(id);
    const anim = this._anims.get(id);
    if (anim) {
      anim.stop();
      this._anims.delete(id);
    }
    const am = this._audioMeta.get(id);
    if (am) {
      am.audio.pause();
      this._audioMeta.delete(id);
    }
    if (this._labelFor === id) this._clearLabel();
    n.destroy();
  }

  _ensureNode(item) {
    let n = this._nodes.get(item.id);
    const kind = item.id.startsWith('img')
      ? 'image'
      : item.id.startsWith('vid')
        ? 'video'
        : item.id.startsWith('aud')
          ? 'audio'
          : 'text';
    if (!n) {
      n = this._createNode(item, kind);
      if (!n) return;
      this._nodes.set(item.id, n);
      this._layer.add(n);
    }
    this._updateNode(n, item, kind);
  }

  _createNode(item, kind) {
    const id = item.id;
    if (kind === 'image' || kind === 'video') {
      const n = new Konva.Image({ id });
      n._mediaUrl = item.src;
      n.on('click', () => {
        const cur = this._liveItem(id);
        if (cur && !cur.locked) this.selectedId = id;
      });
      n.on('tap', () => {
        const cur = this._liveItem(id);
        if (cur && !cur.locked) this.selectedId = id;
      });
      n.on('dragmove', (e) => this._handleDragMove(e));
      n.on('dragend', (e) => this._handleDragEnd(e, this._liveItem(id)));
      n.on('transformend', () => this._commitTransform(this._liveItem(id), n, kind));
      if (kind === 'video') this._startVideoAnim(this._layer);
      return n;
    }
    if (kind === 'audio') return this._createAudioNode(id);
    const n = new Konva.Text({ id });
    n.on('click', () => {
      const cur = this._liveItem(id);
      if (cur && !cur.locked) this.selectedId = id;
    });
    n.on('tap', () => {
      const cur = this._liveItem(id);
      if (cur && !cur.locked) this.selectedId = id;
    });
    n.on('dragmove', (e) => this._handleDragMove(e));
    n.on('dragend', (e) => this._handleDragEnd(e, this._liveItem(id)));
    n.on('dblclick', () => {
      const cur = this._liveItem(id);
      if (cur && !cur.locked) this.editingTextId = id;
    });
    n.on('transformend', () => this._commitTransform(this._liveItem(id), n, 'text'));
    return n;
  }

  _createAudioNode(id) {
    const item = this._liveItem(id);
    const g = new Konva.Group({ id, name: 'konva-item' });
    const card = new Konva.Rect({
      width: 180,
      height: 60,
      fill: '#1E1E1E',
      cornerRadius: 2,
      stroke: '#3898ec',
      strokeWidth: 1,
      shadowBlur: 5,
      shadowOpacity: 0.3,
    });
    const iconRect = new Konva.Rect({
      x: 15,
      y: 15,
      width: 15,
      height: 30,
      fill: 'white',
      cornerRadius: 2,
    });
    const label = new Konva.Text({
      x: 45,
      y: 15,
      text: item ? item.label || 'Audio Asset' : 'Audio Asset',
      fontSize: 12,
      fontFamily: 'sans-serif',
      fontStyle: 'bold',
      fill: 'white',
      width: 100,
      ellipsis: true,
    });
    const progBg = new Konva.Rect({
      x: 45,
      y: 35,
      width: 120,
      height: 4,
      fill: 'rgba(255,255,255,0.2)',
      cornerRadius: 2,
    });
    const prog = new Konva.Rect({
      x: 45,
      y: 35,
      width: 2,
      height: 4,
      fill: 'white',
      cornerRadius: 2,
    });
    const icon = new Konva.Group({ x: 155, y: 22 });
    icon.add(new Konva.Rect({ x: -15, y: -15, width: 40, height: 40, fill: 'transparent' }));
    const playIcon = new Konva.Line({ points: [0, 0, 14, 8, 0, 16], closed: true, fill: 'white' });
    icon.add(playIcon);
    const pauseIcon = new Konva.Group();
    pauseIcon.add(new Konva.Rect({ width: 4, height: 16, fill: 'white' }));
    pauseIcon.add(new Konva.Rect({ x: 7, width: 4, height: 16, fill: 'white' }));
    pauseIcon.visible(false);
    icon.add(pauseIcon);
    g.add(card);
    g.add(iconRect);
    g.add(label);
    g.add(progBg);
    g.add(prog);
    g.add(icon);

    const audio = this._liveItem(id) ? this._audioFor(this._liveItem(id).src) : new window.Audio();
    const meta = { card, label, prog, playIcon, pauseIcon, audio, playing: false };
    this._audioMeta.set(id, meta);

    const toggle = (e) => {
      if (e && e.cancelBubble !== undefined) e.cancelBubble = true;
      const cur = this._liveItem(id);
      if (!cur) return;
      this.selectedId = id;
      if (!cur.locked) this.toggleAudio(id);
    };
    g.on('click', toggle);
    g.on('tap', toggle);
    g.on('dblclick', toggle);
    icon.on('click', toggle);
    icon.on('tap', toggle);
    g.on('dragmove', (e) => this._handleDragMove(e));
    g.on('dragend', (e) => this._handleDragEnd(e, this._liveItem(id)));
    this._refreshAudio(meta, item);
    return g;
  }

  _refreshAudio(m, item) {
    if (!m) return;
    m.card.fill(m.playing ? '#3898ec' : '#1E1E1E');
    const selected = item && this.selectedId === item.id;
    m.card.strokeWidth(selected ? 2 : 1);
    m.card.shadowBlur(selected ? 10 : 5);
    if (item) m.label.text(item.label || 'Audio Asset');
    m.playIcon.visible(!m.playing);
    m.pauseIcon.visible(m.playing);
  }

  _audioFor(src) {
    let el = this._media.get(src);
    if (el && el._kind === 'audio') return el;
    el = new window.Audio();
    el._kind = 'audio';
    el._src = src;
    const tryLoad = (useCors) => {
      if (useCors) el.crossOrigin = 'anonymous';
      else el.removeAttribute('crossOrigin');
      el.src = src;
      el.loop = true;
      el.load();
    };
    el.onplay = () => this._setAudioPlaying(el._src, true);
    el.onpause = () => this._setAudioPlaying(el._src, false);
    el.onended = () => this._setAudioPlaying(el._src, false);
    el.ontimeupdate = () => {
      if (el.duration) this._setAudioProgress(el._src, el.currentTime / el.duration);
    };
    el.onerror = () => {
      if (el.crossOrigin === 'anonymous') {
        console.warn('Audio CORS failed for', src, 'retrying without CORS');
        tryLoad(false);
      } else {
        const error = el.error;
        let msg = 'Unknown error';
        if (error) {
          if (error.code === 1) msg = 'Aborted';
          else if (error.code === 2) msg = 'Network error';
          else if (error.code === 3) msg = 'Decode error';
          else if (error.code === 4) msg = 'Source not supported';
        }
        console.error('Audio failed to load:', msg, src);
      }
    };
    tryLoad(true);
    this._media.set(src, el);
    return el;
  }

  _audioIdForSrc(src) {
    return this.audios.find((a) => a.src === src)?.id ?? null;
  }

  _setAudioPlaying(src, playing) {
    const id = this._audioIdForSrc(src);
    if (!id) return;
    const m = this._audioMeta.get(id);
    if (!m) return;
    m.playing = playing;
    const item = this._liveItem(id);
    this._refreshAudio(m, item);
  }

  _setAudioProgress(src, progress) {
    const id = this._audioIdForSrc(src);
    if (!id) return;
    const m = this._audioMeta.get(id);
    if (!m) return;
    m.prog.width(Math.max(2, 120 * progress));
    this._layer.batchDraw();
  }

  toggleAudio(id) {
    const item = this.audios.find((a) => a.id === id);
    if (!item) return;
    const m = this._audioMeta.get(id);
    if (!m) return;
    if (m.playing) {
      m.audio.pause();
    } else {
      m.audio.play().catch((err) => {
        console.error('Audio playback failed:', err);
        toast.error('Playback failed. Please try clicking the play button again.');
      });
    }
  }

  _startVideoAnim(layer) {
    // One always-redrawing animation for the layer while any video exists —
    // mirrors the per-video Animations in the React version at the layer level.
    if (this._videoAnim) return this._videoAnim;
    this._videoAnim = new Konva.Animation(
      () => {
        return true; // Force redraw for video
      },
      layer,
    );
    this._videoAnim.start();
    return this._videoAnim;
  }

  _videoFor(src) {
    let el = this._media.get(src);
    if (el && el._kind === 'video') return el;
    el = document.createElement('video');
    el._kind = 'video';
    const tryLoad = (useCors) => {
      if (useCors) el.crossOrigin = 'anonymous';
      else el.removeAttribute('crossOrigin');
      el.src = src;
      el.loop = true;
      el.muted = true;
      el.playsInline = true;
      el.play().catch(() => {
        // Silently catch autoplay errors
      });
    };
    el.onerror = () => {
      if (el.crossOrigin === 'anonymous') {
        console.warn('Video CORS failed for', src, 'retrying without CORS');
        tryLoad(false);
      }
    };
    tryLoad(true);
    this._media.set(src, el);
    return el;
  }

  _imageFor(src) {
    let el = this._media.get(src);
    if (el && el._kind === 'image') return el;
    el = new window.Image();
    el._kind = 'image';
    el.crossOrigin = 'anonymous';
    el.onerror = () => {
      if (el.crossOrigin === 'anonymous') {
        el.removeAttribute('crossOrigin');
        el.src = src;
      }
    };
    el.src = src;
    this._media.set(src, el);
    return el;
  }

  _updateNode(n, item, kind) {
    if (kind === 'image' || kind === 'video') {
      const media = kind === 'image' ? this._imageFor(item.src) : this._videoFor(item.src);
      n.setAttrs({
        image: media,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation || 0,
        scaleX: item.scaleX || 1,
        scaleY: item.scaleY || 1,
        offsetX: item.offsetX || 0,
        offsetY: item.offsetY || 0,
        opacity: item.hidden ? 0 : 1,
        listening: !item.hidden,
        draggable: !item.locked,
      });
    } else if (kind === 'text') {
      n.setAttrs({
        text: item.text,
        fontSize: item.fontSize,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        fill: item.fill,
        rotation: item.rotation || 0,
        opacity: item.hidden ? 0 : 1,
        listening: !item.hidden,
        draggable: !item.locked,
      });
    } else if (kind === 'audio') {
      n.setAttrs({
        x: item.x,
        y: item.y,
        opacity: item.hidden ? 0 : 1,
        listening: !item.hidden,
        draggable: !item.locked,
      });
      this._refreshAudio(this._audioMeta.get(item.id), item);
    }
  }

  // ─── Selection: transformer + selection label ─────────────────────────────

  _refreshSelection() {
    if (!this._tr) return;
    const id = this.selectedId;
    const task = (this.activeTasks || []).find((t) => !t.fullyMounted && t.taskId === id);
    const item = id ? this._liveItem(id) : null;
    const node = id ? this._nodes.get(id) : null;
    if (!node || (!item && !task)) {
      this._tr.nodes([]);
      this._clearLabel();
      return;
    }
    this._tr.nodes([node]);
    if (item) {
      const kind = item.id.startsWith('img')
        ? 'image'
        : item.id.startsWith('vid')
          ? 'video'
          : item.id.startsWith('aud')
            ? 'audio'
            : 'text';
      this._applyTransformerConfig(kind, item);
      if (kind === 'image' || kind === 'video') this._showLabel(item);
      else this._clearLabel();
    } else {
      this._applyTransformerConfig('loader', task);
      this._clearLabel();
    }
    this._layer.batchDraw();
  }

  _applyTransformerConfig(kind) {
    const tr = this._tr;
    if (kind === 'image' || kind === 'video') {
      tr.setAttrs({
        keepRatio: true,
        centeredScaling: true,
        resizeEnabled: true,
        rotateEnabled: true,
        enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        anchorSize: 8,
        anchorCornerRadius: 4,
        anchorStroke: '#3898ec',
        anchorFill: 'white',
        borderStroke: '#3898ec',
        boundBoxFunc: (oldBox, newBox) =>
          newBox.width < 5 || newBox.height < 5 ? oldBox : newBox,
      });
    } else if (kind === 'audio') {
      tr.setAttrs({ resizeEnabled: false, rotateEnabled: true });
    } else if (kind === 'text') {
      tr.setAttrs({
        boundBoxFunc: (oldBox, newBox) =>
          newBox.width < 5 || newBox.height < 5 ? oldBox : newBox,
        enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      });
    } else {
      tr.setAttrs({ resizeEnabled: false, rotateEnabled: false });
    }
  }

  _commitTransform(item, node, kind) {
    if (!item) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const attrs = {
      ...item,
      x: node.x(),
      y: node.y(),
      width: Math.max(5, node.width() * scaleX),
      height: Math.max(5, node.height() * scaleY),
      rotation: node.rotation(),
    };
    const key = kind === 'image' ? 'images' : kind === 'video' ? 'videos' : 'texts';
    const cur = this._liveItem(item.id);
    this[key] = this._allItemsByKind(key).map((i) => (i.id === item.id ? { ...attrs } : i));
    this._labelFor === item.id && this._showLabel(cur || attrs);
  }

  _allItemsByKind(key) {
    return this[key];
  }

  _showLabel(item) {
    const node = this._nodes.get(item.id);
    if (!node) return;
    const stageScale = this._stage ? this._stage.scaleX() : 1;
    const w = Math.round(node.width() * node.scaleX());
    const h = Math.round(node.height() * node.scaleY());
    const isImage = item.id.startsWith('img');
    if (this._labelFor !== item.id) {
      this._clearLabel();
      const g = new Konva.Group();
      if (isImage)
        g.add(new Konva.Rect({ width: w * stageScale, height: 20, fill: 'transparent' }));
      g.add(
        new Konva.Text({
          text: isImage ? 'Image' : 'Video',
          fontSize: 11,
          fontFamily: 'sans-serif',
          fill: '#3898ec',
          x: 0,
          y: 5,
        }),
      );
      g.add(
        new Konva.Text({
          text: `${w} × ${h}`,
          fontSize: 11,
          fontFamily: 'sans-serif',
          fill: '#3898ec',
          align: 'right',
          width: w * stageScale,
          x: 0,
          y: 5,
        }),
      );
      this._layer.add(g);
      this._labelGroup = g;
      this._labelFor = item.id;
    }
    // Update geometry (position follows drags, width follows resizes).
    const g = this._labelGroup;
    g.setAttrs({
      x: this._nodes.get(item.id).x(),
      y: this._nodes.get(item.id).y() - 24,
      rotation: item.rotation || 0,
      scaleX: 1 / stageScale,
      scaleY: 1 / stageScale,
    });
    const kids = this._labelGroup.children;
    if (isImage && kids.length === 3) {
      kids[0].width(w * stageScale);
    }
    const dims = kids[isImage ? 2 : 1];
    if (dims) {
      dims.text(`${w} × ${h}`);
      dims.width(w * stageScale);
    }
  }

  _clearLabel() {
    if (this._labelGroup) {
      this._labelGroup.destroy();
      this._labelGroup = null;
    }
    this._labelFor = null;
  }

  // ─── Drag & snapping guides ───────────────────────────────────────────────

  _getLineGuide(node) {
    const stage = node.getStage();
    const layer = node.getLayer();
    const box = node.getClientRect({ relativeTo: layer });
    const result = { vertical: [], horizontal: [] };
    const otherNodes = stage.find('.konva-item').filter((n) => n !== node);
    const offset = GUIDELINE_OFFSET / this.zoom;
    otherNodes.forEach((otherNode) => {
      const oBox = otherNode.getClientRect({ relativeTo: layer });
      const nodeEdges = [
        { guide: box.x, offset: box.x - node.x(), orientation: 'v' },
        { guide: box.x + box.width / 2, offset: box.x + box.width / 2 - node.x(), orientation: 'v' },
        { guide: box.x + box.width, offset: box.x + box.width - node.x(), orientation: 'v' },
        { guide: box.y, offset: box.y - node.y(), orientation: 'h' },
        { guide: box.y + box.height / 2, offset: box.y + box.height / 2 - node.y(), orientation: 'h' },
        { guide: box.y + box.height, offset: box.y + box.height - node.y(), orientation: 'h' },
      ];
      const otherEdges = [
        { guide: oBox.x, orientation: 'v' },
        { guide: oBox.x + oBox.width / 2, orientation: 'v' },
        { guide: oBox.x + oBox.width, orientation: 'v' },
        { guide: oBox.y, orientation: 'h' },
        { guide: oBox.y + oBox.height / 2, orientation: 'h' },
        { guide: oBox.y + oBox.height, orientation: 'h' },
      ];
      nodeEdges.forEach((nEdge) => {
        otherEdges.forEach((oEdge) => {
          if (nEdge.orientation !== oEdge.orientation) return;
          if (Math.abs(nEdge.guide - oEdge.guide) <= offset) {
            if (nEdge.orientation === 'v')
              result.vertical.push({ lineGuide: oEdge.guide, diff: oEdge.guide - nEdge.guide });
            else
              result.horizontal.push({ lineGuide: oEdge.guide, diff: oEdge.guide - nEdge.guide });
          }
        });
      });
    });
    return result;
  }

  _handleDragMove(e) {
    const node = e.target;
    const guidesFound = this._getLineGuide(node);
    const newGuides = [];
    if (guidesFound.vertical.length > 0) {
      const g = guidesFound.vertical[0];
      node.x(node.x() + g.diff);
      newGuides.push({
        points: [g.lineGuide, -5000, g.lineGuide, 10000],
        stroke: '#3898ec',
        strokeWidth: 1 / this.zoom,
        dash: [4, 4],
      });
    }
    if (guidesFound.horizontal.length > 0) {
      const g = guidesFound.horizontal[0];
      node.y(node.y() + g.diff);
      newGuides.push({
        points: [-5000, g.lineGuide, 10000, g.lineGuide],
        stroke: '#3898ec',
        strokeWidth: 1 / this.zoom,
        dash: [4, 4],
      });
    }
    this._setGuides(newGuides);
    if (this._labelFor) {
      const item = this._liveItem(this._labelFor);
      if (item && this._labelGroup) {
        const stageScale = this._stage ? this._stage.scaleX() : 1;
        this._labelGroup.setAttrs({
          x: node.x(),
          y: node.y() - 24,
          scaleX: 1 / stageScale,
          scaleY: 1 / stageScale,
        });
      }
    }
    this._layer.batchDraw();
  }

  _setGuides(specs) {
    this._guides.forEach((g) => g.destroy());
    this._guides = specs.map(
      (s) =>
        new Konva.Line({
          ...s,
          listening: false,
        }),
    );
    this._guides.forEach((g) => this._layer.add(g));
  }

  _handleDragEnd(e, item) {
    const node = e.target;
    const id = item ? item.id : null;
    if (id) {
      const update = (key) => {
        const idx = this[key].findIndex((i) => i.id === id);
        if (idx !== -1) {
          const next = [...this[key]];
          next[idx] = { ...next[idx], x: node.x(), y: node.y() };
          this[key] = next;
        }
      };
      if (id.startsWith('img')) update('images');
      else if (id.startsWith('vid')) update('videos');
      else if (id.startsWith('txt')) update('texts');
      // Note: audio drag-end is not committed, matching the original.
    }
    this._setGuides([]);
    this._layer.batchDraw();
  }

  // ─── Task loaders (spawning / rendering indicators) ───────────────────────

  _syncTasks() {
    const activeTasks = this.activeTasks || [];
    if (activeTasks.length === 0) return;
    const needing = activeTasks.filter((t) => t.x === undefined && t.y === undefined);
    if (needing.length > 0) {
      this.setActiveTasks((prev) => {
        const next = [...prev];
        let changed = false;
        next.forEach((t, i) => {
          if (t.x === undefined && t.y === undefined) {
            const stage = this._stage;
            t.x = stage
              ? (-stage.x() + this.canvasSize.width / 2) / this.zoom - 120 + i * 20
              : 100 + i * 20;
            t.y = stage
              ? (-stage.y() + this.canvasSize.height / 2) / this.zoom - 60 + i * 20
              : 100 + i * 20;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
    const completedUnadded = activeTasks.filter(
      (t) => t.status === 'completed' && t.resultUrl && !t.addedToCanvas,
    );
    if (completedUnadded.length > 0) {
      completedUnadded.forEach((task) => {
        this.setActiveTasks((prev) =>
          prev.map((t) =>
            t.taskId === task.taskId ? { ...t, addedToCanvas: true } : t,
          ),
        );
        const items = task.resultUrl.rawOutputs || task.resultUrl.examples || [];
        if (items.length > 0) {
          let loadedCount = 0;
          const handleItemLoaded = () => {
            loadedCount++;
            if (loadedCount === items.length) {
              this.setActiveTasks((prev) =>
                prev.map((t) =>
                  t.taskId === task.taskId ? { ...t, fullyMounted: true } : t,
                ),
              );
            }
          };
          items.forEach((output, oIndex) => {
            const x = task.x !== undefined ? task.x + oIndex * 20 : 100;
            const y = task.y !== undefined ? task.y + oIndex * 20 : 100;
            const val =
              typeof output === 'string'
                ? output
                : output.value || output.url || output.image_url;
            const type =
              typeof output === 'object' ? (output.type || '').toLowerCase() : null;
            if (val) {
              if (type && type.startsWith('text')) {
                this.addNewText(val, x, y);
                handleItemLoaded();
              } else if (type && type.startsWith('video')) {
                this.addVideo(val, x, y, undefined, undefined, handleItemLoaded);
              } else if (type && type.startsWith('audio')) {
                this.addAudio(val, x, y, task.assetLabel);
                handleItemLoaded();
              } else {
                this.addImage(val, x, y, undefined, undefined, handleItemLoaded);
              }
            } else handleItemLoaded();
          });
        } else {
          this.setActiveTasks((prev) =>
            prev.map((t) =>
              t.taskId === task.taskId ? { ...t, fullyMounted: true } : t,
            ),
          );
        }
      });
    }
  }

  _ensureLoader(task) {
    let n = this._nodes.get(task.taskId);
    if (!n) {
      const g = new Konva.Group({
        id: task.taskId,
        name: 'konva-item',
        x: task.x || 0,
        y: task.y || 0,
        draggable: true,
      });
      const dark = this.theme === 'dark';
      g.add(
        new Konva.Rect({
          width: 240,
          height: 240,
          fill: dark ? '#1E1E1E' : '#FFFFFF',
          cornerRadius: 8,
          stroke: '#3898ec',
          strokeWidth: 1,
          shadowColor: dark ? '#ffffff' : '#000000',
          shadowBlur: 10,
          shadowOpacity: 0.2,
          shadowOffsetY: 4,
        }),
      );
      g.add(
        new Konva.Text({
          x: 10,
          y: 45,
          text:
            task.status === 'completed'
              ? `Rendering...\n\n${task.modelName}`
              : `Generating...\n\n${task.modelName}`,
          fontSize: 14,
          fontFamily: 'sans-serif',
          fontStyle: 'bold',
          fill: dark ? '#E0E0E0' : '#0F172A',
          width: 220,
          align: 'center',
        }),
      );
      g.add(
        new Konva.Text({
          x: 10,
          y: 110,
          text: '(Move to change spawn location)',
          fontSize: 10,
          fill: '#3898ec',
          width: 220,
          align: 'center',
        }),
      );
      const arc = new Konva.Arc({
        x: 120,
        y: 170,
        cornerRadius: 10,
        innerRadius: 20,
        outerRadius: 24,
        angle: 300,
        fill: '#3898ec',
        rotation: 0,
      });
      g.add(arc);
      g.on('click', () => (this.selectedId = task.taskId));
      g.on('tap', () => (this.selectedId = task.taskId));
      g.on('dragend', (e) => {
        this.setActiveTasks((prev) =>
          prev.map((t) =>
            t.taskId === task.taskId
              ? { ...t, x: e.target.x(), y: e.target.y() }
              : t,
          ),
        );
      });
      const anim = new Konva.Animation(
        (frame) => {
          const angleDiff = frame.timeDiff * 0.36; // roughly 360 degrees per second
          arc.rotate(angleDiff);
        },
        this._layer,
      );
      anim.start();
      this._anims.set(task.taskId, anim);
      n = g;
      this._nodes.set(task.taskId, n);
      this._layer.add(n);
    }
    n.setAttrs({ x: task.x || 0, y: task.y || 0 });
  }

  // ─── Imperative canvas API (CreativeCanvas's canvasRef) ───────────────────

  addImage = (src, x, y, width, height, onLoaded, assetLabel) => {
    if (!src) return;
    const stage = this._stage;
    if (!stage) {
      console.error('CanvasArea: stageRef.current is null in addImage');
      return;
    }
    const targetX =
      x !== undefined
        ? x
        : (-stage.x() + (this.canvasSize?.width || 800) / 2) / this.zoom - 100;
    const targetY =
      y !== undefined
        ? y
        : (-stage.y() + (this.canvasSize?.height || 600) / 2) / this.zoom - 100;
    const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    const commitImage = (loadedImg) => {
      let finalWidth = width;
      let finalHeight = height;
      if (!finalWidth && !finalHeight && loadedImg.width) {
        const maxDim = 400;
        if (loadedImg.width > loadedImg.height) {
          finalWidth = maxDim;
          finalHeight = (loadedImg.height / loadedImg.width) * maxDim;
        } else {
          finalHeight = maxDim;
          finalWidth = (loadedImg.width / loadedImg.height) * maxDim;
        }
      }
      this.images = [
        ...this.images,
        {
          id,
          assetLabel: assetLabel || null,
          src,
          x: targetX,
          y: targetY,
          image: loadedImg,
          width: finalWidth / 2 || 200,
          height: finalHeight / 2 || 200,
          rotation: 0,
        },
      ];
      this.selectedId = id;
      if (typeof onLoaded === 'function') onLoaded();
    };

    img.onload = () => commitImage(img);
    img.onerror = () => {
      if (img.crossOrigin === 'anonymous') {
        img.removeAttribute('crossOrigin');
        img.src = src;
      } else {
        console.error('Failed to load image after retry:', src);
        commitImage(img);
      }
    };
    img.src = src;
  };

  addVideo = (src, x, y, width, height, onLoaded, assetLabel) => {
    if (!src) return;
    const stage = this._stage;
    if (!stage) {
      console.error('CanvasArea: stageRef.current is null in addVideo');
      return;
    }
    const targetX =
      x !== undefined
        ? x
        : (-stage.x() + (this.canvasSize?.width || 800) / 2) / this.zoom - 150;
    const targetY =
      y !== undefined
        ? y
        : (-stage.y() + (this.canvasSize?.height || 600) / 2) / this.zoom - 100;
    const id = `vid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const tryLoad = (useCors) => {
      const video = document.createElement('video');
      if (useCors) video.crossOrigin = 'anonymous';
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      let settled = false;

      const commitVideo = (v) => {
        let finalWidth = width;
        let finalHeight = height;
        const vW = v.videoWidth;
        const vH = v.videoHeight;
        if (vW && vH) {
          if (!finalWidth && !finalHeight) {
            const maxDim = 400;
            if (vW > vH) {
              finalWidth = maxDim;
              finalHeight = (vH / vW) * maxDim;
            } else {
              finalHeight = maxDim;
              finalWidth = (vW / vH) * maxDim;
            }
          }
        }
        this.videos = [
          ...this.videos,
          {
            id,
            assetLabel: assetLabel || null,
            src,
            x: targetX,
            y: targetY,
            width: finalWidth / 2 || 300,
            height: finalHeight / 2 || 200,
            rotation: 0,
          },
        ];
        this.selectedId = id;
        v.play().catch(() => {
          const playOnInteract = () => {
            v.play();
            window.removeEventListener('click', playOnInteract);
          };
          window.addEventListener('click', playOnInteract);
        });
        if (typeof onLoaded === 'function') onLoaded();
      };

      const handleVideoReady = () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        commitVideo(video);
      };
      video.addEventListener('loadedmetadata', handleVideoReady, { once: true });
      video.addEventListener('canplay', handleVideoReady, { once: true });
      video.addEventListener(
        'error',
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(fallbackTimer);
          if (useCors) {
            console.warn('CORS issue with video, retrying without crossOrigin:', src);
            tryLoad(false);
          } else {
            console.error('Failed to load video after retry:', src);
            commitVideo(video);
          }
        },
        { once: true },
      );
      const fallbackTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (useCors) tryLoad(false);
        else commitVideo(video);
      }, 10000);
      video.src = src;
      video.load();
    };
    tryLoad(true);
  };

  addAudio = (src, x, y, label, assetLabel) => {
    console.log('audio url', src);
    if (!src) return;
    const stage = this._stage;
    if (!stage) {
      console.error('CanvasArea: stageRef.current is null in addAudio');
      return;
    }
    const targetX =
      x !== undefined ? x : (-stage.x() + (this.canvasSize?.width || 800) / 2) / this.zoom - 90;
    const targetY =
      y !== undefined ? y : (-stage.y() + (this.canvasSize?.height || 600) / 2) / this.zoom - 30;
    const id = `aud-${Date.now()}`;
    this.audios = [
      ...this.audios,
      {
        id,
        assetLabel: assetLabel || null,
        src,
        x: targetX,
        y: targetY,
        label: label || 'Audio Asset',
        rotation: 0,
      },
    ];
    this.selectedId = id;
  };

  addNewText = (text, x, y) => {
    const stage = this._stage;
    const targetX =
      x !== undefined ? x : (-stage.x() + this.canvasSize.width / 2) / this.zoom - 50;
    const targetY =
      y !== undefined ? y : (-stage.y() + this.canvasSize.height / 2) / this.zoom - 12;
    const id = `txt-${Date.now()}`;
    this.texts = [
      ...this.texts,
      {
        id,
        text: text || 'Double-click to Edit',
        fontSize: 24,
        x: targetX,
        y: targetY,
        draggable: true,
        fill: this.theme === 'dark' ? 'white' : 'black',
        rotation: 0,
      },
    ];
    this.selectedId = id;
  };

  getCanvasState = () => {
    const stage = this._stage;
    const nodes = [];
    const push = (n, kind) => {
      if (!n.assetLabel) return;
      nodes.push({
        asset_id: n.assetLabel,
        kind,
        x: Math.round(n.x),
        y: Math.round(n.y),
        w: Math.round(n.width || 200),
        h: Math.round(n.height || (kind === 'audio' ? 60 : 200)),
        z: n.zIndex || 0,
        locked: !!n.locked,
      });
    };
    this.images.forEach((n) => push(n, 'image'));
    this.videos.forEach((n) => push(n, 'video'));
    this.audios.forEach((n) => push(n, 'audio'));
    const selectedNode = this._allItems().find((n) => n.id === this.selectedId);
    return {
      viewport: {
        w: this.canvasSize.width,
        h: this.canvasSize.height,
        zoom: this.zoom,
        pan: stage ? [Math.round(stage.x()), Math.round(stage.y())] : [0, 0],
      },
      selected: selectedNode?.assetLabel || null,
      nodes,
    };
  };

  moveNode = (assetLabel, x, y) => {
    const patch = (arr) =>
      arr.map((n) => (n.assetLabel === assetLabel ? { ...n, x, y } : n));
    this.images = patch(this.images);
    this.videos = patch(this.videos);
    this.audios = patch(this.audios);
  };

  placeNextToSource = (sourceLabel, newUrl, newKind, newAssetLabel) => {
    const frame =
      this.images.find((n) => n.assetLabel === sourceLabel) ||
      this.videos.find((n) => n.assetLabel === sourceLabel) ||
      this.audios.find((n) => n.assetLabel === sourceLabel);
    if (!frame) {
      if (newKind === 'video')
        this.addVideo(newUrl, undefined, undefined, undefined, undefined, undefined, newAssetLabel);
      else if (newKind === 'audio')
        this.addAudio(newUrl, undefined, undefined, undefined, newAssetLabel);
      else
        this.addImage(newUrl, undefined, undefined, undefined, undefined, undefined, newAssetLabel);
      return;
    }
    const sw = frame.width || 200;
    const sh = frame.height || 200;
    const x = frame.x + sw + 32;
    const y = frame.y;
    if (newKind === 'video') this.addVideo(newUrl, x, y, sw, sh, undefined, newAssetLabel);
    else if (newKind === 'audio') this.addAudio(newUrl, x, y, undefined, newAssetLabel);
    else this.addImage(newUrl, x, y, sw, sh, undefined, newAssetLabel);
  };

  // Back-compat alias (matches the React ref API).
  get replaceAt() {
    return this.placeNextToSource;
  }

  arrangeNodes = (moves) => {
    if (!Array.isArray(moves) || moves.length === 0) return 0;
    const byLabel = new Map(moves.map((m) => [m.asset_id, m]));
    const patch = (arr) =>
      arr.map((n) => {
        const m = n.assetLabel ? byLabel.get(n.assetLabel) : null;
        return m ? { ...n, x: m.x, y: m.y } : n;
      });
    this.images = patch(this.images);
    this.videos = patch(this.videos);
    this.audios = patch(this.audios);
    return moves.length;
  };

  zoomIn = () => this.updateZoom(Math.min(5, this.zoom + 0.1));
  zoomOut = () => this.updateZoom(Math.max(0.1, this.zoom - 0.1));
  resetZoom = () => this.updateZoom(1);

  // ─── Context menu actions ──────────────────────────────────────────────────

  getActiveNode(id) {
    return (
      this.images.find((i) => i.id === id) ||
      this.videos.find((v) => v.id === id) ||
      this.audios.find((a) => a.id === id) ||
      this.texts.find((t) => t.id === id)
    );
  }

  handleCopy() {
    const id = this.contextMenu?.nodeId || this.selectedId;
    if (id) this._clipboard = this.getActiveNode(id);
    this.contextMenu = null;
  }

  handleCut() {
    const id = this.contextMenu?.nodeId || this.selectedId;
    if (id) {
      this._clipboard = this.getActiveNode(id);
      this.images = this.images.filter((img) => img.id !== id);
      this.videos = this.videos.filter((vid) => vid.id !== id);
      this.audios = this.audios.filter((aud) => aud.id !== id);
      this.texts = this.texts.filter((txt) => txt.id !== id);
      if (this.selectedId === id) this.selectedId = null;
    }
    this.contextMenu = null;
  }

  handleDuplicate() {
    const id = this.contextMenu?.nodeId || this.selectedId;
    if (id) {
      const node = this.getActiveNode(id);
      if (node) {
        const newNode = {
          ...node,
          id: `${node.id.split('-')[0]}-${Date.now()}`,
          x: node.x + 20,
          y: node.y + 20,
        };
        if (newNode.id.startsWith('img')) this.images = [...this.images, newNode];
        if (newNode.id.startsWith('vid')) this.videos = [...this.videos, newNode];
        if (newNode.id.startsWith('aud')) this.audios = [...this.audios, newNode];
        if (newNode.id.startsWith('txt')) this.texts = [...this.texts, newNode];
      }
    }
    this.contextMenu = null;
  }

  async handlePasteNode() {
    const stage = this._stage;
    if (!stage) return;
    const pastePos = this.contextMenu ? this.contextMenu.stagePos : null;
    let x, y;
    if (pastePos) {
      x = (pastePos.x - stage.x()) / this.zoom;
      y = (pastePos.y - stage.y()) / this.zoom;
    } else {
      x = (-stage.x() + this.canvasSize.width / 2) / this.zoom;
      y = (-stage.y() + this.canvasSize.height / 2) / this.zoom;
    }
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        const items = await navigator.clipboard.read();
        let foundSomething = false;
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              const reader = new FileReader();
              reader.onload = (e) => this.addImage(e.target.result, x - 50, y - 50);
              reader.readAsDataURL(blob);
              foundSomething = true;
            } else if (type === 'text/plain') {
              const blob = await item.getType(type);
              const text = await blob.text();
              if (text.trim()) {
                this.addNewText(text, x, y);
                foundSomething = true;
              }
            }
          }
        }
        if (foundSomething) {
          this.contextMenu = null;
          return;
        }
      } catch (err) {
        /* fall through to internal clipboard */
      }
    }
    if (this._clipboard) {
      const newNode = {
        ...this._clipboard,
        id: `${this._clipboard.id.split('-')[0]}-${Date.now()}`,
      };
      newNode.x = x - (newNode.width || 0) / 2;
      newNode.y = y - (newNode.height || 0) / 2;
      if (newNode.id.startsWith('img')) this.images = [...this.images, newNode];
      else if (newNode.id.startsWith('vid')) this.videos = [...this.videos, newNode];
      else if (newNode.id.startsWith('aud')) this.audios = [...this.audios, newNode];
      else if (newNode.id.startsWith('txt')) this.texts = [...this.texts, newNode];
    }
    this.contextMenu = null;
  }

  handleZIndex(action) {
    const id = this.contextMenu?.nodeId || this.selectedId;
    if (!id) return;
    const allItems = this._allItems().sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    const idxInAll = allItems.findIndex((i) => i.id === id);
    if (idxInAll === -1) return;
    const allZ = allItems.map((i) => i.zIndex || 0);
    const maxZ = Math.max(...allZ, 0);
    const minZ = Math.min(...allZ, 0);
    const updateItem = (key) => {
      const idx = this[key].findIndex((i) => i.id === id);
      if (idx !== -1) {
        const item = { ...this[key][idx] };
        if (action === 'front') item.zIndex = maxZ + 1;
        else if (action === 'back') item.zIndex = Math.max(0, minZ - 1);
        else if (action === 'up')
          item.zIndex =
            idxInAll < allItems.length - 1
              ? (allItems[idxInAll + 1].zIndex || 0) + 1
              : maxZ + 1;
        else if (action === 'down')
          item.zIndex =
            idxInAll > 0
              ? (allItems[idxInAll - 1].zIndex || 0) - 1
              : Math.max(0, minZ - 1);
        const newArr = [...this[key]];
        newArr[idx] = item;
        this[key] = newArr;
      }
    };
    updateItem('images');
    updateItem('videos');
    updateItem('audios');
    updateItem('texts');
    this.contextMenu = null;
  }

  handleToggleState(field) {
    const id = this.contextMenu?.nodeId || this.selectedId;
    if (!id) return;
    const updateItem = (key) => {
      const idx = this[key].findIndex((i) => i.id === id);
      if (idx !== -1) {
        const newArr = [...this[key]];
        newArr[idx] = { ...newArr[idx], [field]: !newArr[idx][field] };
        this[key] = newArr;
        if (field === 'locked' && newArr[idx].locked) this.selectedId = null;
      }
    };
    updateItem('images');
    updateItem('videos');
    updateItem('audios');
    updateItem('texts');
    this.contextMenu = null;
  }

  handleFlip(direction) {
    const id = this.contextMenu?.nodeId || this.selectedId;
    if (!id) return;
    const updateItem = (key) => {
      const idx = this[key].findIndex((i) => i.id === id);
      if (idx !== -1) {
        const item = { ...this[key][idx] };
        if (direction === 'horizontal') {
          item.scaleX = (item.scaleX || 1) * -1;
          item.offsetX = item.scaleX === -1 ? item.width || 0 : 0;
        } else {
          item.scaleY = (item.scaleY || 1) * -1;
          item.offsetY = item.scaleY === -1 ? item.height || 0 : 0;
        }
        const newArr = [...this[key]];
        newArr[idx] = item;
        this[key] = newArr;
      }
    };
    updateItem('images');
    updateItem('videos');
    updateItem('audios');
    updateItem('texts');
    this.contextMenu = null;
  }

  handleDelete() {
    const id = this.contextMenu?.nodeId || this.selectedId;
    if (id) {
      this.images = this.images.filter((img) => img.id !== id);
      this.videos = this.videos.filter((vid) => vid.id !== id);
      this.audios = this.audios.filter((aud) => aud.id !== id);
      this.texts = this.texts.filter((txt) => txt.id !== id);
      if (this.selectedId === id) this.selectedId = null;
    }
    this.contextMenu = null;
  }

  handleExport(format) {
    if (!this.contextMenu?.nodeId) return;
    const id = this.contextMenu.nodeId;
    const node = this._stage.findOne('#' + id);
    if (node) {
      try {
        const dataURL = node.toDataURL({
          pixelRatio: 3,
          mimeType:
            format === 'JPG'
              ? 'image/jpeg'
              : format === 'SVG'
                ? 'image/svg+xml'
                : 'image/png',
        });
        const link = document.createElement('a');
        link.download = `export-${id}.${format.toLowerCase()}`;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error('Export failed:', err);
        toast.error(
          'Export failed: This image might be from an external source without CORS permission.',
        );
      }
    }
    this.contextMenu = null;
  }

  async handleDownload() {
    const id = this.contextMenu?.nodeId || this.selectedId;
    if (!id) return;
    const item = [...this.images, ...this.videos, ...this.audios].find((i) => i.id === id);
    if (item && item.src) {
      try {
        toast.loading('Preparing download...', { id: 'download' });
        const response = await fetch(item.src);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const extension = item.src.split('?')[0].split('.').pop() || '';
        const fileName = item.label || item.assetLabel || `asset-${id.substring(0, 8)}`;
        link.download = extension ? `${fileName}.${extension}` : fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success('Download started', { id: 'download' });
      } catch (err) {
        console.error('Download failed:', err);
        toast.error('Download failed. CORS might be blocking direct download.', {
          id: 'download',
        });
        const link = document.createElement('a');
        link.href = item.src;
        link.target = '_blank';
        link.download = '';
        link.click();
      }
    } else {
      toast.error('Source URL not found');
    }
    this.contextMenu = null;
  }

  handleShowAllHidden() {
    this.images = this.images.map((i) => ({ ...i, hidden: false }));
    this.videos = this.videos.map((v) => ({ ...v, hidden: false }));
    this.audios = this.audios.map((a) => ({ ...a, hidden: false }));
    this.texts = this.texts.map((t) => ({ ...t, hidden: false }));
    toast.success('All items are now visible');
    this.contextMenu = null;
  }

  handleClearCanvas() {
    if (window.confirm('Are you sure you want to clear the entire canvas?')) {
      this.images = [];
      this.videos = [];
      this.audios = [];
      this.texts = [];
      this.selectedId = null;
      toast.success('Canvas cleared');
    }
    this.contextMenu = null;
  }

  handleExportCanvas() {
    if (!this._stage) return;
    try {
      const dataURL = this._stage.toDataURL({ pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `canvas-export-${Date.now()}.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Canvas export failed:', err);
      toast.error(
        'Canvas export failed: One or more images on the canvas are from an external source without CORS permission.',
      );
    }
    this.contextMenu = null;
  }

  // ─── Global listeners: keyboard, paste, drop ──────────────────────────────

  _inField() {
    const ae = document.activeElement;
    const rae = this.renderRoot && this.renderRoot.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return true;
    if (rae && (rae.tagName === 'INPUT' || rae.tagName === 'TEXTAREA')) return true;
    return !!this.editingTextId;
  }

  _onKey = (e) => {
    if (this._inField()) return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        this.updateZoom(Math.min(5, this.zoom + 0.1));
      } else if (e.key === '-') {
        e.preventDefault();
        this.updateZoom(Math.max(0.1, this.zoom - 0.1));
      } else if (e.key === '0') {
        e.preventDefault();
        this.updateZoom(1);
      } else if (e.key === 'c') this.handleCopy();
      else if (e.key === 'x') this.handleCut();
      else if (e.key === 'v') this.handlePasteNode();
      else if (e.key === 'd') {
        e.preventDefault();
        this.handleDuplicate();
      } else if (e.key === ']') {
        e.preventDefault();
        this.handleZIndex('up');
      } else if (e.key === '[') {
        e.preventDefault();
        this.handleZIndex('down');
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      this.handleDelete();
    } else if (e.key === ']') {
      if (this.selectedId) this.handleZIndex('front');
    } else if (e.key === '[') {
      if (this.selectedId) this.handleZIndex('back');
    } else if (e.shiftKey && (e.key === '!' || e.key === '1')) {
      e.preventDefault();
      this.handleZoomToFit();
    }
  };

  _onPaste = (e) => {
    if (this._inField()) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => this.addImage(event.target.result);
        reader.readAsDataURL(file);
      } else if (items[i].type === 'text/plain') {
        e.preventDefault();
        items[i].getAsString((text) => {
          if (text.trim()) this.addNewText(text);
        });
      }
    }
  };

  _onDragOver = (e) => {
    e.preventDefault();
  };

  _onDrop = (e) => {
    e.preventDefault();
    const url = e.dataTransfer.getData('text/plain');
    const files = e.dataTransfer.files;
    if (url) {
      if (url.match(/\.(mp4|webm|mov)$/i)) this.addVideo(url);
      else if (url.match(/\.(mp3|wav|ogg|m4a)$/i)) this.addAudio(url);
      else this.addImage(url);
    } else if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (file.type.startsWith('video/')) this.addVideo(ev.target.result);
        else if (file.type.startsWith('audio/')) this.addAudio(ev.target.result);
        else this.addImage(ev.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  _menuButton(label, shortcut, onClick) {
    return html`<button
        class="w-full text-left px-4 py-1.5 flex justify-between items-center transition-colors hover:bg-bg-page"
        @click=${(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <span>${label}</span>
        ${shortcut
          ? html`<span class="text-xs opacity-50 font-medium">${shortcut}</span>`
          : nothing}
      </button>`;
  }

  _menuDivider() {
    return html`<div class="h-[1px] w-full my-1 bg-border-main"></div>`;
  }

  _nodeMenu() {
    const isAudio = this.contextMenu?.nodeId?.startsWith('aud');
    return html`${this._menuButton('Copy', 'Ctrl+C', () => this.handleCopy())}
      ${this._menuButton('Cut', 'Ctrl+X', () => this.handleCut())}
      ${this._menuButton('Duplicate', 'Ctrl+D', () => this.handleDuplicate())}
      ${this._menuDivider()}
      ${this._menuButton('Bring to Front', ']', () => this.handleZIndex('front'))}
      ${this._menuButton('Send to Back', '[', () => this.handleZIndex('back'))}
      ${this._menuButton('Move Up', 'Ctrl+]', () => this.handleZIndex('up'))}
      ${this._menuButton('Move Down', 'Ctrl+[', () => this.handleZIndex('down'))}
      ${this._menuDivider()}
      ${this._menuButton('Lock/Unlock', 'Ctrl+Shift+L', () =>
        this.handleToggleState('locked'),
      )}
      ${this._menuButton('Show/Hide', 'Ctrl+Shift+H', () =>
        this.handleToggleState('hidden'),
      )}
      ${this._menuDivider()}
      ${this._menuButton('Flip Horizontal', undefined, () => this.handleFlip('horizontal'))}
      ${this._menuButton('Flip Vertical', undefined, () => this.handleFlip('vertical'))}
      ${this._menuDivider()}
      ${this._menuButton('Download', undefined, () => this.handleDownload())}
      ${this._menuDivider()}
      ${isAudio
        ? nothing
        : html`<div class="relative group">
            <button
              class="w-full text-left px-4 py-1.5 flex justify-between items-center transition-colors hover:bg-bg-page"
            >
              <span>Export As</span>
              <span>›</span>
            </button>
            <div
              class="absolute left-full bottom-0 hidden group-hover:block w-32 rounded shadow-2xl border border-divider text-sm bg-bg-card border-border-main"
            >
              ${this._menuButton('PNG', undefined, () => this.handleExport('PNG'))}
              ${this._menuButton('JPG', undefined, () => this.handleExport('JPG'))}
              ${this._menuButton('SVG', undefined, () => this.handleExport('SVG'))}
            </div>
          </div>`}
      ${this._menuDivider()}
      ${this._menuButton('Delete', 'Del', () => this.handleDelete())}`;
  }

  _canvasMenu() {
    return html`${this._menuButton('Paste', 'Ctrl+V', () => this.handlePasteNode())}
      ${this._menuDivider()}
      ${this._menuButton('Zoom In', 'Ctrl++', () => this.zoomIn())}
      ${this._menuButton('Zoom Out', 'Ctrl+-', () => this.zoomOut())}
      ${this._menuButton('Zoom to Fit', 'Shift+1', () => this.handleZoomToFit())}
      ${this._menuButton('Reset Zoom', 'Ctrl+0', () => this.resetZoom())}
      ${this._menuDivider()}
      ${this._menuButton('Export Canvas', undefined, () => this.handleExportCanvas())}
      ${this._menuButton('Show All Hidden', undefined, () => this.handleShowAllHidden())}
      ${this._menuButton('Clear Canvas', undefined, () => this.handleClearCanvas())}`;
  }

  render() {
    const editing = this.editingTextId
      ? this.texts.find((t) => t.id === this.editingTextId)
      : null;
    const stage = this._stage;
    const editingOpen = !!(editing && stage);
    const absX = editingOpen ? editing.x * this.zoom + stage.x() : 0;
    const absY = editingOpen ? editing.y * this.zoom + stage.y() : 0;
    return html`<div
        class="relative w-full h-full bg-bg-page overflow-hidden canvas-container"
        @dragover=${this._onDragOver}
        @drop=${this._onDrop}
      >
        <div class="absolute inset-0 konva-host"></div>

        ${editingOpen
          ? html`<textarea
              autofocus
              class="absolute z-50 bg-transparent border-none outline-none resize-none overflow-hidden"
              style=${unsafeHTML(
                `left:${absX}px;top:${absY}px;width:${(editing.width || 200) * this.zoom}px;font-size:${(editing.fontSize || 24) * this.zoom}px;color:${editing.fill || (this.theme === 'dark' ? 'white' : 'black')};transform:rotate(${editing.rotation || 0}deg);`,
              )}
              .value=${editing.text}
              @input=${(e) => {
                this.texts = this.texts.map((t) =>
                  t.id === this.editingTextId ? { ...t, text: e.target.value } : t,
                );
              }}
              @blur=${() => (this.editingTextId = null)}
              @keydown=${(e) => {
                if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey))
                  this.editingTextId = null;
              }}
            >${editing.text}</textarea>`
          : nothing}

        ${this.contextMenu
          ? html`<div
              class="ctx-menu fixed z-[100] w-56 rounded shadow-2xl border border-divider text-sm bg-bg-card border-border-main"
              style="top: ${this.contextMenu.y}px; left: ${this.contextMenu.x}px;"
              @click=${(e) => e.stopPropagation()}
            >
              ${this.contextMenu.type === 'node'
                ? this._nodeMenu()
                : this._canvasMenu()}
            </div>`
          : nothing}
      </div>`;
  }
}

customElements.define('design-canvas-area', DesignCanvasArea);
