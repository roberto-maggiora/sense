
export type IngestMetric =
    | 'total_ingest_requests'
    | 'total_ingest_success'
    | 'total_ingest_device_not_found'
    | 'total_ingest_auth_fail';

const stats: Record<IngestMetric, number> = {
    total_ingest_requests: 0,
    total_ingest_success: 0,
    total_ingest_device_not_found: 0,
    total_ingest_auth_fail: 0
};

export function increment(metric: IngestMetric) {
    stats[metric]++;
}

export function snapshot() {
    return { ...stats };
}
