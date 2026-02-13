import { AlertRule, DeviceStatusLevel, TelemetryEvent, Operator } from '@prisma/client';

export interface EvaluationResult {
    level: DeviceStatusLevel;
    reason: any;
}

// Helper to compare values
function compare(operator: Operator, value: number, threshold: number): boolean {
    switch (operator) {
        case Operator.gt: return value > threshold;
        case Operator.gte: return value >= threshold;
        case Operator.lt: return value < threshold;
        case Operator.lte: return value <= threshold;
        default: return false;
    }
}

// Evaluate a single rule against telemetry history
export function evaluateRule(rule: AlertRule, events: TelemetryEvent[]): EvaluationResult {
    // 1. Filter events for the rule's parameter
    const relevantEvents = events.filter(e => {
        const payload = e.payload as any;
        // Check both top-level and metrics array for now, consistent with ingestion
        // But for status engine, let's assume ingestion normalized it or we look at raw if needed.
        // Simplified: check payload[parameter] or payload.metrics find param
        if (payload[rule.parameter] !== undefined) return true;
        if (Array.isArray(payload.metrics)) {
            return payload.metrics.some((m: any) => m.parameter === rule.parameter);
        }
        return false;
    }).sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()); // DESC

    if (relevantEvents.length === 0) {
        return { level: 'green', reason: null };
    }

    const latest = relevantEvents[0];
    const latestValue = getValue(latest, rule.parameter);

    if (latestValue === undefined) {
        return { level: 'green', reason: null };
    }

    // 2. Check latest point
    const isBreach = compare(rule.operator, latestValue, rule.threshold);

    if (!isBreach) {
        return { level: 'green', reason: null };
    }

    // 3. Walk backwards to find continuous breach duration
    let oldestBreachTime = new Date(latest.occurred_at).getTime();

    // We already know index 0 is a breach. Check previous ones.
    for (let i = 1; i < relevantEvents.length; i++) {
        const currentEvent = relevantEvents[i];
        const prevEvent = relevantEvents[i - 1]; // chronologically later (since filtered is DESC)

        const currentVal = getValue(currentEvent, rule.parameter);
        if (currentVal === undefined) continue; // skip malformed

        // Check if continuous
        const currentOccurred = new Date(currentEvent.occurred_at).getTime();
        const prevOccurred = new Date(prevEvent.occurred_at).getTime();

        // Gap check
        const gap = prevOccurred - currentOccurred;
        if (gap > (rule.max_gap_seconds * 1000)) {
            break; // Gap too large, stop continuity
        }

        // Value check
        if (compare(rule.operator, currentVal, rule.threshold)) {
            oldestBreachTime = currentOccurred;
        } else {
            break; // Found a non-breach point, stop continuity
        }
    }

    const durationSeconds = (new Date(latest.occurred_at).getTime() - oldestBreachTime) / 1000;

    if (durationSeconds >= rule.breach_duration_seconds) {
        return {
            level: 'red',
            reason: {
                ruleId: rule.id,
                parameter: rule.parameter,
                threshold: rule.threshold,
                operator: rule.operator,
                value: latestValue,
                duration: durationSeconds,
                since: new Date(oldestBreachTime).toISOString()
            }
        };
    } else {
        return {
            level: 'amber',
            reason: {
                ruleId: rule.id,
                parameter: rule.parameter,
                threshold: rule.threshold,
                operator: rule.operator,
                value: latestValue,
                duration: durationSeconds,
                since: new Date(oldestBreachTime).toISOString()
            }
        };
    }
}

function getValue(event: TelemetryEvent, parameter: string): number | undefined {
    const payload = event.payload as any;
    if (typeof payload[parameter] === 'number') return payload[parameter];

    if (Array.isArray(payload.metrics)) {
        const metric = payload.metrics.find((m: any) => m.parameter === parameter);
        if (metric && typeof metric.value === 'number') return metric.value;
    }

    return undefined;
}

export function aggregateStatus(results: EvaluationResult[]): EvaluationResult {
    // Red > Amber > Green
    const red = results.find(r => r.level === 'red');
    if (red) return red;

    const amber = results.find(r => r.level === 'amber');
    if (amber) return amber;

    return { level: 'green', reason: null };
}
