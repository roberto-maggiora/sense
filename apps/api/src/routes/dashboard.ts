import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';

export default async function dashboardRoutes(fastify: FastifyInstance) {
    fastify.get('/devices', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        if (!clientId) {
            return reply.code(400).send({ error: 'Missing X-Client-Id header' });
        }

        const query = request.query as {
            status?: string;
            site_id?: string;
            area_id?: string;
            limit?: string;
        };

        const limit = query.limit ? Math.min(parseInt(query.limit), 2000) : 200;
        const statusFilter = query.status;
        const siteId = query.site_id;
        const areaId = query.area_id;

        // Build WHERE clause parameters
        const params: any[] = [clientId];
        let whereClause = `d.client_id = $1`;
        let paramIdx = 2;

        if (statusFilter) {
            whereClause += ` AND s.status::text = $${paramIdx}`;
            params.push(statusFilter);
            paramIdx++;
        }

        if (siteId) {
            whereClause += ` AND d.site_id = $${paramIdx}`;
            params.push(siteId);
            paramIdx++;
        }

        if (areaId) {
            whereClause += ` AND d.area_id = $${paramIdx}`;
            params.push(areaId);
            paramIdx++;
        }

        // Raw SQL for efficient sorting and fetching latest telemetry
        // Note: Using explicit table names from @@map in schema.prisma
        // devices, device_status, telemetry_events
        const sql = `
            SELECT 
                d.id, d.client_id, d.site_id, d.area_id, d.source, d.external_id, d.name, d.disabled_at, d.created_at,
                s.status, s.reason, s.updated_at as status_updated_at,
                t.payload as last_telemetry, t.occurred_at as last_telemetry_at
            FROM "devices" d
            LEFT JOIN "device_status" s ON d.id = s.device_id
            LEFT JOIN LATERAL (
                SELECT payload, occurred_at 
                FROM "telemetry_events"
                WHERE device_id = d.id
                ORDER BY occurred_at DESC
                LIMIT 1
            ) t ON true
            WHERE ${whereClause}
            ORDER BY
                CASE s.status
                    WHEN 'red' THEN 1
                    WHEN 'amber' THEN 2
                    WHEN 'green' THEN 3
                    ELSE 4
                END ASC,
                s.updated_at DESC NULLS LAST
            LIMIT ${limit}
        `;

        try {
            const rawResults = await prisma.$queryRawUnsafe(sql, ...params);

            // Map results to cleaner JSON structure
            const results = (rawResults as any[]).map(row => ({
                id: row.id,
                client_id: row.client_id,
                site_id: row.site_id,
                area_id: row.area_id,
                source: row.source,
                external_id: row.external_id,
                name: row.name,
                disabled_at: row.disabled_at,
                created_at: row.created_at,
                current_status: row.status ? {
                    status: row.status,
                    reason: row.reason,
                    updated_at: row.status_updated_at
                } : null,
                latest_telemetry: row.last_telemetry ? {
                    occurred_at: row.last_telemetry_at,
                    payload: row.last_telemetry
                } : null
            }));

            return reply.send({ data: results });
        } catch (error) {
            request.log.error(error, 'Error fetching dashboard devices');
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
