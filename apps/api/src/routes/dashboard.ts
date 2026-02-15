import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';

export default async function dashboardRoutes(fastify: FastifyInstance) {
    fastify.get('/summary', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;

        try {
            // Parallelize all count queries for efficiencyulate all counts with offline precedence
            const sql = `
                SELECT
                    COUNT(*)::int as total_devices,
                    SUM(CASE WHEN effective_status = 'red' THEN 1 ELSE 0 END)::int as red,
                    SUM(CASE WHEN effective_status = 'amber' THEN 1 ELSE 0 END)::int as amber,
                    SUM(CASE WHEN effective_status = 'green' THEN 1 ELSE 0 END)::int as green,
                    SUM(CASE WHEN effective_status = 'offline' THEN 1 ELSE 0 END)::int as offline,
                    MAX(last_seen) as last_telemetry_at
                FROM (
                    SELECT
                        d.id,
                        t.occurred_at as last_seen,
                        CASE
                            WHEN t.occurred_at < NOW() - INTERVAL '30 minutes' OR t.occurred_at IS NULL THEN 'offline'
                            ELSE s.status::text
                        END as effective_status
                    FROM "devices" d
                    LEFT JOIN "device_status" s ON d.id = s.device_id
                    LEFT JOIN LATERAL (
                        SELECT occurred_at
                        FROM "telemetry_events"
                        WHERE device_id = d.id
                        ORDER BY occurred_at DESC
                        LIMIT 1
                    ) t ON true
                    WHERE d.client_id = $1 AND d.disabled_at IS NULL
                ) as derived
            `;

            const rawResults = await prisma.$queryRawUnsafe<any[]>(sql, clientId);
            const row = rawResults[0];

            return {
                total_devices: row.total_devices || 0,
                red: row.red || 0,
                amber: row.amber || 0,
                green: row.green || 0,
                offline: row.offline || 0,
                open_alerts: 0, // Stub for Issue 14
                last_telemetry_at: row.last_telemetry_at || null
            };

        } catch (error) {
            request.log.error(error, 'Error fetching dashboard summary');
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    fastify.get('/devices', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;

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
            if (statusFilter === 'offline') {
                whereClause += ` AND (t.occurred_at < NOW() - INTERVAL '30 minutes' OR t.occurred_at IS NULL)`;
            } else {
                whereClause += ` AND s.status::text = $${paramIdx}`;
                params.push(statusFilter);
                paramIdx++;
            }
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
            const results = (rawResults as any[]).map(row => {
                const isOffline =
                    !row.last_telemetry_at ||
                    new Date(row.last_telemetry_at).getTime() <
                    Date.now() - 30 * 60 * 1000;

                return {
                    id: row.id,
                    client_id: row.client_id,
                    site_id: row.site_id,
                    area_id: row.area_id,
                    source: row.source,
                    external_id: row.external_id,
                    name: row.name,
                    disabled_at: row.disabled_at,
                    created_at: row.created_at,

                    current_status: isOffline
                        ? {
                            status: 'offline',
                            reason: null,
                            updated_at: row.status_updated_at
                        }
                        : row.status
                            ? {
                                status: row.status,
                                reason: row.reason,
                                updated_at: row.status_updated_at
                            }
                            : null,

                    latest_telemetry: row.last_telemetry ? {
                        occurred_at: row.last_telemetry_at,
                        payload: row.last_telemetry
                    } : null,

                    metrics: {
                        temperature: row.last_telemetry?.temperature ?? null,
                        humidity: row.last_telemetry?.humidity ?? null
                    }
                };
            });


            return reply.send({ data: results });
        } catch (error) {
            request.log.error(error, 'Error fetching dashboard devices');
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
