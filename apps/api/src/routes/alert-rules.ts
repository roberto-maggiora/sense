import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';
import { ScopeType, Operator, AlertRule } from '@prisma/client';

interface CreateAlertRuleBody {
    scope_type: ScopeType;
    scope_id: string;
    parameter: string;
    operator: Operator;
    threshold: number;
    unit?: string;
    breach_duration_seconds: number;
    expected_sample_seconds?: number;
    max_gap_seconds?: number;
    recipients?: any;
}

interface UpdateAlertRuleBody {
    threshold?: number;
    enabled?: boolean;
    recipients?: any;
    breach_duration_seconds?: number;
    expected_sample_seconds?: number;
    max_gap_seconds?: number;
}

export default async function alertRulesRoutes(fastify: FastifyInstance) {
    // POST /alert-rules
    fastify.post<{ Body: CreateAlertRuleBody }>('/alert-rules', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const body = request.body;

        // Ensure client exists
        // (Note: in original code, there was a preHandler hook doing this.
        // We can replicate that logic here, or assume valid clientId from auth middleware if we trust the source.
        // The original code queried prisma.client.findUnique. Let's keep that verify for strictness if desired,
        // or rely on FK constraints. The prompt asked to "Refactor existing routes to use request.clientId instead of re-reading headers".
        // It didn't explicitly ask to remove the DB check, but standard pattern is usually just headers.
        // However, the previous preHandler in this file ALSO did a DB check.
        // Let's keep the DB check for now to be safe and identical behavior, but use request.clientId)

        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) {
            reply.code(404).send({ error: 'Client not found' });
            return;
        }

        // Validation
        if (!body.scope_type || !['device', 'area', 'site'].includes(body.scope_type)) {
            reply.code(400).send({ error: 'Invalid scope_type' });
            return;
        }
        if (!body.operator || !['gt', 'gte', 'lt', 'lte'].includes(body.operator)) {
            reply.code(400).send({ error: 'Invalid operator' });
            return;
        }
        if (typeof body.threshold !== 'number') {
            reply.code(400).send({ error: 'Threshold must be a number' });
            return;
        }
        if (!body.parameter || typeof body.parameter !== 'string') {
            reply.code(400).send({ error: 'Parameter must be a non-empty string' });
            return;
        }
        if (body.breach_duration_seconds <= 0) {
            reply.code(400).send({ error: 'breach_duration_seconds must be > 0' });
            return;
        }

        const expectedSample = body.expected_sample_seconds || 300;
        const maxGap = body.max_gap_seconds || 900;

        if (expectedSample <= 0) {
            reply.code(400).send({ error: 'expected_sample_seconds must be > 0' });
            return;
        }
        if (maxGap < expectedSample) {
            reply.code(400).send({ error: 'max_gap_seconds must be >= expected_sample_seconds' });
            return;
        }

        // Validate Scope Ownership
        if (body.scope_type === 'device') {
            const device = await prisma.device.findFirst({ where: { id: body.scope_id, client_id: clientId } });
            if (!device) {
                reply.code(404).send({ error: 'Device not found within client scope' });
                return;
            }
        } else if (body.scope_type === 'site') {
            const site = await prisma.site.findFirst({ where: { id: body.scope_id, client_id: clientId } });
            if (!site) {
                reply.code(404).send({ error: 'Site not found within client scope' });
                return;
            }
        } else if (body.scope_type === 'area') {
            const area = await prisma.area.findFirst({
                where: { id: body.scope_id },
                include: { site: true }
            });
            if (!area || area.site.client_id !== clientId) {
                reply.code(404).send({ error: 'Area not found within client scope' });
                return;
            }
        }

        const rule = await prisma.alertRule.create({
            data: {
                client_id: clientId,
                scope_type: body.scope_type,
                scope_id: body.scope_id,
                parameter: body.parameter,
                operator: body.operator,
                threshold: body.threshold,
                unit: body.unit,
                breach_duration_seconds: body.breach_duration_seconds,
                expected_sample_seconds: expectedSample,
                max_gap_seconds: maxGap,
                recipients: body.recipients || [],
                enabled: true
            }
        });

        reply.code(201).send(rule);
    });

    // GET /alert-rules
    fastify.get('/alert-rules', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;

        const rules = await prisma.alertRule.findMany({
            where: { client_id: clientId },
            orderBy: { created_at: 'desc' }
        });
        return rules;
    });

    // GET /alert-rules/:id
    fastify.get<{ Params: { id: string } }>('/alert-rules/:id', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params;

        const rule = await prisma.alertRule.findFirst({
            where: { id, client_id: clientId }
        });

        if (!rule) {
            reply.code(404).send({ error: 'Alert rule not found' });
            return;
        }

        return rule;
    });

    // PATCH /alert-rules/:id
    fastify.patch<{ Params: { id: string }; Body: UpdateAlertRuleBody }>('/alert-rules/:id', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params;
        const body = request.body;

        const rule = await prisma.alertRule.findFirst({
            where: { id, client_id: clientId }
        });

        if (!rule) {
            reply.code(404).send({ error: 'Alert rule not found' });
            return;
        }

        // Optional Validation for PATCH fields
        if (body.expected_sample_seconds && body.expected_sample_seconds <= 0) {
            reply.code(400).send({ error: 'expected_sample_seconds must be > 0' });
            return;
        }

        // Complex validation: if updating max_gap but not expected, or vice versa
        // For MVP, simplistic validation or none for cross-field is okay, but let's try basic.
        const newExpected = body.expected_sample_seconds ?? rule.expected_sample_seconds;
        const newMaxGap = body.max_gap_seconds ?? rule.max_gap_seconds;

        if (newMaxGap < newExpected) {
            reply.code(400).send({ error: 'max_gap_seconds must be >= expected_sample_seconds' });
            return;
        }

        const updated = await prisma.alertRule.update({
            where: { id },
            data: {
                threshold: body.threshold,
                enabled: body.enabled,
                recipients: body.recipients,
                breach_duration_seconds: body.breach_duration_seconds,
                expected_sample_seconds: body.expected_sample_seconds,
                max_gap_seconds: body.max_gap_seconds
            }
        });

        return updated;
    });

    // DELETE /alert-rules/:id
    fastify.delete<{ Params: { id: string } }>('/alert-rules/:id', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { id } = request.params;

        const rule = await prisma.alertRule.findFirst({
            where: { id, client_id: clientId }
        });

        if (!rule) {
            reply.code(404).send({ error: 'Alert rule not found' });
            return;
        }

        await prisma.alertRule.delete({
            where: { id }
        });

        reply.code(204).send();
    });
}
