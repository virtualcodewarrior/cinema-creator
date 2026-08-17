// Port of packages/studio/src/components/AppsStudio.jsx.
// react-icons -> src/lib/icons.js (size '1em' = react-icons default);
// react-hot-toast -> global <app-toaster> via src/lib/toaster API;
// <Toaster> removed (global); styled-jsx keyframes -> static styles
// (the sheet has neither .animate-fade-in nor .animate-scale-up).
import { html, css, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { BaseElement } from '../../lib/wc-base.js';
import { iconSvg } from '../../lib/icons.js';
import toast from '../../lib/toast.js';
import { registerAppInterest, getAppInterests } from 'studio/muapi.js';

// react-icons renders plain <Icon /> at 1em; iconSvg defaults to 16px, so
// pass '1em' explicitly everywhere the JSX had no w-*/h-* size class.
const icon = (name, className = '') =>
  unsafeHTML(iconSvg(name, { size: '1em', className }));

const templateApps = [
  {
    name: "AI Headshot Studio",
    description: "Launch a headshot SaaS in minutes. Charge $5–$20 per set, keep all profits. Stripe payments & user accounts included.",
    icon: "FaUserTie",
    color: "blue",
    repo: "https://github.com/SamurAIGPT/ai-headshot-generator",
    hosted: "https://ai-headshot-generator-xi.vercel.app/",
    thumbnail: "/assets/apps/d9c39378f60e48098f6b6ce657dc18b5.png",
    isTemplate: true
  },
  {
    name: "Nano Banana Studio",
    description: "Your own AI image generation platform, ready to monetize. Add credit packs or subscriptions and start earning from day one.",
    icon: "FaHandSparkles",
    color: "amber",
    repo: "https://github.com/SamurAIGPT/nano-banana-generator",
    hosted: "https://nano-banana-generator-psi.vercel.app",
    thumbnail: "/assets/apps/Screenshot_2026-04-15_103743.png",
    isTemplate: true
  },
  {
    name: "Seedance V2 Studio",
    description: "Deploy a premium AI art studio and sell access to users. Full Stripe integration lets you collect revenue immediately after launch.",
    icon: "FaMagic",
    color: "purple",
    repo: "https://github.com/SamurAIGPT/seedance-2-generator",
    hosted: "https://seedance-2-generator.vercel.app/",
    thumbnail: "/assets/apps/4cd1f49d48934d448e7f493f9d5e476e.png",
    isTemplate: true
  },
  {
    name: "AI Clipping Studio",
    description: "Launch your own AI-powered video clipping SaaS. Download YouTube videos and extract viral highlights with ease.",
    icon: "FaVideo",
    color: "emerald",
    repo: "https://github.com/SamurAIGPT/ai-clipping-generator",
    hosted: "https://ai-clipping-generator.vercel.app",
    thumbnail: "/assets/apps/cca8b5bb-25f1-40fe-928e-53dce2c8c928.png",
    isTemplate: true
  },
  {
    name: "EasyVeo Studio",
    description: "The complete Veo 3.1 video generation suite. Monetize text-to-video, image-to-video, and reference-to-video workflows with ease.",
    icon: "FaVideo",
    color: "indigo",
    repo: "https://github.com/SamurAIGPT/veo4-video-generator",
    hosted: "https://veo4-video-generator.vercel.app/",
    thumbnail: "/assets/apps/94ac6d86-be4e-4b70-b1e6-96d7e3692604.png",
    isTemplate: true
  }
];

// Every entry links to a verified GitHub repo; `hosted` is present only when a
// live demo was verified, otherwise the Demo button opens the request-access
// modal.
const dummyAppsData = [
  { thumbnail: "/assets/apps/Pet_Product_Studio.jpg", name: "Pet Product Studio", description: "High-end product photography specifically for pet toys and food.", icon: "FaPaw", category: "Lifestyle", repo: "https://github.com/SamurAIGPT/pet-product-studio", hosted: "https://pet-product-studio.vercel.app" },
  { thumbnail: "/assets/apps/Resale_Photo_Enhancer.png", name: "Resale Photo Enhancer", description: "Boost sales by elevating low-quality product photos to studio level.", icon: "FaImage", category: "Business", repo: "https://github.com/SamurAIGPT/resale-photo-enhancer", hosted: "https://resale-photo-enhancer.vercel.app" },
  { thumbnail: "/assets/apps/Blogger_CMS.png", name: "Blogger CMS", description: "AI-powered content management for high-velocity SEO blogs.", icon: "FaBriefcase", category: "Business", repo: "https://github.com/SamurAIGPT/blogger-cms" },
  { thumbnail: "/assets/apps/Amazon_Product_Studio.webp", name: "Amazon Product Studio", description: "Perfect Amazon-ready product shots with AI backdrops.", icon: "FaImage", category: "Business", repo: "https://github.com/SamurAIGPT/amazon-product-studio", hosted: "https://amazon-product-studio.vercel.app" },
  { thumbnail: "/assets/apps/AI_Business_Card.webp", name: "AI Business Card", description: "Digital-first business card generator with AI networking.", icon: "FaBriefcase", category: "Business", repo: "https://github.com/SamurAIGPT/ai-business-card", hosted: "https://ai-business-card.vercel.app" },
  { thumbnail: "/assets/apps/MailWise.png", name: "MailWise", description: "Intelligent email drafting and scheduling assistant.", icon: "FaBriefcase", category: "Business", repo: "https://github.com/SamurAIGPT/mail-wise", hosted: "https://mail-wise-khaki.vercel.app" },
  { thumbnail: "/assets/apps/My_Podcast.webp", name: "My Podcast", description: "Automated podcast editing and show-note generation.", icon: "FaMicrophone", category: "Creative", repo: "https://github.com/SamurAIGPT/my-podcast", hosted: "https://my-podcast.vercel.app" },
  { thumbnail: "/assets/apps/AI_Knowledge_Base.png", name: "AI Knowledge Base", description: "Train an AI on your company data for instant support.", icon: "FaBriefcase", category: "Business", repo: "https://github.com/SamurAIGPT/ai-knowledge-base", hosted: "https://ai-knowledge-base-six.vercel.app" },
  { thumbnail: "/assets/apps/AI_Royal_Portrait.png", name: "AI Royal Portrait", description: "Transform your photos into 18th-century royal oil paintings.", icon: "FaHandSparkles", category: "Creative", repo: "https://github.com/SamurAIGPT/ai-royal-portrait", hosted: "https://ai-royal-portrait.vercel.app" },
  { thumbnail: "/assets/apps/AI_MEME.png", name: "AI MEME", description: "Viral-ready meme generation based on trending topics.", icon: "FaMagic", category: "Creative", repo: "https://github.com/SamurAIGPT/ai-meme-generator", hosted: "https://ai-meme-umber.vercel.app" },
  { thumbnail: "/assets/apps/AI_Real_Estate_Stager.webp", name: "AI Real Estate Stager", description: "Virtually furnish and stage empty homes for sale.", icon: "FaHome", category: "Real Estate", repo: "https://github.com/SamurAIGPT/ai-real-estate-stager", hosted: "https://ai-real-estate-stager.vercel.app" },
  { thumbnail: "/assets/apps/AI_Logo.png", name: "AI Logo", description: "Dynamic brand identity and logo generator.", icon: "FaHandSparkles", category: "Business", repo: "https://github.com/SamurAIGPT/ai-logo-studio", hosted: "https://ai-logo-studio-rho.vercel.app" },
  { thumbnail: "/assets/apps/OldPhoto.png", name: "OldPhoto", description: "Restore, colorize, and sharpen vintage family photos.", icon: "FaImage", category: "Creative", repo: "https://github.com/SamurAIGPT/old-photo-restore", hosted: "https://old-photo-restore.vercel.app" },
  { thumbnail: "/assets/apps/AITryOn.png", name: "AITryOn", description: "Virtual fitting room for fashion brands and enthusiasts.", icon: "FaHandSparkles", category: "Lifestyle", repo: "https://github.com/SamurAIGPT/ai-tryon", hosted: "https://ai-tryon-smoky.vercel.app" },
  { thumbnail: "/assets/apps/AI_Professional_Makeup_Generator.webp", name: "AI Professional Makeup Generator", description: "Try on hundreds of makeup looks virtually.", icon: "FaHandSparkles", category: "Lifestyle", repo: "https://github.com/SamurAIGPT/ai-professional-makeup-generator", hosted: "https://ai-professional-makeup-generator.vercel.app" },
  { thumbnail: "/assets/apps/AI_Group_Photo.webp", name: "AI Group Photo", description: "Seamlessly combine individual portraits into a group photo.", icon: "FaImage", category: "Creative", repo: "https://github.com/SamurAIGPT/ai-group-photo", hosted: "https://ai-group-photo-mocha.vercel.app" },
  { thumbnail: "/assets/apps/AI_Tattoo_Try_On.webp", name: "AI Tattoo Try-On", description: "Visualize tattoos on your body before getting inked.", icon: "FaHandSparkles", category: "Lifestyle", repo: "https://github.com/SamurAIGPT/ai-tattoo-try-on", hosted: "https://ai-tattoo-try-on.vercel.app" },
  { thumbnail: "/assets/apps/AI_Hair_Style_Simulator.webp", name: "AI Hair Style Simulator", description: "Try on new haircuts and colors with zero commitment.", icon: "FaHandSparkles", category: "Lifestyle", repo: "https://github.com/SamurAIGPT/ai-hair-style-simulator", hosted: "https://ai-hair-style-simulator.vercel.app" },
  { thumbnail: "/assets/apps/AI_Kids_to_Adult_Prediction.webp", name: "AI Kids-to-Adult Prediction", description: "Ever wonder what your kid will look like as an adult?", icon: "FaImage", category: "Lifestyle", repo: "https://github.com/SamurAIGPT/ai-kid-to-adult-prediction", hosted: "https://ai-kid-to-adult-prediction.vercel.app" },
  { thumbnail: "/assets/apps/AI_Room_Declutter.webp", name: "AI Room Declutter", description: "Instantly clean up messy room photos for listings.", icon: "FaHome", category: "Real Estate", repo: "https://github.com/SamurAIGPT/ai-room-declutter", hosted: "https://ai-room-declutter.vercel.app" },
  { thumbnail: "/assets/apps/AI_Fitness_Body_Simulator.webp", name: "AI Fitness Body Simulator", description: "Visualize your fitness goals on your own body.", icon: "FaImage", category: "Lifestyle", repo: "https://github.com/SamurAIGPT/ai-fitness-body-simulator", hosted: "https://ai-fitness-body-simulator.vercel.app" },
  { thumbnail: "/assets/apps/AI_Pet_Portrait.webp", name: "AI Pet Portrait", description: "Elegant, artistic portraits for your beloved pets.", icon: "FaPaw", category: "Lifestyle", repo: "https://github.com/SamurAIGPT/ai-pet-portrait", hosted: "https://ai-pet-portrait-two.vercel.app" },
  { thumbnail: "/assets/apps/AI_Kissing_Video_Generator.webp", name: "AI Kissing Video Generator", description: "Expressive AI video generation for romantic moments.", icon: "FaVideo", category: "Creative", repo: "https://github.com/SamurAIGPT/ai-kissing-video-generator", hosted: "https://ai-kissing-video-generator-amber.vercel.app" },
  { thumbnail: "/assets/apps/AI_Travel_Studio.png", name: "AI Travel Studio", description: "Create stunning travel posters and visuals from prompts.", icon: "FaMapMarkerAlt", category: "Lifestyle", repo: "https://github.com/SamurAIGPT/ai-travel-studio", hosted: "https://ai-travel-studio.vercel.app" },
  { thumbnail: "/assets/apps/Prompt_Architect.webp", name: "Prompt Architect", description: "Refine and optimize complex prompts for high-tier AI models.", icon: "FaMagic", category: "Creative", repo: "https://github.com/SamurAIGPT/prompt-architect", hosted: "https://prompt-architect-one-nu.vercel.app" },
  { thumbnail: "/assets/apps/ClearMark_AI.webp", name: "ClearMark AI", description: "Automated watermark removal and brand cleanup for assets.", icon: "FaImage", category: "Business", repo: "https://github.com/SamurAIGPT/clearmark-ai", hosted: "https://clearmark-ai.vercel.app" },
  { thumbnail: "/assets/apps/AI_Wedding_Photo.png", name: "AI Wedding Photo", description: "Cinematic wedding photography enhancements and filters.", icon: "FaImage", category: "Lifestyle", repo: "https://github.com/SamurAIGPT/ai-wedding-photo", hosted: "https://ai-wedding-photo.vercel.app" },
  { thumbnail: "/assets/apps/Social_Post.webp", name: "Social Post", description: "AI-generated social media scheduling and copy creator.", icon: "FaBriefcase", category: "Marketing", repo: "https://github.com/SamurAIGPT/social-post", hosted: "https://social-post-woad.vercel.app" },
  { thumbnail: "/assets/apps/MagicSelf_AI.webp", name: "MagicSelf AI", description: "The ultimate AI selfie and avatar generation engine.", icon: "FaMagic", category: "Creative", repo: "https://github.com/SamurAIGPT/magicself-ai", hosted: "https://magicself-ai.vercel.app" },
  { thumbnail: "/assets/apps/AI_Resume_Builder.webp", name: "AI Resume Builder", description: "Craft the perfect, ATS-friendly resume in seconds.", icon: "FaFileAlt", category: "Productivity", repo: "https://github.com/SamurAIGPT/ai-resume-builder", hosted: "https://ai-resume-builder-five-olive.vercel.app" },
  { thumbnail: "/assets/apps/GEO_Checker.webp", name: "GEO Checker", description: "AI-powered location tagging and geodata validation.", icon: "FaMapMarkerAlt", category: "Business", repo: "https://github.com/SamurAIGPT/geo-checker", hosted: "https://geo-checker-silk.vercel.app" },
  { thumbnail: "/assets/apps/AI_Character_Studio.webp", name: "AI Character Studio", description: "Consistent character design for animators and writers.", icon: "FaUserTie", category: "Creative", repo: "https://github.com/SamurAIGPT/ai-character-studio", hosted: "https://ai-character-studio-beta.vercel.app" },
  { thumbnail: "/assets/apps/ReLive_AI.webp", name: "ReLive AI", description: "Immersive memory and historical visualization engine.", icon: "FaHandSparkles", category: "Creative", repo: "https://github.com/SamurAIGPT/relive-ai", hosted: "https://relive-ai-beta.vercel.app" }
];

export class StudioApps extends BaseElement {
  static sheetKeys = ['studio'];

  static properties = {
    // White-label contract prop: the old Vite host never passed one, so the
    // interests fetch + request flow stay inert until an embedder sets it.
    apiKey: { type: String },
    selectedApp: { state: true },
    isRequesting: { state: true },
    requestedApps: { state: true },
  };

  static styles = [
    css`
      :host {
        display: block;
        height: 100%;
      }
      /* From the original's <style jsx global> block; the generated sheet
         has neither of these classes. */
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes scaleUp {
        from { opacity: 0; transform: scale(0.95) translateY(10px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      .animate-fade-in { animation: fadeIn 0.3s ease-out; }
      .animate-scale-up { animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    `,
  ];

  constructor() {
    super();
    this.apiKey = '';
    this.selectedApp = null;
    this.isRequesting = false;
    this.requestedApps = [];
  }

  firstUpdated() {
    if (this.apiKey) {
      getAppInterests(this.apiKey)
        .then((apps) => (this.requestedApps = apps))
        .catch((err) => console.error('Error fetching interests:', err));
    }
  }

  async handleRequestAccess() {
    if (!this.selectedApp || !this.apiKey) return;

    this.isRequesting = true;
    try {
      await registerAppInterest(this.apiKey, this.selectedApp.name);
      this.requestedApps = [...this.requestedApps, this.selectedApp.name];
      toast.success("Got it! We'll send you the template details shortly.");
      setTimeout(() => (this.selectedApp = null), 1500);
    } catch (error) {
      console.error(error);
      toast.error('Failed to register interest. Please try again later.');
    } finally {
      this.isRequesting = false;
    }
  }

  renderAppCard(app, index = 0) {
    // Premium Vibrant Gradients for placeholders
    const gradients = [
      'from-blue-600/20 to-indigo-600/20',
      'from-purple-600/20 to-pink-600/20',
      'from-amber-500/20 to-orange-600/20',
      'from-emerald-500/20 to-teal-600/20',
      'from-rose-500/20 to-red-600/20',
      'from-cyan-500/20 to-blue-600/20',
    ];
    const cardGradient = gradients[index % gradients.length];

    return html`
      <div
        class="group bg-[#0a0a0a] border border-white/5 rounded-lg flex flex-col overflow-hidden transition-all duration-300 hover:border-white/10 hover:bg-[#0f0f0f] hover:shadow-2xl hover:shadow-blue-500/5 hover:-translate-y-1"
      >
        <div class="relative h-44 w-full overflow-hidden bg-white/5">
          ${app.thumbnail
            ? html`<img
                src="${app.thumbnail}"
                alt="${app.name}"
                class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />`
            : html`<div
                class="w-full h-full flex items-center justify-center bg-gradient-to-br ${cardGradient} transition-colors group-hover:scale-110 duration-700"
              >
                ${icon(app.icon, 'text-4xl opacity-20 group-hover:opacity-40 transition-opacity text-white')}
              </div>`}
          <div
            class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60 group-hover:opacity-80 transition-opacity"
          ></div>
        </div>

        <div class="p-5 flex flex-col flex-1 space-y-4">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-lg text-[#22d3ee] border border-white/5 group-hover:border-white/10 transition-colors"
            >
              ${icon(app.icon)}
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-bold text-white uppercase tracking-tight truncate"
                >${app.name}</h3
              >
              <p class="text-[10px] text-white/40 font-bold uppercase tracking-widest"
                >${app.category || 'Template'}</p
              >
            </div>
          </div>

          <p class="text-xs text-white/50 leading-relaxed font-medium line-clamp-2 min-h-[2.5rem]"
            >${app.description}</p
          >

          <div class="flex items-center gap-2 pt-2">
            ${app.repo
              ? html`
                  <a
                    href="${app.repo}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex-1 py-2 bg-white/5 text-white rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-white/10 transition-all border border-white/5 active:scale-95"
                  >
                    ${icon('FaGithub', 'text-xs')}
                    Github
                  </a>
                `
              : html`
                  <button
                    @click=${() => (this.selectedApp = app)}
                    class="flex-1 py-2 bg-white/5 text-white rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-white/10 transition-all border border-white/5 active:scale-95"
                  >
                    ${icon('FaGithub', 'text-xs')}
                    Github
                  </button>
                `}
            ${app.hosted
              ? html`
                  <a
                    href="${app.hosted}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex-1 py-2 bg-[#22d3ee]/10 text-[#22d3ee] rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#22d3ee]/20 transition-all border border-[#22d3ee]/20 active:scale-95"
                  >
                    ${icon('FaExternalLinkAlt', 'text-[9px]')}
                    Demo
                  </a>
                `
              : html`
                  <button
                    @click=${() => (this.selectedApp = app)}
                    class="flex-1 py-2 bg-[#22d3ee]/10 text-[#22d3ee] rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#22d3ee]/20 transition-all border border-[#22d3ee]/20 active:scale-95"
                  >
                    ${icon('FaExternalLinkAlt', 'text-[9px]')}
                    Demo
                  </button>
                `}
          </div>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div
        class="h-full w-full flex flex-col items-center bg-[#030303] overflow-y-auto custom-scrollbar relative"
      >
        <div
          class="flex flex-col gap-10 items-center w-full max-w-7xl pt-12 pb-24 px-6"
        >
          <div class="text-center space-y-6 max-w-3xl">
            <div
              class="inline-flex items-center gap-2 px-3 py-1.5 bg-[#22d3ee]/10 border border-[#22d3ee]/20 rounded-full"
            >
              ${icon('FaDollarSign', 'text-[#22d3ee] text-xs')}
              <span
                class="text-[10px] font-black text-[#22d3ee] uppercase tracking-widest"
                >Revenue-Ready Templates</span
              >
            </div>
            <h1 class="text-5xl font-black text-white tracking-tighter leading-[0.9]">
              LAUNCH AN AI APP.<br />START EARNING TODAY.
            </h1>
            <p
              class="text-white/40 text-sm font-medium leading-relaxed max-w-xl mx-auto"
            >
              Each template is a fully-functional, Stripe-integrated AI SaaS you can deploy in minutes.
              Charge your users, keep the revenue — muapi handles the AI infrastructure.
            </p>
          </div>

          <div class="w-full grid grid-cols-1 sm:grid-cols-3 gap-4">
            ${this.renderSteps()}
          </div>

          <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full pt-8"
          >
            ${templateApps.map((app, index) => this.renderAppCard(app, index))}
            ${dummyAppsData.map((app, index) =>
              this.renderAppCard(app, index + templateApps.length),
            )}
          </div>

          <div class="pt-24 pb-12 flex flex-col items-center gap-4">
            <div
              class="inline-flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/5"
            >
              <span class="block w-1.5 h-1.5 rounded-full bg-[#22d3ee] animate-pulse"></span>
              <span
                class="text-[9px] font-black text-white/40 uppercase tracking-widest"
                >Muapi Ecosystem — More templates coming soon</span
              >
            </div>
          </div>
        </div>

        ${this.renderModal()}
      </div>
    `;
  }

  renderSteps() {
    const steps = [
      {
        icon: 'FaRocket',
        step: '01',
        title: 'Deploy in Minutes',
        body: 'Fork the open-source template, add your muapi key, and push to Vercel. No backend setup needed.',
      },
      {
        icon: 'FaCreditCard',
        step: '02',
        title: 'Collect Payments',
        body: 'Stripe is pre-wired. Set your own pricing — one-time credits, subscriptions, or pay-per-use.',
      },
      {
        icon: 'FaDollarSign',
        step: '03',
        title: 'Keep the Revenue',
        body: 'Payments go straight to your Stripe account. You own the product, the brand, and the profits.',
      },
    ];
    return steps.map(
      ({ icon: Icon, step, title, body }) => html`
        <div
          class="flex items-start gap-4 bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors"
        >
          <div
            class="w-12 h-12 shrink-0 rounded-2xl bg-white/5 flex items-center justify-center text-[#22d3ee] border border-white/5"
          >
            ${icon(Icon, 'text-lg')}
          </div>
          <div>
            <p class="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1"
              >Step ${step}</p
            >
            <h3 class="text-sm font-bold text-white mb-1.5">${title}</h3>
            <p class="text-xs text-white/40 leading-relaxed font-medium">${body}</p>
          </div>
        </div>
      `,
    );
  }

  renderModal() {
    if (!this.selectedApp) return nothing;
    const app = this.selectedApp;
    return html`
      <div class="fixed inset-0 z-[100] flex items-center justify-center px-6">
        <div
          class="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in"
          @click=${() => (this.selectedApp = null)}
        ></div>
        <div
          class="relative bg-[#0a0a0a] border border-white/10 w-full max-w-md rounded-2xl p-8 space-y-8 animate-scale-up shadow-2xl"
        >
          <div class="flex flex-col items-center text-center space-y-4">
            <div
              class="w-20 h-20 rounded-[28px] bg-[#22d3ee]/10 border border-[#22d3ee]/20 flex items-center justify-center text-4xl text-[#22d3ee] mb-2"
            >
              ${icon(app.icon)}
            </div>
            <h2 class="text-2xl font-black text-white uppercase tracking-tight">
              Deploy ${app.name}
            </h2>
            <p class="text-sm font-medium text-white/40 leading-relaxed px-4">
              Enter your details and we'll send you the <b>${app.name}</b> template along with setup instructions so you can deploy and start earning immediately.
            </p>
          </div>

          <div class="space-y-3">
            <button
              @click=${this.handleRequestAccess}
              ?disabled=${this.isRequesting}
              class="w-full py-4 bg-[#22d3ee] text-black rounded-md text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#22d3ee]/90 transition-all shadow-lg active:scale-95 disabled:opacity-50"
            >
              ${this.isRequesting ? 'Sending Details...' : 'Get Template'}
            </button>
            <button
              @click=${() => (this.selectedApp = null)}
              class="w-full py-4 bg-white/5 border border-white/10 text-white/60 rounded-md text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-all"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('studio-apps', StudioApps);
