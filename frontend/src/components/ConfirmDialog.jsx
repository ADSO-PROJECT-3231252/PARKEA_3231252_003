import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

// Generic accessible confirmation modal -- no portal needed, since nothing
// in the project uses transformed ancestors that would break position:
// fixed. Shared by HU-13 (delete vehicle) and, later, HU-16 (cancel
// reservation), so the focus-trap/Escape/backdrop logic lives in exactly
// one place instead of being rebuilt for each destructive action.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  confirming = false,
  variant = "default", // 'default' | 'danger'
  error = "",
}) {
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    // Remember what had focus before opening, to restore it on close --
    // otherwise focus silently drops to <body>, a WCAG 2.1 AA gap.
    previouslyFocusedRef.current = document.activeElement;
    // Focus the least destructive action by default, so a stray Enter
    // key press right after opening can't confirm the action by accident.
    cancelButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (!confirming) onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll(
        "button:not([disabled]), [href], input, select, textarea, " +
          '[tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [open, confirming, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-neutral-900/50"
        aria-hidden="true"
        onClick={() => {
          if (!confirming) onCancel();
        }}
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="relative w-full max-w-sm rounded-lg bg-white p-6 shadow-lg"
      >
        <div className="flex items-start gap-3">
          {variant === "danger" && (
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center
                                rounded-full bg-danger-soft text-danger`}
            >
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <div>
            <h2
              id="confirm-dialog-title"
              className="text-title font-display uppercase text-neutral-900"
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-message"
              className="mt-1 text-body text-neutral-600"
            >
              {message}
            </p>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className={`mt-4 rounded-md bg-danger-soft px-3 py-2 text-caption
                            text-danger`}
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className={`rounded-md border border-neutral-200 px-4 py-2 text-label
                            text-neutral-900 transition-colors hover:border-parkea-600
                            hover:text-parkea-600 disabled:cursor-not-allowed
                            disabled:opacity-60`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={`rounded-md px-4 py-2 text-label font-medium text-white
                            transition-colors disabled:cursor-not-allowed
                            disabled:opacity-60 ${
                              variant === "danger"
                                ? "bg-danger hover:opacity-90"
                                : "bg-parkea-600 hover:bg-parkea-700"
                            }`}
          >
            {confirming ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
