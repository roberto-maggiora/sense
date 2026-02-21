import bcrypt from 'bcryptjs';

export function normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
}

export async function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
}
