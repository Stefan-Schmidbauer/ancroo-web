# Chrome Web Store — Permission Justifications

Canonical source for the permission justification texts entered in the Chrome
Web Store Developer Dashboard. Keep this in sync with `manifest.json` and the
referenced code. If a permission is added/removed or its use changes, update
both the dashboard and this file in the same change.

The fenced blocks below are the exact texts to paste into the dashboard
(limit: 1000 characters per justification).

---

## `activeTab`

**Code:** content-script messaging + active-tab context (`src/background/service-worker.ts`, `src/content/`)

```text
Required to read the currently active tab's URL and title, which are used as context variables in AI actions (e.g., "Summarize this page"). Also used to send messages to the content script in the active tab for text selection and result insertion.
```

## `sidePanel`

**Code:** `src/sidepanel/` (`manifest.json` → `side_panel`)

```text
The entire extension UI is rendered in a Chrome side panel. Users open it to select actions, view results, configure settings, and browse execution history.
```

## `storage`

**Code:** `chrome.storage.local` throughout (`src/background/service-worker.ts`, `src/shared/local-actions.ts`, execution history write in `src/sidepanel/App.tsx` → `executeTextAction`)

```text
Stores all user data locally in chrome.storage.local: extension settings, LLM provider configuration, API keys, action definitions, hotkey bindings, and execution history. No data is synced or sent to external servers by the extension itself.
```

## `scripting`

**Code:** `src/shared/tab-messaging.ts` → `injectContentScript` (fallback only; primary delivery is the manifest `content_scripts` declaration)

```text
The content script (which reads selected text and inserts action results back into editable fields) normally ships declaratively via the manifest. chrome.scripting.executeScript is used only as a recovery fallback: tabs that were already open before the extension was installed or updated do not have the declarative content script, so it is injected on demand the first time the user runs an action on such a tab. Without this, users would have to reload every open tab after installing or updating the extension.
```

## `clipboardWrite`

**Code:** `copy_to_clipboard` output type (`src/shared/types.ts`), `src/content/index.ts` → `WRITE_CLIPBOARD` handler, `src/sidepanel/App.tsx` → `copyResultToClipboard`

```text
Actions can copy results to the clipboard as an output type. When an action is configured with the "copy_to_clipboard" output, the AI-processed result is written to the clipboard so the user can paste it elsewhere. The clipboard is written only for this explicitly configured output — never as a side effect of other output types.
```

## `downloads`

**Code:** backup export only — `src/shared/backup.ts` → `exportBackup` (`chrome.downloads.download(...)`)

```text
Used only by the backup feature. When the user clicks Export in settings, the extension serializes their actions, categories, and provider settings to a JSON file and saves it via chrome.downloads.download(). Downloads are triggered only on explicit user action; no remote content is downloaded.
```

## `declarativeNetRequestWithHostAccess`

**Code:** `src/shared/llm/ollama.ts` (MODIFY_HEADERS rule overriding `Origin`)

```text
Required to override the Origin request header for local Ollama instances. Ollama's built-in CORS policy rejects browser requests by default. This permission allows the extension to modify the Origin header so users can connect to their local Ollama server without disabling Ollama's security settings.
```

## Host permissions

**Code:** `manifest.json` → `host_permissions` / `optional_host_permissions` / `content_scripts` (matches + `all_frames` + `match_origin_as_fallback`); runtime requests in `src/shared/host-permission.ts`

```text
The extension sends user-provided text to LLM APIs for AI processing. Fixed host permissions cover the most common providers: api.openai.com (OpenAI), api.anthropic.com (Anthropic), generativelanguage.googleapis.com (Google Gemini), openrouter.ai (OpenRouter), and localhost/127.0.0.1 (local models like Ollama). Custom provider URLs are handled via optional_host_permissions and requested at runtime only when the user configures them. The content script runs on all http/https pages and all their frames because users can trigger actions (via hotkey or side panel) on text they select on any website — including selections inside embedded editor frames, as used by many webmail and rich-text editors. It only reads the current selection and inserts results when the user explicitly runs an action, and never transmits page content anywhere on its own.
```
