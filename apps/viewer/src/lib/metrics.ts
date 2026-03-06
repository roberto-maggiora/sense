/**
 * Canonical metric metadata for chart display.
 * Single source of truth for labels, unit suffixes, and decimal precision.
 */

export type MetricMeta = {
    /** Human-readable label, e.g. "Temperature" */
    label: string;
    /** Unit suffix for display, e.g. "°C" */
    unitSuffix: string;
    /** Number of decimal places to use in the chart */
    decimals: number;
    /** Defines whether a metric is continuous (default) or discrete (state-based) */
    kind?: 'discrete' | 'continuous';
};

const METRIC_META: Record<string, MetricMeta> = {
    temperature: { label: 'Temperature', unitSuffix: '°C', decimals: 1 },
    humidity: { label: 'Humidity', unitSuffix: '%', decimals: 1 },
    co2: { label: 'CO₂', unitSuffix: ' ppm', decimals: 0 },
    barometric_pressure: { label: 'Pressure', unitSuffix: ' hPa', decimals: 1 },
    door_contact: { label: 'Door', unitSuffix: '', decimals: 0, kind: 'discrete' },
    active_power: { label: 'Active Power', unitSuffix: ' W', decimals: 0 },
    voltage: { label: 'Voltage', unitSuffix: ' V', decimals: 1 },
    current: { label: 'Current', unitSuffix: ' A', decimals: 1 },
    power_factor: { label: 'Power Factor', unitSuffix: ' %', decimals: 0 },
    power_consumption: { label: 'Energy', unitSuffix: ' kWh', decimals: 3 },
    power_present: { label: 'Power', unitSuffix: '', decimals: 0, kind: 'discrete' },
};

/**
 * Return the canonical metric metadata for a parameter key.
 * Falls back gracefully for unknown metrics.
 */
export function getMetricMeta(parameter: string): MetricMeta {
    if (METRIC_META[parameter]) return METRIC_META[parameter];

    // Fallback: titlize the parameter key
    const label = parameter
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    return { label, unitSuffix: '', decimals: 1 };
}

/**
 * Format a metric value to the correct number of decimals.
 */
export function formatMetricValue(value: number, parameter: string): string {
    const meta = getMetricMeta(parameter);

    if (meta.kind === 'discrete') {
        if (parameter === 'door_contact') {
            return value === 1 ? 'Open' : value === 0 ? 'Closed' : value.toString();
        }
        if (parameter === 'power_present') {
            return value === 1 ? 'Power OK' : value === 0 ? 'Power Lost' : value.toString();
        }
    }

    return value.toFixed(meta.decimals);
}
