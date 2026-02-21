
import { prisma } from '@sense/database';

async function main() {
    console.log('Verifying Sites and Areas...');

    // 1. Verify Site exists
    const site = await prisma.site.findFirst({
        where: { name: 'Main Site' },
        include: { areas: true }
    });

    if (!site) {
        console.error('FAIL: "Main Site" not found.');
        process.exit(1);
    }
    console.log('PASS: Found "Main Site".');

    // 2. Verify Areas exist
    const kitchen = site.areas.find(a => a.name === 'Kitchen');
    const fridgeRoom = site.areas.find(a => a.name === 'Fridge Room');

    if (!kitchen) {
        console.error('FAIL: "Kitchen" area not found.');
        process.exit(1);
    }
    if (!fridgeRoom) {
        console.error('FAIL: "Fridge Room" area not found.');
        process.exit(1);
    }
    console.log(`PASS: Found areas "Kitchen" and "Fridge Room" for site ${site.id}.`);

    // 3. Verify Device Linkage
    const device = await prisma.device.findFirst({
        where: { external_id: 'ui_test_ext' }
    });

    if (!device) {
        console.error('FAIL: "UI Test Device" not found.');
        process.exit(1);
    }

    if (device.site_id !== site.id) {
        console.error(`FAIL: Device site_id mismatch. Expected ${site.id}, got ${device.site_id}`);
        process.exit(1);
    }
    if (device.area_id !== kitchen.id) {
        console.error(`FAIL: Device area_id mismatch. Expected ${kitchen.id}, got ${device.area_id}`);
        process.exit(1);
    }
    console.log('PASS: Device is correctly linked to Site and Kitchen Area.');

    console.log('ALL VERIFICATIONS PASSED');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
