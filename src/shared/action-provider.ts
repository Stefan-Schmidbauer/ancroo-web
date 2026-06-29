/** Action listing and hotkey settings from local storage. */

import type { Action, HotkeyMapping } from "./types";
import { listLocalActions } from "./local-actions";

/** List all actions from local storage. */
export async function listActionsUnified(): Promise<Action[]> {
  return listLocalActions();
}

/** Fetch hotkey mappings derived from local actions. */
export async function fetchHotkeySettingsUnified(): Promise<HotkeyMapping[]> {
  const actions = await listLocalActions();
  return actions
    .filter((w) => w.default_hotkey)
    .map((w) => ({
      action_id: w.id,
      action_slug: w.slug,
      action_name: w.name,
      hotkey: w.default_hotkey!,
      is_enabled: true,
    }));
}
