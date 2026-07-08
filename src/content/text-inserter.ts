/**
 * Smart text insertion that works across different input types:
 * - contenteditable elements (rich text editors)
 * - input/textarea elements
 * - React/Angular controlled inputs (via native setter)
 */

/**
 * Editable-host detection. An attribute-equals check ('true') misses the
 * empty-attribute form (<div contenteditable>), inherited editability
 * (isContentEditable covers both), and "plaintext-only" (not reflected by
 * isContentEditable in all engines) — those would make the insert fail on
 * fields that are genuinely editable.
 */
function isEditable(el: unknown): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.closest("[contenteditable='plaintext-only']") != null;
}

/** The element that owns the current window selection, or null. */
function selectionElement(): Element | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const container = selection.getRangeAt(0).commonAncestorContainer;
  return container instanceof Element ? container : container.parentElement;
}

/**
 * True if THIS frame has a real insertion target — a focused editable/input, or
 * a window selection inside an editable. Mirrors exactly the conditions under
 * which smartInsert* below can insert.
 *
 * Used as a defensive backstop under manifest all_frames:true: the side panel
 * targets INSERT_* at the exact frame the selection was read from, so normally
 * only one frame is ever asked. The guard keeps a mis-addressed (or future
 * broadcast) send from inserting into a frame with nothing to insert into.
 *
 * It is NOT sufficient to make a broadcast insert safe: in a frame whose
 * <body> itself is contenteditable (common for rich-text editor iframes),
 * document.activeElement defaults to that body, so this reports true even if
 * the user never touched the frame. Frame-targeted sends stay the only safe
 * delivery for inserts.
 *
 * Reads document.activeElement (not document.hasFocus()) so it still reports
 * true while the side panel holds window focus, matching how the insert itself
 * behaves.
 */
export function hasInsertTarget(): boolean {
  const activeElement = document.activeElement;
  if (isEditable(activeElement)) return true;
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    return true;
  }
  return isEditable(selectionElement());
}

/**
 * Replace the current selection or focused input value with new text.
 * Returns true if insertion was successful.
 */
export async function smartInsertText(text: string): Promise<boolean> {
  const activeElement = document.activeElement;

  // Try contenteditable first (rich text editors like Gmail, Docs)
  if (isEditable(activeElement)) {
    return insertIntoContentEditable(text);
  }

  // Try input/textarea
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    return insertIntoInput(activeElement, text);
  }

  // Fallback: try to replace window selection in any contenteditable ancestor
  if (isEditable(selectionElement())) {
    return insertIntoContentEditable(text);
  }

  // No insertion target. Report failure honestly — the side panel then shows
  // the result and tells the user. Never silently write the clipboard instead:
  // that would overwrite user data and misreport the insert as successful.
  return false;
}

/** Insert text into a contenteditable element using execCommand. */
function insertIntoContentEditable(text: string): boolean {
  try {
    // execCommand insertText respects the current selection
    return document.execCommand("insertText", false, text);
  } catch {
    return false;
  }
}

/** Insert text into an input or textarea element. */
function insertIntoInput(element: HTMLInputElement | HTMLTextAreaElement, text: string): boolean {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;

  // Use the native value setter to trigger React/Angular change detection.
  // Deliberate trade-off: writing .value directly bypasses the browser's edit
  // history, so the user cannot Ctrl+Z this insertion in the field.
  // execCommand("insertText") would preserve undo, but controlled inputs
  // (React state) revert it — framework compatibility wins here.
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    "value",
  )?.set;

  if (nativeInputValueSetter) {
    const currentValue = element.value;
    const newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
    nativeInputValueSetter.call(element, newValue);

    // Dispatch events to notify frameworks
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    // Restore cursor position
    const newCursorPos = start + text.length;
    try {
      element.setSelectionRange(newCursorPos, newCursorPos);
    } catch {
      // email, number, range etc. don't support setSelectionRange
    }
    return true;
  }

  return false;
}

/**
 * Insert text before the current selection without replacing it.
 * Returns true if insertion was successful.
 */
export async function smartInsertBefore(text: string): Promise<boolean> {
  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    const start = activeElement.selectionStart ?? 0;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      activeElement instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )?.set;
    if (nativeSetter) {
      const val = activeElement.value;
      nativeSetter.call(
        activeElement,
        val.substring(0, start) + text + "\n" + val.substring(start),
      );
      activeElement.dispatchEvent(new Event("input", { bubbles: true }));
      activeElement.dispatchEvent(new Event("change", { bubbles: true }));
      try {
        activeElement.setSelectionRange(start, start);
      } catch {
        // email, number, range etc. don't support setSelectionRange
      }
      return true;
    }
    return false;
  }

  // Contenteditable / window selection
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (isEditable(selectionElement()) || isEditable(activeElement)) {
      const insertRange = document.createRange();
      insertRange.setStart(range.startContainer, range.startOffset);
      insertRange.collapse(true);
      // Insert text + <br> separator before the original selection
      const br = document.createElement("br");
      insertRange.insertNode(br);
      const textNode = document.createTextNode(text);
      insertRange.insertNode(textNode);
      // Move cursor before the inserted text
      selection.collapse(textNode, 0);
      return true;
    }
  }

  // No insertion target — report failure honestly (see smartInsertText).
  return false;
}

/**
 * Insert text after the current selection without replacing it.
 * Returns true if insertion was successful.
 */
export async function smartInsertAfter(text: string): Promise<boolean> {
  const activeElement = document.activeElement;

  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    const end = activeElement.selectionEnd ?? activeElement.value.length;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      activeElement instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )?.set;
    if (nativeSetter) {
      const val = activeElement.value;
      nativeSetter.call(activeElement, val.substring(0, end) + "\n" + text + val.substring(end));
      activeElement.dispatchEvent(new Event("input", { bubbles: true }));
      activeElement.dispatchEvent(new Event("change", { bubbles: true }));
      const newPos = end + 1 + text.length;
      try {
        activeElement.setSelectionRange(newPos, newPos);
      } catch {
        // email, number, range etc. don't support setSelectionRange
      }
      return true;
    }
    return false;
  }

  // Contenteditable / window selection
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (isEditable(selectionElement()) || isEditable(activeElement)) {
      const insertRange = document.createRange();
      insertRange.setStart(range.endContainer, range.endOffset);
      insertRange.collapse(true);
      // Insert <br> separator + text after the original selection
      const textNode = document.createTextNode(text);
      insertRange.insertNode(textNode);
      const br = document.createElement("br");
      insertRange.insertNode(br);
      // Move cursor after the inserted text
      selection.collapse(textNode, textNode.length);
      return true;
    }
  }

  // No insertion target — report failure honestly (see smartInsertText).
  return false;
}
