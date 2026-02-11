import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';
import { TelemetryV1Source } from '@sense/contracts';

interface DeviceParams {
    id: string;
}

interface DeviceBody {
    source: TelemetryV1Source;
    external_id: string;
    site_id?: string;
    area_id?: string;
    name: string;
}

interface DeviceUpdateBody {
    name?: string;
    site_id?: string;
    area_id?: string;
    // Explicitly disallow client_id, source, external_id
    client_id?: never;
    source?: never;
    external_id?: never;
}

export default async function deviceRoutes(fastify: FastifyInstance) {
    // Common hook to validate X-Client-Id
    fastify.addHook('preHandler', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        if (!clientId) {
            reply.code(400).send({ error: 'Missing X-Client-Id header' });
            return;
        }

        const client = await prisma.client.findUnique({
            where: { id: clientId }
        });

        if (!client) {
            reply.code(404).send({ error: 'Client not found' });
            return;
        }
    });

    // GET /devices
    fastify.get('/devices', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        const devices = await prisma.device.findMany({
            where: {
                client_id: clientId,
                disabled_at: null // Only active devices? Or all? "DELETE /devices/:deviceId (soft-disable; set disabled_at)" suggests we probably filter them out by default or explicit. I'll filter them out for now.
            }
        });
        return devices;
    });

    // GET /devices/:id
    fastify.get<{ Params: DeviceParams }>('/devices/:id', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        const { id } = request.params;

        const device = await prisma.device.findFirst({
            where: {
                id,
                client_id: clientId,
                disabled_at: null
            }
        });

        if (!device) {
            reply.code(404).send({ error: 'Device not found' });
            return;
        }

        return device;
    });

    // POST /devices
    fastify.post<{ Body: DeviceBody }>('/devices', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        const { source, external_id, site_id, area_id, name } = request.body;

        if (!name || name.trim() === '') {
            reply.code(400).send({ error: 'name is required' });
            return;
        }

        // Verify site/area belong to client if provided
        if (site_id) {
            const site = await prisma.site.findFirst({ where: { id: site_id, client_id: clientId } });
            if (!site) {
                reply.code(400).send({ error: 'Invalid site_id for this client' });
                return;
            }
        }
        // TODO: Verify area belongs to site if both provided, or just area->site->client chain.
        if (area_id) {
            const area = await prisma.area.findUnique({ where: { id: area_id }, include: { site: true } });
            if (!area || area.site.client_id !== clientId) {
                reply.code(400).send({ error: 'Invalid area_id for this client' });
                return;
            }
            if (site_id && area.site_id !== site_id) {
                reply.code(400).send({ error: 'area_id does not belong to site_id' });
                return;
            }
        }

        try {
            const device = await prisma.device.create({
                data: {
                    client_id: clientId,
                    source,
                    external_id,
                    site_id,
                    area_id,
                    name
                }
            });
            reply.code(201).send(device);
        } catch (e: any) {
            if (e.code === 'P2002') { // Unique constraint violation
                reply.code(409).send({ error: 'Device with this source and external_id already exists' });
            } else if (e.code === 'P2003') { // Foreign key constraint violation
                reply.code(400).send({ error: 'Invalid foreign key reference' });
            } else {
                throw e;
            }
        }
    });

    // PATCH /devices/:id
    fastify.patch<{ Params: DeviceParams; Body: DeviceUpdateBody }>('/devices/:id', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        const { id } = request.params;
        const body = request.body as any;
        const { name, site_id, area_id } = request.body;

        if (body.client_id || body.source || body.external_id) {
            reply.code(400).send({ error: 'Cannot update client_id, source, or external_id' });
            return;
        }

        const device = await prisma.device.findFirst({
            where: { id, client_id: clientId, disabled_at: null }
        });

        if (!device) {
            reply.code(404).send({ error: 'Device not found' });
            return;
        }

        // Verify site/area belong to client if provided
        if (site_id) {
            const site = await prisma.site.findFirst({ where: { id: site_id, client_id: clientId } });
            if (!site) {
                reply.code(400).send({ error: 'Invalid site_id for this client' });
                return;
            }
        }
        if (area_id) {
            const area = await prisma.area.findUnique({ where: { id: area_id }, include: { site: true } });
            if (!area || area.site.client_id !== clientId) {
                reply.code(400).send({ error: 'Invalid area_id for this client' });
                return;
            }
            if (site_id && area.site_id !== site_id) {
                reply.code(400).send({ error: 'area_id does not belong to site_id' });
                return;
            }
        }

        try {
            const updated = await prisma.device.update({
                where: { id },
                data: {
                    name,
                    site_id,
                    area_id
                }
            });

            return updated;
        } catch (e: any) {
            if (e.code === 'P2003') {
                reply.code(400).send({ error: 'Invalid foreign key reference' });
            } else {
                throw e;
            }
        }
    });

    // DELETE /devices/:id
    fastify.delete<{ Params: DeviceParams }>('/devices/:id', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        const { id } = request.params;

        const device = await prisma.device.findFirst({
            where: { id, client_id: clientId, disabled_at: null }
        });

        if (!device) {
            reply.code(404).send({ error: 'Device not found' });
            return;
        }

        try {
            await prisma.device.update({
                where: { id },
                data: { disabled_at: new Date() }
            });
            reply.code(204).send();
        } catch (e: any) {
            if (e.code === 'P2003') {
                reply.code(400).send({ error: 'Invalid foreign key reference' });
            } else {
                throw e;
            }
        }
    });
}
