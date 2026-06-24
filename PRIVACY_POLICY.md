# Privacy Policy — Ancroo Browser Extension

**Effective date:** 2026-05-31
**Extension name:** Ancroo
**Developer:** Stefan Schmidbauer

## Summary

Ancroo has no servers and no analytics — the developer never receives your data, and it is never sold. Your data stays in your browser, with one exception: the text you submit to an action (and the API key that authenticates the request) is sent directly to the LLM provider you configure.

## Data Storage

All data is stored locally in your browser using `chrome.storage.local`:

| Data              | Purpose                                             | Stored where           |
| ----------------- | --------------------------------------------------- | ---------------------- |
| Settings          | Extension configuration (provider URL, model)       | `chrome.storage.local` |
| API keys          | Authentication with LLM providers                   | `chrome.storage.local` |
| Actions           | User-created action definitions                     | `chrome.storage.local` |
| Hotkey bindings   | Keyboard shortcut assignments                       | `chrome.storage.local` |
| Execution history | Last 50 action results for quick access             | `chrome.storage.local` |

`chrome.storage.local` is sandboxed per extension — websites and other extensions cannot access it. The storage is not encrypted on disk; anyone with access to your browser profile can read it.

## Data Transmission

Ancroo only sends data to LLM providers **you** configure:

- Your input text and prompts are sent to the LLM provider you selected (e.g. OpenAI, Anthropic, Google Gemini, OpenRouter, Ollama).
- Your API keys are stored locally and sent only to the corresponding provider endpoint to authenticate your requests — never to the developer or any other party.

No data is sent to the extension developer, Ancroo servers, or any third party beyond your configured providers.

## Data Collection

Ancroo does **not** collect:

- Analytics or usage statistics
- Telemetry or crash reports
- Browsing history or page content (beyond what you explicitly select for an action)
- Personally identifiable information
- Advertising data

## Permissions

| Permission                            | Why it is needed                                                   |
| ------------------------------------- | ------------------------------------------------------------------ |
| `activeTab`                           | Read the active tab's URL/title and message its content script when you run an action |
| `sidePanel`                           | Display the side panel UI                                          |
| `storage`                             | Store settings, actions, history, and hotkey bindings locally      |
| `scripting`                           | Inject content scripts for text selection and result insertion     |
| `clipboardWrite`                      | Copy an action result to the clipboard (copy-to-clipboard output action) |
| `downloads`                           | Save the backup file when you export your actions/settings to JSON |
| `declarativeNetRequestWithHostAccess` | Override the Origin header for local Ollama CORS compatibility      |

Host permissions for known LLM APIs (OpenAI, Anthropic, Gemini, OpenRouter) and localhost are declared in the manifest. Custom provider URLs are requested via `chrome.permissions.request()` only when needed.

## Data Retention

- All stored data persists until you uninstall the extension or clear it manually.
- Execution history is capped at 50 entries (oldest are removed automatically).
- Uninstalling the extension removes all stored data.

## Children

Ancroo is not directed at children under 13 and does not knowingly collect data from children.

## Changes

Changes to this policy will be reflected in this document with an updated effective date.

## Contact

For privacy questions or data requests, email support@ancroo.com. To report a security vulnerability, please use [GitHub's private vulnerability reporting](https://github.com/ancroo/ancroo-web/security/advisories/new) rather than a public issue. For other, non-sensitive questions you can open an [issue](https://github.com/ancroo/ancroo-web/issues).
