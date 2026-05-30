import { WORKFLOW_CATEGORIES } from "@/shared/types";
import type { Workflow } from "@/shared/types";

/** Check if a workflow requires manual text input. */
export function needsManualInput(workflow: Workflow): boolean {
  return workflow.recipe?.input === "manual_input";
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
  if (lower.includes("permission") || lower.includes("manifest"))
    return "Cannot access this page. Select text on a regular webpage, then click an action.";
  if (lower.includes("no tab") || (lower.includes("tab") && lower.includes("missing")))
    return "No active tab found. Open a webpage and try again.";
  if (lower.includes("cannot access contents") || lower.includes("could not establish connection"))
    return "Could not connect to the page. Try refreshing the tab.";
  return msg;
}

/** Return an emoji icon for a workflow category. Checks user categories first, then workflow override, then fallback. */
export function categoryIcon(
  workflow: { category?: string | null; category_icon?: string | null },
  categories: { value: string; icon: string }[] = WORKFLOW_CATEGORIES,
): string {
  const match = categories.find((c) => c.value === workflow.category);
  if (match) return match.icon;
  return workflow.category_icon ?? "🔧";
}
