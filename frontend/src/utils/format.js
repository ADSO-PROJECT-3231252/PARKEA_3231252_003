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

// "2 horas 30 minutos" / "1 hora 00 minutos" / "30 minutos".
export const formatDuration = (startIso, endIso) => {
    const totalMinutes = Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const paddedMinutes = String(minutes).padStart(2, '0');
    if (hours === 0) return `${minutes} minutos`;
    return `${hours} ${hours === 1 ? 'hora' : 'horas'} ${paddedMinutes} minutos`;
};