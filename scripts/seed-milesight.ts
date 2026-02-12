
import { prisma } from '@sense/database';

async function main() {
    const client = await prisma.client.upsert({
        where: { id: 'test-client' },
        update: {},
        create: {
            id: 'test-client',
            name: 'Test Client'
        }
    });

    const device = await prisma.device.upsert({
        where: {
            source_external_id: {
                source: 'milesight',
                external_id: '24E124126B316D59'
            }
        },
        update: {},
        create: {
            client_id: client.id,
            source: 'milesight',
            external_id: '24E124126B316D59',
            name: 'Test Milesight Device'
        }
    });

    console.log('Seeded/Verified device:', device);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
