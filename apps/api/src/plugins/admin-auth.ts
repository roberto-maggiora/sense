import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

export const requireAdminToken = async (request: FastifyRequest, reply: FastifyReply) => {
    const adminToken = request.headers['x-admin-token'];

    if (!adminToken) {
        request.log.warn('Missing x-admin-token header');
        return reply.code(401).send({ error: 'Unauthorized: Missing admin token' });
    }

    if (adminToken !== process.env.INTERNAL_ADMIN_TOKEN) {
        request.log.warn('Invalid x-admin-token provided');
        return reply.code(401).send({ error: 'Unauthorized: Invalid admin token' });
    }
};

const adminAuthPlugin: FastifyPluginAsync = async (fastify) => {
    fastify.decorate('requireAdminToken', requireAdminToken);
};

export default fp(adminAuthPlugin, {
    name: 'admin-auth'
});

declare module 'fastify' {
    interface FastifyInstance {
        requireAdminToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}
