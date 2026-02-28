import { FastifyInstance } from 'fastify';
import { prisma, acknowledgeAlert, snoozeAlert, resolveAlert } from '@sense/database';

export default async function alertsRoutes(fastify: FastifyInstance) {

    // ─────────────────────────────────────────────────────────────
    // GET /alerts
    // Query: status, device_id, rule_id, limit, cursor
    // Default: exclude resolved/auto_resolved
    // ─────────────────────────────────────────────────────────────
    fastify.get('/alerts', {
        preHandler: [fastify.requireClientId]
    }, async (request, reply) => {
        const clientId = request.clientId as string;
        const {
            status,
            include_closed,
            device_id,
            rule_id,
            limit,
            cursor,
        } = request.query as {
            status?: string;
            include_closed?: string;
            device_id?: string;
            rule_id?: string;
            limit?: string;
            cursor?: string;
        };

        const take = Math.min(parseInt(limit || '50', 10), 200);

        const where: any = { client_id: clientId };

        const includeClosed = include_closed === '1' || include_closed === 'true';

        if (status) {
            if (status === 'all') {
                // Return everything, no filter
            } else if (status === 'active') {
                where.status = { in: ['triggered'] }; // and maybe 'snoozed' if we decide, but 'triggered' is standard for active.
            } else if (status === 'acknowledged') {
                where.status = { in: ['triggered', 'acknowledged', 'snoozed'] };
                where.acknowledged_at = { not: null };
            } else {
                const statuses = status.split(',').map(s => s.trim());
                where.status = { in: statuses };
            }
        } else if (!includeClosed) {
            // Default: active only (hide resolved/auto_resolved)
            where.status = { notIn: ['resolved', 'auto_resolved'] };
        }
        // else includeClosed=true and no status filter → return all

        if (device_id) where.device_id = device_id;
        if (rule_id) where.rule_id = rule_id;

        if (request.user?.role === 'SITE_ADMIN') {
            where.device = { site_id: request.user.site_id || 'unassigned-guard' };
        }

        const alerts = await prisma.alert.findMany({
            where,
            take: take + 1,
            cursor: cursor ? { id: cursor } : undefined,
            orderBy: { opened_at: 'desc' },
            include: {
                device: { select: { id: true, name: true, site_id: true, area_id: true, external_id: true } },
                acknowledged_by_user: { select: { id: true, name: true, email: true } },
            },
        });

        // Fetch rule metrics for alerts with rule_id
        const ruleIds = Array.from(new Set(alerts.map(a => a.rule_id).filter(Boolean) as string[]));
        const rules = ruleIds.length > 0
            ? await prisma.deviceAlarmRule.findMany({
                where: { id: { in: ruleIds } },
                select: { id: true, metric: true }
            })
            : [];
        const ruleMap = new Map(rules.map(r => [r.id, r.metric]));

        const enrichedAlerts = alerts.map(alert => {
            const parameter = alert.parameter || (alert.rule_id ? ruleMap.get(alert.rule_id) : null) || null;
            const resolution_ms = alert.resolved_at
                ? alert.resolved_at.getTime() - alert.created_at.getTime()
                : null;

            return {
                ...alert,
                parameter,
                resolution_ms,
                acknowledged_by: alert.acknowledged_by_user ? {
                    id: alert.acknowledged_by_user.id,
                    name: alert.acknowledged_by_user.name
                } : null,
                acknowledged_by_user: undefined, // remove raw prisma field
            };
        });

        let next_cursor: string | null = null;
        if (enrichedAlerts.length > take) {
            next_cursor = enrichedAlerts.pop()!.id;
        }

        return { data: enrichedAlerts, next_cursor };
    });


    // ─────────────────────────────────────────────────────────────
    // GET /alerts/:id  — detail + full event history
    // ─────────────────────────────────────────────────────────────
    fastify.get<{ Params: { id: string } }>('/alerts/:id', {
        preHandler: [fastify.requireClientId]
    }, async (request, reply) => {
        const { id } = request.params;
        const clientId = request.clientId as string;

        const alert = await prisma.alert.findFirst({
            where: { id, client_id: clientId },
            include: {
                device: {
                    select: {
                        id: true,
                        name: true,
                        site_id: true,
                        area_id: true,
                        external_id: true,
                        site: { select: { id: true, name: true } },
                        area: { select: { id: true, name: true, site: { select: { id: true, name: true } } } }
                    }
                },
                events: { orderBy: { created_at: 'asc' } },
            },
        });

        if (!alert) return reply.code(404).send({ error: 'Alert not found' });

        const duration_ms = alert.resolved_at
            ? alert.resolved_at.getTime() - alert.opened_at.getTime()
            : null;

        return {
            ...alert,
            duration_ms,
            context: {
                device: {
                    id: alert.device.id,
                    name: alert.device.name,
                    external_id: alert.device.external_id
                },
                site: alert.device.site ? {
                    id: alert.device.site.id,
                    name: alert.device.site.name
                } : (alert.device.area?.site ? {
                    id: alert.device.area.site.id,
                    name: alert.device.area.site.name
                } : null),
                area: alert.device.area ? {
                    id: alert.device.area.id,
                    name: alert.device.area.name
                } : null
            }
        };
    });

    // ─────────────────────────────────────────────────────────────
    // GET /alerts/:id/events  — read-only event timeline
    // ─────────────────────────────────────────────────────────────
    fastify.get<{ Params: { id: string } }>('/alerts/:id/events', {
        preHandler: [fastify.requireClientId]
    }, async (request, reply) => {
        const { id } = request.params;
        const clientId = request.clientId as string;

        const alert = await prisma.alert.findUnique({
            where: { id }
        });

        if (!alert || alert.client_id !== clientId) {
            return reply.code(404).send({ error: 'Alert not found' });
        }

        const events = await prisma.alertEvent.findMany({
            where: { alert_id: id },
            orderBy: { created_at: 'asc' }
        });

        return {
            alert_id: id,
            events: events.map(e => ({
                id: e.id,
                event_type: e.event_type,
                created_at: e.created_at,
                metadata_json: e.metadata_json
            }))
        };
    });

    // ─────────────────────────────────────────────────────────────
    // POST /alerts/:id/acknowledge
    // Body: { note?: string }
    // ─────────────────────────────────────────────────────────────
    fastify.post<{ Params: { id: string }; Body: { note?: string } }>('/alerts/:id/acknowledge', {
        preHandler: [fastify.requireClientId]
    }, async (request, reply) => {
        const { id } = request.params;
        const clientId = request.clientId as string;
        const { note } = request.body || {};

        const alert = await prisma.alert.findFirst({ where: { id, client_id: clientId } });
        if (!alert) return reply.code(404).send({ error: 'Alert not found' });

        try {
            await acknowledgeAlert(id, clientId, request.user?.id ?? null, note ?? null);
            request.log.info({ alert_id: id, actor: request.user?.id }, 'alert_acknowledged');
            const updated = await prisma.alert.findUnique({ where: { id } });
            return updated;
        } catch (err: any) {
            if (err.message.includes('Illegal alert transition')) {
                return reply.code(409).send({ error: err.message });
            }
            request.log.error(err);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // ─────────────────────────────────────────────────────────────
    // POST /alerts/:id/snooze
    // Body: { until: string (ISO8601), note?: string }
    // ─────────────────────────────────────────────────────────────
    fastify.post<{ Params: { id: string }; Body: { until: string; note?: string } }>('/alerts/:id/snooze', {
        preHandler: [fastify.requireClientId]
    }, async (request, reply) => {
        const { id } = request.params;
        const clientId = request.clientId as string;
        const { until, note } = request.body || {};

        if (!until) return reply.code(400).send({ error: '`until` (ISO8601 timestamp) is required' });

        const untilDate = new Date(until);
        if (isNaN(untilDate.getTime())) {
            return reply.code(400).send({ error: '`until` must be a valid ISO8601 timestamp' });
        }

        const alert = await prisma.alert.findFirst({ where: { id, client_id: clientId } });
        if (!alert) return reply.code(404).send({ error: 'Alert not found' });

        try {
            await snoozeAlert(id, clientId, untilDate, request.user?.id ?? null, note ?? null);
            request.log.info({ alert_id: id, until, actor: request.user?.id }, 'alert_snoozed');
            const updated = await prisma.alert.findUnique({ where: { id } });
            return updated;
        } catch (err: any) {
            if (err.message.includes('Illegal alert transition') || err.message.includes('future')) {
                return reply.code(409).send({ error: err.message });
            }
            request.log.error(err);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // ─────────────────────────────────────────────────────────────
    // POST /alerts/:id/resolve  (manual resolve)
    // Body: { note?: string }
    // ─────────────────────────────────────────────────────────────
    fastify.post<{ Params: { id: string }; Body: { note?: string } }>('/alerts/:id/resolve', {
        preHandler: [fastify.requireClientId]
    }, async (request, reply) => {
        const { id } = request.params;
        const clientId = request.clientId as string;
        const { note } = request.body || {};

        const alert = await prisma.alert.findFirst({ where: { id, client_id: clientId } });
        if (!alert) return reply.code(404).send({ error: 'Alert not found' });

        try {
            await resolveAlert(id, clientId, request.user?.id ?? null, note ?? null);
            request.log.info({ alert_id: id, actor: request.user?.id }, 'alert_resolved');
            const updated = await prisma.alert.findUnique({ where: { id } });
            return updated;
        } catch (err: any) {
            if (err.message.includes('Illegal alert transition')) {
                return reply.code(409).send({ error: err.message });
            }
            request.log.error(err);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
