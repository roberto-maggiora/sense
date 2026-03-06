import { claimNextBatch, markDelivered, markFailed, prisma } from '@sense/database';
import { sendEmail } from './mailer';

const POLL_INTERVAL_MS = 2_000;
const IDLE_INTERVAL_MS = 10_000;
const BATCH_SIZE = 25;

let running = false;
let loopTimeout: ReturnType<typeof setTimeout> | null = null;

async function deliverLog(item: any) {
    const payload = item.payload;
    console.log(JSON.stringify({
        event: 'notification_delivered',
        outbox_id: item.id,
        alert_id: item.alert_id,
        client_id: item.client_id,
        channel: item.channel,
        attempt: item.attempt_count,
        payload_summary: {
            message: payload['message'] ?? null,
            severity: payload['severity'] ?? null,
            current_status: payload['current_status'] ?? null,
            device_id: payload['device_id'] ?? null,
        },
        timestamp: new Date().toISOString(),
    }));
}

async function deliverEmail(item: any) {
    const payload = item.payload;
    const alertId = payload['alert_id'];
    const ruleId = payload['rule_id'];
    const clientId = item.client_id;
    const reason = payload['reason'];

    if (reason && !['created', 'escalated_to_red', 'resolved', 'reminder'].includes(reason)) {
        console.warn(`[DISPATCHER] Ignoring outbox item ${item.id} with reason ${reason}`);
        return;
    }

    let recipientEmails: string[] = [];

    if (ruleId) {
        const ruleRecipients = await prisma.deviceAlarmRuleRecipient.findMany({
            where: { rule_id: ruleId },
            include: { user: { select: { email: true } } },
        });
        recipientEmails = ruleRecipients.map(r => r.user.email);
    }

    if (recipientEmails.length === 0) {
        const admins = await prisma.user.findMany({
            where: {
                client_id: clientId,
                role: { in: ['CLIENT_ADMIN', 'SUPER_ADMIN'] },
                disabled_at: null,
            },
            select: { email: true }
        });
        recipientEmails = admins.map(a => a.email);
    }

    if (recipientEmails.length === 0) {
        console.warn(`[DISPATCHER] No recipients found for alert ${alertId}. Marked as sent.`);
        return;
    }

    const alertData = await prisma.alert.findUnique({
        where: { id: alertId },
        include: {
            device: {
                include: {
                    site: true,
                    area: { include: { site: true } }
                }
            },
            corrective_actions: {
                orderBy: { created_at: 'desc' },
                take: 1
            }
        }
    });

    if (!alertData) {
        throw new Error(`Alert ${alertId} no longer exists.`);
    }

    const deviceName = alertData.device.name;
    const externalId = alertData.device.external_id;
    const siteName = alertData.device.site?.name ?? alertData.device.area?.site?.name ?? 'Unassigned Site';
    const areaName = alertData.device.area?.name ?? '';
    const metric = alertData.parameter ?? 'Event';
    const severity = payload['severity'] ?? alertData.severity;
    const subject = `[${severity.toUpperCase()}] ${metric} alert — ${deviceName}`;

    let actionReasonStr = 'Alert Triggered';
    if (reason === 'escalated_to_red') actionReasonStr = 'Severity Escalated to RED';
    if (reason === 'resolved') actionReasonStr = 'Alert Resolved';

    const baseUrl = process.env.VIEWER_BASE_URL || 'http://localhost:5173';
    const viewerLink = `${baseUrl}/alerts?open=${alertId}`;

    const latestCorrectiveAction = alertData.corrective_actions?.[0];

    const htmlBody = `
        <h2>${actionReasonStr}</h2>
        <p><strong>Device:</strong> ${deviceName} (ID: ${externalId})</p>
        <p><strong>Location:</strong> ${siteName} ${areaName ? `> ${areaName}` : ''}</p>
        <p><strong>Metric:</strong> ${metric}</p>
        <p><strong>Severity:</strong> ${severity}</p>
        ${payload['current_value'] != null ? `<p><strong>Current Value:</strong> ${payload['current_value']}</p>` : ''}
        ${payload['threshold'] != null ? `<p><strong>Threshold:</strong> ${payload['threshold']}</p>` : ''}
        <p><strong>Time:</strong> ${new Date(payload['occurred_at'] || alertData.opened_at).toUTCString()}</p>
        ${reason === 'resolved' && latestCorrectiveAction ? `<br/><p><strong>Corrective Action Taken:</strong> ${latestCorrectiveAction.action_text}</p>` : ''}
        <hr />
        <p>${payload['message'] || ''}</p>
        <br />
        <p><a href="${viewerLink}">View Details in Dashboard</a></p>
    `;

    await sendEmail({
        to: recipientEmails,
        subject,
        html: htmlBody
    });
}

async function deliver(item: any) {
    switch (item.channel) {
        case 'email':
        case 'log':
            return deliverEmail(item);
        default:
            throw new Error(`[DISPATCHER] Unknown channel: ${item.channel}`);
    }
}

async function dispatcherLoop() {
    if (!running) return;

    let nextSleep = IDLE_INTERVAL_MS;

    try {
        const batch = await claimNextBatch({ limit: BATCH_SIZE });
        if (batch.length > 0) {
            nextSleep = POLL_INTERVAL_MS;
            console.log(`[DISPATCHER] claimed=${batch.length}`);

            for (const item of batch) {
                try {
                    await deliver(item);
                    await markDelivered(item.id);
                    console.log(`[DISPATCHER] status=delivered outbox_id=${item.id} alert_id=${item.alert_id} attempt=${item.attempt_count}`);
                } catch (err: any) {
                    const msg = err instanceof Error ? err.message : String(err);
                    await markFailed(item.id, msg, item.attempt_count);
                    console.error(`[DISPATCHER] status=failed outbox_id=${item.id} alert_id=${item.alert_id} attempt=${item.attempt_count} error=${msg}`);
                }
            }
        }
    } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[DISPATCHER] loop_error=${msg}`);
        nextSleep = IDLE_INTERVAL_MS;
    }

    if (running) {
        loopTimeout = setTimeout(dispatcherLoop, nextSleep);
    }
}

export function startDispatcher() {
    if (running) return;
    running = true;
    console.log('[DISPATCHER] Starting (poll_interval=2s idle_interval=10s batch=25)');
    dispatcherLoop();
}

export function stopDispatcher() {
    running = false;
    if (loopTimeout) {
        clearTimeout(loopTimeout);
        loopTimeout = null;
    }
    console.log('[DISPATCHER] Stopped');
}
