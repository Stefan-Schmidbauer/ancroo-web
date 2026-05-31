# Chrome Web Store — Permission Justifications

Canonical source for the permission justification texts entered in the Chrome
Web Store Developer Dashboard. Keep this in sync with `manifest.json` and the
referenced code. If a permission is added/removed or its use changes, update
both the dashboard and this file in the same change.

> Note: the dashboard limit per justification is 1000 characters.

---

## `activeTab`

**Code:** content-script messaging + active-tab context (`src/background/service-worker.ts`, `src/content/`)

> Required to read the currently active tab's URL and title, which are used as context variables in AI actions (e.g., "Summarize this page"). Also used to send messages to the content script in the active tab for text selection and result insertion.

## `sidePanel`

**Code:** `src/sidepanel/` (`manifest.json` → `side_panel`)

> The entire extension UI is rendered in a Chrome side panel. Users open it to select actions, view results, configure settings, and browse execution history.

## `storage`

**Code:** `chrome.storage.local` throughout (`src/background/service-worker.ts`, `src/shared/local-workflows.ts`, history in `service-worker.ts:281`)

> Stores all user data locally in chrome.storage.local: extension settings, LLM provider configuration, API keys, action definitions, hotkey bindings, and execution history. No data is synced or sent to external servers by the extension itself.

> ⚠️ Do NOT mention "OAuth2 tokens" here — that belongs to the backend variant (ancroo-web-backend). This extension is Direct-Mode only and has no OAuth.

## `scripting`

**Code:** `src/content/text-inserter.ts`, content-script injection

> Used to inject a content script into the active tab when the user triggers an action. The content script reads selected text from the page and inserts action results back into editable fields (e.g., replacing selected text with a corrected version).

## `clipboardWrite`

**Code:** `copy_to_clipboard` action (`src/shared/types.ts:64`), `src/content/text-inserter.ts:211`

> Actions can copy results to the clipboard as an output type. When an action is configured with the "copy_to_clipboard" output, the AI-processed result is written to the clipboard so the user can paste it elsewhere.

## `downloads`

**Code:** backup export only — `src/shared/backup.ts:68` (`chrome.downloads.download(...)`)

> Used only by the backup feature. When the user clicks Export in settings, the extension serializes their actions, categories, and provider settings to a JSON file and saves it via chrome.downloads.download(). Downloads are triggered only on explicit user action; no remote content is downloaded.

> ⚠️ There is no `download_file` action — do NOT describe generic "file output". The only consumer of this permission is the backup export.

## `declarativeNetRequestWithHostAccess`

**Code:** `src/shared/llm/ollama.ts:15-24` (MODIFY_HEADERS rule overriding `Origin`)

> Required to override the Origin request header for local Ollama instances. Ollama's built-in CORS policy rejects browser requests by default. This permission allows the extension to modify the Origin header so users can connect to their local Ollama server without disabling Ollama's security settings.

---

## Host permissions

**Code:** `manifest.json` → `host_permissions` / `optional_host_permissions`; runtime requests in `src/shared/host-permission.ts`

> The extension sends user-provided text to LLM APIs for AI processing. Fixed host permissions cover the most common providers: api.openai.com (OpenAI), api.anthropic.com (Anthropic), generativelanguage.googleapis.com (Google Gemini), openrouter.ai (OpenRouter), and localhost/127.0.0.1 (local models like Ollama). Custom provider URLs are handled via optional_host_permissions and requested at runtime only when the user configures them.
