import { Prisma } from '@prisma/client';
import { prisma } from './index';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RecordIngestEventInput {
    source: string;
    topic: string;
    status: 'accepted' | 'rejected' | 'unauthorized' | 'device_not_found' | 'error';
    client_id?: string | null;
    serial?: string | null;
    device_external_id?: string | null;
    http_status?: number;
    error_message?: string;
    meta_json?: object;
}

export interface CleanupIngestEventsOptions {
    source: string;
    topic: string;
    keep: number;
}

// ─── Methods ─────────────────────────────────────────────────────────────────

/**
 * Record an observability event for ingestion outcomes.
 * This is designed to be fire-and-forget; call it with `.catch()` so failures
 * don't crash or reject valid ingest payloads.
 */
export async function recordIngestEvent(input: RecordIngestEventInput): Promise<void> {
    console.log('[DEBUG] recordIngestEvent called:', input);
    try {
        await prisma.ingestEvent.create({
            data: {
                source: input.source,
                topic: input.topic,
                status: input.status,
                client_id: input.client_id,
                serial: input.serial,
                device_external_id: input.device_external_id,
                http_status: input.http_status,
                error_message: input.error_message,
                meta_json: input.meta_json ? (input.meta_json as Prisma.InputJsonValue) : Prisma.DbNull,
            },
        });
        console.log('[DEBUG] recordIngestEvent SUCCESS');
    } catch (e) {
        console.error('[DEBUG] recordIngestEvent FAILED:', e);
        throw e;
    }
}

/**
 * Opportunistically clean up old ingest events, keeping only the most recent `keep` records
 * for a specific (source, topic) tuple. Fast operation.
 */
export async function cleanupIngestEventsRetention(opts: CleanupIngestEventsOptions): Promise<void> {
    // 1. Find the created_at of the Nth newest event
    // Using a raw query or findMany with skip/take to get the boundary record
    const boundaryRecords = await prisma.ingestEvent.findMany({
        where: {
            source: opts.source,
            topic: opts.topic,
        },
        orderBy: {
            created_at: 'desc',
        },
        skip: opts.keep,
        take: 1,
        select: {
            created_at: true,
        },
    });

    if (boundaryRecords.length === 0) {
        // Less than `keep` records exist, nothing to delete
        return;
    }

    const boundaryTime = boundaryRecords[0].created_at;

    // 2. Delete everything older than or equal to the boundary time
    // Note: If multiple records have the exact same ms timestamp as the boundary,
    // they might also get deleted, which is fine for rough retention limit.
    await prisma.ingestEvent.deleteMany({
        where: {
            source: opts.source,
            topic: opts.topic,
            created_at: {
                lte: boundaryTime,
            },
        },
    });
}
