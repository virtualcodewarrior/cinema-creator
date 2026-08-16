# AI Cinema — Self-Hosted AI Image/Video Studio

## Vision

A fully self-hosted alternative to Open Generative AI / Muapi. Zero cloud dependencies. Runs locally with a Deno backend and local AI models (sd.cpp).

## Architecture

```
┌─────────────────────────────────────────────┐
│              User's Machine                  │
│                                              │
│  ┌──────────────┐    HTTP + WS    ┌─────────┴────────┐
│  │  Next.js     │◄──────────────►│   Deno Backend   │
│  │  Frontend    │  :3000/:8000   │   :8000          │
│  │              │                │                  │
│  └──────────────┘                │  ┌──────────────┐ │
│                                  │  │  JobQueue    │ │
│                                  │  │  Dispatcher  │ │
│                                  │  │  SdCppEngine │ │
│                                  │  │  sd-cli (proc)││
│                                  │  └──────────────┘ │
│                                  └──────────────────┘
│                                              │
│                                  ┌───────────┴──────────┐
│                                  │  ~/.ai-cinema/        │
│                                  │  models/  (15-25 GB) │
│                                  │  uploads/             │
│                                  │  output/              │
│                                  └──────────────────────┘
└─────────────────────────────────────────────┘
```

## Quick Start (Self-Hosted Mode)

```bash
# 1. Start Deno backend
cd deno
deno task dev

# 2. Start Next.js frontend
npm run dev:self-hosted
```

## Current State

### Phase 1: Deno Backend Core ✅ COMPLETED

**Files:** 22 files across 5 modules

- `lib/logger.ts` — Structured CLI logger with levels
- `lib/config.ts` — Config from env vars + config.json
- `lib/queue.ts` — In-memory job queue with per-model concurrency
- `lib/auth.ts` — API key validation (open mode when no key set)
- `inference/sdcpp.ts` — sd.cpp subprocess management
- `inference/modelRunner.ts` — Model-specific CLI arg building
- `inference/progressParser.ts` — stdout parsing for step progress
- `storage/models.ts` — Model catalog with 6 models + download state
- `storage/downloads.ts` — HTTP download manager with resume support
- `storage/files.ts` — Upload/output file management
- `storage/history.ts` — JSON-based generation history
- `api/models.ts` — GET /api/models
- `api/generate.ts` — POST /api/generate
- `api/jobStatus.ts` — GET /api/generate/{id}
- `api/upload.ts` — POST /api/upload
- `api/history.ts` — GET/DELETE /api/history
- `api/ws/progress.ts` — WebSocket progress + static file serving
- `api/_utils.ts` — JSON response helpers + CORS
- `main.ts` — HTTP server with all routes
- `mod.ts` — Module exports
- `deno.json` — Project config with tasks
- `README.md` — Backend documentation

### Phase 2: Job Dispatcher & Model Downloads ✅ COMPLETED

- `lib/dispatcher.ts` — JobDispatcher: polls queue, dispatches to SdCppEngine
- `lib/queue.ts` — Added `onStarted` event for job lifecycle
- `api/modelDownload.ts` — Model download API with abort/cancel
- `storage/downloads.ts` — AbortSignal support for cancellable downloads
- `storage/history.ts` — `updateHistoryEntry()` for job completion/failure
- Updated `main.ts` — Routes all Muapi-compatible endpoints

### Phase 3: Frontend Migration ✅ COMPLETED

- `packages/studio/src/backendClient.js` — Calls Deno backend directly
- `components/SelfHostedShell.js` — Simplified UI (Image, Video, Audio, LipSync)
- `app/studio/self-hosted/page.js` — Self-hosted entry point
- `app/studio/[[...slug]]/page.js` — Conditional SelfHostedShell
- `middleware.js` — Skips Muapi rewrites when self-hosted
- `next.config.mjs` — Self-hosted env vars
- `package.json` — `dev:self-hosted` and `build:self-hosted` scripts
- `.env.self-hosted.example` — Environment template
- `README.md` — Self-hosted documentation

## Remaining Phases

### Phase 4: Frontend Studio Integration ✅ COMPLETED

- `components/SelfHostedShell.js` — Updated to use full studio components from packages/studio/
- `middleware.js` — Proxies `/api/v1/*` to Deno backend in self-hosted mode
- Studio components (ImageStudio, VideoStudio, AudioStudio, LipSyncStudio) now work unchanged

### Phase 5: Model Download & Management UI ✅ COMPLETED

- `components/SettingsPanel.js` — Model download/management settings
- `components/SelfHostedShell.js` — Added settings button and modal
- Shows model list with download status and disk usage
- Supports downloading models and auxiliary files (Z-Image)
- API key management in settings
- Model deletion placeholder (manual removal noted)

### Phase 6: Video Generation Support ✅ COMPLETED

- `components/VideoHistoryPanel.js` — Video history browsing with playback
- VideoStudio component works via proxy to Deno backend
- Video playback, download, and deletion support
- Wan2GP integration is a future enhancement (requires Python/PyTorch server)

### Phase 7: Polish & Packaging ✅ COMPLETED

- `Dockerfile.deno` — Docker image for Deno backend
- `Dockerfile.nextjs` — Docker image for Next.js frontend
- `docker-compose.yml` — Orchestration for both services
- `scripts/ai-cinema-backend.service` — systemd service for Linux
- `scripts/com.ai-cinema.backend.plist` — launchd service for macOS
- `components/FirstRunWizard.js` — Step-by-step setup wizard

## Project Complete

The self-hosted AI Cinema project is now complete with:
- Fully functional Deno backend with sd.cpp local inference
- Next.js frontend with full studio components
- Docker deployment support
- Auto-start services for Linux/macOS
- First-run wizard for easy setup
- Model download and management UI
- Video history and playback support

1. **Docker support** — Docker Compose for Deno + Next.js
2. **Auto-start helper** — systemd service or launchd plist
3. **First-run wizard** — Download sd.cpp binary, pick models
4. **Documentation** — Full user guide
5. **Testing** — Integration tests for the full stack
6. **Performance optimization** — Caching, connection pooling

## Technical Decisions

### Deno Backend

- **Runtime:** Deno 2.x (stable, TypeScript-first)
- **HTTP server:** `Deno.serve()` (built-in, no framework)
- **Process management:** `Deno.Command` for sd-cli subprocess
- **Storage:** JSON files (history), filesystem (models/uploads)
- **Queue:** In-memory, serial per model
- **Auth:** Simple API key (optional, open mode by default)
- **CORS:** Enabled for all origins (self-hosted)

### Frontend

- **Framework:** Next.js 15 (App Router)
- **UI library:** React 19 + Tailwind CSS
- **State:** React hooks (useState, useEffect)
- **API calls:** fetch API + XMLHttpRequest for uploads
- **Storage:** localStorage for API key
- **Build:** Vite for development, Next.js for production

### API Contract

- **Submit:** `POST /api/v1/{endpoint}` → `{ request_id }`
- **Poll:** `GET /api/v1/predictions/{id}/result` → `{ status, outputs, url }`
- **Upload:** `POST /api/v1/upload_file` → `{ url, file_url, data: { url } }`
- **History:** `GET /api/v1/history` → `{ items, cursor, has_more }`
- **Balance:** `GET /api/v1/account/balance` → `{ balance, credits }`

### Model Catalog (Initial)

| Model | Type | Size | Default Steps |
|-------|------|------|--------------|
| Z-Image Turbo | z-image | 3.4 GB | 8 |
| Z-Image Base | z-image | 3.5 GB | 50 |
| Dreamshaper 8 | sd1 | 2.1 GB | 20 |
| Realistic Vision v5.1 | sd1 | 2.1 GB | 25 |
| Anything v5 | sd1 | 2.1 GB | 20 |
| SDXL Base 1.0 | sdxl | 6.9 GB | 30 |

Z-Image models require auxiliary files (Qwen3-4B text encoder + FLUX VAE).

## Branch History

- `feature/self-hosted-deno-backend` — Active development branch
  - `151c9fc` — Phase 1: Deno backend core
  - `ff61829` — Phase 2: Job dispatcher & model downloads
  - `3e992db` — Phase 3: Frontend migration

## Notes

- The original `StandaloneShell.js` (Muapi mode) is preserved and works unchanged
- Self-hosted mode is enabled via `NEXT_PUBLIC_SELF_HOSTED=1` env var
- The Deno backend supports both simplified API (`/api/generate`) and Muapi-compatible API (`/api/v1/*`)
- All Muapi proxy routes in Next.js are skipped in self-hosted mode
- The backendClient.js maintains the same function signatures as backendClient.js for compatibility
