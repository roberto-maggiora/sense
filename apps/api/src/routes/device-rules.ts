import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';
import { Operator, DeviceStatusLevel, Role } from '@prisma/client';

export default async function deviceRulesRoutes(fastify: FastifyInstance) {
    // GET /devices/:id/rules - List rules for a device
    fastify.get<{ Params: { id: string } }>('/devices/:id/rules', {
        preHandler: [fastify.requireClientId]
    }, async (request, reply) => {
        const { id } = request.params;
        const clientId = request.clientId as string;

        // Verify device access
        const device = await prisma.device.findUnique({
            where: { id, client_id: clientId }
        });

        if (!device) return reply.code(404).send({ error: 'Device not found' });

        if (request.user!.role === Role.SITE_ADMIN) {
            if (!device.site_id || device.site_id !== request.user!.site_id) {
                return reply.code(403).send({ error: "You don't have permission to view rules for this device." });
            }
        }

        const rules = await prisma.deviceAlarmRule.findMany({
            where: {
                client_id: clientId,
                device_id: id
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        return rules;
    });

    // POST /devices/:id/rules - Create a rule for a device
    fastify.post<{
        Params: { id: string },
        Body: { metric: string, operator: Operator, threshold: number, duration_seconds: number, severity: DeviceStatusLevel, enabled: boolean }
    }>('/devices/:id/rules', {
        preHandler: [fastify.requireClientId, fastify.requireRole([Role.CLIENT_ADMIN, Role.SUPER_ADMIN, Role.SITE_ADMIN])]
    }, async (request, reply) => {
        const { id } = request.params;
        const clientId = request.clientId as string;
        request.log.info({
            user: request.user ? { role: request.user.role, client_id: request.user.client_id } : null,
            clientId
        }, 'Creating rule for device');
        const { metric, operator, threshold, duration_seconds, severity, enabled } = request.body;

        // Validation
        if (metric !== 'temperature') {
            return reply.code(400).send({ error: 'Only "temperature" metric is supported in v1' });
        }
        if (!['gt', 'lt'].includes(operator)) {
            return reply.code(400).send({ error: 'Operator must be "gt" or "lt"' });
        }
        if (!['amber', 'red'].includes(severity)) {
            return reply.code(400).send({ error: 'Severity must be "amber" or "red"' });
        }
        if (typeof threshold !== 'number') {
            return reply.code(400).send({ error: 'Threshold must be a number' });
        }
        if (typeof duration_seconds !== 'number' || duration_seconds < 0) {
            return reply.code(400).send({ error: 'Duration seconds must be a positive integer' });
        }

        const device = await prisma.device.findUnique({
            where: { id, client_id: clientId }
        });

        if (!device) {
            return reply.code(404).send({ error: 'Device not found' });
        }

        if (request.user!.role === Role.SITE_ADMIN) {
            if (!device.site_id || device.site_id !== request.user!.site_id) {
                return reply.code(403).send({ error: "You don't have permission to manage rules for this device." });
            }
        }

        try {
            const rule = await prisma.deviceAlarmRule.create({
                data: {
                    client_id: clientId,
                    device_id: id,
                    metric,
                    operator,
                    threshold,
                    duration_seconds,
                    severity,
                    enabled: enabled ?? true
                }
            });

            return reply.code(201).send(rule);
        } catch (error: any) {
            if (error.code === 'P2002') { // Unique constraint violation
                return reply.code(409).send({ error: `A ${severity} rule for ${metric} already exists on this device` });
            }
            request.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // PATCH /rules/:ruleId - Update a rule
    fastify.patch<{
        Params: { ruleId: string },
        Body: { enabled?: boolean, threshold?: number, duration_seconds?: number, operator?: Operator, severity?: DeviceStatusLevel }
    }>('/rules/:ruleId', {
        preHandler: [fastify.requireClientId, fastify.requireRole([Role.CLIENT_ADMIN, Role.SUPER_ADMIN, Role.SITE_ADMIN])]
    }, async (request, reply) => {
        const { ruleId } = request.params;
        const clientId = request.clientId as string;
        const updates = request.body;

        // Validation
        if (updates.operator && !['gt', 'lt'].includes(updates.operator)) {
            return reply.code(400).send({ error: 'Operator must be "gt" or "lt"' });
        }
        if (updates.severity && !['amber', 'red'].includes(updates.severity)) {
            return reply.code(400).send({ error: 'Severity must be "amber" or "red"' });
        }
        if (updates.duration_seconds !== undefined && (typeof updates.duration_seconds !== 'number' || updates.duration_seconds < 0)) {
            return reply.code(400).send({ error: 'Duration seconds must be a positive integer' });
        }
        if (updates.threshold !== undefined && typeof updates.threshold !== 'number') {
            return reply.code(400).send({ error: 'Threshold must be a number' });
        }

        try {
            // Check ownership and scope FIRST before mutating
            const existing = await prisma.deviceAlarmRule.findUnique({
                where: { id: ruleId },
                include: { device: true }
            });

            if (!existing || existing.client_id !== clientId) {
                return reply.code(404).send({ error: 'Rule not found' });
            }

            if (request.user!.role === Role.SITE_ADMIN) {
                if (!existing.device.site_id || existing.device.site_id !== request.user!.site_id) {
                    return reply.code(403).send({ error: "You don't have permission to manage rules for this device." });
                }
            }

            const rule = await prisma.deviceAlarmRule.update({
                where: {
                    id: ruleId,
                    client_id: clientId // Implicit scoping check via composite unique constraint if we had one, but we don't.
                    // Wait, `prisma.deviceAlarmRule.update` on purely `id` might not check `client_id` immediately if not part of `where` unique fields.
                    // So let's check first.
                },
                data: updates
            });

            return rule;
        } catch (error: any) {
            request.log.error(error);
            if (error.code === 'P2002') {
                return reply.code(409).send({ error: 'Cannot update: another rule already exists for this severity and metric combination' });
            }

            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // DELETE /rules/:ruleId - Hard delete a rule
    fastify.delete<{ Params: { ruleId: string } }>('/rules/:ruleId', {
        preHandler: [fastify.requireClientId, fastify.requireRole([Role.CLIENT_ADMIN, Role.SUPER_ADMIN, Role.SITE_ADMIN])]
    }, async (request, reply) => {
        const { ruleId } = request.params;
        const clientId = request.clientId as string;

        // Scope check
        const existing = await prisma.deviceAlarmRule.findUnique({
            where: { id: ruleId },
            include: { device: true }
        });

        if (!existing || existing.client_id !== clientId) {
            return reply.code(404).send({ error: 'Rule not found' });
        }

        if (request.user!.role === Role.SITE_ADMIN) {
            if (!existing.device.site_id || existing.device.site_id !== request.user!.site_id) {
                return reply.code(403).send({ error: "You don't have permission to manage rules for this device." });
            }
        }

        await prisma.deviceAlarmRule.delete({
            where: { id: ruleId }
        });

        return reply.code(204).send();
    });
}
