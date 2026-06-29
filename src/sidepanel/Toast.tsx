/**
 * Single in-panel feedback channel. Replaces the former three-way split
 * (page-toast on the webpage, amber notice banner, full-screen error
 * takeover). The side panel is the only orchestrator and is always open while
 * an action runs, so all feedback can live here — no cross-context messaging,
 * works on restricted pages too.
 *
 * Transient variants (processing/success/warning) auto-dismiss via the parent's
 * timer; `error` persists and is dismissible via the ✕, so a real error can be
 * read instead of vanishing after a few seconds.
 */

export type ToastVariant = "processing" | "success" | "warning" | "error";

export interface ToastState {
  text: string;
  variant: ToastVariant;
}

const VARIANT_BG: Record<ToastVariant, string> = {
  processing: "bg-blue-500",
  success: "bg-green-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

const VARIANT_ICON: Record<Exclude<ToastVariant, "processing">, string> = {
  success: "✔",
  warning: "⚠",
  error: "✘",
};

interface ToastProps {
  toast: ToastState;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const dismissible = toast.variant === "error";
  return (
    <div
      role="status"
      aria-live="polite"
      class={`fixed bottom-4 left-3 right-3 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm shadow-lg ${VARIANT_BG[toast.variant]}`}
    >
      {toast.variant === "processing" ? (
        <span class="w-3.5 h-3.5 shrink-0 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
      ) : (
        <span class="shrink-0" aria-hidden="true">
          {VARIANT_ICON[toast.variant]}
        </span>
      )}
      <span class="flex-1">{toast.text}</span>
      {dismissible && (
        <button
          onClick={onDismiss}
          class="shrink-0 text-white/70 hover:text-white"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}
