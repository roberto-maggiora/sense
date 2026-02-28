import { FastifyInstance } from 'fastify';
import { registerHub } from '@sense/database';

export default async function hubsRoutes(fastify: FastifyInstance) {
    /* 
     * Repro: 
     * curl -X POST http://localhost:3000/api/v1/hubs/register \
     *  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     *  -d '{"serial":"E831CDE75C64","friendly_name":"Main Hall Hub"}'
     */
    fastify.post('/register', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const body = request.body as { serial?: string; friendly_name?: string | null };

        if (!body || typeof body.serial !== 'string' || body.serial.trim() === '') {
            return reply.code(400).send({ error: 'Missing or invalid serial' });
        }

        try {
            const result = await registerHub(clientId, body.serial.trim(), body.friendly_name?.trim() || undefined);
            return reply.send({ ok: true, data: result });
        } catch (error) {
            request.log.error(error, 'Error registering hub');
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    fastify.get('/', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        try {
            const { listHubsWithStatus } = await import('@sense/database');
            const data = await listHubsWithStatus(clientId);
            return reply.send({ data });
        } catch (error) {
            request.log.error(error, 'Error fetching hubs');
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    fastify.patch('/:id', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params as { id: string };
        const body = request.body as { friendly_name?: string };

        if (!body || typeof body.friendly_name !== 'string' || body.friendly_name.trim() === '') {
            return reply.code(400).send({ error: 'Missing or invalid friendly_name' });
        }

        try {
            const { updateHubFriendlyName } = await import('@sense/database');
            const updated = await updateHubFriendlyName(clientId, id, body.friendly_name.trim());
            return reply.send({ ok: true, data: updated });
        } catch (error: any) {
            request.log.error(error, 'Error updating hub');
            if (error.message === 'Hub not found or unauthorized') {
                return reply.code(404).send({ error: error.message });
            }
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    fastify.delete('/:id', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params as { id: string };

        try {
            const { unregisterHub } = await import('@sense/database');
            const success = await unregisterHub(clientId, id);
            if (!success) {
                return reply.code(404).send({ error: 'Hub not found or unauthorized' });
            }
            return reply.send({ deleted: 1 });
        } catch (error) {
            request.log.error(error, 'Error deleting hub');
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
