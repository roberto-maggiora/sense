export type CardDisplayPreferences = {
    pinned_metrics: string[];
    show_battery_on_card: boolean;
};

const PREFS_PREFIX = 'device_prefs_';

export function getDevicePreferences(deviceId: string): CardDisplayPreferences {
    try {
        const stored = localStorage.getItem(`${PREFS_PREFIX}${deviceId}`);
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                pinned_metrics: Array.isArray(parsed.pinned_metrics) ? parsed.pinned_metrics : [],
                show_battery_on_card: typeof parsed.show_battery_on_card === 'boolean' ? parsed.show_battery_on_card : true
            };
        }
    } catch (e) {
        console.warn("Failed to read device preferences", e);
    }
    return { pinned_metrics: [], show_battery_on_card: true };
}

export function saveDevicePreferences(deviceId: string, prefs: CardDisplayPreferences) {
    try {
        localStorage.setItem(`${PREFS_PREFIX}${deviceId}`, JSON.stringify(prefs));
    } catch (e) {
        console.warn("Failed to save device preferences", e);
    }
}

const CANONICAL_PRIORITY = [
    'temperature',
    'co2',
    'humidity',
    'barometric_pressure'
];

export function getVisibleMetrics(
    availableMetrics: string[],
    metricValues: Record<string, any>,
    prefs: CardDisplayPreferences
): string[] {
    // 1. Filter out battery and metrics that have no value
    const validMetrics = availableMetrics.filter(m => m !== 'battery' && metricValues[m] != null);

    if (validMetrics.length === 0) {
        return [];
    }

    // 2. If user has pinned metrics, use them (up to 2), preserving user's order
    if (prefs.pinned_metrics && prefs.pinned_metrics.length > 0) {
        // filter out any pinned metrics that are not currently valid/available
        const validPinned = prefs.pinned_metrics.filter(m => validMetrics.includes(m));
        if (validPinned.length > 0) {
            return validPinned.slice(0, 2);
        }
    }

    // 3. Default logic if no preferences
    if (validMetrics.length <= 2) {
        return validMetrics;
    }

    // Sort by canonical priority first, then alphabetically
    const sorted = [...validMetrics].sort((a, b) => {
        const idxA = CANONICAL_PRIORITY.indexOf(a);
        const idxB = CANONICAL_PRIORITY.indexOf(b);

        const hasA = idxA !== -1;
        const hasB = idxB !== -1;

        if (hasA && hasB) return idxA - idxB;
        if (hasA) return -1;
        if (hasB) return 1;

        return a.localeCompare(b);
    });

    return sorted.slice(0, 2);
}
