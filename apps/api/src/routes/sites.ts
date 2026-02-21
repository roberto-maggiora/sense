
import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';

interface SiteParams {
    id: string;
}

interface SiteBody {
    name: string;
}

interface SiteUpdateBody {
    name?: string;
    disabled?: boolean;
}

interface AreaBody {
    name: string;
}

export default async function siteRoutes(fastify: FastifyInstance) {

    // GET /sites
    fastify.get<{ Querystring: { includeDisabled?: string; limit?: string } }>('/sites', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { includeDisabled, limit } = request.query;
        const take = limit ? parseInt(limit) : 100;

        const where: any = { client_id: clientId };
        if (includeDisabled !== 'true') {
            where.disabled_at = null;
        }

        const sites = await prisma.site.findMany({
            where,
            include: { areas: true },
            orderBy: { created_at: 'desc' },
            take
        });

        return { data: sites };
    });

    // POST /sites
    fastify.post<{ Body: SiteBody }>('/sites', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { name } = request.body;

        if (!name || name.trim().length < 2 || name.trim().length > 80) {
            reply.code(400).send({ error: 'Name must be between 2 and 80 characters' });
            return;
        }

        try {
            const site = await prisma.site.create({
                data: {
                    client_id: clientId,
                    name: name.trim()
                }
            });
            reply.code(201).send(site);
        } catch (e: any) {
            if (e.code === 'P2002') {
                reply.code(409).send({ error: 'Site with this name already exists' });
            } else {
                throw e;
            }
        }
    });

    // PATCH /sites/:id
    fastify.patch<{ Params: SiteParams; Body: SiteUpdateBody }>('/sites/:id', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params;
        const { name, disabled } = request.body;

        const site = await prisma.site.findFirst({
            where: { id, client_id: clientId }
        });

        if (!site) {
            reply.code(404).send({ error: 'Site not found' });
            return;
        }

        try {
            const updated = await prisma.site.update({
                where: { id },
                data: {
                    name: name ? name.trim() : undefined,
                    disabled_at: disabled === true ? new Date() : (disabled === false ? null : undefined)
                }
            });
            return updated;
        } catch (e: any) {
            if (e.code === 'P2002') {
                reply.code(409).send({ error: 'Site with this name already exists' });
            } else {
                throw e;
            }
        }
    });

    // GET /sites/:id/areas
    fastify.get<{ Params: SiteParams; Querystring: { limit?: string; includeDisabled?: string } }>('/sites/:id/areas', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params;
        const { limit, includeDisabled } = request.query;
        const take = limit ? parseInt(limit) : 100;

        const site = await prisma.site.findFirst({
            where: { id, client_id: clientId }
        });

        if (!site) {
            reply.code(404).send({ error: 'Site not found' });
            return;
        }

        const where: any = { site_id: id };
        if (includeDisabled !== 'true') {
            where.disabled_at = null;
        }

        const areas = await prisma.area.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take
        });

        return { data: areas };
    });

    // POST /sites/:id/areas
    fastify.post<{ Params: SiteParams; Body: AreaBody }>('/sites/:id/areas', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params;
        const { name } = request.body;

        const site = await prisma.site.findFirst({
            where: { id, client_id: clientId }
        });

        if (!site) {
            reply.code(404).send({ error: 'Site not found' });
            return;
        }

        if (!name || name.trim().length < 2 || name.trim().length > 80) {
            reply.code(400).send({ error: 'Name must be between 2 and 80 characters' });
            return;
        }

        try {
            const area = await prisma.area.create({
                data: {
                    site_id: id,
                    name: name.trim()
                }
            });
            reply.code(201).send(area);
        } catch (e: any) {
            if (e.code === 'P2002') {
                reply.code(409).send({ error: 'Area with this name already exists in this site' });
            } else {
                throw e;
            }
        }
    });
}
