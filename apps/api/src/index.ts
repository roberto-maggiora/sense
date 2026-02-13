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

const start = async () => {
    try {
        console.log(`Starting API... shared contract version: ${CONTRACT_VERSION}`);
        console.log(HELLO_MESSAGE);

        fastify.register(deviceRoutes, { prefix: '/api/v1' });
        fastify.register(ingestMilesightRoutes, { prefix: '/api/v1' });
        fastify.register(internalStatsRoutes, { prefix: '/api/v1' });
        fastify.register(telemetryReadRoutes, { prefix: '/api/v1' });

        await fastify.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
