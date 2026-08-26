import { ACTION_CATEGORIES } from "@/shared/types";
import type { Action } from "@/shared/types";

/** Check if a action requires manual text input. */
export function needsManualInput(action: Action): boolean {
  return action.recipe?.input === "manual_input";
}

/** Format a timestamp as a relative time string. */
export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Map technical error messages to user-friendly descriptions. */
export function friendlyError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("tab_reload_required"))
    return "Please reload this tab — the extension needs a one-time activation on pages that were open before installation.";
  if (lower.includes("permission") || lower.includes("manifest"))
    return "Cannot access this page. Select text on a regular webpage, then click an action.";
  if (lower.includes("no tab") || (lower.includes("tab") && lower.includes("missing")))
    return "No active tab found. Open a webpage and try again.";
  if (lower.includes("cannot access contents") || lower.includes("could not establish connection"))
    return "Could not connect to the page. Try refreshing the tab.";
  return msg;
}

/** Return an emoji icon for a action category. Checks user categories first, then action override, then fallback. */
export function categoryIcon(
  action: { category?: string | null; category_icon?: string | null },
  categories: { value: string; icon: string }[] = ACTION_CATEGORIES,
): string {
  const match = categories.find((c) => c.value === action.category);
  if (match) return match.icon;
  return action.category_icon ?? "🔧";
}

/** Parse an optional numeric form field.
 *
 *  Number inputs hand back strings, and "not filled in" has to stay
 *  distinguishable from a real value: an empty field means "let the provider
 *  decide" and must yield undefined, while "0" is a legitimate setting that a
 *  truthiness check would silently discard. Unparseable input is treated as
 *  empty — letting NaN through would serialize to `null` in the request body
 *  and make the API reject the call.
 */
export function parseOptionalFloat(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Integer counterpart of {@link parseOptionalFloat} (e.g. for max_tokens). */
export function parseOptionalInt(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
