import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';

export default async function adminUserRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', fastify.requireAdminToken);

    fastify.get('/', async (request, reply) => {
        const query = request.query as { client_id?: string; include_disabled?: string };
        const includeDisabled = query.include_disabled === 'true';

        try {
            const users = await prisma.user.findMany({
                where: {
                    client_id: query.client_id,
                    disabled_at: includeDisabled ? undefined : null
                },
                orderBy: { email: 'asc' }
            });
            return reply.send({ data: users });
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to list users' });
        }
    });

    fastify.post('/', async (request, reply) => {
        const body = request.body as { client_id: string; email: string; name?: string; role?: 'SUPER_ADMIN' | 'CLIENT_ADMIN' | 'SITE_ADMIN' | 'VIEWER' };

        if (!body.client_id || !body.email) {
            return reply.code(400).send({ error: 'client_id and email are required' });
        }

        try {
            // Check if client exists and is not disabled
            const client = await prisma.client.findUnique({ where: { id: body.client_id } });
            if (!client) {
                return reply.code(404).send({ error: 'Client not found' });
            }
            if (client.disabled_at) {
                return reply.code(409).send({ error: 'Cannot create users for a disabled client' });
            }

            const randomPassword = Math.random().toString(36).slice(-10);
            const password_hash = await import('bcryptjs').then(m => m.hash(randomPassword, 10));

            const user = await prisma.user.create({
                data: {
                    client_id: body.client_id,
                    email: body.email.toLowerCase().trim(),
                    name: body.name,
                    role: body.role || 'VIEWER',
                    password_hash
                }
            });
            return reply.code(201).send({ data: user });
        } catch (error: any) {
            if (error.code === 'P2002') {
                return reply.code(409).send({ error: 'User email must be unique globally' });
            }
            if (error.code === 'P2003') {
                return reply.code(404).send({ error: 'Client not found' });
            }
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to create user' });
        }
    });

    fastify.patch('/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = request.body as { name?: string; role?: 'SUPER_ADMIN' | 'CLIENT_ADMIN' | 'SITE_ADMIN' | 'VIEWER'; disabled_at?: string | null };

        try {
            const user = await prisma.user.update({
                where: { id },
                data: {
                    name: body.name,
                    role: body.role,
                    disabled_at: body.disabled_at === undefined ? undefined : body.disabled_at ? new Date(body.disabled_at) : null
                }
            });
            return reply.send({ data: user });
        } catch (error: any) {
            if (error.code === 'P2025') {
                return reply.code(404).send({ error: 'User not found' });
            }
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to update user' });
        }
    });
}
