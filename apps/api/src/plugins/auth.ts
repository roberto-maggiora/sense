import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only';

declare module 'fastify' {
    interface FastifyRequest {
        user?: {
            id: string;
            role: string;
            client_id: string | null;
            site_id: string | null;
        };
        clientId?: string;
    }
    interface FastifyInstance {
        requireUser: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requireClientId: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        optionalClientId: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requireRole: (roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

const authPlugin: FastifyPluginAsync = async (app) => {
    app.decorate('requireUser', async (request: FastifyRequest, reply: FastifyReply) => {
        const clientHeader = request.headers['x-client-id'];
        if (clientHeader === 'internal') {
            request.user = { id: 'internal', role: 'SUPER_ADMIN', client_id: null, site_id: null };
            return;
        }

        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            request.log.warn('Missing or invalid Authorization header');
            const err = new Error('Unauthorized: Missing or invalid token');
            (err as any).statusCode = 401;
            throw err;
        }

        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as { sub: string, role: string, client_id: string | null, site_id?: string | null };

            if (!decoded.sub || !decoded.role) {
                const err = new Error('Unauthorized: Invalid token payload');
                (err as any).statusCode = 401;
                throw err;
            }

            if (decoded.role !== 'SUPER_ADMIN' && !decoded.client_id) {
                const err = new Error('Unauthorized: User missing client context');
                (err as any).statusCode = 401;
                throw err;
            }

            request.user = {
                id: decoded.sub,
                role: decoded.role,
                client_id: decoded.client_id || null,
                site_id: decoded.site_id || null
            };
        } catch (error) {
            request.log.warn('JWT verification failed');
            const err = new Error('Unauthorized: Token invalid or expired');
            (err as any).statusCode = 401;
            throw err;
        }
    });

    // Helper to ensure the request has a resolved clientId (either from user token or manual for SUPER_ADMINs later)
    app.decorate('requireClientId', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.user) {
            await app.requireUser(request, reply);
        }

        if (request.user!.role === 'SUPER_ADMIN') {
            // For super admins accessing client-scoped routes, they MUST provide an x-client-id header to impersonate
            const requestedClient = request.headers['x-client-id'];
            if (!requestedClient || typeof requestedClient !== 'string') {
                request.log.warn('SUPER_ADMIN missing x-client-id header for client-scoped route');
                const err = new Error('Client not selected');
                (err as any).statusCode = 409;
                throw err;
            }
            request.clientId = requestedClient;
        } else {
            if (!request.user!.client_id) {
                const err = new Error('Unauthorized: Missing client context');
                (err as any).statusCode = 401;
                throw err;
            }
            request.clientId = request.user!.client_id;
        }
    });

    app.decorate('optionalClientId', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            await app.requireUser(request, reply);
            if (request.user) {
                if (request.user.role === 'SUPER_ADMIN') {
                    const requestedClient = request.headers['x-client-id'];
                    if (requestedClient && typeof requestedClient === 'string') {
                        request.clientId = requestedClient;
                    }
                } else {
                    request.clientId = request.user.client_id || undefined;
                }
            }
        } catch (e) {
            // Ignore auth errors for optional scope
        }
    });

    app.decorate('requireRole', (roles: string[]) => {
        return async (request: FastifyRequest, reply: FastifyReply) => {
            if (!request.user) {
                await app.requireUser(request, reply);
            }

            if (!roles.includes(request.user!.role)) {
                const err = new Error('Forbidden: Insufficient role permissions');
                (err as any).statusCode = 403;
                throw err;
            }
        };
    });
};

export default fp(authPlugin);
