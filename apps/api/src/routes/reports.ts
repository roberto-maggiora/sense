import { FastifyInstance } from "fastify";
import { prisma } from "@sense/database";
import {
    computeStats,
    extractThresholds,
    generatePdf,
    segmentBreaches,
    ReportData
} from "../services/reportService";

export default async function reportsRoutes(fastify: FastifyInstance) {
    fastify.get<{
        Params: { deviceId: string; metric: string };
        Querystring: { from: string; to: string };
    }>(
        "/device/:deviceId/metric/:metric/temperature-compliance",
        { preHandler: [fastify.requireClientId] },
        async (request, reply) => {
            const { deviceId, metric } = request.params;
            const { from, to } = request.query;
            const clientId = (request as any).clientId;

            // Verify device and get context
            const device = await prisma.device.findUnique({
                where: { id: deviceId, client_id: clientId },
                include: {
                    client: true,
                    site: true,
                    area: true,
                },
            });

            if (!device) {
                return reply.code(404).send({ error: "Device not found" });
            }

            const fromDate = new Date(from);
            const toDate = new Date(to);

            if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
                return reply.code(400).send({ error: "Invalid from or to date" });
            }

            // Move toDate to the very end of the day if it was just a raw date string
            if (to.length === 10) {
                toDate.setHours(23, 59, 59, 999);
            }

            // Fetch rules for this metric
            const activeRules = await prisma.deviceAlarmRule.findMany({
                where: {
                    device_id: deviceId,
                    client_id: clientId,
                    metric: metric,
                    enabled: true,
                },
            });

            const { allowedMin, allowedMax } = extractThresholds(activeRules);

            // Fetch telemetry efficiently
            const telemetries = await prisma.telemetryEvent.findMany({
                where: {
                    device_id: deviceId,
                    occurred_at: {
                        gte: fromDate,
                        lte: toDate,
                    },
                },
                select: {
                    occurred_at: true,
                    payload: true,
                },
                orderBy: {
                    occurred_at: "asc",
                },
            });

            // Map strictly to points that have this metric
            const points: { occurred_at: Date; value: number }[] = [];
            for (const t of telemetries) {
                const payload = t.payload as any;
                if (payload && Array.isArray(payload.metrics)) {
                    for (const m of payload.metrics) {
                        if (m.parameter === metric && typeof m.value === "number") {
                            points.push({ occurred_at: new Date(t.occurred_at), value: m.value });
                            break;
                        }
                    }
                } else if (payload && typeof payload[metric] === 'number') {
                    // fallback for simple payload structure
                    points.push({ occurred_at: new Date(t.occurred_at), value: payload[metric] });
                } else if (payload && payload.raw?.data?.payload?.[metric] !== undefined) {
                    // Milesight fallback
                    points.push({ occurred_at: new Date(t.occurred_at), value: payload.raw.data.payload[metric] });
                }
            }

            // Process segments (assume 10m gap is enough to segment distinct breach events)
            const breaches = segmentBreaches(points, allowedMin, allowedMax, 10);

            // Compute stats
            const stats = computeStats(points, breaches, fromDate, toDate);

            // Friendly label mapping
            const labelMap: Record<string, string> = {
                temperature: "Temperature (°C)",
                humidity: "Humidity (%)",
                co2: "CO2 (ppm)", // Fallback from CO₂ because PDFKit Helvetica lacks glyph
                barometric_pressure: "Pressure (hPa)",
                pir_status: "Motion Status",
                pir_count: "Motion Count",
            };
            const metricLabel = labelMap[metric] || metric;

            const reportData: ReportData = {
                clientName: device.client?.name || "Unknown",
                siteName: device.site?.name || "",
                areaName: device.area?.name || "",
                deviceName: device.name,
                metric,
                metricLabel,
                timezone: device.site?.timezone || undefined,
                fromDate,
                toDate,
                generatedAt: new Date(),
                stats,
                breaches,
                activeRules,
                points,
            };

            reply.header("Content-Type", "application/pdf");
            reply.header("Content-Disposition", `attachment; filename="report_${deviceId}_${metric}.pdf"`);

            // generate PDF and return as stream
            const doc = generatePdf(reportData);
            reply.send(doc);
            doc.end();
            return reply;
        }
    );
}
