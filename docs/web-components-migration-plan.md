# React → Web Components + Shadow DOM — Migration Plan

Status: proposal · Updated: 2026-08-16

## 1. Goal

Replace all React UI in this repo with **native web components (Custom Elements v1 + Shadow DOM)**, keeping the Deno backend, API clients, and app functionality identical. At the end, `react`, `react-dom`, `react-router-dom`, and `@vitejs/plugin-react` are fully removed from the repo.

**Non-goals**: backend changes, TypeScript conversion, visual redesign (parity is the bar, not re-styling).

## 2. Current state (inventory)

62 JSX files, ~41k LOC (of which `packages/studio/src/models.js` is 23k lines of data — untouched).

| Area | Files / LOC | Notes |
|---|---|---|
| Root app (`src/`, `app/`, `components/`) | 10 files, ~800 LOC | `src/main.jsx:7` is the **only** `ReactDOM.createRoot` in the repo. `app-shell.jsx` hand-rolls routing with `pushState`/`popstate` already. |
| `packages/studio` | 19 JSX, ~18k LOC UI | 15 studios + `DrawModal` (1797), `PromptComposer` slots (409), `backendClient.js`/`muapi.js` API layer (framework-free, keep) |
| `workflow-builder` | 21 files, ~12k LOC | `NodeFlow.jsx` (2896) = **reactflow v11** core; 8 node components (~4.7k); `next/*` imports (`NodeFlow.jsx:4,32`, `RenderField.jsx:2`) |
| `agents` (ai-agent) | 9 files, ~3.3k LOC | Chat/profile/create/edit; heavy `next/navigation` + `next-themes` coupling |
| `design-agent` | 3 files, ~4.2k LOC | `CanvasArea.jsx` (2198) = **react-konva** canvas; imperative `useImperativeHandle` API at `CanvasArea.jsx:1272-1288` |

Key facts that make this tractable:

- **No global state library, no React Context in any package.** State = local hooks + one module singleton (`workflow-builder/…/WorkflowStore.jsx`) + direct `localStorage` (identity-scoped via `persistKey.js`) + `CustomEvent`. All directly portable.
- **No portals.** Modals are inline conditional renders → work fine inside shadow roots with `position: fixed` (see Risk R4).
- **All 4 packages are consumed as source** via Vite aliases (`vite.config.js:11-17`) — no dist rebuilds needed for the root app; in-place conversion works.
- **Styling is ~3,200 Tailwind v3 utility classes** in inline `className` — the biggest migration bulk (handled in §5).
- **Latent bugs the migration fixes for free**: `next/navigation` `useParams()` returns null / `useRouter()` throws outside Next (`NodeFlow.jsx:223-224`, `AiAgent.jsx:131,136`) — currently crashes `/studio/workflow` and `/agents/:id` in the Vite host; `studio/src/index.js:16` exports nonexistent `McpCliStudio`; a broken legacy vanilla tree lives in `src/*.js` (missing `AuthModal.js` etc.) — recommend deleting.
- **External embedders**: 3 standalone Next.js client apps (`packages/*/client`) embed these packages, plus a white-label contract: `apiKey`/`userEmail`/`usedIn`/`balance` props, `onGenerationStart|End|Complete|Error` callbacks, ambient axios-interceptor token injection, `backend:auth-required` CustomEvent, identity-scoped localStorage. **This API surface must stay stable** — in WC terms: custom-element attributes/properties + events.

## 3. Target architecture

### 3.1 Framework: Lit (plain JS, no decorators)

- `lit` 3 at root; components in **plain `.js`** using `static properties = { … }` (no decorators → zero esbuild/Babel config).
- Shadow DOM `open` on every element; each element owns its template + `css` style.
- Vite unchanged (Lit is native ESM — no plugin).
- Decision rule — **element vs. template**:
  - *Custom element*: page-level studios, modals, players, chat, nodes, prompt composer, toaster — anything reused, stateful, or embedding-contract-bearing.
  - *Template function* (lit-html `html`): small presentational parts (field renderers, rows, shape components) rendered inside a parent's shadow tree. Don't over-element.

### 3.2 Element inventory (naming: hyphenated, prefixed by package)

| Package | Elements |
|---|---|
| Shell | `app-shell`, `app-sidenav`, `app-settings`, `app-video-history`, `app-toaster` (light-DOM, on `<body>`) |
| studio | `studio-image`, `studio-video`, `studio-cinema`, `studio-lipsync`, `studio-clipping`, `studio-recast`, `studio-audio`, `studio-apps`, `studio-marketing`, `studio-motion`, `studio-agents`, `studio-layers`, `studio-influencer`, `studio-design`, `studio-workflow`, `prompt-composer` (+ `-textarea`/`-popover`/`-controls`/`-action`), `draw-modal`, `mobile-generation-actions` |
| workflow-builder | `wf-builder`, `wf-flow` (new custom flow engine), `wf-node-text/-image/-video/-audio/-api/-upload/-concat/-combiner`, `wf-chat`, `wf-audio-player`, `wf-video-player`, `wf-nodes-nav`, `wf-node-options` |
| agents | `agent-chat`, `agent-profile`, `agent-create`, `agent-edit` |
| design-agent | `design-canvas`, `design-canvas-area` (Konva stage; public methods = the old imperative API), `design-plan` |

### 3.3 Foundation modules (replace React infrastructure)

| React today | Replacement |
|---|---|
| `react-router-dom` + hand-rolled `pushState` in `app-shell` | `src/lib/router.js` — ~80-line path router: `navigate(path)`, `match(path)`, subscribes to `popstate`. Routes: `/`, `/studio/:name`, `/agents/:id`, `/agents/create`, `/agents/edit/:id`, `/workflow/…` |
| (implicit React context from `ReactFlowProvider`, `next/*`) | `src/lib/store.js` — tiny pub/sub singleton for app state (user, balance, apiKey, theme); flow-level state inside `wf-flow`'s controller (see §4) |
| `next-themes` | `src/lib/theme.js` — `data-theme` attr on `<html>` + CSS custom properties |
| `useState` / `useEffect` / `useRef` | Lit reactive fields / `firstUpdated()`·`willUpdate()`·`updated()` / instance fields via `this.querySelector` |
| props (embedding contract) | `static properties` (attributes) — keeps white-label contract |
| `forwardRef` / `useImperativeHandle` | plain public methods on the element + `<slot>` for child composition (`PromptComposer` slots → `<slot name="actions">`) |
| `React.lazy` + `Suspense` | dynamic `import()` in `connectedCallback` with a loading state |
| `react-hot-toast` / `react-toastify` | `<app-toaster>` + `toast()` helper, API-compatible (`toast.success(msg)` etc.) — ~25 call sites are find/replace |
| `react-markdown` + `remark-gfm` | `marked` (GFM built-in) + `DOMPurify.sanitize` → lit `unsafeHTML`; `react-syntax-highlighter` → `highlight.js` |
| `react-icons` (fa) | one-time inline-SVG port into an `icon(name)` template helper (~40 icons actually used; sidebar already uses emoji) |
| `axios` | keep as-is (framework-agnostic); optional fetch cleanup later |
| `localStorage` scoping | unchanged (`persistKey.js` is framework-free) |

### 3.4 Entry & transition strategy (strangler)

1. `index.html` entry flips from `src/main.jsx` to a vanilla `src/main.js` (bootstrap: register elements, start router, mount `app-toaster`). **During migration, a one-file compat bridge** (`src/wc-bridge.js`) still mounts the *remaining* React studios into the shell's outlet div via a single `createRoot(outlet)` — one React tree at a time.
2. Each studio route flips from bridge-rendered to custom-element-rendered as it's ported. React degrades from "the framework" to "a compat renderer for unported surfaces", then disappears.
3. `main.jsx`, `App.jsx`, and the `react-router` tree are deleted in the final phase.

## 4. Hard dependency replacements (the real work)

| Dependency | Where | Replacement |
|---|---|---|
| **reactflow v11** | `NodeFlow.jsx` (2896) + `useReactFlow`/`useUpdateNodeInternals`/`useStore` in all 8 node components | **Build a `wf-flow` engine in vanilla + lit** (~2–3k LOC): absolutely-positioned node elements; SVG bezier edge layer; wheel-zoom + drag-pan via container transform; handle drag with provisional edge; selection. Public controller API: `connect`, `getEdges()`, `refreshNode(id)` (replaces `useUpdateNodeInternals`), `screenToFlowPosition`, zoom/fit. `useStore(s => s.edges)` in nodes → `el.flow.getEdges()`. MiniMap: v1 = zoom buttons only; minimap + keyboard parallax deferred (decision D3). |
| **react-konva** | `CanvasArea.jsx` (2198) | **Framework-free `konva`** (already a dep — `react-konva` is the only React-specific part). 1:1 JSX→JS mapping: `<Stage ref>` → `new Konva.Stage({container: this.shadowRoot.querySelector('.stage')})`; each shape wrapper component → factory function; refs → stored instances; `Transformer` → one shared `Konva.Transformer` bound on select. Imperative API (`addImage…resetZoom`, `CanvasArea.jsx:1272-1288`) becomes public methods on `design-canvas-area`; `CreativeCanvas` calls them on its child element. |
| `next/navigation`, `next/image`, `next/link` | `NodeFlow.jsx`, all 4 agent screens, `RenderField.jsx`, `ProfileAgent.jsx` | Router params + `<img>` + router links. **Fixes the existing crash** of `/studio/workflow` and `/agents/:id` in the Vite host. |
| `@xyflow/react`, `lucide-react`, `framer-motion`, `react-syntax-highlighter` | declared-but-unused (mostly) | drop |

## 5. Styling strategy (Tailwind inside Shadow DOM)

Problem: utility classes compiled globally won't match inside shadow roots.

- **Phase 0–5 (parity mode)**: generate a **utility stylesheet per package** with the existing Tailwind CLI (content = that package's source dir; reuses each package's existing `tailwind.config.js` + `src/tailwind.css` component classes, e.g. `.custom-scrollbar`, `.premium-glass`, skeleton keyframes). At runtime a `CSSStyleSheet` is created from the built asset and applied to every shadow root of that package via **`adoptedStyleSheets`** (one shared sheet, memory-efficient, zero duplication). Markup keeps its Tailwind classes → near-zero visual regression risk, mechanical conversion.
- **Phase 6+ (refinement, optional)**: hand-port hot elements to purpose-built scoped CSS, shrink the adopted sheets. Not on the critical path.
- **Design tokens** (`:root` custom properties from `globals.css:root`, `variables.css`, design-agent's `--bg-page` etc.) **inherit through shadow boundaries unchanged** — keep the light-DOM token sheet, elements just reference `var(--…)`.
- reactflow's own CSS goes away with reactflow; toast/modal styles live in their own sheets.

## 6. Phased plan

| Phase | Scope | Est. (1 dev) |
|---|---|---|
| **0 — Foundations** | Lit dep; `wc-base.js` (base element + adopted-sheet helper); `router.js`, `store.js`, `theme.js`; `app-toaster` + `toast()`; `icon()` helper; markdown helper (`marked`+`DOMPurify`); `scripts/gen-wc-css.mjs` (Tailwind per package → adopted sheet); vanilla `src/main.js` + `wc-bridge.js`; fix/discard legacy `src/*.js` broken tree | 3–4 d |
| **1 — Shell pilot** | `app-shell` (nav + outlet + settings overlay), `app-sidenav`, `app-settings` (SettingsPanel 305 + SettingsModal 118), `app-video-history` (156); routes `/` + `/studio/*` live on the mini router; unported studios still via bridge. **Gates the styling approach** (utility sheet + tokens + fixed-position check, R4) | 3 d |
| **2 — agents** | `agent-chat` (637+77 chat client, markdown), `agent-profile`, `agent-create`, `agent-edit`; kill `next/*` + `next-themes`; `/agents/*` routes go bridge-free | 5 d |
| **3 — studio** | Ascending complexity: `studio-apps` (377) → `studio-audio` (1127) → `studio-marketing` (961) → `studio-motion` (715) → `studio-influencer` (788) → `studio-agents` (637) → `prompt-composer` family + `mobile-generation-actions` (787) → `studio-clipping` (1150) → `studio-lipsync` (1161) → `studio-recast` (1222) → `studio-cinema` (1257) → `studio-image` (1817) + `draw-modal` canvas (1797) → `studio-video` (2225) → `studio-layers` (4057). Each: flip route to native, update QA checklist. `studio-workflow` + `studio-design` wait for P5/P4 | 15–20 d |
| **4 — design-agent** | `design-canvas` (CreativeCanvas 1893), `design-canvas-area` (Konva rewrite of CanvasArea 2198, imperative API preserved), `design-plan` (95); `studio-design` wrapper (75); theme via `theme.js`; syntax highlighting → highlight.js | 10–12 d |
| **5 — workflow-builder** | 5a `wf-flow` engine (pan/zoom/drag/handles/bezier edges/selection, controller API). 5b 8 node components (4.7k) as elements + `utility.jsx` (1248) as plain module; `RenderField`/`RenderApiField` de-Next-ified. 5c `wf-chat` (557, markdown), `wf-audio-player`/`wf-video-player` (352), `wf-nodes-nav` (480), node options (189). 5d `wf-builder` wrapper; `WorkflowStore`/`useGenerationCost` as plain modules; `studio-workflow` (1012+40) goes native. Parity pass: drag/connect/persist/run | 15–20 d |
| **6 — Remove React, harden** | Delete bridge + all `.jsx`, `react*`, `plugin-react`, unused deps (§4); repoint package `main`/`module` to new source entries, drop JSX presets from package Babel configs; fix `studio/src/index.js` (`McpCliStudio`); update or archive the 3 Next.js `client/` embedders; lint pass; smoke script (routes load, `customElements.get` defined, no console errors); final bundle/perf check | 5 d |

**Total: ~11–14 weeks solo**; ~8–9 weeks with 2 devs (P4 ∥ P3, P5 after both since `studio-workflow` depends on it).

Per-phase acceptance: `npm run build` green · route renders natively · QA checklist for that surface (generation flows, uploads, persistence across reload, settings, white-label props) · no React in that surface's bundle.

## 7. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Tailwind utilities inside shadow DOM (3,200 sites) | Per-package adopted utility sheets generated by the existing Tailwind CLI (P0); pilot (P1) validates visual parity before scaling; refinement to hand-written CSS is optional (P6+) |
| R2 | reactflow reimplementation fidelity (edge cases, minimap, keyboard) | Scope minimap/keyboard out of v1 (decision D3); record a behavior checklist from the React app *before* P5; `wf-flow` built as an isolated element so it can be iterated without touching nodes |
| R3 | Konva rewrite (2.2k lines, transformer interactions) | `konva` itself is already framework-free; 1:1 JSX→JS mapping; isolated `design-canvas-area` with a parity checklist for select/transform/zoom |
| R4 | `position: fixed` inside shadow DOM can be captured by an ancestor `transform`/`filter`/`backdrop-filter` (shell uses glass effects) | Verify in P1 pilot; if captured, render modal/toast layers as light-DOM appends on `<body>` (no portals needed — none exist today) |
| R5 | White-label embedding contract (props → events/attrs, axios interceptor, `backend:auth-required`, persist keys) drifts | Contract list in §2 is the acceptance test for every phase; attrs/properties/cb events keep 1:1 names |
| R6 | 3 Next.js client embedders break when packages go WC | Decision D1 up front; WCs are actually *easier* to embed in Next (declare the tag + register script) |
| R7 | No test suite | Codify a per-surface manual QA checklist + a `scripts/smoke.mjs` (navigate all routes, assert elements defined, capture console errors) run in P0 and every phase |
| R8 | Bundle regression vs. React | Lit + adopted sheets should be equal-or-smaller (no scheduler/JSX runtime, no reactflow); verify in P6 |

## 8. Effort estimate

| Phase | 1 dev |
|---|---|
| P0 Foundations | 3–4 d |
| P1 Shell pilot | 3 d |
| P2 agents | 5 d |
| P3 studio (13 surfaces) | 15–20 d |
| P4 design-agent | 10–12 d |
| P5 workflow-builder | 15–20 d |
| P6 React removal + hardening | 5 d |
| **Total** | **~11–14 weeks** |

## 9. Decisions

1. **D1 — Next.js client apps** (`packages/*/client`): **keep for now, remove in the future** (confirmed 2026-08-16). No WC-embed investment in P6; they stop building once packages go WC in P6 — acceptable since they are being retired. Their standalone copies/locks mean the root migration doesn't touch them.
2. **D2 — Lit** (confirmed 2026-08-16): plain JS, no decorators, no build step for Lit (native ESM, Vite consumes as-is).
3. **D3 — Workflow editor parity bar**: v1 = parity minus minimap/keyboard (zoom controls only); revisit after P5 QA.
4. **D4 — Keep JS** for all new files (minimize diff).
5. **D5 — Legacy vanilla tree** (`src/main.js`, `src/components/*.js`, `src/lib/`, `src/style.css`, `src/counter.js`): broken, unreferenced by the React tree — **deleted in P0**.
6. **D6 — Browser parity checks** (confirmed 2026-08-16): a Chrome instance on CDP `:9222` is used for every component migration — capture before/after (screenshots, DOM, interactions, console) and compare before flipping a route off the React bridge.

## 10. Suggested P0 task list (kick-off)

1. `npm i lit marked dompurify highlight.js` (root; workspaces hoist).
2. `src/lib/router.js`, `src/lib/store.js`, `src/lib/theme.js`, `src/lib/wc-base.js` (BaseElement: open shadow, adopted utility sheet, `toast` access).
3. `scripts/gen-wc-css.mjs` → `packages/*/dist/wc.css` + runtime `CSSStyleSheet` adoption helper.
4. `components/toaster.js` → `<app-toaster>` + `toast()` shim (hot-toast-compatible API).
5. `src/lib/icons.js` (port the ~40 used FA glyphs to inline SVG) + `src/lib/markdown.js`.
6. `src/main.js` entry + `wc-bridge.js`; `index.html` flips to it; React shell still renders via bridge (zero behavior change — CI: build + smoke).
7. `scripts/smoke.mjs` + per-surface QA checklist template.

## 11. P0 log (completed 2026-08-16)

Done and browser-verified (Chrome CDP `:9222`, before/after captures in `docs/migration-baselines/` + `scripts/route-capture` workflow):

- **Blocker fixed**: app did not boot at all — `ReferenceError: process is not defined` from `next/link` (`has-base-path.js`) killed module init → blank page. Minimal fix: `define: { 'process.env': '{}' }` in `vite.config.js`. (Full `next/*` removal still happens as scheduled in P2–P5.)
- **Dependencies**: `lit`, `marked`, `dompurify`, `highlight.js` (lib) added.
- **New modules**: `src/lib/wc-base.js` (BaseElement + per-package `adoptedStyleSheets`), `src/lib/router.js`, `src/lib/store.js`, `src/lib/theme.js`, `src/lib/toast.js` (hot-toast-compatible API), `src/lib/markdown.js`, `src/lib/icons.js`, `src/wc/toaster.js` (`<app-toaster>`).
- **Icon port**: actual inventory is **164 icons across ~19 react-icons sets** (fa, fa6, fi, io, io5, hi, hi2, md, ri, tb, lu, bi, bs, cg, go, ai, sl, tfi, vsc — not just FA). `scripts/collect-icons.mjs` derives the name→set map from the real JSX imports; `scripts/gen-icons.mjs` renders each via `ReactDOMServer` and bakes exact SVG markup into `src/lib/icons.js` (commit it; react-icons droppable in P6). Verified: FA fill + feather/ion stroke icon styles preserved.
- **CSS pipeline**: `scripts/gen-wc-css.mjs` → `public/wc/{shell,studio,workflow,agents,design}.css` (Tailwind v3, root theme, per-package component CSS + shared globals reset/scrollbars/glass; design v4 `@theme` block stripped for the v3 CLI). Wired into `npm run dev`/`build`; `public/wc/` gitignored. Sizes 26–82 KB per sheet.
- **Entry flip**: `index.html` → `/src/main.js` (vanilla; React tree rendered via `React.createElement` — identical tree to old `main.jsx`). Preloads sheets, inits theme, mounts `<app-toaster>`.
- **Legacy tree deleted** (was broken, unreferenced): old `src/main.js`, `src/counter.js`, `src/style.css`, `src/components/*.js` (12), `src/lib/{i18n,localInferenceClient,localModels,models,promptUtils}.js`, `src/styles/`.
- **Verification** (all green):
  - 7-route before/after DOM diff: identical on 6/7 routes incl. all render checks (buttons, inputs, canvases, video counts) and console errors (0 new; `/agents/create` still throws the pre-existing `useRouter` invariant — targeted for fix in P2; `/studio/workflow` renders header-only as before).
  - One apparent delta (`480p` button on `/studio/video`) proven to be first-cold-load async-option timing, stable across 3 repeat captures.
  - End-to-end WC plumbing: 5 sheets fetch 200; `BaseElement` probe adopted studio sheet (1151 rules, `.flex` present); `toast.success()` renders + dismisses through `<app-toaster>` shadow root; `renderMarkdown`/`iconSvg`/router/store/theme import and work in-browser.
  - `npm run build` green (7.9 s; pre-existing chunk-size warnings only).
- **Note**: `src/main.jsx` + `src/App.jsx` + `react-router-dom` stay until P1 (shell) / P6 (removal). `wc-bridge.js` from the P1 plan is superseded: React will be mounted directly from `main.js` until each surface flips, so the bridge file can be skipped.

**Next: P1 shell pilot** — `app-shell` / `app-sidenav` / `app-settings` / `app-video-history` elements + mini-router taking over `/` and `/studio/*`; per-surface before/after browser capture before flipping.

## 12. P1 log (completed 2026-08-16)

Committed `d3b0b4a`, browser-verified (Chrome CDP `:9222`, baselines in `docs/migration-baselines/`):

- **`<app-shell>`** (`src/wc/shell.js`): port of `app/app-shell.jsx`. Sidebar (brand + 15 studio nav buttons + settings trigger, exact Tailwind classes so the utility sheet styles it), `#studio-outlet` where each studio mounts as React (`StrictMode` + `BrowserRouter` — needed because studios call `useNavigate`/`Link`), conditional settings overlay (backdrop + stopPropagation, same as React version). `sheetKeys: ['shell', 'studio']`.
- **`<app-settings>`** (`src/wc/settings.js`): port of `components/SettingsPanel.jsx`. API key from localStorage (`ai_cinema_api_key`), `/api/models` fetch with `x-api-key`, model cards with download button + 2s status polling, delete stub error, auxiliary-file downloads (`llm`, `vae`), disk usage. Renders only while the overlay is open (matches React conditional).
- **`src/main.js`**: mini-router takes over `/` + `/studio/:name` → `renderShell` (reuses a single `app-shell` instance, `setStudio()` swaps the outlet). `/agents/*` still goes through the light-DOM React bridge (`renderBridge`) with a `Routes` tree declaring the same param routes so `useParams` works — the bridge is P2's exit target.
- **Fixes made along the way**: `router.js` `matchPath` returns `{pattern, handler, params}` and `dispatch` scopes patterns correctly; `wc-base.js` gained `sheetKeys` (array) support.
- **Parity harness hardened** (`scripts/route-capture.mjs` + `scripts/parity-diff.mjs`): shadow-piercing probe (deep walk + recursive shadow-root text), `String.raw` probe (regex backslashes), hard reload + two-identical-probe stability, `shadowRoots` count, 2000-char text cap. Diff tool normalizes whitespace/case-blind text, compares buttons/inputs/videos/canvases/errors with vite-dep-hash normalization, supports an expected-diff allow-list.
- **Result: `PARITY OK`** — 7 routes × (text, buttons, inputs, videos, canvases, title, errors); only expected structural diffs: `shadowRoots` 1→2 on `/` + `/studio/*` (app-shell shadow root added), `rootChildren` 0→1 on `/agents/create` (bridge wrapper). All console errors identical (incl. the known pre-existing `/agents/create` `useRouter` invariant — P2 scope).
- **Dead React shell deleted**: `src/main.jsx`, `src/App.jsx`, `app/app-shell.jsx`, `components/SettingsPanel.jsx`, `components/VideoHistoryPanel.jsx` (no remaining references; `components/` dir removed). `npm run build` green (7.3 s).

**Next: P2 agents** — `agent-chat` / `agent-profile` / `agent-create` / `agent-edit` elements, `/agents/*` off the React bridge, `next/*` + `next-themes` dependencies killed.

## 13. P2 log (completed 2026-08-16)

Browser-verified (Chrome CDP `:9222`, baselines in `docs/migration-baselines/p2-{before,after}.json`). (Note: the §12 P1 log above was written after the `d3b0b4a` commit; it goes out with this commit.)

- **Four native elements** (`src/wc/agents/`, all extending `BaseElement`, `sheetKey: 'agents'`, exact Tailwind classNames so `public/wc/agents.css` styles them):
  - `<agent-create>` (`create-agent.js`), `<agent-edit>` (`edit-agent.js`, incl. icon upload + AI icon gen, realign modal, theme picker + chat preview, delete/share), `<agent-chat>` (`agent-chat.js`, incl. streaming, media modal, drag-drop upload, pending-first-message sessionStorage flow, custom theme color panel), `<agent-profile>` (`agent-profile.js`).
  - Shared: `src/lib/agents-api.js` (`apiFetch` injecting `x-api-key` from localStorage `ai_cinema_api_key`; `xhrUpload` with progress — no auth header on the signed URL, matching the old axios interceptor), `src/wc/agents/themes.js` (copy of the package themes data).
- **`src/main.js` now bridge-free**: no React imports at all. `renderAgent(tag, props)` mounts the element full-page in `#root` (matches the old React page wrappers — no shell sidebar). `next/*` + `next-themes` had no root `package.json` entries to remove (transitive only); root `src/` has zero `next` imports. The package React src stays on disk — the Next `*/client` apps consume its `dist/` until P6.
- **New route — behavior note**: `/agents/:agentId/profile` (registered **before** `/agents/:agentId/:conversationId` so `profile` isn't captured as a conversation id). The old Vite router had no profile route; this exists so the chat header's "View Profile" works. Not part of the parity capture set (route didn't exist in before).
- **Bug found & fixed in `src/lib/wc-base.js`** (would have silently broken every directly-loaded sub-route since P1): `sheetUrl` used `new URL('wc/x.css', document.baseURI)`, which on a non-trailing-slash URL resolves to e.g. `/agents/edit/wc/agents.css` → SPA fallback HTML → adopted stylesheet with **0 rules**. Fix: absolute `(import.meta.env.BASE_URL || '/') + 'wc/' + key + '.css'`, plus `p.catch(() => pending.delete(key))` so a failed load doesn't wedge every subsequent `loadWcSheet` caller. P1 parity missed it because its diff is structure-only.
- **Lit porting gotchas hit** (see §9 rules): `unsafeHTML` is not exported from `'lit'` in 3.3.3 — import from `'lit/directives/unsafe-html.js'` (initial agent-profile import of it from `'lit'` broke the whole entry until fixed); `updateComplete` is a getter (use `updated(changed)`); each element file ends with `customElements.define(...)`.
- **Parity fix in `<agent-chat>`**: the old page checked `res.ok` silently — `console.error` fired only on network failure. Port initially logged HTTP 404s; now `err.status == null` guards the log, so `/agents/agent-1` after-capture has 0 console errors, identical to before.
- **Result: `PARITY OK`** — 8 routes × (text, buttons, inputs, videos, canvases, title, errors). Expected diffs only:
  - `/agents/create` (text, inputs 0→1, buttons 0→1, errors 1→0, shadowRoots 1→2) — before, this route **crashed** in React (`useRouter` invariant, empty text); now renders the create form.
  - `/agents/edit/agent-1` (text '' → 'Access Denied Failed to load agent details. Return to My Agents', errors 1→1: the old crash `TypeError: useParams() is null` is replaced by the original `EditAgent` behavior `console.error('Error fetching data:', HTTP 404)`, shadowRoots 1→2).
  - `/agents/agent-1` (shadowRoots 1→2) — text ('Agent not found') and errors (0) unchanged; the +1 is the element's own shadow root, same structural class as P1's shell.
- **Live verification** (success paths not reachable — the running Deno backend has **no** `/api/agents*` endpoints, all 404; documented limitation): not-found/error states verified against the live 404s; create form submit → loading → clean error box; edit → 'Access Denied' state; chat → 'Agent not found' + injected `agentDetails` theme/header/welcome render; profile → 'Agent not found' + injected full profile (header, Public badge, owner, like/share/chip sections, details rows, recent chats, suggestions; `innerText` renders byte-identical to the JSX output incl. 'by rodney' / '3 msgs · 13h ago').
- **Dead React deleted**: `src/pages/AgentChatPage.jsx`, `app/agents/**` (4 files — entire tree; no root `next.config`, so App Router pages were dead from P1's bridge removal), empty dirs removed. No remaining importers.
- **`npm run build` green** (6.8 s, pre-existing chunk-size warnings only).

**Next: P3** — first studio (video) off the React outlet as a native `<studio-video>` (plus its `studio` sheet is already adopted by the shell; flip = outlet renders the element instead of React).

## 14. P3 log (complete)

Flips go through `src/wc/shell.js` → `NATIVE_STUDIOS` map (route name → element tag); the outlet branch unmounts any React root and appends the element. Shared infra added during the phase: `src/wc/studio/prompt-composer.js` (6 `display:contents` wrapper elements + class-name/menu/icon template helpers mirroring `packages/studio/src/components/prompt/`), `src/wc/studio/mobile-generation-actions.js` (mobile card menu, `md:hidden` via `:host` media query) — both reused by every later studio.

- **P3.1 `studio-apps`** (`b6d6721`): 68 data cards, steps strip, get-template modal. `position:fixed` modal verified to cover the full viewport from inside the shadow root (R4 risk cleared — no inert/portal workarounds needed).
- **P3.2 `studio-audio`** (`be8f457`): + `audio-file-uploader` (drag/drop + 20 MB cap + progress), `premium-audio-player` (custom controls, scrub, volume, viz). 17-model dropdown w/ schema-driven form, 500 ms debounced persistence (`scopedPersistKey` + `migrateLegacyPersistKey`, load in `connectedCallback` before first render).
- **P3.3 `studio-marketing` + shared family** (`d45a9db`): hero/empty state, history grid (hover-play videos, copy/download/delete, mobile actions), format dropdown (UUGC preset list — keeps open after preset pick, as original), avatar grid w/ fullscreen carousel, ratio/res/duration dropdowns. `prompt-composer.js` + `mobile-generation-actions.js` land here because marketing is the first prompt-family studio.
- **P3.4 `studio-motion`** (VibeMotionStudio port): aspect/duration dropdowns (document `mousedown` outside-close via `composedPath`, matching the original), Generate/Edit segmented control (Edit disabled w/o sources), edit-source picker (video thumbs), remix flow w/ stale-edit detection (`animation code` / `does not have saved` error text → exit edit mode), Ctrl/Cmd+Enter generate, 1 s elapsed timer, fullscreen video overlay, bare-JSON-array persistence. Porting note: the original's delete is `setHistory(prev => …)` — **not persisted**; kept as-is (`history` state update without `saveHistory`), verified: delete removes the card, localStorage unchanged.
- **Baseline repair (P3.4 commit)**: `p3-before.json` had been re-captured (probe v2) *after* the apps/audio/marketing flips, so those three "before" entries were actually native-state → their earlier parity passes were vacuous native-vs-native. Also found the probe's `text()` walked only `shadowRoot` for shadow-owning elements and skipped their light-DOM (slotted) children — for `<prompt-composer>` composition that silently dropped the whole composer's text in native captures (React side unaffected), which is why the vacuous routes "matched". Fix: `text()` now collects both the shadow tree **and** the element's light children. Then re-captured a true full 19-route React baseline (all flips temporarily disabled, all `hg_*` LS keys cleared before each capture) and the full after set. `PARITY OK` across all 19 routes with expected diffs only: `apps.shadowRoots 2→3`, `apps.errors 2→0` (React styled-jsx warnings gone), `audio.shadowRoots 2→3`, `marketing.shadowRoots 2→8`, `vibemotion.shadowRoots 2→8`, `design.text` (unmigrated route displays the wall-clock time — non-deterministic minute tick).
- **Capture hygiene**: clear a studio's `hg_*` localStorage keys before its after-capture so before/after compare equal state.

- **P3.5 `studio-influencer`** (`c67d20b`): 788-line port; `PARITY OK`.
- **P3.6 `studio-agents`** (`81539ac`): list/chat/create/edit. Note: chat/create/edit success paths not live-verifiable — the Deno backend exposes no `/api/agents*` endpoints (404); verified via injected state.
- **P3.7 `studio-clipping`** (`ae3b9b7`): `PARITY OK` (incl. `clipping.errors 2→0` — React styled-jsx warnings gone).
- **P3.8 `studio-lipsync`** (`bac63a2`): `PARITY OK`.
- **P3.9 `studio-recast`** (`ebd6f31`): `PARITY OK`.
- **P3.10 `studio-cinema`** (`17d1e77`): + `scroll-column` camera-settings columns.
- **P3.11 `studio-image`** (`91a7e9a`): + `draw-modal` canvas workspace, `image-model-dropdown`, `image-upload-button`; cinema generating-label fix.
- **P3.12 `studio-video`** (`788dc98`): + `video-model-dropdown` (t2v/i2v/v2v model picker), motion-control mode, Seedance 2.0 Extend flow, 16-key persistence (`hg_video_studio_persistent`), multi-image i2v (vidu reference, max 7), end-frame (kling), upload size alerts, video preview chips.
- **P3.13 `studio-layers`** (`2d177d5`): 4057-line image editor — pointer/hand/lasso/regional-edit/draw/eraser/shapes tools (undo/redo stroke history, marked regions + clear), zoom/pan (50–200%) + reset, live color grading (7 accordion cards, CSS-filter pipeline, vignette/film-grain/distortion overlays, per-category + reset-all), layer-decomposition tab (hero sample load → carousel: counter, stack/solo mode, per-layer eye toggles, thumbnails, download all), upscale (3-model dropdown, x1–x8 factor, 2k/4k/8k resolution), remove-background, expand/outpaint, tools menu (9 items, "New" badges) + edit-text/enhancer/relight/angles sub-tools. No persistence; shell passes no props so `apiKey` is empty and every API action short-circuits with its verbatim toast. Verification caught and fixed three port bugs: `step=` rendered as an empty attribute (nested-template conditional-attribute pattern — lit does not expand a `TemplateResult` inside an attribute position; switched to plain interpolation), `toast('…')` calls throwing (the app toast module is an object, not callable — use `toast.show('…')`), and the floating prompt bar's `cond && html`…`` rendering a literal `false` text node when hidden (`cond ? html`…`` : nothing`).
- **P3 complete** (12/12 studio routes native): full 19-route capture → **`PARITY OK`** (text, buttons, inputs, videos, canvases, title, errors) with the 16-entry expected-diff allow-list: `shadowRoots` +native-element roots on image/video/cinema/lipsync/agents/apps/audio/marketing/recast/vibemotion/clipping/influencer/layers; `apps.errors` + `clipping.errors` 2→0 (React styled-jsx warnings gone); `design.text` (unmigrated route, wall-clock minute).

**Next: P4 `studio-design`** (design-canvas / Konva rewrite of CanvasArea — the largest single remaining surface, ~4.3k lines) → P5 `studio-workflow` (reactflow reimplementation) → P6 (React removal + hardening). Commit + push at each stage completion.
