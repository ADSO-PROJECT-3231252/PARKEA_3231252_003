import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { formatDate, formatTime } from '../utils/format';
import { describeLog } from '../utils/adminUsersHelpers';

// Read-only dialog with the details of one "Cambios recientes" entry (HU-23).
// Same keyboard behaviour as ConfirmDialog (WCAG 2.1 AA): focus moves into
// the dialog on open, Tab stays inside it, Escape closes it, and focus goes
// back to the button that opened it.
export default function LogDetailsModal({ log, onClose }) {
    const dialogRef = useRef(null);
    const closeButtonRef = useRef(null);
    const previouslyFocusedRef = useRef(null);

    useEffect(() => {
        if (!log) return;

        previouslyFocusedRef.current = document.activeElement;
        closeButtonRef.current?.focus();

        function handleKeyDown(event) {
            if (event.key === 'Escape') {
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = dialogRef.current?.querySelectorAll('button:not([disabled])');
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

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            previouslyFocusedRef.current?.focus();
        };
    }, [log, onClose]);

    if (!log) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-neutral-900/50" aria-hidden="true" onClick={onClose} />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="log-dialog-title"
                className="relative w-full max-w-sm rounded-lg bg-white p-6 shadow-lg"
            >
                <div className="flex items-start justify-between gap-3">
                    <h2 id="log-dialog-title" className="text-title font-display uppercase text-neutral-900">
                        Detalle del cambio
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar"
                        className="rounded-md p-1 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                <dl className="mt-4 space-y-2.5 text-body">
                    <div className="flex justify-between gap-3">
                        <dt className="text-neutral-600">Usuario</dt>
                        <dd className="text-right text-neutral-900">{log.targetUser?.fullName || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-neutral-600">Realizado por</dt>
                        <dd className="text-right text-neutral-900">{log.admin?.fullName || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-neutral-600">Tipo de acción</dt>
                        <dd className="text-right text-neutral-900">
                            {log.action === 'role_changed' ? 'Cambio de rol' : 'Cambio de estado'}
                        </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-neutral-600">Fecha</dt>
                        <dd className="text-right font-mono text-neutral-900">
                            {formatDate(log.created_at)} {formatTime(log.created_at)}
                        </dd>
                    </div>
                </dl>

                <p className="mt-4 rounded-md bg-neutral-50 p-3 text-body text-neutral-700">{describeLog(log)}</p>

                <div className="mt-6 flex justify-end">
                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={onClose}
                        className="rounded-md bg-parkea-600 px-4 py-2 text-label font-medium text-white transition-colors hover:bg-parkea-700"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}