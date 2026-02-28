/**
 * Battery Alert Service
 *
 * Evaluates battery state after each telemetry cycle and fires alerts
 * through the existing Alert state machine.
 *
 * Rules:
 *  - battery_percent < LOW_BATTERY_THRESHOLD  → create/keep active alert
 *  - battery_percent >= LOW_BATTERY_THRESHOLD → auto-resolve any open alert
 *  - battery_percent == null                  → no-op
 *
 * Notifications go through the existing NotificationOutboxItem pipeline.
 * Device status (green/amber/red/offline) is NEVER changed here.
 */

import { prisma } from './index';
import { triggerAlert, autoResolveAlert } from './alertService';
import { AlertStatus } from '@prisma/client';

// ─── Constants ────────────────────────────────────────────────────────────────

export const BATTERY_SEVERITY_RED_THRESHOLD = 10;
export const BATTERY_SEVERITY_AMBER_THRESHOLD = 25;
export const BATTERY_ALERT_PARAMETER = 'battery';

const RESOLVED_STATUSES: AlertStatus[] = ['resolved', 'auto_resolved'];

// ─── evaluateBatteryAlert ─────────────────────────────────────────────────────

/**
 * Called from updateDeviceStatusForDevice after computing the battery snapshot.
 * Idempotent — safe to call on every telemetry event.
 */
export async function evaluateBatteryAlert(
    deviceId: string,
    clientId: string,
    batteryPercent: number | null,
    occurredAt: Date,
): Promise<void> {
    if (batteryPercent == null) return; // No battery reading — nothing to do

    if (batteryPercent < BATTERY_SEVERITY_AMBER_THRESHOLD) {
        const severity = batteryPercent < BATTERY_SEVERITY_RED_THRESHOLD ? 'red' : 'amber';
        const threshold = batteryPercent < BATTERY_SEVERITY_RED_THRESHOLD ? BATTERY_SEVERITY_RED_THRESHOLD : BATTERY_SEVERITY_AMBER_THRESHOLD;

        // --- TRIGGER PATH ---
        const { id: alertId, created, severityChanged, oldSeverity } = await triggerAlert({
            client_id: clientId,
            device_id: deviceId,
            rule_id: null,
            parameter: BATTERY_ALERT_PARAMETER,
            severity,
            current_value: batteryPercent,
            threshold,
            context: {
                metric: 'battery',
                parameter: BATTERY_ALERT_PARAMETER,
                unit: 'percent',
                threshold,
                occurred_at: occurredAt.toISOString(),
            },
        });

        if (created) {
            console.log(JSON.stringify({
                event: 'battery_alert_created',
                device_id: deviceId,
                client_id: clientId,
                battery_percent: batteryPercent,
                threshold,
                severity,
                occurred_at: occurredAt.toISOString(),
                alert_id: alertId,
            }));
        } else if (severityChanged) {
            console.log(JSON.stringify({
                event: 'battery_alert_updated',
                device_id: deviceId,
                client_id: clientId,
                battery_percent: batteryPercent,
                threshold,
                oldSeverity,
                newSeverity: severity,
                occurred_at: occurredAt.toISOString(),
                alert_id: alertId,
            }));
        }

    } else {
        // --- RESOLVE PATH ---
        // Find any open battery alert for this device
        const openAlert = await prisma.alert.findFirst({
            where: {
                device_id: deviceId,
                parameter: BATTERY_ALERT_PARAMETER,
                rule_id: null,
                status: { notIn: RESOLVED_STATUSES },
            },
        });

        if (openAlert) {
            await autoResolveAlert(openAlert.id, clientId);

            console.log(JSON.stringify({
                event: 'battery_alert_resolved',
                device_id: deviceId,
                client_id: clientId,
                battery_percent: batteryPercent,
                threshold: BATTERY_SEVERITY_AMBER_THRESHOLD,
                occurred_at: occurredAt.toISOString(),
                alert_id: openAlert.id,
            }));
        }
    }
}

// ─── listDevicesNeedingBatteryReplacement ─────────────────────────────────────

export interface BatteryReplacementDevice {
    device_id: string;
    external_id: string | null;
    name: string;
    battery_percent: number | null;
    battery_raw: number | null;
    battery_updated_at: Date | null;
    alert_created_at: Date;
    alert_id: string;
    alert_status: AlertStatus;
    severity: string;
}

/**
 * Returns all devices for a client that have an active or acknowledged battery
 * alert, ordered by battery level ascending (most critical first).
 *
 * Use for the "Devices needing battery replacement" dashboard quadrant.
 */
export async function listDevicesNeedingBatteryReplacement(
    clientId: string,
): Promise<BatteryReplacementDevice[]> {
    const alerts = await prisma.alert.findMany({
        where: {
            client_id: clientId,
            parameter: BATTERY_ALERT_PARAMETER,
            status: { in: ['triggered', 'notified', 'acknowledged', 'snoozed'] },
        },
        include: {
            device: {
                include: {
                    device_status: {
                        select: {
                            battery_percent: true,
                            battery_raw: true,
                            battery_updated_at: true,
                        },
                    },
                },
            },
        },
        orderBy: [
            { severity: 'desc' }, // 'red' before 'amber' since 'r' > 'a'
            { current_value: 'asc' } // lowest battery first
        ],
    });

    return alerts.map(a => ({
        device_id: a.device_id,
        external_id: a.device.external_id,
        name: a.device.name,
        battery_percent: a.device.device_status?.battery_percent ?? null,
        battery_raw: a.device.device_status?.battery_raw ?? null,
        battery_updated_at: a.device.device_status?.battery_updated_at ?? null,
        alert_created_at: a.created_at,
        alert_id: a.id,
        alert_status: a.status,
        severity: a.severity,
    }));
}
