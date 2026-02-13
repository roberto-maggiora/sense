import { PrismaClient, ScopeType, Operator } from '@sense/database';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding Rule for Status Engine Test...');

    const client = await prisma.client.findUnique({ where: { id: 'test-client' } });
    const device = await prisma.device.findFirst({ where: { external_id: '24E124126B316D59' } });

    if (!client || !device) {
        console.error('Client or Device not found. Run seed-milesight.ts first.');
        return;
    }

    // Delete existing rules for cleanliness
    await prisma.alertRule.deleteMany({
        where: { scope_type: ScopeType.device, scope_id: device.id }
    });

    // Clean up previous telemetry to avoid "future" points messing up validatio
    await prisma.telemetryEvent.deleteMany({
        where: { device_id: device.id }
    });

    // Reset status
    await prisma.deviceStatus.deleteMany({
        where: { device_id: device.id }
    });

    // Upsert Rule: Temp > 5, Duration 2400s (40m)
    const rule = await prisma.alertRule.create({
        data: {
            client_id: client.id,
            scope_type: ScopeType.device,
            scope_id: device.id,
            parameter: 'temperature',
            operator: Operator.gt,
            threshold: 5,
            breach_duration_seconds: 2400, // 40 mins
            expected_sample_seconds: 300,
            max_gap_seconds: 900
        }
    });

    console.log('Rule created:', rule.id);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
