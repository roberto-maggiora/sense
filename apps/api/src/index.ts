import 'dotenv/config';
import Fastify from 'fastify';
import { CONTRACT_VERSION, HELLO_MESSAGE, TelemetryEventV1 } from '@sense/contracts';

// Compile-time check for TelemetryEventV1
type _TestTelemetryV1 = TelemetryEventV1;


const fastify = Fastify({
    logger: true
});

fastify.get('/health', async (request, reply) => {
    return { ok: true };
});

fastify.get('/api/v1/health', async (request, reply) => {
    return { ok: true };
});

import deviceRoutes from './routes/devices';
import ingestMilesightRoutes from './routes/ingest-milesight';
import internalStatsRoutes from './routes/internal-stats';
import telemetryReadRoutes from './routes/telemetry-read';
import alertRulesRoutes from './routes/alert-rules';
import deviceStatusRoutes from './routes/device-status';
import dashboardRoutes from './routes/dashboard';
import alertsHistoryRoutes from './routes/alerts-history';
import alertsAcknowledgeRoutes from './routes/alerts-acknowledge';
import siteRoutes from './routes/sites';
import areaRoutes from './routes/areas';

import adminClientRoutes from './routes/admin/clients';
import adminUserRoutes from './routes/admin/users';
import adminAuthPlugin from './plugins/admin-auth';

import authRoutes from './routes/auth';

import authPlugin from './plugins/auth';

const start = async () => {
    try {
        console.log(`Starting API... shared contract version: ${CONTRACT_VERSION}`);
        console.log(HELLO_MESSAGE);

        await fastify.register(import('@fastify/cors'), {
            origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
            methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'X-Client-Id', 'X-Ingest-Key', 'Authorization', 'x-admin-token'],
            credentials: true
        });

        await fastify.register(authPlugin);
        await fastify.register(adminAuthPlugin);

        fastify.register(authRoutes, { prefix: '/auth' });

        fastify.register(deviceRoutes, { prefix: '/api/v1' });
        fastify.register(ingestMilesightRoutes, { prefix: '/api/v1' });
        fastify.register(internalStatsRoutes, { prefix: '/api/v1' });
        fastify.register(telemetryReadRoutes, { prefix: '/api/v1' });
        fastify.register(alertRulesRoutes, { prefix: '/api/v1' });
        fastify.register(deviceStatusRoutes, { prefix: '/api/v1' });
        fastify.register(alertsHistoryRoutes, { prefix: '/api/v1' });
        fastify.register(alertsAcknowledgeRoutes, { prefix: '/api/v1' });
        fastify.register(siteRoutes, { prefix: '/api/v1' });
        fastify.register(areaRoutes, { prefix: '/api/v1' });
        fastify.register(import('./routes/device-rules.js').then(m => m.default), { prefix: '/api/v1' });
        fastify.register(dashboardRoutes, { prefix: '/api/v1/dashboard' }); // Note prefix includes /dashboard
        fastify.register(import('./routes/users.js').then(m => m.default), { prefix: '/api/v1/users' });

        // Admin routes
        fastify.register(async (app) => {
            app.register(adminClientRoutes, { prefix: '/clients' });
            app.register(adminUserRoutes, { prefix: '/users' });
        }, { prefix: '/admin' });

        const address = await fastify.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
        console.log(`Server listening on ${address}`);

        // Graceful Shutdown
        const shutdown = async (signal: string) => {
            console.log(`[${signal}] Shutting down API...`);
            await fastify.close();
            await import('@sense/database').then(m => m.prisma.$disconnect());
            console.log('API closed');
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
