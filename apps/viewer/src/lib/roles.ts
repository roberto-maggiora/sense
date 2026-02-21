import type { AuthUser } from "./auth";

export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
    return user?.role === 'SUPER_ADMIN';
}

export function isClientAdmin(user: AuthUser | null | undefined): boolean {
    return user?.role === 'CLIENT_ADMIN';
}

export function canManageCompanyUsers(user: AuthUser | null | undefined): boolean {
    return user?.role === 'SUPER_ADMIN' || user?.role === 'CLIENT_ADMIN';
}
