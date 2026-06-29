import { useState } from "preact/hooks";
import type { HistoryEntry } from "@/shared/types";
import { timeAgo } from "./utils";

/** History item with copy button and expandable output. */
export function HistoryItem({
  entry,
  onCopy,
  onView,
}: {
  entry: HistoryEntry;
  onCopy: (text: string) => Promise<void>;
  onView: (entry: HistoryEntry) => void;
}) {
  const [justCopied, setJustCopied] = useState(false);
  const hasFull = !!entry.output_full;

  async function handleCopy(e: Event) {
    e.stopPropagation();
    const text = entry.output_full ?? entry.output_preview;
    if (!text) return;
    await onCopy(text);
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 1500);
  }

  return (
    <div
      class={`p-2 bg-white rounded border text-xs ${hasFull ? "cursor-pointer hover:border-blue-300" : ""}`}
      onClick={() => hasFull && onView(entry)}
    >
      <div class="flex items-center justify-between gap-1">
        <span class="font-medium truncate">{entry.action_name}</span>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="text-gray-400">{timeAgo(entry.timestamp)}</span>
          <span class={entry.success ? "text-green-600" : "text-red-600"}>
            {entry.success ? "OK" : "Error"}
          </span>
          {entry.success && (entry.output_full || entry.output_preview) && (
            <button
              onClick={handleCopy}
              class="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
              title="Copy to clipboard"
            >
              {justCopied ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="text-green-500"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
      {entry.output_preview && (
        <div class="text-gray-500 mt-0.5 truncate">{entry.output_preview}</div>
      )}
    </div>
  );
}
