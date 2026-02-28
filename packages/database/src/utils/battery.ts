/**
 * Hawk battery raw → percent mapping
 *
 * Hawk sensor sends a numeric string in sensors[].battery:
 *   35 → 100%  (full)
 *   28 →   5%  (nearly empty)
 *
 * Linear interpolation: percent = 5 + (raw - 28) * (95 / 7)
 * Rounded to nearest integer, clamped to [0, 100].
 *
 * Returns null for null/NaN/out-of-sane-range inputs.
 */
export function hawkBatteryToPercent(raw: number | null | undefined): number | null {
    if (raw == null || isNaN(raw)) return null;

    const percent = 5 + (raw - 28) * (95 / 7);
    const rounded = Math.round(percent);

    // Clamp to [0, 100]
    return Math.max(0, Math.min(100, rounded));
}
