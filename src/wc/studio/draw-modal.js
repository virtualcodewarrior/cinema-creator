// Port of packages/studio/src/components/DrawModal.jsx.
// Full-screen "Draw to Edit" canvas workspace: background or blank canvas,
// pencil/eraser/rect/arrow/text/overlay-image tools with object selection,
// drag/resize handles, undo/redo stack, and merge→upload→generateI2I flow.
//
// Porting notes:
// - React keeps this component mounted with `isOpen` controlling a null
//   render, so all state survives close/reopen. Mirrored: the element is
//   always rendered by the parent and renders nothing while !isOpen.
// - Static <canvas> nodes carry no lit bindings, so lit keeps the same DOM
//   nodes across re-renders (drawing survives); only the mapped overlay
//   nodes (image divs, textareas) are recreated.
// - Text overlays recreate their <textarea> node on re-render (lit maps),
//   which would drop focus mid-typing; willUpdate/updated restore focus +
//   selection for the previously focused overlay (React keeps the node).
// - React's keyboard-callback ref pattern exists only for stale closures —
//   lit handlers call `this` methods directly.
// - `text` objects merge into the generation bitmap via the same canvas
//   2D wrapping algorithm; `image` objects keep a live HTMLImageElement
//   (never serialized anywhere, exactly like the original).
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { uploadFile, generateI2I } from 'studio/muapi.js';

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ffffff',
  '#000000',
];

function getObjectBoundingBox(obj) {
  if (!obj) return null;
  if (obj.type === 'pencil' || obj.type === 'eraser') {
    const xs = obj.points.map((p) => p.x);
    const ys = obj.points.map((p) => p.y);
    if (xs.length === 0) return null;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  if (obj.type === 'rect' || obj.type === 'text' || obj.type === 'image') {
    return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
  }
  if (obj.type === 'arrow') {
    const minX = Math.min(obj.x1, obj.x2);
    const maxX = Math.max(obj.x1, obj.x2);
    const minY = Math.min(obj.y1, obj.y2);
    const maxY = Math.max(obj.y1, obj.y2);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  return null;
}

const uid = () => Math.random().toString(36).substring(7);

export class DrawModal extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    isOpen: { state: true },
    apiKey: { type: String },
    batchSize: { type: Number },
    activeTab: { state: true },
    viewState: { state: true },
    bgImageUrl: { state: true },
    aspectRatio: { state: true },
    selectedModel: { state: true },
    isModelDropdownOpen: { state: true },
    isArDropdownOpen: { state: true },
    promptText: { state: true },
    activeTool: { state: true },
    brushColor: { state: true },
    brushSize: { state: true },
    showSettingsPopover: { state: true },
    canvasObjects: { state: true },
    selectedObjectId: { state: true },
    history: { state: true },
    historyIdx: { state: true },
    canUndo: { state: true },
    canRedo: { state: true },
    canvasDimensions: { state: true },
    generating: { state: true },
  };

  constructor() {
    super();
    this.isOpen = false;
    this.apiKey = '';
    this.batchSize = 1;
    this.activeTab = 'draw-to-edit';
    this.viewState = 'setup';
    this.bgImageUrl = null;
    this.aspectRatio = '16:9';
    this.selectedModel = 'nano-banana-pro-edit';
    this.isModelDropdownOpen = false;
    this.isArDropdownOpen = false;
    this.promptText = 'Edit the image based on the drawing overlay';
    this.activeTool = 'pencil';
    this.brushColor = '#eab308';
    this.brushSize = 5;
    this.showSettingsPopover = false;
    this.canvasObjects = [];
    this.selectedObjectId = null;
    this.history = [[]];
    this.historyIdx = 0;
    this.canUndo = false;
    this.canRedo = false;
    this.canvasDimensions = { width: 800, height: 450 };
    this.generating = false;
    this._drawing = { isDrawing: false, startX: 0, startY: 0, currX: 0, currY: 0, activePoints: [] };
    this._focusRestore = null;
    this._outsideClickBound = (e) => {
      const path = e.composedPath();
      const modelWrap = this.renderRoot.querySelector('[data-drop="model"]');
      const arWrap = this.renderRoot.querySelector('[data-drop="ar"]');
      if (modelWrap && !path.includes(modelWrap)) this.isModelDropdownOpen = false;
      if (arWrap && !path.includes(arWrap)) this.isArDropdownOpen = false;
    };
    this._keyDownBound = (e) => this._handleKeyDown(e);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('click', this._outsideClickBound);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('click', this._outsideClickBound);
    window.removeEventListener('keydown', this._keyDownBound);
  }

  // React: keydown listener active only while open.
  updated(changed) {
    if (changed.has('isOpen')) {
      if (this.isOpen) window.addEventListener('keydown', this._keyDownBound);
      else window.removeEventListener('keydown', this._keyDownBound);
    }
    // React useEffect [viewState, bgImageUrl]: (re)initialize the canvas.
    if (
      (changed.has('viewState') || changed.has('bgImageUrl')) &&
      this.viewState === 'canvas'
    ) {
      this._initCanvas();
    }
    // React useEffect [brushColor]: recolor the selected shape/text.
    if (changed.has('brushColor') && this.selectedObjectId) {
      this.canvasObjects = this.canvasObjects.map((o) => {
        if (o.id !== this.selectedObjectId) return o;
        const updates = {};
        if (o.type === 'text' || o.type === 'rect' || o.type === 'arrow') {
          updates.color = this.brushColor;
        }
        return { ...o, ...updates };
      });
    }
    // React useEffect [brushSize]: resize selected text font / shape stroke.
    if (changed.has('brushSize') && this.selectedObjectId) {
      this.canvasObjects = this.canvasObjects.map((o) => {
        if (o.id !== this.selectedObjectId) return o;
        const updates = {};
        if (o.type === 'text') {
          updates.fontSize = this.brushSize * 4 > 12 ? this.brushSize * 4 : 20;
          updates.height = Math.round(updates.fontSize * 1.5);
        } else if (o.type === 'rect' || o.type === 'arrow') {
          updates.brushSize = this.brushSize;
        }
        return { ...o, ...updates };
      });
    }
    // React useEffect [canvasObjects, canvasDimensions, activeTool]: redraw.
    this._redrawCanvas();
  }

  willUpdate() {
    const ae = document.activeElement;
    if (ae && ae.getAttribute && ae.getAttribute('data-text-obj')) {
      this._focusRestore = {
        id: ae.getAttribute('data-text-obj'),
        s: ae.selectionStart,
        e: ae.selectionEnd,
      };
    }
  }

  // ── Canvas setup ─────────────────────────────────────────────────────────
  _inkCanvas() {
    return this.renderRoot.querySelector('canvas[data-layer="ink"]');
  }

  _bgCanvas() {
    return this.renderRoot.querySelector('canvas[data-layer="bg"]');
  }

  _canvasWrapper() {
    return this.renderRoot.querySelector('[data-canvas-wrapper]');
  }

  _initCanvas() {
    const canvas = this._inkCanvas();
    const bgCanvas = this._bgCanvas();
    if (!canvas || !bgCanvas) return;
    const ctx = canvas.getContext('2d');
    const bgCtx = bgCanvas.getContext('2d');

    const init = (img) => {
      let width;
      let height;
      if (img) {
        const maxW = 800;
        const maxH = 800;
        const imgW = img.naturalWidth || img.width || 800;
        const imgH = img.naturalHeight || img.height || 600;
        const scale = Math.min(maxW / imgW, maxH / imgH, 1);
        width = Math.round(imgW * scale);
        height = Math.round(imgH * scale);
      } else {
        width = 800;
        height = 600;
      }
      canvas.width = width;
      canvas.height = height;
      bgCanvas.width = width;
      bgCanvas.height = height;
      if (img) {
        bgCtx.drawImage(img, 0, 0, width, height);
      } else {
        bgCtx.fillStyle = '#ffffff';
        bgCtx.fillRect(0, 0, width, height);
      }
      ctx.clearRect(0, 0, width, height);
      this.canvasDimensions = { width, height };
      this.history = [[]];
      this.historyIdx = 0;
      this.canvasObjects = [];
      this.selectedObjectId = null;
      this.canUndo = false;
      this.canRedo = false;
    };

    if (this.bgImageUrl) {
      const img = new Image();
      img.onload = () => init(img);
      img.src = this.bgImageUrl;
    } else {
      init(null);
    }
  }

  _redrawCanvas() {
    const canvas = this._inkCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.canvasObjects.forEach((obj) => {
      ctx.lineWidth = obj.brushSize || 5;
      ctx.strokeStyle = obj.color || '#eab308';
      ctx.fillStyle = obj.color || '#eab308';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (obj.type === 'pencil') {
        ctx.globalCompositeOperation = 'source-over';
        const p = obj.points;
        if (p.length > 0) {
          ctx.beginPath();
          ctx.moveTo(p[0].x, p[0].y);
          for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
          ctx.stroke();
        }
      } else if (obj.type === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        const p = obj.points;
        if (p.length > 0) {
          ctx.beginPath();
          ctx.moveTo(p[0].x, p[0].y);
          for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
          ctx.stroke();
        }
      } else if (obj.type === 'rect') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
      } else if (obj.type === 'arrow') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        ctx.moveTo(obj.x1, obj.y1);
        ctx.lineTo(obj.x2, obj.y2);
        ctx.stroke();
        const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
        ctx.beginPath();
        ctx.moveTo(obj.x2, obj.y2);
        ctx.lineTo(
          obj.x2 - 15 * Math.cos(angle - Math.PI / 6),
          obj.y2 - 15 * Math.sin(angle - Math.PI / 6),
        );
        ctx.moveTo(obj.x2, obj.y2);
        ctx.lineTo(
          obj.x2 - 15 * Math.cos(angle + Math.PI / 6),
          obj.y2 - 15 * Math.sin(angle + Math.PI / 6),
        );
        ctx.stroke();
      }
    });

    const d = this._drawing;
    if (d.isDrawing) {
      ctx.lineWidth = this.brushSize;
      ctx.strokeStyle = this.brushColor;
      ctx.fillStyle = this.brushColor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (this.activeTool === 'pencil') {
        ctx.globalCompositeOperation = 'source-over';
        const p = d.activePoints;
        if (p.length > 0) {
          ctx.beginPath();
          ctx.moveTo(p[0].x, p[0].y);
          for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
          ctx.stroke();
        }
      } else if (this.activeTool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = this.brushSize * 2;
        const p = d.activePoints;
        if (p.length > 0) {
          ctx.beginPath();
          ctx.moveTo(p[0].x, p[0].y);
          for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
          ctx.stroke();
        }
      } else if (this.activeTool === 'rect') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeRect(d.startX, d.startY, d.currX - d.startX, d.currY - d.startY);
      } else if (this.activeTool === 'arrow') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        ctx.moveTo(d.startX, d.startY);
        ctx.lineTo(d.currX, d.currY);
        ctx.stroke();
        const angle = Math.atan2(d.currY - d.startY, d.currX - d.startX);
        ctx.beginPath();
        ctx.moveTo(d.currX, d.currY);
        ctx.lineTo(
          d.currX - 15 * Math.cos(angle - Math.PI / 6),
          d.currY - 15 * Math.sin(angle - Math.PI / 6),
        );
        ctx.moveTo(d.currX, d.currY);
        ctx.lineTo(
          d.currX - 15 * Math.cos(angle + Math.PI / 6),
          d.currY - 15 * Math.sin(angle + Math.PI / 6),
        );
        ctx.stroke();
      }
    }
  }

  // ── History (undo/redo) ──────────────────────────────────────────────────
  _saveStateToHistory(newObjects) {
    const nextHistory = this.history.slice(0, this.historyIdx + 1);
    nextHistory.push(newObjects);
    this.history = nextHistory;
    this.historyIdx = nextHistory.length - 1;
    this.canUndo = nextHistory.length > 1;
    this.canRedo = false;
  }

  _handleUndo() {
    if (this.historyIdx > 0) {
      const nextIdx = this.historyIdx - 1;
      this.historyIdx = nextIdx;
      this.canvasObjects = this.history[nextIdx];
      this.selectedObjectId = null;
      this.canUndo = nextIdx > 0;
      this.canRedo = true;
    }
  }

  _handleRedo() {
    if (this.historyIdx < this.history.length - 1) {
      const nextIdx = this.historyIdx + 1;
      this.historyIdx = nextIdx;
      this.canvasObjects = this.history[nextIdx];
      this.selectedObjectId = null;
      this.canUndo = true;
      this.canRedo = nextIdx < this.history.length - 1;
    }
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  _handleKeyDown(e) {
    if (!this.isOpen) return;
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.isContentEditable)
    ) {
      return;
    }
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      e.preventDefault();
      this._handleUndo();
    } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
      e.preventDefault();
      this._handleRedo();
    } else if (key === 'delete' || key === 'backspace') {
      if (this.selectedObjectId) {
        e.preventDefault();
        this._handleRemoveSelected();
      }
    } else if (key === 'v' || key === '1') {
      e.preventDefault();
      this._selectTool('pointer');
    } else if (key === 'b' || key === '2') {
      e.preventDefault();
      this._selectTool('pencil');
    } else if (key === 'e' || key === '3') {
      e.preventDefault();
      this._selectTool('eraser');
    } else if (key === 'r' || key === '4') {
      e.preventDefault();
      this._selectTool('rect');
    } else if (key === 'a' || key === '5') {
      e.preventDefault();
      this._selectTool('arrow');
    } else if (key === 't' || key === '6') {
      e.preventDefault();
      this._selectTool('text');
    } else if (key === 'i' || key === '7') {
      e.preventDefault();
      this._insertImageClick();
    }
  }

  _selectTool(tool) {
    this.activeTool = tool;
    this.selectedObjectId = null;
  }

  // ── Pointer drawing ──────────────────────────────────────────────────────
  _getCanvasMousePos(e) {
    const canvas = this._inkCanvas();
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    }
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  _handleCanvasClick(e) {
    const pos = this._getCanvasMousePos(e);
    if (this.activeTool === 'pointer') {
      let foundId = null;
      for (let i = this.canvasObjects.length - 1; i >= 0; i--) {
        const obj = this.canvasObjects[i];
        const bbox = getObjectBoundingBox(obj);
        if (bbox) {
          const tolerance = Math.max(16, (obj.brushSize || 5) * 2);
          if (
            pos.x >= bbox.x - tolerance &&
            pos.x <= bbox.x + bbox.width + tolerance &&
            pos.y >= bbox.y - tolerance &&
            pos.y <= bbox.y + bbox.height + tolerance
          ) {
            foundId = obj.id;
            break;
          }
        }
      }
      this.selectedObjectId = foundId;
    } else if (this.activeTool === 'text') {
      const fontSize = this.brushSize * 4 > 12 ? this.brushSize * 4 : 20;
      const newText = {
        id: uid(),
        type: 'text',
        text: 'Type text here...',
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        width: 160,
        height: Math.round(fontSize * 1.5),
        fontSize,
        color: this.brushColor,
      };
      const nextObjs = [...this.canvasObjects, newText];
      this.canvasObjects = nextObjs;
      this._saveStateToHistory(nextObjs);
      this.selectedObjectId = newText.id;
      this.activeTool = 'pointer';
    }
  }

  _handleStartDraw(e) {
    if (this.activeTool === 'pointer' || this.activeTool === 'text') return;
    const pos = this._getCanvasMousePos(e);
    this._drawing.isDrawing = true;
    this._drawing.startX = pos.x;
    this._drawing.startY = pos.y;
    this._drawing.currX = pos.x;
    this._drawing.currY = pos.y;
    this._drawing.activePoints = [pos];
    this._redrawCanvas();
  }

  _handleDrawing(e) {
    if (!this._drawing.isDrawing) return;
    const pos = this._getCanvasMousePos(e);
    this._drawing.currX = pos.x;
    this._drawing.currY = pos.y;
    if (this.activeTool === 'pencil' || this.activeTool === 'eraser') {
      this._drawing.activePoints.push(pos);
    }
    this._redrawCanvas();
  }

  _handleEndDraw(e) {
    if (!this._drawing.isDrawing) return;
    this._drawing.isDrawing = false;
    const pos = this._getCanvasMousePos(e);
    let newObj = null;
    const startX = this._drawing.startX;
    const startY = this._drawing.startY;
    if (this.activeTool === 'pencil') {
      newObj = {
        id: uid(),
        type: 'pencil',
        points: this._drawing.activePoints,
        color: this.brushColor,
        brushSize: this.brushSize,
      };
    } else if (this.activeTool === 'eraser') {
      newObj = {
        id: uid(),
        type: 'eraser',
        points: this._drawing.activePoints,
        brushSize: this.brushSize * 2,
      };
    } else if (this.activeTool === 'rect') {
      const w = pos.x - startX;
      const h = pos.y - startY;
      newObj = {
        id: uid(),
        type: 'rect',
        x: w < 0 ? startX + w : startX,
        y: h < 0 ? startY + h : startY,
        width: Math.abs(w),
        height: Math.abs(h),
        color: this.brushColor,
        brushSize: this.brushSize,
      };
    } else if (this.activeTool === 'arrow') {
      newObj = {
        id: uid(),
        type: 'arrow',
        x1: startX,
        y1: startY,
        x2: pos.x,
        y2: pos.y,
        color: this.brushColor,
        brushSize: this.brushSize,
      };
    }
    if (newObj) {
      const nextObjs = [...this.canvasObjects, newObj];
      this.canvasObjects = nextObjs;
      this._saveStateToHistory(nextObjs);
      this.selectedObjectId = newObj.id;
    }
  }

  // ── Drag / resize selected object ────────────────────────────────────────
  _handleStartMoveSelected(e) {
    e.preventDefault();
    if (this.activeTool !== 'pointer') return;
    const startX = e.clientX;
    const startY = e.clientY;
    const targetObj = this.canvasObjects.find((o) => o.id === this.selectedObjectId);
    if (!targetObj) return;
    const origObj = JSON.parse(JSON.stringify(targetObj));
    const selId = this.selectedObjectId;

    const handleMove = (moveEvent) => {
      const wrapper = this._canvasWrapper();
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const scaleX = this.canvasDimensions.width / rect.width;
      const scaleY = this.canvasDimensions.height / rect.height;
      const dx = (moveEvent.clientX - startX) * scaleX;
      const dy = (moveEvent.clientY - startY) * scaleY;
      this.canvasObjects = this.canvasObjects.map((o) => {
        if (o.id !== selId) return o;
        if (o.type === 'pencil' || o.type === 'eraser') {
          return { ...o, points: origObj.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
        }
        if (o.type === 'rect' || o.type === 'text' || o.type === 'image') {
          return { ...o, x: Math.round(origObj.x + dx), y: Math.round(origObj.y + dy) };
        }
        if (o.type === 'arrow') {
          return {
            ...o,
            x1: Math.round(origObj.x1 + dx),
            y1: Math.round(origObj.y1 + dy),
            x2: Math.round(origObj.x2 + dx),
            y2: Math.round(origObj.y2 + dy),
          };
        }
        return o;
      });
    };

    const handleMoveEnd = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleMoveEnd);
      this._saveStateToHistory(this.canvasObjects);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleMoveEnd);
  }

  _handleStartResizeSelected(e, direction) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const targetObj = this.canvasObjects.find((o) => o.id === this.selectedObjectId);
    if (!targetObj) return;
    const origObj = JSON.parse(JSON.stringify(targetObj));
    const origBbox = getObjectBoundingBox(origObj);
    const selId = this.selectedObjectId;

    const handleResize = (moveEvent) => {
      const wrapper = this._canvasWrapper();
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const scaleX = this.canvasDimensions.width / rect.width;
      const scaleY = this.canvasDimensions.height / rect.height;
      const dx = (moveEvent.clientX - startX) * scaleX;
      const dy = (moveEvent.clientY - startY) * scaleY;
      this.canvasObjects = this.canvasObjects.map((o) => {
        if (o.id !== selId) return o;
        if (o.type === 'rect' || o.type === 'text' || o.type === 'image') {
          let newX = origObj.x;
          let newY = origObj.y;
          let newW = origObj.width;
          let newH = origObj.height;
          if (direction.includes('l')) {
            newX = origObj.x + dx;
            newW = origObj.width - dx;
          }
          if (direction.includes('r')) {
            newW = origObj.width + dx;
          }
          if (direction.includes('t')) {
            newY = origObj.y + dy;
            newH = origObj.height - dy;
          }
          if (direction.includes('b')) {
            newH = origObj.height + dy;
          }
          return {
            ...o,
            x: Math.round(newX),
            y: Math.round(newY),
            width: Math.max(15, Math.round(newW)),
            height: Math.max(15, Math.round(newH)),
          };
        }
        if (o.type === 'arrow') {
          let newX1 = origObj.x1;
          let newY1 = origObj.y1;
          let newX2 = origObj.x2;
          let newY2 = origObj.y2;
          if (direction.includes('t') || direction.includes('l')) {
            newX1 = origObj.x1 + dx;
            newY1 = origObj.y1 + dy;
          }
          if (direction.includes('b') || direction.includes('r')) {
            newX2 = origObj.x2 + dx;
            newY2 = origObj.y2 + dy;
          }
          return {
            ...o,
            x1: Math.round(newX1),
            y1: Math.round(newY1),
            x2: Math.round(newX2),
            y2: Math.round(newY2),
          };
        }
        if (o.type === 'pencil' || o.type === 'eraser') {
          const wScale = (origBbox.width + dx) / origBbox.width;
          const hScale = (origBbox.height + dy) / origBbox.height;
          return {
            ...o,
            points: origObj.points.map((p) => ({
              x: origBbox.x + (p.x - origBbox.x) * wScale,
              y: origBbox.y + (p.y - origBbox.y) * hScale,
            })),
          };
        }
        return o;
      });
    };

    const handleResizeEnd = () => {
      window.removeEventListener('mousemove', handleResize);
      window.removeEventListener('mouseup', handleResizeEnd);
      this._saveStateToHistory(this.canvasObjects);
    };

    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', handleResizeEnd);
  }

  _handleRemoveSelected() {
    if (this.selectedObjectId) {
      const nextObjs = this.canvasObjects.filter((o) => o.id !== this.selectedObjectId);
      this.canvasObjects = nextObjs;
      this._saveStateToHistory(nextObjs);
      this.selectedObjectId = null;
    }
  }

  // ── Files ────────────────────────────────────────────────────────────────
  _handleUploadBg(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      this.bgImageUrl = ev.target.result;
      this.aspectRatio = 'Auto';
      this.viewState = 'canvas';
    };
    reader.readAsDataURL(file);
  }

  _insertImageClick() {
    const input = this.renderRoot.querySelector('input[data-insert-image]');
    input?.click();
  }

  _handleInsertImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const id = uid();
        const w = img.naturalWidth || img.width || 150;
        const h = img.naturalHeight || img.height || 150;
        const maxDim = 150;
        const scale = Math.min(maxDim / w, maxDim / h);
        const startW = Math.round(w * scale);
        const startH = Math.round(h * scale);
        const newImageObj = {
          id,
          type: 'image',
          img,
          url: ev.target.result,
          x: Math.round((this.canvasDimensions.width - startW) / 2),
          y: Math.round((this.canvasDimensions.height - startH) / 2),
          width: startW,
          height: startH,
        };
        const nextObjs = [...this.canvasObjects, newImageObj];
        this.canvasObjects = nextObjs;
        this._saveStateToHistory(nextObjs);
        this.selectedObjectId = id;
        this.activeTool = 'pointer';
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  _handleClearCanvas() {
    if (confirm('Clear all drawings, text overlays, and remove the background image?')) {
      const canvas = this._inkCanvas();
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      this.canvasObjects = [];
      this.selectedObjectId = null;
      this._saveStateToHistory([]);
      this.bgImageUrl = null;
      this.viewState = 'setup';
    }
  }

  // ── Generate ─────────────────────────────────────────────────────────────
  async _handleGenerateClick() {
    if (this.generating) return;
    const canvas = this._inkCanvas();
    const bgCanvas = this._bgCanvas();
    if (!canvas || !bgCanvas) return;
    this.generating = true;
    try {
      const mergeCanvas = document.createElement('canvas');
      mergeCanvas.width = canvas.width;
      mergeCanvas.height = canvas.height;
      const mCtx = mergeCanvas.getContext('2d');

      if (this.bgImageUrl) {
        const bgImg = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = this.bgImageUrl;
        });
        mCtx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
      } else {
        mCtx.drawImage(bgCanvas, 0, 0);
      }

      this.canvasObjects
        .filter((o) => o.type === 'image')
        .forEach((imgObj) => {
          mCtx.drawImage(imgObj.img, imgObj.x, imgObj.y, imgObj.width, imgObj.height);
        });

      mCtx.drawImage(canvas, 0, 0);

      this.canvasObjects
        .filter((o) => o.type === 'text')
        .forEach((textObj) => {
          mCtx.fillStyle = textObj.color;
          mCtx.font = `bold ${textObj.fontSize}px Inter, sans-serif`;
          mCtx.textBaseline = 'top';
          const words = textObj.text.split(' ');
          let line = '';
          let testY = textObj.y;
          const lineHeight = textObj.fontSize * 1.25;
          for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            let metrics = mCtx.measureText(testLine);
            let testWidth = metrics.width;
            if (testWidth > textObj.width && n > 0) {
              mCtx.fillText(line, textObj.x, testY);
              line = words[n] + ' ';
              testY += lineHeight;
            } else {
              line = testLine;
            }
          }
          mCtx.fillText(line, textObj.x, testY);
        });

      const blob = await new Promise((resolve) =>
        mergeCanvas.toBlob(resolve, 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('Canvas serialization failed');

      const uploadedUrl = await uploadFile(this.apiKey, blob);

      const results = await Promise.all(
        Array.from({ length: this.batchSize }).map(async () => {
          const genParams = {
            model: this.selectedModel,
            prompt: this.promptText.trim() || 'Edit the image based on the drawing overlay',
            images_list: [uploadedUrl],
            aspect_ratio: this.aspectRatio === 'Auto' ? '1:1' : this.aspectRatio,
          };
          return await generateI2I(this.apiKey, genParams);
        }),
      );

      results.forEach((res) => {
        if (res && res.url) {
          const entry = {
            id: res.id || uid(),
            url: res.url,
            prompt: `Draw to Edit with ${this.selectedModel === 'nano-banana-pro-edit' ? 'Nano Banana Pro Edit' : 'Nano Banana 2 Edit'}`,
            model: this.selectedModel,
            aspect_ratio: this.aspectRatio === 'Auto' ? '1:1' : this.aspectRatio,
            timestamp: new Date().toISOString(),
          };
          this.dispatchEvent(
            new CustomEvent('add-history-item', { detail: entry, bubbles: true, composed: true }),
          );
        }
      });

      alert('Generations complete!');
      this.isOpen = false;
      this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    } catch (e) {
      console.error('[DrawModal] Generation failed:', e);
      alert(`Generation failed: ${e.message}`);
    } finally {
      this.generating = false;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  render() {
    if (!this.isOpen) return nothing;

    const selectedObj = this.canvasObjects.find((o) => o.id === this.selectedObjectId);
    const bbox = getObjectBoundingBox(selectedObj);
    const dims = this.canvasDimensions;
    const pct = (v, total) => `${(v / total) * 100}%`;

    return html`
      <div
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      >
        <div
          class="relative w-full max-w-5xl bg-[#0b0b0d] border border-white/10 rounded-2xl flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden h-[90vh]"
        >
          <div
            class="flex items-center justify-between border-b border-white/5 p-4 shrink-0 bg-[#0f0f12]"
          >
            <div
              class="flex items-center gap-1.5 bg-[#131316]/60 border border-white/5 p-1 rounded-full select-none"
            >
              <button
                type="button"
                class=${'px-4 py-1.5 rounded-full text-xs font-semibold transition-all '}${
                  this.activeTab === 'draw-to-edit'
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white/70'
                }
                @click=${() => (this.activeTab = 'draw-to-edit')}
              >Draw to Edit</button>
            </div>
            <button
              type="button"
              @click=${() => {
                this.isOpen = false;
                this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
              }}
              class="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >×</button>
          </div>

          <div
            class="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto custom-scrollbar relative bg-[#070708]/30"
          >
            ${this.viewState === 'setup'
              ? html`
                  <div
                    class="border-2 border-dashed border-white/10 rounded-2xl p-8 max-w-md w-full text-center flex flex-col items-center gap-6 bg-[#070708]/50"
                  >
                    <div
                      class="w-56 h-36 rounded-xl border border-white/5 overflow-hidden shadow-lg select-none relative bg-black/40"
                    >
                      <img
                        src="/assets/videomodels/neta-lumina.avif"
                        alt="Draw visual representation"
                        class="w-full h-full object-cover opacity-60"
                      />
                      <div
                        class="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-md rounded-md p-1 px-2 border border-white/5 flex items-center gap-1"
                      ><div class="w-2.5 h-2.5 rounded-full bg-[#b5f500] animate-pulse"></div
                        ><span
                          class="text-[9px] text-white/50 tracking-wider uppercase font-bold"
                          >Sketchpad active</span
                        ></div>
                    </div>
                    <div>
                      <h2 class="text-white font-extrabold text-lg tracking-wide mb-1.5 uppercase">DRAW TO EDIT</h2>
                      <p class="text-white/40 text-xs font-medium max-w-xs leading-relaxed mx-auto">
                        From sketch to a complete picture in a second. No prompt
                        needed.
                      </p>
                    </div>
                    <div class="flex flex-col gap-2.5 w-full max-w-[240px]">
                      <button
                        type="button"
                        @click=${() =>
                          this.renderRoot
                            .querySelector('input[data-bg-upload]')
                            ?.click()}
                        class="bg-white hover:bg-white/90 text-black font-bold text-sm px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                        </svg>
                        Upload Media
                      </button>
                      <input
                        type="file"
                        data-bg-upload
                        @change=${this._handleUploadBg}
                        accept="image/*"
                        class="hidden"
                      />
                      <button
                        type="button"
                        @click=${() => {
                          this.bgImageUrl = null;
                          this.viewState = 'canvas';
                        }}
                        class="bg-[#131316]/80 hover:bg-[#1c1c22] text-white border border-white/10 font-bold text-sm px-6 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-inner"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        </svg>
                        Create blank
                      </button>
                    </div>
                  </div>
                `
              : html`
                  <div class="flex-1 flex flex-col items-center justify-center w-full relative h-full">
                    <div
                      class="flex items-center justify-center w-full"
                      style="height:60vh;max-height:60vh"
                    >
                      <div
                        data-canvas-wrapper
                        class="relative border border-white/10 shadow-2xl rounded-lg overflow-hidden bg-black select-none"
                        style=${`height:100%;width:auto;max-width:100%;aspect-ratio:${dims.width} / ${dims.height};`}
                      >
                        <canvas data-layer="bg" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>
                        <canvas
                          data-layer="ink"
                          @click=${this._handleCanvasClick}
                          @mousedown=${this._handleStartDraw}
                          @mousemove=${this._handleDrawing}
                          @mouseup=${this._handleEndDraw}
                          @mouseleave=${this._handleEndDraw}
                          @touchstart=${this._handleStartDraw}
                          @touchmove=${this._handleDrawing}
                          @touchend=${this._handleEndDraw}
                          class=${'absolute inset-0 w-full h-full '}${
                            this.activeTool === 'pointer'
                              ? 'cursor-default'
                              : 'cursor-crosshair'
                          }
                        ></canvas>

                        ${this.canvasObjects
                          .filter((o) => o.type === 'image')
                          .map(
                            (imgObj) => html`
                              <div
                                class=${'absolute group cursor-move '}${
                                  this.selectedObjectId === imgObj.id
                                    ? 'ring-2 ring-[#b5f500] ring-offset-1 ring-offset-black z-10'
                                    : ''
                                }
                                style=${`left:${pct(imgObj.x, dims.width)};top:${pct(imgObj.y, dims.height)};width:${pct(imgObj.width, dims.width)};height:${pct(imgObj.height, dims.height)};pointer-events:${this.activeTool === 'pointer' ? 'auto' : 'none'}`}
                                @mousedown=${(e) => {
                                  if (this.activeTool !== 'pointer') return;
                                  this.selectedObjectId = imgObj.id;
                                  this._handleStartMoveSelected(e);
                                }}
                              >
                                <img
                                  src=${imgObj.url}
                                  alt=""
                                  class="w-full h-full object-cover pointer-events-none"
                                />
                              </div>
                            `,
                          )}

                        ${this.canvasObjects
                          .filter((o) => o.type === 'text')
                          .map(
                            (textObj) => html`
                              <textarea
                                data-text-obj=${textObj.id}
                                .value=${textObj.text}
                                @input=${(e) => {
                                  const val = e.currentTarget.value;
                                  this.canvasObjects = this.canvasObjects.map((o) =>
                                    o.id === textObj.id ? { ...o, text: val } : o,
                                  );
                                }}
                                @focus=${() => {
                                  if (this.activeTool === 'pointer') {
                                    this.selectedObjectId = textObj.id;
                                  }
                                }}
                                class=${'absolute bg-transparent border-none outline-none resize-none font-bold text-left overflow-hidden select-text z-10 '}${
                                  this.selectedObjectId === textObj.id
                                    ? 'ring-1 ring-[#b5f500] ring-dashed bg-black/25'
                                    : ''
                                }
                                style=${`left:${pct(textObj.x, dims.width)};top:${pct(textObj.y, dims.height)};width:${pct(textObj.width, dims.width)};height:${pct(textObj.height, dims.height)};font-size:${(textObj.fontSize / dims.height) * 100}cqh;color:${textObj.color};line-height:1.25;pointer-events:${this.activeTool === 'pointer' ? 'auto' : 'none'}`}
                              ></textarea>
                            `,
                          )}

                        ${this.activeTool === 'pointer' && this.selectedObjectId && bbox
                          ? html`
                              <div
                                class="absolute border border-dashed border-[#b5f500] pointer-events-auto z-20 cursor-move"
                                style=${`left:${pct(bbox.x, dims.width)};top:${pct(bbox.y, dims.height)};width:${pct(bbox.width, dims.width)};height:${pct(bbox.height, dims.height)}`}
                                @mousedown=${this._handleStartMoveSelected}
                              >
                                <div
                                  class="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-[#b5f500] cursor-nwse-resize rounded-full"
                                  @mousedown=${(e) => this._handleStartResizeSelected(e, 'tl')}
                                ></div>
                                <div
                                  class="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-[#b5f500] cursor-nesw-resize rounded-full"
                                  @mousedown=${(e) => this._handleStartResizeSelected(e, 'tr')}
                                ></div>
                                <div
                                  class="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-[#b5f500] cursor-nesw-resize rounded-full"
                                  @mousedown=${(e) => this._handleStartResizeSelected(e, 'bl')}
                                ></div>
                                <div
                                  class="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-[#b5f500] cursor-nwse-resize rounded-full"
                                  @mousedown=${(e) => this._handleStartResizeSelected(e, 'br')}
                                ></div>
                                <div
                                  class="absolute -top-1.5 left-[calc(50%-6px)] w-3 h-3 bg-white border border-[#b5f500] cursor-ns-resize rounded-full"
                                  @mousedown=${(e) => this._handleStartResizeSelected(e, 't')}
                                ></div>
                                <div
                                  class="absolute -bottom-1.5 left-[calc(50%-6px)] w-3 h-3 bg-white border border-[#b5f500] cursor-ns-resize rounded-full"
                                  @mousedown=${(e) => this._handleStartResizeSelected(e, 'b')}
                                ></div>
                                <div
                                  class="absolute top-[calc(50%-6px)] -left-1.5 w-3 h-3 bg-white border border-[#b5f500] cursor-ew-resize rounded-full"
                                  @mousedown=${(e) => this._handleStartResizeSelected(e, 'l')}
                                ></div>
                                <div
                                  class="absolute top-[calc(50%-6px)] -right-1.5 w-3 h-3 bg-white border border-[#b5f500] cursor-ew-resize rounded-full"
                                  @mousedown=${(e) => this._handleStartResizeSelected(e, 'r')}
                                ></div>
                              </div>
                            `
                          : nothing}

                        ${this.activeTool === 'pointer' && this.selectedObjectId
                          ? html`
                              <button
                                type="button"
                                @click=${this._handleRemoveSelected}
                                class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/90 hover:bg-black text-white border border-white/10 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xl z-30 transition-all pointer-events-auto select-none"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                </svg>
                                Remove selected
                              </button>
                            `
                          : nothing}
                      </div>
                    </div>

                    <div
                      class="mt-6 bg-[#0f0f11]/90 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-2xl flex items-center gap-3 shadow-2xl z-20 select-none"
                    >
                      ${this._toolButton('pointer', 'Selection pointer', '<polygon points="3 11 22 2 13 21 11 13 3 11" />')}
                      ${this._toolButton('pencil', 'Draw pencil', '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />')}
                      ${this._toolButton('eraser', 'Eraser (E)', '<path d="M20 20H7L3 16c-1-1-1-2.5 0-3.5L13 2c1-1 2.5-1 3.5 0l4 4c1 1 1 2.5 0 3.5L11 19l9 1z" />')}
                      ${this._toolButton('rect', 'Rectangle shape', '<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />')}
                      ${this._toolButton('arrow', 'Arrow shape', '<line x1="5" y1="19" x2="19" y2="5" /><polyline points="12 5 19 5 19 12" />')}
                      <button
                        type="button"
                        @click=${() => this._selectTool('text')}
                        title="Text tool"
                        class=${'p-1.5 rounded-lg transition-all '}${
                          this.activeTool === 'text'
                            ? 'bg-white text-black'
                            : 'text-white/60 hover:text-white'
                        }
                      >
                        <span class="text-sm font-black tracking-tight select-none px-0.5">T</span>
                      </button>
                      <button
                        type="button"
                        @click=${this._insertImageClick}
                        title="Insert overlay image"
                        class=${'p-1.5 rounded-lg transition-all '}${
                          this.activeTool === 'image'
                            ? 'bg-white text-black'
                            : 'text-white/60 hover:text-white'
                        }
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </button>
                      <input
                        type="file"
                        data-insert-image
                        @change=${this._handleInsertImage}
                        accept="image/*"
                        class="hidden"
                      />
                      <div class="h-6 w-px bg-white/10 mx-0.5"></div>
                      <div
                        class="flex items-center gap-1.5 bg-[#16161a]/60 px-2 py-1 rounded-xl border border-white/5"
                      >
                        ${PRESET_COLORS.map(
                          (col) => html`
                            <button
                              type="button"
                              @click=${() => (this.brushColor = col)}
                              class="w-4 h-4 rounded-full border border-white/10 hover:scale-110 transition-transform relative flex items-center justify-center"
                              style=${`background-color:${col}`}
                            >${this.brushColor === col
                              ? html`<span class="w-1.5 h-1.5 rounded-full bg-white mix-blend-difference"></span>`
                              : nothing}</button>
                          `,
                        )}
                      </div>
                      <div class="h-6 w-px bg-white/10 mx-0.5"></div>
                      <button
                        type="button"
                        @click=${this._handleUndo}
                        ?disabled=${!this.canUndo}
                        title="Undo"
                        class="p-1.5 rounded-lg text-white/60 hover:text-white disabled:opacity-25 transition-all"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <path d="M3 7v6h6M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        @click=${this._handleRedo}
                        ?disabled=${!this.canRedo}
                        title="Redo"
                        class="p-1.5 rounded-lg text-white/60 hover:text-white disabled:opacity-25 transition-all"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <path d="M21 7v6h-6M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        @click=${this._handleGenerateClick}
                        ?disabled=${this.generating}
                        class="ml-1 bg-[#b5f500] hover:opacity-90 active:scale-[0.97] transition-all text-black font-extrabold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md shadow-[#b5f500]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ${this.generating
                          ? html`<span class="animate-spin inline-block">◌</span>Generating...`
                          : html`Generate Image<span class="opacity-80">✦ ${this.batchSize}</span>`}
                      </button>
                    </div>
                  </div>
                `}
          </div>

          ${this.viewState === 'canvas'
            ? html`
                <div
                  class="border-t border-white/5 p-4 shrink-0 bg-[#0f0f12] flex items-center justify-between z-20"
                >
                  <div class="flex items-center gap-2">
                    <div class="relative" data-drop="model">
                      <button
                        type="button"
                        @click=${() => (this.isModelDropdownOpen = !this.isModelDropdownOpen)}
                        class="h-[38px] flex items-center gap-2 px-3 bg-[#131316]/80 hover:bg-[#1c1c22] rounded-xl border border-white/5 text-xs text-white/70 whitespace-nowrap shadow-xl"
                      >
                        <span class="text-[10px] text-[#b5f500] font-black bg-[#b5f500]/10 px-1.5 rounded border border-[#b5f500]/25">G</span
                        >${this.selectedModel === 'nano-banana-pro-edit'
                            ? 'Nano Banana Pro Edit'
                            : 'Nano Banana 2 Edit'}<span class="opacity-45 text-[8px] ml-0.5"
                          >▼</span
                        >
                      </button>
                      ${this.isModelDropdownOpen
                        ? html`
                            <div
                              class="absolute bottom-[calc(100%+8px)] left-0 bg-[#0f0f12] border border-white/10 rounded-2xl p-2 w-64 shadow-2xl flex flex-col gap-1 z-30"
                            >
                              <div class="text-[10px] font-black text-white/30 uppercase tracking-widest p-1.5 pb-1 select-none">Select model</div>
                              <button
                                type="button"
                                @click=${() => {
                                  this.selectedModel = 'nano-banana-2-edit';
                                  this.isModelDropdownOpen = false;
                                }}
                                class=${'flex flex-col text-left p-2.5 rounded-xl transition-all '}${
                                  this.selectedModel === 'nano-banana-2-edit'
                                    ? 'bg-[#b5f500]/10 text-white'
                                    : 'hover:bg-white/5 text-white/70'
                                }
                              >
                                <div class="text-xs font-bold flex items-center gap-1.5">Nano Banana 2 Edit${
                                  this.selectedModel === 'nano-banana-2-edit'
                                    ? html`<span class="text-[#b5f500]">✓</span>`
                                    : nothing
                                }</div>
                                <div class="text-[9px] text-white/30 leading-snug mt-0.5">Google's Advanced Image Editing Model</div>
                              </button>
                              <button
                                type="button"
                                @click=${() => {
                                  this.selectedModel = 'nano-banana-pro-edit';
                                  this.isModelDropdownOpen = false;
                                }}
                                class=${'flex flex-col text-left p-2.5 rounded-xl transition-all '}${
                                  this.selectedModel === 'nano-banana-pro-edit'
                                    ? 'bg-[#b5f500]/10 text-white'
                                    : 'hover:bg-white/5 text-white/70'
                                }
                              >
                                <div class="text-xs font-bold flex items-center gap-1.5">Nano Banana Pro Edit${
                                  this.selectedModel === 'nano-banana-pro-edit'
                                    ? html`<span class="text-[#b5f500]">✓</span>`
                                    : nothing
                                }</div>
                                <div class="text-[9px] text-white/30 leading-snug mt-0.5">Best 4K Image Model Ever</div>
                              </button>
                            </div>
                          `
                        : nothing}
                    </div>
                    <div class="relative">
                      <button
                        type="button"
                        @click=${() => (this.showSettingsPopover = !this.showSettingsPopover)}
                        class="h-[38px] w-[38px] flex items-center justify-center bg-[#131316]/80 hover:bg-[#1c1c22] rounded-xl border border-white/5 text-white/60 shadow-xl transition-all"
                        title="Adjust Brush / Font Size"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <line x1="4" y1="21" x2="4" y2="14" />
                          <line x1="4" y1="10" x2="4" y2="3" />
                          <line x1="12" y1="21" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12" y2="3" />
                          <line x1="20" y1="21" x2="20" y2="16" />
                          <line x1="20" y1="12" x2="20" y2="3" />
                          <line x1="1" y1="14" x2="7" y2="14" />
                          <line x1="9" y1="8" x2="15" y2="8" />
                          <line x1="17" y1="16" x2="23" y2="16" />
                        </svg>
                      </button>
                      ${this.showSettingsPopover
                        ? html`
                            <div
                              class="absolute bottom-[calc(100%+8px)] left-0 bg-[#0f0f12] border border-white/10 rounded-2xl p-3.5 w-44 shadow-2xl flex flex-col gap-2 z-30"
                            >
                              <div class="text-[10px] font-black text-white/30 uppercase tracking-widest">${selectedObj && selectedObj.type === 'text'
                                ? 'Text Size'
                                : 'Brush Size'}</div>
                              <input
                                type="range"
                                min="1"
                                max="100"
                                .value=${this.brushSize}
                                @input=${(e) => (this.brushSize = parseInt(e.currentTarget.value))}
                                class="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#b5f500]"
                              />
                              <span class="text-[11px] font-bold text-white/60 text-right">${this.brushSize}px</span>
                            </div>
                          `
                        : nothing}
                    </div>
                  </div>

                  <input
                    type="text"
                    .value=${this.promptText}
                    @input=${(e) => (this.promptText = e.currentTarget.value)}
                    @keydown=${(e) => {
                      if (e.key === 'Enter' && !this.generating) this._handleGenerateClick();
                    }}
                    placeholder="Describe what you want to generate…"
                    class="flex-1 mx-3 h-[38px] bg-[#131316]/80 border border-white/5 rounded-xl px-3 text-xs text-white/80 placeholder-white/25 outline-none focus:border-[#b5f500]/40 focus:ring-1 focus:ring-[#b5f500]/20 transition-all"
                  />

                  <div class="flex items-center gap-2">
                    <div class="relative" data-drop="ar">
                      <button
                        type="button"
                        @click=${() => (this.isArDropdownOpen = !this.isArDropdownOpen)}
                        class="h-[38px] flex items-center gap-2 px-3 bg-[#131316]/80 hover:bg-[#1c1c22] rounded-xl border border-white/5 text-xs text-white/70 whitespace-nowrap shadow-xl"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-50">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        </svg
                        >${this.aspectRatio}<span class="opacity-45 text-[8px] ml-0.5">▼</span>
                      </button>
                      ${this.isArDropdownOpen
                        ? html`
                            <div
                              class="absolute bottom-[calc(100%+8px)] right-0 bg-[#0f0f12] border border-white/10 rounded-xl p-2 w-36 max-h-72 overflow-y-auto shadow-2xl flex flex-col gap-1 z-30"
                            >
                              <div class="text-[10px] font-black text-white/30 uppercase tracking-widest p-1.5 pb-1 select-none">Aspect Ratio</div>
                              ${['16:9', '9:16', '4:3', '3:4', '1:1', 'Auto'].map(
                                (r) => html`
                                  <button
                                    type="button"
                                    @click=${() => {
                                      this.aspectRatio = r;
                                      this.isArDropdownOpen = false;
                                    }}
                                    class=${'text-left p-1.5 px-2.5 rounded-xl text-xs font-bold transition-all '}${
                                      this.aspectRatio === r
                                        ? 'bg-[#b5f500]/10 text-white'
                                        : 'hover:bg-white/5 text-white/70'
                                    }
                                  >${r}</button>
                                `,
                              )}
                            </div>
                          `
                        : nothing}
                    </div>
                    <button
                      type="button"
                      @click=${this._handleClearCanvas}
                      title="Clear drawings"
                      class="h-[38px] w-[38px] flex items-center justify-center bg-[#131316]/80 hover:bg-[#1c1c22] rounded-xl border border-white/5 text-white/60 shadow-xl transition-all"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      @click=${() =>
                        alert(
                          'Draw to Edit: paint directly over an image, insert overlay image/text objects, drag/resize elements, or select and delete specific components.',
                        )}
                      title="Info"
                      class="h-[38px] w-[38px] flex items-center justify-center bg-[#131316]/80 hover:bg-[#1c1c22] rounded-xl border border-white/5 text-white/60 shadow-xl transition-all"
                    >
                      <span class="text-xs font-bold leading-none">i</span>
                    </button>
                  </div>
                </div>
              `
            : nothing}
        </div>
      </div>
    `;
  }

  _toolButton(tool, title, iconMarkup) {
    return html`
      <button
        type="button"
        @click=${() => this._selectTool(tool)}
        title=${title}
        class=${'p-1.5 rounded-lg transition-all '}${
          this.activeTool === tool ? 'bg-white text-black' : 'text-white/60 hover:text-white'
        }
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${unsafeHTML(iconMarkup)}</svg>
      </button>
    `;
  }
}

customElements.define('draw-modal', DrawModal);
