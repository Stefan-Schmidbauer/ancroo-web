# <img src="assets/icon-48.png" width="30" style="vertical-align: middle"> Ancroo Web

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Preact](https://img.shields.io/badge/Preact-673AB8?logo=preact&logoColor=white)](https://preactjs.com/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![pnpm](https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)

**Point. Prompt. Done.**

AI Prompt Launcher for your Browser. Point at anything on a page, run an AI prompt, get results — without leaving the tab.

Manifest V3 browser extension built with Preact and TypeScript. Calls LLM providers directly — no server or account needed.

![Ancroo](assets/screenshots/main.png)

## Features

- **Side panel UI** — browse and trigger actions from a side panel (`Alt+Shift+Y` or click the extension icon)
- **Flexible input** — pick one input per action: Selection (formatted), Selection (plain text), Whole page, or Manual entry. Whatever you choose feeds the `{text}` variable in your prompt; `{url}` and `{title}` are always available too
- **Hotkeys** — keyboard shortcuts trigger actions instantly from any page
- **Output actions** — results can replace selected text, copy to clipboard, insert before/after, or show in panel
- **Execution history** — last 50 results are stored locally for quick access and re-use
- **Multiple LLM providers** — OpenAI, Anthropic, Google Gemini, Ollama (local), OpenRouter, or any OpenAI-compatible endpoint
- **Starter actions** — six ready-to-use actions (Summarize, Translate to English, Rewrite Formal, Explain, Fix Grammar, Ask AI) are created automatically
- **Action categories** — organise actions into named categories (Starter, Writing, Coding, …) with icons; collapsible groups in the side panel
- **Action editor** — create and manage actions with custom templates, model selection, system prompt, temperature, max tokens, hotkey, and category assignment
- **Model browser** — auto-detects available models from your provider
- **Backup & restore** — export all actions, categories, and provider settings to a JSON file; import them on any device or after reinstalling
- **No server required** — everything runs in the browser extension

![Ancroo actions](assets/screenshots/new-action-sidepanel.png)

## Install

### Chrome Web Store (recommended)

[**Install Ancroo from the Chrome Web Store**](https://chromewebstore.google.com/detail/ancroo/jeaaomlligaaoohplachpimjgopjmfim)

### Manual install (developers)

Every push to `main` automatically builds the extension via GitHub Actions:

1. Open [Actions](https://github.com/ancroo/ancroo-web/actions/workflows/build.yml)
2. Click the latest successful run
3. Download the **ancroo-web-extension** artifact and unzip it

Or build locally:

```bash
pnpm install && pnpm build
# or: ./build.sh   (auto-installs pnpm via corepack if missing)
```

Then load in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` folder

## Development

```bash
pnpm dev
```

## Project Structure

```
src/
├── background/    # Service worker (hotkeys, side panel lifecycle)
├── content/       # Content script (text selection, insertion)
├── shared/        # Types, settings, LLM adapters, messages
│   └── llm/       # LLM provider adapters (OpenAI, Anthropic, Gemini, Ollama)
└── sidepanel/     # Side panel UI (Preact)
```

## Contributing

Contributions are welcome! Feel free to open an [issue](https://github.com/ancroo/ancroo-web/issues) or submit a pull request.

## Privacy

See [Privacy Policy](PRIVACY_POLICY.md) — Ancroo collects no data. All settings, API keys, and history stay in your browser. Data is only sent to LLM providers you configure.

## Security

**API Keys:** API keys are stored in `chrome.storage.local`, which is sandboxed per extension and not accessible by websites or other extensions. Keys are only sent to the configured LLM provider. Note that the storage is not encrypted on disk — anyone with access to your browser profile can read them. This is standard practice for browser extensions.

To report a security vulnerability, please use [GitHub's private vulnerability reporting](https://github.com/ancroo/ancroo-web/security/advisories/new) instead of opening a public issue.

## Acknowledgments

This project is built with the following open-source software:

| Project                                       | Purpose                            | License    |
| --------------------------------------------- | ---------------------------------- | ---------- |
| [Preact](https://preactjs.com/)               | UI framework                       | MIT        |
| [Vite](https://vite.dev/)                     | Build tool                         | MIT        |
| [CRXJS](https://crxjs.dev/vite-plugin/)       | Vite plugin for browser extensions | MIT        |
| [Tailwind CSS](https://tailwindcss.com/)      | CSS framework                      | MIT        |
| [TypeScript](https://www.typescriptlang.org/) | Language                           | Apache-2.0 |

## License

MIT — see [LICENSE](LICENSE). The Ancroo name is not covered by this license and remains the property of the author.

## Author

**Stefan Schmidbauer** — [GitHub](https://github.com/Stefan-Schmidbauer) · [stefan@ancroo.com](mailto:stefan@ancroo.com)

---

Built with the help of AI ([Claude](https://claude.ai) by Anthropic).
