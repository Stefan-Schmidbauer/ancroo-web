import type { ExtensionMessage } from "@/shared/messages";
import { matchesEvent, HOTKEY_STORAGE_KEY } from "@/shared/hotkeys";
import type { HotkeyBinding } from "@/shared/types";
import {
  smartInsertText,
  smartInsertBefore,
  smartInsertAfter,
  hasInsertTarget,
} from "./text-inserter";

// --- Injection guard ---
// This script can arrive twice in the same isolated world: once via the
// manifest declaration and once programmatically (sendToTab's inject-on-failure
// retry, or the onInstalled re-injection). Two live copies would double-handle
// every message — INSERT_TEXT inserts the result twice, each hotkey press fires
// twice. A boolean flag can't tell a live copy from an orphaned one (after an
// extension reload the old copy's flag would block the fresh injection), so
// each injection claims a unique token and older copies detect the takeover
// and disable themselves.
const injectionToken = Symbol("ancroo-content-script");
const sharedWindow = window as typeof window & { __ancrooContentScript?: symbol };
sharedWindow.__ancrooContentScript = injectionToken;
const isCurrentInjection = (): boolean => sharedWindow.__ancrooContentScript === injectionToken;

// --- Selection helpers ---
// window.getSelection() does NOT return text selected inside <textarea> or
// <input> elements, so we track the last focused field and read its selection
// directly.  We only read it while that field is still the active element,
// otherwise a selection left behind after blur would look like a current one.

let lastFocusedInput: HTMLTextAreaElement | HTMLInputElement | null = null;

document.addEventListener(
  "focus",
  (e) => {
    const el = e.target;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      lastFocusedInput = el;
    }
  },
  true,
); // capture phase — fires before blur

/**
 * The frame's current selection text — DOM selection first, then input-field
 * selection, with the same priority and whitespace gate as the GET_SELECTION
 * handler, so a value read there compares cleanly against a value read here.
 */
function currentSelectionText(): string {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && sel.toString().trim().length > 0) {
    return sel.toString();
  }
  return getInputSelection();
}

/**
 * Guard for INSERT_* handlers: when the message carries expectedText and the
 * frame's live selection no longer matches it, the user has (de)selected
 * something since the action read its input — writing now would touch text the
 * action never processed. Refuse and answer with reason "selection_changed" so
 * the side panel can tell the user instead of guessing.
 */
function insertBlockedBySelectionChange(
  expectedText: string | undefined,
  sendResponse: (response: unknown) => void,
): boolean {
  if (expectedText == null) return false;
  if (currentSelectionText() === expectedText) return false;
  sendResponse({ type: "INSERT_RESULT", success: false, reason: "selection_changed" });
  return true;
}

function getInputSelection(): string {
  const el = lastFocusedInput;
  if (
    el &&
    document.contains(el) &&
    // Only honour the selection while the field is still focused. A textarea's
    // selectionStart/End survive blur, so without this a selection left behind
    // after the user clicked away would be returned as a stale "current"
    // selection. Clicking the side panel keeps the field as activeElement
    // (only window focus is lost), so genuine runs still work.
    document.activeElement === el &&
    typeof el.selectionStart === "number" &&
    typeof el.selectionEnd === "number" &&
    el.selectionStart !== el.selectionEnd
  ) {
    return el.value.substring(el.selectionStart, el.selectionEnd);
  }
  return "";
}

// --- Hotkey handling ---

let hotkeyBindings: HotkeyBinding[] = [];

// Load initial bindings from session storage.
// If empty (or session storage rejects — it does when this script runs before
// the freshly started service worker has granted access via setAccessLevel),
// fall back to persistent local storage (survives browser restarts).
// If still empty, ask the background to refresh from local actions.
// Wrapped in try-catch to gracefully handle orphaned content scripts
// ("Extension context invalidated" after extension reload).
async function loadInitialBindings(): Promise<void> {
  let fromSession: HotkeyBinding[] = [];
  try {
    const data = await chrome.storage.session.get(HOTKEY_STORAGE_KEY);
    fromSession = (data[HOTKEY_STORAGE_KEY] as HotkeyBinding[] | undefined) ?? [];
  } catch {
    // Access not granted yet — continue with the local-storage fallback.
  }
  hotkeyBindings = fromSession;
  if (hotkeyBindings.length === 0) {
    const local = await chrome.storage.local.get(HOTKEY_STORAGE_KEY);
    hotkeyBindings = (local[HOTKEY_STORAGE_KEY] as HotkeyBinding[] | undefined) ?? [];
    if (hotkeyBindings.length > 0) {
      await chrome.storage.session.set({ [HOTKEY_STORAGE_KEY]: hotkeyBindings }).catch(() => {});
    } else {
      chrome.runtime.sendMessage({ type: "REFRESH_HOTKEYS" });
    }
  }
}
try {
  loadInitialBindings().catch(() => {});
} catch {
  // Orphaned content script — silently ignore
}

// Stay in sync when background updates the bindings. Area-scoped listener:
// the generic chrome.storage.onChanged would deliver every local-area write
// (including the full history payload) to every tab just to be discarded.
chrome.storage.session.onChanged.addListener((changes) => {
  if (!isCurrentInjection()) return;
  if (changes[HOTKEY_STORAGE_KEY]) {
    hotkeyBindings = (changes[HOTKEY_STORAGE_KEY].newValue as HotkeyBinding[]) ?? [];
  }
});

// Listen for keyboard shortcuts (capture phase to intercept before page handlers)
function hotkeyHandler(event: KeyboardEvent): void {
  // A newer injection took over — retire this copy's listener.
  if (!isCurrentInjection()) {
    document.removeEventListener("keydown", hotkeyHandler, true);
    return;
  }
  // Skip if no modifier keys are pressed — all hotkeys require at least one
  if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
  if (hotkeyBindings.length === 0) return;

  for (const binding of hotkeyBindings) {
    if (matchesEvent(event, binding.parsed)) {
      event.preventDefault();
      event.stopPropagation();

      try {
        chrome.runtime.sendMessage({
          type: "EXECUTE_HOTKEY_ACTION",
          actionSlug: binding.action_slug,
        });
      } catch {
        // "Extension context invalidated" — this content script is orphaned
        // after an extension reload.  Remove the listener so the freshly
        // injected script can handle hotkeys without interference.
        document.removeEventListener("keydown", hotkeyHandler, true);
      }
      return;
    }
  }
}
document.addEventListener("keydown", hotkeyHandler, true);

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  // A newer injection took over — let its listener answer instead.
  if (!isCurrentInjection()) {
    return false;
  }
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  if (message.type === "GET_SELECTION") {
    let text = "";
    let html = "";

    // 1. Live DOM selection — the source of truth. The page keeps its selection
    //    even when the side panel takes focus, so this is re-read fresh on every
    //    call. It MUST come first: a textarea/<input> selection survives blur
    //    indefinitely, so checking that first would let a stale field selection
    //    shadow the page text the user just highlighted.
    const sel = window.getSelection();
    // trim(): a whitespace-only DOM selection (e.g. a stray newline) is not a
    // real selection — treating it as one would shadow a genuine input-field
    // selection below, or trip the multi-frame ambiguity check for nothing.
    if (sel && sel.rangeCount > 0 && sel.toString().trim().length > 0) {
      text = sel.toString();
      const container = document.createElement("div");
      container.appendChild(sel.getRangeAt(0).cloneContents());
      // cloneContents() can return an empty fragment even when toString() has
      // text (observed on some ranges). Fall back to the plain text so
      // selection_html never receives an empty input.
      html = container.innerHTML || text;
    }

    // 2. Textarea/<input> selection — invisible to window.getSelection().
    //    Plain-text fields have no HTML, so selection_html falls back to text.
    if (!text) {
      text = getInputSelection();
      if (text) html = text;
    }

    // Whitespace-only counts as "nothing selected" — same reason as the trim
    // above, but for input-field selections.
    const hasSelection = text.trim().length > 0;

    // With all_frames:true this handler runs in EVERY frame. A frame with a
    // selection must not answer with it on the response channel, because the
    // broadcast only delivers the first response — so the caller could never
    // tell that a second frame (e.g. a left-behind selection in a read-only
    // iframe) is also selected, and might silently pick the wrong one. Instead
    // every selected frame posts a SELECTION_REPORT so the caller can gather
    // ALL of them and decide: exactly one ⇒ use it, several ⇒ ambiguous, ask
    // the user (see readSelectionAcrossFrames). Every frame — selected or not —
    // acks the round via sendResponse: Chrome's behaviour for a broadcast that
    // gets NO response is not well defined ("message port closed" rejections),
    // so the ack makes the round resolve deterministically and lets the caller
    // treat a rejection as the one thing it reliably means: no content script.
    if (message.collectId) {
      if (hasSelection) {
        try {
          void chrome.runtime
            .sendMessage({
              type: "SELECTION_REPORT",
              collectId: message.collectId,
              text,
              html,
              url: window.location.href,
              title: document.title,
            })
            .catch(() => {
              // No open receiver interested in this round — nothing to do.
            });
        } catch {
          // Orphaned content script (extension reloaded) — nothing to report.
        }
      }
      sendResponse({ type: "SELECTION_ACK" });
      return true;
    }

    // No collectId (legacy/direct caller): keep the single-response behaviour.
    if (!hasSelection) return false;
    sendResponse({
      type: "SELECTION_RESULT",
      text,
      html,
      url: window.location.href,
      title: document.title,
    });
    return true;
  }

  // Under all_frames:true these handlers run in every frame at once. Guarding
  // each keeps them acting on a single frame (no double insertion, no empty
  // top-frame shadowing page text).
  const isTopFrame = window === window.top;

  // GET_PAGE_TEXT and WRITE_CLIPBOARD have no per-frame "target": pin them to the
  // top frame, which reproduces the exact pre-all_frames behaviour.
  if (message.type === "GET_PAGE_TEXT") {
    if (!isTopFrame) return false;
    sendResponse({
      type: "PAGE_TEXT_RESULT",
      text: document.body.innerText,
      url: window.location.href,
      title: document.title,
    });
    return true;
  }

  // INSERT_* arrives frame-targeted from the side panel — addressed to the
  // exact frame the selection was read from (see applyAction), never broadcast.
  // The guard is a defensive backstop, not what makes delivery safe (see
  // hasInsertTarget): a frame without a genuine editable target stays silent
  // (return false) instead of inserting, and the side panel then shows the
  // result in the panel so it is never lost (see reportInsert in App.tsx).
  if (message.type === "INSERT_TEXT") {
    if (!hasInsertTarget()) return false;
    if (insertBlockedBySelectionChange(message.expectedText, sendResponse)) return true;
    smartInsertText(message.text).then((success) => {
      sendResponse({
        type: "INSERT_RESULT",
        success,
      });
    });
    return true; // keep channel open for async sendResponse
  }

  if (message.type === "INSERT_BEFORE") {
    if (!hasInsertTarget()) return false;
    if (insertBlockedBySelectionChange(message.expectedText, sendResponse)) return true;
    smartInsertBefore(message.text).then((success) => {
      sendResponse({ type: "INSERT_RESULT", success });
    });
    return true;
  }

  if (message.type === "INSERT_AFTER") {
    if (!hasInsertTarget()) return false;
    if (insertBlockedBySelectionChange(message.expectedText, sendResponse)) return true;
    smartInsertAfter(message.text).then((success) => {
      sendResponse({ type: "INSERT_RESULT", success });
    });
    return true;
  }

  if (message.type === "WRITE_CLIPBOARD") {
    if (!isTopFrame) return false;
    navigator.clipboard.writeText(message.text).then(
      () => sendResponse({ type: "WRITE_CLIPBOARD_RESULT", success: true }),
      () => {
        // Fallback: execCommand doesn't require user activation
        try {
          const prevActive = document.activeElement;
          const ta = document.createElement("textarea");
          ta.value = message.text;
          ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          // ta.focus() stole the focus — give it back so the user's caret
          // isn't silently dropped from the field they were working in.
          if (prevActive instanceof HTMLElement) {
            prevActive.focus({ preventScroll: true });
          }
          sendResponse({ type: "WRITE_CLIPBOARD_RESULT", success: ok });
        } catch {
          sendResponse({ type: "WRITE_CLIPBOARD_RESULT", success: false });
        }
      },
    );
    return true;
  }

  return false;
});
