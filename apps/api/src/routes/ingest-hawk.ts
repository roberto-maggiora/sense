import { FastifyInstance } from 'fastify';
import { prisma, updateHubHeartbeat, recordHubHeartbeat, recordIngestEvent, cleanupIngestEventsRetention } from '@sense/database';
import { TelemetryEventV1, TELEMETRY_V1_SCHEMA_VERSION, MetricV1 } from '@sense/contracts';
import { enqueueTelemetry } from '../queue/telemetry';

type HawkTopic = 'sensors' | 'heartbeat';

export default async function ingestHawkRoutes(fastify: FastifyInstance) {
    // quick ping (optional)
    fastify.get('/ingest/hawk', async (_req, reply) => reply.code(200).send({ ok: true }));

    fastify.post('/ingest/hawk/heartbeat', async (request, reply) => {
        const apiKeyHeader = request.headers['x-ingest-key'];
        const apiKeyQuery = (request.query as any)?.key;
        const apiKey = apiKeyHeader || apiKeyQuery;

        if (apiKey !== process.env.INGEST_SHARED_KEY) {
            void recordIngestEvent({
                source: 'hawk',
                topic: 'heartbeat',
                status: 'unauthorized',
                http_status: 401,
            }).catch((err: any) => request.log.warn({ err }, 'ingest_event_write_failed'));
            reply.code(401).send({ error: 'Unauthorized' });
            return;
        }

        const body = request.body as any;
        if (!body || !body.serial) {
            void recordIngestEvent({
                source: 'hawk',
                topic: 'heartbeat',
                status: 'rejected',
                http_status: 400,
                error_message: 'Missing serial in heartbeat',
            }).catch((err: any) => request.log.warn({ err }, 'ingest_event_write_failed'));
            reply.code(400).send({ error: 'Missing serial in heartbeat' });
            return;
        }

        try {
            const updated = await recordHubHeartbeat(body.serial, body.fw, body.timestamp);
            void recordIngestEvent({
                source: 'hawk',
                topic: 'heartbeat',
                status: 'accepted',
                http_status: 200,
                serial: body.serial,
            }).catch((err: any) => request.log.warn({ err }, 'ingest_event_write_failed'));

            if (Math.random() < 0.01) {
                void cleanupIngestEventsRetention({ source: 'hawk', topic: 'heartbeat', keep: 500 })
                    .catch((err: any) => request.log.warn({ err }, 'cleanup_ingest_events_failed'));
            }

            reply.code(200).send({ updated });
        } catch (error) {
            request.log.error(error, 'Error recording hub heartbeat');
            void recordIngestEvent({
                source: 'hawk',
                topic: 'heartbeat',
                status: 'error',
                http_status: 500,
                serial: body.serial,
                error_message: error instanceof Error ? error.message : String(error),
            }).catch((err: any) => request.log.warn({ err }, 'ingest_event_write_failed'));
            reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    fastify.post('/ingest/hawk', async (request, reply) => {
        // 1) auth
        const apiKeyHeader = request.headers['x-ingest-key'];
        const apiKeyQuery = (request.query as any)?.key;
        const apiKey = apiKeyHeader || apiKeyQuery;

        if (apiKey !== process.env.INGEST_SHARED_KEY) {
            void recordIngestEvent({
                source: 'hawk',
                topic: 'sensors',
                status: 'unauthorized',
                http_status: 401,
            }).catch((err: any) => request.log.warn({ err }, 'ingest_event_write_failed'));
            reply.code(401).send({ error: 'Unauthorized' });
            return;
        }

        const body = request.body as any;
        if (!body) {
            void recordIngestEvent({
                source: 'hawk',
                topic: 'sensors',
                status: 'rejected',
                http_status: 400,
                error_message: 'Missing body',
            }).catch((err: any) => request.log.warn({ err }, 'ingest_event_write_failed'));
            reply.code(400).send({ error: 'Missing body' });
            return;
        }

        // 2) normalize into one-or-more {topic, payload, clientId?}
        const frames = normalizeHawkFrames(body);

        if (frames.length === 0) {
            void recordIngestEvent({
                source: 'hawk',
                topic: 'sensors',
                status: 'rejected',
                http_status: 400,
                error_message: 'Missing topic/payload',
            }).catch((err: any) => request.log.warn({ err }, 'ingest_event_write_failed'));
            reply.code(400).send({ error: 'Missing topic/payload' });
            return;
        }

        // 3) process frames
        let enqueued = 0;
        let heartbeats = 0;

        for (const frame of frames) {
            const topic = frame.topic;

            if (topic === 'heartbeat') {
                heartbeats++;
                request.log.info({ topic, payload: frame.payload }, 'HAWK HEARTBEAT');

                const serial = frame.payload?.serial;
                if (serial) {
                    const clientId = frame.clientId;
                    if (clientId) {
                        const occurredAt = hawkTimestampToIso(frame.payload?.timestamp) ?? new Date().toISOString();
                        await updateHubHeartbeat(clientId, serial, occurredAt).catch((err: any) => {
                            request.log.error({ err, serial, clientId }, 'Failed to update hub heartbeat');
                        });
                    } else {
                        request.log.warn({ serial }, 'HAWK HEARTBEAT missing clientId scoped to hub');
                    }
                }

                continue;
            }

            if (topic !== 'sensors') {
                request.log.warn({ topic }, 'HAWK unknown topic (ignored)');
                continue;
            }

            const payload = frame.payload;
            const hubSerial = payload?.serial ?? 'unknown';

            const sensors: any[] = Array.isArray(payload?.sensors) ? payload.sensors : [];
            if (sensors.length === 0) {
                request.log.warn({ topic, hubSerial, payload }, 'HAWK sensors payload missing sensors[]');
                continue;
            }

            const sensorsReceivedCount = sensors.length;
            let sensorsEnqueuedCount = 0;
            const sensorsMissingDevices: string[] = [];

            // one event per sensor entry (with index to avoid idempotency collision
            // when the same sensor ID appears multiple times in one batch)
            for (let idx = 0; idx < sensors.length; idx++) {
                const s = sensors[idx];
                const sensorId = asString(s?.id);
                if (!sensorId) {
                    request.log.warn({ topic, hubSerial, sensor: s }, 'HAWK sensor missing id');
                    continue;
                }

                // Resolve device scoped to client if the request carries a client header,
                // otherwise find any matching device (single-tenant deployments).
                // The ingest key authenticates the bridge, not a specific client.
                const clientId: string | undefined = frame.clientId ?? undefined;

                const device = await prisma.device.findFirst({
                    where: {
                        source: 'hawk',
                        external_id: sensorId,
                        ...(clientId ? { client_id: clientId } : {}),
                    },
                    include: { client: true },
                });

                if (!device) {
                    request.log.warn(
                        { event: 'ingest_device_not_found', source: 'hawk', external_id: sensorId, hubSerial },
                        'HAWK device not found for sensor — skipping'
                    );
                    if (!sensorsMissingDevices.includes(sensorId)) {
                        sensorsMissingDevices.push(sensorId);
                    }
                    continue;
                }

                const occurredAt = hawkTimestampToIso(s?.timestamp) ?? new Date().toISOString();
                const receivedAt = new Date().toISOString();
                const metrics = extractHawkMetrics(s);

                // Include array index in key so duplicate sensor IDs in same batch
                // (same sensor reporting multiple readings) each get a unique job
                const idempotencyKey = buildHawkIdempotencyKey(sensorId, s?.timestamp, idx);

                const event: TelemetryEventV1 = {
                    schema_version: TELEMETRY_V1_SCHEMA_VERSION,
                    source: 'hawk',
                    tenant: { client_id: device.client_id },
                    device: {
                        id: device.id,
                        external_id: device.external_id,
                        display_name: device.name,
                    },
                    occurred_at: occurredAt,
                    received_at: receivedAt,
                    idempotency_key: idempotencyKey,
                    metrics,
                    raw: {
                        topic,
                        hub_serial: hubSerial,
                        sensor: s,
                        payload,
                    },
                };

                await enqueueTelemetry(event);
                enqueued++;
                sensorsEnqueuedCount++;
            }

            // Structured per-frame summary log
            request.log.info({
                event: 'hawk_sensors_processed',
                hub_serial: hubSerial,
                sensors_received_count: sensorsReceivedCount,
                sensors_enqueued_count: sensorsEnqueuedCount,
                sensors_missing_devices: sensorsMissingDevices.slice(0, 10), // Truncate to first 10 for log size
            }, 'HAWK sensors frame processed');

            // Record ONE observability event per frame representing summary state
            request.log.info('DEBUG: Calling recordIngestEvent for sensors');
            void recordIngestEvent({
                source: 'hawk',
                topic: 'sensors',
                status: 'accepted',
                http_status: 202,
                serial: hubSerial,
                client_id: frame.clientId ?? undefined,
                meta_json: {
                    sensors_received_count: sensorsReceivedCount,
                    sensors_enqueued_count: sensorsEnqueuedCount,
                    sensors_missing_devices_count: sensorsMissingDevices.length,
                    sensors_missing_devices: sensorsMissingDevices.slice(0, 10), // truncate lists to max 10
                }
            }).catch((err: any) => request.log.warn({ err }, 'ingest_event_write_failed'));
        }

        if (Math.random() < 0.01) {
            void cleanupIngestEventsRetention({ source: 'hawk', topic: 'sensors', keep: 500 })
                .catch((err: any) => request.log.warn({ err }, 'cleanup_ingest_events_failed'));
        }

        // 4) respond
        reply.code(202).send({
            ok: true,
            frames: frames.length,
            enqueued,
            heartbeats,
        });
    });
}

/**
 * Accept:
 * A) Raw hub payload: { serial, sensors:[...] } or { serial, fw, timestamp } (heartbeat)
 * B) Bridge wrapper: { topic, payload } or { topic, payload, client_id }
 * C) EMQX export: { messages: [{ topic, payload, ...}, ...] }
 */
function normalizeHawkFrames(body: any): Array<{ topic: HawkTopic; payload: any; clientId?: string }> {
    // C) EMQX export
    if (Array.isArray(body?.messages)) {
        const frames = body.messages
            .map((m: any) => ({ topic: m?.topic, payload: m?.payload, clientId: m?.client_id }))
            .filter((x: any) => x.topic && x.payload)
            .map((x: any) => ({ topic: normalizeTopic(x.topic), payload: x.payload, clientId: x.clientId }))
            .filter((x: any) => x.topic);
        return frames as any;
    }

    // B) Bridge wrapper (optionally carrying client_id for multi-tenant bridges)
    if (body?.topic && body?.payload) {
        const t = normalizeTopic(body.topic);
        return t ? [{ topic: t, payload: body.payload, clientId: body.client_id ?? undefined }] : [];
    }

    // A) Raw hub payload (infer)
    if (Array.isArray(body?.sensors)) return [{ topic: 'sensors', payload: body }];
    if (body?.fw && body?.serial) return [{ topic: 'heartbeat', payload: body }];

    return [];
}

function normalizeTopic(topic: any): HawkTopic | null {
    const t = asString(topic);
    if (!t) return null;
    if (t === 'sensors' || t.startsWith('sensors/')) return 'sensors';
    if (t === 'heartbeat' || t.startsWith('heartbeat/')) return 'heartbeat';
    return null;
}

function asString(v: any): string | null {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

function hawkTimestampToIso(ts: any): string | null {
    const s = asString(ts);
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

/**
 * Build a unique idempotency key per sensor reading.
 * Include the array index so that when a hub sends the same sensor ID
 * multiple times in one batch (each reading at its own timestamp),
 * each entry gets a distinct key.
 */
function buildHawkIdempotencyKey(sensorId: string, sensorTs: any, idx: number): string {
    const ts = asString(sensorTs) ?? 'no-ts';
    return `hawk:${sensorId}:${ts}:${idx}`;
}

function extractHawkMetrics(sensor: any): MetricV1[] {
    const metrics: MetricV1[] = [];

    // temperature is string in payload
    const tempStr = asString(sensor?.temp);
    const temp = tempStr !== null ? Number(tempStr) : NaN;
    if (Number.isFinite(temp)) {
        metrics.push({
            parameter: 'temperature',
            value: temp,
            unit: 'celsius',
            status: 'ok',
            quality: 'measured',
        });
    }

    // battery is "28".."35" as string; map to %
    const batStr = asString(sensor?.battery);
    const bat = batStr !== null ? Number(batStr) : NaN;
    if (Number.isFinite(bat)) {
        const pct = hawkBatteryToPercent(bat);
        metrics.push({
            parameter: 'battery',
            value: pct,
            unit: 'percent',
            status: 'ok',
            quality: 'measured',
        });
    }

    return metrics;
}

function hawkBatteryToPercent(raw: number): number {
    const pct = 5 + (raw - 28) * (95 / 7);
    return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}