/**
 * Format a number to one decimal place.
 * Used for temperature values in the UI.
 */
export function formatTemperature(value: number | null | undefined): string {
    if (value == null) return '—';
    return value.toFixed(1);
}

/**
 * Format a humidity value to one decimal place.
 */
export function formatHumidity(value: number | null | undefined): string {
    if (value == null) return '—';
    return value.toFixed(1);
}

/**
 * Format a date/time string for display.
 * Returns a locale-aware short format.
 */
export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString(undefined, {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

/**
 * Format a date only (no time).
 */
export function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString();
    } catch {
        return iso;
    }
}
