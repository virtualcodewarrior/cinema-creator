// Port of packages/studio/src/components/DesignAgentStudio.jsx (wrapper) +
// packages/Open-AI-Design-Agent/packages/design-agent/src/CreativeCanvas.jsx.
//
// Porting notes:
// - react-router (useNavigate/useSearchParams) -> lib/router.js. In the studio
//   shell both the standalone "/canvas" path and "?session=…" queries map onto
//   the current page, so _nav() rewrites them onto /studio/design exactly like
//   the original navTo() helper did. Search-only navigations are forwarded to
//   the already-mounted element by the shell (setSearch) instead of remounting.
// - axios -> fetch (getHeaders keeps the localStorage Bearer token the
//   wrapper wrote synchronously before this element's effects run). The
//   multipart upload keeps XMLHttpRequest for onUploadProgress parity.
// - next-themes useTheme: the shell renders no ThemeProvider, so the hook
//   resolved to its no-op default ({setTheme: () => {}}); theme is the forced
//   "dark" from DesignAgentStudio, and the profile-menu "Dark Mode" row is a
//   no-op here exactly as it is in the React build.
// - react-hot-toast -> the app-level <app-toaster> via lib/toast.js.
// - react-markdown + remark-gfm + Prism SyntaxHighlighter -> lib/markdown
//   (marked+DOMPurify+highlight.js) with a post-pass that reproduces the
//   custom markdownComponents (media links, p/pre/code wrappers, line numbers).
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { iconSvg } from '../../lib/icons.js';
import toast from '../../lib/toast.js';
import { navigate } from '../../lib/router.js';
import { renderMarkdown, highlightBlocks, hljs } from '../../lib/markdown.js';
import { getUserBalance } from '../../../packages/studio/src/backendClient.js';
import './design-canvas-area.js';
import './design-plan.js';

const API = '/api/v1/creative-agent';

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDateHeader = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};

const TOOL_ICONS = {
  generate_image: '🎨',
  edit_image: '✏️',
  generate_video: '🎬',
  image_to_video: '🎥',
  edit_video: '🎞️',
  lipsync_video: '💋',
  concat_videos: '🔗',
  generate_audio: '🎵',
  enhance_image: '✨',
  upload_file: '📤',
  list_models: '📚',
  ask_user: '❓',
  propose_plan: '📋',
  list_assets: '📁',
  get_asset: '🔍',
  remaining_budget: '💰',
};

export class StudioDesign extends BaseElement {
  static sheetKey = 'design';

  static properties = {
    // Wrapper props (DesignAgentStudio) — none are passed by the shell, but
    // the port keeps the contract so the element is self-contained.
    apiKey: { attribute: false },
    userEmail: { attribute: false },
    balance: { attribute: false },
    isHeaderVisible: { attribute: false },
    onToggleHeader: { attribute: false },
    onGenerationStart: { attribute: false },
    onGenerationEnd: { attribute: false },
    onGenerationComplete: { attribute: false },
    onGenerationError: { attribute: false },
    // CreativeCanvas props
    isEmbed: { attribute: false },
    embedCode: { attribute: false },
    navLinks: { attribute: false },
    userBalanceLabel: { attribute: false },
    // internal
    mounted: { state: true },
    userData: { state: true },
    sessionId: { state: true },
    input: { state: true },
    messages: { state: true },
    assets: { state: true },
    activeTasks: { state: true },
    busy: { state: true },
    openProfile: { state: true },
    zoomLevel: { state: true },
    attachments: { state: true },
    uploading: { state: true },
    uploadProgress: { state: true },
    isDragging: { state: true },
    sessions: { state: true },
    currentSessionName: { state: true },
    isEditingName: { state: true },
    newName: { state: true },
    skills: { state: true },
    activeSkill: { state: true },
    showSkillsMenu: { state: true },
    showAssetsMenu: { state: true },
    showMentionPopup: { state: true },
    mentionQuery: { state: true },
    mentionCursorPos: { state: true },
    hoveredAsset: { state: true },
    showLeftSidebar: { state: true },
    editingSessionId: { state: true },
    editingSessionName: { state: true },
    hoveredSessionId: { state: true },
    sidebarWidth: { state: true },
    showChat: { state: true },
    prevWidth: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
  `;

  constructor() {
    super();
    this.apiKey = undefined;
    this.userEmail = undefined;
    this.balance = undefined;
    this.isHeaderVisible = true;
    this.onToggleHeader = null;
    this.onGenerationStart = null;
    this.onGenerationEnd = null;
    this.onGenerationComplete = null;
    this.onGenerationError = null;
    this.isEmbed = false;
    this.embedCode = null;
    this.navLinks = null;
    this.userBalanceLabel = null;

    // Written SYNCHRONOUSLY here (before firstUpdated's mount effects) so the
    // token is in localStorage before the sessions/agent-skills fetches go
    // out authenticated — same ordering constraint as the React wrapper.
    if (typeof window !== 'undefined' && this.apiKey) {
      sessionStorage.setItem('fromDesignAgent', 'true');
      localStorage.setItem('token', this.apiKey);
    }

    this.mounted = false;
    this.userData = null;
    this.sessionId = this._sessionFromSearch();
    this.input = '';
    this.messages = [];
    this.assets = [];
    this.activeTasks = [];
    this.busy = false;
    this.openProfile = false;
    this.zoomLevel = 100;
    this.attachments = [];
    this.uploading = false;
    this.uploadProgress = 0;
    this.isDragging = false;
    this.sessions = [];
    this.currentSessionName = 'Creative Canvas';
    this.isEditingName = false;
    this.newName = '';
    this.skills = [];
    this.activeSkill = null;
    this.showSkillsMenu = false;
    this.showAssetsMenu = false;
    this.showMentionPopup = false;
    this.mentionQuery = '';
    this.mentionCursorPos = 0;
    this.hoveredAsset = null;
    this.showLeftSidebar = true;
    this.editingSessionId = null;
    this.editingSessionName = '';
    this.hoveredSessionId = null;
    this.sidebarWidth = 350;
    this.showChat = true;
    this.prevWidth = 350;

    // theme: forced "dark" from DesignAgentStudio (useTheme resolves to its
    // no-op default in the shell — no ThemeProvider).
    this.forcedTheme = 'dark';

    this._isResizing = false;
    this._syncedUrls = new Set();
    this._justCreatedSession = false;
    this._handoffDone = false;
    this._canvas = null;
    this._chatEnd = null;
    this._textarea = null;
    this._fileInput = null;
    this._assetSyncTimer = null;
    this._mdKeys = new WeakMap();
  }

  get inEmbedMode() {
    return this.isEmbed && !!this.embedCode;
  }

  _sessionFromSearch() {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('session');
  }

  connectedCallback() {
    super.connectedCallback();
    // Wrapper effect (DesignAgentStudio useEffect on [apiKey, userEmail, balance]).
    if (this.apiKey) this._loadUserData();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._assetSyncTimer) clearInterval(this._assetSyncTimer);
  }

  _loadUserData() {
    if (!this.apiKey) return;
    if (this.userEmail !== undefined || this.balance !== undefined) {
      this.userData = {
        username: (this.userEmail || '').split('@')[0] || 'Studio User',
        email: this.userEmail,
        balance: this.balance || 0,
      };
      return;
    }
    (async () => {
      try {
        const data = await getUserBalance(this.apiKey);
        this.userData = {
          username: (data.email || '').split('@')[0] || 'Studio User',
          email: data.email,
          balance: data.balance || 0,
        };
      } catch (err) {
        console.error('Failed to fetch user data for Design Agent:', err);
      }
    })();
  }

  firstUpdated() {
    // Initialize effect.
    this.mounted = true;
    if (!this.inEmbedMode) this.fetchSessions();
    this.fetchSkills();
    this._onSessionChange();
  }

  updated(changed) {
    if (!this.mounted) return;
    // Keep the canvas element + element refs in step with the render root.
    const canvas = this.renderRoot.querySelector('design-canvas-area');
    if (canvas && this._canvas !== canvas) {
      this._canvas = canvas;
      canvas.activeTasks = this.activeTasks;
      canvas.onZoomChange = (z) => {
        this.zoomLevel = z;
      };
    }
    this._textarea = this.renderRoot.querySelector('textarea');
    this._fileInput = this.renderRoot.querySelector('input[type="file"]');
    const chatEnd = this.renderRoot.querySelector('#chat-end');
    if (chatEnd && this._chatEnd !== chatEnd) this._chatEnd = chatEnd;

    if (changed.has('mounted') && this.mounted) {
      // React autofocus on the chat textarea.
      requestAnimationFrame(() => this._textarea?.focus());
    }
    if (
      changed.has('mounted') ||
      changed.has('busy') ||
      changed.has('messages') ||
      changed.has('skills')
    ) {
      this._initialHandoff();
    }
    if (changed.has('assets') || changed.has('sessionId')) this._syncAssetsToCanvas();
    if (changed.has('messages') || changed.has('busy')) {
      if (this._chatEnd) this._chatEnd.scrollIntoView({ behavior: 'smooth' });
      this._postProcessMarkdown();
    }
  }

  // Called by the shell when a same-route search change dispatches
  // (?session=… navigations must not remount the studio).
  setSearch(search) {
    const next = (search || window.location.search || '')
      .replace(/^\?/, '');
    const id = new URLSearchParams(next).get('session');
    if (this._justCreatedSession) {
      // Mirrors the React sessionId effect's early return for the session
      // that ensureSession() just created via router.replace.
      this._justCreatedSession = false;
      this._initialHandoff();
      return;
    }
    if (id !== this.sessionId) {
      this.sessionId = id;
      this._onSessionChange();
    }
    this._initialHandoff();
  }

  // navTo() equivalent for lib/router's full-path navigate().
  _nav(to, { replace = false } = {}) {
    let path;
    if (!to || to === '/canvas') path = '/studio/design';
    else if (typeof to === 'string' && to.startsWith('?')) path = '/studio/design' + to;
    else path = to;
    navigate(path, { replace });
  }

  getHeaders() {
    if (this.inEmbedMode) {
      return { 'x-agent-embed-code': this.embedCode };
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async _api(method, path, { params = undefined, body = undefined } = {}) {
    const url = new URL(path, window.location.origin);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const headers = { ...this.getHeaders() };
    let payload;
    if (body !== undefined) {
      if (body instanceof FormData) payload = body;
      else {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
    }
    const res = await fetch(url.toString(), { method, headers, body: payload });
    const clone = res.clone();
    let data = null;
    try {
      data = await clone.json();
    } catch {
      /* non-json */
    }
    if (!res.ok) {
      const err = new Error(
        (data && (data.detail || data.message)) || `Request failed with status code ${res.status}`,
      );
      err.response = { data, status: res.status };
      throw err;
    }
    return data;
  }

  // ─── Session management ───────────────────────────────────────────────────

  fetchSessions = async () => {
    try {
      const data = await this._api('GET', `${API}/sessions`);
      this.sessions = data || [];
      if (this.sessionId) {
        const current = this.sessions.find((s) => s.id === this.sessionId);
        if (current) this.currentSessionName = current.name;
      }
    } catch {}
  };

  fetchSkills = async () => {
    try {
      const data = await this._api('GET', `${API}/agent-skills`);
      this.skills = data || [];
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    }
  };

  _onSessionChange() {
    if (this._justCreatedSession) {
      this._justCreatedSession = false;
      return;
    }
    this._syncedUrls.clear();
    if (this.sessionId) {
      this.loadHistory();
      this.loadAssets();
      const current = this.sessions.find((s) => s.id === this.sessionId);
      if (current) {
        this.currentSessionName = current.name;
      } else {
        this.fetchSessions();
      }
    } else {
      this.messages = [
        {
          role: 'assistant',
          content: `Hello ${this.userData?.username || 'User'} — what shall we create today?`,
          timestamp: new Date().toISOString(),
        },
      ];
      this.assets = [];
      this.currentSessionName = 'New Session';
    }
  }

  _initialHandoff() {
    if (!this.mounted || this.busy || this._handoffDone) return;
    if (this.inEmbedMode) {
      this._handoffDone = true;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const skillName = params.get('skill');
    const a = params.get('a');
    if (!q && !skillName && !a) {
      this._handoffDone = true;
      return;
    }
    const isNewSession = this.messages.length === 1 && this.messages[0].role === 'assistant';
    if (isNewSession) {
      this._handoffDone = true;
      let initialAtts = null;
      if (a) {
        initialAtts = a.split(',').map((label) => ({ asset_label: label, kind: 'image' }));
      }
      if (skillName && !this.activeSkill) {
        const found = this.skills.find((s) => s.name === skillName);
        if (found) {
          this.activeSkill = found;
          if (q) setTimeout(() => this.sendMessage(q, found, initialAtts), 10);
        }
      } else if (q) {
        this.sendMessage(q, null, initialAtts);
      }
      const newParams = new URLSearchParams(params.toString());
      newParams.delete('q');
      newParams.delete('skill');
      newParams.delete('a');
      this._nav(`?${newParams.toString()}`, { replace: true });
    } else if (
      this.messages.length > 1 ||
      (this.messages.length === 1 && this.messages[0].role === 'user')
    ) {
      this._handoffDone = true;
      const newParams = new URLSearchParams(params.toString());
      newParams.delete('q');
      newParams.delete('skill');
      newParams.delete('a');
      this._nav(`?${newParams.toString()}`, { replace: true });
    }
  }

  loadHistory = async () => {
    try {
      const data = await this._api('GET', `${API}/sessions/${this.sessionId}/messages`);
      if (data && data.length > 0) {
        const cleaned = data.map((m) => ({
          ...m,
          events: (m.events || []).map((e, idx, arr) => {
            if (
              (e.type === 'info' &&
                (e.content?.includes('approval') || e.content?.includes('confirmation'))) ||
              e.type === 'plan_propose'
            ) {
              const hasResult = arr
                .slice(idx + 1)
                .some(
                  (next) =>
                    next.job_id === e.job_id &&
                    (next.type === 'tool_result' || next.type === 'error'),
                );
              if (hasResult) return { ...e, handled: true };
            }
            return e;
          }),
        }));
        this.messages = cleaned;
        this.checkActiveJobs(cleaned);
      } else {
        this.messages = [
          {
            role: 'assistant',
            content: `Session ready — what shall we create?`,
            timestamp: new Date().toISOString(),
          },
        ];
      }
    } catch {
      this.messages = [
        {
          role: 'assistant',
          content: `Session ready — what shall we create?`,
          timestamp: new Date().toISOString(),
        },
      ];
    }
  };

  checkActiveJobs = async (currentMessages) => {
    if (!this.sessionId) return;
    try {
      const data = await this._api('GET', `${API}/sessions/${this.sessionId}/jobs`);
      const active = (data || []).find(
        (j) => (j.status === 'pending' || j.status === 'processing') && j.id,
      );
      if (active) {
        let aIdx = currentMessages.length - 1;
        if (aIdx < 0 || currentMessages[aIdx].role !== 'assistant') {
          const next = [
            ...currentMessages,
            { role: 'assistant', content: '', events: [], timestamp: new Date().toISOString() },
          ];
          this.messages = next;
          this.resumePolling(active.id, next.length - 1);
        } else {
          this.resumePolling(active.id, aIdx);
        }
      }
    } catch {}
  };

  loadAssets = async () => {
    if (!this.sessionId) return;
    try {
      const data = await this._api('GET', `${API}/sessions/${this.sessionId}/assets`);
      this.assets = data || [];
    } catch {}
  };

  ensureSession = async () => {
    if (this.sessionId) return this.sessionId;
    const data = await this._api('POST', `${API}/sessions`, { body: {} });
    this._justCreatedSession = true;
    if (this.inEmbedMode) {
      this._setActiveEmbedSession(data.id);
    } else {
      this.sessionId = data.id;
      this._nav(`?session=${data.id}`, { replace: true });
      this.fetchSessions();
    }
    return data.id;
  };

  _setActiveEmbedSession(id) {
    const key = this.inEmbedMode ? `muapi_agent_session_${this.embedCode}` : null;
    if (typeof window !== 'undefined' && key) {
      if (id) window.localStorage.setItem(key, id);
      else window.localStorage.removeItem(key);
    }
  }

  // ─── Agent event stream ───────────────────────────────────────────────────

  processEvent(ev, msgIdx) {
    const p = ev.payload || {};
    if (ev.type === 'canvas_op') {
      const op = p.op;
      const args = p.args || {};
      const c = this._canvas;
      if (!c) return;
      if (op === 'move' && typeof c.moveNode === 'function') {
        c.moveNode(args.asset_id, args.x, args.y);
      } else if (op === 'arrange' && typeof c.arrangeNodes === 'function') {
        c.arrangeNodes(args.moves || []);
      }
      return;
    }

    const flat = (() => {
      switch (ev.type) {
        case 'text':
          return { type: 'text', content: p.content };
        case 'info':
          return { type: 'info', content: p.content };
        case 'error':
          return { type: 'error', message: p.message };
        case 'tool_call':
          return { type: 'tool_call', name: p.name, args: p.args };
        case 'tool_result':
          return { type: 'tool_result', name: p.name, result: p.result, asset: p.asset };
        case 'plan_propose':
          return {
            type: 'plan_propose',
            title: p.title,
            nodes: p.nodes,
            total_credits: p.total_credits,
          };
        default:
          return { type: ev.type, ...p };
      }
    })();
    if (!flat) return;
    flat.job_id = ev.job_id || p.job_id;

    if (ev.approved !== undefined && ev.approved !== null) {
      const isApproval =
        flat.type === 'plan_propose' ||
        (flat.type === 'info' &&
          (flat.content?.includes('approval') || flat.content?.includes('confirmation')));
      if (isApproval) flat.handled = true;
    }

    {
      const prev = this.messages;
      const arr = [...prev];
      if (msgIdx < 0 || msgIdx >= arr.length) return;
      const m = { ...arr[msgIdx], events: [...(arr[msgIdx].events || [])] };
      if (m.events.find((e) => e.id === ev.id)) return;

      m.events.push({ ...flat, id: ev.id });
      if (flat.type === 'text') m.content = (m.content || '') + (flat.content || '');

      if (
        flat.type === 'info' &&
        (flat.content?.includes('approval') || flat.content?.includes('confirmation'))
      ) {
        const hasPlan = m.events.some((e) => e.job_id === flat.job_id && e.type === 'plan_propose');
        if (hasPlan) flat.handled = true;
      }

      if (flat.type === 'tool_result' || flat.type === 'error') {
        m.events = m.events.map(
          (e) =>
            e.job_id === flat.job_id &&
            ((e.type === 'info' &&
              (e.content?.includes('approval') || e.content?.includes('confirmation'))) ||
              e.type === 'plan_propose')
              ? { ...e, handled: true }
              : e,
        );
      }

      if (flat.type === 'plan_propose') {
        m.events = m.events.map(
          (e) =>
            e.job_id === flat.job_id &&
            e.type === 'info' &&
            (e.content?.includes('approval') || e.content?.includes('confirmation'))
              ? { ...e, handled: true }
              : e,
        );
      }

      arr[msgIdx] = m;
      this.messages = arr;
    }

    if (
      flat.type === 'tool_call' &&
      ['generate_image', 'generate_video', 'image_to_video', 'edit_image', 'edit_video', 'enhance_image'].includes(
        flat.name,
      )
    ) {
      let x, y;
      const a = flat.args || {};
      const srcLabel = a.image || a.video || a.audio;
      if (srcLabel && typeof srcLabel === 'string' && srcLabel.startsWith('asset_')) {
        try {
          const cs = this._canvas?.getCanvasState?.();
          const srcNode = cs?.nodes?.find((n) => n.asset_id === srcLabel);
          if (srcNode) {
            x = srcNode.x + (srcNode.w || 200) + 32;
            y = srcNode.y;
          }
        } catch {}
      }
      this.activeTasks = [
        ...this.activeTasks,
        {
          taskId: `task-${Date.now()}-${Math.random()}`,
          modelName: flat.name,
          status: 'processing',
          x,
          y,
        },
      ];
      if (this._canvas && this._canvas.activeTasks !== this.activeTasks)
        this._canvas.activeTasks = this.activeTasks;
    }

    if (flat.type === 'tool_result' || flat.type === 'error') {
      {
        const idx = this.activeTasks.findIndex((t) => t.modelName === flat.name);
        if (idx !== -1) {
          const next = [...this.activeTasks];
          next.splice(idx, 1);
          this.activeTasks = next;
          if (this._canvas && this._canvas.activeTasks !== this.activeTasks)
            this._canvas.activeTasks = this.activeTasks;
        }
      }

      if (flat.asset) {
        {
          const pa = this.assets;
          const idx = pa.findIndex(
            (a) =>
              (flat.asset.asset_label && a.asset_label === flat.asset.asset_label) ||
              a.url === flat.asset.url,
          );
          if (idx !== -1) {
            const next = [...pa];
            next[idx] = { ...next[idx], ...flat.asset };
            this.assets = next;
          } else {
            this.assets = [...pa, flat.asset];
          }
        }

        const srcLabel = flat.result?.source_asset_id;
        const newLabel = flat.asset.asset_label;
        const newUrl = flat.asset.url;
        const newKind = flat.asset.kind || 'image';
        const place = this._canvas?.placeNextToSource || this._canvas?.replaceAt;
        if (srcLabel && newLabel && newUrl && place) {
          place(srcLabel, newUrl, newKind, newLabel);
          this._syncedUrls.add(`${newLabel}-${newUrl}`);
        }
      }
    }
  }

  resumePolling = async (jobId, assistantIdx) => {
    let cursor = 0;
    const POLL_INTERVAL = 1200;
    const MAX_DEAD_AIR = 6 * 60 * 1000;
    let lastProgress = Date.now();

    this.busy = true;
    while (true) {
      try {
        const data = await this._api('GET', `${API}/jobs/${jobId}/events`, {
          params: { since: cursor },
        });
        if (data.events?.length) {
          data.events.forEach((ev) => this.processEvent({ ...ev, approved: data.approved }, assistantIdx));
          cursor = data.cursor || cursor;
          lastProgress = Date.now();
        }
        if (data.done) break;
        if (Date.now() - lastProgress > MAX_DEAD_AIR) throw new Error('Stalled');
      } catch (err) {
        if (Date.now() - lastProgress > MAX_DEAD_AIR) break;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }
    this.busy = false;
    this.loadAssets();
    const next = [...this.messages];
    this._api('PATCH', `${API}/sessions/${this.sessionId}/messages`, {
      body: { messages: next },
    }).catch(() => {});
    this.messages = next;
  };

  handleJobAction = async (jobId, action) => {
    try {
      await this._api('POST', `${API}/jobs/${jobId}/${action}`, { body: {} });
      toast.success(`Job ${action}ed`);
      this.messages = this.messages.map((m) => ({
        ...m,
        events: (m.events || []).map(
          (e) =>
            e.job_id === jobId &&
            ((e.type === 'info' &&
              (e.content?.includes('approval') || e.content?.includes('confirmation'))) ||
              e.type === 'plan_propose')
              ? { ...e, handled: true }
              : e,
        ),
      }));
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to ${action} job`);
    }
  };

  // ─── Uploads & chat ───────────────────────────────────────────────────────

  processFile = async (file) => {
    if (!file) return;
    this.uploading = true;
    this.uploadProgress = 0;
    try {
      const activeSessionId = await this.ensureSession();
      const signData = await this._api('GET', '/api/v1/get_upload_url', {
        params: { filename: file.name },
      });
      const { url, fields } = signData;
      const formData = new FormData();
      formData.append('x-proxy-target-url', url);
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append('file', file);

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/v1/upload-binary');
        xhr.setRequestHeader('Content-Type', 'multipart/form-data');
        Object.entries(this.getHeaders()).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.upload.onprogress = (pe) => {
          if (pe.lengthComputable)
            this.uploadProgress = Math.round((pe.loaded * 100) / pe.total);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(formData);
      });

      const uploadedUrl = `https://cdn.muapi.ai/${fields.key}`;
      const kind = file.type?.startsWith('video/')
        ? 'video'
        : file.type?.startsWith('audio/')
          ? 'audio'
          : 'image';
      const registered = await this._api('POST', `${API}/sessions/${activeSessionId}/assets`, {
        body: { url: uploadedUrl, kind, source_tool: 'upload' },
      });
      const att = { asset_label: registered.asset_label, url: uploadedUrl, kind };
      this.attachments = [...this.attachments, att];
      this.assets = [
        ...this.assets,
        {
          asset_label: registered.asset_label,
          url: uploadedUrl,
          kind,
          source_tool: 'upload',
          model: null,
          prompt: null,
        },
      ];
      toast.success(`Uploaded as ${registered.asset_label}`);
    } catch (err) {
      console.error('Upload failed', err);
      toast.error('Upload failed');
    } finally {
      this.uploading = false;
      this.uploadProgress = 0;
      if (this._fileInput) this._fileInput.value = '';
    }
  };

  handleFileUpload = (e) => {
    this.processFile(e.target.files?.[0]);
  };

  handleDragOver = (e) => {
    e.preventDefault();
    if (this.busy || this.uploading) return;
    this.isDragging = true;
  };

  handleDragLeave = (e) => {
    e.preventDefault();
    this.isDragging = false;
  };

  handleDrop = (e) => {
    e.preventDefault();
    this.isDragging = false;
    if (this.busy || this.uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) this.processFile(file);
  };

  removeAttachment = (label) => {
    this.attachments = this.attachments.filter((a) => a.asset_label !== label);
  };

  sendMessage = async (textOverride = null, skillOverride = null, attachmentsOverride = null) => {
    const typed = (typeof textOverride === 'string' ? textOverride : this.input).trim();
    const currentAttachments = attachmentsOverride || this.attachments;
    if ((!typed && currentAttachments.length === 0) || this.busy) return;
    const currentSkill = skillOverride || this.activeSkill;

    let activeSessionId;
    try {
      activeSessionId = await this.ensureSession();
    } catch (err) {
      toast.error('Failed to establish session');
      return;
    }

    const attachmentNote = currentAttachments.length
      ? '\n\n[Attached ' +
        currentAttachments.map((a) => `${a.asset_label} (${a.kind || 'image'})`).join(', ') +
        ']'
      : '';
    const msg = typed + attachmentNote;
    const msgAttachments = [...currentAttachments];

    if (!attachmentsOverride) this.attachments = [];
    this.input = '';
    if (this._textarea) this._textarea.style.height = '24px';

    const userMsg = {
      role: 'user',
      content: msg,
      attachments: msgAttachments,
      timestamp: new Date().toISOString(),
      skill_name: currentSkill?.name,
    };
    const updatedMessages = [...this.messages, userMsg];
    this.messages = [
      ...updatedMessages,
      { role: 'assistant', content: '', events: [], timestamp: new Date().toISOString() },
    ];
    this.busy = true;
    const aIdx = updatedMessages.length;

    try {
      let canvasState = null;
      try {
        canvasState = this._canvas?.getCanvasState?.() || null;
      } catch {}

      let endpoint = `${API}/sessions/${activeSessionId}/chat`;
      let payload = {
        message: typed,
        model: 'gpt-5-mini',
        messages_snapshot: updatedMessages,
        canvas_state: canvasState,
      };

      if (currentSkill) {
        endpoint = `${API}/sessions/${activeSessionId}/run-skill`;
        const primaryInputKey = currentSkill.inputs?.[0] || 'premise';
        payload = {
          skill_name: currentSkill.name,
          inputs: { [primaryInputKey]: typed },
          messages_snapshot: updatedMessages,
          model: 'gpt-5-mini',
        };
        if (!skillOverride) this.activeSkill = null;
      }

      const enqueueRes = await this._api('POST', endpoint, { body: payload });
      await this.resumePolling(enqueueRes.job_id, aIdx);
    } catch (err) {
      const arr = [...this.messages];
      if (aIdx >= 0) arr[aIdx] = { ...arr[aIdx], content: `❌ ${err.message || err}` };
      this.messages = arr;
    } finally {
      this.busy = false;
      this.loadAssets();
      if (activeSessionId) {
        const newMsgs = [...this.messages];
        this._api('PATCH', `${API}/sessions/${activeSessionId}/messages`, {
          body: { messages: newMsgs },
        }).catch(() => {});
        this.messages = newMsgs;
      }
    }
  };

  _syncAssetsToCanvas() {
    if (!this.sessionId || this.assets.length === 0) return;
    const newAssets = this.assets.filter((a) => {
      const syncKey = `${a.asset_label || 'no-label'}-${a.url}`;
      return !this._syncedUrls.has(syncKey);
    });
    if (newAssets.length === 0) return;

    const sync = () => {
      const c = this._canvas;
      if (!c) return false;
      newAssets.forEach((a) => {
        const syncKey = `${a.asset_label || 'no-label'}-${a.url}`;
        if (!a.url || this._syncedUrls.has(syncKey)) return;
        this._syncedUrls.add(syncKey);
        const kind =
          a.kind ||
          (a.url.match(/\.(mp4|webm|mov)$/i)
            ? 'video'
            : a.url.match(/\.(mp3|wav|ogg|m4a)$/i)
              ? 'audio'
              : 'image');
        const label = a.asset_label || null;
        if (kind === 'image')
          c.addImage(a.url, undefined, undefined, undefined, undefined, undefined, label);
        else if (kind === 'video')
          c.addVideo(a.url, undefined, undefined, undefined, undefined, undefined, label);
        else if (kind === 'audio') c.addAudio(a.url, undefined, undefined, undefined, label);
      });
      return true;
    };

    if (this._assetSyncTimer) clearInterval(this._assetSyncTimer);
    if (!sync()) {
      let attempts = 0;
      this._assetSyncTimer = setInterval(() => {
        attempts++;
        if (sync() || attempts > 20) clearInterval(this._assetSyncTimer);
      }, 500);
    }
  }

  renameSession = async (id = null, name = null) => {
    const targetId = id || this.sessionId;
    const targetName = name || this.newName;
    const currentName = id
      ? this.sessions.find((s) => s.id === id)?.name
      : this.currentSessionName;

    if (!targetId || !targetName.trim() || targetName.trim() === currentName) {
      this.isEditingName = false;
      this.editingSessionId = null;
      return;
    }
    try {
      await this._api('PATCH', `${API}/sessions/${targetId}`, {
        body: { name: targetName.trim() },
      });
      if (targetId === this.sessionId) this.currentSessionName = targetName.trim();
      this.isEditingName = false;
      this.editingSessionId = null;
      this.fetchSessions();
      toast.success('Session renamed');
    } catch {
      toast.error('Failed to rename session');
      this.isEditingName = false;
      this.editingSessionId = null;
    }
  };

  deleteSession = async (id) => {
    if (!window.confirm('Are you sure you want to delete this session?')) return;
    try {
      await this._api('DELETE', `${API}/sessions/${id}`);
      toast.success('Session deleted');
      if (this.inEmbedMode) {
        if (id === this.sessionId) this._setActiveEmbedSession(null);
      } else {
        this.fetchSessions();
        if (id === this.sessionId) {
          this.sessionId = null;
          this._nav('/canvas');
        }
      }
    } catch (err) {
      toast.error('Failed to delete session');
    }
  };

  // ─── Layout resize, mentions, clipboard ───────────────────────────────────

  handleMouseMove = (e) => {
    if (!this._isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 300 && newWidth < 800) {
      this.sidebarWidth = newWidth;
    }
  };

  stopResizing = () => {
    this._isResizing = false;
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.stopResizing);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  };

  startResizing = (e) => {
    this._isResizing = true;
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.stopResizing);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  selectMention = (item, type) => {
    const before = this.input.substring(0, this.mentionCursorPos);
    const after = this.input.substring(
      this._textarea ? this._textarea.selectionStart : this.input.length,
    );
    if (type === 'skill') {
      this.activeSkill = item;
      this.input = before + after;
    } else {
      const insertion = `@${item.asset_label}`;
      this.input = before + insertion + after;
    }
    this.showMentionPopup = false;
    setTimeout(() => this._textarea?.focus(), 10);
  };

  copyToClipboard = async (text) => {
    if (!text) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          toast.success('Copied to clipboard');
        } catch (err) {
          toast.error('Failed to copy');
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  };

  // ─── Markdown (replaces react-markdown markdownComponents) ────────────────

  _postProcessMarkdown() {
    const root = this.renderRoot;
    if (!root) return;
    root.querySelectorAll('[data-md]').forEach((block) => {
      const key = block.getAttribute('data-mdc') || '';
      // Skip when lit did not re-render this block's markdown content — the
      // container element persists across renders, so we key on the content
      // to avoid double-applying (or skipping) the conversion pass.
      if (this._mdKeys.get(block) === key) return;
      this._mdKeys.set(block, key);

      block.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href') || '';
        const isMedia = href.match(/\.(jpeg|jpg|gif|png|webp|avif)$/i);
        const isVideo = href.match(/\.(mp4|webm|mov)$/i);
        if (isMedia) {
          const span = document.createElement('span');
          span.className = 'block mt-2 mb-1';
          const link = document.createElement('a');
          link.href = href;
          link.target = '_blank';
          link.rel = 'noreferrer';
          link.className =
            'block relative group overflow-hidden rounded border border-divider shadow-sm';
          const img = document.createElement('img');
          img.src = href;
          img.alt = 'Generated Asset';
          img.className = 'w-full h-auto object-cover transition-transform group-hover:scale-105';
          const overlay = document.createElement('span');
          overlay.className = 'absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors';
          link.append(img, overlay);
          span.append(link);
          a.replaceWith(span);
        } else if (isVideo) {
          const span = document.createElement('span');
          span.className = 'block mt-2 mb-1';
          const video = document.createElement('video');
          video.src = href;
          video.controls = true;
          video.className = 'w-full rounded border border-divider shadow-sm';
          span.append(video);
          a.replaceWith(span);
        } else {
          a.className = 'text-primary hover:underline underline-offset-4 font-bold';
          a.target = '_blank';
          a.rel = 'noreferrer';
        }
      });

      // p -> <div class="mb-2 last:mb-0"> (markdownComponents.p)
      block.querySelectorAll('p').forEach((p) => {
        const d = document.createElement('div');
        d.className = 'mb-2 last:mb-0';
        d.innerHTML = p.innerHTML;
        p.replaceWith(d);
      });

      // pre/code -> markdownComponents.pre/code (Prism + showLineNumbers)
      block.querySelectorAll('pre > code').forEach((code) => {
        const pre = code.parentElement;
        const match = /language-(\w+)/.exec(code.className || '');
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const text = (code.textContent || '').replace(/\n$/, '');
        if (!match) {
          pre.className = 'my-3 overflow-x-auto rounded border border-divider p-3 text-[12px]';
          return;
        }
        let highlighted;
        try {
          highlighted = hljs.highlight(text, { language: match[1] }).value;
        } catch {
          highlighted = esc(text);
        }
        const lines = highlighted.split('\n');
        pre.className = 'my-3 overflow-x-auto rounded border border-divider';
        pre.innerHTML =
          `<div class="scrollbar-subtle !m-0 !p-3 text-[12px] sh-code" style="background:#263238;color:#eeffff;">` +
          `<div class="sh-linenos">${lines
            .map((_, i) => `<span class="sh-ln">${i + 1}</span>`)
            .join('')}</div>` +
          `<pre class="sh-pre"><code class="hljs ${esc(code.className)}">` +
          lines.map((l) => `<span class="sh-line">${l}</span>`).join('') +
          `</code></pre></div>`;
      });

      // Inline code styling
      block.querySelectorAll('code').forEach((code) => {
        if (code.closest('pre')) return;
        code.className = 'bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[12px] font-mono';
      });
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  _icon(name, size, cls) {
    return unsafeHTML(iconSvg(name, { size, className: cls }));
  }

  _sessionsSidebar() {
    return html`<div
      class="flex-shrink-0 flex flex-col bg-bg-card border-r border-divider shadow-[4px_0_12px_rgba(0,0,0,0.05)] z-20 transition-all duration-300 ${this.showLeftSidebar || this.inEmbedMode ? 'overflow-hidden w-0' : 'w-64'}"
    >
      <div
        class="p-3 border-b border-divider flex items-center justify-between bg-bg-card/50"
      >
        <div class="flex items-center gap-2 overflow-hidden">
          <a
            href="/"
            class="p-2 hover:bg-bg-page rounded text-secondary-text hover:text-primary transition-colors"
            title="Go Back"
            ><span>${this._icon('FiArrowLeft', 16)}</span></a
          >
          <a
            href="/"
            class="flex items-center flex-shrink-0 transition-transform duration-300 hover:scale-[1.02] active:scale-95"
            aria-label="Home"
          >
            <span class="font-bold text-lg">Design Agent Studio</span>
          </a>
        </div>
        <button
          @click=${() => (this.showLeftSidebar = !this.showLeftSidebar)}
          class="p-1.5 rounded transition-colors ${this.showLeftSidebar ? 'bg-primary/10 text-primary' : 'hover:bg-bg-card text-secondary-text hover:text-primary'}"
          title="Toggle Sessions"
        >
          ${this._icon('VscLayoutSidebarLeftOff', 16)}
        </button>
      </div>
      <div class="flex-1 overflow-y-auto scrollbar-subtle">
        ${this.sessions.length === 0
          ? html`<div
              class="px-4 py-8 text-center text-secondary-text italic text-[11px]"
              >No previous sessions</div
            >`
          : this.sessions.map(
              (s) => html`<div
                    class="relative w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-all border-l-2 group ${
                      this.sessionId === s.id
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent hover:bg-bg-card-hover'
                    }"
                    @mouseenter=${() => (this.hoveredSessionId = s.id)}
                    @mouseleave=${() => (this.hoveredSessionId = null)}
                    @click=${() => {
                      this.sessionId = s.id;
                      this._nav(`?session=${s.id}`);
                      this.showLeftSidebar = !this.showLeftSidebar;
                      this._onSessionChange();
                    }}
                  >
                    <div class="flex-1 min-w-0 pr-12">
                      ${this.editingSessionId === s.id
                        ? html`<input
                            class="bg-bg-card border border-primary px-2 py-1 rounded text-xs focus:outline-none w-full"
                            .autofocus=${true}
                            .value=${this.editingSessionName}
                            @input=${(e) => (this.editingSessionName = e.target.value)}
                            @blur=${() => this.renameSession(s.id, this.editingSessionName)}
                            @keydown=${(e) => {
                              if (e.key === 'Enter')
                                this.renameSession(s.id, this.editingSessionName);
                              if (e.key === 'Escape') this.editingSessionId = null;
                            }}
                            @click=${(e) => e.stopPropagation()}
                          />`
                        : html`<div
                            class="flex items-center gap-2 text-[13px] font-semibold transition-colors ${
                              this.sessionId === s.id
                                ? 'text-primary'
                                : 'text-primary-text'
                            }"
                          >
                            <span class="truncate flex-1">${s.name}</span>
                            <span
                              class="flex items-center gap-1 text-[10px] text-secondary-text opacity-70"
                              >${this._icon('FiImage', 10)} ${s.asset_count}</span
                            >
                          </div>`}
                    </div>

                    ${this.hoveredSessionId === s.id && this.editingSessionId !== s.id
                      ? html`<div
                          class="flex items-center gap-0.5 animate-fade-in absolute right-2 top-1/2 -translate-y-1/2 bg-bg-card/90 backdrop-blur-sm pl-2 py-1 rounded-l shadow-[-12px_0_12px_rgba(0,0,0,0.1)]"
                        >
                          <button
                            @click=${(e) => {
                              e.stopPropagation();
                              this.editingSessionId = s.id;
                              this.editingSessionName = s.name;
                            }}
                            class="p-1.5 hover:bg-bg-page rounded text-secondary-text hover:text-primary transition-colors"
                            title="Rename"
                          >
                            ${this._icon('FiEdit2', 13)}
                          </button>
                          <button
                            @click=${(e) => {
                              e.stopPropagation();
                              this.deleteSession(s.id);
                            }}
                            class="p-1.5 hover:bg-red-500/10 rounded text-secondary-text hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            ${this._icon('HiOutlineTrash', 14)}
                          </button>
                        </div>`
                      : nothing}
                  </div>`,
            )}
      </div>
      <div class="p-3 border-t border-divider bg-bg-page/30">
        <div
          class="flex items-center justify-between text-[10px] text-secondary-text font-medium px-1"
        >
          <span>Total Sessions</span>
          <span>${this.sessions.length}</span>
        </div>
      </div>
    </div>`;
  }

  _topBar() {
    const user = this.userData;
    const balanceLabel = this.userBalanceLabel ?? `$ ${user?.balance || '0.00'}`;
    return html`<div
        class="flex justify-between items-center z-10 p-2 border-b border-divider bg-bg-page"
      >
        <div class="relative flex items-center gap-1">
          ${!this.inEmbedMode
            ? html`<button
                @click=${() => (this.showLeftSidebar = !this.showLeftSidebar)}
                class="p-2 hover:bg-bg-card rounded transition-colors ${this.showLeftSidebar ? 'text-primary' : 'hidden'}"
                title="Toggle Sessions"
              >
                ${this._icon('VscLayoutSidebarLeftOff', 18)}
              </button>`
            : nothing}
          ${!this.inEmbedMode
            ? html`<a
                href="/"
                class="p-1.5 hover:bg-bg-card rounded text-secondary-text hover:text-primary transition-colors ${!this.showLeftSidebar && 'hidden'}"
                title="Go Back"
              >
                ${this._icon('FiArrowLeft', 16)}
              </a>`
            : nothing}
          ${this.inEmbedMode
            ? html`<button
                @click=${() => this._setActiveEmbedSession(null)}
                class="p-1.5 hover:bg-bg-card rounded text-secondary-text hover:text-primary transition-colors"
                title="New chat"
              >
                ${this._icon('FiPlus', 16)}
              </button>`
            : nothing}

          <div class="flex items-center gap-2 text-primary-text p-1.5">
            <span class="font-medium text-sm max-w-[200px] truncate"
              >${this.currentSessionName}</span
            >
          </div>
        </div>

        <div class="flex items-center gap-2">
          ${!this.inEmbedMode
            ? html`<div
                class="flex items-center gap-2 h-8 border border-divider rounded bg-bg-page/30 overflow-hidden px-2"
              >
                <span
                  class="font-bold text-xs flex items-center text-primary-text truncate"
                  >${balanceLabel}</span
                >
              </div>`
            : nothing}

          <div
            class="relative outline-none flex items-center gap-2 ${this.inEmbedMode ? 'hidden' : ''}"
            tabindex="-1"
            @focusout=${(e) => {
              if (
                e.currentTarget &&
                e.relatedTarget &&
                !e.currentTarget.contains(e.relatedTarget)
              ) {
                this.openProfile = false;
              }
            }}
          >
            <button
              @click=${() => (this.openProfile = !this.openProfile)}
              class="w-8 h-8 rounded-full bg-primary/10 border border-primary flex items-center justify-center text-primary shadow-sm hover:bg-primary/20 transition-all overflow-hidden"
            >
              ${user?.profile_photo
                ? html`<img
                    src=${user.profile_photo}
                    alt="Profile"
                    class="w-full h-full object-cover" />`
                : html`<span class="text-[10px] font-bold"
                    >${(user?.username || 'U').substring(0, 2).toUpperCase()}</span
                  >`}
            </button>
            ${!this.showChat
              ? html`<button
                  @click=${() => this.handleToggleSidebar()}
                  class="w-8 h-8 rounded-full rotate-270 hover:bg-bg-page hover:text-primary-text transition-all flex items-center justify-center text-secondary-text z-[60]"
                  title="Open Chat"
                >
                  ${this._icon('HiOutlineArrowUpTray', 18)}
                </button>`
              : nothing}

            <div
              class="absolute top-full right-0 mt-2 w-64 bg-bg-card border border-divider rounded shadow-2xl z-[100] py-1 transition-all duration-200 origin-top-right ${
                this.openProfile
                  ? 'opacity-100 scale-100 visible translate-y-0'
                  : 'opacity-0 scale-95 invisible translate-y-2'
              }"
            >
              <div class="px-4 py-3 border-b border-divider flex flex-col">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm font-bold text-primary-text truncate"
                    >${user?.username || 'User'}</span
                  >
                  ${user?.plan === 'pro'
                    ? html`<span
                        class="text-[10px] font-bold px-2 py-0.5 rounded bg-primary text-white uppercase tracking-wider"
                        >Pro</span
                      >`
                    : html`<span
                        class="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/10 text-orange-500 border border-orange-500 uppercase tracking-wider"
                        >Bronze</span
                      >`}
                </div>
                <span class="text-[11px] text-secondary-text truncate"
                  >${user?.email}</span
                >
                <div class="mt-2 text-[13px] font-bold text-primary">
                  ${balanceLabel}
                  <span class="font-normal text-secondary-text">available</span>
                </div>
              </div>

              <div class="py-1">
                <a
                  href="mailto:support@vadoo.tv"
                  class="w-full flex items-center gap-3 px-4 py-2 hover:bg-bg-page transition-colors text-[13px] font-semibold text-primary-text"
                  >Support</a
                >
              </div>
              <div class="h-px bg-divider w-full my-1"></div>
              <div class="py-1">
                <button
                  @click=${(e) => {
                    e.stopPropagation();
                    // no-op: next-themes setTheme is a no-op default in the
                    // shell (no ThemeProvider) — identical to the React build.
                  }}
                  class="w-full flex items-center justify-between px-4 py-2 hover:bg-bg-page transition-colors text-[13px] font-semibold text-primary-text"
                >
                  <div class="flex items-center gap-3">
                    <span class="text-secondary-text"
                      >${this.forcedTheme === 'dark'
                        ? this._icon('FiSun', 15)
                        : this._icon('FiMoon', 15)}</span
                    >
                    Dark Mode
                  </div>
                  <div
                    class="w-8 h-4 rounded-full relative transition-colors ${this.forcedTheme === 'dark' ? 'bg-primary' : 'bg-bg-card-hover'}"
                  >
                    <div
                      class="absolute top-0.5 w-3 h-3 rounded-full bg-black dark:bg-white transition-all ${
                        this.forcedTheme === 'dark' ? 'left-4.5' : 'left-0.5'
                      }"
                    ></div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  _canvasView() {
    return html`<div class="flex-1 relative overflow-hidden bg-bg-page/50 w-full">
        <design-canvas-area .activeTasks=${this.activeTasks}></design-canvas-area>

        <div
          class="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-bg-card border border-divider shadow-2xl px-2 py-1.5 rounded z-20"
        >
          <div class="flex items-center gap-3 px-3">
            <span
              class="text-[10px] font-bold text-secondary-text uppercase tracking-widest"
              >${this.zoomLevel}%</span
            >
            <div class="flex items-center gap-1">
              <button
                @click=${() => this._canvas?.zoomOut()}
                class="w-5 h-5 rounded border border-divider flex items-center justify-center text-secondary-text hover:text-primary-text hover:border-primary transition-all"
                >-</button
              >
              <button
                @click=${() => this._canvas?.zoomIn()}
                class="w-5 h-5 rounded border border-divider flex items-center justify-center text-secondary-text hover:text-primary-text hover:border-primary transition-all"
                >+</button
              >
            </div>
          </div>
        </div>
      </div>`;
  }

  _resizer() {
    return html`<div
        class="h-full cursor-col-resize hover:bg-primary w-1 transition-all z-10 group relative flex items-center justify-center"
        @mousedown=${this.startResizing}
      >
        <div
          class="z-10 w-3 h-8 rounded-full bg-bg-card border border-divider shadow-sm flex flex-col items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity translate-x-[-0.5px]"
        >
          <div class="w-0.5 h-0.5 rounded-full bg-primary-text"></div>
          <div class="w-0.5 h-0.5 rounded-full bg-primary-text"></div>
          <div class="w-0.5 h-0.5 rounded-full bg-primary-text"></div>
        </div>
      </div>`;
  }

  _chatHeader() {
    return html`<div
        class="p-4 flex items-center justify-between border-b border-divider bg-bg-card"
      >
        <div class="flex flex-col">
          <h2
            class="font-bold text-[13px] text-primary-text uppercase tracking-widest leading-none flex items-center gap-2"
          >
            <span class="text-primary">${this._icon('RiSparklingLine', 13)}</span>
            Creative Agent
          </h2>
          <span class="text-[10px] text-secondary-text mt-1.5"
            >Auto Model • Multi-tool Access</span
          >
        </div>
        <div class="flex items-center gap-1">
          <a
            href="https://muapi.ai/docs/design-agent-api"
            target="_blank"
            rel="noreferrer"
            class="p-1.5 hover:bg-bg-page hover:text-primary-text transition-colors rounded text-secondary-text"
            title="API Docs"
          >
            ${this._icon('CgTerminal', 16)}
          </a>
          ${this.sessionId
            ? html`<button
                @click=${() => {
                  if (this.inEmbedMode) this._setActiveEmbedSession(null);
                  else {
                    this.sessionId = null;
                    this._nav('/canvas');
                  }
                }}
                class="p-1.5 hover:bg-bg-page hover:text-primary-text transition-colors rounded text-secondary-text"
                title="New Session"
              >
                ${this._icon('FiPlus', 16)}
              </button>`
            : nothing}
          <button
            @click=${() => this.handleToggleSidebar()}
            class="w-8 h-8 rounded-full transition-all flex items-center justify-center shrink-0 ${this.showChat ? 'bg-primary/10 text-primary' : 'hover:bg-bg-page text-secondary-text hover:text-primary'}"
            title=${this.showChat ? 'Hide Chat' : 'Open Chat'}
          >
            ${this._icon('FiLayout', 16)}
          </button>
        </div>
      </div>`;
  }

  _typingDots() {
    return html`<div class="typing-dots py-1.5 px-1">
        <span></span><span></span><span></span>
      </div>`;
  }

  _eventPill(ev) {
    if (ev.type === 'tool_call') {
      return html`<div
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-primary/10 border border-primary text-primary text-[11px] mt-1 shadow-sm"
        >
          <span>${TOOL_ICONS[ev.name] || '🔧'}</span>
          <span class="font-semibold">${ev.name}</span>
        </div>`;
    }

    if (ev.type === 'tool_result') {
      const ok = ev.result?.ok !== false;
      const model = ev.result?.model;
      if (ev.name === 'ask_user' && ev.result?.ask_user) {
        const choices = ev.result.choices || [];
        return html`<div
            class="px-3 py-2 rounded bg-bg-page border border-primary text-[12px] mt-1 shadow-sm"
          >
            <div class="font-semibold text-primary mb-1">❓ ${ev.result.question}</div>
            ${choices.length > 0
              ? html`<div class="flex flex-col gap-1 mt-1">
                  ${choices.map(
                    (c, i) => html`<div class="text-secondary-text">${i + 1}. ${c}</div>`,
                  )}
                </div>`
              : nothing}
            <div class="text-[10px] text-secondary-text mt-1.5 italic">
              Reply to continue.
            </div>
          </div>`;
      }
      return html`<div
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] border mt-1 shadow-sm ${
            ok
              ? 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success)]'
              : 'bg-[var(--color-error-bg)] text-[var(--color-error)] border-[var(--color-error)]'
          }"
        >
          ${ok ? this._icon('FiCheck', 11) : this._icon('FiX', 11)}
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <span class="font-semibold"
              >${ok ? (ev.asset ? `Generated ${ev.asset.kind}` : `Done`) : `Failed`}</span
            >
            ${ok && model
              ? html`<span
                  class="text-[9px] font-bold uppercase tracking-tight opacity-80"
                  >${model}</span
                >`
              : nothing}
            ${!ok && ev.result?.error
              ? html`<span
                  class="text-[9px] opacity-70 truncate max-w-[160px]"
                  title=${ev.result.error}
                  >↺
                  ${String(ev.result.error).replace(/^\w+Error:\s*/i, '').substring(
                    0,
                    60,
                  )}</span
                >`
              : nothing}
          </div>
        </div>`;
    }

    if (ev.type === 'plan_propose') {
      if (ev.handled) return nothing;
      return html`<div class="flex flex-col gap-2">
          <design-plan .plan=${ev}></design-plan>
          <div class="flex items-center gap-2 px-2 pb-2">
            <button
              @click=${() => ev.onAction?.(ev.job_id, 'approve')}
              class="flex-1 py-2 rounded bg-primary text-white text-[12px] font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2"
            >
              ${this._icon('FiCheck', 16)} Approve & Execute
            </button>
            <button
              @click=${() => ev.onAction?.(ev.job_id, 'reject')}
              class="px-4 py-2 rounded bg-bg-card border border-divider text-secondary-text text-[12px] hover:bg-bg-page transition-all"
            >
              Cancel
            </button>
          </div>
        </div>`;
    }

    if (ev.type === 'info') {
      const isApproval =
        ev.needs_approval ||
        ev.content?.includes('Waiting for approval') ||
        ev.content?.includes('Awaiting confirmation');
      if (ev.handled && isApproval) return nothing;
      return html`<div
          class="px-3 py-2 rounded border text-[11px] mt-1 shadow-sm flex items-center justify-between ${
            isApproval ? 'bg-primary/5 border-primary' : 'bg-bg-page border-divider'
          }"
        >
          <div
            class="flex items-center gap-2 ${isApproval ? 'text-primary' : 'text-secondary-text'}"
          >
            ${isApproval
              ? this._icon('FiAlertCircle', 14, 'animate-pulse')
              : this._icon('FiTerminal', 12, 'opacity-50')}
            <span class="flex-1">${ev.content}</span>
          </div>
          ${isApproval && !ev.handled
            ? html`<div class="flex items-center gap-1 ml-4">
                <button
                  @click=${() => ev.onAction?.(ev.job_id, 'approve')}
                  class="px-2 py-1 rounded bg-primary text-white text-[10px] font-bold hover:brightness-110 transition-all"
                >
                  Approve
                </button>
                <button
                  @click=${() => ev.onAction?.(ev.job_id, 'reject')}
                  class="px-2 py-1 rounded bg-bg-card border border-divider text-secondary-text text-[10px] hover:bg-bg-page transition-all"
                >
                  Reject
                </button>
              </div>`
            : nothing}
        </div>`;
    }

    if (ev.type === 'error') {
      return html`<div
          class="px-2.5 py-1.5 rounded bg-[var(--color-error-bg)] text-[var(--color-error)] border border-[var(--color-error)] text-[11px] mt-1 shadow-sm"
        >
          ❌ ${ev.message}
        </div>`;
    }

    return nothing;
  }

  _chatMessages() {
    return html`<div class="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-subtle">
        ${this.messages.map(
          (msg, idx) => {
            if (!msg) return nothing;
            const prevMsg = idx > 0 ? this.messages[idx - 1] : null;
            const showDateHeader =
              msg.timestamp &&
              (!prevMsg ||
                !prevMsg.timestamp ||
                new Date(msg.timestamp).toDateString() !==
                  new Date(prevMsg.timestamp).toDateString());
            return html`
              ${showDateHeader && msg.timestamp
                ? html`<div class="flex justify-center my-4">
                    <span
                      class="px-2 py-1 bg-bg-page border border-divider rounded text-[10px] font-medium text-secondary-text shadow-sm"
                      >${formatDateHeader(msg.timestamp)}</span
                    >
                  </div>`
                : nothing}
              <div
                class="flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in-up group"
              >
                <div class="flex items-center gap-2">
                  ${msg.role === 'assistant'
                    ? html`<div
                        class="flex items-center gap-1.5 text-[10px] font-medium text-secondary-text ml-1"
                      >
                        ${this._icon('RiRobot2Line', 10)} Agent
                      </div>`
                    : nothing}
                  <div
                    class="flex items-center justify-end gap-2 text-[9px] text-secondary-text"
                  >
                    ${msg.timestamp
                      ? html`<span>${formatTime(msg.timestamp)}</span>`
                      : nothing}
                  </div>
                  ${msg.role === 'user' && msg.skill_name
                    ? html`<div
                        class="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary w-fit ml-auto"
                      >
                        ${this._icon('RiSparklingLine', 10)} ${msg.skill_name}
                      </div>`
                    : nothing}
                </div>
                <div
                  class="max-w-[90%] space-y-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}"
                >
                  <div class="relative">
                    <div
                      class="px-3 py-2 text-[13px] leading-relaxed break-words relative ${
                        msg.role === 'user'
                          ? 'bg-bg-card-hover text-primary-text rounded-md rounded-tr-none shadow-sm border border-divider'
                          : 'text-primary-text bg-bg-page rounded-md rounded-tl-none shadow-sm border border-divider'
                      }"
                    >
                      ${msg.content
                        ? msg.role === 'assistant'
                          ? html`<div
                              class="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/30"
                              data-md
                              data-mdc=${msg.content}
                              >${unsafeHTML(renderMarkdown(msg.content))}</div
                            >`
                          : html`<div class="flex flex-col gap-2">
                              <div
                                class="prose dark:prose-invert max-w-none text-primary-text prose-p:leading-relaxed"
                                data-md
                                data-mdc=${msg.content}
                                >${unsafeHTML(renderMarkdown(msg.content))}</div
                              >
                              ${msg.attachments && msg.attachments.length > 0
                                ? html`<div class="flex flex-col gap-2 mt-2 w-full">
                                    ${msg.attachments.map(
                                      (att) => html`<div
                                                                                    class="relative w-full rounded border border-white/20 overflow-hidden shadow-sm bg-black/10"
                                        >
                                          ${att.kind === 'image'
                                            ? html`<img
                                                src=${att.url}
                                                alt=${att.asset_label}
                                                class="w-full max-h-64 object-contain" />`
                                            : nothing}
                                          ${att.kind === 'video'
                                            ? html`<video
                                                src=${att.url}
                                                controls
                                                class="w-full max-h-64 object-contain"
                                              >`
                                            : nothing}
                                          ${att.kind === 'audio'
                                            ? html`<div class="p-2">
                                                <audio
                                                  src=${att.url}
                                                  controls
                                                  class="w-full"
                                                ></audio>
                                              </div>`
                                            : nothing}
                                          ${!['image', 'video', 'audio'].includes(att.kind)
                                            ? html`<div
                                                class="w-full p-4 flex items-center justify-center text-[10px] text-white/70"
                                              >
                                                ${att.kind}: ${att.asset_label}
                                              </div>`
                                            : nothing}
                                        </div>`,
                                    )}
                                  </div>`
                                : nothing}
                            </div>`
                        : (msg.role === 'assistant' && this.busy)
                          ? html`${this._typingDots()}`
                          : nothing}

                      ${(msg.events || [])
                        .filter(
                          (e) =>
                            e &&
                            ['tool_call', 'tool_result', 'plan_propose', 'error', 'info'].includes(
                              e.type,
                            ),
                        )
                        .map(
                          (ev) =>
                            html`${this._eventPill({ ...ev, onAction: this.handleJobAction })}`,
                        )}
                    </div>

                    <button
                      @click=${() => this.copyToClipboard(msg.content)}
                      class="absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-bg-card border border-divider shadow-md hover:text-primary z-10 ${
                        msg.role === 'user' ? 'right-full mr-2' : 'left-full ml-2'
                      }"
                      title="Copy Message"
                    >
                      ${this._icon('FiCopy', 12)}
                    </button>
                  </div>
                </div>
              </div>`;
          },
        )}
        <div id="chat-end"></div>
      </div>`;
  }

  _chatInput() {
    const assets = this.assets;
    const input = this.input;
    const skills = this.skills;
    const filteredSkills = skills.filter((s) =>
      s.name.toLowerCase().includes(this.mentionQuery.toLowerCase()),
    );
    const filteredAssets = assets.filter((a) =>
      (a.asset_label || '').toLowerCase().includes(this.mentionQuery.toLowerCase()),
    );
    const disableSend =
      this.busy || (!input.trim() && this.attachments.length === 0);
    return html`<div class="p-2 bg-bg-card">
        <div
          @dragover=${this.handleDragOver}
          @dragleave=${this.handleDragLeave}
          @drop=${this.handleDrop}
          class="rounded border bg-bg-card shadow-sm flex flex-col transition-all relative ${
            this.isDragging
              ? 'border-dashed border-primary bg-primary/5 ring-4 ring-primary/10'
              : ''
          } ${
            this.busy
              ? 'border-primary ring-1 ring-primary/20'
              : 'border-divider focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary'
          }"
        >
          ${this.activeSkill
            ? html`<div class="flex items-center gap-2 p-1 animate-fade-in-up">
                <button
                  @click=${() => (this.activeSkill = null)}
                  class="flex items-center gap-1.5 px-2 py-1 rounded-full bg-bg-page border border-divider text-xs hover:bg-red-500 hover:text-white transition-colors"
                >
                  ${this._icon('FiX', 12)}
                  <span>${this.activeSkill.name}</span>
                </button>
              </div>`
            : nothing}
          ${this.isDragging
            ? html`<div
                class="absolute inset-0 z-50 flex items-center justify-center bg-primary/5 backdrop-blur-[1px] pointer-events-none rounded"
              >
                <div
                  class="bg-primary/10 p-4 rounded-full border-2 border-primary animate-pulse"
                >
                  ${this._icon('FiUpload', 32, 'text-primary')}
                </div>
              </div>`
            : nothing}
          ${this.showMentionPopup
            ? html`<div
                class="absolute bottom-full left-0 mb-2 flex items-end gap-3 z-50"
              >
                <div
                  class="w-72 bg-bg-card border border-divider rounded shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
                >
                  <div
                    class="p-2 border-b border-divider text-[10px] font-bold text-secondary-text uppercase tracking-widest bg-bg-page/50"
                  >
                    Mentions
                  </div>
                  <div class="max-h-60 overflow-y-auto scrollbar-subtle py-1">
                    ${filteredAssets.length > 0
                      ? html`<div
                          class="px-3 py-1.5 mt-1 text-[9px] font-bold text-green-500 uppercase opacity-60"
                          >Assets</div
                        >`
                      : nothing}
                    <div class="grid grid-cols-2 gap-2">
                      ${filteredAssets.map(
                        (asset) => html`<button
                                                        @click=${() => this.selectMention(asset, 'asset')}
                            class="w-full text-left px-3 py-2 hover:bg-bg-page transition-colors flex items-center gap-2 group rounded"
                          >
                            ${asset.kind === 'image'
                              ? html`<img
                                  src=${asset.url}
                                  class="w-7 h-7 rounded border border-divider object-cover shadow-sm" />`
                              : nothing}
                            ${asset.kind === 'video'
                              ? html`<video
                                  src=${asset.url}
                                  class="w-7 h-7 rounded border border-divider object-cover shadow-sm"
                                >`
                              : nothing}
                            ${asset.kind === 'audio'
                              ? html`<div
                                  class="w-7 h-7 rounded flex items-center justify-center bg-primary/5 text-primary text-[8px] font-bold uppercase tracking-tight"
                                  >Audio</div
                                >`
                              : nothing}
                            <div class="flex flex-col">
                              <span
                                class="text-xs font-medium text-primary-text"
                                >${asset.asset_label}</span
                              >
                              <span
                                class="text-[9px] text-secondary-text truncate max-w-[200px]"
                                >${asset.kind}</span
                              >
                            </div>
                          </button>`,
                      )}
                    </div>
                    ${filteredSkills.length > 0
                      ? html`<div
                          class="px-3 py-1.5 text-[9px] font-bold text-primary uppercase opacity-60"
                          >Skills</div
                        >`
                      : nothing}
                    ${filteredSkills.map(
                      (skill) => html`<button
                                                    @click=${() => this.selectMention(skill, 'skill')}
                          class="w-full text-left px-3 py-2 hover:bg-bg-page transition-colors flex items-center gap-2 group"
                        >
                          ${this._icon(
                            'RiSparklingLine',
                            12,
                            'text-primary opacity-50 group-hover:opacity-100',
                          )}
                          <span class="text-xs font-medium text-primary-text"
                            >${skill.name}</span
                          >
                        </button>`,
                    )}
                    ${filteredSkills.length === 0 && filteredAssets.length === 0
                      ? html`<div
                          class="px-4 py-8 text-center text-secondary-text text-xs italic opacity-50"
                          >No matches found</div
                        >`
                      : nothing}
                  </div>
                </div>
              </div>`
            : nothing}
          <textarea
            class="w-full bg-transparent px-3 py-3 text-[13px] resize-none focus:outline-none min-h-[50px] max-h-[120px] scrollbar-subtle"
            rows="1"
            .value=${input}
            ?disabled=${this.busy}
            placeholder=${this.activeSkill
              ? `Oh, Let us create ${this.activeSkill.name.toLowerCase()}s, start with your ${
                  (this.activeSkill.inputs?.[0] || 'idea').replace(/_/g, ' ')
                }?`
              : 'Start with an idea or mention assets using @...'}
            @input=${(e) => {
              const val = e.target.value;
              const pos = e.target.selectionStart;
              const lastAtPos = val.lastIndexOf('@', pos - 1);
              if (lastAtPos !== -1 && (lastAtPos === 0 || val[lastAtPos - 1] === ' ')) {
                const query = val.substring(lastAtPos + 1, pos);
                if (!query.includes(' ')) {
                  this.mentionQuery = query;
                  this.mentionCursorPos = lastAtPos;
                  this.showMentionPopup = true;
                } else {
                  this.showMentionPopup = false;
                }
              } else {
                this.showMentionPopup = false;
              }
              this.input = val;
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            @keydown=${this.handleKey}
          ></textarea>

          ${(this.uploading || this.attachments.length > 0 || input.includes('@'))
            ? html`<div
              class="flex flex-wrap gap-2 border-b px-3 border-divider bg-bg-page/20"
            >
              ${this.attachments.map(
                (att) => html`<div
                                        class="relative group flex items-center gap-2 px-2 py-1 bg-bg-card border border-divider rounded-lg shadow-sm cursor-help transition-all hover:border-primary"
                    @mouseenter=${() => (this.hoveredAsset = att)}
                    @mouseleave=${() => (this.hoveredAsset = null)}
                  >
                    <div class="w-5 h-5 rounded overflow-hidden">
                      ${att.kind === 'image'
                        ? html`<img
                            src=${att.url}
                            class="w-full h-full object-cover" />`
                        : this._icon('FiTerminal', 10)}
                    </div>
                    <span class="text-[10px] font-bold text-secondary-text"
                      >${att.asset_label}</span
                    >
                  </div>`,
              )}

              ${assets
                .filter(
                  (a) =>
                    input.includes(`@${a.asset_label}`) &&
                    !this.attachments.find((att) => att.asset_label === a.asset_label),
                )
                .map(
                  (a) => html`<div
                                            class="relative group flex items-center gap-2 px-2 py-1 bg-primary/5 border border-primary rounded-lg shadow-sm cursor-help transition-all hover:border-primary"
                      @mouseenter=${() => (this.hoveredAsset = a)}
                      @mouseleave=${() => (this.hoveredAsset = null)}
                    >
                      <div
                        class="w-5 h-5 rounded overflow-hidden bg-primary/10 flex items-center justify-center text-primary"
                      >
                        ${a.kind === 'image'
                          ? html`<img
                              src=${a.url}
                              class="w-full h-full object-cover" />`
                          : a.kind === 'video'
                            ? html`<video
                                src=${a.url}
                                class="w-full h-full object-cover"
                              >`
                            : a.kind === 'audio'
                              ? html`<audio
                                  src=${a.url}
                                  class="w-full h-full object-cover"
                                >`
                              : this._icon('RiSparklingLine', 10)}
                      </div>
                      <span class="text-[10px] font-bold text-primary"
                        >${a.asset_label}</span
                      >
                    </div>`,
                )}
              ${this.uploading
                ? html`<div
                    class="flex items-center gap-2 px-2 py-1 bg-bg-page border border-divider border-dashed rounded-lg"
                  >
                    <div
                      class="w-4 h-4 border-2 border-t-transparent border-primary rounded-full animate-spin"
                    ></div>
                    <span class="text-[10px] font-bold text-secondary-text"
                      >${this.uploadProgress}%</span
                    >
                  </div>`
                : nothing}
            </div>`
            : nothing}

          ${this.hoveredAsset
            ? html`<div
                class="absolute bottom-full left-4 w-72 aspect-square bg-bg-card border border-divider rounded-md shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] overflow-hidden z-[110] animate-in fade-in zoom-in-95 duration-200 pointer-events-none"
              >
                ${this.hoveredAsset.kind === 'image'
                  ? html`<img
                      src=${this.hoveredAsset.url}
                      class="w-full h-full object-cover" />`
                  : this.hoveredAsset.kind === 'video'
                    ? html`<video
                        src=${this.hoveredAsset.url}
                        autoplay
                        muted
                        loop
                        class="w-full h-full object-cover"
                      >`
                    : html`<div
                        class="w-full h-full flex flex-col items-center justify-center gap-3 bg-bg-page"
                      >
                        <div
                          class="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"
                        >
                          ${this._icon('FiTerminal', 32)}
                        </div>
                        <span
                          class="text-xs font-bold text-secondary-text uppercase tracking-widest"
                          >${this.hoveredAsset.kind} Preview</span
                        >
                      </div>`}
                <div
                  class="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/90 via-black/40 to-transparent"
                >
                  <div
                    class="text-sm font-bold text-white tracking-tight"
                    >${this.hoveredAsset.asset_label}</div
                  >
                  <div
                    class="text-[10px] text-white/70 mt-1 uppercase tracking-widest font-bold"
                  >
                    ${this.hoveredAsset.kind} • Creative Asset
                  </div>
                </div>
              </div>`
            : nothing}

          <div class="px-3 pb-2 flex items-center justify-between">
            <div class="flex items-center gap-1">
              <input
                type="file"
                class="hidden"
                accept="image/*,video/*,audio/*"
                @change=${this.handleFileUpload}
              />
              <button
                type="button"
                @click=${() => this._fileInput?.click()}
                ?disabled=${this.uploading}
                class="p-1.5 rounded hover:bg-bg-page text-secondary-text transition-all"
                title="Upload Image"
              >
                ${this._icon('FiUpload', 16)}
              </button>

              <div class="relative" tabindex="-1"
                @focusout=${(e) => {
                  if (
                    e.currentTarget &&
                    e.relatedTarget &&
                    !e.currentTarget.contains(e.relatedTarget)
                  ) {
                    this.showSkillsMenu = false;
                  }
                }}
              >
                <button
                  type="button"
                  @click=${() => (this.showSkillsMenu = !this.showSkillsMenu)}
                  class="p-1.5 rounded hover:bg-bg-page transition-all flex items-center gap-1.5 ${
                    this.showSkillsMenu
                      ? 'bg-bg-page text-primary shadow-inner'
                      : 'text-secondary-text'
                  }"
                  title="Agent Skills"
                >
                  ${this._icon('GoBook', 16)}
                </button>

                ${this.showSkillsMenu
                  ? html`<div
                      class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-[320px] bg-bg-card border border-divider rounded shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
                    >
                      <div
                        class="px-4 py-3 border-b border-divider flex items-center justify-between bg-bg-page/30"
                      >
                        <div>
                          <h3
                            class="text-[12px] font-bold text-primary-text uppercase tracking-tight"
                          >
                            Expert Skills
                          </h3>
                        </div>
                        <a
                          href="https://muapi.ai/docs/design-agent-api"
                          target="_blank"
                          rel="noreferrer"
                          class="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                        >
                          ${this._icon('CgTerminal', 10)}
                          API Docs
                        </a>
                      </div>
                      <div class="max-h-80 overflow-y-auto p-1.5 scrollbar-subtle">
                        ${skills.map(
                          (skill) => html`<button
                                                            @click=${() => {
                                this.activeSkill = skill;
                                this.showSkillsMenu = false;
                                this._textarea?.focus();
                              }}
                              class="w-full flex items-center gap-3 px-3 py-2.5 rounded hover:bg-bg-page transition-all text-left group ${
                                this.activeSkill?.name === skill.name
                                  ? 'bg-primary/5 border border-primary'
                                  : 'border border-transparent'
                              }"
                            >
                              <div
                                class="w-8 h-8 rounded flex items-center justify-center transition-colors shadow-sm ${
                                  this.activeSkill?.name === skill.name
                                    ? 'bg-primary text-white'
                                    : 'bg-bg-page text-primary border border-divider group-hover:bg-primary group-hover:text-white'
                                }"
                              >
                                ${this._icon('RiSparklingLine', 16)}
                              </div>
                              <div class="flex-1 min-w-0">
                                <div
                                  class="font-bold capitalize text-[12px] transition-colors ${
                                    this.activeSkill?.name === skill.name
                                      ? 'text-primary'
                                      : 'text-primary-text group-hover:text-primary'
                                  }"
                                >
                                  ${skill.name}
                                </div>
                                <div
                                  class="text-[10px] text-secondary-text mt-0.5 line-clamp-1 opacity-70 italic"
                                >
                                  ${skill.description || 'Specialized workflow'}
                                </div>
                              </div>
                            </button>`,
                        )}
                      </div>
                      <div
                        class="p-2.5 bg-bg-page/50 border-t border-divider text-center"
                      >
                        <button
                          @click=${() => (this.showSkillsMenu = false)}
                          class="text-[10px] font-bold text-secondary-text hover:text-primary-text transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>`
                  : nothing}
              </div>

              <div class="relative" tabindex="-1"
                @focusout=${(e) => {
                  if (
                    e.currentTarget &&
                    e.relatedTarget &&
                    !e.currentTarget.contains(e.relatedTarget)
                  ) {
                    this.showAssetsMenu = false;
                  }
                }}
              >
                <button
                  type="button"
                  @click=${() => (this.showAssetsMenu = !this.showAssetsMenu)}
                  class="p-1.5 rounded hover:bg-bg-page transition-all flex items-center gap-1.5 ${
                    this.showAssetsMenu
                      ? 'bg-bg-page text-primary shadow-inner'
                      : 'text-secondary-text'
                  }"
                  title="Session Assets"
                >
                  ${this._icon('FiImage', 16)}
                </button>

                ${this.showAssetsMenu
                  ? html`<div
                      class="absolute bottom-full right-0 mb-2 w-72 bg-bg-card border border-divider rounded shadow-2xl z-30 animate-fade-in-up"
                    >
                      <div
                        class="p-2 mb-2 border-b border-divider text-[10px] font-bold text-secondary-text flex items-center justify-between"
                      >
                        <span>Session Assets</span>
                        <span class="opacity-50">${assets.length} items</span>
                      </div>
                      <div
                        class="max-h-80 overflow-y-auto scrollbar-subtle p-2 grid grid-cols-3 gap-2"
                      >
                        ${assets.length === 0
                          ? html`<div
                              class="col-span-3 py-8 text-center text-secondary-text text-[10px] italic"
                              >No assets generated yet</div
                            >`
                          : assets.map(
                              (asset, i) => html`<div
                                                                    @click=${(e) => {
                                    e.stopPropagation();
                                    this.input =
                                      this.input +
                                      (this.input ? ' ' : '') +
                                      asset.asset_label;
                                    this.showAssetsMenu = false;
                                    this._textarea?.focus();
                                  }}
                                  class="group relative aspect-square rounded border border-divider overflow-hidden bg-bg-page/50 hover:border-primary transition-all cursor-pointer"
                                >
                                  ${asset.kind === 'image'
                                    ? html`<img
                                        src=${asset.url}
                                        class="w-full h-full object-cover" />`
                                    : nothing}
                                  ${asset.kind === 'video'
                                    ? html`<video
                                        src=${asset.url}
                                        class="w-full h-full object-cover"
                                      >`
                                    : nothing}
                                  ${asset.kind === 'audio'
                                    ? html`<div
                                        class="w-full h-full flex items-center justify-center bg-primary/5 text-primary text-[8px] font-bold uppercase tracking-tight"
                                        >Audio</div
                                      >`
                                    : nothing}

                                  <div
                                    class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-1 text-center"
                                  >
                                    <span
                                      class="text-[10px] text-white font-bold truncate w-full mb-1"
                                      >${asset.asset_label}</span
                                    >
                                  </div>
                                </div>`,
                            )}
                      </div>
                    </div>`
                  : nothing}
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button
                type="button"
                @click=${() => this.sendMessage()}
                ?disabled=${disableSend}
                class="w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm ml-1 ${
                  disableSend
                    ? 'bg-[var(--bg-card-hover)] text-[var(--text-muted)] cursor-not-allowed'
                    : 'bg-primary text-white hover:scale-105'
                }"
              >
                ${this.busy
                  ? this._icon('BiLoaderAlt', 14, 'animate-spin')
                  : this._icon('FiSend', 14)}
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }

  render() {
    return html`<div class="h-full w-full bg-black overflow-hidden design-agent-studio">
      ${this.mounted
        ? html`<div
            class="h-dvh w-full text-sm flex flex-col bg-bg-page text-primary-text overflow-hidden"
            style="font-family: 'Inter', sans-serif"
          >
            <main class="flex h-full w-full overflow-hidden">
              ${this._sessionsSidebar()}
              <div class="flex flex-col relative bg-bg-page flex-1 overflow-hidden">
                ${this._topBar()}
                ${this._canvasView()}
              </div>
              ${this._resizer()}
              <div
                class="flex-shrink-0 flex flex-col bg-bg-card border-l border-divider shadow-[-10px_0_20px_rgba(0,0,0,0.02)] z-20 transition-all duration-300 ${
                  !this.showChat ? 'overflow-hidden' : ''
                }"
                style="width: ${this.sidebarWidth}px"
              >
                ${this._chatHeader()}
                ${this._chatMessages()}
                ${this._chatInput()}
              </div>
            </main>
          </div>`
        : nothing}
    </div>`;
  }

  handleToggleSidebar() {
    if (this.showChat) {
      this.prevWidth = this.sidebarWidth;
      this.sidebarWidth = 0;
      this.showChat = false;
    } else {
      this.sidebarWidth = this.prevWidth || 350;
      this.showChat = true;
    }
  }
}

customElements.define('studio-design', StudioDesign);
