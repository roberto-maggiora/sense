import { PrismaClient } from '@prisma/client';
import { normalizeEmail, hashPassword } from './_lib/auth';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding Admin Data...');

    // 1. Ensure "test-client" exists
    let client = await prisma.client.findFirst({
        where: { name: 'test-client' }
    });

    if (!client) {
        console.log('Creating Test Client...');
        client = await prisma.client.create({
            data: {
                name: 'test-client'
            }
        });
    } else {
        console.log('Test Client already exists.');
    }

    // 1.5 Create a shared password hash for admin123
    const password_hash = await hashPassword('admin123');

    // 2. Upsert SUPER_ADMIN
    const superAdminEmail = normalizeEmail('admin@sense.local');
    console.log('Upserting SUPER_ADMIN user...');
    await prisma.user.upsert({
        where: { email: superAdminEmail },
        update: {
            password_hash,
            role: 'SUPER_ADMIN',
            client_id: null,
            disabled_at: null
        },
        create: {
            email: superAdminEmail,
            client_id: null,
            name: 'System Admin',
            role: 'SUPER_ADMIN',
            password_hash
        }
    });

    // 3. Upsert CLIENT_ADMIN
    const clientAdminEmail = normalizeEmail('admin@test.local');
    console.log('Upserting CLIENT_ADMIN user...');
    await prisma.user.upsert({
        where: { email: clientAdminEmail },
        update: {
            password_hash,
            role: 'CLIENT_ADMIN',
            client_id: client.id,
            disabled_at: null
        },
        create: {
            email: clientAdminEmail,
            client_id: client.id,
            name: 'Test Client Admin',
            role: 'CLIENT_ADMIN',
            password_hash
        }
    });

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
