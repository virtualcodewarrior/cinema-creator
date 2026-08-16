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
