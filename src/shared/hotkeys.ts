import type { ParsedHotkey, HotkeyBinding, HotkeyMapping } from "./types";

/** Storage key for hotkey bindings in chrome.storage.session. */
export const HOTKEY_STORAGE_KEY = "hotkeyBindings";

/**
 * Parse a hotkey string like "Ctrl+Shift+G" into a structured ParsedHotkey.
 * Returns null if the string is empty or malformed.
 */
export function parseHotkey(hotkeyStr: string): ParsedHotkey | null {
  if (!hotkeyStr || !hotkeyStr.trim()) return null;

  const parts = hotkeyStr.split("+").map((p) => p.trim().toLowerCase());
  if (parts.length === 0) return null;

  const key = parts.pop()!;
  if (!key) return null;

  const modifiers = new Set(parts);

  return {
    key,
    ctrlKey: modifiers.has("ctrl") || modifiers.has("control"),
    shiftKey: modifiers.has("shift"),
    altKey: modifiers.has("alt"),
    metaKey: modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("command"),
  };
}

/**
 * Convert server hotkey mappings into parsed bindings for the content script.
 * Filters out disabled hotkeys and those without a hotkey string.
 */
export function buildHotkeyBindings(mappings: HotkeyMapping[]): HotkeyBinding[] {
  const bindings: HotkeyBinding[] = [];

  for (const mapping of mappings) {
    if (!mapping.is_enabled || !mapping.hotkey) continue;

    const parsed = parseHotkey(mapping.hotkey);
    if (!parsed) continue;

    bindings.push({ parsed, action_slug: mapping.action_slug });
  }

  return bindings;
}

/**
 * Check if a KeyboardEvent matches a ParsedHotkey.
 * On Mac, "Ctrl" in the hotkey maps to Cmd (metaKey).
 */
export function matchesEvent(event: KeyboardEvent, hotkey: ParsedHotkey): boolean {
  if (event.key.toLowerCase() !== hotkey.key) return false;

  const isMac =
    navigator.platform?.startsWith("Mac") ||
    (navigator as unknown as Record<string, { platform?: string }>).userAgentData?.platform ===
      "macOS";

  if (isMac) {
    // "Ctrl" in hotkey → Cmd on Mac
    if (hotkey.ctrlKey && !event.metaKey) return false;
    if (!hotkey.ctrlKey && event.metaKey) return false;
  } else {
    if (hotkey.ctrlKey !== event.ctrlKey) return false;
    if (hotkey.metaKey !== event.metaKey) return false;
  }

  if (hotkey.shiftKey !== event.shiftKey) return false;
  if (hotkey.altKey !== event.altKey) return false;

  return true;
}
