import { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import TemperatureHistoryCard from "./TemperatureHistoryCard";
import { getMetricMeta, formatMetricValue } from "../lib/metrics";
import {
    type Site,
    type Area,
    type DashboardSummary,
    type ComplianceSummary,
    listSites,
    listAreas,
    getDashboardSummary,
    getDashboardCompliance,
    getDashboardDevices,
    fetchClient,
    getBatteryAttentionDevices,
    type BatteryAttentionDevice,
    getHubStatus,
    type HubStatus,
    updateHub,
    deleteHub,
} from "../lib/api";

import { formatDeviceLocation } from "../lib/location";

// ─── Local types ─────────────────────────────────────────────────────────────

function displayName(v: any): string {
    if (v == null) return '—';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (typeof v === 'object' && 'name' in v && typeof (v as any).name === 'string') return (v as any).name;
    return '—';
}

type Device = {
    id: string;
    name: string;
    site_id?: string | null;
    area_id?: string | null;
    site?: { name: string } | null;
    area?: { name: string } | null;
    current_status: { status: string; reason?: any; updated_at?: string | null; } | null;
    latest_telemetry: { occurred_at: string; payload?: any } | null;
    metrics: {
        temperature: number | null;
        humidity: number | null;
        battery_percent: number | null;
        battery_raw: number | null;
        battery_updated_at: string | null;
        [key: string]: number | string | null;
    };
    available_metrics?: string[];
    has_alert?: boolean;
};

type AlertStatus = 'triggered' | 'notified' | 'acknowledged' | 'snoozed' | 'resolved' | 'auto_resolved';

/** Lightweight open-alert shape — only what the dashboard needs */
type OpenAlert = {
    id: string;
    device_id: string;
    status: AlertStatus;
    acknowledged_at: string | null;
    acknowledged_by: string | null;
};

/** Per-device acknowledgement state derived from open alerts */
type AckInfo = {
    hasAcknowledgedOpenAlert: boolean;
    latestAcknowledgedAt: string | null;
    acknowledgedBy: string | null;
};

// ─── Metric icons (inline SVG — no external icon library needed) ────────────

const ThermoIcon = () => (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 3v10.55A4 4 0 1 0 16 17V3a4 4 0 0 0-8 0z" />
    </svg>
);

const DropletIcon = () => (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0C19 10 12 2 12 2z" />
    </svg>
);

const BatteryIcon = () => (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="2" y="7" width="18" height="10" rx="2" strokeWidth={2} />
        <path strokeLinecap="round" strokeWidth={2} d="M22 11v2" />
        <path strokeLinecap="round" strokeWidth={2} d="M6 11h5" />
    </svg>
);

const CloudIcon = ({ className = "w-3.5 h-3.5 shrink-0" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
);

const GaugeIcon = ({ className = "w-3.5 h-3.5 shrink-0" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m12 14 4-4" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.34 16a10 10 0 1 1 17.32 0" />
    </svg>
);

const AlertIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
    <svg className={`shrink-0 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

const WifiIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
    <svg className={`shrink-0 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0" />
    </svg>
);

// ─── MetricChip ───────────────────────────────────────────────────────────────

type MetricChipProps = {
    icon?: React.ComponentType;
    value: number;
    parameter: string;
    unit: string;
    title?: string;
    className?: string;
};

function OperationalStatusWidget({ devices }: { devices: Device[] }) {
    if (devices.length === 0) return null;

    return (
        <div className="mb-8 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Operational Status</h3>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    {devices.length} Devices
                </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4 border-t border-slate-100 dark:border-white/5 max-h-[400px] overflow-y-auto bg-slate-50/50 dark:bg-slate-900/20">
                {devices.map(d => {
                    const opMetrics = ['door_contact', 'power_present', 'leak_detected', 'motion', 'vibration'];
                    const avail = d.available_metrics || [];
                    const primaryOp = opMetrics.find(m => avail.includes(m));

                    const val = primaryOp ? (d as any).metric_values?.[primaryOp] : null;
                    const meta = primaryOp ? getMetricMeta(primaryOp) : null;
                    const displayVal = (meta && val != null && primaryOp) ? formatMetricValue(val, primaryOp as string) : '—';

                    let dotColor = 'bg-slate-300 dark:bg-slate-600';
                    let displayValStr = displayVal;
                    const isOffline = d.current_status?.status === 'offline';

                    if (isOffline) {
                        dotColor = 'bg-slate-300 dark:bg-slate-600';
                        displayValStr = 'Offline';
                    } else if (primaryOp === 'door_contact') {
                        dotColor = val === 0 ? 'bg-emerald-500' : val === 1 ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600';
                    } else if (primaryOp === 'power_present') {
                        dotColor = val === 1 ? 'bg-emerald-500' : val === 0 ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600';
                    }

                    return (
                        <div key={d.id} className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-colors">
                            <Link title={formatDeviceLocation(d)} to={`/device/${d.id}`} className="flex-1 min-w-0 font-medium text-sm text-slate-800 dark:text-slate-200 truncate hover:text-blue-600 dark:hover:text-blue-400">
                                {d.name}
                            </Link>
                            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 ml-4 shrink-0 font-medium bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded-md border border-slate-100 dark:border-white/5">
                                <div className={`w-2 h-2 rounded-full ${dotColor}`}></div>
                                {displayValStr}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function MetricChip({ icon: Icon, value, parameter, unit, title, className = '' }: MetricChipProps) {
    const displayValue = formatMetricValue(value, parameter);
    return (
        <span
            className={`inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 tabular-nums ${className}`}
            title={title}
        >
            {Icon && <Icon />}
            {displayValue}{unit}
        </span>
    );
}

// ─── Metric config map (extend here when adding new metrics) ─────────────────

type MetricKey = 'temperature' | 'humidity' | 'battery' | 'co2' | 'barometric_pressure';

const metricConfig: Record<MetricKey, { icon: React.ComponentType<any>; unit: string }> = {
    temperature: { icon: ThermoIcon, unit: '°C' },
    humidity: { icon: DropletIcon, unit: '%' },
    co2: { icon: CloudIcon, unit: ' ppm' },
    barometric_pressure: { icon: GaugeIcon, unit: ' hPa' },
    battery: { icon: BatteryIcon, unit: '%' },
};

function formatAlertReason(metric: string, operator: string, threshold: number) {
    const metricName = metric === 'temperature' ? 'Temperature' : metric.charAt(0).toUpperCase() + metric.slice(1);
    const unit = metricConfig[metric as MetricKey]?.unit || '';
    const formattedThreshold = unit === '%' ? Math.round(threshold) : Number(threshold).toFixed(1);

    if (operator === 'gt' || operator === 'gte') {
        return `${metricName} above maximum (> ${formattedThreshold}${unit})`;
    } else if (operator === 'lt' || operator === 'lte') {
        return `${metricName} below minimum (< ${formattedThreshold}${unit})`;
    }
    return `${metricName} out of bounds`;
}

function formatAlertTime(dateStr?: string | null) {
    if (!dateStr) return 'unknown time';
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(dateStr));
}

/** Statuses that count as "open" (= still needs attention) */
const OPEN_STATUSES: AlertStatus[] = ['triggered', 'notified', 'acknowledged', 'snoozed'];

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dashboard() {
    const [data, setData] = useState<DashboardSummary | null>(null);
    const [devices, setDevices] = useState<Device[]>([]);
    const [batteryAttentionDevices, setBatteryAttentionDevices] = useState<BatteryAttentionDevice[]>([]);
    const [batteryError, setBatteryError] = useState<boolean>(false);
    const [batteryLoading, setBatteryLoading] = useState<boolean>(true);

    // Hub State
    const [hubs, setHubs] = useState<HubStatus[]>([]);
    const [hubsLoading, setHubsLoading] = useState<boolean>(true);
    const [hubsError, setHubsError] = useState<boolean>(false);
    // Hub actions: stores the serial of the hub whose menu is open
    const [hubMenuOpen, setHubMenuOpen] = useState<string | null>(null);
    const [hubEditId, setHubEditId] = useState<string | null>(null);
    const [hubEditName, setHubEditName] = useState<string>('');
    const [hubActionLoading, setHubActionLoading] = useState<string | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

    const [compliance, setCompliance] = useState<ComplianceSummary | null>(null);
    const [compliancePeriod, setCompliancePeriod] = useState<'today' | '7d'>('today');
    const [complianceLoading, setComplianceLoading] = useState(true);

    const complianceMetric = useMemo(() => {
        if (!devices.length) return 'temperature';
        const hasTemp = devices.some(d => d.available_metrics?.includes('temperature'));
        if (hasTemp) return 'temperature';
        for (const d of devices) {
            const other = d.available_metrics?.find(m => m !== 'battery');
            if (other) return other;
        }
        return 'temperature';
    }, [devices]);

    // Filter State
    const [sites, setSites] = useState<Site[]>([]);
    const [areas, setAreas] = useState<Area[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState<string>('');
    const [selectedAreaId, setSelectedAreaId] = useState<string>('');
    const [systemFilter, setSystemFilter] = useState<'attention' | 'offline' | null>(null);
    const [loadingFilters, setLoadingFilters] = useState(true);

    // Acknowledgement map: deviceId → AckInfo
    const [ackMap, setAckMap] = useState<Record<string, AckInfo>>({});

    // Portal logic for Topbar Actions
    const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
    useEffect(() => {
        setPortalElement(document.getElementById('topbar-actions'));
    }, []);

    // ─── Load sites ────────────────────────────────────────────────────────
    useEffect(() => {
        listSites().then(setSites).catch(console.error).finally(() => setLoadingFilters(false));
    }, []);

    // ─── Load areas when site changes ──────────────────────────────────────
    useEffect(() => {
        if (selectedSiteId) {
            listAreas(selectedSiteId).then(setAreas).catch(console.error);
        } else {
            setAreas([]);
        }
    }, [selectedSiteId]);

    // ─── Fetch open alerts for ack map ─────────────────────────────────────
    const fetchAckMap = useCallback(async () => {
        try {
            const json = await fetchClient('/api/v1/alerts?limit=200');
            const rawList: OpenAlert[] = Array.isArray(json) ? json : (json.data ?? []);

            // Only keep open statuses
            const openAlerts = rawList.filter(a => OPEN_STATUSES.includes(a.status));

            // Build deviceId → ack info
            const map: Record<string, AckInfo> = {};
            for (const alert of openAlerts) {
                const existing = map[alert.device_id];
                const isAck = alert.status === 'acknowledged';

                if (!existing) {
                    map[alert.device_id] = {
                        hasAcknowledgedOpenAlert: isAck,
                        latestAcknowledgedAt: isAck ? alert.acknowledged_at : null,
                        acknowledgedBy: isAck ? alert.acknowledged_by : null,
                    };
                } else if (isAck && !existing.hasAcknowledgedOpenAlert) {
                    // Promote to acknowledged if any open alert is acked
                    map[alert.device_id] = {
                        hasAcknowledgedOpenAlert: true,
                        latestAcknowledgedAt: alert.acknowledged_at,
                        acknowledgedBy: alert.acknowledged_by,
                    };
                }
            }

            setAckMap(map);
        } catch {
            // Silent: ack indicators are best-effort, don't break dashboard
        }
    }, []);

    // ─── Fetch dashboard data ───────────────────────────────────────────────
    const fetchData = useCallback(async (background = false) => {
        try {
            if (!background) setError(null);
            const filters = {
                site_id: selectedSiteId || undefined,
                area_id: selectedAreaId || undefined,
            };

            const [summary, devicesRes] = await Promise.all([
                getDashboardSummary(filters),
                getDashboardDevices({ ...filters, limit: 50 }),
            ]);

            setData(summary);
            const safeDevices = Array.isArray(devicesRes?.data) ? devicesRes.data : [];
            setDevices(safeDevices);

            if (safeDevices.length > 0) {
                const found = safeDevices.find((d: Device) => d.id === selectedDeviceId);
                if (!found) setSelectedDeviceId(safeDevices[0].id);
            } else {
                setSelectedDeviceId(null);
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        }
    }, [selectedSiteId, selectedAreaId, selectedDeviceId]);

    const fetchCompliance = useCallback(async (background = false) => {
        try {
            if (!background) setComplianceLoading(true);
            const res = await getDashboardCompliance(compliancePeriod, complianceMetric, {
                site_id: selectedSiteId || undefined,
                area_id: selectedAreaId || undefined,
            });
            setCompliance(res);
        } catch {
            // Failure is fine, widget handles null
        } finally {
            if (!background) setComplianceLoading(false);
        }
    }, [compliancePeriod, complianceMetric, selectedSiteId, selectedAreaId]);

    const fetchBatteryAttention = useCallback(async (background = false) => {
        try {
            if (!background) {
                setBatteryLoading(true);
                setBatteryError(false);
            }
            const res = await getBatteryAttentionDevices();
            setBatteryAttentionDevices(Array.isArray(res?.data) ? res.data : []);
            setBatteryError(false);
        } catch {
            setBatteryError(true);
            if (!background) setBatteryAttentionDevices([]);
        } finally {
            if (!background) setBatteryLoading(false);
        }
    }, []);

    const fetchHubs = useCallback(async (background = false) => {
        try {
            if (!background) {
                setHubsLoading(true);
                setHubsError(false);
            }
            const res = await getHubStatus();
            // enforce max 5 inside API response locally
            const items = Array.isArray(res?.data) ? res.data : [];
            setHubs(items.slice(0, 5));
            setHubsError(false);
        } catch {
            setHubsError(true);
            if (!background) setHubs([]);
        } finally {
            if (!background) setHubsLoading(false);
        }
    }, []);

    const doAllRefreshes = useCallback((background = true) => {
        fetchData(background);
        fetchCompliance(background);
        fetchAckMap();
        fetchHubs(background);
    }, [fetchData, fetchCompliance, fetchAckMap, fetchHubs]);

    // Initial load
    useEffect(() => {
        doAllRefreshes(false);
        fetchBatteryAttention(false);

        const int = setInterval(() => doAllRefreshes(true), 60000); // 1 minute refetch
        const battInt = setInterval(() => fetchBatteryAttention(true), 300000); // 5 minute
        return () => { clearInterval(int); clearInterval(battInt); };
    }, [doAllRefreshes, fetchBatteryAttention]);

    // Refetch compliance on period manual toggle
    useEffect(() => {
        fetchCompliance(false);
    }, [compliancePeriod, fetchCompliance]);

    // Refresh on focus
    useEffect(() => {
        let lastRefresh = Date.now();
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const now = Date.now();
                if (now - lastRefresh > 10000) {
                    lastRefresh = now;
                    doAllRefreshes(true);
                    fetchBatteryAttention(true);
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [doAllRefreshes, fetchBatteryAttention]);

    // ─── Hub Handlers ──────────────────────────────────────────────────────
    const handleHubSaveName = useCallback(async (hub: HubStatus) => {
        const trimmed = hubEditName.trim();
        if (!trimmed) return;
        setHubActionLoading(hub.id);
        try {
            await updateHub(hub.id, trimmed);
            setHubEditId(null);
            fetchHubs(true);
        } catch {
            // silently fail - hub widget stays intact
        } finally {
            setHubActionLoading(null);
        }
    }, [hubEditName, fetchHubs]);

    const handleHubDelete = useCallback(async (hub: HubStatus) => {
        if (!window.confirm(`Remove hub "${hub.friendly_name || hub.serial}"? This cannot be undone.`)) return;
        setHubActionLoading(hub.id);
        try {
            await deleteHub(hub.id);
            fetchHubs(true);
        } catch {
            // silently fail
        } finally {
            setHubActionLoading(null);
        }
    }, [fetchHubs]);

    // ─── Handlers ──────────────────────────────────────────────────────────
    const handleSiteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedSiteId(e.target.value);
        setSelectedAreaId('');
    };
    const handleAreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => setSelectedAreaId(e.target.value);
    const clearFilters = () => { setSelectedSiteId(''); setSelectedAreaId(''); };

    // ─── Selected device ──────────────────────────────────────────────────
    // const selectedAck = selectedDeviceId ? (ackMap[selectedDeviceId] ?? null) : null;

    // ─── Global Banner ────────────────────────────────────────────────────
    let globalSeverity: 'red' | 'offline' | 'amber' | 'green' = 'green';
    let globalBannerDevice: Device | null = null;
    let globalBannerCount = 0;

    const redAlertDevices = devices.filter(d => d.current_status?.status === 'red');
    const offlineAlertDevices = devices.filter(d => d.current_status?.status === 'offline');
    const amberAlertDevices = devices.filter(d => d.current_status?.status === 'amber');

    if (redAlertDevices.length > 0) {
        globalSeverity = 'red';
        globalBannerDevice = redAlertDevices[0];
        globalBannerCount = redAlertDevices.length;
    } else if (offlineAlertDevices.length > 0) {
        globalSeverity = 'offline';
        globalBannerDevice = offlineAlertDevices[0];
        globalBannerCount = offlineAlertDevices.length;
    } else if (amberAlertDevices.length > 0) {
        globalSeverity = 'amber';
        globalBannerDevice = amberAlertDevices[0];
        globalBannerCount = amberAlertDevices.length;
    }

    let bannerTimeContext = "";
    if (globalBannerDevice) {
        if (globalSeverity === 'offline') {
            bannerTimeContext = `Offline since ${formatAlertTime(globalBannerDevice.current_status?.updated_at || globalBannerDevice.latest_telemetry?.occurred_at)}`;
        } else {
            const ds = globalBannerDevice.current_status;
            if (ds?.reason && typeof ds.reason === 'string') {
                bannerTimeContext = `Issue detected since ${formatAlertTime(ds?.updated_at)}`;
            } else if (ds?.reason && typeof ds.reason === 'object') {
                const r: any = ds.reason;
                if (r.metric && r.operator && r.threshold !== undefined) {
                    bannerTimeContext = `${formatAlertReason(r.metric, r.operator, r.threshold)} since ${formatAlertTime(ds?.updated_at)}`;
                }
            }
        }
    }

    // ─── Site-awareness ────────────────────────────────────────────────────
    // If the user has a specific site selected, scope = 1 site.
    // Otherwise, count how many sites the tenant has.
    const sitesInScopeCount = selectedSiteId ? 1 : sites.length;

    // Banner subtitle: include site name when multi-site scope
    const bannerSubtitle = (() => {
        if (!globalBannerDevice) return '';
        const sitePart = sitesInScopeCount > 1 && globalBannerDevice.site?.name
            ? `${globalBannerDevice.site.name} — `
            : '';
        return `${sitePart}${globalBannerDevice.name} — ${bannerTimeContext}`;
    })();

    // ─── Next Actions ─────────────────────────────────────────────────────
    // Each action carries structured fields for site-aware rendering.
    type ActionItem = {
        id: string;
        deviceName: string;
        siteName: string | null;
        issue: string;        // e.g. "Offline since 09:22" or "Temperature below minimum"
        link: string;
        icon: any;
        status: 'red' | 'amber' | 'offline' | 'acknowledged';
    };
    const nextActions: ActionItem[] = [];

    const buildIssue = (d: Device, severity: 'red' | 'amber' | 'offline' | 'acknowledged'): string => {
        if (severity === 'acknowledged') {
            const ack = ackMap[d.id];
            const timeSpan = ack?.latestAcknowledgedAt ? formatAlertTime(ack.latestAcknowledgedAt) : 'unknown time';
            const userStr = ack?.acknowledgedBy ? displayName(ack.acknowledgedBy) : 'someone';
            return `Alert acknowledged at ${timeSpan} by ${userStr} (status stays RED until cleared)`;
        }
        if (severity === 'offline') {
            const t = formatAlertTime(d.current_status?.updated_at || d.latest_telemetry?.occurred_at);
            return `Offline since ${t}`;
        }
        // red / amber
        const ds = d.current_status;
        if (ds?.reason && typeof ds.reason === 'string') return ds.reason;
        if (ds?.reason && typeof ds.reason === 'object') {
            const r: any = ds.reason;
            if (r.metric && r.operator && r.threshold !== undefined) {
                const since = ds?.updated_at ? ` (since ${formatAlertTime(ds.updated_at)})` : '';
                return `${formatAlertReason(r.metric, r.operator, r.threshold)}${since}`;
            }
        }
        return 'Attention required';
    };

    const addAction = (d: Device, severity: 'red' | 'amber' | 'offline' | 'acknowledged', icon: any) => {
        if (nextActions.length >= 5) return;
        nextActions.push({
            id: severity + '-' + d.id,
            deviceName: d.name,
            siteName: d.site?.name ?? null,
            issue: buildIssue(d, severity),
            link: ((severity === 'red' || severity === 'acknowledged') && d.has_alert) ? `/alerts` : `/device/${d.id}`,
            icon,
            status: severity,
        });
    };

    const ackedDevices: Device[] = [];
    for (const d of redAlertDevices) {
        if (ackMap[d.id]?.hasAcknowledgedOpenAlert) {
            ackedDevices.push(d);
        } else {
            addAction(d, 'red', AlertIcon);
        }
    }
    for (const d of offlineAlertDevices) addAction(d, 'offline', WifiIcon);
    for (const d of amberAlertDevices) addAction(d, 'amber', AlertIcon);
    for (const d of ackedDevices) addAction(d, 'acknowledged', AlertIcon);

    // ─── Build grouped structure for ActionItems render ───────────────────
    // Group: siteName → list of ActionItems (site=null grouped as '')
    type SiteGroup = { siteName: string | null; items: ActionItem[] };

    const actionGroups: SiteGroup[] = (() => {
        if (sitesInScopeCount <= 2) {
            // flat list — no grouping headers
            return [{ siteName: null, items: nextActions }];
        }
        // 3+ sites — group by site
        const map = new Map<string, ActionItem[]>();
        for (const a of nextActions) {
            const key = a.siteName ?? '(No site)';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(a);
        }
        // Sort groups by worst severity inside them
        const severityRank = (s: ActionItem['status']) =>
            s === 'red' ? 0 : s === 'offline' ? 1 : s === 'amber' ? 2 : 3;
        const groups: SiteGroup[] = Array.from(map.entries()).map(([siteName, items]) => ({
            siteName,
            items,
        }));
        groups.sort((a, b) => {
            const aWorst = Math.min(...a.items.map(i => severityRank(i.status)));
            const bWorst = Math.min(...b.items.map(i => severityRank(i.status)));
            return aWorst - bWorst;
        });
        return groups;
    })();

    // ─── Apply System Filter ──────────────────────────────────────────────
    let displayedDevices = devices;
    if (systemFilter === 'attention') {
        displayedDevices = devices.filter(d =>
            d.current_status?.status === 'red' ||
            d.current_status?.status === 'amber' ||
            batteryAttentionDevices.some(b => b.device_id === d.id)
        );
    } else if (systemFilter === 'offline') {
        displayedDevices = devices.filter(d =>
            d.current_status?.status === 'offline'
        );
    }

    const environmentalDevices = displayedDevices.filter((d: any) => d.device_category !== 'operational');
    const operationalDevices = displayedDevices.filter((d: any) => d.device_category === 'operational');

    // Automatically select the first environmental device on load
    useEffect(() => {
        if (!selectedDeviceId && environmentalDevices.length > 0) {
            setSelectedDeviceId(environmentalDevices[0].id);
        }
    }, [environmentalDevices, selectedDeviceId]);


    // ─── Render ────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col w-full">

            {/* Filter Bar (Portaled to AppShell Topbar) */}
            {portalElement && createPortal(
                <div className="flex items-center gap-2 relative z-[100]">
                    {selectedSiteId && (
                        <span className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200 rounded-full border border-blue-100 dark:border-blue-500/20 hidden sm:inline-block">
                            Filtered
                        </span>
                    )}

                    <select
                        className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        value={selectedSiteId}
                        onChange={handleSiteChange}
                        disabled={loadingFilters}
                    >
                        <option value="">All Sites</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>

                    <select
                        className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
                        value={selectedAreaId}
                        onChange={handleAreaChange}
                        disabled={!selectedSiteId || loadingFilters}
                    >
                        <option value="">All Areas</option>
                        {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>

                    {(selectedSiteId || selectedAreaId || systemFilter) && (
                        <button
                            onClick={() => { clearFilters(); setSystemFilter(null); }}
                            className="text-sm px-3 py-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white font-medium"
                        >
                            Clear
                        </button>
                    )}
                </div>,
                portalElement
            )}

            {globalSeverity !== 'green' && globalBannerDevice && (
                <div className={`-mx-6 -mt-6 px-6 py-4 mb-6 border-b border-l-4 flex items-start md:items-center justify-between gap-4 flex-col md:flex-row ${globalSeverity === 'red' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 border-l-red-500 dark:border-red-900/30 dark:border-l-red-500' :
                    globalSeverity === 'offline' ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 border-l-slate-400 dark:border-slate-700 dark:border-l-slate-500' :
                        'bg-amber-50 dark:bg-amber-900/20 border-amber-200 border-l-amber-500 dark:border-amber-900/30 dark:border-l-amber-500'
                    }`}>
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-full shrink-0 ${globalSeverity === 'red' ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400' :
                            globalSeverity === 'offline' ? 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 shadow-sm' :
                                'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'
                            }`}>
                            {globalSeverity === 'offline' ? <WifiIcon className="w-8 h-8" /> : <AlertIcon className="w-8 h-8" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className={`font-semibold text-lg ${globalSeverity === 'red' ? 'text-red-900 dark:text-red-100' :
                                globalSeverity === 'offline' ? 'text-slate-900 dark:text-white' :
                                    'text-amber-900 dark:text-amber-100'
                                }`}>
                                {globalSeverity === 'red' ? 'Critical issue detected' : globalSeverity === 'offline' ? 'Connectivity issue detected' : 'Attention required'}
                            </h3>
                            <p className={`mt-0.5 text-base md:text-sm ${globalSeverity === 'red' ? 'text-red-800 dark:text-red-200' :
                                globalSeverity === 'offline' ? 'text-slate-700 dark:text-slate-300' :
                                    'text-amber-800 dark:text-amber-200'
                                }`}>
                                {bannerSubtitle}
                                {globalBannerCount > 1 && <span className="block font-semibold mt-1">+{globalBannerCount - 1} additional devices</span>}
                            </p>
                        </div>
                    </div>
                    <div>
                        <Link
                            to={globalSeverity === 'red' ? '/alerts' : `/device/${globalBannerDevice.id}`}
                            className={`px-4 py-2 font-semibold rounded-lg shadow-sm transition-colors text-sm inline-block w-full md:w-auto text-center ${globalSeverity === 'red' ? 'bg-red-600 text-white hover:bg-red-700' :
                                globalSeverity === 'offline' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white' :
                                    'bg-amber-600 text-white hover:bg-amber-700'
                                }`}
                        >
                            {globalBannerCount > 1 ? 'Review issues' : 'View device'}
                        </Link>
                    </div>
                </div>
            )}

            <div className="max-w-7xl mx-auto w-full">
                {/* Overview header */}
                <div className="flex items-end justify-end gap-4 mb-3 px-1">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        {data?.last_telemetry_at ? (
                            <span>
                                Last update: {new Intl.DateTimeFormat('en-GB', {
                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit'
                                }).format(new Date(data.last_telemetry_at))}
                            </span>
                        ) : (
                            <span>Last update: —</span>
                        )}
                    </div>
                </div>

                <OperationalStatusWidget devices={operationalDevices} />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Compliance Widget */}
                    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm p-6 flex flex-col h-full min-h-[220px]">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                    Compliance (beta)
                                </h3>
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Metric: {getMetricMeta(complianceMetric).label}
                                </div>
                            </div>
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg shrink-0">
                                <button
                                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-shadow transition-colors ${compliancePeriod === 'today' ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    onClick={() => setCompliancePeriod('today')}
                                >
                                    TODAY
                                </button>
                                <button
                                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-shadow transition-colors ${compliancePeriod === '7d' ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    onClick={() => setCompliancePeriod('7d')}
                                >
                                    LAST 7 DAYS
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col justify-center flex-1">
                            {complianceLoading ? (
                                <div className="space-y-4 max-w-xs">
                                    <div className="h-12 w-32 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg"></div>
                                    <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 animate-pulse rounded-full"></div>
                                    <div className="h-4 w-48 bg-slate-100 dark:bg-slate-800 animate-pulse rounded"></div>
                                </div>
                            ) : !compliance || !compliance.has_rules ? (
                                <div className="pb-4">
                                    <div className="text-slate-800 dark:text-slate-200 font-medium">No rules configured for this metric</div>
                                    <div className="text-slate-500 dark:text-slate-400 text-sm mt-1">Configure {getMetricMeta(complianceMetric).label} rules to enable compliance reporting.</div>
                                </div>
                            ) : compliance.compliance_percent === null ? (
                                <div className="pb-4">
                                    <div className="text-3xl font-bold text-slate-400">N/A</div>
                                    <div className="text-slate-500 dark:text-slate-400 text-sm mt-1">Not enough data for selected period.</div>
                                </div>
                            ) : (
                                <div>
                                    <div className={`text-6xl font-bold tabular-nums tracking-tight mb-4 ${compliance.compliance_percent >= 95 ? 'text-emerald-500' :
                                        compliance.compliance_percent >= 85 ? 'text-amber-500' :
                                            'text-red-500'
                                        }`}>
                                        {compliance.compliance_percent}%
                                    </div>
                                    <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shrink-0 mb-3">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${compliance.compliance_percent >= 95 ? 'bg-emerald-500' :
                                                compliance.compliance_percent >= 85 ? 'bg-amber-500' :
                                                    'bg-red-500'
                                                }`}
                                            style={{ width: `${compliance.compliance_percent}%` }}
                                        />
                                    </div>
                                    <div className="text-sm font-medium text-slate-500 dark:text-slate-400 flex justify-between">
                                        <span>Within threshold monitoring time</span>
                                        <span className="text-slate-400">{compliance.contributing_devices} tracked devices</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Actionable To-Do Panel */}
                    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm flex flex-col h-full min-h-[220px]">
                        <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Actionable Items</h3>
                            {nextActions.length > 0 && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    {nextActions.length}
                                </span>
                            )}
                        </div>
                        {nextActions.length > 0 ? (
                            <div className="overflow-y-auto p-2 space-y-1 flex-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                                {actionGroups.map((group, gi) => (
                                    <div key={group.siteName ?? `group-${gi}`}>
                                        {/* Site header — only rendered when 3+ sites in scope */}
                                        {sitesInScopeCount >= 3 && group.siteName && (
                                            <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                                {group.siteName}
                                            </div>
                                        )}
                                        {group.items.map(action => {
                                            // Build display label based on site-awareness mode
                                            const label = sitesInScopeCount === 1 || sitesInScopeCount >= 3
                                                ? `${action.deviceName} — ${action.issue}`
                                                : `${action.siteName ?? ''} — ${action.deviceName} — ${action.issue}`;
                                            return (
                                                <Link
                                                    key={action.id}
                                                    to={action.link || '#'}
                                                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group text-left"
                                                >
                                                    <div className={`mt-0.5 p-1.5 rounded-md shrink-0 ${action.status === 'offline' ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' :
                                                        action.status === 'acknowledged' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' :
                                                            action.status === 'red' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' :
                                                                'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                                                        }`}>
                                                        <action.icon className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex-1 min-w-0 py-0.5">
                                                        <div className="text-sm font-medium text-slate-900 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                                                            {label}
                                                        </div>
                                                    </div>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                ))}
                                {nextActions.length === 5 && (
                                    <div className="pt-2 pb-1">
                                        <Link to="/devices" className="block w-full text-center py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                            View all devices →
                                        </Link>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 p-8 text-center flex flex-col items-center justify-center text-slate-500">
                                <svg className="w-8 h-8 text-emerald-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">All clear!</span>
                                <span className="text-xs mt-1">No alerts or offline devices requiring attention.</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Summary Tiles */}
                <div className="mb-8 grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <Stat label="Total" value={data?.total_devices} />
                    <Stat label="Red" value={data?.red} pill="bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/25" />
                    <Stat label="Amber" value={data?.amber} pill="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/25" />
                    <Stat label="Green" value={data?.green} pill="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/25" />
                    <Stat label="Offline" value={data?.offline} pill="bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/15 dark:text-slate-200 dark:border-slate-500/25" />
                </div>



                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    {/* Left: Device List */}
                    <div className="lg:col-span-5 xl:col-span-4 max-w-full">
                        {error && (
                            <div className="mb-4 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-200">
                                <div className="font-semibold">Fetch failed</div>
                                <div className="mt-1 break-words">{error}</div>
                            </div>
                        )}

                        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm">
                            <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[800px] overflow-y-auto">
                                {environmentalDevices.map(d => {
                                    const ack = ackMap[d.id];
                                    return (
                                        <div
                                            key={d.id}
                                            onClick={() => setSelectedDeviceId(d.id)}
                                            className={`p-4 transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 ${selectedDeviceId === d.id
                                                ? 'bg-blue-50/50 dark:bg-blue-500/5 border-l-4 border-l-blue-500'
                                                : 'border-l-4 border-l-transparent'
                                                }`}
                                        >
                                            {/* Device name row + status + ack badge */}
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="font-medium text-slate-900 dark:text-slate-200 truncate">{d.name}</span>
                                                    {/* Acknowledged badge — only for non-offline devices with an open acked alert */}
                                                    {ack?.hasAcknowledgedOpenAlert && d.current_status?.status !== 'offline' && (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20 shrink-0">
                                                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            Ack'd
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Device status pill — stays RED even when acknowledged */}
                                                <StatusBadge status={d.current_status?.status} />
                                            </div>

                                            {/* Location */}
                                            <div className="text-xs text-slate-400 mb-2 truncate">
                                                {formatDeviceLocation(d)}
                                            </div>

                                            {/* Metrics strip — data-driven from available_metrics + latest telemetry */}
                                            <div className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2.5 flex-wrap">
                                                    {(() => {
                                                        const payloadValues = (d as any).metric_values || {};

                                                        // Fallback structure for preferences if displayLayout not imported yet (will import next)
                                                        const prefsRaw = localStorage.getItem(`device_prefs_${d.id}`);
                                                        const prefs = prefsRaw ? JSON.parse(prefsRaw) : { pinned_metrics: [], show_battery_on_card: true };

                                                        const validMetrics = (d.available_metrics || []).filter(m => m !== 'battery' && payloadValues[m] != null);

                                                        let visibleMetrics = validMetrics;

                                                        if (prefs.pinned_metrics && prefs.pinned_metrics.length > 0) {
                                                            const validPinned = prefs.pinned_metrics.filter((m: string) => validMetrics.includes(m));
                                                            if (validPinned.length > 0) visibleMetrics = validPinned.slice(0, 2);
                                                        } else if (validMetrics.length > 2) {
                                                            const PRIORITY = ['temperature', 'co2', 'humidity', 'barometric_pressure'];
                                                            visibleMetrics = [...validMetrics].sort((a, b) => {
                                                                const idxA = PRIORITY.indexOf(a);
                                                                const idxB = PRIORITY.indexOf(b);
                                                                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                                                                if (idxA !== -1) return -1;
                                                                if (idxB !== -1) return 1;
                                                                return a.localeCompare(b);
                                                            }).slice(0, 2);
                                                        }

                                                        const hasBattery = d.metrics?.battery_percent != null && prefs.show_battery_on_card !== false;
                                                        const anyMetric = visibleMetrics.length > 0 || hasBattery;

                                                        return (
                                                            <>
                                                                {visibleMetrics.map(metric => {
                                                                    const meta = getMetricMeta(metric);
                                                                    return (
                                                                        <MetricChip
                                                                            key={metric}
                                                                            parameter={metric}
                                                                            icon={metricConfig[metric as MetricKey]?.icon}
                                                                            value={payloadValues[metric]}
                                                                            unit={meta.unitSuffix}
                                                                            title={meta.label}
                                                                        />
                                                                    );
                                                                })}
                                                                {!anyMetric && <span className="text-slate-400">—</span>}
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    {(() => {
                                                        const prefsRaw = localStorage.getItem(`device_prefs_${d.id}`);
                                                        const showBattery = prefsRaw ? JSON.parse(prefsRaw).show_battery_on_card !== false : true;
                                                        const hasBattery = d.metrics?.battery_percent != null && showBattery;
                                                        return hasBattery ? (
                                                            <div className="flex items-center gap-1 text-xs text-slate-400" title={`Battery raw: ${d.metrics.battery_raw ?? '?'}`}>
                                                                <MetricChip
                                                                    parameter="battery"
                                                                    icon={metricConfig.battery.icon}
                                                                    value={d.metrics.battery_percent!}
                                                                    unit=""
                                                                    className="gap-0.5"
                                                                />
                                                            </div>
                                                        ) : null;
                                                    })()}
                                                    <div className="text-xs text-slate-400">
                                                        {formatLastSeen(d.latest_telemetry?.occurred_at)}
                                                    </div>
                                                    <Link
                                                        to={`/device/${d.id}`}
                                                        onClick={e => e.stopPropagation()}
                                                        title="Full Details"
                                                        className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                        </svg>
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {environmentalDevices.length === 0 && !error && (
                                    <div className="p-8 text-center text-slate-500 italic">No environmental devices found.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Chart Panel + ack evidence */}
                    <div className="lg:col-span-7 xl:col-span-8">
                        <div className="lg:sticky lg:top-24 space-y-4">
                            {selectedDeviceId ? (
                                <>


                                    {(() => {
                                        const selectedDevice = devices.find(d => d.id === selectedDeviceId);
                                        return (
                                            <TemperatureHistoryCard
                                                key={selectedDeviceId}
                                                deviceId={selectedDeviceId}
                                                availableMetrics={selectedDevice?.available_metrics}
                                            />
                                        );
                                    })()}
                                </>
                            ) : (
                                <div className="h-64 flex items-center justify-center text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                                    {devices.length > 0 ? 'Select a device to view history' : 'No devices matching filter'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Maintenance Section */}
                <div className="mt-12 mb-8">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Maintenance</h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Battery Attention (Left) */}
                        <div className="overflow-hidden rounded-xl border border-amber-200 dark:border-amber-500/30 bg-white dark:bg-slate-900 shadow-sm flex flex-col h-full">
                            <div className="bg-amber-50 dark:bg-amber-500/10 px-4 py-3 border-b border-amber-100 dark:border-amber-500/20 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                                    <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <h3 className="font-bold">Battery Attention</h3>
                                </div>
                                {batteryAttentionDevices.length > 0 && !batteryLoading && !batteryError && (
                                    <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded-full">
                                        {batteryAttentionDevices.length}
                                    </span>
                                )}
                            </div>

                            {batteryError ? (
                                <div className="p-6 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 h-full">
                                    <svg className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>Battery widget unavailable</span>
                                </div>
                            ) : batteryLoading ? (
                                <div className="p-6 flex items-center justify-center text-slate-400 h-full">Loading...</div>
                            ) : batteryAttentionDevices.length === 0 ? (
                                <div className="p-6 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 h-full">
                                    <span>No devices need battery replacement today</span>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[300px] overflow-y-auto">
                                    {batteryAttentionDevices.map(d => (
                                        <Link
                                            key={d.device_id}
                                            to={`/device/${d.device_id}`}
                                            className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                                        >
                                            <div className="flex flex-col min-w-0">
                                                <span className="font-medium text-slate-900 dark:text-white truncate">{d.name || d.external_id}</span>
                                                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                                                    <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                                                        <MetricChip parameter="battery" icon={metricConfig.battery.icon} value={d.battery_percent ?? 0} unit={metricConfig.battery.unit} />
                                                    </span>
                                                    <span>•</span>
                                                    <span>{d.battery_updated_at ? new Date(d.battery_updated_at).toLocaleDateString() : '—'}</span>
                                                </div>
                                            </div>
                                            <StatusBadge status={d.severity} />
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Hub Status (Right) */}
                        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm flex flex-col h-full">
                            <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-3 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-slate-900 dark:text-white">
                                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                                    </svg>
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white">Hub Status</h3>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">Heartbeat & connectivity monitoring</p>
                                    </div>
                                </div>
                            </div>

                            {hubsError ? (
                                <div className="p-6 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 h-full">
                                    <svg className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>Hub widget unavailable</span>
                                </div>
                            ) : hubsLoading ? (
                                <div className="p-6 flex items-center justify-center text-slate-400 h-full">Loading...</div>
                            ) : hubs.length === 0 ? (
                                <div className="p-6 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 h-full text-center">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">No hubs registered yet</span>
                                    <span className="text-xs mt-1">Register a hub to enable heartbeat monitoring.</span>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[300px] overflow-y-auto">
                                    {hubs.map(h => {
                                        const isOnline = h.status === 'online';
                                        const isOffline = h.status === 'offline';
                                        const badgeClasses = isOnline
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/20'
                                            : isOffline
                                                ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/20'
                                                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/20';

                                        const hbDateStr = h.last_heartbeat_at
                                            ? new Intl.DateTimeFormat('en-GB', {
                                                day: '2-digit', month: '2-digit', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            }).format(new Date(h.last_heartbeat_at))
                                            : 'Never';

                                        return (
                                            <div key={h.serial} className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group relative">
                                                <div className="flex flex-col min-w-0 flex-1">
                                                    {hubEditId === h.id ? (
                                                        /* Inline edit mode */
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                autoFocus
                                                                className="flex-1 min-w-0 px-2 py-1 text-sm rounded border border-blue-300 dark:border-blue-500/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                                                value={hubEditName}
                                                                onChange={e => setHubEditName(e.target.value)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') handleHubSaveName(h);
                                                                    if (e.key === 'Escape') setHubEditId(null);
                                                                }}
                                                                placeholder="Hub name"
                                                            />
                                                            <button
                                                                onClick={() => handleHubSaveName(h)}
                                                                disabled={hubActionLoading === h.id || !hubEditName.trim()}
                                                                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 shrink-0"
                                                            >
                                                                {hubActionLoading === h.id ? '…' : 'Save'}
                                                            </button>
                                                            <button
                                                                onClick={() => setHubEditId(null)}
                                                                className="text-xs px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 shrink-0"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-slate-900 dark:text-white truncate">
                                                                {h.friendly_name || h.serial}
                                                            </span>
                                                            {!h.friendly_name && (
                                                                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded border border-slate-200 dark:border-white/10">SN</span>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="text-xs text-slate-500 mt-0.5">
                                                        Last heartbeat: {hbDateStr}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${badgeClasses}`}>
                                                        {h.status}
                                                    </span>
                                                    {/* Actions menu */}
                                                    {hubEditId !== h.id && (
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setHubMenuOpen(hubMenuOpen === h.id ? null : h.id)}
                                                                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                                                title="Hub actions"
                                                            >
                                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                                    <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
                                                                </svg>
                                                            </button>
                                                            {hubMenuOpen === h.id && (
                                                                <div
                                                                    className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg shadow-lg z-50 py-1 text-sm"
                                                                    onMouseLeave={() => setHubMenuOpen(null)}
                                                                >
                                                                    <button
                                                                        onClick={() => {
                                                                            setHubMenuOpen(null);
                                                                            setHubEditId(h.id);
                                                                            setHubEditName(h.friendly_name || '');
                                                                        }}
                                                                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                                                                    >
                                                                        Edit name
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setHubMenuOpen(null);
                                                                            handleHubDelete(h);
                                                                        }}
                                                                        disabled={hubActionLoading === h.id}
                                                                        className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400 disabled:opacity-50"
                                                                    >
                                                                        {hubActionLoading === h.id ? 'Removing…' : 'Remove'}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
    let styles = 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/20';
    if (status === 'red') styles = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/20';
    if (status === 'amber') styles = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/20';
    if (status === 'green') styles = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/20';
    if (status === 'offline') styles = 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600/30';
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles} capitalize`}>
            {status || 'Unknown'}
        </span>
    );
}

function Stat({ label, value, pill }: { label: string; value?: number; pill?: string }) {
    return (
        <div className={`rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-4 shadow-sm ${pill ?? ''}`}>
            <div className="text-xs opacity-70 uppercase tracking-wider font-semibold">{label}</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">
                {typeof value === 'number' ? value : '—'}
            </div>
        </div>
    );
}

function formatLastSeen(dateStr: string | null | undefined) {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();
    return isToday
        ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
