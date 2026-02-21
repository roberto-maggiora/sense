import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';

export default async function alertsHistoryRoutes(fastify: FastifyInstance) {
    fastify.get('/alerts/history', {
        preHandler: [fastify.requireClientId]
    }, async (request, reply) => {
        const { device_id, limit, cursor } = request.query as {
            device_id?: string;
            limit?: string;
            cursor?: string;
        };

        const take = Math.min(parseInt(limit || '100', 10), 500);
        const clientId = request.clientId;

        if (!clientId) {
            reply.code(401).send({ error: 'Unauthorized' });
            return;
        }

        try {
            const whereClause: any = {
                client_id: clientId,
                device_id: device_id
            };

            if (request.user?.role === 'SITE_ADMIN') {
                whereClause.device = {
                    site_id: request.user.site_id || 'unassigned-guard'
                };
            }

            const alerts = await prisma.notificationOutbox.findMany({
                where: whereClause,
                take: take + 1, // Fetch one extra to determine next cursor
                cursor: cursor ? { id: cursor } : undefined,
                orderBy: [
                    { created_at: 'desc' },
                    { id: 'desc' }
                ]
            });

            let nextCursor: string | null = null;
            if (alerts.length > take) {
                const nextItem = alerts.pop(); // Remove the extra item
                nextCursor = nextItem!.id;
            }

            // Map response
            const data = alerts.map((alert: any) => {
                let payload: any = {};
                try {
                    payload = JSON.parse(alert.message);
                } catch (e) {
                    payload = { raw: alert.message };
                }

                return {
                    id: alert.id,
                    client_id: alert.client_id,
                    device_id: alert.device_id,
                    rule_id: alert.rule_id,
                    event: payload.event || 'UNKNOWN',
                    created_at: alert.created_at,
                    last_notified_at: payload.last_notified_at, // From payload if present
                    payload: payload
                };
            });

            return {
                data,
                next_cursor: nextCursor
            };

        } catch (error) {
            request.log.error(error);
            reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
