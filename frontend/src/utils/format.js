export function getInitials(fullName) {
    if (!fullName) return '?';
    return fullName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((palabra) => palabra[0].toUpperCase())
        .join('');
}

export function formatDate(isoString) {
    return new Date(isoString).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export function formatTime(isoString) {
    return new Date(isoString).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

export function formatCurrency(amount) {
    return `$ ${Math.round(Number(amount)).toLocaleString('es-CO')}`;
}