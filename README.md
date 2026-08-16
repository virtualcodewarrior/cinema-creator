# AI Cinema — Self-Hosted AI Image & Video Studio

> **A fully self-hosted, open-source AI image, video, cinema, and lip sync studio.** Generate AI images and videos using 200+ models — Flux, Midjourney, Kling, Veo, Seedance and more — with zero cloud dependencies.

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+) — for building the frontend
- [Deno](https://deno.land/) (v1.40+) — for the backend + frontend serving

### Setup

```bash
# Clone the repository
git clone git@github.com:virtualcodewarrior/cinema-creator.git
cd cinema-creator

# Install dependencies + build workspace packages
npm run setup

# Build the frontend (static export)
npm run build

# Start Deno backend (serves both API and frontend)
deno task start-all
```

The app will be available at `http://localhost:8000`. The Deno backend runs in open mode by default — no API key required. To enable API key authentication, set `AI_CINEMA_API_KEY` or configure it in `~/.ai-cinema/config.json`.

### Development

```bash
# Start everything (builds frontend + runs Deno server)
deno task start-all

# Or run Deno backend only (after frontend is built)
deno task dev
```

## 🏠 Self-Hosted Mode

Run everything locally with a Deno backend and local AI models. No cloud dependencies, no subscription fees.

```bash
# Build frontend and start Deno server (serves both API and frontend)
deno task start-all
```

See `deno/README.md` for full self-hosted documentation.

## ✨ Features

- **Image Studio** — Generate images from text prompts (50+ text-to-image models) or transform existing images (55+ image-to-image models)
- **Video Studio** — Generate videos from text prompts (40+ text-to-video models) or animate a start-frame image (60+ image-to-video models)
- **Cinema Studio** — Interface for photorealistic cinematic shots with pro camera controls (Lens, Focal Length, Aperture)
- **Lip Sync Studio** — Animate portraits or sync lips to any audio with 9 dedicated models
- **Workflow Studio** — Build and run multi-step AI pipelines visually. Chain image, video, and audio models into automated flows
- **Agent Studio** — Multi-turn creative agent that plans and executes generation tasks conversationally
- **Design Agent Studio** — Canvas-based autonomous design agent for iterative visual work
- **Audio Studio** — Generate and edit AI audio/music from text prompts
- **Marketing Studio** — Generate ad and marketing-ready creative variations from a single input
- **AI Influencer Studio** — Tools for creating and managing consistent AI persona/influencer content
- **Smart Controls** — Dynamic aspect ratio, resolution/quality, and duration pickers that adapt to each model's capabilities
- **Generation History** — Browse, revisit, and download all past generations
- **Responsive Design** — Works seamlessly on desktop and mobile with dark glassmorphism UI

## 🏗️ Architecture

The frontend is a **static export** built with Next.js, served by the **Deno backend** which also handles all API requests.

```
cinema-creator/
├── app/                        # Next.js App Router (static export)
│   ├── layout.js               # Root layout (Tailwind, fonts)
│   ├── page.js                 # Redirects → /studio
│   ├── app-shell.js            # Unified SPA shell with sidebar navigation
│   ├── studio/                 # Studio routes
│   ├── agents/                 # Agent routes
│   └── workflow/               # Workflow routes
├── components/
│   ├── SettingsPanel.js        # API key & model settings
│   └── VideoHistoryPanel.js    # Generation history panel
├── deno/                       # Deno backend + frontend server
│   ├── main.ts                 # Entry point (API + static file serving)
│   ├── api/                    # API route handlers
│   ├── inference/              # sd.cpp inference engine
│   ├── lib/                    # Config, auth, queue, dispatcher
│   └── storage/                # File, model, and history storage
├── packages/
│   ├── studio/                 # Shared React component library
│   │   └── src/
│   │       ├── index.js        # Exports all studio components
│   │       ├── models.js       # 200+ model definitions
│   │       ├── backendClient.js # Deno backend API client
│   │       └── components/     # Studio UI components
│   ├── Vibe-Workflow/          # Workflow builder UI + server
│   ├── Open-Poe-AI/            # Agent chat UI + server
│   └── Open-AI-Design-Agent/   # Design agent UI + server
├── out/                        # Built static frontend (generated)
├── package.json                # workspaces for all packages
└── next.config.mjs             # Next.js static export config
```

## 🔌 API

The frontend communicates with the Deno backend directly via the same origin.

1. **Submit** — `POST /api/v1/{model-endpoint}` with prompt and parameters
2. **Poll** — `GET /api/v1/predictions/{request_id}/result` until status is `completed`

Authentication uses the `x-api-key` header. Since the frontend and API share the same origin, no CORS proxy is needed.

File uploads use `POST /api/upload` (multipart/form-data) and return a URL that is passed to image-conditioned models.

## 🎨 Supported Model Categories

| Category | Count | Examples |
|---|---|---|
| **Text-to-Image** | 70+ | Flux Dev, Nano Banana 2, Seedream 5.0, Ideogram v3, Midjourney v7, GPT-4o |
| **Image-to-Image** | 70+ | Nano Banana 2 Edit, Flux Kontext Pro, GPT-4o Edit, Seededit v3 |
| **Text-to-Video** | 85+ | Kling v3, Sora 2, Veo 3, Wan 2.6, Seedance 2.0, Hailuo 2.3 |
| **Image-to-Video** | 120+ | Kling v2.1 I2V, Veo3 I2V, Seedance 2.0 I2V, Wan2.2 I2V |
| **Lip Sync** | 15 | Infinite Talk, Wan 2.2, LTX Lipsync, Sync, LatentSync |
| **Audio** | 15+ | Text-to-music, remix, and audio editing models |

## 🛠️ Tech Stack

- **Next.js 15** — Static export for the frontend
- **React 19** — Studio UI components
- **Tailwind CSS** — Utility-first styling
- **Deno** — Backend HTTP server + static file serving + job queue + inference dispatcher
- **npm workspaces** — Monorepo with shared packages

## 📄 License

MIT
