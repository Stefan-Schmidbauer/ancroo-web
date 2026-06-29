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
  | GetPageTextMessage
  | PageTextResultMessage
  | InsertTextMessage
  | InsertBeforeMessage
  | InsertAfterMessage
  | InsertResultMessage
  | ExecuteHotkeyActionMessage
  | WriteClipboardMessage
  | WriteClipboardResultMessage;
