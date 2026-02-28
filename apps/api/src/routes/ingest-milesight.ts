import { FastifyInstance } from "fastify";
import { prisma } from "@sense/database";
import {
    MetricV1,
    TELEMETRY_V1_SCHEMA_VERSION,
    TelemetryEventV1,
} from "@sense/contracts";
import { enqueueTelemetry } from "../queue/telemetry";
import * as crypto from "crypto";

type MilesightWebhookItem = {
    eventId?: string;
    eventType?: string; // e.g. DEVICE_DATA, WEBHOOK_TEST
    eventVersion?: string;
    eventCreatedTime?: number; // seconds
    data?: {
        ts?: number; // ms
        type?: string; // PROPERTY
        payload?: Record<string, any>;
        deviceProfile?: {
            devEUI?: string;
            deviceEUI?: string;
            devEui?: string;
            sn?: string;
            name?: string;
            model?: string;
            deviceId?: number | string;
        };
    };
};

export default async function ingestMilesightRoutes(fastify: FastifyInstance) {
    // Optional ping endpoint (useful for quick checks)
    fastify.get("/ingest/milesight", async (request, reply) => {
        return reply.code(200).send({ ok: true });
    });

    fastify.post("/ingest/milesight", async (request, reply) => {

        const body = request.body as any;

        const payloadStr = body ? JSON.stringify(body) : "";
        const payloadHash = crypto.createHash("sha256").update(payloadStr).digest("hex");

        // 1) Auth: header OR querystring (?key=...)
        const apiKeyHeader = request.headers["x-ingest-key"];
        const apiKeyQuery = (request.query as any)?.key;
        const apiKey = (apiKeyHeader as string | undefined) || (apiKeyQuery as string | undefined);

        if (apiKey !== process.env.INGEST_SHARED_KEY) {
            request.log.warn(
                { event: "ingest_auth_fail", payload_hash: payloadHash },
                "Invalid ingestion key"
            );
            return reply.code(401).send({ error: "Unauthorized" });
        }

        if (!body) {
            return reply.code(400).send({ error: "Missing body" });
        }

        // 2) Normalize to an array of webhook items
        const items: MilesightWebhookItem[] = Array.isArray(body) ? body : [body];

        // 3) WEBHOOK_TEST: accept & short-circuit (Milesight "Test callback URI")
        // Milesight often sends an array with a single object containing eventType=WEBHOOK_TEST
        if (items.some((it) => it?.eventType === "WEBHOOK_TEST")) {
            request.log.info(
                { event: "ingest_webhook_test", payload_hash: payloadHash },
                "Milesight webhook test received"
            );
            return reply.code(202).send({ ok: true, test: true });
        }

        // 4) Process DEVICE_DATA items (can be multiple per webhook call)
        let accepted = 0;
        let ignored = 0;

        for (const item of items) {
            try {
                if (item?.eventType !== "DEVICE_DATA") {
                    ignored++;
                    continue;
                }

                const externalId = extractDeviceExternalId(item);
                if (!externalId) {
                    request.log.warn(
                        { event: "ingest_bad_payload", payload_hash: payloadHash, item },
                        "Unable to resolve device external id from Milesight payload"
                    );
                    ignored++;
                    continue;
                }

                const device = await prisma.device.findFirst({
                    where: { source: "milesight", external_id: externalId },
                    include: { client: true },
                });

                if (!device) {
                    request.log.warn(
                        {
                            event: "ingest_device_not_found",
                            source: "milesight",
                            external_id: externalId,
                            payload_hash: payloadHash,
                        },
                        "Device not found"
                    );
                    // IMPORTANT: do NOT fail the whole batch if one device is missing
                    ignored++;
                    continue;
                }

                const metrics = extractMetrics(item);
                if (metrics.length === 0) {
                    request.log.warn(
                        { event: "ingest_metrics_empty", external_id: externalId },
                        "No metrics extracted"
                    );
                }

                const receivedAt = new Date().toISOString();
                const occurredAt = resolveOccurredAt(item, receivedAt);

                const providerMsgId =
                    (item as any)?.data?.payload?.messageId ||
                    (item as any)?.data?.payload?.msgId ||
                    (item as any)?.data?.payload?.id ||
                    item.eventId;

                const idempotencyKey = buildIdempotencyKey(externalId, occurredAt, item, providerMsgId);

                const event: TelemetryEventV1 = {
                    schema_version: TELEMETRY_V1_SCHEMA_VERSION,
                    source: "milesight",
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
                    raw: item as any,
                };

                await enqueueTelemetry(event);

                accepted++;
            } catch (error) {
                request.log.error(
                    {
                        event: "ingest_error",
                        source: "milesight",
                        payload_hash: payloadHash,
                        error,
                    },
                    "Unexpected ingestion error (item)"
                );
                // keep going for the remaining items
                ignored++;
            }
        }

        request.log.info(
            { event: "ingest_batch_complete", accepted, ignored, payload_hash: payloadHash },
            "Milesight ingest batch complete"
        );

        return reply.code(202).send({ ok: true, accepted, ignored });
    });
}

function extractDeviceExternalId(item: MilesightWebhookItem): string | null {
    // Milesight webhook (deviceProfile.devEUI is the real identifier)
    const devEUI =
        item?.data?.deviceProfile?.devEUI ??
        item?.data?.deviceProfile?.deviceEUI ??
        item?.data?.deviceProfile?.devEui;

    if (typeof devEUI === "string" && devEUI) return devEUI;

    // Optional fallback (ONLY keep if you actually store SN as external_id in DB)
    const sn = item?.data?.deviceProfile?.sn;
    if (typeof sn === "string" && sn) return sn;

    return null;
}

function extractMetrics(item: MilesightWebhookItem): MetricV1[] {
    const metrics: MetricV1[] = [];

    const payload = item?.data?.payload ?? {};

    const temp =
        typeof payload.temperature === "number"
            ? payload.temperature
            : typeof payload.temp === "number"
                ? payload.temp
                : undefined;

    if (temp !== undefined) {
        metrics.push({
            parameter: "temperature",
            value: temp,
            unit: "celsius",
            status: "ok",
            quality: "measured",
        });
    }

    const hum =
        typeof payload.humidity === "number"
            ? payload.humidity
            : typeof payload.rh === "number"
                ? payload.rh
                : undefined;

    if (hum !== undefined) {
        metrics.push({
            parameter: "humidity",
            value: hum,
            unit: "percent",
            status: "ok",
            quality: "measured",
        });
    }

    return metrics;
}

function resolveOccurredAt(item: MilesightWebhookItem, fallbackIso: string): string {
    // Prefer the device timestamp if available (ms)
    const tsMs = item?.data?.ts;
    if (typeof tsMs === "number" && tsMs > 0) {
        return new Date(tsMs).toISOString();
    }

    // Else eventCreatedTime is usually seconds
    const tsSec = item?.eventCreatedTime;
    if (typeof tsSec === "number" && tsSec > 0) {
        return new Date(tsSec * 1000).toISOString();
    }

    return fallbackIso;
}

function buildIdempotencyKey(
    externalId: string,
    occurredAtIso: string,
    item: MilesightWebhookItem,
    providerMsgId?: string
): string {
    if (providerMsgId) {
        return `milesight:${externalId}:${providerMsgId}`;
    }

    const rawString = `${externalId}|${occurredAtIso}|${JSON.stringify(item)}`;
    const hash = crypto.createHash("sha256").update(rawString).digest("hex");
    return `milesight:${externalId}:${hash}`;
}