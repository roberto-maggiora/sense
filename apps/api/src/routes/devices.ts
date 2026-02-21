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
    site_id?: string | null;
    area_id?: string | null;
    disabled?: boolean;
    // Explicitly disallow client_id, source, external_id
    client_id?: never;
    source?: never;
    external_id?: never;
}

export default async function deviceRoutes(fastify: FastifyInstance) {

    // GET /devices - List all devices (filtered by client_id)
    fastify.get('/devices', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;

        try {
            const whereClause: any = { client_id: clientId, disabled_at: null };
            if (request.user?.role === 'SITE_ADMIN') {
                whereClause.site_id = request.user.site_id || 'unassigned-guard';
            }

            const devices = await prisma.device.findMany({
                where: whereClause,
                orderBy: { created_at: 'desc' }
            });
            return { data: devices };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // GET /devices/:id
    fastify.get<{ Params: DeviceParams }>('/devices/:id', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params;

        const whereClause: any = {
            id,
            client_id: clientId,
            disabled_at: null
        };
        if (request.user?.role === 'SITE_ADMIN') {
            whereClause.site_id = request.user.site_id || 'unassigned-guard';
        }

        const device = await prisma.device.findFirst({
            where: whereClause
        });

        if (!device) {
            reply.code(404).send({ error: 'Device not found' });
            return;
        }

        return device;
    });

    // POST /devices
    fastify.post<{ Body: DeviceBody }>('/devices', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
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
    fastify.patch<{ Params: DeviceParams; Body: DeviceUpdateBody }>('/devices/:id', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params;
        const body = request.body as any;
        const { name, disabled } = request.body;
        let { site_id, area_id } = request.body; // Let as mutable

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

        // Logic for site/area assignment
        // 1. If site_id explicitly null -> area_id = null
        if (site_id === null) {
            area_id = null;
        }

        // 2. If area_id is provided (non-null), validation needed
        if (area_id) {
            const area = await prisma.area.findUnique({ where: { id: area_id }, include: { site: true } });

            // Must exist and belong to client
            if (!area || area.site.client_id !== clientId) {
                reply.code(400).send({ error: 'Invalid area_id for this client' });
                return;
            }

            // If site_id is ALSO provided, must match
            if (site_id && area.site_id !== site_id) {
                reply.code(400).send({ error: 'area_id does not belong to site_id' });
                return;
            }

            // If site_id NOT provided, infer from area (if not clearing site)
            if (site_id === undefined) {
                // Check if existing device site_id mismatches? 
                // Actually better to just Set site_id to area.site_id to be safe and consistent
                site_id = area.site_id;
            }
        }

        // 3. If site_id is provided (non-null), validate it exists/belongs to client
        if (site_id) {
            const site = await prisma.site.findFirst({ where: { id: site_id, client_id: clientId } });
            if (!site) {
                reply.code(400).send({ error: 'Invalid site_id for this client' });
                return;
            }

            // If we have a site_id, and area_id is undefined (meaning keep existing area),
            // we should check if existing area belongs to NEW site.
            // If it doesn't, we must clear area.
            if (area_id === undefined && device.area_id) {
                // Check consistency
                if (device.site_id !== site_id) {
                    // We are changing site, but didn't specify area. 
                    // The old area likely doesn't belong to new site (unless moved? unlikely).
                    // Safe default: clear area if site changes and area not specified.
                    // OR check DB. Let's check DB to be precise.
                    const currentArea = await prisma.area.findUnique({ where: { id: device.area_id } });
                    if (currentArea && currentArea.site_id !== site_id) {
                        area_id = null; // Clear incompatible area
                    }
                }
            }
        }

        try {
            const updated = await prisma.device.update({
                where: { id, client_id: clientId },
                data: {
                    name,
                    disabled_at: disabled === true ? new Date() : (disabled === false ? null : undefined),
                    site_id,
                    area_id
                }
            });
            return { data: updated };
        } catch (error: any) {
            if (error.code === 'P2025') {
                return reply.code(404).send({ error: 'Device not found' });
            }
            request.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

}
