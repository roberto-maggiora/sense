import { PrismaClient } from '@prisma/client';
import { normalizeEmail, hashPassword } from './_lib/auth';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding Auth Data...');

    // 1. Ensure "test-client" exists
    let client = await prisma.client.findFirst({
        where: { name: 'Test Client' }
    });

    if (!client) {
        client = await prisma.client.create({
            data: {
                name: 'Test Client',
                id: 'test-client'
            }
        });
        console.log('Creating Test Client...');
    }

    // 2. Hash the password "admin123"
    const password_hash = await hashPassword('admin123');

    // 3. Upsert the new Client Admin user
    const adminEmail = normalizeEmail('admin@test.com');
    console.log('Upserting CLIENT_ADMIN user...');
    const user = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {
            password_hash,
            role: 'CLIENT_ADMIN',
            client_id: client.id,
            disabled_at: null
        },
        create: {
            client_id: client.id,
            email: adminEmail,
            name: 'Demo Admin',
            role: 'CLIENT_ADMIN',
            password_hash
        }
    });
    console.log(`Seeded ${user.email} / admin123`);

    // 4. Upsert an explicit client admin user
    const cadminEmail = normalizeEmail('clientadmin@test.com');
    const cadmin = await prisma.user.upsert({
        where: { email: cadminEmail },
        update: {
            password_hash,
            role: 'CLIENT_ADMIN',
            client_id: client.id,
            disabled_at: null
        },
        create: {
            client_id: client.id,
            email: cadminEmail,
            name: 'Client Admin',
            role: 'CLIENT_ADMIN',
            password_hash
        }
    });
    console.log(`Seeded ${cadmin.email} / admin123`);

    // 5. Upsert an explicit viewer user
    const viewerEmail = normalizeEmail('viewer@test.com');
    const viewer = await prisma.user.upsert({
        where: { email: viewerEmail },
        update: {
            password_hash,
            role: 'VIEWER',
            client_id: client.id,
            disabled_at: null
        },
        create: {
            client_id: client.id,
            email: viewerEmail,
            name: 'Demo Viewer',
            role: 'VIEWER',
            password_hash
        }
    });
    console.log(`Seeded ${viewer.email} / admin123`);

    console.log('Seed completed successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
