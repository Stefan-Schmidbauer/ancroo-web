# ancroo-web — AI Workflow Browser Extension

**Language:** TypeScript / Preact (Manifest V3)
**License:** MIT
**Package manager:** pnpm (not npm/yarn)
**Build:** Vite + CRXJS

## Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest (permissions, entry points) |
| `src/background/service-worker.ts` | Hotkeys, side panel lifecycle |
| `src/content/index.ts` | Text selection detection, hotkey interception |
| `src/content/text-inserter.ts` | Smart text insertion (contenteditable, input, textarea) |
| `src/sidepanel/App.tsx` | Main app component (state, routing) |
| `src/sidepanel/main.tsx` | Preact entry point |
| `src/sidepanel/SetupScreen.tsx` | Initial LLM provider configuration |
| `src/sidepanel/CategoryManager.tsx` | Category create/edit/delete UI |
| `src/sidepanel/ProviderSettings.tsx` | LLM provider CRUD UI (extracted from Settings) |
| `src/shared/executor.ts` | Execute workflow via LLM provider |
| `src/shared/hotkeys.ts` | Hotkey binding system |
| `src/shared/local-workflows.ts` | Chrome storage CRUD for workflows |
| `src/shared/local-categories.ts` | Chrome storage CRUD for categories |
| `src/shared/backup.ts` | Export workflows/providers to JSON; import from JSON file |
| `src/shared/workflow-provider.ts` | Workflow listing from local storage |
| `src/shared/template-renderer.ts` | Prompt template rendering ({text}, {url}, … placeholders) |
| `src/shared/tab-messaging.ts` | Tab-scoped messaging between extension contexts |
| `src/shared/host-permission.ts` | Host permission request handling |
| `src/shared/settings.ts` | Settings helpers |
| `src/shared/llm/` | LLM adapters (OpenAI, Anthropic, Gemini, Ollama) |
| `src/shared/types.ts` | Core type definitions |
| `vite.config.ts` | Vite + CRXJS config, git version injection |

## Architecture

Calls LLM providers directly — no backend or server required.

**Extension Contexts:**
- **Service Worker** — Hotkey handler, side panel lifecycle
- **Content Script** — Text selection detection, hotkey interception, smart text insertion
- **Side Panel** — Preact UI (workflow list, execution, settings, history)

## LLM Providers

Adapters in `src/shared/llm/`:
- OpenAI (`openai.ts`) — Also OpenAI-compatible (OpenRouter, custom endpoints)
- Anthropic (`anthropic.ts`) — Claude API
- Gemini (`gemini.ts`) — Google Gemini
- Ollama (`ollama.ts`) — Local/LAN

## UI Components (`src/sidepanel/`)

| Component | Purpose |
|-----------|---------|
| `SetupScreen` | Initial provider configuration |
| `Settings` | Provider settings + backup import/export |
| `ProviderSettings` | LLM provider CRUD (embedded in Settings) |
| `WorkflowEditor` | Local workflow create/edit (incl. category assignment) |
| `CategoryManager` | Category create/edit/delete |
| `HistoryItem` | Cached execution results |
| `AboutPanel` | Version, commit hash |

## Cross-Repo Interfaces

**No dependency on:** ancroo-backend, ancroo-runner, ancroo-stack, ancroo-voice

## Build & Development

```bash
pnpm install
pnpm dev          # Vite dev server
pnpm build        # tsc && vite build → dist/
./build.sh        # Auto-installs pnpm, runs build
```

Load `dist/` as unpacked extension in Chrome.

Version injected from git tags (`v*`) or commit hash at build time.
