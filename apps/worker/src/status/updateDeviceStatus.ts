import { prisma, hawkBatteryToPercent, evaluateBatteryAlert } from '@sense/database';
import { Operator, DeviceAlarmRule, TelemetryEvent, DeviceStatusLevel } from '@prisma/client';

const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

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
    if (!payload) return undefined;

    if (typeof payload[parameter] === 'number') return payload[parameter];

    const metricsArray = payload.metrics || payload.raw?.metrics;
    if (Array.isArray(metricsArray)) {
        const metric = metricsArray.find((m: any) => m?.parameter === parameter);
        if (metric && typeof metric.value === 'number') return metric.value;
    }

    return undefined;
}

function getHawkBatteryRaw(latestTelemetry: TelemetryEvent | null): number | null {
    if (!latestTelemetry) return null;
    const p = latestTelemetry.payload as any ?? latestTelemetry;
    if (p?.source !== 'hawk') return null;

    const battery1 = p?.raw?.sensor?.battery;
    const battery2 = p?.raw?.payload?.sensors?.[0]?.battery;
    const battery = battery1 ?? battery2;

    if (battery == null) return null;

    const raw = typeof battery === 'string' ? Number(battery) : Number(battery);
    if (!Number.isFinite(raw)) return null;
    return raw;
}

export async function updateDeviceStatusForDevice(deviceId: string) {
    try {
        const device = await prisma.device.findUnique({
            where: { id: deviceId },
            select: { id: true, client_id: true }
        });

        if (!device) return;

        const latestTelemetry = await prisma.telemetryEvent.findFirst({
            where: { device_id: device.id },
            orderBy: { occurred_at: 'desc' },
        });

        if (!latestTelemetry) {
            await upsertStatus(device.id, device.client_id, 'unknown', null, null);
            return;
        }

        const now = Date.now();
        const latestTime = new Date(latestTelemetry.occurred_at).getTime();

        if (now - latestTime > OFFLINE_THRESHOLD_MS) {
            await upsertStatus(device.id, device.client_id, 'offline', null, null);
            return;
        }

        const batteryRaw = getHawkBatteryRaw(latestTelemetry);
        const batterySnapshot = batteryRaw !== null
            ? {
                battery_raw: Math.round(batteryRaw),
                battery_percent: hawkBatteryToPercent(batteryRaw),
                battery_updated_at: new Date(latestTelemetry.occurred_at),
            }
            : null;

        const rules = await prisma.deviceAlarmRule.findMany({
            where: { device_id: device.id, enabled: true }
        });

        if (rules.length === 0) {
            await upsertStatus(device.id, device.client_id, 'green', null, batterySnapshot);
            await evaluateBatteryAlert(device.id, device.client_id, batterySnapshot?.battery_percent ?? null, batterySnapshot?.battery_updated_at ?? new Date());
            return;
        }

        const history = await prisma.telemetryEvent.findMany({
            where: { device_id: device.id },
            orderBy: { occurred_at: 'desc' },
            take: 300
        });

        let finalLevel: DeviceStatusLevel = 'green';
        let finalReason: any = null;

        for (const rule of rules) {
            const result = evaluateSingleRule(rule, history);

            if (result.isViolating) {
                let ruleLevel = 'amber';
                if (result.durationMet) {
                    ruleLevel = rule.severity;
                }

                if (ruleLevel === 'red') {
                    finalLevel = 'red';
                    finalReason = result.reason;
                } else if (ruleLevel === 'amber' && finalLevel !== 'red') {
                    finalLevel = 'amber';
                    finalReason = result.reason;
                }
            }
        }

        await upsertStatus(device.id, device.client_id, finalLevel, finalReason, batterySnapshot);
        await evaluateBatteryAlert(device.id, device.client_id, batterySnapshot?.battery_percent ?? null, batterySnapshot?.battery_updated_at ?? new Date());

    } catch (e: any) {
        console.error(`[updateDeviceStatusForDevice] Error updating status for device ${deviceId}: ${e.message}`);
    }
}

function evaluateSingleRule(rule: DeviceAlarmRule, events: TelemetryEvent[]) {
    const relevantEvents = events.filter(e => getValue(e, rule.metric) !== undefined)
        .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

    if (relevantEvents.length === 0) {
        return { isViolating: false, durationMet: false, reason: null };
    }

    const latest = relevantEvents[0];
    const latestValue = getValue(latest, rule.metric)!;

    const isBreach = compare(rule.operator, latestValue, rule.threshold);

    if (!isBreach) {
        return { isViolating: false, durationMet: false, reason: null };
    }

    let oldestBreachTime = new Date(latest.occurred_at).getTime();

    for (let i = 1; i < relevantEvents.length; i++) {
        const currentEvent = relevantEvents[i];
        const prevEvent = relevantEvents[i - 1];

        const currentVal = getValue(currentEvent, rule.metric);
        const currentOccurred = new Date(currentEvent.occurred_at).getTime();
        const prevOccurred = new Date(prevEvent.occurred_at).getTime();

        const gap = prevOccurred - currentOccurred;

        if (gap > (15 * 60 * 1000)) {
            break;
        }

        if (currentVal !== undefined && compare(rule.operator, currentVal, rule.threshold)) {
            oldestBreachTime = currentOccurred;
        } else {
            break;
        }
    }

    const durationSeconds = (new Date(latest.occurred_at).getTime() - oldestBreachTime) / 1000;
    const durationMet = durationSeconds >= rule.duration_seconds;

    return {
        isViolating: true,
        durationMet,
        reason: {
            ruleId: rule.id,
            metric: rule.metric,
            operator: rule.operator,
            threshold: rule.threshold,
            latestValue,
            duration: durationSeconds,
            since: new Date(oldestBreachTime).toISOString()
        }
    };
}

async function upsertStatus(deviceId: string, clientId: string, status: DeviceStatusLevel, reason: any, battery: any) {
    const batteryUpdate = battery
        ? {
            battery_raw: battery.battery_raw,
            battery_percent: battery.battery_percent,
            battery_updated_at: battery.battery_updated_at,
        }
        : {};

    await prisma.deviceStatus.upsert({
        where: { device_id: deviceId },
        update: {
            status,
            reason: reason ?? undefined,
            updated_at: new Date(),
            ...batteryUpdate,
        },
        create: {
            device_id: deviceId,
            client_id: clientId,
            status,
            reason: reason ?? undefined,
            ...batteryUpdate,
        }
    });

    console.log(`device_status_updated ${deviceId} ${status} battery=${battery?.battery_percent ?? '—'}%`);
}
