import { prisma } from '@sense/database';

async function main() {
  const deviceId = process.env.DEVICE_ID!;
  const rows = await prisma.notificationOutbox.findMany({
    where: { device_id: deviceId },
    orderBy: { created_at: 'desc' },
    take: 10,
    select: {
      id: true,
      device_id: true,
      rule_id: true,
      message: true,
      created_at: true,
      acknowledged_at: true,
      acknowledged_by: true,
      ack_consumed: true,
    },
  });

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
