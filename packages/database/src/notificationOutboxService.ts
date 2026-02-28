/**
 * Notification Outbox Service — DB-backed reliability layer for alert notifications.
 *
 * Table: notification_outbox_items
 * Statuses: pending → claimed → delivered | failed
 *
 * Key design decisions:
 *   - enqueueNotification: idempotent by idempotency_key, works inside caller's transaction
 *   - claimNextBatch: SELECT FOR UPDATE SKIP LOCKED — safe for concurrent workers
 *   - Attempts increment on claim (not after) — prevents infinite retry on worker crash
 *   - Exponential backoff with jitter: 30s * 2^attempt_count, capped at 30 minutes
 */

import { Prisma } from '@prisma/client';
import { prisma } from './index';

// ─────────────────────────────────────────────────────────────
// Backoff (exported for unit tests — no DB dependency)
// ─────────────────────────────────────────────────────────────

const DEFAULT_BASE_SECONDS = 30;
const DEFAULT_CAP_MINUTES = 30;

export function computeNextAttemptAt(
    attemptCount: number,
    baseSeconds: number = DEFAULT_BASE_SECONDS,
    capMinutes: number = DEFAULT_CAP_MINUTES,
): Date {
    const capSeconds = capMinutes * 60;
    const delaySeconds = Math.min(baseSeconds * Math.pow(2, attemptCount - 1), capSeconds);
    const jitterSeconds = Math.random() * 5; // 0–5s jitter
    const totalMs = (delaySeconds + jitterSeconds) * 1000;
    return new Date(Date.now() + totalMs);
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** Prisma transaction client (the `tx` object inside $transaction) */
export type TxClient = Omit<
    typeof prisma,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface EnqueueNotificationParams {
    client_id: string;
    alert_id: string;
    idempotency_key: string;
    channel?: string;
    payload: Record<string, unknown>;
}

export interface ClaimedOutboxItem {
    id: string;
    client_id: string;
    alert_id: string;
    channel: string;
    payload: Prisma.JsonValue;
    attempt_count: number;
    idempotency_key: string;
}

// ─────────────────────────────────────────────────────────────
// enqueueNotification — idempotent, runs inside existing txn
// ─────────────────────────────────────────────────────────────

export async function enqueueNotification(
    tx: TxClient,
    params: EnqueueNotificationParams,
): Promise<{ id: string; created: boolean }> {
    const existing = await tx.notificationOutboxItem.findUnique({
        where: { idempotency_key: params.idempotency_key },
        select: { id: true },
    });

    if (existing) {
        return { id: existing.id, created: false };
    }

    const item = await tx.notificationOutboxItem.create({
        data: {
            client_id: params.client_id,
            alert_id: params.alert_id,
            idempotency_key: params.idempotency_key,
            channel: params.channel ?? 'log',
            payload: params.payload as Prisma.InputJsonValue,
            status: 'pending',
            next_attempt_at: new Date(), // ready immediately
        },
    });

    return { id: item.id, created: true };
}

// ─────────────────────────────────────────────────────────────
// claimNextBatch — SELECT FOR UPDATE SKIP LOCKED
// ─────────────────────────────────────────────────────────────

export async function claimNextBatch(options: {
    limit: number;
}): Promise<ClaimedOutboxItem[]> {
    const { limit } = options;

    // Atomically:
    //   1. Find pending rows ready for delivery (next_attempt_at <= now)
    //   2. Lock them (SKIP LOCKED = other workers skip these rows)
    //   3. Set status=claimed, increment attempt_count, updated_at=now
    const claimed = await prisma.$queryRaw<ClaimedOutboxItem[]>`
        UPDATE notification_outbox_items
        SET
            status        = 'claimed',
            attempt_count = attempt_count + 1,
            updated_at    = NOW()
        WHERE id IN (
            SELECT id
            FROM   notification_outbox_items
            WHERE  status = 'pending'
              AND  (next_attempt_at IS NULL OR next_attempt_at <= NOW())
            ORDER  BY next_attempt_at ASC NULLS FIRST
            LIMIT  ${limit}
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, client_id, alert_id, channel, payload, attempt_count, idempotency_key
    `;

    return claimed;
}

// ─────────────────────────────────────────────────────────────
// markDelivered
// ─────────────────────────────────────────────────────────────

export async function markDelivered(id: string): Promise<void> {
    await prisma.notificationOutboxItem.update({
        where: { id },
        data: {
            status: 'delivered',
            delivered_at: new Date(),
            next_attempt_at: null,
            updated_at: new Date(),
        },
    });
}

// ─────────────────────────────────────────────────────────────
// markFailed — retry with backoff or terminal failure
// ─────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 8;

export async function markFailed(
    id: string,
    error: string,
    currentAttemptCount: number,
): Promise<void> {
    const isFinal = currentAttemptCount >= MAX_ATTEMPTS;

    if (isFinal) {
        await prisma.notificationOutboxItem.update({
            where: { id },
            data: {
                status: 'failed',
                last_error: error,
                next_attempt_at: null,
                updated_at: new Date(),
            },
        });
    } else {
        const nextAttempt = computeNextAttemptAt(currentAttemptCount);
        await prisma.notificationOutboxItem.update({
            where: { id },
            data: {
                status: 'pending',
                last_error: error,
                next_attempt_at: nextAttempt,
                updated_at: new Date(),
            },
        });
    }
}
