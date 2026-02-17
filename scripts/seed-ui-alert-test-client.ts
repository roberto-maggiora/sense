import { prisma } from '@sense/database';

async function main() {
  const clientId = 'test-client';

  // Ensure client exists (assumes client.id is a string; matches your auth test using "test-client")
  await prisma.client.upsert({
    where: { id: clientId },
    update: {},
    create: { id: clientId, name: 'Test Client' },
  });

  const device = await prisma.device.create({
    data: {
      client_id: clientId,
      source: 'milesight',
      external_id: 'ui_test_ext',
      name: 'UI Test Device',
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
