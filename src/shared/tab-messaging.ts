/**
 * Tab messaging helper with automatic content-script injection.
 *
 * Tabs that were already open when the extension was installed do not have the
 * content script injected. This helper injects it on demand when a sendMessage
 * call fails, then retries — so callers never need to know about this.
 */

import type { SelectionReportMessage, SelectionResultMessage } from "./messages";

const injectedTabs = new Set<number>();

/** A selection plus the tab frame it came from, so a result can be written back
 *  to that exact frame instead of broadcast to every frame. */
export interface FrameSelection extends SelectionResultMessage {
  /** Tab frame id of the frame that holds the selection; undefined if unknown. */
  frameId?: number;
}

/**
 * Thrown by readSelectionAcrossFrames when more than one frame of the tab holds
 * a selection at the same time. Rather than guess which one the user meant (and
 * risk feeding — and overwriting with — the wrong text), the caller catches this
 * and asks the user to click into the intended text.
 */
export class AmbiguousSelectionError extends Error {
  constructor() {
    super("ambiguous_selection");
    this.name = "AmbiguousSelectionError";
  }
}

/**
 * Send a message to the content script in a tab, injecting it first if needed.
 * Pass a frameId to target exactly one frame (e.g. to write an insert back into
 * the same frame the selection came from) instead of broadcasting to all frames.
 */
export async function sendToTab<T = unknown>(
  tabId: number,
  message: object,
  frameId?: number,
): Promise<T> {
  const options = frameId != null ? { frameId } : undefined;
  if (!injectedTabs.has(tabId)) {
    try {
      return await chrome.tabs.sendMessage(tabId, message, options);
    } catch {
      await injectContentScript(tabId);
    }
  }

  return chrome.tabs.sendMessage(tabId, message, options) as Promise<T>;
}

/**
 * Read the current selection, no matter which frame of the tab holds it.
 *
 * window.getSelection() only sees the frame it runs in, so a selection inside a
 * (possibly cross-origin) iframe — e.g. the GMX mail body — is invisible to the
 * top frame. With the content script in every frame (manifest `all_frames: true`
 * + `match_origin_as_fallback` for srcdoc/blob frames), we broadcast a
 * GET_SELECTION collection round: every frame that holds a selection posts a
 * SELECTION_REPORT back (see the content script's GET_SELECTION handler), and we
 * gather them all within a short window.
 *
 * Why gather ALL instead of taking the first answer: selections persist per
 * frame, so several frames can be selected at once (e.g. a left-behind selection
 * in GMX's read-only mail-display iframe plus the one the user just made in the
 * compose editor). Taking whichever frame answers first is a non-deterministic
 * race that can feed — and then overwrite with — the wrong text. So:
 *   - exactly one frame selected  → use it,
 *   - none                        → empty selection,
 *   - two or more                 → throw AmbiguousSelectionError; we refuse to
 *                                    guess and let the caller ask the user.
 *
 * Deliberately avoids chrome.scripting.executeScript: programmatic injection
 * needs runtime host access per frame ORIGIN, which activeTab does not grant for
 * cross-origin child frames — it would silently skip the GMX mail iframe. A
 * declarative all_frames content script needs no such grant.
 *
 * url/title come from the tab (its top-level document) so the context stays the
 * page, not whatever iframe the selection happened to live in.
 */
export async function readSelectionAcrossFrames(tabId: number): Promise<FrameSelection> {
  const collectId = `sel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Keep each report together with the frame it came from, so we can later write
  // the result back to that exact frame (sender.frameId is provided by Chrome).
  const reports: { report: SelectionReportMessage; frameId?: number }[] = [];

  const listener = (msg: unknown, sender: chrome.runtime.MessageSender): void => {
    const m = msg as Partial<SelectionReportMessage> | null;
    // Match the round, and ignore anything not from a frame of this tab.
    if (m?.type === "SELECTION_REPORT" && m.collectId === collectId && sender.tab?.id === tabId) {
      reports.push({ report: m as SelectionReportMessage, frameId: sender.frameId });
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  try {
    // Broadcast to every frame (no frameId). Selected frames answer by posting a
    // SELECTION_REPORT via runtime messaging, not on this response channel, so
    // we can collect more than one; every frame acks the round on the response
    // channel (SELECTION_ACK), which makes the broadcast resolve
    // deterministically. Routed through sendToTab so a tab whose content script
    // is missing (open since before install, or orphaned by an extension
    // reload) gets it injected and retried; a rejection therefore reliably
    // means "no content script" and propagates ("tab_reload_required" →
    // friendly toast) instead of silently reading an empty selection.
    await sendToTab(tabId, { type: "GET_SELECTION", collectId });
    // Frames send their report synchronously inside the broadcast handler, so
    // this delay only needs to cover runtime-message delivery of the
    // already-sent reports to this listener.
    await new Promise((resolve) => setTimeout(resolve, 160));
  } finally {
    chrome.runtime.onMessage.removeListener(listener);
  }

  if (reports.length >= 2) {
    throw new AmbiguousSelectionError();
  }

  const only = reports[0];
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  return {
    type: "SELECTION_RESULT",
    text: only?.report.text ?? "",
    html: only?.report.html || only?.report.text || "",
    url: tab?.url ?? "",
    title: tab?.title ?? "",
    frameId: only?.frameId,
  };
}

async function injectContentScript(tabId: number): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const files = manifest.content_scripts?.[0]?.js ?? [];

  if (files.length === 0) {
    throw new Error("No content script files in manifest");
  }

  try {
    // allFrames reaches every frame the current grant covers (same-origin
    // frames under activeTab; cross-origin ones too if the optional <all_urls>
    // host permission was granted), so iframe selections work on tabs that
    // needed on-demand injection. Chrome may reject the whole call when some
    // frame is inaccessible, so fall back to top-frame-only (the long-standing
    // behaviour) before declaring the tab unreachable.
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files });
    } catch {
      // Programmatic injection failed — most likely because this tab was open before
      // the extension was installed and host permissions have not been granted yet.
      // Reloading the tab lets Chrome inject the content script via the manifest
      // content_scripts declaration, which does not require explicit host permissions.
      throw new Error("tab_reload_required");
    }
  }
  injectedTabs.add(tabId);

  // Give the script a moment to register its message listener
  await new Promise((r) => setTimeout(r, 80));
}
