const BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_HEADERS = {
    "X-Client-Id": "test-client",
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
    const headers = { ...DEFAULT_HEADERS, ...options.headers };

    let body = options.body;
    if (options.method === 'POST' && !body && (headers as Record<string, string>)['Content-Type'] === 'application/json') {
        body = '{}';
    }

    const res = await fetch(url, { ...options, headers, body });

    if (!res.ok) {
        throw new ApiError(`Request failed: ${res.status} ${res.statusText}`, res.status);
    }

    // Return null for 204 No Content
    if (res.status === 204) return null;

    return res.json();
}
