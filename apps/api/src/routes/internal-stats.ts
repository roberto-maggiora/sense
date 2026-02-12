import { FastifyInstance } from 'fastify';
import { snapshot } from '../ingest/ingest-stats';

export default async function internalStatsRoutes(fastify: FastifyInstance) {
    fastify.get('/internal/ingest-stats', async (request, reply) => {
        return snapshot();
    });
}
