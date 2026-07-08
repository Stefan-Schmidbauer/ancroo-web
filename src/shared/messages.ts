/** Message types for communication between extension components. */

export interface GetSelectionMessage {
  type: "GET_SELECTION";
  /**
   * Correlates a selection-collection round. When present, a frame that holds a
   * selection does NOT answer with it on the response channel; instead it posts
   * a SELECTION_REPORT (tagged with this id) via chrome.runtime.sendMessage.
   * This lets the caller gather ALL frames' selections — not just the first to
   * respond — so it can tell whether exactly one frame is selected (use it) or
   * several are (ambiguous → ask the user instead of guessing the wrong one).
   * Every frame acks the round on the response channel with a SELECTION_ACK so
   * the broadcast resolves deterministically.
   */
  collectId?: string;
}

/**
 * Response-channel ack for a GET_SELECTION collection round. Carries no data —
 * the selections travel as SELECTION_REPORT messages — but guarantees the
 * broadcast gets a response, so a rejection reliably means "no content script
 * in this tab" (and never Chrome's ill-defined no-responder behaviour).
 */
export interface SelectionAckMessage {
  type: "SELECTION_ACK";
}

export interface SelectionResultMessage {
  type: "SELECTION_RESULT";
  text: string;
  html: string;
  url: string;
  title: string;
}

/**
 * One frame's answer to a GET_SELECTION collection round. Posted to the
 * extension (background + open panels) via chrome.runtime.sendMessage, matched
 * back to the initiating call by collectId.
 */
export interface SelectionReportMessage {
  type: "SELECTION_REPORT";
  collectId: string;
  text: string;
  html: string;
  url: string;
  title: string;
}

export interface GetPageTextMessage {
  type: "GET_PAGE_TEXT";
}

export interface PageTextResultMessage {
  type: "PAGE_TEXT_RESULT";
  text: string;
  url: string;
  title: string;
}

/**
 * All INSERT_* messages carry expectedText: the plain selection text the action
 * originally read (via GET_SELECTION). LLM calls take seconds, and the user may
 * have selected something else in the meantime — the content script therefore
 * refuses to write when the frame's live selection no longer matches, instead
 * of silently replacing text the action never saw (INSERT_RESULT with reason
 * "selection_changed"). Absent (legacy callers) means: skip the check.
 */
export interface InsertTextMessage {
  type: "INSERT_TEXT";
  text: string;
  expectedText?: string;
}

export interface InsertBeforeMessage {
  type: "INSERT_BEFORE";
  text: string;
  expectedText?: string;
}

export interface InsertAfterMessage {
  type: "INSERT_AFTER";
  text: string;
  expectedText?: string;
}

export interface InsertResultMessage {
  type: "INSERT_RESULT";
  success: boolean;
  /**
   * Why the insert was refused. "selection_changed": the frame's live
   * selection no longer matches expectedText, so writing would have touched
   * text the action never processed.
   */
  reason?: "selection_changed";
}

export interface ExecuteHotkeyActionMessage {
  type: "EXECUTE_HOTKEY_ACTION";
  actionSlug: string;
}

export interface WriteClipboardMessage {
  type: "WRITE_CLIPBOARD";
  text: string;
}

export interface WriteClipboardResultMessage {
  type: "WRITE_CLIPBOARD_RESULT";
  success: boolean;
}

export type ExtensionMessage =
  | GetSelectionMessage
  | SelectionResultMessage
  | SelectionReportMessage
  | SelectionAckMessage
  | GetPageTextMessage
  | PageTextResultMessage
  | InsertTextMessage
  | InsertBeforeMessage
  | InsertAfterMessage
  | InsertResultMessage
  | ExecuteHotkeyActionMessage
  | WriteClipboardMessage
  | WriteClipboardResultMessage;
