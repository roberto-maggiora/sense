
import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';

interface AreaParams {
    id: string;
}

interface AreaUpdateBody {
    name?: string;
    disabled?: boolean;
}

export default async function areaRoutes(fastify: FastifyInstance) {

    // PATCH /areas/:id
    fastify.patch<{ Params: AreaParams; Body: AreaUpdateBody }>('/areas/:id', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params;
        const { name, disabled } = request.body;

        // Verify area belongs to client (via site)
        const area = await prisma.area.findUnique({
            where: { id },
            include: { site: true }
        });

        if (!area || area.site.client_id !== clientId) {
            reply.code(404).send({ error: 'Area not found' });
            return;
        }

        try {
            const updated = await prisma.area.update({
                where: { id },
                data: {
                    name: name ? name.trim() : undefined,
                    disabled_at: disabled === true ? new Date() : (disabled === false ? null : undefined)
                }
            });
            return updated;
        } catch (e: any) {
            if (e.code === 'P2002') {
                reply.code(409).send({ error: 'Area with this name already exists in this site' });
            } else {
                throw e;
            }
        }
    });
}
