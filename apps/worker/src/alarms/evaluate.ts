import { DeviceAlarmRule, TelemetryEvent, Operator } from '@prisma/client';

export interface AlarmEvaluationResult {
    ruleId: string;
    isViolated: boolean;
    duration: number;
    latestValue: number | undefined;
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

function getValue(event: TelemetryEvent, parameter: string): number | undefined {
    const payload = event.payload as any;
    if (typeof payload[parameter] === 'number') return payload[parameter];

    if (Array.isArray(payload.metrics)) {
        const metric = payload.metrics.find((m: any) => m.parameter === parameter);
        if (metric && typeof metric.value === 'number') return metric.value;
    }

    return undefined;
}

export function evaluateAlarmRule(rule: DeviceAlarmRule, events: TelemetryEvent[]): AlarmEvaluationResult {
    console.log(`[ALARM_EVAL] Starting rule ${rule.id} evaluation for metric ${rule.metric}`);
    const relevantEvents = events.filter(e => {
        return getValue(e, rule.metric) !== undefined;
    }).sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()); // DESC

    console.log(`[ALARM_EVAL] Found ${relevantEvents.length} relevant events for metric ${rule.metric}`);

    if (relevantEvents.length === 0) {
        return { ruleId: rule.id, isViolated: false, duration: 0, latestValue: undefined };
    }

    const latest = relevantEvents[0];
    const latestValue = getValue(latest, rule.metric);

    // Stale check (e.g. older than 5 minutes)
    const now = new Date().getTime();
    if (now - new Date(latest.occurred_at).getTime() > 5 * 60 * 1000) {
        console.log(`[ALARM_EVAL] Latest data is stale. Age: ${(now - new Date(latest.occurred_at).getTime()) / 1000}s`);
        return { ruleId: rule.id, isViolated: false, duration: 0, latestValue };
    }

    if (latestValue === undefined) {
        console.log(`[ALARM_EVAL] Latest value is undefined`);
        return { ruleId: rule.id, isViolated: false, duration: 0, latestValue };
    }

    // 1. Is the latest point violating the threshold?
    const isBreach = compare(rule.operator, latestValue, rule.threshold);
    console.log(`[ALARM_EVAL] Latest point violating threshold? ${isBreach} (val: ${latestValue} vs thresh: ${rule.threshold} op: ${rule.operator})`);

    if (!isBreach) {
        return { ruleId: rule.id, isViolated: false, duration: 0, latestValue };
    }

    // 2. Walk backwards to find continuous breach duration
    let oldestBreachTime = new Date(latest.occurred_at).getTime();

    for (let i = 1; i < relevantEvents.length; i++) {
        const currentEvent = relevantEvents[i];
        const prevEvent = relevantEvents[i - 1]; // chronologically later point

        const currentVal = getValue(currentEvent, rule.metric);
        if (currentVal === undefined) continue;

        const currentOccurred = new Date(currentEvent.occurred_at).getTime();
        const prevOccurred = new Date(prevEvent.occurred_at).getTime();

        // Gap check: if there is a gap > 15 minutes, stop looking back
        const gap = prevOccurred - currentOccurred;
        if (gap > (15 * 60 * 1000)) {
            break;
        }

        if (compare(rule.operator, currentVal, rule.threshold)) {
            oldestBreachTime = currentOccurred;
        } else {
            break; // Found a non-violating point
        }
    }

    const durationSeconds = (new Date(latest.occurred_at).getTime() - oldestBreachTime) / 1000;
    console.log(`[ALARM_EVAL] Rule is breached for ${durationSeconds} seconds. Target duration: ${rule.duration_seconds}s`);

    return {
        ruleId: rule.id,
        isViolated: durationSeconds >= rule.duration_seconds,
        duration: durationSeconds,
        latestValue: latestValue
    };
}
