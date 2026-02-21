import { prisma } from '@sense/database';

async function main() {
  const clientId = 'test-client';

  // Ensure client exists (assumes client.id is a string; matches your auth test using "test-client")
  await prisma.client.upsert({
    where: { id: clientId },
    update: {},
    create: { id: clientId, name: 'Test Client' },
  });

  // 1. Create Main Site
  const site = await prisma.site.upsert({
    where: {
      client_id_name: {
        client_id: clientId,
        name: 'Main Site'
      }
    },
    update: {},
    create: {
      client_id: clientId,
      name: 'Main Site'
    }
  });

  // 2. Create Areas
  const kitchen = await prisma.area.upsert({
    where: {
      site_id_name: {
        site_id: site.id,
        name: 'Kitchen'
      }
    },
    update: {},
    create: {
      site_id: site.id,
      name: 'Kitchen'
    }
  });

  await prisma.area.upsert({
    where: {
      site_id_name: {
        site_id: site.id,
        name: 'Fridge Room'
      }
    },
    update: {},
    create: {
      site_id: site.id,
      name: 'Fridge Room'
    }
  });

  // 3. Create/Update Device with dimensions
  const device = await prisma.device.upsert({
    where: {
      source_external_id: {
        source: 'milesight',
        external_id: 'ui_test_ext'
      }
    },
    update: {
      site_id: site.id,
      area_id: kitchen.id
    },
    create: {
      client_id: clientId,
      source: 'milesight',
      external_id: 'ui_test_ext',
      name: 'UI Test Device',
      site_id: site.id,
      area_id: kitchen.id
    },
  });

  await prisma.alertRule.create({
    data: {
      client_id: clientId,
      scope_type: 'device',
      scope_id: device.id,
      parameter: 'temperature',
      operator: 'gt',
      threshold: 50,
      breach_duration_seconds: 5,
      enabled: true,
    },
  });

  console.log(JSON.stringify({ clientId, deviceId: device.id, devEui: device.external_id }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => prisma.$disconnect());
