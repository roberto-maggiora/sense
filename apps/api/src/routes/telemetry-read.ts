import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';
import { TelemetryEventV1 } from '@sense/contracts';

interface ReadTelemetryQuery {
    from?: string;
    to?: string;
    limit?: number;
}

export default async function telemetryReadRoutes(fastify: FastifyInstance) {
    // Shared hook for client validation
    fastify.addHook('preHandler', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        if (!clientId) {
            reply.code(400).send({ error: 'Missing X-Client-Id header' });
            return;
        }

        const client = await prisma.client.findUnique({
            where: { id: clientId }
        });

        if (!client) {
            reply.code(404).send({ error: 'Client not found' });
            return;
        }
    });

    // GET /devices/:id/latest
    fastify.get<{ Params: { id: string } }>('/devices/:id/latest', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        const { id } = request.params;

        // Ensure device belongs to client
        const device = await prisma.device.findFirst({
            where: { id, client_id: clientId }
        });

        if (!device) {
            reply.code(404).send({ error: 'Device not found' });
            return;
        }

        // Query latest telemetry
        const latest = await prisma.telemetryEvent.findFirst({
            where: {
                device_id: device.id,
                client_id: clientId
            },
            orderBy: {
                occurred_at: 'desc'
            }
        });

        if (!latest) {
            reply.code(404).send({ error: 'No telemetry for device' });
            return;
        }

        // Return compact DTO
        // We cast payload to any because Prisma types it as JsonValue
        const payload = latest.payload as any;
        const metrics = payload.metrics || []; // or extract logic if not stored in payload identically

        return {
            device: {
                id: device.id,
                external_id: device.external_id,
                name: device.name
            },
            telemetry: {
                occurred_at: latest.occurred_at,
                received_at: latest.received_at,
                metrics: metrics, // Assuming payload stores it under 'metrics', or we could store it in a separate col if needed but Schema says payload: Json
                source: latest.source,
                idempotency_key: latest.idempotency_key
            }
        };
    });

    // GET /devices/:id/telemetry
    fastify.get<{ Params: { id: string }; Querystring: ReadTelemetryQuery }>('/devices/:id/telemetry', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        const { id } = request.params;
        const { from, to, limit = 200 } = request.query;

        // Validate limit
        const take = Math.min(Math.max(Number(limit), 1), 2000);

        // Date range
        const now = new Date();
        let fromDate = from ? new Date(from) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
        let toDate = to ? new Date(to) : now;

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            reply.code(400).send({ error: 'Invalid date format' });
            return;
        }

        if (fromDate > toDate) {
            reply.code(400).send({ error: 'from date must be before to date' });
            return;
        }

        // Ensure device belongs to client
        const device = await prisma.device.findFirst({
            where: { id, client_id: clientId }
        });

        if (!device) {
            reply.code(404).send({ error: 'Device not found' });
            return;
        }

        const events = await prisma.telemetryEvent.findMany({
            where: {
                client_id: clientId,
                device_id: device.id,
                occurred_at: {
                    gte: fromDate,
                    lte: toDate
                }
            },
            orderBy: {
                occurred_at: 'desc'
            },
            take
        });

        // Map to DTO
        return events.map(e => {
            const payload = e.payload as any;
            return {
                occurred_at: e.occurred_at,
                received_at: e.received_at,
                metrics: payload.metrics || [],
                source: e.source,
                idempotency_key: e.idempotency_key
            };
        });
    });
}
