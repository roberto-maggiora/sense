import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';
import { getTelemetryQueueMetrics } from '../../queue/telemetry';

export default async function ingestHealthRoutes(fastify: FastifyInstance) {
    fastify.get('/ingest-health', async (_req, reply) => {
        try {
            // Get max created_at for successful heartbeats
            const lastHeartbeat = await prisma.ingestEvent.findFirst({
                where: { source: 'hawk', topic: 'heartbeat', status: 'accepted' },
                orderBy: { created_at: 'desc' },
                select: { created_at: true },
            });

            // Get max created_at for successful sensors
            const lastSensors = await prisma.ingestEvent.findFirst({
                where: { source: 'hawk', topic: 'sensors', status: 'accepted' },
                orderBy: { created_at: 'desc' },
                select: { created_at: true },
            });

            // Get max created_at for any errors (error, unauthorized, rejected)
            const lastError = await prisma.ingestEvent.findFirst({
                where: {
                    source: 'hawk',
                    status: { in: ['error', 'unauthorized', 'rejected'] },
                },
                orderBy: { created_at: 'desc' },
                select: { created_at: true },
            });

            // Attempt to get queue depth
            let queueDepth: number | null = null;
            try {
                const metrics = await getTelemetryQueueMetrics();
                queueDepth = metrics.waiting;
            } catch (e) {
                // Ignore queue metrics errors for health check
                fastify.log.warn({ err: e }, 'Failed to get telemetry queue metrics for ingest-health');
            }

            reply.code(200).send({
                last_heartbeat_at: lastHeartbeat?.created_at ?? null,
                last_sensors_at: lastSensors?.created_at ?? null,
                last_error_at: lastError?.created_at ?? null,
                queue_depth: queueDepth,
            });
        } catch (error) {
            fastify.log.error(error, 'Error in ingest-health endpoint');
            reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
