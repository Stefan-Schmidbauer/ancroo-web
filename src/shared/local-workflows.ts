/** CRUD operations for locally stored workflows. */

import type { LocalWorkflow, CollectionRecipe } from "./types";

const STORAGE_KEY = "localWorkflows";

/** List all local workflows. */
export async function listLocalWorkflows(): Promise<LocalWorkflow[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as LocalWorkflow[] | undefined) ?? [];
}

/** Get a single local workflow by slug. */
export async function getLocalWorkflow(slug: string): Promise<LocalWorkflow | null> {
  const all = await listLocalWorkflows();
  return all.find((w) => w.slug === slug) ?? null;
}

/** Save a local workflow (create or update by slug). */
export async function saveLocalWorkflow(workflow: LocalWorkflow): Promise<void> {
  const all = await listLocalWorkflows();
  const idx = all.findIndex((w) => w.slug === workflow.slug);
  if (idx >= 0) {
    all[idx] = workflow;
  } else {
    all.push(workflow);
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

/** Delete a local workflow by slug. */
export async function deleteLocalWorkflow(slug: string): Promise<void> {
  const all = await listLocalWorkflows();
  const filtered = all.filter((w) => w.slug !== slug);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

/** Replace all local workflows (used by backup restore). */
export async function replaceAllLocalWorkflows(workflows: LocalWorkflow[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: workflows });
}

/** Seed starter workflows if none exist yet. Sets provider_id on all starters. */
export async function seedStarterWorkflows(providerId: string, model: string): Promise<void> {
  const existing = await listLocalWorkflows();
  if (existing.length > 0) return;

  const starters = getStarterWorkflows(providerId, model);
  await chrome.storage.local.set({ [STORAGE_KEY]: starters });
}

/** Generate slugs from names. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build a LocalWorkflow with sensible defaults. */
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
): LocalWorkflow {
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
    workflow_type: "text_transformation",
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

/** Return the built-in starter workflows. */
export function getStarterWorkflows(providerId: string, model: string): LocalWorkflow[] {
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
