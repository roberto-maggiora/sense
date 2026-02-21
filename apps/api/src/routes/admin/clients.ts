import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';

export default async function adminClientRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', fastify.requireAdminToken);

    fastify.get('/', async (request, reply) => {
        const query = request.query as { include_disabled?: string };
        const includeDisabled = query.include_disabled === 'true';

        try {
            const clients = await prisma.client.findMany({
                where: includeDisabled ? undefined : { disabled_at: null },
                orderBy: { name: 'asc' }
            });
            return reply.send({ data: clients });
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to list clients' });
        }
    });

    fastify.post('/', async (request, reply) => {
        const body = request.body as { name: string };

        if (!body.name) {
            return reply.code(400).send({ error: 'Client name is required' });
        }

        try {
            const client = await prisma.client.create({
                data: {
                    name: body.name
                }
            });
            return reply.code(201).send({ data: client });
        } catch (error: any) {
            if (error.code === 'P2002') {
                return reply.code(409).send({ error: 'Client name must be unique' });
            }
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to create client' });
        }
    });

    fastify.patch('/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = request.body as { name?: string; disabled_at?: string | null };

        try {
            const client = await prisma.client.update({
                where: { id },
                data: {
                    name: body.name,
                    disabled_at: body.disabled_at === undefined ? undefined : body.disabled_at ? new Date(body.disabled_at) : null
                }
            });
            return reply.send({ data: client });
        } catch (error: any) {
            if (error.code === 'P2002') {
                return reply.code(409).send({ error: 'Client name must be unique' });
            }
            if (error.code === 'P2025') {
                return reply.code(404).send({ error: 'Client not found' });
            }
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to update client' });
        }
    });
}
