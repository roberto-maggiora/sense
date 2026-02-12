import { FastifyInstance } from 'fastify';
import { prisma } from '@sense/database';
import { TelemetryEventV1, TELEMETRY_V1_SCHEMA_VERSION, MetricV1 } from '@sense/contracts';
import { enqueueTelemetry } from '../queue/telemetry';
import * as crypto from 'crypto';

export default async function ingestMilesightRoutes(fastify: FastifyInstance) {
    fastify.post('/ingest/milesight', async (request, reply) => {
        // 1. Security check
        const apiKey = request.headers['x-ingest-key'];
        if (apiKey !== process.env.INGEST_SHARED_KEY) {
            reply.code(401).send({ error: 'Unauthorized' });
            return;
        }

        const body = request.body as any;
        if (!body) {
            reply.code(400).send({ error: 'Missing body' });
            return;
        }

        // 2 & 3. Extract Device External ID
        const externalId = extractDeviceExternalId(body);
        if (!externalId) {
            reply.code(400).send({ error: 'Unable to resolve device external id from payload' });
            return;
        }

        // 4. Resolve Device via DB
        // enforcing tenant scoping by using device.client_id found in DB
        const device = await prisma.device.findUnique({
            where: {
                source_external_id: {
                    source: 'milesight',
                    external_id: externalId
                }
            },
            include: {
                client: true // To get client_id if needed, though it's on device too
            }
        });

        if (!device) {
            reply.code(404).send({ error: 'Device not found' });
            return;
        }

        // 5. Map Payload to TelemetryEventV1
        const metrics = extractMetrics(body);
        const receivedAt = new Date().toISOString();
        const occurredAt = body.time || body.timestamp || receivedAt;

        // Idempotency key logic
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
        const jobId = await enqueueTelemetry(event);

        // 7. Return 202
        reply.code(202).send({ ok: true, jobId, deviceId: device.id });
    });
}

function extractDeviceExternalId(body: any): string | null {
    // try these paths in order
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
            // Sometimes it's nested like params
            if (val === undefined && body.params) {
                val = body.params[key];
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
