// Port of packages/studio/src/components/AgentStudio.jsx.
// Agent gallery (templates / my-agents / my-chats tabs) with chat + create
// sub-views.
//
// Porting notes:
// - react-router: useNavigate → navigate() from lib/router.js; the router
//   .replace() twin takes { replace: true }.
// - The original resolves an inline chat/create view from react-router
//   `params.tab` segments. This app's route table never supplies those
//   (single-segment /studio/:name), and the shell renders studios without an
//   apiKey — so both the URL effect and the list-load effect bail early and
//   the view stays on the list header + spinner, exactly as the React build
//   does. `urlSegments` is a (unused-by-default) prop so a white-label host
//   can still drive the inline views.
// - React state bail-out quirk preserved: setting activeMainTab/view to the
//   value it already has does NOT retrigger the load effect (the list view's
//   Retry button sets the same tab value, so it is a no-op, as in React).
// - Assistant chat bubbles render markdown via lib/markdown.js
//   (marked + DOMPurify, GFM) — replaces ReactMarkdown + remark-gfm.
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { navigate } from '../../lib/router.js';
import { renderMarkdown, highlightBlocks } from '../../lib/markdown.js';
import {
  getTemplateAgents,
  getUserAgents,
  getUserConversations,
  getAgentBySlug,
  getAgentConversation,
  sendAgentChatMessage,
  pollAgentChatResult,
  createAgent,
} from 'studio/muapi.js';

// ─── Helpers ────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const utcStr =
    dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
  const diff = Math.floor((Date.now() - new Date(utcStr)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(utcStr).toLocaleDateString();
}

// Conversation history entries can carry `content` as a plain string or as a
// list of structured blocks (matches the shape agent_router.py's own last-message
// preview extraction already assumes for the "My Chats" list).
function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : b?.text || ''))
      .join('\n');
  }
  return '';
}

const TABS = ['templates', 'my-agents', 'my-chats'];

export class StudioAgents extends BaseElement {
  static sheetKey = 'studio';

  static properties = {
    apiKey: { type: String },
    // Would come from react-router useParams().tab on a white-label domain.
    urlSegments: { attribute: false },

    activeMainTab: { state: true },
    agents: { state: true },
    conversations: { state: true },
    loading: { state: true },
    error: { state: true },
    view: { state: true }, // 'list' | 'chat' | 'create'
    activeAgent: { state: true },
    conversationId: { state: true },
    chatMessages: { state: true },
    chatInput: { state: true },
    chatLoading: { state: true },
    sending: { state: true },
    chatError: { state: true },
    createForm: { state: true },
    creating: { state: true },
    createError: { state: true },
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
    this.apiKey = '';
    this.urlSegments = [];

    this.activeMainTab = 'templates';
    this.agents = [];
    this.conversations = [];
    this.loading = true;
    this.error = null;

    this.view = 'list';
    this.activeAgent = null;
    this.conversationId = null;
    this.chatMessages = [];
    this.chatInput = '';
    this.chatLoading = false;
    this.sending = false;
    this.chatError = null;

    this.createForm = {
      name: '',
      description: '',
      system_prompt: '',
      welcome_message: '',
    };
    this.creating = false;
    this.createError = null;

    this._urlSeq = 0;
    this._listLoadToken = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this._resolveUrlView();
    this._maybeLoadList();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Invalidate any in-flight URL-view resolution.
    this._urlSeq = -1;
  }

  // URL-driven inline view (was the useParams useEffect).
  _resolveUrlView() {
    const tabSegments = Array.isArray(this.urlSegments) ? this.urlSegments : [];
    const agentsIdx = tabSegments.indexOf('agents');
    const urlAgentSlug =
      agentsIdx === -1 ? null : tabSegments[agentsIdx + 1] || null;
    const urlConversationId =
      agentsIdx === -1 ? null : tabSegments[agentsIdx + 2] || null;

    if (!this.apiKey) return;
    if (!urlAgentSlug || urlAgentSlug === 'edit') {
      this._setView('list');
      return;
    }
    if (urlAgentSlug === 'create') {
      this._setView('create');
      return;
    }

    // Supersede any in-flight resolution (React effect cleanup equivalent).
    this._urlSeq = (this._urlSeq ?? 0) + 1;
    const seq = this._urlSeq;
    const cancelled = () => seq !== this._urlSeq;
    (async () => {
      this.chatLoading = true;
      this.chatError = null;
      try {
        const agent = await getAgentBySlug(this.apiKey, urlAgentSlug);
        if (cancelled()) return;
        this.activeAgent = agent;
        if (urlConversationId) {
          const conv = await getAgentConversation(
            this.apiKey,
            urlAgentSlug,
            urlConversationId,
          );
          if (cancelled()) return;
          this.conversationId = conv.id;
          this.chatMessages = conv.history || [];
        } else {
          this.conversationId = null;
          this.chatMessages = [];
        }
        this._setView('chat');
      } catch (err) {
        if (!cancelled()) this.chatError = err.message || 'Failed to load agent';
      } finally {
        if (!cancelled()) this.chatLoading = false;
      }
    })();
  }

  // State setters with React's bail-out semantics: assigning the same value
  // does not retrigger the load effect.
  _setActiveMainTab(tab) {
    if (this.activeMainTab === tab) return;
    this.activeMainTab = tab;
    this._maybeLoadList();
  }

  _setView(v) {
    if (this.view === v) return;
    this.view = v;
    this._maybeLoadList();
  }

  // Was the [apiKey, activeMainTab, view] load useEffect.
  _maybeLoadList() {
    if (!this.apiKey || this.view !== 'list') return;
    let cancelled = false;
    this._listLoadToken = (this._listLoadToken ?? 0) + 1;
    const token = this._listLoadToken;
    const stale = () => cancelled || token !== this._listLoadToken;

    (async () => {
      this.loading = true;
      this.error = null;
      this.agents = [];
      this.conversations = [];
      try {
        if (this.activeMainTab === 'templates') {
          const data = await getTemplateAgents(this.apiKey);
          if (!stale()) this.agents = data;
        } else if (this.activeMainTab === 'my-agents') {
          const data = await getUserAgents(this.apiKey);
          if (!stale()) this.agents = data;
        } else if (this.activeMainTab === 'my-chats') {
          const data = await getUserConversations(this.apiKey);
          if (!stale()) this.conversations = data;
        }
      } catch (err) {
        console.error('AgentStudio load error:', err);
        if (!stale()) this.error = err.message || 'Failed to load.';
      } finally {
        if (!stale()) this.loading = false;
      }
    })();
  }

  handleSelectAgent(agent) {
    const id = agent.agent_id || agent.id;
    navigate(`/agents/${id}`);
  }

  handleEditAgent(agent) {
    const id = agent.agent_id || agent.id;
    navigate(`/agents/edit/${id}`);
  }

  handleCreateAgent() {
    navigate('/agents/create');
  }

  handleOpenConversation(agentSlug, convId) {
    navigate(`/agents/${agentSlug}/${convId}`);
  }

  async handleSendMessage() {
    if (!this.chatInput.trim() || this.sending || !this.activeAgent) return;
    const text = this.chatInput.trim();
    this.chatInput = '';
    this.chatMessages = [...this.chatMessages, { role: 'user', content: text }];
    this.sending = true;
    this.chatError = null;
    try {
      const agentSlug = this.activeAgent.agent_id;
      const { request_id } = await sendAgentChatMessage(
        this.apiKey,
        agentSlug,
        {
          message: text,
          conversationId: this.conversationId,
        },
      );
      const result = await pollAgentChatResult(this.apiKey, request_id);
      // result.messages is only this turn's assistant/pulse entries, not the
      // full transcript (see AiAgent.jsx) — append, don't replace, or every
      // send wipes the user's own message and all prior history from view.
      const assistantMessage = (result.messages || []).find(
        (m) => m.role === 'assistant' && m.content,
      );
      this.chatMessages = [
        ...this.chatMessages,
        assistantMessage || { role: 'assistant', content: '' },
      ];
      if (
        result.conversation_id &&
        result.conversation_id !== this.conversationId
      ) {
        this.conversationId = result.conversation_id;
        navigate(`/agents/${agentSlug}/${result.conversation_id}`, {
          replace: true,
        });
      }
    } catch (err) {
      this.chatError = err.message || 'Failed to send message';
    } finally {
      this.sending = false;
    }
  }

  async handleCreateSubmit(e) {
    e.preventDefault();
    if (
      !this.createForm.name.trim() ||
      !this.createForm.system_prompt.trim() ||
      this.creating
    )
      return;
    this.creating = true;
    this.createError = null;
    try {
      const created = await createAgent(this.apiKey, {
        name: this.createForm.name.trim(),
        description: this.createForm.description.trim() || null,
        system_prompt: this.createForm.system_prompt.trim(),
        welcome_message: this.createForm.welcome_message.trim() || null,
        skill_ids: [],
      });
      navigate(`/agents/${created.agent_id}`);
    } catch (err) {
      this.createError = err.message || 'Failed to create agent';
    } finally {
      this.creating = false;
    }
  }

  renderChatBubble(message) {
    const isUser = message.role === 'user';
    const text = textFromContent(message.content);
    return html`
      <div class="flex ${isUser ? 'justify-end' : 'justify-start'}">
        <div
          class="max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-[#22d3ee] text-black font-medium'
              : 'bg-white/[0.04] border border-white/5 text-white/90'
          }"
        >
          ${isUser
            ? html`<span class="whitespace-pre-wrap">${text}</span>`
            : html`
                <div
                  class="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-pre:bg-black/40"
                  data-markdown
                >
                  ${unsafeHTML(renderMarkdown(text || '…'))}
                </div>
              `}
        </div>
      </div>
    `;
  }

  renderAgentCard(agent) {
    const onEdit = null;
    return html`
      <div class="group relative aspect-[4/5] rounded-xl cursor-pointer">
        <div
          @click=${() => this.handleSelectAgent(agent)}
          class="absolute inset-0 rounded-xl overflow-hidden border border-white/5 bg-[#0a0a0a] transition-all group-hover:border-[#22d3ee]/30 group-hover:scale-[1.02] shadow-2xl"
        >
          ${agent.icon_url
            ? html`
                <img
                  src=${agent.icon_url}
                  alt=${agent.name}
                  class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
              `
            : html`
                <div
                  class="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 flex items-center justify-center"
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" class="opacity-20">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
              `}
          <div
            class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"
          ></div>
          <div class="absolute inset-x-0 bottom-0 p-4">
            <div class="text-[10px] font-bold text-[#22d3ee] uppercase tracking-wider mb-1 opacity-80">
              ${agent.category || 'AI Assistant'}
            </div>
            <h3
              class="text-sm font-bold text-white truncate group-hover:text-[#22d3ee] transition-colors"
            >
              ${agent.name || 'Unnamed Agent'}
            </h3>
            ${agent.owner_username
              ? html`
                  <p class="text-[9px] text-white/40 mt-1 uppercase tracking-tighter font-black">
                    By ${agent.owner_username}
                  </p>
                `
              : nothing}
          </div>
        </div>

        ${onEdit
          ? html`
              <button
                @click=${(e) => {
                  e.stopPropagation();
                  this.handleEditAgent(agent);
                }}
                class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-[#22d3ee] hover:text-black hover:scale-110 z-10"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
            `
          : nothing}
      </div>
    `;
  }

  renderConversationCard(conv) {
    const displayTitle = conv.title || 'New Chat';
    const agentSlug = conv.agent_slug || conv.agent_id;
    return html`
      <div
        @click=${() => this.handleOpenConversation(agentSlug, conv.id)}
        class="group flex flex-col gap-3 bg-white/[0.03] border border-white/5 rounded-xl p-4 hover:border-[#22d3ee]/20 hover:bg-white/5 transition-all cursor-pointer"
      >
        <div class="flex items-center gap-3">
          <div
            class="relative w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/5 shrink-0"
          >
            ${conv.agent_icon_url
              ? html`
                  <img
                    src=${conv.agent_icon_url}
                    alt=${conv.agent_name || 'Agent'}
                    class="w-full h-full object-cover"
                  />
                `
              : html`
                  <div
                    class="w-full h-full flex items-center justify-center text-white/20"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                `}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[10px] font-black text-[#22d3ee] uppercase tracking-wider truncate">
              ${conv.agent_name || 'Unknown Agent'}
            </p>
            <p class="text-sm font-bold text-white truncate" title=${displayTitle}>
              ${displayTitle}
            </p>
          </div>
        </div>
        <div
          class="flex items-center justify-between pt-2 border-t border-white/5 mt-auto text-[10px] text-white/30 font-medium"
        >
          <span>${timeAgo(conv.updated_at)}</span>
          ${conv.message_count != null
            ? html`<span>${conv.message_count} msgs</span>`
            : nothing}
        </div>
      </div>
    `;
  }

  renderCreate() {
    return html`
      <div
        class="h-full flex flex-col bg-[#030303] text-white overflow-y-auto custom-scrollbar"
      >
        <div
          class="flex-shrink-0 h-16 border-b border-white/5 flex items-center gap-6 px-8 bg-black/40"
        >
          <button
            @click=${() => navigate('/agents')}
            class="flex items-center gap-2 text-xs font-bold text-white/50 hover:text-white transition-colors"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Agents
          </button>
          <h2 class="text-sm font-black uppercase tracking-[0.2em] text-[#22d3ee]">Create Agent</h2>
        </div>

        <form
          @submit=${this.handleCreateSubmit}
          class="max-w-2xl w-full mx-auto p-8 space-y-6"
        >
          <div class="space-y-2">
            <label class="block text-[10px] font-black text-white/40 uppercase tracking-widest">Name</label>
            <input
              type="text"
              required
              .value=${this.createForm.name}
              @input=${(e) => (this.createForm = { ...this.createForm, name: e.currentTarget.value })}
              placeholder="e.g. Caption Crafter Pro"
              class="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors"
            />
          </div>

          <div class="space-y-2">
            <label class="block text-[10px] font-black text-white/40 uppercase tracking-widest">Description</label>
            <input
              type="text"
              .value=${this.createForm.description}
              @input=${(e) => (this.createForm = { ...this.createForm, description: e.currentTarget.value })}
              placeholder="What does this agent help with?"
              class="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors"
            />
          </div>

          <div class="space-y-2">
            <label class="block text-[10px] font-black text-white/40 uppercase tracking-widest">System Prompt</label>
            <textarea
              required
              .value=${this.createForm.system_prompt}
              @input=${(e) => (this.createForm = { ...this.createForm, system_prompt: e.currentTarget.value })}
              placeholder="You are a helpful assistant that..."
              class="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors min-h-[140px] resize-none"
            ></textarea>
          </div>

          <div class="space-y-2">
            <label class="block text-[10px] font-black text-white/40 uppercase tracking-widest">Welcome Message (optional)</label>
            <input
              type="text"
              .value=${this.createForm.welcome_message}
              @input=${(e) => (this.createForm = { ...this.createForm, welcome_message: e.currentTarget.value })}
              placeholder="Hi! How can I help you today?"
              class="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors"
            />
          </div>

          ${this.createError
            ? html`
                <p class="text-xs font-bold text-red-400">${this.createError}</p>
              `
            : nothing}

          <button
            type="submit"
            ?disabled=${
              this.creating ||
              !this.createForm.name.trim() ||
              !this.createForm.system_prompt.trim()
            }
            class="w-full py-4 bg-[#22d3ee] text-black text-xs font-black uppercase tracking-[0.2em] rounded-xl hover:bg-white transition-all disabled:opacity-40 flex items-center justify-center gap-3"
          >
            ${this.creating
              ? html`
                  <div
                    class="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"
                  ></div>
                  <span>Creating...</span>
                `
              : html`
                  <span>Create Agent</span>
                `}
          </button>
        </form>
      </div>
    `;
  }

  renderChat() {
    return html`
      <div class="h-full flex flex-col bg-[#030303] text-white">
        <div
          class="flex-shrink-0 h-16 border-b border-white/5 flex items-center gap-4 px-8 bg-black/40"
        >
          <button
            @click=${() => navigate('/agents')}
            class="flex items-center gap-2 text-xs font-bold text-white/50 hover:text-white transition-colors"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Agents
          </button>
          <div class="h-4 w-[1px] bg-white/10"></div>
          ${this.activeAgent
            ? html`
                <div class="flex items-center gap-3">
                  <div
                    class="w-8 h-8 rounded-lg overflow-hidden bg-white/5 border border-white/5 shrink-0"
                  >
                    ${this.activeAgent.icon_url
                      ? html`
                          <img
                            src=${this.activeAgent.icon_url}
                            alt=${this.activeAgent.name}
                            class="w-full h-full object-cover"
                          />
                        `
                      : nothing}
                  </div>
                  <span class="text-sm font-bold text-white"
                    >${this.activeAgent.name}</span
                  >
                </div>
              `
            : nothing}
        </div>

        <div
          class="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-4 max-w-3xl w-full mx-auto"
        >
          ${this.chatLoading
            ? html`
                <div class="h-full flex items-center justify-center">
                  <div
                    class="w-10 h-10 border-2 border-white/5 border-t-[#22d3ee] rounded-full animate-spin"
                  ></div>
                </div>
              `
            : html`
                ${this.chatMessages.length === 0 &&
                this.activeAgent?.welcome_message
                  ? this.renderChatBubble({
                      role: 'assistant',
                      content: this.activeAgent.welcome_message,
                    })
                  : nothing}
                ${this.chatMessages.map(
                  (msg, i) => this.renderChatBubble(msg),
                )}
                ${this.sending
                  ? html`
                      <div class="flex justify-start">
                        <div
                          class="bg-white/[0.04] border border-white/5 rounded-2xl px-4 py-3"
                        >
                          <div
                            class="w-4 h-4 border-2 border-white/10 border-t-[#22d3ee] rounded-full animate-spin"
                          ></div>
                        </div>
                      </div>
                    `
                  : nothing}
                ${this.chatError
                  ? html`
                      <p class="text-xs font-bold text-red-400">${this.chatError}</p>
                    `
                  : nothing}
              `}
        </div>

        <div class="flex-shrink-0 border-t border-white/5 p-6 bg-black/40">
          <form
            @submit=${(e) => {
              e.preventDefault();
              this.handleSendMessage();
            }}
            class="max-w-3xl w-full mx-auto flex items-end gap-3"
          >
            <textarea
              .value=${this.chatInput}
              @input=${(e) => (this.chatInput = e.currentTarget.value)}
              @keydown=${(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  this.handleSendMessage();
                }
              }}
              placeholder="Message this agent..."
              rows="1"
              class="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#22d3ee]/50 transition-colors resize-none max-h-40"
            ></textarea>
            <button
              type="submit"
              ?disabled=${!this.chatInput.trim() || this.sending}
              class="px-5 py-3 bg-[#22d3ee] text-black text-xs font-black uppercase tracking-widest rounded-xl hover:bg-white transition-all disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    `;
  }

  renderList() {
    return html`
      <div class="h-full flex flex-col bg-[#030303] text-white">
        <!-- Header -->
        <div
          class="flex-shrink-0 h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/40"
        >
          <div class="flex items-center gap-8 h-full">
            <h2 class="text-sm font-black uppercase tracking-[0.2em] text-[#22d3ee]">
              Agents
            </h2>
            <div class="flex gap-1 bg-white/5 p-1 rounded-xl">
              ${TABS.map(
                (tab) => html`
                  <button
                    @click=${() => this._setActiveMainTab(tab)}
                    class="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                      this.activeMainTab === tab
                        ? 'bg-white text-black shadow-xl'
                        : 'text-white/40 hover:text-white hover:bg-white/5'
                    }"
                  >
                    ${tab.replace(/-/g, ' ')}
                  </button>
                `,
              )}
            </div>
          </div>

          <button
            @click=${this.handleCreateAgent}
            class="px-6 py-2 bg-[#22d3ee] text-black text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-[#ebff66] transition-all active:scale-95 flex items-center gap-2"
          ><span class="text-sm">+</span>Create</button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto custom-scrollbar p-8">
          ${this.loading
            ? html`
                <div class="h-full flex items-center justify-center">
                  <div
                    class="w-10 h-10 border-2 border-white/5 border-t-[#22d3ee] rounded-full animate-spin"
                  ></div>
                </div>
              `
            : this.error
              ? html`
                  <div
                    class="h-full flex flex-col items-center justify-center text-white/20 gap-4"
                  >
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p class="text-xs font-bold uppercase tracking-widest">${this.error}</p>
                    <button
                      @click=${() =>
                        // retrigger effect — bails (no-op) as in React, since the
                        // tab value is already the active one
                        this._setActiveMainTab(this.activeMainTab)}
                      class="text-[10px] text-white/40 hover:text-white border border-white/10 px-4 py-2 rounded-lg transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                `
              : this.activeMainTab === 'my-chats'
                ? this.conversations.length === 0
                  ? html`
                      <div
                        class="h-full flex flex-col items-center justify-center text-white/10 gap-4"
                      >
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.5">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <p
                          class="text-[10px] font-black uppercase tracking-[0.3em]"
                        >
                          No chats yet
                        </p>
                        <button
                          @click=${() => this._setActiveMainTab('templates')}
                          class="text-[10px] text-[#22d3ee] hover:text-white border border-[#22d3ee]/20 hover:border-white/20 px-4 py-2 rounded-lg transition-colors"
                        >
                          Browse Templates
                        </button>
                      </div>
                    `
                  : html`
                      <div
                        class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-[1600px] mx-auto"
                      >
                        ${this.conversations.map((conv) =>
                          this.renderConversationCard(conv),
                        )}
                      </div>
                    `
                : this.agents.length === 0
                  ? html`
                      <div
                        class="h-full flex flex-col items-center justify-center text-white/10 gap-4"
                      >
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.5">
                          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                        <p
                          class="text-[10px] font-black uppercase tracking-[0.3em]"
                        >
                          No agents found
                        </p>
                      </div>
                    `
                  : html`
                      <div
                        class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 max-w-[1600px] mx-auto"
                      >
                        ${this.agents.map((agent) =>
                          this.renderAgentCard(agent),
                        )}
                      </div>
                    `}
        </div>
      </div>
    `;
  }

  firstUpdated() {
    if (this.renderRoot.querySelector('[data-markdown]')) {
      highlightBlocks(this.renderRoot);
    }
  }

  updated() {
    if (this.renderRoot.querySelector('[data-markdown]')) {
      highlightBlocks(this.renderRoot);
    }
  }

  render() {
    if (this.view === 'create') return this.renderCreate();
    if (this.view === 'chat') return this.renderChat();
    return this.renderList();
  }
}

customElements.define('studio-agents', StudioAgents);
