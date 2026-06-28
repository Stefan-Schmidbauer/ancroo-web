/** Message types for communication between extension components. */

export interface GetSelectionMessage {
  type: "GET_SELECTION";
}

export interface SelectionResultMessage {
  type: "SELECTION_RESULT";
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

export interface InsertTextMessage {
  type: "INSERT_TEXT";
  text: string;
}

export interface InsertBeforeMessage {
  type: "INSERT_BEFORE";
  text: string;
}

export interface InsertAfterMessage {
  type: "INSERT_AFTER";
  text: string;
}

export interface InsertResultMessage {
  type: "INSERT_RESULT";
  success: boolean;
}

export interface ExecuteHotkeyWorkflowMessage {
  type: "EXECUTE_HOTKEY_WORKFLOW";
  workflowSlug: string;
  /** Hint from the content script so background can open the side panel synchronously. */
  needsSidePanel: boolean;
}

export interface ShowToastMessage {
  type: "SHOW_TOAST";
  text: string;
  variant: "processing" | "success" | "error";
  /** Auto-dismiss after ms (0 = stay until replaced). */
  duration?: number;
}

export interface HideToastMessage {
  type: "HIDE_TOAST";
}

/** TEMP debugging: append a line to a persistent on-page debug box. */
export interface DebugLogMessage {
  type: "DEBUG_LOG";
  text: string;
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
  | GetPageTextMessage
  | PageTextResultMessage
  | InsertTextMessage
  | InsertBeforeMessage
  | InsertAfterMessage
  | InsertResultMessage
  | ExecuteHotkeyWorkflowMessage
  | ShowToastMessage
  | HideToastMessage
  | DebugLogMessage
  | WriteClipboardMessage
  | WriteClipboardResultMessage;
