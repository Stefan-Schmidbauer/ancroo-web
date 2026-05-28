/**
 * Smart text insertion that works across different input types:
 * - contenteditable elements (rich text editors)
 * - input/textarea elements
 * - React/Angular controlled inputs (via native setter)
 */

/**
 * Replace the current selection or focused input value with new text.
 * Returns true if insertion was successful.
 */
export async function smartInsertText(text: string): Promise<boolean> {
  const activeElement = document.activeElement;

  // Try contenteditable first (rich text editors like Gmail, Docs)
  if (activeElement && activeElement.getAttribute("contenteditable") === "true") {
    return insertIntoContentEditable(text);
  }

  // Try input/textarea
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    return insertIntoInput(activeElement, text);
  }

  // Fallback: try to replace window selection in any contenteditable ancestor
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const editableParent = (
      container instanceof Element ? container : container.parentElement
    )?.closest("[contenteditable='true']");

    if (editableParent) {
      return insertIntoContentEditable(text);
    }
  }

  // Last resort: copy to clipboard
  return copyToClipboard(text);
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

  // Use native setter to trigger React/Angular change detection
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
    const container = range.commonAncestorContainer;
    const editableParent = (
      container instanceof Element ? container : container.parentElement
    )?.closest("[contenteditable='true']");
    if (
      editableParent ||
      (activeElement && activeElement.getAttribute("contenteditable") === "true")
    ) {
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

  return copyToClipboard(text);
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
    const container = range.commonAncestorContainer;
    const editableParent = (
      container instanceof Element ? container : container.parentElement
    )?.closest("[contenteditable='true']");
    if (
      editableParent ||
      (activeElement && activeElement.getAttribute("contenteditable") === "true")
    ) {
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

  return copyToClipboard(text);
}

/** Fallback: copy text to clipboard. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
