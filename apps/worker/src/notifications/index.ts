import { prisma } from '@sense/database';

export interface NotificationPayload {
    client_id: string;
    device_id: string;
    device_name: string;
    rule_summary: any; // The 'reason' object from status evaluation
    since: string;
    value: number | string;
    duration_seconds: number;
}

export async function sendNotification(payload: NotificationPayload, idempotencyKey?: string) {
    const timestamp = new Date();

    // Construct message
    const message = JSON.stringify({
        event: 'ALERT_RED',
        ...payload,
        link: `http://localhost:5173/device/${payload.device_id}`, // Placeholder
        timestamp: timestamp.toISOString()
    });

    // 1. Log to Console (for grep verification and simple visibility)
    console.log(`[NOTIFICATION] Sending alert for device=${payload.device_id} rule=${payload.rule_summary?.ruleId || 'unknown'}`);
    console.log(`[NOTIFICATION_PAYLOAD] ${message}`);

    // 2. Persist to Outbox (for robust verification and future dispatch)
    try {
        await prisma.notificationOutbox.create({
            data: {
                id: idempotencyKey, // Optional deterministic ID
                client_id: payload.client_id,
                device_id: payload.device_id,
                rule_id: payload.rule_summary?.ruleId,
                message: message
            }
        });
    } catch (e: any) {
        // Handle unique constraint violation (P2002) for idempotency
        if (e.code === 'P2002') {
            console.log(`[NOTIFICATION] Duplicate skipped: ${idempotencyKey}`);
            return;
        }
        console.error(`[NOTIFICATION] Failed to persist to outbox: ${e.message}`);
        // We catch here so we don't crash the worker, but we did log it above.
    }
}
