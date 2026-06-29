/** Collection recipe — which single input feeds the {text} variable. */
export interface CollectionRecipe {
  input: "selection_html" | "selection_plain" | "page_text" | "manual_input";
}

/** Data packet passed to the LLM executor. The chosen input always lands in `text`. */
export interface InputDataPacket {
  text?: string;
  context?: { url: string; title: string };
}

/** Fallback category list used when no stored categories exist yet. */
export const WORKFLOW_CATEGORIES = [
  { value: "Starter", label: "Starter", icon: "⚡" },
  { value: "Writing", label: "Writing", icon: "✍️" },
  { value: "Coding", label: "Coding", icon: "💻" },
  { value: "Translation", label: "Translation", icon: "🌐" },
  { value: "Research", label: "Research", icon: "🔍" },
  { value: "Productivity", label: "Productivity", icon: "⚙️" },
  { value: "Custom", label: "Custom", icon: "🔧" },
];

export type WorkflowCategory = string;

/** Workflow definition from the backend. */
export interface Workflow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  category_icon: string | null;
  default_hotkey: string | null;
  version: string;
  workflow_type: string;
  llm_model_name: string | null;
  stt_model_name: string | null;
  tool_name: string | null;
  recipe: CollectionRecipe | null;
  output_action: string | null;
}

/** Local workflow stored in chrome.storage. Extends Workflow so existing UI works unchanged. */
export interface LocalWorkflow extends Workflow {
  /** Prompt template with {text}, {url}, {title} placeholders. */
  prompt_template: string;
  /** ID of the LLMProviderConfig to use. */
  provider_id: string;
  /** Model identifier sent to the provider (e.g. "gpt-4o", "claude-sonnet-4-20250514"). */
  model: string;
  /** Optional system prompt. */
  system_prompt?: string;
  /** Max tokens for the response. */
  max_tokens?: number;
  /** Temperature (0-2). */
  temperature?: number;
}

/** Result from executing a workflow. */
export interface ExecutionResult {
  text: string | null;
  action:
    | "replace_selection"
    | "copy_to_clipboard"
    | "none"
    | "insert_before"
    | "insert_after"
    | "side_panel_only";
  success: boolean;
  error: string | null;
  metadata: Record<string, unknown>;
}

/** Full execution response from the backend. */
export interface ExecuteWorkflowResponse {
  execution_id: string;
  status: "success" | "error";
  result: ExecutionResult | null;
  duration_ms: number | null;
}

/** Execution history entry (stored locally). */
export interface HistoryEntry {
  id: string;
  workflow_slug: string;
  workflow_name: string;
  input_preview: string;
  output_preview: string;
  /** Full output text for copy-to-clipboard. */
  output_full?: string;
  success: boolean;
  timestamp: number;
}

/** Single hotkey-to-workflow mapping from the server. */
export interface HotkeyMapping {
  workflow_id: string;
  workflow_slug: string;
  workflow_name: string;
  /** Effective hotkey string (custom or default), e.g. "Ctrl+Shift+G". */
  hotkey: string;
  is_enabled: boolean;
}

/** Parsed hotkey for efficient KeyboardEvent matching. */
export interface ParsedHotkey {
  /** The main key, lowercased (e.g. "g", "r", "1"). */
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** A parsed hotkey bound to a workflow slug for the content script. */
export interface HotkeyBinding {
  parsed: ParsedHotkey;
  workflow_slug: string;
}
