import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';
import { TelemetryEventV1, TELEMETRY_V1_SCHEMA_VERSION, MetricV1 } from '@sense/contracts';
import { enqueueTelemetry } from '../queue/telemetry';
import * as crypto from 'crypto';
import { increment } from '../ingest/ingest-stats';

export default async function ingestMilesightRoutes(fastify: FastifyInstance) {
    fastify.post('/ingest/milesight', async (request, reply) => {
        increment('total_ingest_requests');

        const body = request.body as any;
        // Compute payload hash for logging (sha256 of stringified body)
        // Guard against null/undefined body for hash generation
        const payloadStr = body ? JSON.stringify(body) : '';
        const payloadHash = crypto.createHash('sha256').update(payloadStr).digest('hex');

        // 1. Security check
        const apiKey = request.headers['x-ingest-key'];
        if (apiKey !== process.env.INGEST_SHARED_KEY) {
            increment('total_ingest_auth_fail');
            request.log.warn({ event: 'ingest_auth_fail' }, 'Invalid ingestion key');
            reply.code(401).send({ error: 'Unauthorized' });
            return;
        }

        if (!body) {
            reply.code(400).send({ error: 'Missing body' });
            return;
        }

        // 2 & 3. Extract Device External ID
        // Mapping: Milesight external_id = deviceEUI
        const externalId = extractDeviceExternalId(body);
        if (!externalId) {
            reply.code(400).send({ error: 'Unable to resolve device external id from payload' });
            return;
        }

        // 4. Resolve Device via DB
        // Strict resolution: where source = "milesight" AND external_id = extracted_id
        try {
            // Using findFirst to be strictly compliant with the requirement, 
            // though findUnique is usually preferred for unique constraints.
            // A unique constraint exists on [source, external_id], so findFirst is effectively findUnique.
            const device = await prisma.device.findFirst({
                where: {
                    source: 'milesight',
                    external_id: externalId
                },
                include: {
                    client: true
                }
            });

            if (!device) {
                increment('total_ingest_device_not_found');
                request.log.warn({
                    event: 'ingest_device_not_found',
                    source: 'milesight',
                    external_id: externalId,
                    payload_hash: payloadHash
                }, 'Device not found');
                reply.code(404).send({ error: 'Device not found' });
                return;
            }

            // 5. Map Payload to TelemetryEventV1
            const metrics = extractMetrics(body);
            if (metrics.length === 0) {
                request.log.warn({
                    event: 'ingest_metrics_empty',
                    source: 'milesight',
                    external_id: externalId,
                    // We don't have idempotency_key yet, but requirement says include it. 
                    // We'll generate it first.
                }, 'No metrics extracted');
            }

            const receivedAt = new Date().toISOString();
            const occurredAt = body.time || body.timestamp || receivedAt;

            // Idempotency key logic
            // idempotency_key is for DB dedupe
            // 1. Try provider message ID
            const providerMsgId = body.messageId || body.id || body.eventId || body.msgId || body.msg_id;

            let idempotencyKey: string;
            if (providerMsgId) {
                idempotencyKey = `milesight:${device.external_id}:${providerMsgId}`;
            } else {
                // 2. Fallback to hash
                const rawString = `${device.external_id}|${occurredAt}|${JSON.stringify(body)}`;
                const hash = crypto.createHash('sha256').update(rawString).digest('hex');
                idempotencyKey = `milesight:${device.external_id}:${hash}`;
            }

            const event: TelemetryEventV1 = {
                schema_version: TELEMETRY_V1_SCHEMA_VERSION,
                source: 'milesight',
                tenant: {
                    client_id: device.client_id
                },
                device: {
                    id: device.id,
                    external_id: device.external_id,
                    display_name: device.name
                },
                occurred_at: occurredAt,
                received_at: receivedAt,
                idempotency_key: idempotencyKey,
                metrics: metrics,
                raw: body
            };

            // 6. Enqueue
            // BullMQ jobId is not used for dedupe, we let it be auto-generated or use deduplication logic on the worker side if needed.
            // But here we rely on DB uniqueness constraint on idempotency_key.
            const jobId = await enqueueTelemetry(event);
            increment('total_ingest_success');

            request.log.info({
                event: 'ingest_success',
                source: 'milesight',
                external_id: device.external_id,
                idempotency_key: idempotencyKey,
                jobId
            }, 'Ingestion successful');

            // 7. Return 202
            reply.code(202).send({ ok: true, jobId, deviceId: device.id });

        } catch (error) {
            request.log.error({
                event: 'ingest_error',
                source: 'milesight',
                external_id: externalId, // might be null if failed before, but here it is defined
                payload_hash: payloadHash,
                error
            }, 'Unexpected ingestion error');

            // Treat multiple matches or DB errors as 500
            reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}

function extractDeviceExternalId(body: any): string | null {
    // try these paths in order
    // Hawk hub external_id = hub serial (for future)
    if (body.deviceEUI) return body.deviceEUI;
    if (body.devEui) return body.devEui;
    if (body.dev_eui) return body.dev_eui;
    if (body.device?.id) return body.device.id;
    if (body.device?.devEui) return body.device.devEui;
    if (body.data?.devEui) return body.data.devEui;
    return null;
}

function extractMetrics(body: any): MetricV1[] {
    const metrics: MetricV1[] = [];

    // Helper to find value by multiple keys
    const findValue = (keys: string[]): number | undefined => {
        for (const key of keys) {
            let val = body[key];
            // Check params
            if (val === undefined && body.params) {
                val = body.params[key];
            }
            // Check data (Milesight often uses 'data')
            if (val === undefined && body.data) {
                val = body.data[key];
            }

            if (val !== undefined && typeof val === 'number') {
                return val;
            }
        }
        return undefined;
    };

    // Temperature
    const tempVal = findValue(['temperature', 'temp', 't']);
    if (tempVal !== undefined) {
        metrics.push({
            parameter: 'temperature',
            value: tempVal,
            unit: 'celsius', // Assumption for MVP
            status: 'ok',
            quality: 'measured'
        });
    }

    // Humidity
    const humVal = findValue(['humidity', 'hum', 'rh']);
    if (humVal !== undefined) {
        metrics.push({
            parameter: 'humidity',
            value: humVal,
            unit: 'percent',
            status: 'ok',
            quality: 'measured'
        });
    }

    return metrics;
}
