import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
    interface FastifyRequest {
        clientId: string | null;
    }
    interface FastifyInstance {
        requireClientId: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        optionalClientId: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

const authPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {

    // Initialize clientId on request to null
    fastify.decorateRequest('clientId', null);

    // Hard requirement hook
    const requireClientId = async (request: FastifyRequest, reply: FastifyReply) => {
        const clientId = request.headers['x-client-id'];

        if (!clientId || Array.isArray(clientId)) {
            reply.code(400).send({ error: 'Missing X-Client-Id header' });
            return;
        }

        request.clientId = clientId as string;
    };

    // Optional hook
    const optionalClientId = async (request: FastifyRequest, reply: FastifyReply) => {
        const clientId = request.headers['x-client-id'];

        if (clientId && !Array.isArray(clientId)) {
            request.clientId = clientId as string;
        }
        // If missing, leaving it null is fine
    };

    fastify.decorate('requireClientId', requireClientId);
    fastify.decorate('optionalClientId', optionalClientId);
};

export default fp(authPlugin);
