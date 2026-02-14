import { PrismaClient } from '@sense/database';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding Dashboard Data...');
    const clientId = 'test-client';

    // CLEANUP: specific order to avoid FK errors
    await prisma.deviceStatus.deleteMany({ where: { client_id: clientId } });
    await prisma.telemetryEvent.deleteMany({ where: { client_id: clientId } });
    await prisma.alertRule.deleteMany({ where: { client_id: clientId } });
    await prisma.device.deleteMany({ where: { client_id: clientId } });

    // Reuse client
    await prisma.client.upsert({
        where: { id: clientId },
        update: {},
        create: { id: clientId, name: 'Test Client' }
    });

    // 1. Red Device
    await createDeviceWithStatus(clientId, 'dev-red', 'Red Device', 'red', 100);
    // 2. Amber Device
    await createDeviceWithStatus(clientId, 'dev-amber', 'Amber Device', 'amber', 200);
    // 3. Green Device
    await createDeviceWithStatus(clientId, 'dev-green', 'Green Device', 'green', 300);
    // 4. Offline Device (Green status, but no data for 1 hour)
    await createDeviceWithStatus(clientId, 'dev-offline', 'Offline Device', 'green', 400, new Date(Date.now() - 60 * 60 * 1000));
    // 5. Unknown/Grey Device (no status)
    await createDeviceWithStatus(clientId, 'dev-grey', 'Grey Device', null, 500);

    console.log('Seeding complete.');
}

async function createDeviceWithStatus(clientId: string, extId: string, name: string, status: any | null, telemetryVal: number, telemetryTime: Date = new Date()) {
    // Upsert Device
    const device = await prisma.device.upsert({
        where: { source_external_id: { source: 'dashboard-test', external_id: extId } },
        update: { disabled_at: null }, // Ensure enabled
        create: {
            client_id: clientId,
            source: 'dashboard-test',
            external_id: extId,
            name: name
        }
    });

    // Set Status
    if (status) {
        await prisma.deviceStatus.upsert({
            where: { device_id: device.id },
            update: { status: status, updated_at: new Date() },
            create: {
                client_id: clientId,
                device_id: device.id,
                status: status
            }
        });
    } else {
        await prisma.deviceStatus.deleteMany({ where: { device_id: device.id } });
    }

    // Add Telemetry (Latest)
    // First clean up old telemetry for this device to ensure "latest" is what we set
    await prisma.telemetryEvent.deleteMany({ where: { device_id: device.id } });

    await prisma.telemetryEvent.create({
        data: {
            client_id: clientId,
            device_id: device.id,
            schema_version: 'v1',
            source: 'dashboard-test',
            occurred_at: telemetryTime,
            received_at: new Date(),
            idempotency_key: `seed:${device.id}:${Date.now()}`,
            payload: { temperature: telemetryVal, humidity: 50, value: telemetryVal }
        }
    });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
