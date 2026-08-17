// Port of packages/studio/src/components/LayersStudio.jsx.
// Full-bleed image editor: canvas tools (pointer/hand/lasso/regional-edit/
// marker/eraser/shapes), zoom & pan, live color grading, layer decomposition
// carousel, upscale / remove-bg / expand panels, tools menu.
//
// Porting notes:
// - The original has NO persistence (everything is fresh per mount) and the
//   shell passes no props, so apiKey is undefined and every API action
//   short-circuits with its "API key" toast - kept verbatim.
// - The upscale model dropdown in the original has no outside-click handler
//   (only the toggle button and option clicks close it) - kept verbatim.
// - The original's progress intervals are only cleared on success (a leaked
//   interval survives the catch path). Ported faithfully; intervals are
//   dropped on disconnect to avoid unbounded timers across navigation
//   (behaviorally invisible).
// - The original's nested <Toaster position="top-center"> is replaced by the
//   app-wide toast (same as every other migrated studio).
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import toast from '../../lib/toast.js';
import {
  decomposeLayers,
  uploadFile,
  generateI2I,
  upscaleImage,
  removeBackground,
  expandImage,
} from 'studio/muapi.js';
import { formatErrorMessage } from 'studio/utils/formatError.js';
import { matchesOrigin } from 'studio/modelOrigin.js';
import { modelOriginBadge, originFilterPills } from './origin-filter.js';

// Upscale Models Definition from schema_data.json
const UPSCALE_MODELS = [
  {
    id: 'topaz-image-upscale',
    name: 'Topaz',
    subtitle: 'The default model for general-purpose...',
    cost: '1.0',
  },
  {
    id: 'seedvr2-image-upscale',
    name: 'SeedVR2',
    subtitle: 'Diffusion-transformer super-resolution (up to 8K)',
    cost: '0.02',
  },
  {
    id: 'ai-image-upscaler',
    name: 'AI Upscaler',
    subtitle: 'Fast 1-click automatic super-resolution',
    cost: '1.0',
  },
];

// Sample initial image & decomposed layers for demonstration (bundled in public/assets/samples/)
const DEFAULT_SAMPLE_IMAGE = '/assets/samples/1786019968051_cKRYLHHu.png';

const DEFAULT_SAMPLE_LAYERS = [
  '/assets/samples/1786021161819_iOe80bNR.webp',
  '/assets/samples/1786020452731_mB4m6NFR.webp',
  '/assets/samples/1786021169234_iyVccSAA.webp',
  '/assets/samples/1786021154170_Dx9snemT.webp',
  '/assets/samples/1786021150882_p9lgz4lY.webp',
];

// Preset colors for Marker & Shapes tool
const PRESET_COLORS = [
  '#ffffff', // White
  '#22c55e', // Green
  '#eab308', // Yellow
  '#ef4444', // Red
  '#14b8a6', // Turquoise
  '#38bdf8', // Sky Blue
  '#ec4899', // Pink
  '#000000', // Black
];

const DEFAULT_COLOR_GRADING = {
  colorCorrect: {
    temp: 0,
    hue: 0.0,
    saturation: 0,
    contrast: 0,
    splitTone: 0.0,
  },
  softenDetails: { radius: 0, detail: 0.0 },
  bloom: { radius: 0, bright: 4.0, fade: 0.0, blend: 'Screen' },
  halation: { strength: 0.0, threshold: 0.0, radius: 0 },
  lensInstructions: {
    strength: 0.0,
    radius: 0,
    vignette: 0.0,
    distortion: 0.0,
  },
  exposure: { stops: 0.0 },
  filmGrain: { strength: 0.0, bias: 0.0, size: '16mm' },
};

const SIDE_MENU_ITEMS = [
  { id: 'layer-decomposition', label: 'Layer Decomposition', isNew: true },
  { id: 'upscale', label: 'Upscale', isNew: true },
  { id: 'color-grading', label: 'Color Grading', isNew: true },
  { id: 'remove-bg', label: 'Remove background', isNew: true },
  { id: 'expand-crop', label: 'Expand & Outpaint', isNew: true },
  { id: 'edit-text', label: 'Edit text', isNew: false },
  { id: 'enhancer', label: 'Enhancer', isNew: false },
  { id: 'relight', label: 'Relight', isNew: false },
  { id: 'angles', label: 'Angles', isNew: false },
];

function checkerboardStyle(backgroundImage, size, position) {
  return (
    `background-image: ${backgroundImage}; background-size: ${size};` +
    (position ? ` background-position: ${position};` : '')
  );
}

const CHECKERBOARD_6 = checkerboardStyle(
  'linear-gradient(45deg, #242733 25%, transparent 25%), linear-gradient(-45deg, #242733 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #242733 75%), linear-gradient(-45deg, transparent 75%, #242733 75%)',
  '6px 6px',
);

const CHECKERBOARD_16 = checkerboardStyle(
  'linear-gradient(45deg, #1c1f26 25%, transparent 25%), linear-gradient(-45deg, #1c1f26 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1c1f26 75%), linear-gradient(-45deg, transparent 75%, #1c1f26 75%)',
  '16px 16px',
  '0 0, 0 8px, 8px -8px, -8px 0px',
);

const CHECKERBOARD_14 = checkerboardStyle(
  'linear-gradient(45deg, #1c1f26 25%, transparent 25%), linear-gradient(-45deg, #1c1f26 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1c1f26 75%), linear-gradient(-45deg, transparent 75%, #1c1f26 75%)',
  '14px 14px',
  '0 0, 0 7px, 7px -7px, -7px 0px',
);

export class StudioLayers extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    // White-label contract prop (was a React prop; the shell passes none).
    apiKey: { type: String },

    currentImageUrl: { state: true },
    prompt: { state: true },
    isProcessing: { state: true },
    progress: { state: true },

    resolution: { state: true },
    layerCount: { state: true },

    upscaleModel: { state: true },
    isModelDropdownOpen: { state: true },
    topazFactor: { state: true },
    seedvrResolution: { state: true },
    modelOriginFilter: { state: true },

    colorGrading: { state: true },
    openSections: { state: true },

    activeTool: { state: true },
    zoomLevel: { state: true },
    panOffset: { state: true },

    lassoPoints: { state: true },
    isDraggingLasso: { state: true },

    regionalBox: { state: true },
    isSelectingRegion: { state: true },

    regionalPrompt: { state: true },
    markedRegions: { state: true },

    activeShape: { state: true },
    shapeColor: { state: true },

    brushColor: { state: true },
    brushSize: { state: true },

    activeSideTab: { state: true },
    isSidebarOpen: { state: true },
    textEditPrompt: { state: true },

    uploading: { state: true },
    uploadProgress: { state: true },
    decomposedLayers: { state: true },
    carouselIndex: { state: true },
    visibleLayers: { state: true },
    isSoloMode: { state: true },

    historyStack: { state: true },
    historyIndex: { state: true },
  };

  static styles = [
    css`
      :host {
        display: block;
        height: 100%;
      }
    `,
  ];

  constructor() {
    super();
    // White-label contract props (were React props; the shell passes none).
    this.apiKey = '';

    // Main canvas & image state
    this.currentImageUrl = DEFAULT_SAMPLE_IMAGE;
    this.prompt = '';
    this.isProcessing = false;
    this.progress = 0;

    // Layer Decomposition Sidebar Settings
    this.resolution = '1K'; // '1K' | '1.5K' | '2K'
    this.layerCount = 8;
    this.outputFormat = 'png';

    // Upscale Clean Panel State
    this.upscaleModel = 'topaz-image-upscale';
    this.isModelDropdownOpen = false;
    this.topazFactor = 1;
    this.seedvrResolution = '4k';
    this.modelOriginFilter = 'all';

    // Color Grading State (Individual Category Resets, No Toggles)
    this.colorGrading = structuredClone(DEFAULT_COLOR_GRADING);

    // Accordion open/close state for Color Grading sections
    this.openSections = {
      colorCorrect: true,
      softenDetails: true,
      bloom: true,
      halation: true,
      lensInstructions: true,
      exposure: true,
      filmGrain: true,
    };

    // Active Tool state: 'pointer' | 'hand' | 'lasso' | 'regional-edit' | 'draw' | 'eraser' | 'shapes'
    this.activeTool = 'pointer';

    // Viewport Zoom & Pan
    this.zoomLevel = 100;
    this.panOffset = { x: 0, y: 0 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };

    // 1. FREEHAND LASSO EDIT STATE
    this.lassoPoints = [];
    this.isDraggingLasso = false;

    // 2. RECTANGULAR REGIONAL EDIT BOX STATE
    this.regionalBox = { x: 25, y: 35, width: 50, height: 30 };
    this.isSelectingRegion = false;
    this.dragStartRegion = null;

    // Floating Regional/Lasso Prompt State
    this.regionalPrompt = '';

    // 3. MARKED REGIONS STACK FOR SEEDREAM 5 PRO BBOX LAYER PROMPTING
    this.markedRegions = [];

    // 4. SHAPES (R) TOOL STATE
    this.activeShape = 'rect';
    this.shapeColor = '#ffffff';
    this.shapeSize = 3;
    this.isDrawingShape = false;
    this.shapeStart = { x: 0, y: 0 };
    this.tempCanvasImageData = null;

    // 5. DRAWING / MARKER PEN STATE
    this.brushColor = '#ef4444';
    this.brushSize = 8;
    this.isDrawing = false;

    // Right Inspector Panel State
    this.activeSideTab = 'layer-decomposition';
    this.isSidebarOpen = true;

    // Tool Specific Inputs
    this.textEditPrompt = '';

    // Upload & Decomposed Layers State
    this.uploading = false;
    this.uploadProgress = 0;
    this.decomposedLayers = [];
    this.carouselIndex = 0;
    this.visibleLayers = {};
    this.isSoloMode = false;

    // Drawing History Stack
    this.historyStack = [];
    this.historyIndex = -1;

    this._progressIntervals = new Set();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const t of this._progressIntervals) clearInterval(t);
    this._progressIntervals.clear();
  }

  updated(changed) {
    if (changed.has('currentImageUrl')) {
      this._syncCanvasDimensions();
    }
  }

  // ─── DOM helpers ──────────────────────────────────────────────────────────

  _drawCanvas() {
    return this.renderRoot.querySelector('[data-drawing-canvas]');
  }

  _mainImg() {
    return this.renderRoot.querySelector('[data-main-image]');
  }

  _imageWrapper() {
    return this.renderRoot.querySelector('[data-image-wrapper]');
  }

  _fileInput() {
    return this.renderRoot.querySelector('[data-file-input]');
  }

  // Sync drawing canvas overlay resolution with displayed image
  _syncCanvasDimensions() {
    const canvas = this._drawCanvas();
    const img = this._mainImg();
    if (canvas && img && img.complete) {
      canvas.width = img.naturalWidth || img.clientWidth || 1024;
      canvas.height = img.naturalHeight || img.clientHeight || 1024;
    }
  }

  // Live CSS Filter computation from Color Grading settings
  _getColorGradingCSSFilter() {
    let filterStr = '';
    const { colorCorrect, exposure, softenDetails, bloom, halation } =
      this.colorGrading;

    // Exposure (stops: -5..5 -> brightness multiplier 2^stops)
    if (exposure.stops !== 0) {
      const expBrightness = Math.max(0, Math.pow(2, exposure.stops) * 100);
      filterStr += `brightness(${expBrightness}%) `;
    }

    // Color Correct (contrast, saturation, hue, temp, splitTone)
    if (colorCorrect.contrast !== 0) {
      filterStr += `contrast(${100 + colorCorrect.contrast}%) `;
    }
    if (colorCorrect.saturation !== 0) {
      filterStr += `saturate(${100 + colorCorrect.saturation}%) `;
    }
    if (colorCorrect.hue !== 0) {
      filterStr += `hue-rotate(${colorCorrect.hue}deg) `;
    }
    if (colorCorrect.temp !== 0) {
      if (colorCorrect.temp > 0) {
        filterStr += `sepia(${colorCorrect.temp * 0.45}%) saturate(${
          100 + colorCorrect.temp * 0.3
        }%) `;
      } else {
        filterStr += `hue-rotate(${colorCorrect.temp * 0.5}deg) saturate(${
          100 + Math.abs(colorCorrect.temp) * 0.2
        }%) `;
      }
    }
    if (colorCorrect.splitTone > 0) {
      filterStr += `saturate(${100 + colorCorrect.splitTone * 40}%) contrast(${
        100 + colorCorrect.splitTone * 20
      }%) `;
    }

    // Soften Details (blur)
    if (softenDetails.radius > 0) {
      filterStr += `blur(${softenDetails.radius * 0.25}px) `;
    }

    // Bloom (glow / brightness halo)
    if (bloom.radius > 0 || bloom.bright !== 4.0) {
      const bloomOpacity = (bloom.bright / 10) * (1 - bloom.fade) * 0.45;
      if (bloomOpacity > 0) {
        filterStr += `drop-shadow(0 0 ${bloom.radius || 8}px rgba(255,255,255,${bloomOpacity})) `;
      }
    }

    // Halation (red edge glow around highlights)
    if (halation.strength > 0) {
      filterStr += `drop-shadow(0 0 ${halation.radius || 6}px rgba(255, 45, 30, ${halation.strength * 0.85})) `;
    }

    return filterStr.trim() || 'none';
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  // Upload File Helper
  async _handleUploadFile(file) {
    if (!this.apiKey) {
      toast.error('Please enter your API Key to upload images.');
      return;
    }
    this.uploading = true;
    this.uploadProgress = 0;
    try {
      const uploadedUrl = await uploadFile(
        this.apiKey,
        file,
        (pct) => {
          this.uploadProgress = pct;
        },
      );
      this.currentImageUrl = uploadedUrl;
      this.decomposedLayers = [];
      this.markedRegions = [];
      this.carouselIndex = 0;
      this.lassoPoints = [];
      this._clearDrawingCanvas();
      toast.success('Image uploaded successfully!');
    } catch (err) {
      toast.error(`Upload failed: ${formatErrorMessage(err)}`);
    } finally {
      this.uploading = false;
    }
  }

  _onFileInputChange(e) {
    if (e.target.files && e.target.files[0]) {
      this._handleUploadFile(e.target.files[0]);
    }
  }

  // Helper to convert mouse/touch events to normalized coordinates (0 to 1000) & percentages
  _getImageNormalizedCoords(e) {
    const wrapper = this._imageWrapper() || this._mainImg();
    if (!wrapper) return { x: 0, y: 0, xPct: 0, yPct: 0 };
    const rect = wrapper.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const xPx = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const yPx = Math.max(0, Math.min(rect.height, clientY - rect.top));

    return {
      x: (xPx / rect.width) * 1000,
      y: (yPx / rect.height) * 1000,
      xPct: (xPx / rect.width) * 100,
      yPct: (yPx / rect.height) * 100,
    };
  }

  // ─── Lasso, regional & shape drag logic ──────────────────────────────────

  _handleImageMouseDown(e) {
    const coords = this._getImageNormalizedCoords(e);

    if (this.activeTool === 'lasso') {
      e.stopPropagation();
      this.isDraggingLasso = true;
      this.lassoPoints = [{ x: coords.x, y: coords.y }];
    } else if (this.activeTool === 'regional-edit') {
      e.stopPropagation();
      this.dragStartRegion = coords;
      this.isSelectingRegion = true;
      this.regionalBox = {
        x: coords.xPct,
        y: coords.yPct,
        width: 0,
        height: 0,
      };
    } else if (this.activeTool === 'shapes') {
      e.stopPropagation();
      this.isDrawingShape = true;
      const canvasCoords = this._getCanvasCoords(e);
      this.shapeStart = canvasCoords;

      const canvas = this._drawCanvas();
      if (canvas) {
        const ctx = canvas.getContext('2d');
        this.tempCanvasImageData = ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        );
      }
    }
  }

  _handleImageMouseMove(e) {
    const coords = this._getImageNormalizedCoords(e);

    if (this.activeTool === 'lasso' && this.isDraggingLasso) {
      e.stopPropagation();
      this.lassoPoints = [...this.lassoPoints, { x: coords.x, y: coords.y }];
    } else if (
      this.activeTool === 'regional-edit' &&
      this.isSelectingRegion &&
      this.dragStartRegion
    ) {
      e.stopPropagation();
      const minX = Math.min(this.dragStartRegion.xPct, coords.xPct);
      const minY = Math.min(this.dragStartRegion.yPct, coords.yPct);
      const width = Math.abs(coords.xPct - this.dragStartRegion.xPct);
      const height = Math.abs(coords.yPct - this.dragStartRegion.yPct);

      this.regionalBox = {
        x: minX,
        y: minY,
        width: Math.max(2, width),
        height: Math.max(2, height),
      };
    } else if (this.activeTool === 'shapes' && this.isDrawingShape) {
      e.stopPropagation();
      const endCoords = this._getCanvasCoords(e);
      this._drawLiveShapePreview(this.shapeStart, endCoords);
    }
  }

  _drawLiveShapePreview(start, end) {
    const canvas = this._drawCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (this.tempCanvasImageData) {
      ctx.putImageData(this.tempCanvasImageData, 0, 0);
    }

    ctx.beginPath();
    ctx.strokeStyle = this.shapeColor;
    ctx.fillStyle = this.shapeColor;
    ctx.lineWidth = this.shapeSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (this.activeShape === 'line') {
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    } else if (this.activeShape === 'arrow') {
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - 14 * Math.cos(angle - Math.PI / 6),
        end.y - 14 * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        end.x - 14 * Math.cos(angle + Math.PI / 6),
        end.y - 14 * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();
    } else if (this.activeShape === 'rect') {
      const w = end.x - start.x;
      const h = end.y - start.y;
      ctx.strokeRect(start.x, start.y, w, h);
    } else if (this.activeShape === 'circle') {
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      const cx = Math.min(start.x, end.x) + rx;
      const cy = Math.min(start.y, end.y) + ry;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }

  _handleImageMouseUp(e) {
    if (this.isDraggingLasso) {
      if (e) e.stopPropagation();
      this.isDraggingLasso = false;
      if (this.lassoPoints.length > 5) {
        const xs = this.lassoPoints.map((p) => p.x);
        const ys = this.lassoPoints.map((p) => p.y);
        const minX = Math.round(Math.min(...xs));
        const minY = Math.round(Math.min(...ys));
        const maxX = Math.round(Math.max(...xs));
        const maxY = Math.round(Math.max(...ys));
        this.markedRegions = [
          ...this.markedRegions,
          {
            id: Date.now(),
            type: 'lasso',
            label: `Layer ${this.markedRegions.length + 1}`,
            bbox: { xmin: minX, ymin: minY, xmax: maxX, ymax: maxY },
          },
        ];
      }
    }
    if (this.isSelectingRegion) {
      if (e) e.stopPropagation();
      this.isSelectingRegion = false;
      if (this.regionalBox.width > 2 && this.regionalBox.height > 2) {
        const xmin = Math.round(this.regionalBox.x * 10);
        const ymin = Math.round(this.regionalBox.y * 10);
        const xmax = Math.round(
          (this.regionalBox.x + this.regionalBox.width) * 10,
        );
        const ymax = Math.round(
          (this.regionalBox.y + this.regionalBox.height) * 10,
        );
        this.markedRegions = [
          ...this.markedRegions,
          {
            id: Date.now(),
            type: 'region',
            label: `Layer ${this.markedRegions.length + 1}`,
            bbox: { xmin, ymin, xmax, ymax },
          },
        ];
      }
    }
    if (this.isDrawingShape && this.activeTool === 'shapes') {
      if (e) e.stopPropagation();
      this.isDrawingShape = false;
      const endCoords = this._getCanvasCoords(e);
      this._drawLiveShapePreview(this.shapeStart, endCoords);
      this.tempCanvasImageData = null;
      this._saveCanvasState();

      const canvas = this._drawCanvas();
      if (canvas && canvas.width && canvas.height) {
        const xmin = Math.round(
          (Math.min(this.shapeStart.x, endCoords.x) / canvas.width) * 1000,
        );
        const ymin = Math.round(
          (Math.min(this.shapeStart.y, endCoords.y) / canvas.height) * 1000,
        );
        const xmax = Math.round(
          (Math.max(this.shapeStart.x, endCoords.x) / canvas.width) * 1000,
        );
        const ymax = Math.round(
          (Math.max(this.shapeStart.y, endCoords.y) / canvas.height) * 1000,
        );
        this.markedRegions = [
          ...this.markedRegions,
          {
            id: Date.now(),
            type: this.activeShape,
            label: `Layer ${this.markedRegions.length + 1}`,
            bbox: { xmin, ymin, xmax, ymax },
          },
        ];
      }
    }
  }

  // ─── Drawing canvas logic ─────────────────────────────────────────────────

  _saveCanvasState() {
    const canvas = this._drawCanvas();
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    const newStack = this.historyStack.slice(0, this.historyIndex + 1);
    newStack.push(dataUrl);
    this.historyStack = newStack;
    this.historyIndex = newStack.length - 1;
  }

  _clearDrawingCanvas() {
    const canvas = this._drawCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.markedRegions = [];
    this._saveCanvasState();
  }

  _handleUndo() {
    if (this.historyIndex > 0) {
      const prevIndex = this.historyIndex - 1;
      const canvas = this._drawCanvas();
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = this.historyStack[prevIndex];
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        this.historyIndex = prevIndex;
      };
    } else if (this.historyIndex === 0) {
      const canvas = this._drawCanvas();
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.historyIndex = -1;
    }
  }

  _handleRedo() {
    if (this.historyIndex < this.historyStack.length - 1) {
      const nextIndex = this.historyIndex + 1;
      const canvas = this._drawCanvas();
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = this.historyStack[nextIndex];
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        this.historyIndex = nextIndex;
      };
    }
  }

  _getCanvasCoords(e) {
    const canvas = this._drawCanvas();
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  _startDrawing(e) {
    if (this.activeTool !== 'draw' && this.activeTool !== 'eraser') return;
    e.preventDefault();
    e.stopPropagation();
    this.isDrawing = true;
    const canvas = this._drawCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = this._getCanvasCoords(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.brushSize;

    if (this.activeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = this.brushColor;
    }
  }

  _drawStroke(e) {
    if (
      !this.isDrawing ||
      (this.activeTool !== 'draw' && this.activeTool !== 'eraser')
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = this._drawCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = this._getCanvasCoords(e);

    ctx.lineTo(x, y);
    ctx.stroke();
  }

  _stopDrawing(e) {
    if (this.isDrawing) {
      if (e) e.stopPropagation();
      this.isDrawing = false;
      this._saveCanvasState();
    }
  }

  // ─── Pan / hand tool logic ───────────────────────────────────────────────

  _startPan(e) {
    if (this.activeTool !== 'hand') return;
    this.isPanning = true;
    this.panStart = {
      x: e.clientX - this.panOffset.x,
      y: e.clientY - this.panOffset.y,
    };
  }

  _doPan(e) {
    if (!this.isPanning || this.activeTool !== 'hand') return;
    this.panOffset = {
      x: e.clientX - this.panStart.x,
      y: e.clientY - this.panStart.y,
    };
  }

  _stopPan() {
    this.isPanning = false;
  }

  _resetView() {
    this.zoomLevel = 100;
    this.panOffset = { x: 0, y: 0 };
    toast.show('View reset');
  }

  // ─── Regional & lasso edit AI submit with <bbox> bbox tags ───────────────

  async _handleRunRegionalEdit() {
    if (!this.apiKey) {
      toast.error('Please enter your API key.');
      return;
    }
    if (!this.regionalPrompt) {
      toast.error('Please enter a prompt for the selected region.');
      return;
    }

    this.isProcessing = true;
    this.progress = 20;
    this.onGenerationStart?.();

    try {
      let bboxTag = '';
      if (this.activeTool === 'lasso' && this.lassoPoints.length > 0) {
        const xs = this.lassoPoints.map((p) => p.x);
        const ys = this.lassoPoints.map((p) => p.y);
        const minX = Math.round(Math.min(...xs));
        const minY = Math.round(Math.min(...ys));
        const maxX = Math.round(Math.max(...xs));
        const maxY = Math.round(Math.max(...ys));
        bboxTag = `<bbox>${minY} ${minX} ${maxY} ${maxX}</bbox>`;
      } else if (this.activeTool === 'regional-edit') {
        const minX = Math.round(this.regionalBox.x * 10);
        const minY = Math.round(this.regionalBox.y * 10);
        const maxX = Math.round(
          (this.regionalBox.x + this.regionalBox.width) * 10,
        );
        const maxY = Math.round(
          (this.regionalBox.y + this.regionalBox.height) * 10,
        );
        bboxTag = `<bbox>${minY} ${minX} ${maxY} ${maxX}</bbox>`;
      }

      const formattedPrompt = bboxTag
        ? `Modify ${bboxTag}: ${this.regionalPrompt}`
        : this.regionalPrompt;

      const result = await decomposeLayers(this.apiKey, {
        image_url: this.currentImageUrl,
        prompt: formattedPrompt,
        resolution: this.resolution,
        output_format: this.outputFormat,
      });

      this.progress = 100;
      const rawImages =
        result.images ||
        result.output?.images ||
        result.outputs ||
        (result.url ? [result.url] : []);
      const layerUrls = Array.isArray(rawImages) ? rawImages : [rawImages];

      if (layerUrls.length > 0) {
        this.decomposedLayers = layerUrls;
        this.carouselIndex = 0;
        const initialVis = {};
        layerUrls.forEach((_, idx) => {
          initialVis[idx] = true;
        });
        this.visibleLayers = initialVis;
        toast.success(
          `Generated ${layerUrls.length} layer(s) with Seedream 5 Pro!`,
        );
        this.onGenerationComplete?.(result);
      }
    } catch (err) {
      const errorMsg = formatErrorMessage(err);
      toast.error(`Edit failed: ${errorMsg}`);
      this.onGenerationError?.(errorMsg);
    } finally {
      this.isProcessing = false;
      this.onGenerationEnd?.();
    }
  }

  // ─── Seedream 5.0 Pro layer decomposition prompt builder ─────────────────

  _buildSeedreamLayerPrompt(rawPrompt) {
    if (
      rawPrompt &&
      (rawPrompt.includes('<bbox>') ||
        rawPrompt.toLowerCase().includes('split the content'))
    ) {
      return rawPrompt;
    }

    if (this.markedRegions.length > 0) {
      const numLayers = Math.max(this.markedRegions.length, this.layerCount);
      let promptLines = [
        `Split the content in the image into ${numLayers} layers:`,
      ];
      this.markedRegions.forEach((item, idx) => {
        const { xmin, ymin, xmax, ymax } = item.bbox;
        const tag = rawPrompt || `Element ${idx + 1}`;
        promptLines.push(
          `Layer ${idx + 1}: ${tag} <bbox>${xmin} ${ymin} ${xmax} ${ymax}</bbox>`,
        );
      });
      return promptLines.join('\n');
    }

    return (
      rawPrompt ||
      `Split the content in the image into ${this.layerCount} transparent layers by separating foreground subjects, texts, and background elements cleanly.`
    );
  }

  // Progress interval helper (the original only clears on success; on the
  // catch path the interval survives. Ported that; we additionally drop all
  // surviving intervals on disconnect - invisible to the user).
  _startProgress(stepMs) {
    const id = setInterval(() => {
      if (this.progress < 90) this.progress = this.progress + 5;
    }, stepMs);
    this._progressIntervals.add(id);
    return id;
  }

  _stopProgress(id) {
    clearInterval(id);
    this._progressIntervals.delete(id);
  }

  // ─── API call: Seedream 5.0 Pro layer decomposition ─────────────────────

  async _handleDecompose(overridePrompt) {
    const rawPrompt =
      overridePrompt !== undefined ? overridePrompt : this.prompt;
    const finalSeedreamPrompt = this._buildSeedreamLayerPrompt(rawPrompt);

    if (!this.apiKey) {
      toast.error('API key is missing. Please set your API key.');
      return;
    }
    if (!this.currentImageUrl) {
      toast.error('Please upload or select an image to decompose into layers.');
      return;
    }

    this.isProcessing = true;
    this.progress = 15;
    this.onGenerationStart?.();

    try {
      const progressInterval = this._startProgress(800);

      const result = await decomposeLayers(this.apiKey, {
        image_url: this.currentImageUrl,
        prompt: finalSeedreamPrompt,
        resolution: this.resolution,
        output_format: this.outputFormat,
      });

      this._stopProgress(progressInterval);
      this.progress = 100;

      const rawImages =
        result.images ||
        result.output?.images ||
        result.outputs ||
        (result.url ? [result.url] : []);
      const layerUrls = Array.isArray(rawImages) ? rawImages : [rawImages];

      this.decomposedLayers = layerUrls;
      this.carouselIndex = 0;

      const initialVis = {};
      layerUrls.forEach((_, idx) => {
        initialVis[idx] = true;
      });
      this.visibleLayers = initialVis;

      toast.success(`Decomposed into ${layerUrls.length} layer(s)!`);
      this.onGenerationComplete?.(result);
    } catch (err) {
      const errorMsg = formatErrorMessage(err);
      toast.error(`Decomposition failed: ${errorMsg}`);
      this.onGenerationError?.(errorMsg);
    } finally {
      this.isProcessing = false;
      this.onGenerationEnd?.();
    }
  }

  // ─── API call: upscale image (seedvr2/topaz/ai-image-upscaler) ──────────

  async _handleRunUpscale() {
    if (!this.apiKey) {
      toast.error('Please enter your API key.');
      return;
    }
    if (!this.currentImageUrl) {
      toast.error('Please select or upload an image to upscale.');
      return;
    }

    this.isProcessing = true;
    this.progress = 15;
    this.onGenerationStart?.();

    try {
      const progressInterval = this._startProgress(700);

      const result = await upscaleImage(this.apiKey, {
        model: this.upscaleModel,
        image_url: this.currentImageUrl,
        resolution: this.seedvrResolution,
        upscale_factor: this.topazFactor,
      });

      this._stopProgress(progressInterval);
      this.progress = 100;

      const outputUrl =
        result.outputs?.[0] ||
        result.url ||
        result.output?.image ||
        result.output?.images?.[0] ||
        result.output?.url;

      if (outputUrl) {
        this.currentImageUrl = outputUrl;
        const selectedModelObj = UPSCALE_MODELS.find(
          (m) => m.id === this.upscaleModel,
        );
        toast.success(
          `Image upscaled successfully with ${selectedModelObj?.name || 'AI Upscaler'}!`,
        );
        this.onGenerationComplete?.(result);
      } else {
        toast.error('Upscale completed but no output URL was returned.');
      }
    } catch (err) {
      const errorMsg = formatErrorMessage(err);
      toast.error(`Upscale failed: ${errorMsg}`);
      this.onGenerationError?.(errorMsg);
    } finally {
      this.isProcessing = false;
      this.onGenerationEnd?.();
    }
  }

  // ─── API call: remove background (ai-background-remover) ────────────────

  async _handleRunRemoveBg() {
    if (!this.apiKey) {
      toast.error('Please enter your API key.');
      return;
    }
    if (!this.currentImageUrl) {
      toast.error('Please upload or select an image to remove background.');
      return;
    }

    this.isProcessing = true;
    this.progress = 15;
    this.onGenerationStart?.();

    try {
      const progressInterval = this._startProgress(700);

      const result = await removeBackground(this.apiKey, {
        image_url: this.currentImageUrl,
      });

      this._stopProgress(progressInterval);
      this.progress = 100;

      const outputUrl =
        result.outputs?.[0] ||
        result.url ||
        result.output?.image ||
        result.output?.images?.[0] ||
        result.output?.url;

      if (outputUrl) {
        this.currentImageUrl = outputUrl;
        this.decomposedLayers = [
          outputUrl,
          ...this.decomposedLayers.filter((u) => u !== outputUrl),
        ];
        this.carouselIndex = 0;
        toast.success('Background removed cleanly with AI Background Remover!');
        this.onGenerationComplete?.(result);
      } else {
        toast.error(
          'Background removal completed but no output URL was returned.',
        );
      }
    } catch (err) {
      const errorMsg = formatErrorMessage(err);
      toast.error(`Background removal failed: ${errorMsg}`);
      this.onGenerationError?.(errorMsg);
    } finally {
      this.isProcessing = false;
      this.onGenerationEnd?.();
    }
  }

  // ─── API call: expand / outpaint image (ai-image-extension) ─────────────

  async _handleRunExpand() {
    if (!this.apiKey) {
      toast.error('Please enter your API key.');
      return;
    }
    if (!this.currentImageUrl) {
      toast.error('Please upload or select an image to expand.');
      return;
    }

    this.isProcessing = true;
    this.progress = 15;
    this.onGenerationStart?.();

    try {
      const progressInterval = this._startProgress(700);

      const result = await expandImage(this.apiKey, {
        image_url: this.currentImageUrl,
      });

      this._stopProgress(progressInterval);
      this.progress = 100;

      const outputUrl =
        result.outputs?.[0] ||
        result.url ||
        result.output?.image ||
        result.output?.images?.[0] ||
        result.output?.url;

      if (outputUrl) {
        this.currentImageUrl = outputUrl;
        toast.success('Image expanded cleanly with AI Image Extension!');
        this.onGenerationComplete?.(result);
      } else {
        toast.error(
          'Image expansion completed but no output URL was returned.',
        );
      }
    } catch (err) {
      const errorMsg = formatErrorMessage(err);
      toast.error(`Image expansion failed: ${errorMsg}`);
      this.onGenerationError?.(errorMsg);
    } finally {
      this.isProcessing = false;
      this.onGenerationEnd?.();
    }
  }

  // ─── Resets ─────────────────────────────────────────────────────────────

  // Reset Upscale parameters to default
  _handleResetUpscale() {
    this.upscaleModel = 'topaz-image-upscale';
    this.topazFactor = 1;
    this.seedvrResolution = '4k';
    toast.show('Upscale settings reset to default');
  }

  // Reset individual Color Grading category
  _resetCategory(catKey) {
    this.colorGrading = {
      ...this.colorGrading,
      [catKey]: { ...DEFAULT_COLOR_GRADING[catKey] },
    };
    toast.show(`Reset ${catKey}`);
  }

  // Reset all Color Grading parameters
  _handleResetAllColorGrading() {
    this.colorGrading = structuredClone(DEFAULT_COLOR_GRADING);
    toast.show('Color grading reset to default');
  }

  // Download Color Graded Image (Includes live filters, vignette, halation,
  // and film grain)
  async _handleDownloadGradedImage() {
    if (!this.currentImageUrl) return;
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = this.currentImageUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 1024;
      canvas.height = img.naturalHeight || 1024;
      const ctx = canvas.getContext('2d');

      // 1. Draw filtered base image
      ctx.filter = this._getColorGradingCSSFilter();
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';

      // 2. Add Vignette if configured
      if (this.colorGrading.lensInstructions.vignette > 0) {
        const vRadius = Math.max(canvas.width, canvas.height) * 0.7;
        const grad = ctx.createRadialGradient(
          canvas.width / 2,
          canvas.height / 2,
          vRadius * 0.35,
          canvas.width / 2,
          canvas.height / 2,
          vRadius,
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(
          1,
          `rgba(0,0,0,${this.colorGrading.lensInstructions.vignette * 0.95})`,
        );
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // 3. Add Film Grain if configured
      if (this.colorGrading.filmGrain.strength > 0) {
        const grainCanvas = document.createElement('canvas');
        grainCanvas.width = 128;
        grainCanvas.height = 128;
        const gCtx = grainCanvas.getContext('2d');
        const gImgData = gCtx.createImageData(128, 128);
        const data = gImgData.data;
        const bias = this.colorGrading.filmGrain.bias * 50;
        for (let i = 0; i < data.length; i += 4) {
          const noise = (Math.random() - 0.5) * 255 + bias;
          data[i] = noise;
          data[i + 1] = noise;
          data[i + 2] = noise;
          data[i + 3] = 40;
        }
        gCtx.putImageData(gImgData, 0, 0);

        ctx.globalAlpha = this.colorGrading.filmGrain.strength * 0.5;
        ctx.globalCompositeOperation = 'overlay';
        const pat = ctx.createPattern(grainCanvas, 'repeat');
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
      }

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'color_graded_image.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Downloaded color graded image!');
    } catch {
      this._handleDownloadSingle(this.currentImageUrl, 'color_graded_image.png');
    }
  }

  // Load Seedream Wild Beauty 5-Layer Decomposition Example via CDN
  _handleLoadSampleLayers() {
    this.currentImageUrl = '/assets/samples/1786019968051_cKRYLHHu.png';
    this.decomposedLayers = [...DEFAULT_SAMPLE_LAYERS];
    this.carouselIndex = 0;
    const initialVis = {};
    DEFAULT_SAMPLE_LAYERS.forEach((_, idx) => {
      initialVis[idx] = true;
    });
    this.visibleLayers = initialVis;
    this._clearDrawingCanvas();
    this.markedRegions = [];
    toast.success('Loaded Seedream 5-layer sample!');
  }

  // Explicit Side Tool Execution Handler
  async _handleExecuteSideTool(toolId) {
    if (!this.apiKey) {
      toast.error('API key is missing.');
      return;
    }
    if (!this.currentImageUrl) {
      toast.error('Please upload an image first.');
      return;
    }

    if (toolId === 'remove-bg') {
      return this._handleRunRemoveBg();
    }
    if (toolId === 'expand-crop') {
      return this._handleRunExpand();
    }

    this.isProcessing = true;
    this.progress = 20;
    this.onGenerationStart?.();

    try {
      let result;
      if (toolId === 'enhancer') {
        result = await generateI2I(this.apiKey, {
          model: 'nano-banana-pro-edit',
          prompt:
            'Enhance image contrast, color balance, exposure, and sharpness.',
          image_url: this.currentImageUrl,
        });
      } else if (toolId === 'edit-text') {
        const textPrompt =
          this.textEditPrompt ||
          this.prompt ||
          'Edit and sharpen text overlay on the image cleanly.';
        result = await generateI2I(this.apiKey, {
          model: 'nano-banana-pro-edit',
          prompt: textPrompt,
          image_url: this.currentImageUrl,
        });
      } else {
        result = await generateI2I(this.apiKey, {
          model: 'nano-banana-pro-edit',
          prompt: this.prompt || `Apply ${toolId} image transformation.`,
          image_url: this.currentImageUrl,
        });
      }

      this.progress = 100;
      if (result?.url) {
        this.currentImageUrl = result.url;
        toast.success(`${toolId} completed successfully!`);
        this.onGenerationComplete?.(result);
      }
    } catch (err) {
      const errorMsg = formatErrorMessage(err);
      toast.error(`Operation failed: ${errorMsg}`);
      this.onGenerationError?.(errorMsg);
    } finally {
      this.isProcessing = false;
      this.onGenerationEnd?.();
    }
  }

  _toggleLayerVisibility(idx) {
    this.visibleLayers = {
      ...this.visibleLayers,
      [idx]: !this.visibleLayers[idx],
    };
  }

  async _handleDownloadSingle(url, filename) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || `layer.${this.outputFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  }

  _handleDownloadAll() {
    if (this.decomposedLayers.length === 0) {
      if (this.currentImageUrl) {
        this._handleDownloadSingle(
          this.currentImageUrl,
          `image.${this.outputFormat}`,
        );
      }
      return;
    }
    this.decomposedLayers.forEach((url, i) => {
      setTimeout(() => {
        this._handleDownloadSingle(url, `layer_${i + 1}.${this.outputFormat}`);
      }, i * 300);
    });
    toast.success('Downloading all layers...');
  }

  _getLassoPathString() {
    if (this.lassoPoints.length < 2) return '';
    return (
      this.lassoPoints
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
        )
        .join(' ') + ' Z'
    );
  }

  // ─── Color-grading building blocks (the original JSX duplicated these) ───

  _setGradingValue(section, key, e) {
    this.colorGrading = {
      ...this.colorGrading,
      [section]: { ...this.colorGrading[section], [key]: Number(e.target.value) },
    };
  }

  _sliderRow(label, min, max, step, value, onInput, display) {
    return html`
      <div class="bg-[#1f222d] rounded-2xl p-2.5 flex items-center justify-between">
        <span class="text-xs font-semibold text-white/70">${label}</span>
        <div class="flex items-center gap-2">
          <input
            type="range"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${value}"
            @input=${onInput}
            class="w-24 accent-[#84cc16] cursor-pointer h-1.5 bg-white/10 rounded-lg"
          />
          <span class="text-xs font-bold text-white min-w-[28px] text-right"
            >${display}</span
          >
        </div>
      </div>
    `;
  }

  _colorGradingCard(title, infoTitle, catKey, body) {
    const open = this.openSections[catKey];
    return html`
      <div class="bg-[#2d313d] rounded-3xl p-4 border border-white/5 space-y-3 shadow-sm">
        <div class="flex items-center justify-between">
          <button
            @click=${() => {
              this.openSections = { ...this.openSections, [catKey]: !open };
            }}
            class="flex items-center gap-2 text-left"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              class="text-white/40 transition-transform ${open ? '' : '-rotate-90'}"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span class="text-sm font-bold text-white tracking-tight"
              >${title}</span
            >
            <span
              class="w-3.5 h-3.5 rounded-full border border-white/20 text-[9px] flex items-center justify-center text-white/40 cursor-help"
              title="${infoTitle}"
              >ℹ</span
            >
          </button>

          <button
            @click=${() => this._resetCategory(catKey)}
            class="flex items-center gap-1 text-[11px] font-bold text-white/40 hover:text-white transition-colors px-2 py-0.5 rounded-lg hover:bg-white/5"
            title="Reset ${title}"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span>Reset</span>
          </button>
        </div>

        ${open ? body : nothing}
      </div>
    `;
  }

  render() {
    const {
      activeTool,
      lassoPoints,
      regionalBox,
      isSelectingRegion,
      isDraggingLasso,
      decomposedLayers,
      carouselIndex,
      visibleLayers,
      isSoloMode,
      colorGrading,
      markedRegions,
    } = this;

    return html`
      <div
        class="relative w-full h-full bg-[#121318] text-white flex overflow-hidden font-sans select-none"
      >
        <!-- Hidden File Input -->
        <input
          type="file"
          data-file-input
          @change=${this._onFileInputChange}
          accept="image/*"
          class="hidden"
        />

        <!-- Left Thumbnail Pill Strip -->
        <div
          class="absolute left-6 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-3"
        >
          <button
            @click=${() => this._fileInput()?.click()}
            title="Upload or Change Image"
            class="group relative w-12 h-14 rounded-2xl overflow-hidden bg-[#1a1c23] border border-white/10 flex items-center justify-center transition-all duration-200 hover:scale-105 shadow-[0_0_20px_rgba(0,0,0,0.5)] ring-2 ring-[#84cc16]/80"
          >
            ${this.currentImageUrl
              ? html`<img
                  src="${this.currentImageUrl}"
                  alt="Input thumb"
                  class="w-full h-full object-cover"
                />`
              : html`<svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>`}
            <div
              class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] font-bold tracking-tighter text-white"
            >
              CHANGE
            </div>
          </button>

          ${markedRegions.length > 0
            ? html`<button
                @click=${() => {
                  this.markedRegions = [];
                }}
                class="px-2 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-300 text-[10px] font-black rounded-lg border border-red-500/40 shadow-sm"
                title="Clear Marked Regions"
              >
                Clear (${markedRegions.length})
              </button>`
            : nothing}
        </div>

        <!-- Main Canvas Area with Live Color Grading Filter & Realtime Vignette / Grain -->
        <div
          @mousedown=${this._startPan}
          @mousemove=${this._doPan}
          @mouseup=${this._stopPan}
          @mouseleave=${this._stopPan}
          class="flex-1 relative h-full flex flex-col items-center justify-center p-4 pb-28 overflow-hidden bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1d2029] via-[#0f1015] to-[#08090c] ${
            activeTool === 'hand' ? 'cursor-grab active:cursor-grabbing' : ''
          }"
        >
          <div
            class="absolute w-[700px] h-[700px] bg-[#84cc16]/5 rounded-full blur-[160px] pointer-events-none"
          ></div>

          <!-- Central Display Viewport Container -->
          <div
            class="relative max-w-[90%] max-h-[78vh] flex items-center justify-center transition-transform duration-100 ease-out"
            style=${`transform: translate(${this.panOffset.x}px, ${this.panOffset.y}px) scale(${
              this.zoomLevel / 100
            }); filter: ${this._getColorGradingCSSFilter()};`}
          >
            ${this.uploading
              ? html`<div
                  class="flex flex-col items-center justify-center p-12 bg-[#1a1c23]/80 backdrop-blur-md rounded-3xl border border-white/10"
                >
                  <div
                    class="w-12 h-12 border-4 border-[#84cc16]/20 border-t-[#84cc16] rounded-full animate-spin mb-4"
                  ></div>
                  <p class="text-sm font-semibold text-white/80"
                    >Uploading image... ${this.uploadProgress}%</p
                  >
                </div>`
              : this.currentImageUrl
              ? this._renderImageWrapper()
              : html`<div
                  @click=${() => this._fileInput()?.click()}
                  class="flex flex-col items-center justify-center p-16 border-2 border-dashed border-white/20 hover:border-[#84cc16]/60 rounded-3xl cursor-pointer transition-all duration-200 bg-[#16181f]/50 hover:bg-[#16181f]/80"
                >
                  <div
                    class="w-16 h-16 rounded-2xl bg-[#84cc16]/10 text-[#84cc16] flex items-center justify-center mb-4"
                  >
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <p class="text-base font-bold text-white mb-1"
                    >Click or Drop Image Here</p
                  >
                  <p class="text-xs text-white/50"
                    >Supports PNG, JPEG, WEBP up to 20MB</p
                  >
                </div>`}
          </div>

          ${this._renderFloatingControls()}
        </div>

        <!-- Right Inspector Panel -->
        ${this.isSidebarOpen ? this._renderInspector() : nothing}
      </div>
    `;
  }

  // ─── Image wrapper (main image + overlays + drawing canvas) ─────────────

  _renderImageWrapper() {
    const {
      activeTool,
      lassoPoints,
      regionalBox,
      isSelectingRegion,
      isDraggingLasso,
      decomposedLayers,
      carouselIndex,
      visibleLayers,
      isSoloMode,
      colorGrading,
    } = this;

    const wrapperTransform =
      colorGrading.lensInstructions.distortion !== 0
        ? `transform: scale(${1 +
            Math.abs(colorGrading.lensInstructions.distortion) * 0.08});`
        : '';

    const grainFreq =
      colorGrading.filmGrain.size === '35mm'
        ? '0.85'
        : colorGrading.filmGrain.size === '16mm'
          ? '0.65'
          : '0.45';

    return html`
      <div
        data-image-wrapper
        @mousedown=${this._handleImageMouseDown}
        @mousemove=${this._handleImageMouseMove}
        @mouseup=${this._handleImageMouseUp}
        @touchstart=${this._handleImageMouseDown}
        @touchmove=${this._handleImageMouseMove}
        @touchend=${this._handleImageMouseUp}
        class="relative group rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)] border border-white/10 ${
          activeTool === 'lasso' ||
          activeTool === 'regional-edit' ||
          activeTool === 'shapes'
            ? 'cursor-crosshair'
            : ''
        }"
        style=${wrapperTransform}
      >
        <img
          data-main-image
          src="${this.currentImageUrl}"
          alt="Main canvas"
          @load=${this._syncCanvasDimensions}
          class="max-h-[72vh] max-w-[70vw] object-contain transition-opacity duration-300 pointer-events-none ${
            decomposedLayers.length > 0 ? 'opacity-30 blur-[1px]' : 'opacity-100'
          }"
        />

        <!-- Realtime Vignette Layer Overlay -->
        ${colorGrading.lensInstructions.vignette > 0
          ? html`<div
              class="absolute inset-0 pointer-events-none rounded-2xl z-20 transition-opacity duration-150"
              style=${`background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${colorGrading.lensInstructions.vignette *
                0.95}) 100%);`}
            ></div>`
          : nothing}

        <!-- Realtime Film Grain SVG Noise Layer Overlay -->
        ${colorGrading.filmGrain.strength > 0
          ? html`<div
              class="absolute inset-0 pointer-events-none rounded-2xl z-20 mix-blend-overlay transition-opacity duration-150"
              style=${`opacity: ${colorGrading.filmGrain.strength}; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${grainFreq}' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='${
                0.35 + colorGrading.filmGrain.bias * 0.45
              }'/%3E%3C/svg%3E");`}
            ></div>`
          : nothing}

        <!-- 1. FREEHAND LASSO EDIT OVERLAY -->
        ${activeTool === 'lasso' && lassoPoints.length > 1
          ? html`<svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              class="absolute inset-0 w-full h-full pointer-events-none z-30"
            >
              <path
                d="${this._getLassoPathString()}"
                fill="rgba(56, 189, 248, 0.18)"
                stroke="#38bdf8"
                stroke-width="4"
                stroke-dasharray="8 8"
                class="drop-shadow-[0_0_15px_rgba(56,189,248,0.8)]"
              />
            </svg>`
          : nothing}

        <!-- 2. RECTANGULAR REGIONAL EDIT BOX OVERLAY -->
        ${activeTool === 'regional-edit' &&
        regionalBox.width > 0 &&
        regionalBox.height > 0
          ? html`<div
              class="absolute border-2 border-dashed border-[#38bdf8] bg-[#38bdf8]/10 rounded-lg pointer-events-auto shadow-[0_0_25px_rgba(56,189,248,0.5)] z-30"
              style=${`left: ${regionalBox.x}%; top: ${regionalBox.y}%; width: ${regionalBox.width}%; height: ${regionalBox.height}%;`}
            >
              <div
                class="absolute -top-1.5 -left-1.5 w-3 h-3 bg-[#38bdf8] border border-white rounded-full"
              ></div>
              <div
                class="absolute -top-1.5 -right-1.5 w-3 h-3 bg-[#38bdf8] border border-white rounded-full"
              ></div>
              <div
                class="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-[#38bdf8] border border-white rounded-full"
              ></div>
              <div
                class="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-[#38bdf8] border border-white rounded-full"
              ></div>
            </div>`
          : nothing}

        <!-- FLOATING REGIONAL / LASSO PROMPT BAR -->
        ${((activeTool === 'lasso' &&
          lassoPoints.length > 2 &&
          !isDraggingLasso) ||
          (activeTool === 'regional-edit' &&
            regionalBox.width > 2 &&
            !isSelectingRegion))
          ? html`<div
          @mousedown=${(e) => e.stopPropagation()}
          class="absolute bottom-4 left-1/2 -translate-x-1/2 w-[280px] sm:w-[340px] bg-[#161822]/95 backdrop-blur-2xl border border-white/20 rounded-full px-3.5 py-2 flex items-center gap-2 shadow-[0_20px_40px_rgba(0,0,0,0.9)] z-50 animate-fade-in"
        >
          <span class="text-white/40 font-semibold text-sm ml-1">+</span>
          <input
            type="text"
            value=${this.regionalPrompt}
            @input=${(e) => {
              this.regionalPrompt = e.target.value;
            }}
            @keydown=${(e) => e.key === 'Enter' && this._handleRunRegionalEdit()}
            placeholder="Type your prompt here..."
            class="flex-1 bg-transparent text-xs text-white placeholder-white/40 focus:outline-none min-w-0 font-medium"
          />
          <button
            @click=${this._handleRunRegionalEdit}
            ?disabled=${this.isProcessing}
            class="w-7 h-7 rounded-full bg-[#84cc16] hover:bg-[#a3e635] text-black flex items-center justify-center shadow-[0_0_12px_rgba(132,204,22,0.6)] transition-all hover:scale-105 active:scale-95 flex-shrink-0"
            title="Run Selection Edit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon
                points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
              />
            </svg>
          </button>
        </div>`
          : nothing}

        <!-- Interactive HTML5 Drawing & Shapes Overlay Canvas -->
        <canvas
          data-drawing-canvas
          @mousedown=${this._startDrawing}
          @mousemove=${this._drawStroke}
          @mouseup=${this._stopDrawing}
          @mouseleave=${this._stopDrawing}
          @touchstart=${this._startDrawing}
          @touchmove=${this._drawStroke}
          @touchend=${this._stopDrawing}
          class="absolute inset-0 w-full h-full touch-none ${
            activeTool === 'draw' ||
            activeTool === 'eraser' ||
            activeTool === 'shapes'
              ? 'cursor-crosshair z-30 pointer-events-auto'
              : 'pointer-events-none z-10'
          }"
        ></canvas>

        <!-- Decomposed Layer Overlay Stack on Canvas -->
        ${decomposedLayers.length > 0
          ? html`<div
              class="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              ${decomposedLayers.map(
                (layerUrl, idx) => {
                  const isVisible = isSoloMode
                    ? carouselIndex === idx
                    : visibleLayers[idx];
                  if (!isVisible) return nothing;
                  const isSelected = carouselIndex === idx;
                  return html`<img
                    src="${layerUrl}"
                    alt="Layer ${idx + 1}"
                    @click=${(e) => {
                      e.stopPropagation();
                      this.carouselIndex = idx;
                    }}
                    class="absolute inset-0 w-full h-full object-contain transition-all duration-200 cursor-pointer pointer-events-auto ${
                      isSelected
                        ? 'ring-2 ring-[#84cc16] drop-shadow-[0_0_20px_rgba(132,204,22,0.6)]'
                        : 'hover:opacity-90'
                    }"
                  />`;
                },
              )}
            </div>`
          : nothing}

        <!-- Loading Overlay -->
        ${this.isProcessing
          ? html`<div
              class="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 z-40"
            >
              <div class="relative w-16 h-16 mb-4">
                <div
                  class="absolute inset-0 border-4 border-[#84cc16]/20 rounded-full"
                ></div>
                <div
                  class="absolute inset-0 border-4 border-[#84cc16] border-t-transparent rounded-full animate-spin"
                ></div>
              </div>
              <p class="text-sm font-bold tracking-wide text-white"
                >Processing Image...</p
              >
              <p class="text-xs text-white/50 mt-1"
                >Open Generative AI Studio</p
              >

              <div
                class="w-48 bg-white/10 h-1.5 rounded-full overflow-hidden mt-4"
              >
                <div
                  class="bg-gradient-to-r from-[#84cc16] to-[#a3e635] h-full transition-all duration-300"
                  style=${`width: ${this.progress}%`}
                ></div>
              </div>
            </div>`
          : nothing}
      </div>
    `;
  }

  // ─── Floating canvas controls (shapes/draw popovers + micro toolbar + prompt bar) ───

  _renderFloatingControls() {
    const activeTool = this.activeTool;
    return html`
      <!-- Floating Canvas Controls & Prompt Composer -->
      <div
        class="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2.5 w-full max-w-xl px-4"
      >
        <!-- SHAPES (R) POPOVER TOOLBAR -->
        ${activeTool === 'shapes'
          ? html`<div
              class="flex items-center gap-3 px-4 py-2 bg-[#1b1e26]/95 backdrop-blur-xl border border-[#84cc16]/40 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] animate-fade-in"
            >
              <div class="flex items-center gap-1">
                ${[
                  ['line', 'Line', '<line x1="5" y1="19" x2="19" y2="5" />'],
                  [
                    'arrow',
                    'Arrow',
                    '<line x1="5" y1="19" x2="19" y2="5" /><polyline points="12 5 19 5 19 12" />',
                  ],
                  [
                    'rect',
                    'Rectangle',
                    '<rect x="3" y="3" width="18" height="18" rx="2" />',
                  ],
                  ['circle', 'Circle', '<circle cx="12" cy="12" r="9" />'],
                ].map(([shape, label, iconMarkup]) => html`
                  <button
                    @click=${() => {
                      this.activeShape = shape;
                    }}
                    class="p-1.5 rounded-lg border transition-all ${
                      this.activeShape === shape
                        ? 'bg-[#84cc16] text-black border-[#84cc16]'
                        : 'text-white/70 hover:text-white border-transparent'
                    }"
                    title="${label}"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      ${unsafeHTML(iconMarkup)}
                    </svg>
                  </button>
                `)}
              </div>

              <div class="w-[1px] h-4 bg-white/10"></div>

              <div class="flex items-center gap-1.5">
                ${PRESET_COLORS.map(
                  (c) => html`<button
                    @click=${() => {
                      this.shapeColor = c;
                    }}
                    class="w-4 h-4 rounded-full border border-white/20 transition-all ${
                      this.shapeColor === c
                        ? 'scale-125 ring-2 ring-white shadow-md'
                        : 'hover:scale-110'
                    }"
                    style=${`background-color: ${c}`}
                  ></button>`,
                )}
              </div>
            </div>`
          : nothing}

        <!-- Active Drawing Tool Popover Options Bar -->
        ${(activeTool === 'draw' || activeTool === 'eraser')
          ? html`<div
              class="flex items-center gap-3 px-4 py-2 bg-[#1b1e26]/95 backdrop-blur-xl border border-[#84cc16]/40 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] animate-fade-in"
            >
              <span
                class="text-xs font-extrabold uppercase text-[#a3e635] tracking-wider"
              >
                ${activeTool === 'draw' ? 'Marker Pen' : 'Eraser'}
              </span>

              ${activeTool === 'draw'
                ? html`<div class="flex items-center gap-1.5">
                    ${PRESET_COLORS.map(
                      (c) => html`<button
                        @click=${() => {
                          this.brushColor = c;
                        }}
                        class="w-5 h-5 rounded-full border border-white/20 transition-all ${
                          this.brushColor === c
                            ? 'scale-125 ring-2 ring-white shadow-md'
                            : 'hover:scale-110'
                        }"
                        style=${`background-color: ${c}`}
                      ></button>`,
                    )}
                    <input
                      type="color"
                      value=${this.brushColor}
                      @input=${(e) => {
                        this.brushColor = e.target.value;
                      }}
                      class="w-5 h-5 rounded-full border-0 cursor-pointer bg-transparent"
                      title="Custom Color"
                    />
                  </div>`
                : nothing}

              <div
                class="flex items-center gap-2 border-l border-white/10 pl-3"
              >
                <span class="text-[11px] text-white/60 font-semibold"
                  >Size:</span
                >
                <input
                  type="range"
                  min="2"
                  max="40"
                  value=${this.brushSize}
                  @input=${(e) => {
                    this.brushSize = Number(e.target.value);
                  }}
                  class="w-20 accent-[#84cc16] cursor-pointer"
                />
                <span class="text-xs font-bold text-white min-w-[20px]"
                  >${this.brushSize}px</span
                >
              </div>

              <div
                class="flex items-center gap-1 border-l border-white/10 pl-3"
              >
                <button
                  @click=${this._handleUndo}
                  ?disabled=${this.historyIndex < 0}
                  class="p-1.5 text-white/70 hover:text-white disabled:opacity-30 rounded-lg hover:bg-white/5"
                  title="Undo Stroke"
                >
                  ↶
                </button>
                <button
                  @click=${this._handleRedo}
                  ?disabled=${
                    this.historyIndex >= this.historyStack.length - 1
                  }
                  class="p-1.5 text-white/70 hover:text-white disabled:opacity-30 rounded-lg hover:bg-white/5"
                  title="Redo Stroke"
                >
                  ↷
                </button>
                <button
                  @click=${this._clearDrawingCanvas}
                  class="p-1.5 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-white/5 text-xs font-bold"
                  title="Clear Drawings"
                >
                  Clear
                </button>
              </div>
            </div>`
          : nothing}

        <!-- Bottom Floating Micro Toolbar -->
        <div
          class="flex items-center gap-1.5 px-3.5 py-2 bg-[#1b1e26]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_12px_35px_rgba(0,0,0,0.6)]"
        >
          <button
            @click=${() => {
              this.activeTool = 'pointer';
            }}
            class="p-2 rounded-xl transition-all ${
              activeTool === 'pointer'
                ? 'bg-[#84cc16] text-black shadow-[0_0_12px_rgba(132,204,22,0.4)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }"
            title="Select Pointer Tool"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="3 3 10.07 19.97 12.58 12.58 19.97 10.07 3 3" />
            </svg>
          </button>

          <button
            @click=${() => {
              this.activeTool = 'hand';
            }}
            class="p-2 rounded-xl transition-all ${
              activeTool === 'hand'
                ? 'bg-[#84cc16] text-black shadow-[0_0_12px_rgba(132,204,22,0.4)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }"
            title="Pan Tool"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 11V6a2 2 0 0 0-4 0v5" />
              <path d="M14 10V4a2 2 0 0 0-4 0v6" />
              <path d="M10 10.5V6a2 2 0 0 0-4 0v9" />
              <path
                d="M18 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.8-5.6-2.4l-3-4.2a2 2 0 0 1 3.2-2.4l1.4 1.6"
              />
            </svg>
          </button>

          <button
            @click=${() =>
              (this.activeTool = activeTool === 'lasso' ? 'pointer' : 'lasso')}
            class="group relative p-2 rounded-xl transition-all ${
              activeTool === 'lasso'
                ? 'bg-[#84cc16] text-black shadow-[0_0_12px_rgba(132,204,22,0.4)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }"
            title="Lasso Edit"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M4 16c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2"
                stroke-dasharray="3 3"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <div
              class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-[11px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md"
            >
              Lasso edit
            </div>
          </button>

          <button
            @click=${() =>
              (this.activeTool =
                activeTool === 'regional-edit' ? 'pointer' : 'regional-edit')}
            class="group relative p-2 rounded-xl transition-all ${
              activeTool === 'regional-edit'
                ? 'bg-[#84cc16] text-black shadow-[0_0_12px_rgba(132,204,22,0.4)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }"
            title="Regional Edit"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect
                x="4"
                y="4"
                width="16"
                height="16"
                rx="2"
                stroke-dasharray="3 3"
              />
              <path d="M9 12h6M12 9v6" />
            </svg>
            <div
              class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-[11px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md"
            >
              Regional edit
            </div>
          </button>

          <button
            @click=${() =>
              (this.activeTool = activeTool === 'draw' ? 'pointer' : 'draw')}
            class="p-2 rounded-xl transition-all ${
              activeTool === 'draw'
                ? 'bg-[#84cc16] text-black shadow-[0_0_12px_rgba(132,204,22,0.4)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }"
            title="Highlight Marker Pen"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            </svg>
          </button>

          <button
            @click=${() =>
              (this.activeTool = activeTool === 'eraser' ? 'pointer' : 'eraser')}
            class="p-2 rounded-xl transition-all ${
              activeTool === 'eraser'
                ? 'bg-[#84cc16] text-black shadow-[0_0_12px_rgba(132,204,22,0.4)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }"
            title="Eraser Tool"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M20 20H7L3 16C2 15 2 13 3 12L13 2C14 1 16 1 17 2L21 6C22 7 22 9 21 10L12 19"
              />
            </svg>
          </button>

          <button
            @click=${() =>
              (this.activeTool = activeTool === 'shapes' ? 'pointer' : 'shapes')}
            class="group relative p-2 rounded-xl transition-all ${
              activeTool === 'shapes'
                ? 'bg-[#84cc16] text-black shadow-[0_0_12px_rgba(132,204,22,0.4)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }"
            title="Shapes (R)"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="3" width="10" height="10" rx="1" />
              <circle cx="16" cy="16" r="5" />
            </svg>
            <div
              class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-[11px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-md"
            >
              Shapes (R)
            </div>
          </button>

          <div class="w-[1px] h-4 bg-white/10 mx-1"></div>

          <button
            @click=${() => {
              this.zoomLevel = Math.max(50, this.zoomLevel - 10);
            }}
            class="px-1.5 py-1 text-white/60 hover:text-white text-xs font-bold"
          >
            –
          </button>
          <button
            @click=${this._resetView}
            class="text-xs font-semibold text-white/80 min-w-[36px] text-center hover:text-white"
            title="Reset Zoom & Pan"
          >
            ${this.zoomLevel}%
          </button>
          <button
            @click=${() => {
              this.zoomLevel = Math.min(200, this.zoomLevel + 10);
            }}
            class="px-1.5 py-1 text-white/60 hover:text-white text-xs font-bold"
          >
            +
          </button>
        </div>

        <!-- Bottom Floating Main Prompt Bar -->
        <div
          class="w-full relative flex items-center bg-[#15171e]/95 backdrop-blur-xl border border-white/10 rounded-full px-4 py-2 shadow-[0_15px_40px_rgba(0,0,0,0.6)]"
        >
          <button
            @click=${() => this._fileInput()?.click()}
            class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all mr-2 flex-shrink-0"
            title="Add Image"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <input
            type="text"
            value=${this.prompt}
            @input=${(e) => {
              this.prompt = e.target.value;
            }}
            @keydown=${(e) => e.key === 'Enter' && this._handleDecompose()}
            placeholder=${
              this.markedRegions.length > 0
                ? `Describe layers for ${this.markedRegions.length} marked region(s)...`
                : 'Describe how to edit image or split layers...'
            }
            class="flex-1 bg-transparent text-sm text-white placeholder-white/40 focus:outline-none px-2 font-medium min-w-0"
          />

          <button
            @click=${() => this._handleDecompose()}
            ?disabled=${this.isProcessing}
            class="w-10 h-10 rounded-full bg-[#84cc16] hover:bg-[#a3e635] text-black flex items-center justify-center shadow-[0_0_20px_rgba(132,204,22,0.5)] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 ml-2 flex-shrink-0"
            title="Run Layer Decomposition"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <polygon
                points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
              />
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  // ─── Right inspector panel (header, views, footer) ──────────────────────

  _inspectTabTitle() {
    const t = this.activeSideTab;
    return t === 'upscale'
      ? 'Upscale'
      : t === 'color-grading'
        ? 'Color Grading'
        : t === 'remove-bg'
          ? 'Remove Background'
          : t === 'expand-crop'
            ? 'Expand Image'
            : t === 'layer-decomposition'
              ? 'Layer Decomposition'
              : 'Tools';
  }

  _inspectTabIcon() {
    const t = this.activeSideTab;
    if (t === 'upscale') {
      return html`
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>`;
    }
    if (t === 'color-grading') {
      return html`
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
          />
          <path
            d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2z"
            opacity="0.4"
          />
          <circle cx="9" cy="9" r="3" />
          <circle cx="15" cy="9" r="3" />
          <circle cx="12" cy="15" r="3" />
        </svg>`;
    }
    if (t === 'remove-bg') {
      return html`
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"
          />
        </svg>`;
    }
    if (t === 'expand-crop') {
      return html`
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <polyline points="21 15 21 21 15 21" />
          <polyline points="3 9 3 3 9 3" />
        </svg>`;
    }
    return html`
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>`;
  }

  _renderInspector() {
    return html`
      <div
        class="w-[380px] h-full bg-[#242833] border-l border-white/10 flex flex-col justify-between z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] animate-fade-in"
      >
        <!-- Top Header & Panel Content -->
        <div class="p-5 flex-1 overflow-y-auto custom-scrollbar">
          <!-- Header with Back, Title & Close -->
          <div class="flex items-center justify-between mb-5">
            <div class="flex items-center gap-3">
              <button
                @click=${() => {
                  this.activeSideTab = 'menu';
                }}
                class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-colors"
                title="Back to Tools"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <div class="flex items-center gap-2">
                <div
                  class="w-7 h-7 rounded-full bg-white flex items-center justify-center text-black shadow-sm"
                >
                  ${this._inspectTabIcon()}
                </div>
                <h3 class="text-sm font-extrabold text-white tracking-tight"
                  >${this._inspectTabTitle()}</h3
                >
              </div>
            </div>

            <button
              @click=${() => {
                this.isSidebarOpen = false;
              }}
              class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-colors"
              title="Close Panel"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          ${this._renderInspectorBody()}
        </div>

        <!-- Bottom Action Footer -->
        ${this._renderInspectorFooter()}
      </div>
    `;
  }

  _renderInspectorBody() {
    const t = this.activeSideTab;

    if (t === 'layer-decomposition') return this._viewLayerDecomposition();
    if (t === 'upscale') return this._viewUpscale();
    if (t === 'color-grading') return this._viewColorGrading();
    if (t === 'remove-bg') return this._viewRemoveBg();
    if (t === 'expand-crop') return this._viewExpandCrop();
    if (t === 'menu') return this._viewMenu();

    // Sub-Panels for Other Side Tools
    if (t === 'edit-text') {
      return html`
        <div class="p-4 bg-[#2d313d] border border-white/10 rounded-2xl space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-[#a3e635]"
            >Edit Text Tool</h4
          >
          <input
            type="text"
            value=${this.textEditPrompt}
            @input=${(e) => {
              this.textEditPrompt = e.target.value;
            }}
            placeholder="Enter text modification prompt..."
            class="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#84cc16]"
          />
          <button
            @click=${() => this._handleExecuteSideTool('edit-text')}
            ?disabled=${this.isProcessing}
            class="w-full py-2 bg-[#84cc16] hover:bg-[#a3e635] text-black font-bold text-xs uppercase rounded-xl shadow-md"
          >
            ${this.isProcessing ? 'Processing...' : 'Run Text Edit'}
          </button>
        </div>
      `;
    }
    if (t === 'enhancer') {
      return html`
        <div class="p-4 bg-[#2d313d] border border-white/10 rounded-2xl space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-[#a3e635]"
            >AI Enhancer</h4
          >
          <p class="text-xs text-white/60"
            >Automatically optimize lighting, sharpness, and color balance.</p
          >
          <button
            @click=${() => this._handleExecuteSideTool('enhancer')}
            ?disabled=${this.isProcessing}
            class="w-full py-2 bg-[#84cc16] hover:bg-[#a3e635] text-black font-bold text-xs uppercase rounded-xl shadow-md"
          >
            ${this.isProcessing ? 'Enhancing...' : 'Enhance Image'}
          </button>
        </div>
      `;
    }
    if (t === 'relight') {
      return html`
        <div class="p-4 bg-[#2d313d] border border-white/10 rounded-2xl space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-[#a3e635]"
            >AI Relight</h4
          >
          <p class="text-xs text-white/60"
            >Adjust illumination, ambient studio light, and shadows.</p
          >
          <button
            @click=${() => this._handleExecuteSideTool('relight')}
            ?disabled=${this.isProcessing}
            class="w-full py-2 bg-[#84cc16] hover:bg-[#a3e635] text-black font-bold text-xs uppercase rounded-xl shadow-md"
          >
            ${this.isProcessing ? 'Relighting...' : 'Apply Relight'}
          </button>
        </div>
      `;
    }
    if (t === 'angles') {
      return html`
        <div class="p-4 bg-[#2d313d] border border-white/10 rounded-2xl space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-[#a3e635]"
            >3D Angle Perspective</h4
          >
          <p class="text-xs text-white/60"
            >Adjust perspective tilt and camera angle alignment.</p
          >
          <button
            @click=${() => this._handleExecuteSideTool('angles')}
            ?disabled=${this.isProcessing}
            class="w-full py-2 bg-[#84cc16] hover:bg-[#a3e635] text-black font-bold text-xs uppercase rounded-xl shadow-md"
          >
            ${this.isProcessing
              ? 'Transforming...'
              : 'Apply Perspective Angle'}
          </button>
        </div>
      `;
    }
    return nothing;
  }

  // ─── VIEW 1: LAYER DECOMPOSITION ─────────────────────────────────────────

  _viewLayerDecomposition() {
    const decomposed = this.decomposedLayers;
    return html`
      <div class="space-y-4">
        <!-- Hero Feature Card with 5 CDN Layers -->
        <div
          @click=${this._handleLoadSampleLayers}
          class="group w-full bg-[#f4f4f7] hover:bg-white rounded-3xl p-3 shadow-lg overflow-hidden border border-white/20 cursor-pointer transition-all duration-200 hover:scale-[1.01]"
          title="Click to load this layer decomposition example"
        >
          <div class="flex items-center gap-2.5">
            <div
              class="relative w-28 h-36 rounded-2xl overflow-hidden bg-zinc-900 flex-shrink-0 shadow-md"
            >
              <img
                src="/assets/samples/1786019968051_cKRYLHHu.png"
                alt="Seedream original demo"
                class="w-full h-full object-cover"
              />
              <div
                class="absolute inset-y-0 left-1/2 w-5 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#d8ff00]/90 to-transparent blur-[3px] animate-pulse"
              ></div>
              <div
                class="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-black/75 text-[8px] font-black text-white backdrop-blur-sm"
              >
                Original
              </div>
            </div>

            <div
              class="flex-1 bg-[#13151d] rounded-2xl p-2.5 flex flex-col justify-between h-36 shadow-inner overflow-hidden"
            >
              <div class="flex items-center justify-between px-1">
                <span
                  class="text-[10px] font-black text-[#a3e635] uppercase tracking-wider"
                >
                  5 Layers
                </span>
                <span
                  class="text-[9px] font-bold text-white/50 group-hover:text-white transition-colors"
                >
                  Try →
                </span>
              </div>

              <div
                class="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar"
              >
                ${DEFAULT_SAMPLE_LAYERS.map(
                  (layerUrl, idx) => html`
                    <div
                      class="flex-shrink-0 w-11 h-16 rounded-xl overflow-hidden border border-white/10 relative flex items-center justify-center p-1 bg-[#1a1d26] shadow-sm hover:border-[#84cc16]/50 transition-all"
                      style=${CHECKERBOARD_6}
                      title="Layer ${idx + 1}"
                    >
                      <img
                        src="${layerUrl}"
                        alt="Layer ${idx + 1}"
                        class="max-h-full max-w-full object-contain drop-shadow-sm transition-transform duration-200 group-hover:scale-105"
                      />
                      <span
                        class="absolute bottom-0.5 right-0.5 text-[8px] font-black text-white/90 bg-black/70 px-1 rounded"
                      >
                        ${idx + 1}
                      </span>
                    </div>
                  `,
                )}
              </div>

              <div
                class="text-[9px] text-center text-white/40 font-semibold group-hover:text-[#84cc16] transition-colors"
              >
                Click to explore sample
              </div>
            </div>
          </div>
        </div>

        <!-- Settings Section -->
        <div
          class="bg-[#2d313d] rounded-3xl p-5 border border-white/5 space-y-4 shadow-sm"
        >
          <h4 class="text-sm font-bold text-white tracking-tight">Settings</h4>

          <div>
            <label
              class="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2"
            >
              Resolution
            </label>
            <div
              class="grid grid-cols-3 gap-1.5 bg-[#1a1c24] p-1 rounded-2xl border border-white/5"
            >
              ${['1K', '1.5K', '2K'].map(
                (res) => html`
                  <button
                    @click=${() => {
                      this.resolution = res;
                    }}
                    class="py-2 text-xs font-extrabold rounded-xl transition-all ${
                      this.resolution === res
                        ? 'bg-[#383c4a] text-white shadow-md border border-white/10'
                        : 'text-white/40 hover:text-white'
                    }"
                  >
                    ${res}
                  </button>
                `,
              )}
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-2">
              <label
                class="block text-[11px] font-bold uppercase tracking-wider text-white/40"
              >
                Layers
              </label>
              <span
                class="px-2.5 py-0.5 rounded-lg bg-[#1a1c24] border border-white/10 text-xs font-black text-white shadow-sm"
              >
                ${this.layerCount}
              </span>
            </div>
            <div
              class="bg-[#1a1c24] rounded-2xl p-3 border border-white/5 flex items-center gap-3"
            >
              <span class="text-[10px] font-bold text-white/30">2</span>
              <input
                type="range"
                min="2"
                max="16"
                value=${this.layerCount}
                @input=${(e) => {
                  this.layerCount = Number(e.target.value);
                }}
                class="w-full accent-[#e2f924] cursor-pointer h-1.5 bg-white/10 rounded-lg"
              />
              <span class="text-[10px] font-bold text-white/30">16</span>
            </div>
          </div>
        </div>

        <!-- RESULTS: DECOMPOSED LAYERS INTERACTIVE CAROUSEL -->
        ${decomposed.length > 0
          ? html`
            <div
              class="space-y-4 border-t border-white/10 pt-4 animate-fade-in"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold uppercase text-white/80"
                    >Layer Carousel</span
                  >
                  <span
                    class="px-2 py-0.5 rounded-full bg-[#84cc16]/20 text-[#a3e635] text-[10px] font-black"
                  >
                    ${this.carouselIndex + 1} / ${decomposed.length}
                  </span>
                </div>

                <div class="flex items-center gap-2">
                  <button
                    @click=${() => {
                      this.isSoloMode = !this.isSoloMode;
                    }}
                    class="px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all ${
                      this.isSoloMode
                        ? 'bg-[#84cc16] text-black border-[#84cc16]'
                        : 'bg-white/5 text-white/60 hover:text-white border-white/10'
                    }"
                    title="View only active layer"
                  >
                    ${this.isSoloMode ? 'Solo Active' : 'Stack Mode'}
                  </button>
                  <button
                    @click=${this._handleDownloadAll}
                    class="text-xs text-[#a3e635] hover:underline font-semibold"
                  >
                    Download All
                  </button>
                </div>
              </div>

              <div
                class="relative group bg-[#111319] border border-white/15 rounded-2xl overflow-hidden p-3 flex flex-col items-center shadow-xl"
              >
                <div
                  class="w-full h-48 rounded-xl overflow-hidden relative flex items-center justify-center border border-white/10"
                  style=${CHECKERBOARD_16}
                >
                  <img
                    src="${decomposed[this.carouselIndex]}"
                    alt="Layer ${this.carouselIndex + 1}"
                    class="max-h-full max-w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-all duration-300 transform group-hover:scale-105"
                  />

                  <button
                    @click=${() =>
                      (this.carouselIndex =
                        this.carouselIndex > 0
                          ? this.carouselIndex - 1
                          : decomposed.length - 1)}
                    class="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-[#84cc16] text-white hover:text-black flex items-center justify-center backdrop-blur-md border border-white/10 transition-all shadow-md"
                    title="Previous Layer"
                  >
                    ‹
                  </button>

                  <button
                    @click=${() =>
                      (this.carouselIndex =
                        this.carouselIndex < decomposed.length - 1
                          ? this.carouselIndex + 1
                          : 0)}
                    class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-[#84cc16] text-white hover:text-black flex items-center justify-center backdrop-blur-md border border-white/10 transition-all shadow-md"
                    title="Next Layer"
                  >
                    ›
                  </button>
                </div>

                <div
                  class="w-full flex items-center justify-between mt-3 px-1 text-xs"
                >
                  <div>
                    <span class="font-extrabold text-white text-sm"
                      >Layer ${this.carouselIndex + 1}</span
                    >
                    <span class="text-[11px] text-white/40 ml-2"
                      >Seedream Decomposed</span
                    >
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      @click=${() =>
                        this._toggleLayerVisibility(this.carouselIndex)}
                      class="p-1.5 rounded-lg border transition-all ${
                        this.visibleLayers[this.carouselIndex]
                          ? 'bg-white/10 text-[#a3e635] border-white/10'
                          : 'text-white/30 border-transparent'
                      }"
                      title="Toggle Visibility"
                    >
                      👁
                    </button>

                    <button
                      @click=${() =>
                        this._handleDownloadSingle(
                          decomposed[this.carouselIndex],
                          `layer_${this.carouselIndex + 1}.${this.outputFormat}`,
                        )}
                      class="px-2.5 py-1 rounded-lg bg-[#84cc16] hover:bg-[#a3e635] text-black font-extrabold text-xs flex items-center gap-1 shadow-md"
                      title="Download this layer"
                    >
                      <span>⬇</span>
                      <span>Save</span>
                    </button>
                  </div>
                </div>
              </div>

              <div
                class="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar"
              >
                ${decomposed.map(
                  (layerUrl, idx) => html`
                    <button
                      @click=${() => {
                        this.carouselIndex = idx;
                      }}
                      class="relative flex-shrink-0 w-14 h-12 rounded-xl overflow-hidden border transition-all p-1 bg-[#181a22] ${
                        this.carouselIndex === idx
                          ? 'border-[#84cc16] ring-2 ring-[#84cc16]/50 scale-105'
                          : 'border-white/10 opacity-60 hover:opacity-100'
                      }"
                    >
                      <img
                        src="${layerUrl}"
                        alt="Thumb ${idx + 1}"
                        class="w-full h-full object-contain"
                      />
                      <span
                        class="absolute bottom-0.5 right-1 text-[8px] font-black text-white/80 bg-black/60 px-1 rounded"
                      >
                        ${idx + 1}
                      </span>
                    </button>
                  `,
                )}
              </div>
            </div>
          `
          : nothing}
      </div>
    `;
  }

  // ─── VIEW 2: DEDICATED CLEAN UPSCALE VIEW ────────────────────────────────

  _viewUpscale() {
    const model = UPSCALE_MODELS.find((m) => m.id === this.upscaleModel);
    return html`
      <div class="space-y-4 animate-fade-in">
        <div class="space-y-2">
          <div class="flex items-center justify-between px-1">
            <span
              class="text-[11px] font-extrabold uppercase tracking-wider text-white/40"
            >
              Model
            </span>
            <button
              @click=${this._handleResetUpscale}
              class="flex items-center gap-1 text-[11px] font-bold text-white/50 hover:text-white transition-colors"
              title="Reset to default"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>Reset</span>
            </button>
          </div>

          <div class="relative">
            <button
              @click=${() => {
                this.isModelDropdownOpen = !this.isModelDropdownOpen;
              }}
              class="w-full bg-[#2d313d] hover:bg-[#343946] p-3 rounded-2xl border border-white/5 flex items-center justify-between text-left transition-all shadow-sm"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white flex-shrink-0"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <rect x="4" y="14" width="5" height="5" rx="1" />
                    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
                    <rect x="15" y="4" width="5" height="5" rx="1" />
                  </svg>
                </div>
                <div>
                  <h4 class="text-sm font-bold text-white leading-tight">
                    ${model?.name || 'Topaz'}
                  </h4>
                  <p class="text-[11px] text-white/50 truncate max-w-[200px]">
                    ${model?.subtitle}
                  </p>
                </div>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="text-white/40 transition-transform ${
                  this.isModelDropdownOpen ? 'rotate-180' : ''
                }"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            ${this.isModelDropdownOpen
              ? html`
                <div
                  class="absolute top-full left-0 right-0 mt-2 bg-[#1f222b] border border-white/10 rounded-2xl p-1.5 shadow-2xl z-50 space-y-1"
                >
                  <div class="px-1 pt-0.5 pb-1">${originFilterPills(this.modelOriginFilter, (o) => (this.modelOriginFilter = o))}</div>
                  ${UPSCALE_MODELS.filter((m) => matchesOrigin(m, this.modelOriginFilter)).length === 0
                    ? html`<div class="text-xs text-white/30 text-center py-4">No models found</div>`
                    : UPSCALE_MODELS.filter((m) => matchesOrigin(m, this.modelOriginFilter)).map(
                        (opt) => html`
                          <button
                            @click=${() => {
                              this.upscaleModel = opt.id;
                              this.isModelDropdownOpen = false;
                            }}
                            class="w-full p-2.5 rounded-xl text-left flex flex-col transition-all ${
                              this.upscaleModel === opt.id
                                ? 'bg-[#343946] text-white'
                                : 'text-white/70 hover:bg-white/5 hover:text-white'
                            }"
                          >
                            <div class="flex items-center justify-between gap-2">
                              <span class="flex items-center gap-1.5 min-w-0">
                                <span class="text-xs font-bold text-white truncate">
                                  ${opt.name}
                                </span>${modelOriginBadge(opt)}
                              </span>
                              <span class="text-[10px] font-bold text-[#a3e635] shrink-0">
                                ${opt.cost} credits
                              </span>
                            </div>
                            <span class="text-[10px] text-white/40">
                              ${opt.subtitle}
                            </span>
                          </button>
                        `,
                      )}
                </div>
              `
              : nothing}
          </div>
        </div>

        ${this.upscaleModel === 'topaz-image-upscale'
          ? html`
            <div
              class="bg-[#2d313d] rounded-2xl p-3 border border-white/5 space-y-2 shadow-sm"
            >
              <div class="flex items-center justify-between px-1">
                <span
                  class="text-[11px] font-bold text-white/40 uppercase tracking-wider"
                >
                  Upscale Factor
                </span>
                <span
                  class="bg-[#181a22] text-white text-[10px] font-black px-2 py-0.5 rounded-lg border border-white/10"
                >
                  ${this.topazFactor * 442}×${this.topazFactor * 413}
                </span>
              </div>

              <div
                class="grid grid-cols-4 gap-1.5 bg-[#1a1c24] p-1 rounded-xl border border-white/5"
              >
                ${[1, 2, 4, 8].map(
                  (fac) => html`
                    <button
                      @click=${() => {
                        this.topazFactor = fac;
                      }}
                      class="py-2 text-xs font-extrabold rounded-lg transition-all ${
                        this.topazFactor === fac
                          ? 'bg-[#383c4a] text-white shadow-md border border-white/10'
                          : 'text-white/40 hover:text-white'
                      }"
                    >
                      x${fac}
                    </button>
                  `,
                )}
              </div>
            </div>
          `
          : nothing}

        ${this.upscaleModel === 'seedvr2-image-upscale'
          ? html`
            <div
              class="bg-[#2d313d] rounded-2xl p-3 border border-white/5 space-y-2 shadow-sm"
            >
              <div class="flex items-center justify-between px-1">
                <span
                  class="text-[11px] font-bold text-white/40 uppercase tracking-wider"
                >
                  Resolution
                </span>
                <span
                  class="bg-[#181a22] text-white text-[10px] font-black px-2 py-0.5 rounded-lg border border-white/10"
                >
                  ${this.seedvrResolution.toUpperCase()} UHD
                </span>
              </div>

              <div
                class="grid grid-cols-3 gap-1.5 bg-[#1a1c24] p-1 rounded-xl border border-white/5"
              >
                ${['2k', '4k', '8k'].map(
                  (res) => html`
                    <button
                      @click=${() => {
                        this.seedvrResolution = res;
                      }}
                      class="py-2 text-xs font-extrabold uppercase rounded-lg transition-all ${
                        this.seedvrResolution === res
                          ? 'bg-[#383c4a] text-white shadow-md border border-white/10'
                          : 'text-white/40 hover:text-white'
                      }"
                    >
                      ${res}
                    </button>
                  `,
                )}
              </div>
            </div>
          `
          : nothing}

        ${this.upscaleModel === 'ai-image-upscaler'
          ? html`
            <div
              class="bg-[#2d313d] rounded-2xl p-4 border border-white/5 flex items-center gap-3 shadow-sm"
            >
              <div
                class="w-8 h-8 rounded-xl bg-[#84cc16]/10 text-[#84cc16] flex items-center justify-center flex-shrink-0"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <polygon
                    points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                  />
                </svg>
              </div>
              <div>
                <h5 class="text-xs font-bold text-white"
                  >Automatic AI Super-Resolution</h5
                >
                <p class="text-[10px] text-white/50"
                  >1-click neural clarity and noise reduction.</p
                >
              </div>
            </div>
          `
          : nothing}
      </div>
    `;
  }

  // ─── VIEW 3: DEDICATED COLOR GRADING VIEW ────────────────────────────────

  _viewColorGrading() {
    const cg = this.colorGrading;
    return html`
      <div class="space-y-4 animate-fade-in">
        <!-- 1. Color Correct Card -->
        ${this._colorGradingCard(
          'Color Correct',
          'Temperature, hue, saturation, contrast and split-tone',
          'colorCorrect',
          html`
            <div class="space-y-2 pt-1">
              ${this._sliderRow(
                'Temp',
                -100,
                100,
                undefined,
                cg.colorCorrect.temp,
                (e) => this._setGradingValue('colorCorrect', 'temp', e),
                cg.colorCorrect.temp,
              )}
              ${this._sliderRow(
                'Hue',
                -180,
                180,
                '0.5',
                cg.colorCorrect.hue,
                (e) => this._setGradingValue('colorCorrect', 'hue', e),
                cg.colorCorrect.hue.toFixed(1),
              )}
              ${this._sliderRow(
                'Saturation',
                -100,
                100,
                undefined,
                cg.colorCorrect.saturation,
                (e) => this._setGradingValue('colorCorrect', 'saturation', e),
                cg.colorCorrect.saturation,
              )}
              ${this._sliderRow(
                'Contrast',
                -100,
                100,
                undefined,
                cg.colorCorrect.contrast,
                (e) => this._setGradingValue('colorCorrect', 'contrast', e),
                cg.colorCorrect.contrast,
              )}
              ${this._sliderRow(
                'Split Tone',
                0,
                1,
                '0.05',
                cg.colorCorrect.splitTone,
                (e) => this._setGradingValue('colorCorrect', 'splitTone', e),
                cg.colorCorrect.splitTone.toFixed(1),
              )}
            </div>
          `,
        )}

        <!-- 2. Soften Details Card -->
        ${this._colorGradingCard(
          'Soften Details',
          'Radius and detail softening',
          'softenDetails',
          html`
            <div class="space-y-2 pt-1">
              ${this._sliderRow(
                'Radius',
                0,
                50,
                undefined,
                cg.softenDetails.radius,
                (e) => this._setGradingValue('softenDetails', 'radius', e),
                cg.softenDetails.radius,
              )}
              ${this._sliderRow(
                'Detail',
                0,
                1,
                '0.05',
                cg.softenDetails.detail,
                (e) => this._setGradingValue('softenDetails', 'detail', e),
                cg.softenDetails.detail.toFixed(2),
              )}
            </div>
          `,
        )}

        <!-- 3. Bloom Card -->
        ${this._colorGradingCard(
          'Bloom',
          'Luminescence diffusion and blend mode',
          'bloom',
          html`
            <div class="space-y-2 pt-1">
              ${this._sliderRow(
                'Radius',
                0,
                50,
                undefined,
                cg.bloom.radius,
                (e) => this._setGradingValue('bloom', 'radius', e),
                cg.bloom.radius,
              )}
              ${this._sliderRow(
                'Bright',
                0,
                10,
                '0.5',
                cg.bloom.bright,
                (e) => this._setGradingValue('bloom', 'bright', e),
                cg.bloom.bright.toFixed(1),
              )}
              ${this._sliderRow(
                'Fade',
                0,
                1,
                '0.05',
                cg.bloom.fade,
                (e) => this._setGradingValue('bloom', 'fade', e),
                cg.bloom.fade.toFixed(2),
              )}
              <div
                class="bg-[#1f222d] rounded-2xl p-2 flex items-center justify-between"
              >
                <span class="text-xs font-semibold text-white/70 px-1"
                  >Blend</span
                >
                <div
                  class="grid grid-cols-2 gap-1 bg-[#151720] p-0.5 rounded-xl border border-white/5"
                >
                  ${['Screen', 'Soft Light'].map(
                    (b) => html`
                      <button
                        @click=${() => {
                          this.colorGrading = {
                            ...this.colorGrading,
                            bloom: { ...this.colorGrading.bloom, blend: b },
                          };
                        }}
                        class="px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                          this.colorGrading.bloom.blend === b
                            ? 'bg-[#383c4a] text-white shadow'
                            : 'text-white/40 hover:text-white'
                        }"
                      >
                        ${b}
                      </button>
                    `,
                  )}
                </div>
              </div>
            </div>
          `,
        )}

        <!-- 4. Halation Card -->
        ${this._colorGradingCard(
          'Halation',
          'Film red glow around intense highlights',
          'halation',
          html`
            <div class="space-y-2 pt-1">
              ${this._sliderRow(
                'Strength',
                0,
                1,
                '0.05',
                cg.halation.strength,
                (e) => this._setGradingValue('halation', 'strength', e),
                cg.halation.strength.toFixed(2),
              )}
              ${this._sliderRow(
                'Threshold',
                0,
                1,
                '0.05',
                cg.halation.threshold,
                (e) => this._setGradingValue('halation', 'threshold', e),
                cg.halation.threshold.toFixed(2),
              )}
              ${this._sliderRow(
                'Radius',
                0,
                50,
                undefined,
                cg.halation.radius,
                (e) => this._setGradingValue('halation', 'radius', e),
                cg.halation.radius,
              )}
            </div>
          `,
        )}

        <!-- 5. Lens Instructions Card -->
        ${this._colorGradingCard(
          'Lens Instructions',
          'Vignette and optical lens distortion',
          'lensInstructions',
          html`
            <div class="space-y-2 pt-1">
              ${this._sliderRow(
                'Strength',
                0,
                1,
                '0.01',
                cg.lensInstructions.strength,
                (e) => this._setGradingValue('lensInstructions', 'strength', e),
                cg.lensInstructions.strength.toFixed(3),
              )}
              ${this._sliderRow(
                'Radius',
                0,
                50,
                undefined,
                cg.lensInstructions.radius,
                (e) => this._setGradingValue('lensInstructions', 'radius', e),
                cg.lensInstructions.radius,
              )}
              ${this._sliderRow(
                'Vignette',
                0,
                1,
                '0.05',
                cg.lensInstructions.vignette,
                (e) => this._setGradingValue('lensInstructions', 'vignette', e),
                cg.lensInstructions.vignette.toFixed(2),
              )}
              ${this._sliderRow(
                'Distortion',
                -1,
                1,
                '0.05',
                cg.lensInstructions.distortion,
                (e) =>
                  this._setGradingValue('lensInstructions', 'distortion', e),
                cg.lensInstructions.distortion.toFixed(2),
              )}
            </div>
          `,
        )}

        <!-- 6. Exposure Card -->
        ${this._colorGradingCard(
          'Exposure',
          'Exposure stops adjustment',
          'exposure',
          html`
            <div class="space-y-2 pt-1">
              ${this._sliderRow(
                'Stops',
                -5,
                5,
                '0.1',
                cg.exposure.stops,
                (e) => this._setGradingValue('exposure', 'stops', e),
                cg.exposure.stops.toFixed(2),
              )}
            </div>
          `,
        )}

        <!-- 7. Film Grain Card -->
        ${this._colorGradingCard(
          'Film Grain',
          'Analog film stock grain simulation',
          'filmGrain',
          html`
            <div class="space-y-2 pt-1">
              ${this._sliderRow(
                'Strength',
                0,
                1,
                '0.05',
                cg.filmGrain.strength,
                (e) => this._setGradingValue('filmGrain', 'strength', e),
                cg.filmGrain.strength.toFixed(2),
              )}
              ${this._sliderRow(
                'Bias',
                0,
                1,
                '0.05',
                cg.filmGrain.bias,
                (e) => this._setGradingValue('filmGrain', 'bias', e),
                cg.filmGrain.bias.toFixed(2),
              )}
              <div
                class="bg-[#1f222d] rounded-2xl p-2 flex items-center justify-between"
              >
                <span class="text-xs font-semibold text-white/70 px-1"
                  >Size</span
                >
                <div
                  class="grid grid-cols-3 gap-1 bg-[#151720] p-0.5 rounded-xl border border-white/5"
                >
                  ${['35mm', '16mm', '8mm'].map(
                    (sz) => html`
                      <button
                        @click=${() => {
                          this.colorGrading = {
                            ...this.colorGrading,
                            filmGrain: {
                              ...this.colorGrading.filmGrain,
                              size: sz,
                            },
                          };
                        }}
                        class="px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                          this.colorGrading.filmGrain.size === sz
                            ? 'bg-[#383c4a] text-white shadow'
                            : 'text-white/40 hover:text-white'
                        }"
                      >
                        ${sz}
                      </button>
                    `,
                  )}
                </div>
              </div>
            </div>
          `,
        )}
      </div>
    `;
  }

  // ─── VIEW 4: DEDICATED REMOVE BACKGROUND VIEW (ai-background-remover) ───

  _viewRemoveBg() {
    return html`
      <div class="space-y-4 animate-fade-in">
        <!-- Model Selector Card -->
        <div class="space-y-2">
          <div class="flex items-center justify-between px-1">
            <span
              class="text-[11px] font-extrabold uppercase tracking-wider text-white/40"
            >
              Model
            </span>
            <span
              class="text-[10px] font-bold text-[#a3e635] bg-[#84cc16]/15 px-2 py-0.5 rounded-md"
            >
              1.0 credit
            </span>
          </div>

          <div
            class="bg-[#2d313d] p-3.5 rounded-2xl border border-white/5 flex items-center gap-3 shadow-sm"
          >
            <div
              class="w-10 h-10 rounded-xl bg-[#84cc16]/10 text-[#84cc16] flex items-center justify-center flex-shrink-0"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"
                />
              </svg>
            </div>
            <div>
              <h4 class="text-sm font-bold text-white leading-tight"
                >AI Background Remover</h4
              >
              <p class="text-[11px] text-white/50">ai-background-remover</p>
            </div>
          </div>
        </div>

        <!-- Transparency Preview Card -->
        <div
          class="bg-[#2d313d] rounded-3xl p-4 border border-white/5 space-y-3 shadow-sm"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-white">Target Preview</span>
            <span class="text-[10px] text-white/40"
              >Alpha Matte Cutout</span
            >
          </div>

          <div
            class="w-full h-44 rounded-2xl overflow-hidden relative flex items-center justify-center border border-white/10"
            style=${CHECKERBOARD_14}
          >
            ${this.currentImageUrl
              ? html`<img
                  src="${this.currentImageUrl}"
                  alt="Current input"
                  class="max-h-full max-w-full object-contain drop-shadow-md"
                />`
              : nothing}
          </div>

          <div class="space-y-1.5 pt-1">
            <div class="flex items-center gap-2 text-xs text-white/70">
              <span class="text-[#a3e635] font-bold">✓</span>
              <span
                >Precision edge extraction (hair, fur, fine contours)</span
              >
            </div>
            <div class="flex items-center gap-2 text-xs text-white/70">
              <span class="text-[#a3e635] font-bold">✓</span>
              <span>High-resolution transparent PNG output</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ─── VIEW 5: DEDICATED EXPAND IMAGE VIEW (ai-image-extension) ────────────

  _viewExpandCrop() {
    return html`
      <div class="space-y-4 animate-fade-in">
        <!-- Model Selector Card -->
        <div class="space-y-2">
          <div class="flex items-center justify-between px-1">
            <span
              class="text-[11px] font-extrabold uppercase tracking-wider text-white/40"
            >
              Model
            </span>
            <span
              class="text-[10px] font-bold text-[#a3e635] bg-[#84cc16]/15 px-2 py-0.5 rounded-md"
            >
              0.03 credits
            </span>
          </div>

          <div
            class="bg-[#2d313d] p-3.5 rounded-2xl border border-white/5 flex items-center gap-3 shadow-sm"
          >
            <div
              class="w-10 h-10 rounded-xl bg-[#84cc16]/10 text-[#84cc16] flex items-center justify-center flex-shrink-0"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <polyline points="21 15 21 21 15 21" />
                <polyline points="3 9 3 3 9 3" />
              </svg>
            </div>
            <div>
              <h4 class="text-sm font-bold text-white leading-tight"
                >AI Image Extension</h4
              >
              <p class="text-[11px] text-white/50">ai-image-extension</p>
            </div>
          </div>
        </div>

        <!-- Interactive Outpaint Expansion Canvas Preview Card -->
        <div
          class="bg-[#2d313d] rounded-3xl p-4 border border-white/5 space-y-3 shadow-sm"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-white">Canvas Preview</span>
            <span class="text-[10px] text-white/40"
              >Boundary Outpainting</span
            >
          </div>

          <div
            class="w-full h-44 rounded-2xl overflow-hidden relative flex items-center justify-center border border-dashed border-[#84cc16]/50 bg-[#161822] p-4"
          >
            <!-- Corner Guides -->
            <div
              class="absolute top-2 left-2 text-[#84cc16] text-[10px] font-mono"
            >
              ↖ Expand
            </div>
            <div
              class="absolute top-2 right-2 text-[#84cc16] text-[10px] font-mono"
            >
              ↗ Expand
            </div>
            <div
              class="absolute bottom-2 left-2 text-[#84cc16] text-[10px] font-mono"
            >
              ↙ Expand
            </div>
            <div
              class="absolute bottom-2 right-2 text-[#84cc16] text-[10px] font-mono"
            >
              ↘ Expand
            </div>

            ${this.currentImageUrl
              ? html`<div
                  class="relative border border-white/30 rounded-lg overflow-hidden shadow-2xl max-h-[75%] max-w-[75%]"
                >
                  <img
                    src="${this.currentImageUrl}"
                    alt="Current input"
                    class="w-full h-full object-contain"
                  />
                  <div
                    class="absolute inset-0 ring-1 ring-white/40 pointer-events-none"
                  ></div>
                </div>`
              : nothing}
          </div>

          <div class="space-y-1.5 pt-1">
            <div class="flex items-center gap-2 text-xs text-white/70">
              <span class="text-[#a3e635] font-bold">✓</span>
              <span
                >Expands borders while matching lighting, style & textures</span
              >
            </div>
            <div class="flex items-center gap-2 text-xs text-white/70">
              <span class="text-[#a3e635] font-bold">✓</span>
              <span
                >Automatic intelligent edge outpainting & continuation</span
              >
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ─── VIEW 6: TOOLS MENU ──────────────────────────────────────────────────

  _viewMenu() {
    return html`
      <div class="space-y-1 mb-6">
        ${SIDE_MENU_ITEMS.map(
          (item) => html`
            <button
              @click=${() => {
                this.activeSideTab = item.id;
              }}
              class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-white/70 hover:text-white hover:bg-white/5"
            >
              <div class="flex items-center gap-3">
                <span>${item.label}</span>
              </div>
              ${item.isNew
                ? html`<span
                    class="px-2 py-0.5 text-[10px] font-black uppercase bg-[#84cc16] text-black rounded-md tracking-wider"
                  >
                    New
                  </span>`
                : nothing}
            </button>
          `,
        )}
      </div>
    `;
  }

  // ─── Bottom Action Footer ────────────────────────────────────────────────

  _renderInspectorFooter() {
    const t = this.activeSideTab;
    const sparkIcon = html`
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 2L14.4 7.6L20 10L14.4 12.4L12 18L9.6 12.4L4 10L9.6 7.6L12 2Z"
        />
      </svg>
    `;
    const bigBtnClass =
      'w-full py-3.5 bg-[#e2f924] hover:bg-[#d4ed1b] active:scale-[0.98] text-black font-extrabold text-sm rounded-2xl shadow-[0_4px_25px_rgba(226,249,36,0.35)] transition-all flex items-center justify-center gap-2 tracking-tight disabled:opacity-50';

    if (t === 'layer-decomposition') {
      return html`
        <div class="p-4 bg-[#242833] border-t border-white/10 flex flex-col gap-2">
          <button
            @click=${() => this._handleDecompose()}
            ?disabled=${this.isProcessing}
            class="${bigBtnClass}"
          >
            ${this.isProcessing
              ? html`<span>Decomposing (${this.progress}%)...</span>`
              : html`${sparkIcon}<span>Separate layers ${
                  this.layerCount > 4 ? 12 : 8
                }</span>`}
          </button>
        </div>
      `;
    }
    if (t === 'upscale') {
      return html`
        <div class="p-4 bg-[#242833] border-t border-white/10 flex flex-col gap-2">
          <button
            @click=${this._handleRunUpscale}
            ?disabled=${this.isProcessing}
            class="${bigBtnClass}"
          >
            ${this.isProcessing
              ? html`<span>Upscaling (${this.progress}%)...</span>`
              : html`${sparkIcon}<span
                  >Upscale ${
                    this.upscaleModel === 'seedvr2-image-upscale'
                      ? '0.02'
                      : '1.0'
                  }</span
                >`}
          </button>
        </div>
      `;
    }
    if (t === 'color-grading') {
      return html`
        <div class="p-4 bg-[#242833] border-t border-white/10 flex flex-col gap-2">
          <div class="flex items-center gap-2.5 w-full">
            <button
              @click=${this._handleResetAllColorGrading}
              class="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/15 text-white flex items-center justify-center transition-all border border-white/10 hover:border-white/20 flex-shrink-0"
              title="Reset All Color Grading"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>

            <button
              @click=${this._handleDownloadGradedImage}
              class="flex-1 py-3.5 bg-white/10 hover:bg-white/15 text-white font-extrabold text-sm rounded-2xl border border-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-2 shadow-md"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download</span>
            </button>
          </div>
        </div>
      `;
    }
    if (t === 'remove-bg') {
      return html`
        <div class="p-4 bg-[#242833] border-t border-white/10 flex flex-col gap-2">
          <button
            @click=${this._handleRunRemoveBg}
            ?disabled=${this.isProcessing}
            class="${bigBtnClass}"
          >
            ${this.isProcessing
              ? html`<span>Removing background (${this.progress}%)...</span>`
              : html`${sparkIcon}<span>Remove Background 1.0</span>`}
          </button>
        </div>
      `;
    }
    if (t === 'expand-crop') {
      return html`
        <div class="p-4 bg-[#242833] border-t border-white/10 flex flex-col gap-2">
          <button
            @click=${this._handleRunExpand}
            ?disabled=${this.isProcessing}
            class="${bigBtnClass}"
          >
            ${this.isProcessing
              ? html`<span>Expanding borders (${this.progress}%)...</span>`
              : html`${sparkIcon}<span>Expand Image 0.03</span>`}
          </button>
        </div>
      `;
    }
    return nothing;
  }
}

customElements.define('studio-layers', StudioLayers);
