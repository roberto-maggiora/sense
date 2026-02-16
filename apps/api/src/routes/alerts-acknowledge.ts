import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';

export default async function alertsAcknowledgeRoutes(fastify: FastifyInstance) {
    fastify.post('/alerts/:id/acknowledge', {
        preHandler: [fastify.requireClientId]
    }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const clientId = request.clientId;

        if (!clientId) {
            reply.code(401).send({ error: 'Unauthorized' });
            return;
        }

        try {
            // Check if alert exists and belongs to client
            const alert = await prisma.notificationOutbox.findFirst({
                where: {
                    id: id,
                    client_id: clientId
                }
            });

            if (!alert) {
                reply.code(404).send({ error: 'Alert not found' });
                return;
            }

            // Update acknowledgement
            const updated = await prisma.notificationOutbox.update({
                where: { id: id },
                data: {
                    acknowledged_at: new Date(),
                    acknowledged_by: 'system', // Placeholder for now
                    // We do NOT set ack_consumed here; the worker consumes it
                }
            });

            return updated;

        } catch (error) {
            request.log.error(error);
            reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
