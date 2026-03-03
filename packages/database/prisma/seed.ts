import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    // Clean up existing data for idempotency
    try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Client", "User", "Site", "Area", "Device", "Alert", "AlertEvent", "CorrectiveAction", "DeviceAlarmRule", "DeviceAlarmRuleRecipient", "TelemetryEventV1", "Hub" CASCADE;`);
    } catch (e: any) {
        console.warn("Error cleaning up data, proceeding...", e.message);
    }

    // 1. Create Client A (Has Site + Area)
    const clientA = await prisma.client.create({
        data: {
            name: 'Test Client A',
            sites: {
                create: {
                    name: 'Site A',
                    areas: {
                        create: {
                            name: 'Area A'
                        }
                    }
                }
            }
        },
        include: {
            sites: {
                include: {
                    areas: true
                }
            }
        }
    });

    const siteA = clientA.sites[0];
    const areaA = siteA.areas[0];

    // 2. Create Client B (No Site/Area)
    const clientB = await prisma.client.create({
        data: {
            name: 'Test Client B'
        }
    });
    // Create default admin user
    const passwordHash = await bcrypt.hash('admin123', 10);

    const adminUser = await prisma.user.create({
        data: {
            email: 'admin@sense.local',
            name: 'System Admin',
            password_hash: passwordHash,
            role: 'SUPER_ADMIN'
        }
    });

    console.log(`Admin user created: ${adminUser.email}`);
    console.log('Seeding completed.');
    console.log('------------------------------------------------');
    console.log(`Client A (${clientA.name}): ${clientA.id}`);
    console.log(`  Site ID: ${siteA.id}`);
    console.log(`  Area ID: ${areaA.id}`);
    console.log(`Client B (${clientB.name}): ${clientB.id}`);
    console.log('------------------------------------------------');

    const cadminB = await prisma.user.create({
        data: {
            client_id: clientB.id,
            email: 'adminB@sense.local',
            name: 'Client B Admin',
            role: 'CLIENT_ADMIN',
            password_hash: passwordHash
        }
    });
    console.log(`Client B Admin user created: ${cadminB.email}`);

    // Create a device for Client A
    const device = await prisma.device.create({
        data: {
            client_id: clientA.id,
            site_id: siteA.id,
            area_id: areaA.id,
            source: 'milesight',
            external_id: 'seed-device-1',
            name: 'Seeded Device'
        }
    });
    console.log(`Device ID (Client A): ${device.id}`);
    console.log('------------------------------------------------');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
