import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@sense/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only';

const authRoutes: FastifyPluginAsync = async (app) => {

    app.post('/login', async (request, reply) => {
        const body = request.body as any;
        if (!body || !body.email || !body.password) {
            return reply.code(400).send({ error: 'Email and password required' });
        }

        const email = body.email.toLowerCase().trim();
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user || user.disabled_at) {
            return reply.code(401).send({ error: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(body.password, user.password_hash);
        if (!isValid) {
            return reply.code(401).send({ error: 'Invalid credentials' });
        }

        const tokenPayload = {
            sub: user.id,
            role: user.role,
            client_id: user.client_id,
            site_id: user.site_id
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

        return {
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                client_id: user.client_id,
                site_id: user.site_id,
                name: user.name
            }
        };
    });

    app.get('/me', { preHandler: [app.requireUser] }, async (request, reply) => {
        const reqUser = (request as any).user;
        const user = await prisma.user.findUnique({
            where: { id: reqUser.id }
        });

        if (!user || user.disabled_at) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        let client = null;
        if (user.client_id) {
            client = await prisma.client.findUnique({
                where: { id: user.client_id },
                select: { id: true, name: true, disabled_at: true }
            });
            if (client?.disabled_at) {
                return reply.code(401).send({ error: 'Client disabled' });
            }
        }

        return {
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                client_id: user.client_id,
                name: user.name
            },
            client: client ? { id: client.id, name: client.name } : null
        };
    });

};

export default authRoutes;
