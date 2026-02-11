
export const TELEMETRY_V1_SCHEMA_VERSION = "telemetry.v1" as const;

export type TelemetryV1Source = "milesight" | "hawk_hub" | (string & {});

export interface TenantRefV1 {
    client_id: string;
}

export interface DeviceRefV1 {
    external_id: string;
    id?: string;
    display_name?: string;
}

export interface SensorRefV1 {
    external_id: string;
    display_name?: string;
}

export type MetricStatusV1 = "ok" | "out_of_range" | "invalid" | "missing";
export type MetricQualityV1 = "measured" | "estimated" | "derived";

export interface MetricV1 {
    parameter: string;
    value: number;
    unit?: string;
    status?: MetricStatusV1;
    quality?: MetricQualityV1;
    tags?: Record<string, string | number | boolean | null>;
}

export interface LocationV1 {
    lat: number;
    lng: number;
    accuracy_m?: number;
    method?: string;
}

export interface MetaV1 {
    battery_percent?: number;
    battery_voltage?: number;
    rssi?: number;
    snr?: number;
    gateway_id?: string;
    firmware?: string;
    model?: string;
    [key: string]: unknown;
}

export interface TelemetryEventV1 {
    schema_version: typeof TELEMETRY_V1_SCHEMA_VERSION;
    source: TelemetryV1Source;
    tenant: TenantRefV1;
    device: DeviceRefV1;
    occurred_at: string; // ISO 8601
    received_at: string; // ISO 8601
    idempotency_key: string;
    metrics: MetricV1[];
    raw: unknown | Record<string, unknown>;
    sensor?: SensorRefV1;
    site_external_id?: string;
    area_external_id?: string;
    location?: LocationV1;
    meta?: MetaV1;
}
