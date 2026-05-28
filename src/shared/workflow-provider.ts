/** Workflow listing and hotkey settings from local storage. */

import type { Workflow, HotkeyMapping } from "./types";
import { listLocalWorkflows } from "./local-workflows";

/** List all workflows from local storage. */
export async function listWorkflowsUnified(): Promise<Workflow[]> {
  return listLocalWorkflows();
}

/** Fetch hotkey mappings derived from local workflows. */
export async function fetchHotkeySettingsUnified(): Promise<HotkeyMapping[]> {
  const workflows = await listLocalWorkflows();
  return workflows
    .filter((w) => w.default_hotkey)
    .map((w) => ({
      workflow_id: w.id,
      workflow_slug: w.slug,
      workflow_name: w.name,
      hotkey: w.default_hotkey!,
      is_enabled: true,
    }));
}
