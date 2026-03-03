import { FastifyInstance } from 'fastify';
import { prisma, listDevicesNeedingBatteryReplacement, listHubsWithStatus } from '@sense/database';

export default async function dashboardRoutes(fastify: FastifyInstance) {
    fastify.get('/summary', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        const { site_id, area_id } = request.query as { site_id?: string; area_id?: string };

        try {
            // Build WHERE clause
            const params: any[] = [clientId];
            let whereClause = `d.client_id = $1 AND d.disabled_at IS NULL`;
            let paramIdx = 2;

            if (site_id) {
                whereClause += ` AND d.site_id = $${paramIdx}`;
                params.push(site_id);
                paramIdx++;
            }

            if (area_id) {
                whereClause += ` AND d.area_id = $${paramIdx}`;
                params.push(area_id);
                paramIdx++;
            }

            // Parallelize all count queries for efficiencyulate all counts with offline precedence
            const sql = `
                SELECT
                    COUNT(*)::int as total_devices,
                    SUM(CASE WHEN effective_status = 'red' THEN 1 ELSE 0 END)::int as red,
                    SUM(CASE WHEN effective_status = 'amber' THEN 1 ELSE 0 END)::int as amber,
                    SUM(CASE WHEN effective_status = 'green' THEN 1 ELSE 0 END)::int as green,
                    SUM(CASE WHEN effective_status = 'offline' THEN 1 ELSE 0 END)::int as offline,
                    SUM(open_alerts_count)::int as open_alerts,
                    MAX(last_seen) as last_telemetry_at
                FROM (
                    SELECT
                        d.id,
                        t.occurred_at as last_seen,
                        a.open_alerts_count,
                        CASE
                            WHEN t.occurred_at < NOW() - INTERVAL '30 minutes' OR t.occurred_at IS NULL THEN 'offline'
                            WHEN s.status = 'red' THEN 'red'
                            WHEN s.status = 'amber' THEN 'amber'
                            ELSE 'green'
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
                    LEFT JOIN LATERAL (
                        SELECT COUNT(*)::int as open_alerts_count
                        FROM "alerts"
                        WHERE device_id = d.id 
                          AND status IN ('triggered', 'acknowledged', 'notified')
                          AND resolved_at IS NULL
                    ) a ON true
                    WHERE ${whereClause}
                ) as derived
            `;

            const rawResults = await prisma.$queryRawUnsafe<any[]>(sql, ...params);
            const row = rawResults[0];

            return {
                total_devices: row.total_devices || 0,
                red: row.red || 0,
                amber: row.amber || 0,
                green: row.green || 0,
                offline: row.offline || 0,
                open_alerts: row.open_alerts || 0,
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
        let whereClause = `d.client_id = $1 AND d.disabled_at IS NULL`;
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
                COALESCE(s.status::text, 'green') as status, 
                s.reason, 
                s.updated_at as status_updated_at,
                s.battery_percent, s.battery_raw, s.battery_updated_at,
                t.recent_telemetry,
                site.name as site_name,
                site.timezone as site_timezone,
                area.name as area_name,
                (CASE WHEN a.highest_severity IS NOT NULL THEN true ELSE false END) as has_alert
            FROM "devices" d
            LEFT JOIN "device_status" s ON d.id = s.device_id
            LEFT JOIN "sites" site ON d.site_id = site.id
            LEFT JOIN "areas" area ON d.area_id = area.id
            LEFT JOIN LATERAL (
                SELECT 
                    json_agg(
                        json_build_object(
                            'payload', payload,
                            'occurred_at', GREATEST(occurred_at, received_at)
                        )
                    ) as recent_telemetry
                FROM (
                    SELECT payload, occurred_at, received_at
                    FROM "telemetry_events"
                    WHERE device_id = d.id
                    ORDER BY GREATEST(occurred_at, received_at) DESC
                    LIMIT 50
                ) sub
            ) t ON true
            LEFT JOIN LATERAL (
                SELECT 
                    CASE 
                        WHEN COUNT(CASE WHEN severity = 'red' THEN 1 END) > 0 THEN 'red' 
                        WHEN COUNT(CASE WHEN severity = 'amber' THEN 1 END) > 0 THEN 'amber' 
                        ELSE NULL 
                    END as highest_severity
                FROM "alerts"
                WHERE device_id = d.id 
                  AND status IN ('triggered', 'acknowledged', 'notified')
                  AND resolved_at IS NULL
            ) a ON true
            WHERE ${whereClause}
            ORDER BY
                CASE COALESCE(s.status::text, 'green')
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
                let tempVal: number | null = null;
                let humVal: number | null = null;
                let batteryVal: number | null = null;
                let lastOccurredAt: string | null = null;
                let latestPayload: any = null;
                let availableMetrics: string[] = [];

                if (row.recent_telemetry) {
                    const telemetryArray = typeof row.recent_telemetry === 'string'
                        ? JSON.parse(row.recent_telemetry)
                        : row.recent_telemetry;

                    if (Array.isArray(telemetryArray) && telemetryArray.length > 0) {
                        lastOccurredAt = telemetryArray[0].occurred_at;
                        latestPayload = telemetryArray[0].payload;

                        for (const event of telemetryArray) {
                            const payload = event.payload;
                            if (!payload) continue;

                            const metricsArray = payload.metrics || payload.raw?.metrics;

                            if (Array.isArray(metricsArray)) {
                                if (tempVal === null) {
                                    const t = metricsArray.find((m: any) => m?.parameter === 'temperature');
                                    if (t && typeof t.value === 'number') tempVal = t.value;
                                }
                                if (humVal === null) {
                                    const h = metricsArray.find((m: any) => m?.parameter === 'humidity');
                                    if (h && typeof h.value === 'number') humVal = h.value;
                                }
                                if (batteryVal === null) {
                                    const b = metricsArray.find((m: any) => m?.parameter === 'battery');
                                    if (b && typeof b.value === 'number') batteryVal = b.value;
                                }
                            }

                            // Fallbacks
                            if (tempVal === null && typeof payload.temperature === 'number') tempVal = payload.temperature;
                            if (humVal === null && typeof payload.humidity === 'number') humVal = payload.humidity;
                            if (batteryVal === null && typeof payload.battery === 'number') batteryVal = payload.battery;
                            if (batteryVal === null && typeof payload.raw?.data?.payload?.battery === 'number') batteryVal = payload.raw.data.payload.battery;
                            if (batteryVal === null && typeof payload.raw?.payload?.battery === 'number') batteryVal = payload.raw.payload.battery;

                            if (tempVal !== null && humVal !== null && batteryVal !== null) {
                                // Keep going to extract all available metrics?
                                // Actually we still need to collect unique metrics
                            }
                        }

                        // Second pass or integrated pass to collect all available metrics
                        const metricSet = new Set<string>();
                        for (const event of telemetryArray) {
                            const payload = event.payload;
                            if (!payload) continue;
                            const metricsArray = payload.metrics || payload.raw?.metrics;
                            if (Array.isArray(metricsArray)) {
                                for (const m of metricsArray) {
                                    if (m?.parameter && !m.parameter.includes('battery')) {
                                        metricSet.add(m.parameter);
                                    }
                                }
                            }
                            // Fallbacks
                            if (typeof payload.temperature === 'number') metricSet.add('temperature');
                            if (typeof payload.humidity === 'number') metricSet.add('humidity');
                        }

                        const allMetrics = Array.from(metricSet);
                        const hasTemp = allMetrics.includes('temperature');
                        const otherMetrics = allMetrics.filter(m => m !== 'temperature').sort();
                        availableMetrics = hasTemp ? ['temperature', ...otherMetrics] : otherMetrics;
                    }
                }

                const isOffline =
                    !lastOccurredAt ||
                    new Date(lastOccurredAt).getTime() <
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

                    site: row.site_name ? { name: row.site_name, timezone: row.site_timezone || null } : null,
                    area: row.area_name ? { name: row.area_name } : null,
                    has_alert: Boolean(row.has_alert),

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

                    latest_telemetry: latestPayload && lastOccurredAt ? {
                        occurred_at: lastOccurredAt,
                        payload: latestPayload
                    } : null,

                    metrics: {
                        temperature: tempVal,
                        humidity: humVal,
                        battery_percent: batteryVal ?? (row.battery_percent != null ? Number(row.battery_percent) : null),
                        battery_raw: row.battery_raw != null ? Number(row.battery_raw) : null,
                        battery_updated_at: row.battery_updated_at ?? null,
                    },

                    available_metrics: availableMetrics
                };
            });


            return reply.send({ data: results });
        } catch (error) {
            request.log.error(error, 'Error fetching dashboard devices');
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    fastify.get('/battery-attention', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        try {
            const devices = await listDevicesNeedingBatteryReplacement(clientId);
            return reply.send({ data: devices });
        } catch (error) {
            request.log.error(error, 'Error fetching battery attention devices');
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    fastify.get('/hub-status', { preHandler: [fastify.requireClientId] }, async (request, reply) => {
        const clientId = request.clientId as string;
        try {
            const hubs = await listHubsWithStatus(clientId);
            return reply.send({ data: hubs });
        } catch (error) {
            request.log.error(error, 'Error fetching hub status');
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
