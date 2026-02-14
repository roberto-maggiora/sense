import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';

export default async function dashboardRoutes(fastify: FastifyInstance) {
    fastify.get('/summary', async (request, reply) => {
        const clientId = request.headers['x-client-id'] as string;
        if (!clientId) {
            return reply.code(400).send({ error: 'Missing X-Client-Id header' });
        }

        try {
            // Parallelize all count queries for efficiency
            const activeDeviceWhere = { client_id: clientId, disabled_at: null };

            const [
                totalDevices,
                statusCounts,
                offlineCount,
                lastTelemetry
            ] = await Promise.all([
                // 1. Total active devices
                prisma.device.count({ where: activeDeviceWhere }),

                // 2. Counts by Status
                prisma.deviceStatus.groupBy({
                    by: ['status'],
                    where: {
                        client_id: clientId,
                        device: { disabled_at: null } // Ensure device is active
                    },
                    _count: true
                }),

                // 3. Offline: active devices with NO telemetry in last 30 mins
                // "no telemetry in last 30 mins OR no telemetry ever"
                // Implemented as: active devices where telemetry_events has NONE with occurred_at > 30 mins ago
                prisma.device.count({
                    where: {
                        ...activeDeviceWhere,
                        telemetry_events: {
                            none: {
                                occurred_at: {
                                    gte: new Date(Date.now() - 30 * 60 * 1000)
                                }
                            }
                        }
                    }
                }),

                // 4. Last Telemetry timestamp
                prisma.telemetryEvent.findFirst({
                    where: { client_id: clientId },
                    orderBy: { occurred_at: 'desc' },
                    select: { occurred_at: true }
                })
            ]);

            // Transform statusCounts array to map
            const counts = {
                red: 0,
                amber: 0,
                green: 0
            };

            statusCounts.forEach(group => {
                const s = group.status as keyof typeof counts;
                if (counts[s] !== undefined) {
                    counts[s] = group._count;
                }
            });

            return {
                total_devices: totalDevices,
                red: counts.red,
                amber: counts.amber,
                green: counts.green,
                offline: offlineCount,
                open_alerts: 0, // Stub for Issue 14
                last_telemetry_at: lastTelemetry?.occurred_at || null
            };

        } catch (error) {
            request.log.error(error, 'Error fetching dashboard summary');
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

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
