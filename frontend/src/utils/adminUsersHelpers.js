// Shared constants and helpers for the user management screen (HU-23).

export const PAGE_SIZE_OPTIONS = [10, 25, 50];

export const ROLE_LABELS = { admin: 'Administrador', user: 'Usuario' };

// The backend's audit-log `details` field is a short English sentence
// (e.g. `Role changed from "user" to "admin"` / `Status changed to active`).
// Parse the part we need and render it as a Spanish sentence.
export function describeLog(log) {
    const targetName = log.targetUser?.fullName || 'Un usuario';
    const adminName = log.admin?.fullName || 'un administrador';

    if (log.action === 'status_changed') {
        const activated = /to active$/i.test(log.details || '');
        return `${targetName} fue ${activated ? 'activado' : 'desactivado'} por ${adminName}.`;
    }

    if (log.action === 'role_changed') {
        const match = /from "(\w+)" to "(\w+)"/i.exec(log.details || '');
        if (match) {
            const [, from, to] = match;
            const fromLabel = ROLE_LABELS[from] || from;
            const toLabel = ROLE_LABELS[to] || to;
            return `${targetName} cambió de rol de ${fromLabel} a ${toLabel} por ${adminName}.`;
        }
        return `${targetName} tuvo un cambio de rol realizado por ${adminName}.`;
    }

    return log.details || `${targetName}: acción registrada por ${adminName}.`;
}

// Page numbers to show: first, current-1/current/current+1 and last,
// with an ellipsis marker wherever numbers are skipped.
export function getPageWindow(current, total) {
    const keep = new Set([1, total, current, current - 1, current + 1]);
    const sorted = [...keep].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const result = [];
    let prev = 0;
    for (const n of sorted) {
        if (prev && n - prev > 1) result.push(`ellipsis-${n}`);
        result.push(n);
        prev = n;
    }
    return result;
}
