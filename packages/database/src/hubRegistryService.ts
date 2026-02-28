import { prisma } from './index';

export interface HubStatus {
    id: string;
    serial: string;
    friendly_name: string | null;
    last_heartbeat_at: string | null;
    status: 'online' | 'offline' | 'unknown';
    minutes_since_heartbeat: number | null;
}

/**
 * Registers or updates a hub's friendly name for a specific client.
 */
export async function registerHub(clientId: string, serial: string, friendlyName?: string) {
    return prisma.hubRegistry.upsert({
        where: {
            client_id_serial: {
                client_id: clientId,
                serial,
            },
        },
        create: {
            client_id: clientId,
            serial,
            friendly_name: friendlyName || null,
        },
        update: {
            ...(friendlyName !== undefined ? { friendly_name: friendlyName || null } : {}),
        },
    });
}

/**
 * Called when an independent heartbeat arrives from a Hub.
 * Uses updateMany to only update if the Hub is already registered.
 * Does not create unregistered Hubs.
 */
export async function recordHubHeartbeat(serial: string, fw?: string, timestamp?: string | number) {
    const normSerial = serial.trim().toUpperCase();
    const result = await prisma.hubRegistry.updateMany({
        where: { serial: normSerial },
        data: {
            last_heartbeat_at: timestamp ? new Date(Number(timestamp)) : new Date(),
            ...(fw ? { fw } : {})
        }
    });
    return result.count;
}

/**
 * Called by the ingestion pipeline to record a heartbeat.
 * Only updates if the Hub is already registered by the client.
 */
export async function updateHubHeartbeat(clientId: string, serial: string, occurredAt: string) {
    // We use updateMany to avoid throwing an error if the hub is not registered.
    const result = await prisma.hubRegistry.updateMany({
        where: {
            client_id: clientId,
            serial,
        },
        data: {
            last_heartbeat_at: new Date(occurredAt),
        },
    });

    return result.count > 0;
}

/**
 * Lists all registered hubs for a client, calculating their current status.
 */
export async function listHubsWithStatus(clientId: string): Promise<HubStatus[]> {
    const hubs = await prisma.hubRegistry.findMany({
        where: { client_id: clientId },
        orderBy: [
            { last_heartbeat_at: 'desc' },
            { created_at: 'desc' }
        ],
    });

    const now = Date.now();

    return hubs.map((hub: any) => {
        let status: 'online' | 'offline' | 'unknown' = 'unknown';
        let minutesSince = null;

        if (hub.last_heartbeat_at) {
            const hbTime = hub.last_heartbeat_at.getTime();
            const diffMs = now - hbTime;
            minutesSince = Math.round(diffMs / 60000);

            // Online if heartbeat within 2 minutes (120,000 ms)
            // Adding a small buffer (e.g. 2.5 mins total = 150000) avoids flickering 
            // if heartbeats are exactly 120s apart and network delays occur.
            if (diffMs <= 150000) {
                status = 'online';
            } else {
                status = 'offline';
            }
        }

        return {
            id: hub.id,
            serial: hub.serial,
            friendly_name: hub.friendly_name,
            last_heartbeat_at: hub.last_heartbeat_at?.toISOString() || null,
            status,
            minutes_since_heartbeat: minutesSince,
        };
    });
}

/**
 * Lists all registered hubs for a client (without manual status calc).
 */
export async function listHubs(clientId: string) {
    return prisma.hubRegistry.findMany({
        where: { client_id: clientId },
        orderBy: [
            { last_heartbeat_at: 'desc' },
            { created_at: 'desc' }
        ],
        select: {
            id: true,
            serial: true,
            friendly_name: true,
            fw: true,
            last_heartbeat_at: true,
            created_at: true,
            updated_at: true
        }
    });
}

/**
 * Updates a hub's friendly name for a specific client.
 */
export async function updateHubFriendlyName(clientId: string, hubId: string, friendlyName: string) {
    const result = await prisma.hubRegistry.updateMany({
        where: {
            id: hubId,
            client_id: clientId,
        },
        data: {
            friendly_name: friendlyName,
        },
    });

    if (result.count === 0) {
        throw new Error('Hub not found or unauthorized');
    }

    return prisma.hubRegistry.findUnique({
        where: { id: hubId }
    });
}

/**
 * Hard deletes a hub for a specific client.
 */
export async function unregisterHub(clientId: string, hubId: string) {
    const result = await prisma.hubRegistry.deleteMany({
        where: {
            id: hubId,
            client_id: clientId,
        }
    });

    return result.count > 0;
}
