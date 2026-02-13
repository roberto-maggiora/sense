import { PrismaClient } from '@sense/database';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Clients ---');
    console.log(await prisma.client.findMany());

    console.log('--- Devices ---');
    console.log(await prisma.device.findMany());

    console.log('--- Device Statuses ---');
    console.log(await prisma.deviceStatus.findMany());
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
