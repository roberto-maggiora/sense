import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';
import { DeviceStatusLevel } from '@prisma/client';

export default async function deviceStatusRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        if (!clientId) {
            reply.code(400).send({ error: 'Missing X-Client-Id header' });
            return;
        }
    });

    // GET /device-status
    fastify.get<{ Querystring: { status?: DeviceStatusLevel } }>('/device-status', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        const { status } = request.query;

        const whereClause: any = { client_id: clientId };
        if (status) {
            whereClause.status = status;
        }

        const statuses = await prisma.deviceStatus.findMany({
            where: whereClause,
            include: {
                device: {
                    select: {
                        id: true,
                        external_id: true,
                        name: true,
                        site_id: true,
                        area_id: true
                    }
                }
            },
            orderBy: [
                // Priority ordering: Red > Amber > Green
                // Postgres doesn't easily sort enum by custom order without case, 
                // so we'll just sort by updated_at desc for MVP, or client can filter.
                { updated_at: 'desc' }
            ]
        });

        return statuses.map(s => ({
            ...s,
            // Flatten slightly for easier consumption if desired, or keep nested
        }));
    });
}
