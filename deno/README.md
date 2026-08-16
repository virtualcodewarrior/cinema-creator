# AI Cinema Backend

Self-hosted AI image generation backend powered by [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp).
Serves both the REST API and the static frontend from a single Deno server.

## Quick Start

```bash
# Install deno if you haven't: https://docs.deno.com

# Clone and navigate
cd deno

# Run in development mode (hot reload)
deno task dev

# Run in production mode
deno task start

# Run with frontend build and serving
deno task start-all
```

The server starts on `http://127.0.0.1:8000` by default, serving both the API and the frontend.

## Prerequisites

Before running the backend, the frontend must be built:

```bash
# From project root
npm install
npm run build:packages
npm run build
```

Or use the launcher which builds the frontend automatically:

```bash
deno task start-all
```

## Configuration

Set environment variables or create `~/.ai-cinema/config.json`:

| Variable              | Default        | Description                      |
| --------------------- | -------------- | -------------------------------- |
| `AI_CINEMA_PORT`      | `8000`         | HTTP server port                 |
| `AI_CINEMA_HOST`      | `127.0.0.1`    | Bind address                     |
| `AI_CINEMA_HOME`      | `~/.ai-cinema` | Data directory                   |
| `AI_CINEMA_API_KEY`   | (empty)        | API key for auth (empty = open)  |
| `AI_CINEMA_LOG_LEVEL` | `info`         | `debug`, `info`, `warn`, `error` |

## API Reference

### Health Check

```
GET /health
```

### Model Catalog

```
GET /api/models
```

Returns all available models with download states.

### Download Model

```
POST /api/models/{modelId}/download

Response:
{ "ok": true, "data": { "downloading": true, "modelId": "dreamshaper-8" } }
{ "ok": false, "error": "Model already downloaded" }
```

### Download Auxiliary File

```
POST /api/aux/{auxKey}/download
// auxKey: "llm" or "vae"

Response:
{ "ok": true, "data": { "downloading": true, "auxKey": "llm" } }
```

### Check Download Status

```
GET /api/download/status?modelId={modelId}

Response:
{ "ok": true, "data": { "downloading": false, "modelId": "dreamshaper-8" } }
```

### Cancel Download

```
POST /api/download/cancel?modelId={modelId}

Response:
{ "ok": true, "cancelled": true }
```

### Generate Image

```
POST /api/generate
Content-Type: application/json

{
  "model": "dreamshaper-8",
  "prompt": "a serene mountain lake at sunrise",
  "aspect_ratio": "16:9",
  "steps": 20,
  "seed": -1
}

Response:
{ "ok": true, "data": { "jobId": "..." } }
```

### Check Job Status

```
GET /api/generate/{jobId}

Response:
{ "ok": true, "data": { "status": "generating", "progress": 0.5 } }
{ "ok": true, "data": { "status": "completed", "url": "data:image/png;base64,...", "seed": 42 } }
```

### Cancel Job

```
POST /api/generate/{jobId}?action=cancel
```

### Upload File

```
POST /api/upload
Content-Type: multipart/form-data

{ "file": <binary> }

Response:
{ "ok": true, "data": { "url": "/uploads/filename.png", "filename": "...", "size": 12345 } }
```

### Generation History

```
GET /api/history?limit=50
DELETE /api/history?id={entryId}
```

### WebSocket Progress

```
WS /ws/progress?jobId={jobId}

Messages:
{ "type": "starting", "message": "Loading local model (3s)..." }
{ "type": "progress", "step": 5, "totalSteps": 20, "progress": 0.25 }
{ "type": "done", "url": "data:image/png;base64,...", "seed": 42 }
{ "type": "error", "error": "Model not found" }
```

### Serve Files

```
GET /uploads/{filename}
GET /output/{filename}
```

## Available Models

| Model                 | Type    | Size   | Default Steps |
| --------------------- | ------- | ------ | ------------- |
| Z-Image Turbo         | z-image | 3.4 GB | 8             |
| Z-Image Base          | z-image | 3.5 GB | 50            |
| Dreamshaper 8         | sd1     | 2.1 GB | 20            |
| Realistic Vision v5.1 | sd1     | 2.1 GB | 25            |
| Anything v5           | sd1     | 2.1 GB | 20            |
| SDXL Base 1.0         | sdxl    | 6.9 GB | 30            |

Z-Image models require auxiliary files (Qwen3-4B text encoder + FLUX VAE).

## Architecture

```
┌─────────────────────────────────────────────┐
│              User's Machine                  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │         Deno Server (:8000)            │  │
│  │  ┌────────────┐    ┌────────────────┐  │  │
│  │  │  Static    │    │   API Routes   │  │  │
│  │  │  Frontend  │    │   /api/*       │  │  │
│  │  │  (SPA)     │    │   /ws/*        │  │  │
│  │  └────────────┘    └────────────────┘  │  │
│  │                                 ┌──────┴──────┐  │
│  │                                 │  JobQueue   │  │
│  │                                 │  Dispatcher │  │
│  │                                 │  SdCppEngine│  │
│  │                                 └─────────────┘  │
│  └──────────────────────────────────────────────────┘  │
│                                              │
│                                  ┌───────────┴──────────┐
│                                  │  ~/.ai-cinema/        │
│                                  │  models/  (15-25 GB) │
│                                  │  uploads/             │
│                                  │  output/              │
│                                  └──────────────────────┘
└─────────────────────────────────────────────┘
```

## Data Directory Structure

```
~/.ai-cinema/
├── config.json          # Configuration (optional)
├── history.json         # Generation history
├── bin/
│   └── sd-cli           # sd.cpp binary
├── models/
│   ├── DreamShaper_8_pruned.safetensors
│   ├── z_image_turbo-Q4_K.gguf
│   └── ...
├── uploads/             # Uploaded images/videos/audio
├── output/              # Generated images
└── tmp/                 # Temporary files during generation
```

## Development

```bash
# Watch mode with hot reload
deno run --watch --allow-all main.ts

# Run tests
deno task test

# Format check
deno fmt --check

# Lint check
deno lint
```

## License

MIT
