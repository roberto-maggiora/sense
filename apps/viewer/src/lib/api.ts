export const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000";
const DEFAULT_HEADERS = {
    "Content-Type": "application/json",
};

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

export async function fetchClient(path: string, options: RequestInit = {}) {
    const url = `${BASE_URL}${path}`;
    const token = localStorage.getItem('sense_auth_token');

    const headers: Record<string, string> = { ...DEFAULT_HEADERS };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.role === 'SUPER_ADMIN') {
                const selectedClient = localStorage.getItem('sense_selected_client_id');
                if (selectedClient) {
                    headers['X-Client-Id'] = selectedClient;
                }
            }
        } catch (e) { /* ignore invalid tokens here, let the backend 401 it */ }
    }

    Object.assign(headers, options.headers || {});

    let body = options.body;
    if (options.method === 'POST' && !body && headers['Content-Type'] === 'application/json') {
        body = '{}';
    }

    if (!body && headers['Content-Type'] === 'application/json') {
        delete headers['Content-Type'];
    }

    const res = await fetch(url, { ...options, headers, body });

    if (res.status === 401) {
        localStorage.removeItem('sense_auth_token');
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
    }

    if (!res.ok) {
        throw new ApiError(`Request failed: ${res.status} ${res.statusText}`, res.status);
    }

    // Return null for 204 No Content
    if (res.status === 204) return null;

    return res.json();
}

export interface Area {
    id: string;
    site_id: string;
    name: string;
    disabled_at?: string | null;
    created_at: string;
}

export interface Site {
    id: string;
    client_id: string;
    name: string;
    disabled_at?: string | null;
    created_at: string;
    areas?: Area[];
}

export async function listSites(includeDisabled = false): Promise<Site[]> {
    const query = includeDisabled ? '?includeDisabled=true' : '';
    const res = await fetchClient(`/api/v1/sites${query}`);
    return res.data;
}

export async function createSite(name: string): Promise<Site> {
    return fetchClient('/api/v1/sites', {
        method: 'POST',
        body: JSON.stringify({ name })
    });
}

export async function updateSite(id: string, updates: { name?: string; disabled?: boolean }): Promise<Site> {
    return fetchClient(`/api/v1/sites/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
    });
}

export async function listAreas(siteId: string, includeDisabled = false): Promise<Area[]> {
    const query = includeDisabled ? '?includeDisabled=true' : '';
    const res = await fetchClient(`/api/v1/sites/${siteId}/areas${query}`);
    return res.data;
}

export async function createArea(siteId: string, name: string): Promise<Area> {
    return fetchClient(`/api/v1/sites/${siteId}/areas`, {
        method: 'POST',
        body: JSON.stringify({ name })
    });
}

export async function updateArea(id: string, updates: { name?: string; disabled?: boolean }): Promise<Area> {
    return fetchClient(`/api/v1/areas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
    });
}

export async function updateDevice(id: string, payload: { name?: string; disabled?: boolean; site_id?: string | null; area_id?: string | null }) {
    return fetchClient(`/api/v1/devices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    });
}

// -------------------------------------------------------------
// Admin APIs
// -------------------------------------------------------------

const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || "";

async function adminFetchClient(endpoint: string, options: RequestInit = {}) {
    if (!ADMIN_TOKEN) {
        throw new Error("Admin token not configured. Please set VITE_ADMIN_TOKEN.");
    }
    const url = `${BASE_URL}${endpoint}`;
    const headers = new Headers(options.headers || {});
    headers.set('x-admin-token', ADMIN_TOKEN);
    if (options.body) {
        headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
        let errMessage = `HTTP Error ${res.status}`;
        try {
            const errData = await res.json();
            if (errData.error) errMessage = errData.error;
        } catch { } // ignore
        throw new Error(errMessage);
    }
    return res.json();
}

export interface Client {
    id: string;
    name: string;
    disabled_at?: string | null;
    created_at: string;
}

export type User = {
    id: string;
    client_id: string;
    email: string;
    name?: string | null;
    role: string;
    site_id?: string | null;
    disabled_at?: string | null;
    created_at: string;
};

export async function listClients(includeDisabled: boolean = false): Promise<Client[]> {
    const qs = includeDisabled ? '?include_disabled=true' : '';
    const res = await adminFetchClient(`/admin/clients${qs}`);
    return res.data;
}

export async function createClient(name: string): Promise<Client> {
    const res = await adminFetchClient('/admin/clients', {
        method: 'POST',
        body: JSON.stringify({ name })
    });
    return res.data;
}

export async function updateClientAdmin(id: string, payload: { name?: string; disabled_at?: string | null }): Promise<Client> {
    const res = await adminFetchClient(`/admin/clients/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    });
    return res.data;
}

export async function listUsers(clientId?: string, includeDisabled: boolean = false): Promise<User[]> {
    const params = new URLSearchParams();
    if (clientId) params.append('client_id', clientId);
    if (includeDisabled) params.append('include_disabled', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';

    const res = await adminFetchClient(`/admin/users${qs}`);
    return res.data;
}

export async function createUser(payload: { client_id: string; email: string; name?: string; role?: string }): Promise<User> {
    const res = await adminFetchClient('/admin/users', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    return res.data;
}

export async function updateUserAdmin(id: string, payload: { name?: string; role?: string; disabled_at?: string | null }): Promise<User> {
    const res = await adminFetchClient(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    });
    return res.data;
}

export type DashboardSummary = {
    total_devices: number;
    red: number;
    amber: number;
    green: number;
    offline: number;
    open_alerts?: number;
    last_telemetry_at?: string | null;
};

export async function getDashboardSummary(filters?: { site_id?: string; area_id?: string }): Promise<DashboardSummary> {
    const params = new URLSearchParams();
    if (filters?.site_id) params.append('site_id', filters.site_id);
    if (filters?.area_id) params.append('area_id', filters.area_id);

    return fetchClient(`/api/v1/dashboard/summary?${params.toString()}`);
}

export async function getDashboardDevices(filters?: { site_id?: string; area_id?: string; limit?: number }): Promise<{ data: any[] }> {
    const params = new URLSearchParams();
    if (filters?.site_id) params.append('site_id', filters.site_id);
    if (filters?.area_id) params.append('area_id', filters.area_id);
    if (filters?.limit) params.append('limit', filters.limit.toString());

    return fetchClient(`/api/v1/dashboard/devices?${params.toString()}`);
}

// -------------------------------------------------------------
// Client Admin APIs
// -------------------------------------------------------------

export async function listMyCompanyUsers(): Promise<User[]> {
    const res = await fetchClient('/api/v1/users');
    return res.data;
}

export async function createMyCompanyUser(payload: { email: string; name?: string; role: string; password?: string }): Promise<User> {
    const res = await fetchClient('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    return res.data;
}

export async function updateMyCompanyUser(id: string, payload: { name?: string; role?: string; disabled?: boolean }): Promise<User> {
    const res = await fetchClient(`/api/v1/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    });
    return res.data;
}

export async function resetMyCompanyUserPassword(id: string, password: string): Promise<void> {
    await fetchClient(`/api/v1/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password })
    });
}

// -------------------------------------------------------------
// Device Alarm Rules API
// -------------------------------------------------------------

export interface DeviceAlarmRule {
    id: string;
    device_id: string;
    metric: string;
    operator: 'gt' | 'lt';
    threshold: number;
    duration_seconds: number;
    severity: 'amber' | 'red';
    enabled: boolean;
    created_at: string;
    updated_at: string;
}

export async function listDeviceRules(deviceId: string): Promise<DeviceAlarmRule[]> {
    return fetchClient(`/api/v1/devices/${deviceId}/rules`);
}

export async function createDeviceRule(deviceId: string, payload: Omit<DeviceAlarmRule, 'id' | 'device_id' | 'created_at' | 'updated_at'>): Promise<DeviceAlarmRule> {
    return fetchClient(`/api/v1/devices/${deviceId}/rules`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function updateDeviceRule(ruleId: string, payload: Partial<DeviceAlarmRule>): Promise<DeviceAlarmRule> {
    return fetchClient(`/api/v1/rules/${ruleId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    });
}

export async function deleteDeviceRule(ruleId: string): Promise<void> {
    await fetchClient(`/api/v1/rules/${ruleId}`, {
        method: 'DELETE'
    });
}
