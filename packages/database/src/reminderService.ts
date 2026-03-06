import { PrismaClient, DeviceAlarmRule } from '@prisma/client';
import { enqueueNotification } from './notificationOutboxService';

const prisma = new PrismaClient();
const DEFAULT_REMINDER_MINUTES = 15;

export function computeReminderIntervalMinutes(rule: DeviceAlarmRule | null): number {
    if (rule?.reminder_interval_minutes != null) {
        return rule.reminder_interval_minutes;
    }
    if (rule?.duration_seconds && rule.duration_seconds > 0) {
        return Math.max(1, Math.ceil(rule.duration_seconds / 60));
    }
    return DEFAULT_REMINDER_MINUTES;
}

export async function listAlertsDueForReminder(now: Date, limit = 50) {
    const candidates = await prisma.alert.findMany({
        where: {
            status: { in: ['triggered', 'notified'] },
            acknowledged_at: null,
            snoozed_until: null,
            resolved_at: null,
        },
        include: {
            device: {
                include: {
                    site: true,
                    area: { include: { site: true } }
                }
            }
        },
        orderBy: { opened_at: 'asc' },
    });

    const dueAlerts: any[] = [];
    const nowMs = now.getTime();

    for (const alert of candidates) {
        if (dueAlerts.length >= limit) break;

        let rule = null;
        if (alert.rule_id) {
            rule = await prisma.deviceAlarmRule.findUnique({ where: { id: alert.rule_id } });
        }

        const intervalMinutes = computeReminderIntervalMinutes(rule);
        const intervalMs = intervalMinutes * 60 * 1000;
        const effectiveStartMs = alert.last_reminded_at ? alert.last_reminded_at.getTime() : alert.opened_at.getTime();

        if (nowMs >= effectiveStartMs + intervalMs) {
            dueAlerts.push({ alert, rule, intervalMs });
        }
    }

    return dueAlerts;
}

export async function enqueueReminderForAlert(alertId: string, now: Date) {
    await prisma.$transaction(async (tx) => {
        const alert = await tx.alert.findUnique({
            where: { id: alertId },
            include: { device: true }
        });

        if (!alert) return;

        if (!['triggered', 'notified'].includes(alert.status) || alert.acknowledged_at || alert.snoozed_until || alert.resolved_at) {
            return;
        }

        let rule = null;
        if (alert.rule_id) {
            rule = await tx.deviceAlarmRule.findUnique({ where: { id: alert.rule_id } });
        }

        if (rule?.reminder_max_count != null && alert.reminder_count >= rule.reminder_max_count) {
            return;
        }

        const intervalMinutes = computeReminderIntervalMinutes(rule);
        const intervalMs = intervalMinutes * 60 * 1000;

        const effectiveStartMs = alert.opened_at.getTime();
        const slotIdx = Math.floor((now.getTime() - effectiveStartMs) / intervalMs);
        const idempotencyKey = `alert:${alert.id}:reminder_slot:${slotIdx}`;

        await enqueueNotification(tx, {
            client_id: alert.client_id,
            alert_id: alert.id,
            idempotency_key: idempotencyKey,
            payload: {
                alert_id: alert.id,
                device_id: alert.device_id,
                rule_id: alert.rule_id,
                severity: alert.severity,
                current_status: alert.status,
                occurred_at: now.toISOString(),
                reason: 'reminder',
                message: `Reminder: Alert has not been acknowledged for over ${alert.reminder_count > 0 ? (alert.reminder_count * intervalMinutes) : intervalMinutes} minutes.`,
                recipients: []
            }
        });

        await tx.alert.update({
            where: { id: alert.id },
            data: {
                last_reminded_at: now,
                reminder_count: { increment: 1 }
            }
        });
    });
}
