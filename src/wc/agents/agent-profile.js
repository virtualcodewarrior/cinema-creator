import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { iconSvg } from '../../lib/icons.js';
import { navigate } from '../../lib/router.js';
import { apiFetch } from '../../lib/agents-api.js';

const icon = (name, size = 16, className = '') =>
  unsafeHTML(iconSvg(name, { size, className }));

const BASE_URL = '/api/agents';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const utcStr =
    dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
  const now = new Date();
  const d = new Date(utcStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  const months = Math.floor(diff / 2592000);
  if (months < 12) return `${months} mo. ago`;
  return `${Math.floor(months / 12)} yr. ago`;
}

function formatCount(n) {
  if (!n && n !== 0) return '–';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// Port of the AgentProfile wrapper (src/AgentProfile.jsx) +
// components/ProfileAgent.jsx from the ai-agent package.
//   next/image  -> plain <img> (no host config under Vite)
//   next/link   -> navigate()
//   useParams() -> agentId property (matches router pattern :agentId)
// The react-hot-toast <Toaster> is covered by the global <app-toaster>;
// the useUser/usedIn white-label props were never passed by the Vite entry.
export class AgentProfile extends BaseElement {
  static sheetKey = 'agents';

  static properties = {
    agentId: { type: String },
    profile: { state: true },
    loading: { state: true },
    error: { state: true },
    liked: { state: true },
    copied: { state: true },
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
    this.profile = null;
    this.loading = false;
    this.error = null;
    this.liked = false;
    this.copied = false;
  }

  firstUpdated() {
    this.loadProfile();
  }

  async loadProfile() {
    if (!this.agentId) return;
    this.loading = true;
    this.error = null;
    try {
      const res = await apiFetch(`${BASE_URL}/${this.agentId}/profile`);
      this.profile = res.data;
      if (res.data?.agent) {
        this.liked = res.data.agent.has_liked || false;
      }
    } catch (err) {
      this.error =
        err.data?.detail || err.message || 'Failed to load agent profile';
    } finally {
      this.loading = false;
    }
  }

  handleShare() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      this.copied = true;
      setTimeout(() => {
        this.copied = false;
      }, 2000);
    });
  }

  async handleLike() {
    const agent = this.profile?.agent;
    if (!agent) return;
    const newLiked = !this.liked;
    this.liked = newLiked;
    try {
      const res = await apiFetch(
        `${BASE_URL}/by-slug/${agent.agent_id || agent.id}/like?is_like=${newLiked}`,
        { method: 'POST' },
      );
      // Sync local state to the real source of truth from the response.
      if (this.profile) {
        this.profile = {
          ...this.profile,
          agent: {
            ...this.profile.agent,
            like_count: res.data.like_count,
            has_liked: res.data.has_liked,
          },
        };
        this.liked = res.data.has_liked;
      }
    } catch (err) {
      console.error('Failed to sync like:', err);
      this.liked = !newLiked;
    }
  }

  render() {
    return html`
      <div
        class="h-screen w-full flex flex-col bg-blue-50/50 transition-all duration-300 ease-in-out"
      >
        <main
          class="flex flex-col items-center gap-2 w-full h-full overflow-y-auto pt-8"
        >
          ${this.renderBody()}
        </main>
      </div>
    `;
  }

  renderBody() {
    if (this.loading) {
      return html`
        <div class="flex flex-col items-center justify-center py-32 gap-3 w-full">
          ${icon('BiLoaderAlt', 32, 'w-8 h-8 text-gray-400 dark:text-secondary-text animate-spin')}
          <p class="text-gray-400 dark:text-secondary-text text-sm"
            >Loading agent profile...</p
          >
        </div>
      `;
    }

    if (this.error || !this.profile) {
      return html`
        <div class="flex flex-col items-center justify-center py-32 gap-2 w-full">
          ${icon('RiRobot2Fill', 48, 'w-12 h-12 text-gray-300 dark:text-secondary-text mx-auto')}
          <p class="text-gray-800 dark:text-primary-text font-bold"
            >Agent not found</p
          >
          <p class="text-gray-500 dark:text-secondary-text text-sm"
            >${this.error}</p
          >
        </div>
      `;
    }

    const { agent, total_messages, total_chats, recent_chats } =
      this.profile;

    const chatUrl = agent.agent_id
      ? `/agents/${agent.agent_id}`
      : `/agents/${agent.id}`;

    return html`
      ${this.renderAgentView(agent, { total_messages, total_chats, recent_chats, chatUrl })}
    `;
  }

  renderAgentView(agent, { total_messages, total_chats, recent_chats, chatUrl }) {
    return html`
      <div class="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <div class="border-b border-gray-200 dark:border-divider py-6">
          <div class="flex flex-col md:flex-row md:items-start gap-5">
            <div class="flex items-center gap-5">
              <div
                class="relative w-16 h-16 rounded-full overflow-hidden bg-gray-100 dark:bg-secondary-bg border-2 border-gray-200 dark:border-divider shrink-0"
              >
                ${agent.icon_url
                  ? html`<img
                      src="${agent.icon_url}"
                      alt="${agent.name}"
                      class="absolute inset-0 w-full h-full object-cover"
                    />`
                  : html`<div
                      class="w-full h-full flex items-center justify-center"
                    >
                      ${icon('RiRobot2Fill', 32, 'w-8 h-8 text-gray-400 dark:text-secondary-text')}
                    </div>`}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h1 class="text-2xl font-bold text-black dark:text-white">
                    ${agent.name}
                  </h1>
                  ${agent.is_published
                    ? html`<span
                        class="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-white/10 text-blue-600 dark:text-gray-300 border border-blue-100 dark:border-white/10"
                      >
                        ${icon('MdOutlineVerified', 12, 'w-3 h-3')} Public
                      </span>`
                    : nothing}
                </div>
                ${agent.description
                  ? html`<p
                      class="text-gray-500 dark:text-secondary-text text-sm mt-1 leading-relaxed max-w-xl"
                      >${agent.description}</p
                    >`
                  : nothing}
                ${(agent.owner_username || agent.owner_email)
                  ? html`<p
                      class="text-xs text-gray-400 dark:text-secondary-text mt-1.5"
                      >by
                      <span
                        class="text-gray-600 dark:text-gray-300 font-medium"
                        >${agent.owner_username ||
                        agent.owner_email.split('@')[0]}</span
                      ></p
                    >`
                  : nothing}
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button
                type="button"
                @click=${this.handleLike}
                class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-secondary-bg hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-divider text-sm transition-all"
              >
                ${this.liked
                  ? icon('IoHeart', 16, 'w-4 h-4 text-red-500')
                  : icon('IoHeartOutline', 16, 'w-4 h-4 text-gray-500 dark:text-secondary-text')}
                <span class="font-medium text-gray-700 dark:text-gray-300"
                  >${agent.like_count || 0}</span
                >
              </button>
              <button
                @click=${this.handleShare}
                title=${this.copied ? 'Copied!' : 'Share link'}
                class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-secondary-bg hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-divider text-sm transition-all"
              >
                ${icon('IoShareOutline', 16, 'w-4 h-4 text-gray-500 dark:text-secondary-text')}
                ${this.copied
                  ? html`<span
                      class="text-xs text-green-500 dark:text-green-400">Copied!</span
                    >`
                  : nothing}
              </button>
              <a
                href="${chatUrl}"
                @click=${(e) => {
                  e.preventDefault();
                  navigate(chatUrl);
                }}
                class="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-lg transition-all shadow-sm"
              >
                ${icon('IoChatbubbleEllipsesSharp', 16, 'w-4 h-4')}
                Chat
              </a>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8 mt-8">
          <div class="space-y-8">
            ${agent.skills && agent.skills.length > 0
              ? html`<section>
                  <p
                    class="text-[11px] font-bold text-gray-400 dark:text-secondary-text uppercase tracking-widest mb-3"
                    >Workflows</p
                  >
                  <div class="flex flex-wrap gap-2">
                    ${agent.skills.map(
                      (skill) => html`
                        <span
                          class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-secondary-bg border border-gray-200 dark:border-divider rounded-lg text-xs text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                        >
                          ${icon('FiZap', 12, 'w-3 h-3 text-violet-500 dark:text-violet-400')}
                          ${skill.name}
                        </span>
                      `,
                    )}
                  </div>
                </section>`
              : nothing}
            ${agent.description
              ? html`<section>
                  <p
                    class="text-[11px] font-bold text-gray-400 dark:text-secondary-text uppercase tracking-widest mb-3"
                    >About ${agent.name}</p
                  >
                  <p
                    class="text-gray-700 dark:text-gray-300 text-sm leading-relaxed"
                    >${agent.description}</p
                  >
                </section>`
              : nothing}
            ${agent.welcome_message
              ? html`<section
                  class="bg-gray-50 dark:bg-secondary-bg border border-gray-200 dark:border-divider rounded-xl p-4"
                >
                  <p
                    class="text-[11px] font-bold text-gray-400 dark:text-secondary-text uppercase tracking-widest mb-2"
                    >Greeting</p
                  >
                  <p
                    class="text-gray-600 dark:text-gray-300 text-sm italic leading-relaxed"
                    >"${agent.welcome_message}"</p
                  >
                </section>`
              : nothing}
            <section>
              <p
                class="text-[11px] font-bold text-gray-400 dark:text-secondary-text uppercase tracking-widest mb-3"
                >Details</p
              >
              <div class="space-y-2.5">
                ${this.renderDetailRow(
                  'Messages',
                  formatCount(total_messages),
                )}
                ${this.renderDetailRow('Chats', formatCount(total_chats))}
                ${this.renderDetailRow('Created', timeAgo(agent.created_at))}
                ${agent.skills && agent.skills.length > 0
                  ? this.renderDetailRow(
                      'Skills',
                      agent.skills.length.toString(),
                    )
                  : nothing}
              </div>
            </section>
          </div>
          <div class="space-y-4">
            ${this.renderRecentChats(recent_chats, chatUrl)}
            ${
              agent.initial_suggestions && agent.initial_suggestions.length > 0
                ? html`<div
                    class="bg-gray-50 dark:bg-secondary-bg border border-gray-200 dark:border-divider rounded-2xl p-4"
                  >
                    <p
                      class="text-[11px] font-bold text-gray-400 dark:text-secondary-text uppercase tracking-widest mb-3"
                      >Try asking</p
                    >
                    <div class="space-y-2">
                      ${agent.initial_suggestions
                        .slice(0, 4)
                        .map(
                          (s, i) => html`
                            <a
                              href="${chatUrl}?prompt=${encodeURIComponent(
                                s.prompt || s.label || '',
                              )}"
                              @click=${(e) => {
                                e.preventDefault();
                                navigate(
                                  `${chatUrl}?prompt=${encodeURIComponent(
                                    s.prompt || s.label || '',
                                  )}`,
                                );
                              }}
                              class="block text-sm text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200 dark:border-divider rounded-xl px-3 py-2 transition-all truncate"
                            >
                              ${s.label || s.prompt}
                            </a>
                          `,
                        )}
                    </div>
                  </div>`
                : nothing}
          </div>
        </div>
      </div>
    `;
  }

  renderRecentChats(recent_chats, chatUrl) {
    if (!recent_chats || recent_chats.length === 0) return nothing;
    return html`
      <div
        class="bg-gray-50 dark:bg-secondary-bg border border-gray-200 dark:border-divider rounded-2xl p-4"
      >
        <div class="flex items-center gap-2 mb-4">
          ${icon('FiClock', 14, 'w-3.5 h-3.5 text-gray-400 dark:text-secondary-text')}
          <p
            class="text-[11px] font-bold text-gray-400 dark:text-secondary-text uppercase tracking-widest"
            >Recent chats with this agent</p
          >
        </div>
        <div class="space-y-1">
          ${recent_chats.map(
            (chat) => html`
              <a
                href=${chat.agent_slug
                  ? `/agents/${chat.agent_slug}/${chat.id}`
                  : `/agents/${chat.agent_id}/${chat.id}`}
                @click=${(e) => {
                  e.preventDefault();
                  navigate(
                    chat.agent_slug
                      ? `/agents/${chat.agent_slug}/${chat.id}`
                      : `/agents/${chat.agent_id}/${chat.id}`,
                  );
                }}
                class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors group"
              >
                <div
                  class="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0"
                >
                  ${icon('IoChatbubbleEllipsesSharp', 16, 'w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-white transition-colors')}
                </div>
                <div class="flex-1 min-w-0">
                  <p
                    class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-black dark:group-hover:text-white transition-colors"
                    >${chat.title || 'New Chat'}</p
                  >
                  <p class="text-[11px] text-gray-400 dark:text-secondary-text">
                    ${chat.message_count}
                    msg${chat.message_count !== 1 ? 's' : ''} ·
                    ${timeAgo(chat.updated_at)}
                  </p>
                </div>
              </a>
            `,
          )}
        </div>
        <a
          href="${chatUrl}"
          @click=${(e) => {
            e.preventDefault();
            navigate(chatUrl);
          }}
          class="mt-3 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-divider text-sm text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white transition-all font-medium"
        >
          ${icon('HiPlus', 16, 'w-4 h-4')}
          New chat
        </a>
      </div>
    `;
  }

  renderDetailRow(label, value) {
    return html`
      <div class="flex items-center gap-4">
        <span
          class="text-sm text-gray-400 dark:text-secondary-text w-24 shrink-0"
          >${label}</span
        >
        <span
          class="text-sm text-gray-800 dark:text-primary-text font-medium"
          >${value}</span
        >
      </div>
    `;
  }
}

customElements.define('agent-profile', AgentProfile);
