import { PrismaClient, DeviceStatusLevel } from '@sense/database';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding Dashboard Data...');
    const clientId = 'test-client';

    // Ensure client exists
    await prisma.client.upsert({
        where: { id: clientId },
        update: {},
        create: { id: clientId, name: 'Test Client' }
    });

    // 1. Red Device
    await createDeviceWithStatus(clientId, 'dev-red', 'Red Device', DeviceStatusLevel.red, 100);
    // 2. Amber Device
    await createDeviceWithStatus(clientId, 'dev-amber', 'Amber Device', DeviceStatusLevel.amber, 200);
    // 3. Green Device
    await createDeviceWithStatus(clientId, 'dev-green', 'Green Device', DeviceStatusLevel.green, 300);
    // 4. Unknown/Grey Device (no status)
    await createDeviceWithStatus(clientId, 'dev-grey', 'Grey Device', null, 400);

    console.log('Seeding complete.');
}

async function createDeviceWithStatus(clientId: string, extId: string, name: string, status: DeviceStatusLevel | null, telemetryVal: number) {
    // Upsert Device
    const device = await prisma.device.upsert({
        where: { source_external_id: { source: 'dashboard-test', external_id: extId } },
        update: {},
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
    await prisma.telemetryEvent.create({
        data: {
            client_id: clientId,
            device_id: device.id,
            schema_version: 'v1',
            source: 'dashboard-test',
            occurred_at: new Date(),
            received_at: new Date(),
            idempotency_key: `seed:${device.id}:${Date.now()}`,
            payload: { value: telemetryVal }
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
