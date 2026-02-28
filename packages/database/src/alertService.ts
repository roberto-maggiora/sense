/**
 * Alert Service — stateful alert lifecycle management.
 *
 * All state transitions are atomic (alert update + event append in one Prisma transaction).
 * Illegal transitions throw with a descriptive message.
 * Export `assertTransition` for unit tests (no DB dependency).
 */

import { PrismaClient, AlertStatus, DeviceStatusLevel, Prisma } from '@prisma/client';
import { prisma } from './index';
import { enqueueNotification } from './notificationOutboxService';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface TriggerAlertInput {
    client_id: string;
    device_id: string;
    rule_id: string | null;
    parameter?: string | null;     // set for synthetic alerts (e.g. 'battery')
    severity: DeviceStatusLevel;
    current_value: number | undefined;
    threshold: number;
    context: Record<string, unknown>;
}

// Statuses that close the lifecycle
const RESOLVED_STATUSES: AlertStatus[] = ['resolved', 'auto_resolved'];

// ─────────────────────────────────────────────────────────────
// Pure transition guard (exportable for unit tests — no DB)
// ─────────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
    triggered: ['notified', 'acknowledged', 'resolved', 'auto_resolved'],
    notified: ['acknowledged', 'resolved', 'auto_resolved'],
    acknowledged: ['snoozed', 'resolved', 'auto_resolved'],
    snoozed: ['triggered', 'resolved', 'auto_resolved'],
    resolved: [],
    auto_resolved: [],
};

export function assertTransition(from: AlertStatus, to: AlertStatus): void {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
        throw new Error(`Illegal alert transition: ${from} → ${to}`);
    }
}

// ─────────────────────────────────────────────────────────────
// triggerAlert — idempotent create-or-update for an open alert
// ─────────────────────────────────────────────────────────────

export async function triggerAlert(
    input: TriggerAlertInput,
): Promise<{ id: string; created: boolean; severityChanged?: boolean; oldSeverity?: string }> {
    const now = new Date();

    return prisma.$transaction(async (tx) => {
        // Find any existing open alert for this device+rule or device+parameter
        const existing = await tx.alert.findFirst({
            where: {
                device_id: input.device_id,
                status: { notIn: RESOLVED_STATUSES },
                ...(input.rule_id
                    ? { rule_id: input.rule_id }
                    : { parameter: input.parameter ?? null, rule_id: null }
                ),
            },
        });

        if (!existing) {
            // Create new alert
            const alert = await tx.alert.create({
                data: {
                    client_id: input.client_id,
                    device_id: input.device_id,
                    rule_id: input.rule_id ?? null,
                    parameter: input.parameter ?? null,
                    severity: input.severity,
                    status: 'triggered',
                    opened_at: now,
                    last_triggered_at: now,
                    current_value: input.current_value ?? null,
                    threshold: input.threshold,
                    context_json: input.context as Prisma.InputJsonValue,
                },
            });

            const alertEvent = await tx.alertEvent.create({
                data: {
                    alert_id: alert.id,
                    client_id: input.client_id,
                    event_type: 'created',
                    metadata_json: {
                        current_value: input.current_value ?? null,
                        threshold: input.threshold,
                        severity: input.severity,
                    } as Prisma.InputJsonValue,
                },
            });

            // Enqueue notification outbox item atomically
            await enqueueNotification(tx, {
                client_id: input.client_id,
                alert_id: alert.id,
                idempotency_key: `alert:${alert.id}:event:${alertEvent.id}`,
                payload: {
                    alert_id: alert.id,
                    device_id: input.device_id,
                    rule_id: input.rule_id,
                    severity: input.severity,
                    current_status: 'triggered',
                    occurred_at: now.toISOString(),
                    message: `Alert triggered: ${input.context.metric ?? 'unknown'} ${input.context.operator ?? ''} ${input.threshold} (value: ${input.current_value ?? 'N/A'})`,
                    recipients: [],
                },
            });

            return { id: alert.id, created: true };
        }

        // Existing open alert: update last_triggered_at + current_value + severity + threshold.
        // If alert was snoozed/acknowledged while violation persisted → return to triggered.
        const wasInactive =
            existing.status === 'snoozed' || existing.status === 'acknowledged';
        const severityChanged = existing.severity !== input.severity;

        await tx.alert.update({
            where: { id: existing.id },
            data: {
                last_triggered_at: now,
                current_value: input.current_value ?? null,
                severity: input.severity,
                threshold: input.threshold,          // ← always persist latest threshold
                context_json: input.context as Prisma.InputJsonValue,
                ...(wasInactive ? { status: 'triggered', snoozed_until: null } : {}),
            },
        });

        if (wasInactive) {
            const reEvent = await tx.alertEvent.create({
                data: {
                    alert_id: existing.id,
                    client_id: input.client_id,
                    event_type: 'triggered',
                    metadata_json: {
                        previous_status: existing.status,
                        current_value: input.current_value ?? null,
                        note: 'Violation persists; returning to triggered',
                    } as Prisma.InputJsonValue,
                },
            });

            // Enqueue notification for re-trigger
            await enqueueNotification(tx, {
                client_id: input.client_id,
                alert_id: existing.id,
                idempotency_key: `alert:${existing.id}:event:${reEvent.id}`,
                payload: {
                    alert_id: existing.id,
                    device_id: input.device_id,
                    rule_id: input.rule_id,
                    severity: input.severity,
                    current_status: 'triggered',
                    occurred_at: now.toISOString(),
                    message: `Alert re-triggered (was ${existing.status}): ${input.context.metric ?? 'unknown'} ${input.context.operator ?? ''} ${input.threshold} (value: ${input.current_value ?? 'N/A'})`,
                    recipients: [],
                },
            });
        }

        // Record an event whenever severity changes, regardless of wasInactive
        if (severityChanged) {
            const sevEvent = await tx.alertEvent.create({
                data: {
                    alert_id: existing.id,
                    client_id: input.client_id,
                    event_type: 'updated',
                    metadata_json: {
                        old_severity: existing.severity,
                        new_severity: input.severity,
                        old_threshold: existing.threshold,
                        new_threshold: input.threshold,
                        current_value: input.current_value ?? null,
                    } as Prisma.InputJsonValue,
                },
            });

            // Only enqueue a notification when severity WORSENS (amber → red)
            const isEscalation =
                existing.severity === 'amber' && input.severity === 'red';

            if (isEscalation) {
                await enqueueNotification(tx, {
                    client_id: input.client_id,
                    alert_id: existing.id,
                    idempotency_key: `alert:${existing.id}:event:${sevEvent.id}`,
                    payload: {
                        alert_id: existing.id,
                        device_id: input.device_id,
                        rule_id: input.rule_id,
                        severity: input.severity,
                        current_status: existing.status,
                        occurred_at: now.toISOString(),
                        message: `Alert severity escalated from ${existing.severity} to ${input.severity}: ${input.context.metric ?? 'unknown'} (value: ${input.current_value ?? 'N/A'}, threshold: ${input.threshold})`,
                        recipients: [],
                    },
                });
            }
        }

        return {
            id: existing.id,
            created: false,
            severityChanged,
            oldSeverity: severityChanged ? existing.severity : undefined
        };
    });
}

// ─────────────────────────────────────────────────────────────
// autoResolveAlert
// ─────────────────────────────────────────────────────────────

export async function autoResolveAlert(alertId: string, clientId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const alert = await tx.alert.findUnique({ where: { id: alertId } });
        if (!alert || RESOLVED_STATUSES.includes(alert.status)) return; // idempotent
        assertTransition(alert.status, 'auto_resolved');

        await tx.alert.update({
            where: { id: alertId },
            data: { status: 'auto_resolved', resolved_at: new Date() },
        });

        await tx.alertEvent.create({
            data: {
                alert_id: alertId,
                client_id: clientId,
                event_type: 'auto_resolved',
                metadata_json: { previous_status: alert.status } as Prisma.InputJsonValue,
            },
        });
    });
}

// ─────────────────────────────────────────────────────────────
// acknowledgeAlert (API-driven)
// ─────────────────────────────────────────────────────────────

export async function acknowledgeAlert(
    alertId: string,
    clientId: string,
    actorUserId?: string | null,
    note?: string | null,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const alert = await tx.alert.findUnique({ where: { id: alertId } });
        if (!alert) throw new Error(`Alert ${alertId} not found`);
        assertTransition(alert.status, 'acknowledged');

        await tx.alert.update({
            where: { id: alertId },
            data: {
                status: 'acknowledged',
                acknowledged_at: new Date(),
                acknowledged_by_user_id: actorUserId ?? null,
            },
        });

        await tx.alertEvent.create({
            data: {
                alert_id: alertId,
                client_id: clientId,
                event_type: 'acknowledged',
                actor_user_id: actorUserId ?? null,
                metadata_json: { note: note ?? null } as Prisma.InputJsonValue,
            },
        });
    });
}

// ─────────────────────────────────────────────────────────────
// snoozeAlert (API-driven)
// ─────────────────────────────────────────────────────────────

export async function snoozeAlert(
    alertId: string,
    clientId: string,
    until: Date,
    actorUserId?: string | null,
    note?: string | null,
): Promise<void> {
    if (until <= new Date()) throw new Error('snoozed_until must be in the future');

    await prisma.$transaction(async (tx) => {
        const alert = await tx.alert.findUnique({ where: { id: alertId } });
        if (!alert) throw new Error(`Alert ${alertId} not found`);
        assertTransition(alert.status, 'snoozed');

        await tx.alert.update({
            where: { id: alertId },
            data: { status: 'snoozed', snoozed_until: until },
        });

        await tx.alertEvent.create({
            data: {
                alert_id: alertId,
                client_id: clientId,
                event_type: 'snoozed',
                actor_user_id: actorUserId ?? null,
                metadata_json: {
                    snoozed_until: until.toISOString(),
                    note: note ?? null,
                } as Prisma.InputJsonValue,
            },
        });
    });
}

// ─────────────────────────────────────────────────────────────
// resolveAlert (manual, API-driven)
// ─────────────────────────────────────────────────────────────

export async function resolveAlert(
    alertId: string,
    clientId: string,
    actorUserId?: string | null,
    note?: string | null,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const alert = await tx.alert.findUnique({ where: { id: alertId } });
        if (!alert) throw new Error(`Alert ${alertId} not found`);
        assertTransition(alert.status, 'resolved');

        await tx.alert.update({
            where: { id: alertId },
            data: { status: 'resolved', resolved_at: new Date() },
        });

        await tx.alertEvent.create({
            data: {
                alert_id: alertId,
                client_id: clientId,
                event_type: 'resolved',
                actor_user_id: actorUserId ?? null,
                metadata_json: { note: note ?? null } as Prisma.InputJsonValue,
            },
        });
    });
}

// ─────────────────────────────────────────────────────────────
// expireSnoozeIfNeeded — called during evaluation if alert is snoozed
// ─────────────────────────────────────────────────────────────

export async function expireSnoozeIfNeeded(
    alertId: string,
    clientId: string,
    snoozedUntil: Date,
): Promise<boolean> {
    if (snoozedUntil > new Date()) return false; // Still within snooze window

    await prisma.$transaction(async (tx) => {
        const alert = await tx.alert.findUnique({ where: { id: alertId } });
        if (!alert || alert.status !== 'snoozed') return;

        await tx.alert.update({
            where: { id: alertId },
            data: { status: 'triggered', snoozed_until: null },
        });

        await tx.alertEvent.create({
            data: {
                alert_id: alertId,
                client_id: clientId,
                event_type: 'triggered',
                metadata_json: {
                    note: 'Snooze expired; violation still active',
                } as Prisma.InputJsonValue,
            },
        });
    });

    return true;
}
