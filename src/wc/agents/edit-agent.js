import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { iconSvg } from '../../lib/icons.js';
import { navigate } from '../../lib/router.js';
import { apiFetch, xhrUpload } from '../../lib/agents-api.js';
import toast from '../../lib/toast.js';
import { themes } from './themes.js';

const BASE_URL = '/api/agents';
const icon = (name, size = 16, className = '') => unsafeHTML(iconSvg(name, { size, className }));

// Port of the EditAgentPage wrapper (src/EditPage.jsx) +
// components/EditAgent.jsx from the ai-agent package. next/navigation params
// -> agentId property (set by the route handler); next/link -> navigate();
// react-hot-toast -> lib/toast.js; axios upload progress -> xhrUpload.
export class AgentEdit extends BaseElement {
  static sheetKey = 'agents';

  static properties = {
    agentId: { state: true },
    formData: { state: true },
    availableSkills: { state: true },
    loading: { state: true },
    saving: { state: true },
    uploading: { state: true },
    uploadProgress: { state: true },
    searchTerm: { state: true },
    error: { state: true },
    initialSkills: { state: true },
    realignedPrompt: { state: true },
    isRealigning: { state: true },
    showRealignModal: { state: true },
    generatingIcon: { state: true },
    showIconPromptModal: { state: true },
    showIconSelectionModal: { state: true },
    iconPrompt: { state: true },
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
    this.formData = {
      name: '',
      description: '',
      system_prompt: '',
      icon_url: '',
      skill_ids: [],
      theme: 'cosmic',
      is_published: false,
      is_template: false,
    };
    this.availableSkills = [];
    this.loading = true;
    this.saving = false;
    this.uploading = false;
    this.uploadProgress = 0;
    this.searchTerm = '';
    this.error = null;
    this.initialSkills = [];
    this.realignedPrompt = '';
    this.isRealigning = false;
    this.showRealignModal = false;
    this.generatingIcon = false;
    this.showIconPromptModal = false;
    this.showIconSelectionModal = false;
    this.iconPrompt = '';
    this._fileInput = null;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.agentId) this.fetchData();
  }

  firstUpdated() {
    this._fileInput = this.renderRoot.querySelector('input[type=file]');
  }

  async fetchData() {
    try {
      this.loading = true;
      this.error = null;

      const [agentRes, skillsRes] = await Promise.all([
        apiFetch(`${BASE_URL}/by-slug/${this.agentId}`),
        apiFetch(`${BASE_URL}/skills`),
      ]);

      const agent = agentRes.data;
      if (!agent.is_owner) {
        this.error = 'You are not authorized to edit this agent.';
        this.loading = false;
        return;
      }
      this.formData = {
        name: agent.name,
        description: agent.description || '',
        system_prompt: agent.system_prompt,
        icon_url: agent.icon_url || '',
        skill_ids: agent.skills.map((s) => s.id),
        theme: agent.theme || 'cosmic',
        is_published: agent.is_published || false,
        is_template: agent.is_template || false,
      };
      this.initialSkills = agent.skills.map((s) => s.id);
      this.availableSkills = skillsRes.data;
    } catch (err) {
      console.error('Error fetching data:', err);
      this.error = err.data?.message || err.data?.detail || 'Failed to load agent details.';
    } finally {
      this.loading = false;
    }
  }

  setField(name, value) {
    this.formData = { ...this.formData, [name]: value };
  }

  handleSkillToggle(skillId) {
    const selected = this.formData.skill_ids.includes(skillId);
    const skill_ids = selected
      ? this.formData.skill_ids.filter((id) => id !== skillId)
      : [...this.formData.skill_ids, skillId];
    this.formData = { ...this.formData, skill_ids };
  }

  async handleDelete() {
    if (!window.confirm('Are you sure you want to delete this agent? This action cannot be undone.')) {
      return;
    }

    try {
      this.saving = true;
      await apiFetch(`${BASE_URL}/by-slug/${this.agentId}`, { method: 'DELETE' });
      toast.success('Agent deleted successfully');
      navigate('/agents');
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete agent');
      this.error = err.data?.detail || 'Delete failed';
    } finally {
      this.saving = false;
    }
  }

  handleShare() {
    const url = `${window.location.origin}/agents/${this.agentId}`;
    navigator.clipboard.writeText(url);
    toast.success('Chat link copied to clipboard!');
  }

  async handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    try {
      this.uploading = true;
      this.uploadProgress = 0;
      const { data: uploadParams } = await apiFetch(
        `/api/app/get_file_upload_url?filename=${encodeURIComponent(file.name)}`,
      );

      const { url, fields } = uploadParams;
      const uploadData = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        uploadData.append(key, value);
      });
      uploadData.append('file', file);

      await xhrUpload(url, uploadData, (p) => (this.uploadProgress = p));
      const uploadedUrl = `https://cdn.muapi.ai/${fields.key}`;
      this.formData = { ...this.formData, icon_url: uploadedUrl };
      toast.success('Profile image updated');
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error('Failed to upload image');
    } finally {
      this.uploading = false;
      this.uploadProgress = 0;
    }
  }

  async handleGenerateIcon(customPrompt) {
    if (!this.formData.name && !customPrompt) {
      toast.error('Please enter an agent name first');
      return;
    }

    try {
      this.generatingIcon = true;
      const prompt =
        customPrompt ||
        `A professional, clean profile icon for an AI agent named "${this.formData.name}". Description: ${this.formData.description || 'An AI assistant'}. Minimalist, high-quality, circular composition.`;

      const response = await apiFetch('/api/api/v1/flux-schnell-image', {
        method: 'POST',
        body: { prompt, width: 1024, height: 1024, num_images: 1, sync: true },
      });

      if (response.data && response.data.outputs && response.data.outputs.length > 0) {
        const generatedUrl = response.data.outputs[0];
        this.formData = { ...this.formData, icon_url: generatedUrl };
        this.showIconPromptModal = false;
        toast.success('AI icon generated!');
      } else {
        throw new Error('No image generated');
      }
    } catch (err) {
      console.error('Icon generation failed:', err);
      toast.error(err.data?.detail || 'Failed to generate AI icon');
    } finally {
      this.generatingIcon = false;
    }
  }

  async handleRealign() {
    try {
      this.isRealigning = true;
      const res = await apiFetch(`${BASE_URL}/by-slug/${this.agentId}/preview-realign`, {
        method: 'POST',
        body: {
          current_prompt: this.formData.system_prompt,
          new_skill_ids: this.formData.skill_ids,
        },
      });
      this.realignedPrompt = res.data.proposed_prompt;
      this.showRealignModal = true;
      toast.success('Prompt realigned! Please review.');
    } catch (err) {
      console.error('Realign failed:', err);
      toast.error('Failed to realign prompt');
    } finally {
      this.isRealigning = false;
    }
  }

  applyRealignedPrompt() {
    this.formData = { ...this.formData, system_prompt: this.realignedPrompt };
    this.showRealignModal = false;
    toast.success('New instructions applied!');
  }

  async handleSubmit(e) {
    e.preventDefault();
    try {
      this.saving = true;
      this.error = null;

      await apiFetch(`${BASE_URL}/by-slug/${this.agentId}`, {
        method: 'PUT',
        body: this.formData,
      });

      toast.success('Agent profile updated successfully!');
      setTimeout(() => {
        navigate('/agents');
      }, 1500);
    } catch (err) {
      console.error('Error updating agent:', err);
      this.error = err.data?.message || err.data?.detail || 'Failed to update agent.';
      toast.error('Failed to save changes');
    } finally {
      this.saving = false;
    }
  }

  skillsChanged() {
    const a = [...this.formData.skill_ids].sort();
    const b = [...this.initialSkills].sort();
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  render() {
    const previewTheme = themes[this.formData.theme] || themes.cosmic;

    if (this.loading) {
      return html`
        <div class="h-dvh w-full flex flex-col bg-blue-50/50 transition-all duration-300 ease-in-out">
          <main class="flex flex-col items-center gap-2 w-full h-full overflow-y-auto pt-8">
            <main class="flex-1 flex items-center justify-center">
              <div class="flex flex-col items-center gap-2">
                ${icon('BiLoaderAlt', 48, 'w-12 h-12 text-blue-600 animate-spin')}
                <p class="text-gray-500 font-medium animate-pulse">Loading Identity Data...</p>
              </div>
            </main>
          </main>
        </div>
      `;
    }

    if (this.error) {
      return html`
        <div class="h-dvh w-full flex flex-col bg-blue-50/50 transition-all duration-300 ease-in-out">
          <main class="flex flex-col items-center gap-2 w-full h-full overflow-y-auto pt-8">
            <main
              class="flex-1 flex flex-col items-center justify-center h-full gap-4 text-center p-8"
            >
              <div
                class="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-2"
              >
                ${icon('IoCloseOutline', 40, 'w-10 h-10 text-red-500 dark:text-red-400')}
              </div>
              <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Access Denied</h2>
              <p class="text-gray-600 dark:text-secondary-text max-w-md font-medium">
                ${this.error}
              </p>
              <a
                href="/agents"
                @click=${(e) => {
                  e.preventDefault();
                  navigate('/agents');
                }}
                class="mt-4 px-8 py-3 bg-gray-900 dark:bg-primary text-white font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-primary/90 transition-all shadow-lg active:scale-95"
              >
                Return to My Agents
              </a>
            </main>
          </main>
        </div>
      `;
    }

    return html`
      <div class="h-dvh w-full flex flex-col bg-blue-50/50 transition-all duration-300 ease-in-out">
        <main class="flex flex-col items-center gap-2 w-full h-full overflow-y-auto pt-8">
          <div
            class="flex-1 flex flex-col gap-8 items-center w-full max-w-[95%] sm:max-w-[90%] lg:max-w-[80%] relative"
          >
            <div
              class="flex items-center justify-between pb-2 border-b border-gray-50 dark:border-divider w-full"
            >
              <a
                href="/agents"
                @click=${(e) => {
                  e.preventDefault();
                  navigate('/agents');
                }}
                class="flex items-center gap-2 text-gray-500 hover:text-gray-900 dark:text-secondary-text dark:hover:text-primary-text transition-colors text-sm font-medium"
              >
                ${icon('IoChevronBack')}
                Back
              </a>
              <div class="flex items-center gap-3">
                <a
                  href="${window.location.origin}/agents/${this.agentId}"
                  @click=${(e) => {
                    e.preventDefault();
                    navigate(`/agents/${this.agentId}`);
                  }}
                  class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm font-bold text-white transition-all active:scale-95 shadow-sm"
                >
                  ${icon('IoChatbubblesOutline')}
                  Chat
                </a>
                <button
                  type="button"
                  @click=${this.handleShare}
                  class="flex items-center gap-2 px-4 py-2 border border-gray-100 dark:border-divider rounded-xl text-sm font-bold text-gray-600 dark:text-primary-text hover:bg-gray-50 dark:hover:bg-secondary-bg transition-all active:scale-95"
                >
                  ${icon('IoShareOutline')}
                </button>
                <button
                  type="button"
                  @click=${this.handleDelete}
                  ?disabled=${this.saving}
                  class="flex items-center gap-2 px-4 py-2 border border-red-50 dark:border-red-900/30 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all active:scale-95 disabled:opacity-50"
                >
                  ${icon('IoTrashOutline')}
                </button>
                <a
                  href="/docs/agents"
                  target="_blank"
                  class="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-secondary-bg border border-gray-100 dark:border-divider rounded-lg text-xs font-bold text-blue-600 dark:text-primary hover:bg-blue-50 dark:hover:bg-primary-bg transition-all active:scale-95 shadow-sm"
                >
                  Docs
                </a>
              </div>
            </div>
            <div class="flex flex-col items-center gap-2 w-full">
              <form id="edit-agent-form" @submit=${this.handleSubmit} class="flex flex-col gap-12 w-full">
                <div class="flex flex-col md:flex-row md:items-center gap-8 w-full">
                  <div class="flex items-center gap-8 w-full">
                    <div class="relative">
                      <div
                        @click=${() => (this.showIconSelectionModal = true)}
                        class="w-28 h-28 rounded-full bg-gray-100 dark:bg-secondary-bg overflow-hidden ring-4 ring-white dark:ring-primary-bg shadow-sm border border-gray-100 dark:border-divider cursor-pointer group transition-all hover:ring-blue-500/30"
                      >
                        ${this.formData.icon_url
                          ? html`
                              <img
                                src="${this.formData.icon_url}"
                                alt="Profile"
                                referrerPolicy="no-referrer"
                                class="w-full h-full object-cover transition-transform group-hover:scale-110"
                              />
                            `
                          : html`
                              <div
                                class="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-primary-bg transition-colors group-hover:bg-gray-100 dark:group-hover:bg-secondary-bg"
                              >
                                ${icon('RiRobot2Fill', 48, 'w-12 h-12 text-gray-300 dark:text-divider group-hover:text-blue-500 transition-colors')}
                              </div>
                            `}
                        <div
                          class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full"
                        >
                          ${icon('IoPencilOutline', 24, 'w-6 h-6 text-white')}
                        </div>
                        ${this.uploading
                          ? html`
                              <div
                                class="absolute inset-0 bg-white/95 dark:bg-primary-bg/95 flex items-center justify-center rounded-full z-10 backdrop-blur-[1px]"
                              >
                                <div class="relative w-16 h-16">
                                  <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                    <circle
                                      cx="18"
                                      cy="18"
                                      r="16"
                                      fill="none"
                                      class="stroke-gray-100 dark:stroke-divider"
                                      stroke-width="3.5"
                                    ></circle>
                                    <circle
                                      cx="18"
                                      cy="18"
                                      r="16"
                                      fill="none"
                                      class="stroke-black dark:stroke-primary transition-all duration-500 ease-out"
                                      stroke-width="3.5"
                                      stroke-dasharray="100.53"
                                      stroke-dashoffset="${100.53 * (1 - this.uploadProgress / 100)}"
                                      stroke-linecap="round"
                                    ></circle>
                                  </svg>
                                  <div class="absolute inset-0 flex items-center justify-center">
                                    <span class="text-xs font-bold text-gray-900 dark:text-white">
                                      ${this.uploadProgress}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            `
                          : nothing}
                      </div>
                      <input
                        type="file"
                        @change=${this.handleFileUpload}
                        class="hidden"
                        accept="image/*"
                      />
                    </div>
                    <div class="flex flex-col gap-2 w-full">
                      <div class="flex items-center gap-2 group/title w-full">
                        <input
                          type="text"
                          name="name"
                          .value=${this.formData.name}
                          @input=${(e) => this.setField('name', e.target.value)}
                          class="text-3xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight truncate bg-transparent border-none p-0 focus:ring-0 w-full"
                          placeholder="Unnamed Agent"
                          required
                        />
                        ${icon(
                          'IoPencilOutline',
                          20,
                          'w-5 h-5 text-gray-300 dark:text-divider opacity-0 group-hover/title:opacity-100 transition-opacity',
                        )}
                      </div>
                      <div class="flex items-center gap-3 mt-1 mr-auto"></div>
                    </div>
                  </div>
                  <div class="flex flex-col gap-4">
                    <button
                      type="submit"
                      ?disabled=${this.saving}
                      class="px-6 py-3 whitespace-nowrap bg-black dark:bg-primary hover:bg-gray-800 dark:hover:bg-primary/90 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg text-sm active:scale-95"
                    >
                      ${this.saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <div
                      class="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-secondary-bg rounded-2xl border border-gray-200 dark:border-divider w-fit"
                    >
                      <div
                        @click=${() =>
                          (this.formData = {
                            ...this.formData,
                            is_published: !this.formData.is_published,
                          })}
                        class="flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-300 ${
                      this.formData.is_published
                        ? 'bg-white dark:bg-primary-bg shadow-sm text-blue-600 dark:text-primary'
                        : 'text-gray-400 hover:text-gray-600 dark:text-secondary-text dark:hover:text-primary-text'
                    }"
                      >
                        <div
                          class="w-2 h-2 rounded-full transition-all duration-500 ${
                            this.formData.is_published
                              ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                              : 'bg-gray-300 dark:bg-gray-600'
                          }"
                        ></div>
                        <span class="text-xs font-bold tracking-wider">Publish</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="flex flex-col gap-12">
                  <div class="flex flex-col gap-6">
                    <div class="flex flex-col gap-2">
                      <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                        Behavior &amp; Identity
                      </h2>
                      <p class="text-sm text-gray-500 dark:text-secondary-text font-medium">
                        Shape how your agent thinks, responds, and describes itself
                      </p>
                    </div>
                    <div class="flex flex-col gap-6">
                      <div class="flex flex-col gap-2">
                        <div
                          class="flex items-center justify-between border-l-4 border-black dark:border-primary pl-3 ml-1 mb-1"
                        >
                          <label class="text-base font-bold text-gray-900 dark:text-white"
                            >Instructions</label
                          >
                          <button
                            type="button"
                            @click=${this.handleRealign}
                            ?disabled=${this.isRealigning || !this.skillsChanged()}
                            class="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-100 disabled:text-gray-400 text-white text-xs font-bold rounded-lg transition-all active:scale-95 shadow-sm"
                            title=${this.skillsChanged()
                              ? 'Sync instructions with current skills'
                              : 'No changes to skills'}
                          >
                            ${this.isRealigning
                              ? icon('BiLoaderAlt', 16, 'animate-spin')
                              : html` ✨ Realign with Skills `}
                          </button>
                        </div>
                        <div class="relative group">
                          <textarea
                            name="system_prompt"
                            .value=${this.formData.system_prompt}
                            @input=${(e) => this.setField('system_prompt', e.target.value)}
                            class="w-full bg-white dark:bg-secondary-bg border border-gray-100 dark:border-divider rounded-2xl px-6 py-6 text-gray-800 dark:text-primary-text text-sm focus:ring-4 focus:ring-black/5 dark:focus:ring-primary/5 focus:border-black dark:focus:border-primary transition-all outline-none min-h-[200px] leading-relaxed shadow-sm font-medium"
                            placeholder="Define how your agent thinks and communicates..."
                            required
                          >
                          </textarea>
                          <p class="text-xs text-gray-400 dark:text-secondary-text font-medium ml-1">
                            Define how your agent thinks and communicates. Start with "You are..."
                            and include specific examples.
                          </p>
                        </div>
                      </div>
                      <div class="flex flex-col gap-2">
                        <label
                          class="text-base font-bold text-gray-900 dark:text-white border-l-4 border-black dark:border-primary pl-3 ml-1"
                          >Description</label
                        >
                        <textarea
                          name="description"
                          .value=${this.formData.description}
                          @input=${(e) => this.setField('description', e.target.value)}
                          class="w-full bg-white dark:bg-secondary-bg border border-gray-100 dark:border-divider rounded-2xl px-6 py-4 text-gray-800 dark:text-primary-text text-sm focus:ring-4 focus:ring-black/5 dark:focus:ring-primary/5 focus:border-black dark:focus:border-primary transition-all outline-none min-h-[100px] leading-relaxed shadow-sm font-medium"
                          placeholder="Add a description that describes your agent to others..."
                        >
                        </textarea>
                        <p class="text-xs text-gray-400 dark:text-secondary-text font-medium ml-1">
                          This will be visible to users when they discover your agent.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div
                    class="flex flex-col gap-6 border-t border-gray-50 dark:border-divider pt-12"
                  >
                    <div class="flex flex-col gap-2">
                      <h2
                        class="text-base font-bold text-gray-900 dark:text-white border-l-4 border-black dark:border-primary pl-3 ml-1"
                        >Theme &amp; Appearance</h2
                      >
                      <p class="text-sm text-gray-500 dark:text-secondary-text font-medium ml-1">
                        Customize how your agent looks in the chat interface
                      </p>
                    </div>

                    <div
                      class="bg-white dark:bg-secondary-bg shadow-lg rounded-3xl p-8 border border-gray-100 dark:border-divider flex flex-col lg:flex-row gap-8"
                    >
                      <!-- Theme Selection -->
                      <div class="flex-1 flex flex-col gap-4">
                        <h4
                          class="text-xs text-gray-400 dark:text-secondary-text font-bold uppercase tracking-wider ml-1"
                          >Select Theme</h4
                        >
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          ${Object.values(themes).map(
                            (theme) => html`
                              <button
                                type="button"
                                @click=${() =>
                                  (this.formData = { ...this.formData, theme: theme.id })}
                                class="group relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                                  this.formData.theme === theme.id
                                    ? 'border-black dark:border-primary bg-gray-50 dark:bg-primary-bg shadow-md scale-[1.02]'
                                    : 'border-gray-100 dark:border-divider hover:border-gray-200 dark:hover:border-primary bg-white dark:bg-primary-bg/50'
                                }"
                              >
                                <div
                                  class="w-full aspect-video rounded-xl shadow-inner border border-black/5 flex items-center justify-center relative overflow-hidden"
                                  style="background: ${theme.colors.background}"
                                >
                                  <div class="flex flex-col gap-1 w-[60%]">
                                    <div
                                      class="h-1.5 w-[80%] rounded-full opacity-40"
                                      style="background: ${theme.colors.foreground}"
                                    ></div>
                                    <div
                                      class="h-1.5 w-[50%] rounded-full opacity-40 ml-auto"
                                      style="background: ${theme.colors.userBubble}"
                                    ></div>
                                  </div>
                                </div>
                                <span
                                  class="text-xs font-bold transition-colors ${
                                    this.formData.theme === theme.id
                                      ? 'text-black dark:text-white'
                                      : 'text-gray-500 dark:text-secondary-text group-hover:text-gray-700 dark:group-hover:text-primary-text'
                                  }"
                                >
                                  ${theme.name}
                                </span>
                                ${this.formData.theme === theme.id
                                  ? html`
                                      <div
                                        class="absolute -top-2 -right-2 w-5 h-5 bg-black dark:bg-primary text-white rounded-full flex items-center justify-center shadow-lg"
                                      >
                                        <svg
                                          class="w-3 h-3"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="3"
                                            d="M5 13l4 4L19 7"
                                          ></path>
                                        </svg>
                                      </div>
                                    `
                                  : nothing}
                              </button>
                            `,
                          )}
                        </div>
                      </div>
                      <div class="flex-1 flex flex-col gap-4">
                        <h4
                          class="text-xs text-gray-400 dark:text-secondary-text font-bold uppercase tracking-wider ml-1"
                          >Chat Preview</h4
                        >
                        <div
                          class="w-full h-[300px] rounded-3xl overflow-hidden shadow-2xl border border-gray-100 dark:border-divider relative"
                          style="background: ${previewTheme.colors.background}; color: ${previewTheme.colors.foreground}"
                        >
                          <div
                            class="px-4 py-3 flex items-center gap-2 border-b"
                            style="background: ${previewTheme.colors.headerBg}; border-color: ${previewTheme.colors.border}"
                          >
                            <div class="w-8 h-8 rounded-full bg-gray-400 overflow-hidden">
                              ${this.formData.icon_url
                                ? html`
                                    <img
                                      src="${this.formData.icon_url}"
                                      referrerPolicy="no-referrer"
                                      class="w-full h-full object-cover"
                                    />
                                  `
                                : icon('RiRobot2Fill', 32, 'w-full h-full p-1.5 text-white/50')}
                            </div>
                            <div class="flex flex-col">
                              <span class="text-xs font-bold truncate"
                                >${this.formData.name || 'Agent Name'}</span
                              >
                              <span class="text-[10px] opacity-60">Online</span>
                            </div>
                          </div>
                          <div class="p-4 flex flex-col gap-4 h-[180px] overflow-y-auto">
                            <div class="flex flex-col items-end gap-1 max-w-[85%] ml-auto">
                              <div
                                class="px-3 py-2 rounded-2xl text-xs font-medium shadow-sm"
                                style="background: ${previewTheme.colors.userBubble}; color: ${previewTheme.colors.userText}"
                              >
                                Hi! How can you help me today?
                              </div>
                            </div>
                            <div class="flex flex-col items-start gap-1 max-w-[85%]">
                              <div
                                class="px-3 py-2 rounded-2xl text-xs font-medium border shadow-sm"
                                style="background: ${previewTheme.colors.agentBubble}; color: ${previewTheme.colors.agentText}; border-color: ${previewTheme.colors.border}"
                              >
                                I can help you with tasks, answer questions, and much more using
                                ${this.formData.skill_ids.length} configured skills!
                              </div>
                            </div>
                          </div>
                          <div class="absolute bottom-0 w-full p-4">
                            <div
                              class="h-10 rounded-xl flex items-center px-4 gap-2 border shadow-inner"
                              style="background: ${previewTheme.colors.inputBg}; border-color: ${previewTheme.colors.border}"
                            >
                              <span class="text-xs opacity-30 flex-1">Type a message...</span>
                              <div
                                class="w-6 h-6 rounded-lg flex items-center justify-center"
                                style="background: ${previewTheme.colors.accent}"
                              >
                                <div
                                  class="w-1.5 h-1.5 rounded-full"
                                  style="background: ${previewTheme.colors.accentText}"
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p class="text-xs text-gray-400 dark:text-secondary-text font-medium ml-1">
                      This theme will be automatically applied to the chat interface for all users.
                    </p>
                  </div>

                  <div
                    class="flex flex-col gap-6 border-t border-gray-50 dark:border-divider pt-12"
                  >
                    <h2
                      class="text-base font-bold text-gray-900 dark:text-white border-l-4 border-black dark:border-primary pl-3 ml-1"
                      >Capabilities</h2
                    >
                    <div
                      class="bg-white dark:bg-secondary-bg shadow-lg rounded-3xl p-8 border border-gray-100 dark:border-divider flex flex-col gap-4"
                    >
                      <div class="relative">
                        <input
                          type="text"
                          placeholder="Type to search and add skills (e.g. image generation, web search)..."
                          .value=${this.searchTerm}
                          @input=${(e) => (this.searchTerm = e.target.value)}
                          class="w-full bg-white dark:bg-primary-bg border border-gray-100 dark:border-divider rounded-xl px-5 py-3.5 text-sm dark:text-white focus:ring-4 focus:ring-black/5 dark:focus:ring-primary/5 focus:border-black dark:focus:border-primary transition-all outline-none shadow-sm"
                        />
                      </div>
                      <div class="flex flex-col gap-4">
                        <h4 class="text-xs text-gray-400 dark:text-secondary-text ml-1">
                          Active Agent Skills (${this.formData.skill_ids.length})
                        </h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                          ${this.formData.skill_ids.length > 0
                            ? this.formData.skill_ids.map((id) => {
                                const skill = this.availableSkills.find((s) => s.id === id);
                                if (!skill) return nothing;
                                return html`
                                  <button
                                    type="button"
                                    @click=${() => this.handleSkillToggle(skill.id)}
                                    class="relative p-4 flex items-center justify-between rounded-2xl bg-white dark:bg-primary-bg border border-gray-100 dark:border-divider shadow-sm transition-all hover:border-black dark:hover:border-primary group"
                                  >
                                    <div class="flex flex-col text-left">
                                      <span
                                        title="${skill.name}"
                                        class="text-base font-bold text-gray-900 dark:text-white line-clamp-1"
                                      >
                                        ${skill.name}
                                      </span>
                                      <span
                                        title="${skill.description}"
                                        class="text-xs text-gray-400 dark:text-secondary-text line-clamp-2"
                                      >
                                        ${skill.description}
                                      </span>
                                    </div>
                                    ${icon(
                                      'FaRegTrashCan',
                                      18,
                                      'absolute right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 ease-in-out bg-white dark:bg-primary-bg text-red-500',
                                    )}
                                  </button>
                                `;
                              })
                            : html`
                                <div
                                  class="col-span-full p-12 rounded-2xl border border-dashed border-gray-200 dark:border-divider text-center bg-white/50 dark:bg-primary-bg/50"
                                >
                                  <p class="text-sm text-gray-400 dark:text-secondary-text">
                                    No skills configured yet
                                  </p>
                                </div>
                              `}
                        </div>
                        <div class="border-t border-gray-200/50 dark:border-divider pt-4">
                          <h4
                            class="text-xs text-gray-400 dark:text-secondary-text ml-1 mb-2"
                            >Available in Registry</h4
                          >
                          <div
                            class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar"
                          >
                            ${this.availableSkills.filter(
                              (skill) =>
                                !this.formData.skill_ids.includes(skill.id) &&
                                (skill.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
                                  skill.id.toLowerCase().includes(this.searchTerm.toLowerCase())),
                            ).map(
                              (skill) => html`
                                <button
                                  type="button"
                                  @click=${() => {
                                    this.handleSkillToggle(skill.id);
                                    this.searchTerm = '';
                                  }}
                                  class="p-4 flex items-center justify-between rounded-2xl border border-gray-100 dark:border-divider bg-white dark:bg-primary-bg hover:border-black dark:hover:border-primary transition-all shadow-sm hover:shadow-md group"
                                >
                                  <div class="flex flex-col text-left">
                                    <span
                                      title="${skill.name}"
                                      class="text-base font-bold text-gray-900 dark:text-white line-clamp-1"
                                    >
                                      ${skill.name}
                                    </span>
                                    <span
                                      title="${skill.description}"
                                      class="text-xs text-gray-400 dark:text-secondary-text line-clamp-2"
                                    >
                                      ${skill.description}
                                    </span>
                                  </div>
                                  <span
                                    class="text-lg text-white bg-black dark:bg-primary rounded-full p-0.5 w-5 h-5 flex items-center justify-center flex-shrink-0"
                                    >+</span
                                  >
                                </button>
                              `,
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <p class="text-xs text-gray-400 dark:text-secondary-text font-medium ml-1">
                      Manage tools and skills your agent can use to perform tasks
                    </p>
                  </div>
                </div>
                ${this.error
                  ? html`
                      <div
                        class="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-3 animate-shake"
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
                        <span class="font-medium">${this.error}</span>
                      </div>
                    `
                  : nothing}
              </form>
            </div>
            ${this.showRealignModal
              ? html`
                  <div
                    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
                  >
                    <div
                      class="bg-white dark:bg-secondary-bg rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200"
                    >
                      <div
                        class="px-8 py-6 border-b border-gray-100 dark:border-divider flex items-center justify-between bg-violet-50/50 dark:bg-violet-900/10"
                      >
                        <div class="flex items-center gap-3">
                          <div
                            class="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-200 dark:shadow-none"
                          >
                            ${icon('RiRobot2Fill', 24, 'w-6 h-6')}
                          </div>
                          <div>
                            <h3 class="text-xl font-bold text-gray-900 dark:text-white">
                              Review Brain Realignment
                            </h3>
                            <p class="text-xs text-gray-500 dark:text-secondary-text font-medium">
                              The AI has refactored your instructions to match your new skills.
                            </p>
                          </div>
                        </div>
                        <button
                          @click=${() => (this.showRealignModal = false)}
                          class="p-2 hover:bg-white dark:hover:bg-primary-bg rounded-full transition-colors text-gray-400 dark:text-secondary-text hover:text-gray-900 dark:hover:text-white"
                        >
                          ${icon('MdClose', 24, 'w-6 h-6')}
                        </button>
                      </div>

                      <div
                        class="flex-1 overflow-y-auto p-8 flex flex-col md:flex-row gap-6 custom-scrollbar"
                      >
                        <div class="flex-1 flex flex-col gap-3">
                          <label
                            class="text-xs font-bold text-gray-400 dark:text-secondary-text uppercase tracking-wider ml-1"
                            >Current Instructions</label
                          >
                          <div
                            class="flex-1 p-5 bg-gray-50 dark:bg-primary-bg border border-gray-100 dark:border-divider rounded-2xl text-sm text-gray-600 dark:text-secondary-text font-medium whitespace-pre-wrap overflow-y-auto max-h-[400px]"
                          >
                            ${this.formData.system_prompt}
                          </div>
                        </div>
                        <div
                          class="hidden md:flex items-center justify-center text-violet-300 dark:text-violet-500"
                        >
                          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M13 5l7 7-7 7M5 5l7 7-7 7"
                            ></path>
                          </svg>
                        </div>
                        <div class="flex-1 flex flex-col gap-3">
                          <label
                            class="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider ml-1"
                            >Proposed Instructions</label
                          >
                          <textarea
                            .value=${this.realignedPrompt}
                            @input=${(e) => (this.realignedPrompt = e.target.value)}
                            class="flex-1 p-5 bg-violet-50/30 dark:bg-violet-900/10 border-2 border-violet-100 dark:border-violet-800/50 rounded-2xl text-sm text-gray-800 dark:text-primary-text font-medium leading-relaxed focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 outline-none transition-all resize-none min-h-[400px]"
                          >
                          </textarea>
                        </div>
                      </div>

                      <div
                        class="px-8 py-6 bg-gray-50 dark:bg-primary-bg border-t border-gray-100 dark:border-divider flex items-center justify-end gap-3"
                      >
                        <button
                          @click=${() => (this.showRealignModal = false)}
                          class="px-6 py-2.5 text-sm font-bold text-gray-600 dark:text-secondary-text hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                          Discard Changes
                        </button>
                        <button
                          @click=${this.applyRealignedPrompt}
                          class="px-8 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-violet-200 dark:shadow-none active:scale-95"
                        >
                          Accept &amp; Apply
                        </button>
                      </div>
                    </div>
                  </div>
                `
              : nothing}
            ${this.showIconPromptModal
              ? html`
                  <div
                    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                  >
                    <div
                      class="bg-white dark:bg-secondary-bg w-full max-w-lg rounded-3xl shadow-2xl border border-gray-100 dark:border-divider overflow-hidden transform animate-in zoom-in-95 duration-200"
                    >
                      <div
                        class="p-6 border-b border-gray-100 dark:border-divider flex items-center justify-between bg-gray-50/50 dark:bg-primary-bg/50"
                      >
                        <h3 class="text-xl font-bold dark:text-white flex items-center gap-2">
                          <span class="text-2xl">✨</span> Customize AI Icon Prompt
                        </h3>
                        <button
                          @click=${() => (this.showIconPromptModal = false)}
                          class="p-2 hover:bg-white dark:hover:bg-secondary-bg rounded-full transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-primary-text"
                        >
                          ${icon('IoCloseOutline', 24, 'w-6 h-6')}
                        </button>
                      </div>

                      <div class="p-8">
                        <p class="text-sm text-gray-500 dark:text-secondary-text mb-6">
                          Tell the AI what kind of icon you want. You can describe style, colors, and
                          specific elements.
                        </p>

                        <div class="space-y-4">
                          <textarea
                            .value=${this.iconPrompt}
                            @input=${(e) => (this.iconPrompt = e.target.value)}
                            placeholder="Describe your agent's icon..."
                            class="w-full h-40 p-5 bg-gray-50 dark:bg-primary-bg border border-gray-200 dark:border-divider rounded-2xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none dark:text-white placeholder:text-gray-400"
                          >
                          </textarea>

                          <div class="flex gap-3 pt-4">
                            <button
                              @click=${() => (this.showIconPromptModal = false)}
                              class="flex-1 px-6 py-4 border border-gray-200 dark:border-divider rounded-2xl text-sm font-bold text-gray-600 dark:text-primary-text hover:bg-gray-50 dark:hover:bg-primary-bg transition-all active:scale-[0.98]"
                            >
                              Cancel
                            </button>
                            <button
                              @click=${() => this.handleGenerateIcon(this.iconPrompt)}
                              ?disabled=${this.generatingIcon || !this.iconPrompt.trim()}
                              class="flex-[2] px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                              ${this.generatingIcon
                                ? html`
                                    ${icon('BiLoaderAlt', 20, 'w-5 h-5 animate-spin')} Generating...
                                  `
                                : html`
                                    <span class="text-lg">✨</span> Generate Icon
                                  `}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                `
              : nothing}
            ${this.showIconSelectionModal
              ? html`
                  <div
                    class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                  >
                    <div
                      class="bg-white dark:bg-secondary-bg w-full max-w-md rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-divider overflow-hidden transform animate-in zoom-in-95 duration-200"
                    >
                      <div
                        class="p-8 border-b border-gray-50 dark:border-divider flex items-center justify-between"
                      >
                        <div>
                          <h3 class="text-2xl font-black dark:text-white leading-tight">
                            Profile Icon
                          </h3>
                          <p class="text-sm text-gray-500 dark:text-secondary-text mt-1 font-medium">
                            Choose how to update your agent's look
                          </p>
                        </div>
                        <button
                          @click=${() => (this.showIconSelectionModal = false)}
                          class="w-10 h-10 flex items-center justify-center bg-gray-50 dark:bg-primary-bg rounded-full text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                        >
                          ${icon('IoCloseOutline', 24, 'w-6 h-6')}
                        </button>
                      </div>

                      <div class="p-8 grid grid-cols-1 gap-4">
                        <button
                          @click=${() => {
                            this.showIconSelectionModal = false;
                            this._fileInput?.click();
                          }}
                          class="group flex flex-col items-center gap-4 p-8 bg-gray-50 dark:bg-primary-bg rounded-[2rem] border border-gray-100 dark:border-divider hover:border-blue-500/50 hover:bg-white dark:hover:bg-secondary-bg transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5 active:scale-[0.98]"
                        >
                          <div
                            class="w-16 h-16 rounded-2xl bg-white dark:bg-secondary-bg shadow-sm flex items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors duration-300"
                          >
                            ${icon('IoImageOutline', 32, 'w-8 h-8')}
                          </div>
                          <div class="text-center">
                            <h4 class="font-bold text-gray-900 dark:text-white text-lg">
                              Upload Photo
                            </h4>
                            <p class="text-sm text-gray-500 dark:text-secondary-text mt-1">
                              Pick a file from your device
                            </p>
                          </div>
                        </button>

                        <button
                          @click=${() => {
                            this.showIconSelectionModal = false;
                            this.iconPrompt = `A professional, clean profile icon for an AI agent named "${this.formData.name}". Description: ${this.formData.description || 'An AI assistant'}. Minimalist, high-quality, circular composition.`;
                            this.showIconPromptModal = true;
                          }}
                          class="group flex flex-col items-center gap-4 p-8 bg-blue-50/30 dark:bg-blue-500/5 rounded-[2rem] border border-blue-100/50 dark:border-blue-500/20 hover:border-blue-500 hover:bg-white dark:hover:bg-secondary-bg transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/10 active:scale-[0.98]"
                        >
                          <div
                            class="w-16 h-16 rounded-2xl bg-blue-600 shadow-lg shadow-blue-500/30 flex items-center justify-center text-white transform transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110"
                          >
                            ${icon('IoSparklesOutline', 32, 'w-8 h-8')}
                          </div>
                          <div class="text-center">
                            <h4 class="font-bold text-blue-600 dark:text-primary text-lg">
                              Generate with AI
                            </h4>
                            <p class="text-sm text-blue-500/70 dark:text-primary/70 mt-1">
                              Create unique icon from prompt
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                `
              : nothing}
          </div>
        </main>
      </div>
    `;
  }
}

customElements.define('agent-edit', AgentEdit);
