import { PrismaClient } from '@prisma/client';
import { normalizeEmail, hashPassword } from './_lib/auth';

const prisma = new PrismaClient();

async function main() {
    const args = process.argv.slice(2);
    let email = '';
    let password = '';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--email') email = args[i + 1];
        if (args[i] === '--password') password = args[i + 1];
    }

    if (!email || !password) {
        console.error('Usage: npx tsx scripts/reset-password.ts --email <email> --password <password>');
        process.exit(1);
    }

    email = normalizeEmail(email);
    const password_hash = await hashPassword(password);

    console.log(`Looking up user ${email}...`);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        console.error(`User ${email} not found.`);
        process.exit(1);
    }

    const updateData: any = {
        password_hash,
        disabled_at: null
    };

    if (user.role === 'SUPER_ADMIN') {
        updateData.client_id = null;
        console.log('User is SUPER_ADMIN. Ensuring client_id is null.');
    }

    await prisma.user.update({
        where: { id: user.id },
        data: updateData
    });

    console.log(`Successfully reset password for ${email}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
