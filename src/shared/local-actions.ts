/** CRUD operations for locally stored actions. */

import type { LocalAction, CollectionRecipe } from "./types";

const STORAGE_KEY = "localActions";
/** Pre-v1.6.0 storage key. Up to v1.4.2 (live on the Web Store) actions were
 *  stored here; carried over to STORAGE_KEY once, on first read after update. */
const LEGACY_STORAGE_KEY = "localWorkflows";

/** List all local actions. */
export async function listLocalActions(): Promise<LocalAction[]> {
  const stored = await chrome.storage.local.get([STORAGE_KEY, LEGACY_STORAGE_KEY]);
  if (stored[STORAGE_KEY]) return stored[STORAGE_KEY] as LocalAction[];

  // One-time migration from the renamed key. Updating users keep their custom
  // actions; derived state (hotkey bindings) self-heals on the next refresh,
  // since bindings are rebuilt from these actions. The unused `action_type`
  // field rename needs no migration — it is written but never read.
  const legacy = stored[LEGACY_STORAGE_KEY] as LocalAction[] | undefined;
  if (legacy?.length) {
    await chrome.storage.local.set({ [STORAGE_KEY]: legacy });
    await chrome.storage.local.remove(LEGACY_STORAGE_KEY);
    return legacy;
  }
  return [];
}

/** Get a single local action by slug. */
export async function getLocalAction(slug: string): Promise<LocalAction | null> {
  const all = await listLocalActions();
  return all.find((w) => w.slug === slug) ?? null;
}

/** Save a local action (create or update by slug). */
export async function saveLocalAction(action: LocalAction): Promise<void> {
  const all = await listLocalActions();
  const idx = all.findIndex((w) => w.slug === action.slug);
  if (idx >= 0) {
    all[idx] = action;
  } else {
    all.push(action);
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

/** Delete a local action by slug. */
export async function deleteLocalAction(slug: string): Promise<void> {
  const all = await listLocalActions();
  const filtered = all.filter((w) => w.slug !== slug);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

/** Replace all local actions (used by backup restore). */
export async function replaceAllLocalActions(actions: LocalAction[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: actions });
}

/** Seed starter actions if none exist yet. Sets provider_id on all starters. */
export async function seedStarterActions(providerId: string, model: string): Promise<void> {
  const existing = await listLocalActions();
  if (existing.length > 0) return;

  const starters = getStarterActions(providerId, model);
  await chrome.storage.local.set({ [STORAGE_KEY]: starters });
}

/** Generate slugs from names. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build a LocalAction with sensible defaults. */
function makeStarter(
  name: string,
  description: string,
  promptTemplate: string,
  input: CollectionRecipe["input"],
  outputAction: string,
  providerId: string,
  model: string,
  hotkey: string | null = null,
  systemPrompt?: string,
): LocalAction {
  const slug = slugify(name);
  return {
    id: slug,
    slug,
    name,
    description,
    category: "Starter",
    category_icon: "⚡",
    default_hotkey: hotkey,
    version: "1.0.0",
    action_type: "text_transformation",
    llm_model_name: model,
    stt_model_name: null,
    tool_name: null,
    recipe: { input },
    output_action: outputAction,
    prompt_template: promptTemplate,
    provider_id: providerId,
    model,
    system_prompt: systemPrompt,
  };
}

/** Return the built-in starter actions. */
export function getStarterActions(providerId: string, model: string): LocalAction[] {
  return [
    makeStarter(
      "Summarize",
      "Summarize the selected text concisely.",
      "Summarize the following text concisely:\n\n{text}",
      "selection_plain",
      "side_panel_only",
      providerId,
      model,
      null,
      "You are a helpful assistant. Respond concisely and clearly.",
    ),
    makeStarter(
      "Translate to English",
      "Translate the selected text to English.",
      "Translate the following text to English. Only output the translation, nothing else:\n\n{text}",
      "selection_plain",
      "replace_selection",
      providerId,
      model,
    ),
    makeStarter(
      "Rewrite Formal",
      "Rewrite the selected text in a formal tone.",
      "Rewrite the following text in a formal, professional tone. Only output the rewritten text:\n\n{text}",
      "selection_plain",
      "replace_selection",
      providerId,
      model,
    ),
    makeStarter(
      "Explain",
      "Explain the selected text in simple terms.",
      "Explain the following text in simple terms, as if to someone unfamiliar with the topic:\n\n{text}",
      "selection_plain",
      "side_panel_only",
      providerId,
      model,
      null,
      "You are a helpful teacher. Explain things clearly and simply.",
    ),
    makeStarter(
      "Fix Grammar",
      "Fix grammar and spelling in the selected text.",
      "Fix all grammar and spelling errors in the following text. Only output the corrected text, nothing else:\n\n{text}",
      "selection_plain",
      "replace_selection",
      providerId,
      model,
    ),
    makeStarter(
      "Fix Capitalization",
      "Fix capitalization in the selected text.",
      "Fix the capitalization of the following text (proper names, the start of sentences, etc.). Change only capitalization -- do not alter wording or spelling. Only output the corrected text, nothing else:\n\n{text}",
      "selection_plain",
      "replace_selection",
      providerId,
      model,
    ),
    makeStarter(
      "Draft Reply",
      "Draft a professional reply to the selected message.",
      "Write a professional, courteous reply to the following message. Keep it clear, friendly, and to the point. Only output the reply:\n\n{text}",
      "selection_plain",
      "side_panel_only",
      providerId,
      model,
      null,
      "You are a helpful assistant that writes clear, professional email replies.",
    ),
    makeStarter(
      "Polite Decline",
      "Draft a polite reply that declines the request.",
      "Write a polite, empathetic reply that declines the request in the following message. Briefly explain the reason and, where reasonable, offer an alternative. Only output the reply:\n\n{text}",
      "selection_plain",
      "side_panel_only",
      providerId,
      model,
      null,
      "You are a helpful assistant that writes courteous, professional email replies.",
    ),
    makeStarter(
      "Thank-You Note",
      "Draft a warm thank-you reply to the selected message.",
      "Write a warm, sincere thank-you reply to the following message. Keep it genuine and concise. Only output the reply:\n\n{text}",
      "selection_plain",
      "side_panel_only",
      providerId,
      model,
      null,
      "You are a helpful assistant that writes warm, professional email replies.",
    ),
    makeStarter(
      "Convert to Markdown",
      "Convert the selected HTML to clean Markdown.",
      "Convert the following HTML to clean, well-formatted Markdown. Preserve headings, emphasis, links, and lists. Only output the Markdown, nothing else:\n\n{text}",
      "selection_html",
      "side_panel_only",
      providerId,
      model,
    ),
    makeStarter(
      "Ask AI",
      "Ask the AI a question.",
      "{text}",
      "manual_input",
      "side_panel_only",
      providerId,
      model,
      null,
      "You are a helpful assistant. Answer questions clearly and concisely.",
    ),
  ];
}
