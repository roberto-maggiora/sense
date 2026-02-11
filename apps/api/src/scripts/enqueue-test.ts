import { enqueueTelemetry, telemetryQueue } from '../queue/telemetry';
import { TELEMETRY_V1_SCHEMA_VERSION, TelemetryEventV1 } from '@sense/contracts';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@sense/database';

const prisma = new PrismaClient();

async function main() {
    // 1. Find a valid client and device to reference
    const client = await prisma.client.findFirst({ include: { devices: true } });
    if (!client || client.devices.length === 0) {
        console.error('No client/device found to test with. Run db:seed first.');
        process.exit(1);
    }
    const device = client.devices[0];

    console.log(`Using Client: ${client.id}`);
    console.log(`Using Device: ${device.id}`);

    // 2. Construct Event
    const event: TelemetryEventV1 = {
        schema_version: TELEMETRY_V1_SCHEMA_VERSION,
        source: 'milesight',
        tenant: {
            client_id: client.id
        },
        device: {
            id: device.id,
            external_id: device.external_id,
            display_name: device.name
        },
        occurred_at: new Date().toISOString(),
        received_at: new Date().toISOString(),
        idempotency_key: uuidv4(), // Random key for unique test each run, or fix it to test dedupe
        metrics: [
            { parameter: 'temperature', value: 22.5, unit: 'celsius', status: 'ok', quality: 'measured' }
        ],
        raw: { foo: 'bar' }
    };

    if (process.argv.includes('--fixed-key')) {
        event.idempotency_key = 'fixed-test-key-123';
        console.log('Using FIXED idempotency key for dedupe testing');
    }

    // 3. Enqueue
    console.log(`Enqueueing event: ${event.idempotency_key}`);

    // Hack for testing: if --force-job-id is passed, use it. Otherwise use idempotency_key (default logic)
    const forceJobIdIdx = process.argv.indexOf('--force-job-id');
    const customJobId = forceJobIdIdx !== -1 ? process.argv[forceJobIdIdx + 1] : undefined;

    const job = await telemetryQueue.add('telemetry-event', event, {
        jobId: customJobId || event.idempotency_key
    });
    console.log(`Job enqueued with ID: ${job.id}`);

    // 4. Force exit (BullMQ keeps connection open)
    setTimeout(() => {
        process.exit(0);
    }, 1000);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
