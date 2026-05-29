# Changelog

All notable changes to the Ancroo browser extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.2] — 2026-05-29

### Fixed

- Backup restore now replaces workflows and categories instead of merging them onto the seeded starter actions and default categories, so a restored profile matches the exported snapshot exactly

## [0.5.0] — 2026-05-28

### Added

- Page Text input source — feed the full visible page text into a prompt via `{page_text}` variable
- Context-aware variable hints in workflow editor — shown variables adapt to selected input source

### Changed

- `{text}` and `{html}` variables now documented as selection-specific in the editor
- Error results now use `side_panel_only` action consistently
- Store listing and README updated to reflect new input sources

### Removed

- Form fields collect source and all related selector logic
- Audio recording and file upload collect sources
- `GET_PAGE_HTML` / `PAGE_HTML_RESULT` messages replaced by `GET_PAGE_TEXT` / `PAGE_TEXT_RESULT`
- `fill_fields`, `notification`, `download_file` output actions
- `{fields}` template variable

## [0.4.0] — 2026-05-28

### Added

- LLM provider support — OpenAI, Anthropic, Gemini, Ollama, OpenRouter (and any OpenAI-compatible endpoint)
- Workflow categories — organise actions into named categories with emoji icons; collapsible groups in the side panel
- Category manager — create, rename, and delete custom categories with an emoji icon picker; actions reassigned to Uncategorized on deletion
- Category selector in action editor
- System prompt field in action editor
- Max tokens field in action editor
- Hotkey format validation in action editor (e.g. `Ctrl+Shift+G`)
- Default API endpoint display in provider settings
- Privacy policy, store listing, and promotional assets for Chrome Web Store
- Localization support (`_locales/en`)
- Backup & restore — export workflows and provider settings to JSON; import on any device

### Fixed

- Gemini API key moved from URL parameter to request header (security)
- Selector validation to prevent arbitrary DOM access in content script

### Changed

- Direct Mode only — removed Backend Mode, OAuth2 authentication, audio recording, and file upload
- Updated all dependencies and fixed known vulnerabilities

## [0.2.0] — 2026-03-20

### Added

- Collapsible workflow categories in side panel
- `page_html` input source for full page capture
- `insert_before`, `insert_after`, `download_file`, `manual_input`, `side_panel_only` output actions
- `fill_fields` action for writing results back into form fields
- HTML capture alongside text from selections
- Improved workflow execution feedback and error handling

### Fixed

- Selection handling for textarea/input and focus loss
- Empty result feedback in side panel

### Changed

- Adapted extension to Three-Area backend API
- Migrated GitHub URLs to ancroo organization

## [0.1.0] — 2026-03-05

### Added

- Initial release
- Manifest V3 Chrome extension with side panel UI
- Backend Mode — connect to self-hosted Ancroo Stack
- Push-to-talk audio recording with Whisper STT
- Context menu integration ("Run with Ancroo")
- Keyboard shortcuts (hotkeys) for workflows
- Clipboard read/write support
- Execution history (last 50 entries)
- OAuth2 PKCE authentication for multi-user backends

[Unreleased]: https://github.com/ancroo/ancroo-web/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/ancroo/ancroo-web/compare/v0.5.1...v0.5.2
[0.5.0]: https://github.com/ancroo/ancroo-web/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ancroo/ancroo-web/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ancroo/ancroo-web/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ancroo/ancroo-web/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ancroo/ancroo-web/releases/tag/v0.1.0
