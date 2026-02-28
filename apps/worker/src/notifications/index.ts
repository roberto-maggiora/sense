/**
 * Legacy sendNotification stub — no longer used by the worker.
 *
 * The v1 notification pipeline writes to notification_outbox_items
 * inside alertService.triggerAlert() and is dispatched by dispatcher.ts.
 *
 * This file is kept to avoid breaking old imports while the codebase is cleaned up.
 * It performs a no-op and logs a warning if accidentally called.
 */

export interface NotificationPayload {
    client_id: string;
    device_id: string;
    device_name: string;
    rule_summary: unknown;
    since: string;
    value: number | string;
    duration_seconds: number;
}

/** @deprecated Use notification_outbox_items via notificationOutboxService instead */
export async function sendNotification(payload: NotificationPayload, idempotencyKey?: string): Promise<void> {
    console.warn(
        `[NOTIFICATION] sendNotification is deprecated. ` +
        `Use notification_outbox_items (notificationOutboxService). ` +
        `device=${payload.device_id} key=${idempotencyKey ?? 'none'}`
    );
    // No-op: v1 outbox pipeline handles delivery via dispatcher.ts
}
