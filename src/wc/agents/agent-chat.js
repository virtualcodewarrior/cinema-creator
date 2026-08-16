import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { styleMap } from 'lit/directives/style-map.js';
import { BaseElement } from '../../lib/wc-base.js';
import { iconSvg } from '../../lib/icons.js';
import { navigate, back } from '../../lib/router.js';
import { apiFetch, xhrUpload } from '../../lib/agents-api.js';
import { renderMarkdown } from '../../lib/markdown.js';
import toast from '../../lib/toast.js';
import { themes } from './themes.js';

const icon = (name, size = 16, className = '') => unsafeHTML(iconSvg(name, { size, className }));

const BASE_URL = '/api/agents';

const formatMessageTime = (date) => {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(date));
};

const getDateHeader = (date) => {
  const d = new Date(date);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

const parseMessageContent = (text) => {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const url = match[0];

    if (start > lastIndex) {
      parts.push({ type: 'text', content: text.substring(lastIndex, start) });
    }

    const cleanUrl = url.split('?')[0].toLowerCase();
    const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(cleanUrl);
    const isVideo = /\.(mp4|webm|mov|ogg)$/i.test(cleanUrl);
    const isAudio = /\.(mp3|wav|mpeg)$/i.test(cleanUrl);

    if (isImage) parts.push({ type: 'image', url });
    else if (isVideo) parts.push({ type: 'video', url });
    else if (isAudio) parts.push({ type: 'audio', url });
    else parts.push({ type: 'text', content: url });

    lastIndex = end;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) });
  }

  return parts;
};

const hydrateHistory = (history, createdAt) =>
  (history || []).map((msg, i) => {
    let ts = msg.timestamp || createdAt || new Date();
    if (typeof ts === 'string' && ts.includes('T') && !ts.endsWith('Z') && !ts.includes('+')) {
      ts += 'Z';
    }
    return { ...msg, id: msg.id || `${msg.role}_${Date.now()}_${i}`, timestamp: ts };
  });

const CUSTOM_COLOR_ITEMS = [
  { label: 'Background', key: 'background' },
  { label: 'Text Primary', key: 'foreground' },
  { label: 'Text Secondary', key: 'muted' },
  { label: 'Border Color', key: 'border' },
  { label: 'Panel Background', key: 'componentBg' },
  { label: 'Header Background', key: 'headerBg' },
  { label: 'User Bubble', key: 'userBubble' },
  { label: 'User Text', key: 'userText' },
  { label: 'Agent Bubble', key: 'agentBubble' },
  { label: 'Agent Text', key: 'agentText' },
  { label: 'Input Background', key: 'inputBg' },
  { label: 'Accent Color', key: 'accent' },
  { label: 'Accent Text', key: 'accentText' },
];

// Port of the chat screen: app/agents/[agent_id]/page.jsx + AgentChatClient.jsx
// + AiAgent.jsx (ChatPage) from the ai-agent package. The react-markdown
// markdown rendering goes through lib/markdown.js (marked + DOMPurify, GFM);
// the axios interceptor is replaced by lib/agents-api.js (x-api-key from
// localStorage); next/navigation -> lib/router.js.
// Note: the React original called `toast.error` in handleDownloadFile without
// importing toast (latent ReferenceError on download failure) — wired to the
// real toast service here.
export class AgentChat extends BaseElement {
  static sheetKey = 'agents';

  static properties = {
    agentId: { state: true },
    conversationId: { state: true },
    agentDetails: { state: true },
    notFound: { state: true },
    messages: { state: true },
    input: { state: true },
    isStreaming: { state: true },
    error: { state: true },
    showDropdown: { state: true },
    showThemeDropdown: { state: true },
    selectedMedia: { state: true },
    downloadingUrl: { state: true },
    currentTheme: { state: true },
    attachments: { state: true },
    isUploading: { state: true },
    uploadProgress: { state: true },
    isDragging: { state: true },
    showCustomColorPanel: { state: true },
    liked: { state: true },
    likeCount: { state: true },
    copiedId: { state: true },
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
    this.agentId = '';
    this.conversationId = '';
    this.agentDetails = null;
    this.notFound = false;
    this.messages = [];
    this.input = '';
    this.isStreaming = !!this.conversationId && !!sessionStorage.getItem('pending_first_msg');
    this.error = null;
    this.showDropdown = false;
    this.showThemeDropdown = false;
    this.selectedMedia = null;
    this.downloadingUrl = null;
    this.currentTheme = themes.cosmic;
    this.attachments = [];
    this.isUploading = false;
    this.uploadProgress = 0;
    this.isDragging = false;
    this.showCustomColorPanel = false;
    this.liked = false;
    this.likeCount = 0;
    this.copiedId = null;
    this._conversationIdRef = null;
    this._assistantRef = { content: '', thoughts: '', status: [], suggestions: [] };
    this._copiedTimer = null;
  }

  get lowerAgentSlug() {
    return this.agentId ? this.agentId.toLowerCase() : null;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.agentId) this.loadAgent();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._copiedTimer) clearTimeout(this._copiedTimer);
  }

  firstUpdated() {
    this._autofitTextarea();
  }

  async loadAgent() {
    try {
      const { data } = await apiFetch(`/api/agents/${this.agentId}`);
      this.agentDetails = data;
      this.liked = !!data.has_liked;
      this.likeCount = data.like_count || 0;
      this.applyAgentTheme(data);
      if (this.conversationId && this.lowerAgentSlug) {
        this.fetchHistory();
      }
      // Runs even if fetchHistory returns early (pending first message).
      this.checkPendingMessage();
    } catch (err) {
      // The original page checked res.ok silently — console.error fired only
      // on network failures, so HTTP errors must not log either.
      if (err.status == null) console.error('Failed to load agent:', err);
      this.notFound = true;
    }
  }

  applyAgentTheme(data) {
    const themeData = data?.theme;
    if (typeof themeData === 'string' && themes[themeData]) {
      this.currentTheme = themes[themeData];
    } else if (themeData && typeof themeData === 'object' && themeData.colors) {
      this.currentTheme = themeData;
    } else {
      this.currentTheme = themes.cosmic;
    }
  }

  async fetchHistory() {
    if (this.messages.length > 0) {
      this._conversationIdRef = this.conversationId;
      return;
    }

    if (this.conversationId && this.lowerAgentSlug) {
      const pending = sessionStorage.getItem('pending_first_msg');
      if (pending) {
        try {
          const { convId } = JSON.parse(pending);
          if (convId === this.conversationId) return;
        } catch (e) {}
      }

      try {
        const { data } = await apiFetch(
          `${BASE_URL}/by-slug/${this.lowerAgentSlug}/${this.conversationId}`,
        );
        if (data && data.history) {
          const hydrated = hydrateHistory(data.history, data.created_at);
          if (hydrated.length > 0) this.messages = hydrated;
          this._conversationIdRef = this.conversationId;
        }
      } catch (err) {
        console.error('Failed to fetch conversation history:', err);
      }
    }
  }

  checkPendingMessage() {
    if (!this.conversationId) return;
    const pending = sessionStorage.getItem('pending_first_msg');
    if (pending) {
      try {
        const { convId, text, attachments: pendingAttachments } = JSON.parse(pending);
        if (convId === this.conversationId) {
          sessionStorage.removeItem('pending_first_msg');
          setTimeout(() => {
            this.handleSendMessage(null, text, pendingAttachments);
          }, 100);
        }
      } catch (e) {
        console.error('Failed to parse pending message', e);
      }
    }
  }

  _autofitTextarea() {
    const ta = this.renderRoot.querySelector('textarea');
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }

  updated(changed) {
    if (changed.has('input')) this._autofitTextarea();
    if (changed.has('messages')) {
      // Smooth-scroll after layout settles.
      requestAnimationFrame(() => this._scrollToBottom());
    }
  }

  _scrollToBottom() {
    const scroller = this.renderRoot.querySelector('.flex-1.overflow-y-auto.px-4');
    if (scroller)
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior: 'smooth',
        });
  }

  copyText(text, id) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.copiedId = id;
        if (this._copiedTimer) clearTimeout(this._copiedTimer);
        this._copiedTimer = setTimeout(() => (this.copiedId = null), 2000);
      })
      .catch((err) => console.error('Failed to copy text: ', err));
  }

  copyButton(text, id) {
    return html`
      <button
        @click=${() => this.copyText(text, id)}
        class="p-1.5 rounded-lg border transition-all group relative border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--component-hover)]"
        title="Copy to clipboard"
        type="button"
      >
        ${this.copiedId === id
          ? icon('MdCheck', 14, 'w-3.5 h-3.5 text-green-400')
          : icon('MdContentCopy', 14, 'w-3.5 h-3.5')}
        <span
          class="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded pointer-events-none transition-opacity duration-200 ${
            this.copiedId === id ? 'opacity-100' : 'opacity-0'
          }"
        >
          Copied!
        </span>
      </button>
    `;
  }

  handleCustomColorChange(part, color) {
    this.currentTheme = {
      ...this.currentTheme,
      id: 'custom',
      name: 'Custom Theme',
      colors: { ...this.currentTheme.colors, [part]: color },
    };
  }

  async handleThemeSync(theme) {
    try {
      await apiFetch(`${BASE_URL}/by-slug/${this.lowerAgentSlug}`, {
        method: 'PUT',
        body: { theme },
      });
    } catch (err) {
      console.error('Failed to save theme:', err);
    }
    this.showCustomColorPanel = false;
  }

  generateCssVariables(theme) {
    const c = theme?.colors || themes.cosmic.colors;
    return {
      '--bg-primary': c.background,
      '--text-primary': c.foreground,
      '--text-secondary': c.muted,
      '--border-color': c.border,
      '--component-bg': c.componentBg,
      '--component-hover': c.componentHover,
      '--header-bg': c.headerBg,
      '--user-bubble': c.userBubble,
      '--user-text': c.userText,
      '--agent-bubble': c.agentBubble,
      '--agent-text': c.agentText,
      '--input-bg': c.inputBg,
      '--accent': c.accent,
      '--accent-text': c.accentText,
      '--font-family': "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    };
  }

  async handleDownloadFile(file_url, filename = 'download') {
    if (!file_url) {
      toast.error('File URL not found');
      return;
    }

    this.downloadingUrl = file_url;
    try {
      const { data } = await apiFetch('/api/workflow/cloudfront-signed-url', {
        method: 'POST',
        body: { url: file_url },
      });

      const signed_url = data.signed_url;
      const fetchResponse = await fetch(signed_url, { mode: 'cors' });
      const blob = await fetchResponse.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      toast.error(`Download failed: ${err.message}`);
    } finally {
      this.downloadingUrl = null;
    }
  }

  async uploadFile(file) {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      this.error = 'File size too large (max 10MB)';
      return;
    }

    try {
      this.uploadProgress = 0;
      this.isUploading = true;

      const { data } = await apiFetch(`/api/app/get_file_upload_url?filename=${encodeURIComponent(file.name)}`);
      const { url, fields } = data;

      const formData = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append('file', file);

      await xhrUpload(url, formData, (p) => (this.uploadProgress = p));
      const uploadedUrl = `https://cdn.muapi.ai/${fields.key}`;
      this.attachments = [...this.attachments, uploadedUrl];
    } catch (err) {
      console.error('Upload failed', err);
      this.error = 'Failed to upload image.';
    } finally {
      this.isUploading = false;
      this.uploadProgress = 0;
      const fi = this.renderRoot.querySelector('input[type=file]');
      if (fi) fi.value = '';
    }
  }

  handleFileUpload(e) {
    this.uploadFile(e.target.files?.[0]);
  }

  handleDragOver(e) {
    e.preventDefault();
    this.isDragging = true;
  }

  handleDragLeave(e) {
    e.preventDefault();
    this.isDragging = false;
  }

  handleDrop(e) {
    e.preventDefault();
    this.isDragging = false;

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      this.uploadFile(file);
    } else if (file) {
      this.error = 'Please only upload image files.';
    }
  }

  removeAttachment(url) {
    this.attachments = this.attachments.filter((item) => item !== url);
  }

  async handleThemeChange(theme) {
    this.currentTheme = theme;
    this.handleThemeSync(theme);
  }

  async handleLike() {
    const newLiked = !this.liked;
    const prevLikeCount = this.likeCount;

    this.liked = newLiked;
    this.likeCount = newLiked ? this.likeCount + 1 : this.likeCount - 1;

    try {
      const { data } = await apiFetch(
        `${BASE_URL}/by-slug/${this.lowerAgentSlug}/like?is_like=${newLiked}`,
        { method: 'POST' },
      );
      this.liked = data.has_liked;
      this.likeCount = data.like_count;
    } catch (err) {
      console.error('Failed to sync like:', err);
      this.liked = !newLiked;
      this.likeCount = prevLikeCount;
    }
  }

  handleNewChat() {
    if (this.lowerAgentSlug) {
      navigate(`/agents/${this.lowerAgentSlug}`);
    }
  }

  async handleSendMessage(e, overrideText = null, overrideAttachments = null) {
    if (e) e.preventDefault();

    const userText = overrideText || this.input;
    const currentAttachments = overrideAttachments || (overrideText ? [] : this.attachments);

    if (!userText.trim()) return;
    if (this.isStreaming && !overrideText) return;

    if (overrideText) this.isStreaming = false;

    const userMessage = {
      role: 'user',
      content: userText,
      attachments: [...currentAttachments],
      timestamp: new Date(),
    };
    this.messages = [...this.messages, userMessage];

    if (!overrideText) {
      this.attachments = [];
      this.input = '';
    }

    this.isStreaming = true;
    this.error = null;

    const assistantMsgId = `asst_${Date.now()}`;
    this._assistantRef = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      thoughts: '',
      status: [],
      suggestions: [],
      timestamp: new Date(),
    };

    this.messages = [...this.messages, { ...this._assistantRef }];

    try {
      let currentConvId = this._conversationIdRef || this.conversationId;

      if (!currentConvId && !overrideText) {
        const newConvId = crypto.randomUUID();
        this._conversationIdRef = newConvId;

        sessionStorage.setItem(
          'pending_first_msg',
          JSON.stringify({
            convId: newConvId,
            text: userText,
            attachments: currentAttachments,
            timestamp: new Date().toISOString(),
          }),
        );

        if (this.lowerAgentSlug) {
          navigate(`/agents/${this.lowerAgentSlug}/${newConvId}`, { replace: true });
        }

        return;
      }

      const { data: initialRes } = await apiFetch(`${BASE_URL}/by-slug/${this.lowerAgentSlug}/chat`, {
        method: 'POST',
        body: {
          message: userText,
          stream: false,
          conversation_id: currentConvId,
          attachments: userMessage.attachments,
        },
      });

      const { request_id } = initialRes;
      if (!request_id) throw new Error('No Request ID returned from agent');

      const pollInterval = 1000;
      let isComplete = false;
      let errors = 0;

      while (!isComplete && errors < 5) {
        try {
          const { data } = await apiFetch(`/api/api/v1/predictions/${request_id}/result`);

          if (data.conversation_id) this._conversationIdRef = data.conversation_id;

          const incomingMessages = data.messages || [];

          let newContent = '';
          let newThoughts = '';
          let newStatus = [];

          incomingMessages.forEach((msg) => {
            if (msg.role === 'assistant' && msg.content) newContent = msg.content;
            if (msg.type === 'pulse' && msg.content) newStatus.push(msg.content);
            if (msg.role === 'assistant' && msg.thoughts) newThoughts = msg.thoughts;
          });

          this._assistantRef.content = newContent;
          this._assistantRef.thoughts = newThoughts;
          this._assistantRef.status = newStatus;
          this._assistantRef.suggestions = data.suggestions || [];

          this.messages = this.messages.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: newContent,
                  thoughts: newThoughts,
                  status: newStatus,
                  suggestions: data.suggestions || [],
                }
              : m,
          );

          if (data.status === 'failed') {
            throw new Error(data.error || 'Agent execution failed');
          }

          if (data.status === 'completed' || data.status === 'succeeded' || data.is_complete) {
            isComplete = true;
          } else {
            await new Promise((r) => setTimeout(r, pollInterval));
          }
        } catch (pollErr) {
          console.error('Polling error', pollErr);
          errors++;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (errors >= 5) throw new Error('Lost connection to agent process');
    } catch (err) {
      console.log('Agent error:', err);
      const errorMessage =
        (err.data && (err.data.error || err.data.detail)) ||
        err.message ||
        'Something went wrong. Check browser console';
      this.error = errorMessage;
      if (!this._assistantRef.content) {
        this.messages = this.messages.filter((m) => m.id !== assistantMsgId);
      }
    } finally {
      this.isStreaming = false;
    }
  }

  renderMediaPart(part) {
    if (part.type === 'text') {
      // Sanitized by renderMarkdown (DOMPurify); unsafeHTML injects it.
      return html`<div>${unsafeHTML(renderMarkdown(part.content))}</div>`;
    }
    if (part.type === 'image') {
      return html`
        <div
          class="my-3 rounded-xl overflow-hidden border shadow-lg relative w-fit group/media bg-[var(--component-bg)] border-[var(--border-color)]"
        >
          <img
            src="${part.url}"
            alt="Generated Media"
            referrerPolicy="no-referrer"
            class="w-full h-auto max-h-[300px] object-contain transition-transform duration-500 group-hover/media:scale-[1.02]"
            loading="lazy"
          />
          <div
            class="absolute inset-0 bg-black/40 opacity-0 group-hover/media:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4"
          >
            <button
              @click=${() => (this.selectedMedia = { type: 'image', url: part.url })}
              type="button"
              class="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/20 transition-all hover:scale-110"
              title="View Full Screen"
            >
              ${icon('MdFullscreen', 24, 'w-6 h-6')}
            </button>
            <button
              @click=${() => this.handleDownloadFile(part.url, `image-${Date.now()}.png`)}
              type="button"
              class="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/20 transition-all hover:scale-110 disabled:opacity-50"
              title="Download"
              ?disabled=${this.downloadingUrl === part.url}
            >
              ${this.downloadingUrl === part.url
                ? icon('BiLoaderAlt', 24, 'w-6 h-6 animate-spin')
                : icon('MdFileDownload', 24, 'w-6 h-6')}
            </button>
          </div>
        </div>
      `;
    }
    if (part.type === 'video') {
      return html`
        <div
          class="my-3 rounded-xl overflow-hidden border shadow-lg relative w-fit group/media bg-[var(--component-bg)] border-[var(--border-color)]"
        >
          <video
            src="${part.url}"
            class="w-full h-auto max-h-[300px] transition-transform duration-500 group-hover/media:scale-[1.02]"
          ></video>
          <div
            class="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover/media:opacity-100 transition-opacity duration-300 z-10"
          >
            <button
              @click=${() => (this.selectedMedia = { type: 'video', url: part.url })}
              class="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 transition-all hover:scale-105"
              title="View Full Screen"
            >
              ${icon('MdFullscreen', 20, 'w-5 h-5')}
            </button>
            <button
              @click=${() => this.handleDownloadFile(part.url, `video-${Date.now()}.mp4`)}
              class="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 transition-all hover:scale-105 disabled:opacity-50"
              title="Download"
              ?disabled=${this.downloadingUrl === part.url}
            >
              ${this.downloadingUrl === part.url
                ? icon('BiLoaderAlt', 20, 'w-5 h-5 animate-spin')
                : icon('MdFileDownload', 20, 'w-5 h-5')}
            </button>
          </div>
        </div>
      `;
    }
    if (part.type === 'audio') {
      return html`
        <div
          class="my-3 flex items-center gap-3 p-3 rounded-xl border backdrop-blur-sm bg-[var(--component-bg)] border-[var(--border-color)]"
        >
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style="background: var(--component-hover); color: var(--accent)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="w-5 h-5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"
              ></path>
            </svg>
          </div>
          <audio src="${part.url}" controls class="w-full h-8"></audio>
        </div>
      `;
    }
    return nothing;
  }

  renderWelcome() {
    const d = this.agentDetails;
    const welcome =
      d.welcome_message || `Hello! I am ${d.name}. ${d.description || 'How can I assist you today?'}`;
    return html`
      <div class="space-y-6">
        <div class="flex justify-center">
          <div
            class="px-4 py-1.5 rounded-full border text-[10px] uppercase tracking-widest font-bold bg-[var(--component-bg)] border-[var(--border-color)] text-[var(--text-secondary)]"
          >
            Today
          </div>
        </div>
        <div class="flex flex-col items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div class="flex items-center gap-2 mb-1 ml-11">
            <div class="text-xs font-bold text-[var(--text-primary)]">${d.name}</div>
          </div>

          <div class="flex gap-3 items-end max-w-[85%] group/msg">
            ${d.icon_url
              ? html`
                  <img
                    src="${d.icon_url}"
                    alt="${d.name}"
                    referrerPolicy="no-referrer"
                    class="w-8 h-8 rounded-full object-cover border flex-shrink-0 border-[var(--border-color)] transition-all duration-500 ease-in-out"
                  />
                `
              : html`
                  <div
                    class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ease-in-out"
                    style="background: var(--accent); color: var(--accent-text)"
                  >
                    ${icon('RiRobot2Fill', 16, 'w-4 h-4')}
                  </div>
                `}
            <div class="flex-1 space-y-3">
              <div class="flex items-end gap-2">
                <div
                  class="backdrop-blur-sm rounded-2xl rounded-tl-md px-4 py-3 shadow-xl border inline-block"
                  style="background: var(--agent-bubble); color: var(--agent-text); border-color: var(--border-color)"
                >
                  <div class="prose prose-sm max-w-none" style="color: var(--agent-text)">
                    <p>${welcome}</p>
                  </div>
                </div>
                <div class="opacity-0 group-hover/msg:opacity-100 transition-opacity">
                  ${this.copyButton(welcome, 'welcome')}
                </div>
              </div>
              ${d.initial_suggestions?.length > 0
                ? html`
                    <div class="flex flex-wrap gap-2 pt-2">
                      ${d.initial_suggestions.map(
                        (sug, i) => html`
                          <button
                            type="button"
                            @click=${() => {
                              this.input = sug.prompt;
                              const ta = this.renderRoot.querySelector('textarea');
                              if (ta) ta.focus();
                            }}
                            class="flex items-center gap-2 text-xs font-medium border px-3 py-2 rounded-lg transition-all group hover:opacity-80"
                            style="background: var(--component-bg); border-color: var(--border-color); color: var(--text-primary)"
                          >
                            ${icon(
                              'HiLightBulb',
                              14,
                              'w-3.5 h-3.5 text-yellow-500 group-hover:scale-110 transition-transform',
                            )}
                            ${sug.label}
                          </button>
                        `,
                      )}
                    </div>
                  `
                : nothing}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderMessage(msg, idx) {
    const prevMsg = this.messages[idx - 1];
    const showDateHeader =
      !prevMsg || new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString();

    return html`
      <div class="space-y-6">
        ${showDateHeader && msg.timestamp
          ? html`
              <div class="flex justify-center">
                <div
                  class="px-4 py-1.5 rounded-full border text-[10px] uppercase tracking-widest font-bold bg-[var(--component-bg)] border-[var(--border-color)] text-[var(--text-secondary)]"
                >
                  ${getDateHeader(msg.timestamp)}
                </div>
              </div>
            `
          : nothing}
        <div
          class="flex ${
            msg.role === 'user' ? 'justify-end' : 'justify-start'
          } animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          ${msg.role === 'user'
            ? html`
                <div class="flex flex-col items-end max-w-[80%] group/msg">
                  <div class="flex items-center gap-2 mb-1 mr-11">
                    ${msg.timestamp
                      ? html`
                          <div class="text-[10px] font-medium text-[var(--text-secondary)]">
                            ${formatMessageTime(msg.timestamp)}
                          </div>
                        `
                      : nothing}
                    <div class="text-xs font-bold text-[var(--text-primary)]">User</div>
                  </div>

                  <div class="flex gap-3 items-end w-full justify-end">
                    <div class="flex-1 space-y-1 text-right">
                      <div class="flex items-end justify-end gap-2">
                        <div class="opacity-0 group-hover/msg:opacity-100 transition-opacity">
                          ${this.copyButton(msg.content, msg.id)}
                        </div>
                        <div
                          class="px-4 py-3 rounded-2xl rounded-tr-md shadow-xl inline-block text-left"
                          style="background: var(--user-bubble); color: var(--user-text)"
                        >
                          ${msg.attachments?.length > 0
                            ? html`
                                <div class="mb-3 flex flex-wrap justify-end gap-2">
                                  ${msg.attachments.map(
                                    (url, i) => html`
                                      <div class="relative group/user-att">
                                        <img
                                          src="${url}"
                                          alt="Uploaded Attachment"
                                          referrerPolicy="no-referrer"
                                          class="w-24 h-24 sm:w-32 sm:h-32 rounded-xl object-cover border border-white/20 shadow-md cursor-pointer hover:scale-[1.02] transition-transform"
                                          @click=${() =>
                                            (this.selectedMedia = { type: 'image', url })}
                                        />
                                      </div>
                                    `,
                                  )}
                                </div>
                              `
                            : nothing}
                          <p class="text-sm leading-relaxed font-medium whitespace-pre-wrap">
                            ${msg.content}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div
                      class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ease-in-out"
                      style="background: var(--accent); color: var(--accent-text)"
                    >
                      ${icon('MdPerson', 16, 'w-4 h-4')}
                    </div>
                  </div>
                </div>
              `
            : html`
                <div class="flex flex-col items-start max-w-[85%] group/msg">
                  <div class="flex items-center gap-2 mb-1 ml-11">
                    <div class="text-xs font-bold text-[var(--text-primary)]">
                      ${this.agentDetails?.name}
                    </div>
                    ${msg.timestamp
                      ? html`
                          <div class="text-[10px] font-medium text-[var(--text-secondary)]">
                            ${formatMessageTime(msg.timestamp)}
                          </div>
                        `
                      : nothing}
                  </div>

                  <div class="flex gap-3 items-end w-full">
                    ${this.agentDetails?.icon_url
                      ? html`
                          <img
                            src="${this.agentDetails.icon_url}"
                            alt="${this.agentDetails.name}"
                            referrerPolicy="no-referrer"
                            class="w-8 h-8 rounded-full object-cover border flex-shrink-0 border-[var(--border-color)] transition-all duration-500 ease-in-out"
                          />
                        `
                      : html`
                          <div
                            class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ease-in-out"
                            style="background: var(--accent); color: var(--accent-text)"
                          >
                            ${icon('RiRobot2Fill', 16, 'w-4 h-4')}
                          </div>
                        `}

                    <div class="flex-1 space-y-3">
                      ${msg.status?.length > 0
                        ? html`
                            <div class="flex flex-wrap gap-2">
                              ${msg.status.map(
                                (st, i) => html`
                                  <div
                                    class="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border"
                                    style="background: var(--component-bg); border-color: var(--border-color); color: var(--accent)"
                                  >
                                    ${icon('MdTerminal', 12, 'w-3 h-3')}
                                    <span>${st}</span>
                                  </div>
                                `,
                              )}
                            </div>
                          `
                        : nothing}

                      ${msg.thoughts
                        ? html`
                            <div
                              class="border rounded-xl p-4 space-y-2 bg-[var(--component-bg)] border-[var(--border-color)]"
                            >
                              <div
                                class="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]"
                              >
                                ${icon('RiRobot2Fill', 14, 'w-3.5 h-3.5')}
                                <span>Thinking process</span>
                              </div>
                              <p
                                class="text-xs leading-relaxed italic text-[var(--text-secondary)]"
                              >
                                ${msg.thoughts}
                              </p>
                            </div>
                          `
                        : nothing}

                      ${(msg.content || (this.isStreaming && idx === this.messages.length - 1))
                        ? html`
                            <div class="flex items-end gap-2">
                              <div
                                class="backdrop-blur-sm rounded-2xl rounded-tl-md px-4 py-3 shadow-xl border inline-block"
                                style="background: var(--agent-bubble); color: var(--agent-text); border-color: var(--border-color)"
                              >
                                <div class="prose prose-sm max-w-none" style="color: var(--agent-text)">
                                  ${parseMessageContent(msg.content || ' ').map((part, i) =>
                                    this.renderMediaPart(part),
                                  )}
                                </div>
                                ${this.isStreaming && idx === this.messages.length - 1
                                  ? html`
                                      <div class="flex gap-1 mt-2">
                                        <div
                                          class="w-2 h-2 rounded-full animate-bounce"
                                          style="background: var(--accent); animation-delay: 0ms"
                                        ></div>
                                        <div
                                          class="w-2 h-2 rounded-full animate-bounce"
                                          style="background: var(--accent); animation-delay: 150ms"
                                        ></div>
                                        <div
                                          class="w-2 h-2 rounded-full animate-bounce"
                                          style="background: var(--accent); animation-delay: 300ms"
                                        ></div>
                                      </div>
                                    `
                                  : nothing}
                              </div>
                              <div class="opacity-0 group-hover/msg:opacity-100 transition-opacity">
                                ${this.copyButton(msg.content, msg.id)}
                              </div>
                            </div>
                          `
                        : nothing}

                      ${msg.suggestions?.length > 0
                        ? html`
                            <div class="flex flex-wrap gap-2">
                              ${msg.suggestions.map(
                                (sug, i) => html`
                                  <button
                                    type="button"
                                    @click=${() => (this.input = sug.prompt)}
                                    class="flex items-center gap-2 text-xs font-medium border px-3 py-2 rounded-lg transition-all hover:opacity-80"
                                    style="background: var(--component-bg); border-color: var(--border-color); color: var(--text-primary)"
                                  >
                                    ${icon('HiLightBulb', 14, 'w-3.5 h-3.5 text-yellow-500')}
                                    ${sug.label}
                                  </button>
                                `,
                              )}
                            </div>
                          `
                        : nothing}
                    </div>
                  </div>
                </div>
              `}
        </div>
      </div>
    `;
  }

  renderHeader() {
    const d = this.agentDetails;
    return html`
      <header
        class="flex-shrink-0 border-b backdrop-blur-2xl px-6 py-4 flex items-center justify-center z-10 shadow-lg transition-colors duration-300 bg-[var(--header-bg)] border-[var(--border-color)]"
      >
        <div class="flex items-center justify-between gap-4 w-full lg:max-w-[80%]">
          <div class="flex items-center gap-4">
            <button @click=${() => back()} class="flex items-center justify-center transition-all group">
              ${icon('IoChevronBack', 20, 'w-5 h-5 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors')}
            </button>
            <div class="flex items-center gap-3">
              ${d?.icon_url
                ? html`
                    <img
                      src="${d.icon_url}"
                      alt="${d.name}"
                      referrerPolicy="no-referrer"
                      class="w-9 h-9 rounded-lg object-cover border border-[var(--border-color)]"
                    />
                  `
                : html`
                    <div
                      class="w-9 h-9 rounded-lg flex items-center justify-center"
                      style="background: var(--accent); color: var(--accent-text)"
                    >
                      ${icon('RiRobot2Fill', 20, 'w-5 h-5')}
                    </div>
                  `}
              <div class="relative">
                <button
                  @click=${() => (this.showDropdown = !this.showDropdown)}
                  class="flex items-center gap-2 px-2 py-1 rounded-lg transition-all hover:bg-[var(--component-hover)]"
                >
                  <div class="flex flex-col items-start leading-tight">
                    <h1 class="text-base font-semibold text-[var(--text-primary)] truncate">
                      ${d?.name || 'Loading...'}
                    </h1>
                    ${d && !d.is_owner && (d.owner_username || d.owner_email)
                      ? html`
                          <span class="text-[10px] text-[var(--text-secondary)] font-medium">
                            by ${d.owner_username || d.owner_email?.split('@')[0]}
                          </span>
                        `
                      : nothing}
                  </div>
                  ${icon(
                    'IoChevronBack',
                    16,
                    `w-4 h-4 text-[var(--text-secondary)] transition-transform ${
                      this.showDropdown ? 'rotate-90' : '-rotate-180'
                    }`,
                  )}
                </button>
                ${this.showDropdown
                  ? html`
                      <div
                        class="absolute top-10 left-0 border rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200 min-w-[200px] bg-[var(--header-bg)] border-[var(--border-color)]"
                      >
                        <button
                          @click=${() => {
                            this.showDropdown = false;
                            navigate(`/agents/${this.lowerAgentSlug}/profile`);
                          }}
                          type="button"
                          class="w-full flex items-center gap-3 px-3 py-2 transition-all hover:bg-[var(--component-hover)] rounded-t-lg"
                        >
                          ${icon('RiRobot2Fill', 16, 'text-[var(--text-secondary)]')}
                          <span class="text-sm text-[var(--text-primary)]">View Profile</span>
                        </button>
                        ${d?.is_owner
                          ? html`
                              <button
                                @click=${() => {
                                  this.showDropdown = false;
                                  navigate(`/agents/edit/${this.agentId}`);
                                }}
                                type="button"
                                class="w-full flex items-center gap-3 px-3 py-2 transition-all hover:bg-[var(--component-hover)] border-t border-[var(--border-color)]"
                              >
                                ${icon('MdEdit', 16, 'text-[var(--text-secondary)]')}
                                <span class="text-sm text-[var(--text-primary)]">Edit agent</span>
                              </button>
                              <div class="relative group/submenu">
                                <button
                                  @mouseenter=${() => (this.showThemeDropdown = true)}
                                  @click=${() => (this.showThemeDropdown = !this.showThemeDropdown)}
                                  type="button"
                                  class="w-full flex items-center gap-3 px-3 py-2 transition-all hover:bg-[var(--component-hover)] border-t border-[var(--border-color)] rounded-b-lg ${
                                    this.showThemeDropdown ? 'bg-[var(--component-hover)]' : ''
                                  }"
                                >
                                  ${icon('IoColorPalette', 16, 'text-[var(--text-secondary)]')}
                                  <span class="text-sm text-[var(--text-primary)]">Themes</span>
                                  ${icon(
                                    'FaAngleRight',
                                    14,
                                    'ml-auto text-[var(--text-secondary)]',
                                  )}
                                </button>
                                ${this.showThemeDropdown
                                  ? html`
                                      <div
                                        class="md:absolute relative md:left-full left-0 md:top-0 top-0 md:ml-1 ml-0 md:border border-none md:rounded-xl rounded-none md:shadow-2xl shadow-none overflow-hidden z-[60] animate-in fade-in md:slide-in-from-left-2 slide-in-from-top-2 duration-200 min-w-[200px] bg-[var(--header-bg)] md:border-[var(--border-color)] p-2"
                                        @mouseenter=${() => (this.showThemeDropdown = true)}
                                        @mouseleave=${() => (this.showThemeDropdown = false)}
                                      >
                                        <div
                                          class="text-[10px] font-bold text-[var(--text-secondary)] mb-2 px-2 uppercase tracking-[0.2em]"
                                          >Select Theme</div
                                        >
                                        <div
                                          class="space-y-1 max-h-80 overflow-y-auto custom-scrollbar pr-1"
                                        >
                                          ${Object.values(themes).map(
                                            (theme) => html`
                                              <button
                                                @click=${() => {
                                                  this.handleThemeChange(theme);
                                                  this.showThemeDropdown = false;
                                                  this.showDropdown = false;
                                                }}
                                                type="button"
                                                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group/theme ${
                                                  this.currentTheme.id === theme.id
                                                    ? 'bg-[var(--accent)] text-[var(--accent-text)] shadow-md'
                                                    : 'text-[var(--text-secondary)] hover:bg-[var(--component-hover)]'
                                                }"
                                              >
                                                <div
                                                  class="w-4 h-4 rounded-full border border-white/20 shadow-inner flex-shrink-0"
                                                  style="background: ${theme.colors.background}"
                                                ></div>
                                                <span class="font-medium">${theme.name}</span>
                                                ${this.currentTheme.id === theme.id
                                                  ? icon('MdCheck', 16, 'ml-auto w-4 h-4')
                                                  : nothing}
                                              </button>
                                            `,
                                          )}
                                          <button
                                            @click=${() => {
                                              this.showCustomColorPanel = true;
                                              this.showThemeDropdown = false;
                                              this.showDropdown = false;
                                            }}
                                            type="button"
                                            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--component-hover)] border-t border-[var(--border-color)] mt-1"
                                          >
                                            ${icon('MdEdit', 16, 'w-4 h-4')}
                                            <span class="font-medium">Customize Colors</span>
                                          </button>
                                        </div>
                                      </div>
                                    `
                                  : nothing}
                              </div>
                            `
                          : nothing}
                      </div>
                    `
                  : nothing}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              @click=${this.handleLike}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--component-hover)]"
              title=${this.liked ? 'Unlike agent' : 'Like agent'}
            >
              ${this.liked
                ? icon('IoHeart', 16, 'w-4 h-4 text-red-500')
                : icon('IoHeartOutline', 16, 'w-4 h-4')}
              <span class="text-xs font-semibold">${this.likeCount || 0}</span>
            </button>

            ${this.conversationId
              ? html`
                  <button
                    type="button"
                    @click=${this.handleNewChat}
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--component-hover)]"
                    title="Start new chat"
                  >
                    ${icon('HiOutlinePencilAlt', 16, 'w-4 h-4')}
                    <span class="text-xs hidden md:flex font-semibold">New Chat</span>
                  </button>
                `
              : nothing}
          </div>
        </div>
      </header>
    `;
  }

  renderFooter() {
    return html`
      <footer class="flex-shrink-0 p-4">
        <div class="max-w-3xl mx-auto">
          ${this.error
            ? html`
                <div
                  class="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between"
                >
                  <span class="text-xs text-red-400 font-medium">Error: ${this.error}</span>
                  <button @click=${() => (this.error = null)} class="text-red-400 hover:text-red-300">
                    ${icon('MdClose', 16, 'w-4 h-4')}
                  </button>
                </div>
              `
            : nothing}
          <form
            @submit=${this.handleSendMessage}
            @dragover=${this.handleDragOver}
            @dragleave=${this.handleDragLeave}
            @drop=${this.handleDrop}
            class="relative border rounded-2xl flex items-end gap-2 p-2 transition-all shadow-inner focus-within:border-[var(--accent)] ${
              this.isDragging ? 'ring-2 ring-[var(--accent)] border-[var(--accent)] bg-[var(--accent)]/5' : ''
            }"
            style="background: var(--input-bg); border-color: var(--border-color)"
          >
            ${this.isDragging
              ? html`
                  <div
                    class="absolute inset-0 z-50 flex items-center justify-center bg-[var(--accent)]/10 backdrop-blur-[2px] rounded-2xl pointer-events-none border-2 border-dashed border-[var(--accent)] animate-in fade-in duration-200"
                  >
                    <div class="flex items-center justify-center gap-2 text-[var(--accent)]">
                      ${icon('IoAdd', 32, 'w-8 h-8 animate-bounce')}
                      <span class="text-sm font-bold uppercase tracking-wider">
                        Drop image to upload
                      </span>
                    </div>
                  </div>
                `
              : nothing}
            ${this.attachments.length > 0
              ? html`
                  <div
                    class="absolute bottom-full left-0 right-0 mb-2 flex flex-wrap gap-2 animate-in slide-in-from-bottom-2"
                  >
                    ${this.attachments.map(
                      (url, i) => html`
                        <div class="relative group/att">
                          <img
                            src="${url}"
                            class="w-16 h-16 rounded-xl object-cover border-2 border-[var(--border-color)] shadow-lg"
                            alt="Attachment Preview"
                          />
                          <button
                            @click=${() => this.removeAttachment(url)}
                            type="button"
                            class="absolute -top-1.5 -right-1.5 p-1 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover/att:opacity-100 transition-opacity"
                          >
                            ${icon('MdClose', 12, 'w-3 h-3')}
                          </button>
                        </div>
                      `,
                    )}
                  </div>
                `
              : nothing}
            <input
              type="file"
              @change=${this.handleFileUpload}
              class="hidden"
              accept="image/*"
            />
            <button
              @click=${() => {
                const fi = this.renderRoot.querySelector('input[type=file]');
                if (fi) fi.click();
              }}
              type="button"
              ?disabled=${this.isUploading || this.isStreaming}
              class="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all bg-[var(--component-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 shadow-sm relative overflow-hidden"
              title="Upload Image"
            >
              ${this.isUploading
                ? html`
                    ${icon('BiLoaderAlt', 16, 'w-4 h-4 animate-spin opacity-20')}
                    <span
                      class="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[var(--accent)]"
                    >
                      ${this.uploadProgress}%
                    </span>
                  `
                : icon('IoAdd', 20, 'w-5 h-5')}
            </button>
            <textarea
              .value=${this.input}
              @input=${(e) => (this.input = e.target.value)}
              @keydown=${(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  this.handleSendMessage();
                }
              }}
              ?disabled=${this.isStreaming}
              placeholder=${this.isStreaming ? 'Agent is thinking...' : 'Type here or drop an image...'}
              class="flex-1 bg-transparent px-3 py-2.5 text-sm focus:outline-none resize-none max-h-32 placeholder:text-gray-500 custom-scrollbar text-[var(--text-primary)]"
              rows="1"
            >
            </textarea>
            <button
              type="submit"
              ?disabled=${!this.input.trim() || this.isStreaming}
              class="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              style="background: var(--accent); color: var(--accent-text)"
            >
              ${this.isStreaming
                ? icon('BiLoaderAlt', 16, 'w-4 h-4 animate-spin')
                : icon('IoSend', 16, 'w-4 h-4')}
            </button>
          </form>
        </div>
      </footer>
    `;
  }

  renderMediaModal() {
    const m = this.selectedMedia;
    return html`
      <div
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-300"
        @click=${() => (this.selectedMedia = null)}
      >
        <button
          type="button"
          class="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10 z-[110]"
          @click=${() => (this.selectedMedia = null)}
        >
          ${icon('MdClose', 24, 'w-6 h-6')}
        </button>
        <div
          class="max-w-[90vw] max-h-[90vh] relative animate-in zoom-in-95 duration-300"
          @click=${(e) => e.stopPropagation()}
        >
          ${m.type === 'image'
            ? html`
                <img
                  src="${m.url}"
                  alt="Full Screen"
                  referrerPolicy="no-referrer"
                  class="w-full h-auto max-h-[90vh] object-contain rounded-lg shadow-2xl border border-white/10"
                />
              `
            : html`
                <video
                  src="${m.url}"
                  controls
                  autoplay
                  class="w-full h-auto max-h-[90vh] rounded-lg shadow-2xl border border-white/10"
                ></video>
              `}
          <div class="flex justify-center">
            <button
              @click=${() =>
                this.handleDownloadFile(
                  m.url,
                  `${m.type}-${Date.now()}.${m.type === 'image' ? 'png' : 'mp4'}`,
                )}
              type="button"
              class="flex items-center gap-2 px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
              ?disabled=${this.downloadingUrl === m.url}
            >
              ${this.downloadingUrl === m.url
                ? html`
                    ${icon('BiLoaderAlt', 20, 'w-5 h-5 animate-spin')} Preparing...
                  `
                : html`
                    ${icon('MdFileDownload', 20, 'w-5 h-5')} Download
                  `}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderCustomColorPanel() {
    return html`
      <div class="absolute inset-0 z-[100] flex items-center justify-center p-4">
        <div
          class="absolute inset-0 bg-black/10 backdrop-blur-sm transition-opacity"
          @click=${() => (this.showCustomColorPanel = false)}
        ></div>
        <div
          class="relative w-full max-w-md bg-[var(--header-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
          <div
            class="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]"
          >
            <div class="flex items-center gap-2">
              ${icon('IoColorPalette', 20, 'w-5 h-5 text-[var(--accent)]')}
              <h3 class="font-bold text-[var(--text-primary)]">Customize Theme</h3>
            </div>
            <button
              @click=${() => (this.showCustomColorPanel = false)}
              class="p-1 rounded-lg hover:bg-[var(--component-hover)] text-[var(--text-secondary)] transition-colors"
            >
              ${icon('MdClose', 24, 'w-6 h-6')}
            </button>
          </div>

          <div class="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar space-y-4">
            ${CUSTOM_COLOR_ITEMS.map(
              (item) => html`
                <div
                  class="flex items-center justify-between p-3 rounded-xl border border-[var(--border-color)] bg-[var(--component-bg)]/50"
                >
                  <span class="text-sm font-medium text-[var(--text-primary)]">${item.label}</span>
                  <div class="flex items-center gap-3">
                    <span
                      class="text-[10px] font-mono text-[var(--text-secondary)] uppercase"
                    >
                      ${this.currentTheme.colors[item.key]}
                    </span>
                    <input
                      type="color"
                      .value=${this.currentTheme.colors[item.key]?.startsWith('#')
                        ? this.currentTheme.colors[item.key]
                        : '#000000'}
                      @input=${(e) => this.handleCustomColorChange(item.key, e.target.value)}
                      class="w-10 h-10 rounded-lg cursor-pointer border-none bg-transparent"
                    />
                  </div>
                </div>
              `,
            )}
          </div>

          <div class="p-4 bg-[var(--component-bg)]/50 border-t border-[var(--border-color)]">
            <button
              @click=${() => this.handleThemeSync(this.currentTheme)}
              class="w-full py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95"
              style="background: var(--accent); color: var(--accent-text)"
            >
              Apply Changes
            </button>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    if (this.notFound) {
      return html`
        <main class="h-dvh w-full flex items-center justify-center bg-gray-100 dark:bg-gray-900">
          <div
            class="text-center text-gray-500 dark:text-gray-400 text-base font-medium"
          >
            Agent not found
          </div>
        </main>
      `;
    }

    if (!this.agentDetails) {
      return html`
        <main class="h-dvh w-full flex items-center justify-center bg-gray-100 dark:bg-gray-900">
          <div class="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
            ${icon('BiLoaderAlt', 32, 'w-8 h-8 animate-spin')}
            <span class="text-sm font-medium">Loading...</span>
          </div>
        </main>
      `;
    }

    return html`
      <main
        class="h-dvh flex flex-col selection:bg-blue-500/30 relative"
        style=${styleMap(this.generateCssVariables(this.currentTheme))}
      >
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

          main {
            font-family: var(--font-family) !important;
          }

          .prose, .prose p, .prose h1, .prose h2, .prose h3, .prose h4, .prose li {
            font-family: var(--font-family) !important;
          }
        </style>
        ${this.renderHeader()}
        <div class="flex-1 flex overflow-y-auto">
          <div class="flex-1 overflow-y-auto px-4 py-8 custom-scrollbar">
            <div class="max-w-3xl mx-auto space-y-6">
              ${this.messages.length === 0 && this.agentDetails ? this.renderWelcome() : nothing}
              ${this.messages.map((msg, idx) => this.renderMessage(msg, idx))}
            </div>
          </div>
        </div>
        ${this.renderFooter()}
        ${this.selectedMedia ? this.renderMediaModal() : nothing}
        ${this.showCustomColorPanel ? this.renderCustomColorPanel() : nothing}
      </main>
    `;
  }
}

customElements.define('agent-chat', AgentChat);
