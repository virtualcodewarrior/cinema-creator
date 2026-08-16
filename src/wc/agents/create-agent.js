import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { iconSvg } from '../../lib/icons.js';
import { navigate } from '../../lib/router.js';
import { apiFetch } from '../../lib/agents-api.js';

const BASE_URL = '/api/agents';

// Port of the CreateAgentPage wrapper (src/CreatePage.jsx) +
// components/CreateAgent.jsx from the ai-agent package. The react-hot-toast
// <Toaster> is covered by the global <app-toaster>; the useUser/usedIn
// white-label props were never passed by the Vite entry, so they're omitted.
export class AgentCreate extends BaseElement {
  static sheetKey = 'agents';

  static properties = {
    prompt: { state: true },
    loading: { state: true },
    error: { state: true },
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
    this.prompt = '';
    this.loading = false;
    this.error = null;
  }

  firstUpdated() {
    const ta = this.renderRoot.querySelector('textarea');
    if (ta) ta.focus();
  }

  async handleSubmit(e) {
    e.preventDefault();
    if (!this.prompt.trim()) return;

    this.loading = true;
    this.error = null;

    try {
      const suggestResponse = await apiFetch(`${BASE_URL}/suggest`, {
        method: 'POST',
        body: { prompt: this.prompt },
      });
      const suggestion = suggestResponse.data;
      const createPayload = {
        name: suggestion.name || 'Unnamed Agent',
        description: suggestion.description || '',
        system_prompt: suggestion.system_prompt || '',
        skill_ids: suggestion.recommended_skill_ids || [],
        welcome_message: suggestion.welcome_message || '',
        initial_suggestions: suggestion.initial_suggestions || [],
        is_published: false,
        is_template: false,
      };

      const createResponse = await apiFetch(`${BASE_URL}`, {
        method: 'POST',
        body: createPayload,
      });
      if (createResponse.status === 200 || createResponse.status === 201) {
        const createdAgent = createResponse.data;
        navigate(`/agents/edit/${createdAgent.agent_id}`);
      }
    } catch (err) {
      console.error('Agent creation failed:', err);
      this.error =
        err.data?.message ||
        err.data?.detail ||
        err.message ||
        'Failed to architect agent. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  render() {
    return html`
      <div
        class="h-screen w-full flex flex-col bg-gray-100 transition-all duration-300 ease-in-out"
      >
        <main class="flex flex-col items-center gap-2 w-full h-full overflow-y-auto pt-8">
          <div
            class="flex-1 flex flex-col gap-8 items-center w-full max-w-[95%] sm:max-w-[90%] lg:max-w-[80%] relative pb-12"
          >
            <div class="flex items-start gap-2 w-full">
              <a
                href="/agents"
                @click=${(e) => {
                  e.preventDefault();
                  navigate('/agents');
                }}
                class="p-2 hover:bg-gray-100 dark:hover:bg-secondary-bg rounded-full transition-colors group"
              >
                ${unsafeHTML(iconSvg('IoArrowBackOutline', { size: 16, className: 'w-4 h-4 text-gray-800 dark:text-primary-text group-hover:scale-110 transition-transform' }))}
              </a>
              <div class="flex flex-col gap-2 w-full">
                <h1 class="text-2xl font-bold text-black dark:text-white">
                  Prompt Any Assistant
                </h1>
                <p class="text-gray-500 dark:text-secondary-text text-sm font-medium">
                  Use this to prompt up an assistant to help you with any topic!
                </p>
              </div>
            </div>
            <form @submit=${this.handleSubmit} class="space-y-8 w-full">
              <div class="space-y-4">
                <label class="text-lg font-semibold text-black dark:text-white block">
                  What should your assistant be able to do and be knowledgeable in?
                </label>
                <div class="relative">
                  <textarea
                    .value=${this.prompt}
                    @input=${(e) => (this.prompt = e.target.value)}
                    placeholder="Ex: A helpful travel agent that finds the best destinations in Italy..."
                    class="w-full bg-white dark:bg-secondary-bg border border-gray-200 dark:border-divider rounded-xl p-4 text-gray-900 dark:text-primary-text text-sm focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-primary/10 focus:border-gray-400 dark:focus:border-primary transition-all resize-none min-h-[140px] shadow-sm"
                    ?disabled=${this.loading}
                  >
                  </textarea>
                </div>
              </div>

              <div class="flex items-center gap-6"></div>

              <div class="flex flex-col gap-4">
                <button
                  type="submit"
                  ?disabled=${this.loading || !this.prompt.trim()}
                  class="w-full py-3 bg-blue-500 dark:bg-primary hover:bg-blue-600 dark:hover:bg-primary/90 disabled:bg-gray-200 dark:disabled:bg-divider disabled:text-gray-400 dark:disabled:text-secondary-text disabled:cursor-not-allowed text-white text-base font-semibold rounded-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  ${this.loading
                    ? html`
                        ${unsafeHTML(iconSvg('BiLoaderAlt', { size: 24, className: 'w-6 h-6 animate-spin' }))}
                        <span>Creating agent...</span>
                      `
                    : html` Create agent `}
                </button>
                ${this.loading
                  ? html`
                      <p class="text-center text-gray-400 dark:text-secondary-text text-sm animate-pulse">
                        Analyzing prompt and building capabilities...
                      </p>
                    `
                  : nothing}
                ${this.error
                  ? html`
                      <div
                        class="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-3 animate-in fade-in duration-300"
                      >
                        <svg
                          class="w-5 h-5 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          ></path>
                        </svg>
                        ${this.error}
                      </div>
                    `
                  : nothing}
              </div>
            </form>
          </div>
        </main>
      </div>
    `;
  }
}

customElements.define('agent-create', AgentCreate);
