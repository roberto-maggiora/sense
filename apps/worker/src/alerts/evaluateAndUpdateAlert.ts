import { prisma, triggerAlert, autoResolveAlert, expireSnoozeIfNeeded } from '@sense/database';
import { evaluateAlarmRule } from '../alarms/evaluate';

export async function evaluateAndUpdateAlerts(deviceId: string, clientId: string) {
    const rules = await prisma.deviceAlarmRule.findMany({
        where: { device_id: deviceId, enabled: true },
    });

    if (rules.length === 0) return;

    const history = await prisma.telemetryEvent.findMany({
        where: { device_id: deviceId },
        orderBy: { occurred_at: 'desc' },
        take: 500,
    });

    for (const rule of rules) {
        try {
            const result = evaluateAlarmRule(rule, history);

            if (result.isViolated && result.latestValue !== undefined) {
                const { id: alertId, created } = await triggerAlert({
                    client_id: clientId,
                    device_id: deviceId,
                    rule_id: rule.id,
                    severity: rule.severity,
                    current_value: result.latestValue,
                    threshold: rule.threshold,
                    context: {
                        metric: rule.metric,
                        operator: rule.operator,
                        threshold: rule.threshold,
                        duration_seconds: result.duration,
                        rule_id: rule.id,
                        since: result.since,
                    },
                });

                if (created) {
                    console.log(`[ALERT] created alert_id=${alertId} device=${deviceId} rule=${rule.id} ` +
                        `metric=${rule.metric} value=${result.latestValue} threshold=${rule.threshold} ` +
                        `severity=${rule.severity}`);
                }
            } else {
                const openAlert = await prisma.alert.findFirst({
                    where: {
                        device_id: deviceId,
                        rule_id: rule.id,
                        status: { notIn: ['resolved', 'auto_resolved'] },
                    },
                });

                if (openAlert) {
                    if (openAlert.status === 'snoozed' && openAlert.snoozed_until) {
                        await expireSnoozeIfNeeded(openAlert.id, clientId, openAlert.snoozed_until);
                    }
                    await autoResolveAlert(openAlert.id, clientId);
                    console.log(`[ALERT] auto_resolved alert_id=${openAlert.id} device=${deviceId} rule=${rule.id} ` +
                        `metric=${rule.metric}`);
                }
            }
        } catch (err: any) {
            console.error(`[ALERT] evaluation_error device=${deviceId} rule=${rule.id} error=${err.message}`);
        }
    }
}
