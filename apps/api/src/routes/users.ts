import { FastifyInstance } from 'fastify';
import { prisma, Role } from '@sense/database';
import bcrypt from 'bcryptjs';

interface CreateUserBody {
    email: string;
    name?: string;
    password?: string;
    role: string;
}

interface UpdateUserBody {
    name?: string;
    role?: string;
    disabled?: boolean;
}

interface ResetPasswordBody {
    password?: string;
}

export default async function userRoutes(app: FastifyInstance) {
    const allowedRoles = ['CLIENT_ADMIN', 'SITE_ADMIN', 'VIEWER'];

    app.addHook('preHandler', app.requireClientId);

    app.get('/', { preHandler: [app.requireRole(['CLIENT_ADMIN', 'SUPER_ADMIN', 'SITE_ADMIN', 'VIEWER'])] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const users = await prisma.user.findMany({
            where: { client_id: clientId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                client_id: true,
                disabled_at: true,
                created_at: true
            },
            orderBy: { created_at: 'desc' }
        });
        return { data: users };
    });

    app.post<{ Body: CreateUserBody }>('/', { preHandler: [app.requireRole(['CLIENT_ADMIN', 'SUPER_ADMIN'])] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const body = request.body;

        if (!body.email || !body.password || !body.role) {
            return reply.code(400).send({ error: 'Missing email, password, or role' });
        }

        if (!allowedRoles.includes(body.role)) {
            return reply.code(400).send({ error: 'Invalid role assignment' });
        }

        const email = body.email.toLowerCase().trim();
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return reply.code(409).send({ error: 'User already exists' });
        }

        const password_hash = await bcrypt.hash(body.password, 10);

        const newTarget = await prisma.user.create({
            data: {
                client_id: clientId,
                email,
                name: body.name || null,
                role: body.role as Role,
                password_hash
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                client_id: true,
                disabled_at: true,
                created_at: true
            }
        });

        return reply.code(201).send({ data: newTarget });
    });

    app.patch<{ Params: { id: string }, Body: UpdateUserBody }>('/:id', { preHandler: [app.requireRole(['CLIENT_ADMIN', 'SUPER_ADMIN'])] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params;
        const body = request.body;

        const existing = await prisma.user.findFirst({
            where: { id, client_id: clientId }
        });

        if (!existing) {
            return reply.code(404).send({ error: 'User not found' });
        }

        let disabled_at = existing.disabled_at;
        if (body.disabled !== undefined) {
            if (body.disabled) {
                disabled_at = new Date();
            } else {
                disabled_at = null;
            }
        }

        if (body.role && !allowedRoles.includes(body.role)) {
            return reply.code(400).send({ error: 'Invalid role assignment' });
        }

        const updated = await prisma.user.update({
            where: { id },
            data: {
                name: body.name !== undefined ? body.name : undefined,
                role: body.role !== undefined ? body.role as Role : undefined,
                disabled_at
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                client_id: true,
                disabled_at: true,
                created_at: true
            }
        });

        return { data: updated };
    });

    app.post<{ Params: { id: string }, Body: ResetPasswordBody }>('/:id/reset-password', { preHandler: [app.requireRole(['CLIENT_ADMIN', 'SUPER_ADMIN'])] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params;
        const { password } = request.body;

        if (!password) {
            return reply.code(400).send({ error: 'Password required' });
        }

        const existing = await prisma.user.findFirst({
            where: { id, client_id: clientId }
        });

        if (!existing) {
            return reply.code(404).send({ error: 'User not found' });
        }

        const password_hash = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { id },
            data: { password_hash }
        });

        return { ok: true };
    });
}
