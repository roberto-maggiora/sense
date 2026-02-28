import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import TemperatureHistoryCard from "./TemperatureHistoryCard";
import {
    type Site,
    type Area,
    type DashboardSummary,
    listSites,
    listAreas,
    getDashboardSummary,
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
    current_status: { status: string } | null;
    latest_telemetry: { occurred_at: string } | null;
    metrics: {
        temperature: number | null;
        humidity: number | null;
        battery_percent: number | null;
        battery_raw: number | null;
        battery_updated_at: string | null;
    };
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
    icon: React.ComponentType;
    value: number;
    unit: string;
    title?: string;
    className?: string;
};

function MetricChip({ icon: Icon, value, unit, title, className = '' }: MetricChipProps) {
    return (
        <span
            className={`inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 tabular-nums ${className}`}
            title={title}
        >
            <Icon />
            {value}{unit}
        </span>
    );
}

// ─── Metric config map (extend here when adding new metrics) ─────────────────

type MetricKey = 'temperature' | 'humidity' | 'battery';

const metricConfig: Record<MetricKey, { icon: React.ComponentType; unit: string }> = {
    temperature: { icon: ThermoIcon, unit: '°C' },
    humidity: { icon: DropletIcon, unit: '%' },
    battery: { icon: BatteryIcon, unit: '%' },
};

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
        fetchAckMap();
        fetchHubs(background);
    }, [fetchData, fetchAckMap, fetchHubs]);

    // Initial load and auto-refresh intervals
    useEffect(() => {
        doAllRefreshes(false);
        fetchBatteryAttention(false);

        const dataInterval = setInterval(() => {
            doAllRefreshes(true);
        }, 60000);

        const batteryInterval = setInterval(() => {
            fetchBatteryAttention(true);
        }, 300000);

        return () => {
            clearInterval(dataInterval);
            clearInterval(batteryInterval);
        };
    }, [doAllRefreshes, fetchBatteryAttention]);

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
    const selectedAck = selectedDeviceId ? (ackMap[selectedDeviceId] ?? null) : null;

    // ─── Deriving Banner State & Actions ──────────────────────────────────
    let bannerType: 'green' | 'amber' | 'red' | 'grey' = 'green';
    let bannerText = 'All good — no issues detected.';
    let partialData = false;

    const redDevices = devices.filter(d => d.current_status?.status === 'red').length;
    const amberDevices = devices.filter(d => d.current_status?.status === 'amber').length;
    const offlineDevices = devices.filter(d => d.current_status?.status === 'offline').length;
    const offlineHubs = hubs.filter(h => h.status !== 'online').length;
    const redBatteries = batteryAttentionDevices.filter(b => b.severity === 'red');
    const amberBatteries = batteryAttentionDevices.filter(b => b.severity === 'amber');

    const criticalItemsCount = redDevices + redBatteries.length;
    const attentionItemsCount = amberDevices + amberBatteries.length;
    const offlineItemsCount = offlineDevices + offlineHubs;

    if (error || batteryError || hubsError) {
        partialData = true;
    }

    if (criticalItemsCount > 0) {
        bannerType = 'red';
        bannerText = `Action required — ${criticalItemsCount} critical issue${criticalItemsCount > 1 ? 's' : ''}.`;
    } else if (attentionItemsCount > 0) {
        bannerType = 'amber';
        bannerText = `Some attention needed — ${attentionItemsCount} item${attentionItemsCount > 1 ? 's' : ''} need action.`;
    } else if (offlineItemsCount > 0) {
        bannerType = 'grey';
        bannerText = `Limited visibility — ${offlineItemsCount} device${offlineItemsCount > 1 ? 's' : ''} offline or not reporting.`;
    }

    // ─── Next Actions ─────────────────────────────────────────────────────
    const nextActions = [];

    // 1. Critical batteries
    for (const b of redBatteries) {
        if (nextActions.length >= 3) break;
        nextActions.push({
            id: 'batt-' + b.device_id,
            label: `Replace battery on ${b.name} (${Math.round(b.battery_percent ?? 0)}%)`,
            link: `/device/${b.device_id}`,
            icon: BatteryIcon
        });
    }

    // 2. Hubs missed heartbeat
    for (const h of hubs.filter(h => h.status !== 'online')) {
        if (nextActions.length >= 3) break;
        nextActions.push({
            id: 'hub-' + h.serial,
            label: `Hub ${h.friendly_name || h.serial} offline (${h.minutes_since_heartbeat ?? '> 120'} mins)`,
            icon: WifiIcon,
        });
    }

    // 3. Active Alerts
    const alertDevices = devices.filter(d => d.current_status?.status === 'red' || d.current_status?.status === 'amber');
    for (const d of alertDevices) {
        if (nextActions.length >= 3) break;
        nextActions.push({
            id: 'alert-' + d.id,
            label: `Review alert on ${d.name}`,
            link: `/alerts`,
            icon: AlertIcon
        });
    }

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


    // ─── Render ────────────────────────────────────────────────────────────
    return (
        <div className="max-w-7xl mx-auto">

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

            {/* Overview header */}
            <div className="flex items-end justify-between gap-4 mb-3 px-1">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Overview</h2>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                    {data?.last_telemetry_at ? (
                        <span>
                            Last telemetry: {new Intl.DateTimeFormat('en-GB', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                            }).format(new Date(data.last_telemetry_at))}
                        </span>
                    ) : (
                        <span>Last telemetry: —</span>
                    )}
                </div>
            </div>

            {/* Status Banner + Next Actions row */}
            <div className="mb-6 flex flex-col lg:flex-row gap-4">
                <div
                    onClick={() => {
                        if (bannerType === 'red' || bannerType === 'amber') {
                            setSystemFilter(systemFilter === 'attention' ? null : 'attention');
                        } else if (bannerType === 'grey') {
                            setSystemFilter(systemFilter === 'offline' ? null : 'offline');
                        } else {
                            setSystemFilter(null);
                        }
                    }}
                    className={`flex-1 rounded-xl p-4 border flex items-center justify-between cursor-pointer transition-colors ${systemFilter ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-slate-900 ' : ''
                        }${bannerType === 'red' ? 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20 text-red-800 dark:text-red-200' :
                            bannerType === 'amber' ? 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 text-amber-800 dark:text-amber-200' :
                                bannerType === 'grey' ? 'bg-slate-100 border-slate-200 dark:bg-slate-500/10 dark:border-slate-500/20 text-slate-800 dark:text-slate-200' :
                                    'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                        }`}
                >
                    <div className="flex flex-col">
                        <span className="font-semibold text-lg">{bannerText}</span>
                        {partialData && <span className="text-xs opacity-80 mt-1">Partial data — some widgets unavailable</span>}
                    </div>
                    {(bannerType !== 'green') && (
                        <div className="text-sm font-medium underline decoration-transparent hover:decoration-current transition-all">
                            {systemFilter ? 'Clear filter' : 'Filter list'}
                        </div>
                    )}
                </div>

                {nextActions.length > 0 && (
                    <div className="lg:w-96 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Next actions</h3>
                        <div className="space-y-2">
                            {nextActions.map(action => {
                                const Content = (
                                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
                                        <action.icon className="w-4 h-4 shrink-0 opacity-70" />
                                        <span className="truncate">{action.label}</span>
                                    </div>
                                );
                                return action.link ? (
                                    <Link key={action.id} to={action.link} className="block">{Content}</Link>
                                ) : (
                                    <div key={action.id}>{Content}</div>
                                );
                            })}
                        </div>
                    </div>
                )}
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
                <div className="lg:col-span-5 xl:col-span-4">
                    {error && (
                        <div className="mb-4 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-200">
                            <div className="font-semibold">Fetch failed</div>
                            <div className="mt-1 break-words">{error}</div>
                        </div>
                    )}

                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm">
                        <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[800px] overflow-y-auto">
                            {displayedDevices.map(d => {
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

                                        {/* Metrics row — driven by metricConfig (future-proof) */}
                                        <div className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                {d.metrics?.temperature != null && (
                                                    <MetricChip
                                                        icon={metricConfig.temperature.icon}
                                                        value={d.metrics.temperature}
                                                        unit={metricConfig.temperature.unit}
                                                    />
                                                )}
                                                {d.metrics?.humidity != null && d.metrics?.battery_percent == null && (
                                                    <MetricChip
                                                        icon={metricConfig.humidity.icon}
                                                        value={d.metrics.humidity}
                                                        unit={metricConfig.humidity.unit}
                                                    />
                                                )}
                                                {d.metrics?.battery_percent != null && (
                                                    <MetricChip
                                                        icon={metricConfig.battery.icon}
                                                        value={d.metrics.battery_percent}
                                                        unit={metricConfig.battery.unit}
                                                        title={`Battery raw: ${d.metrics.battery_raw ?? '?'}`}
                                                    />
                                                )}
                                                {d.metrics?.temperature == null &&
                                                    d.metrics?.humidity == null &&
                                                    d.metrics?.battery_percent == null && (
                                                        <span className="text-slate-400">—</span>
                                                    )}
                                            </div>
                                            <div className="flex items-center gap-3">
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
                            {displayedDevices.length === 0 && !error && (
                                <div className="p-8 text-center text-slate-500 italic">No devices found.</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Chart Panel + ack evidence */}
                <div className="lg:col-span-7 xl:col-span-8">
                    <div className="lg:sticky lg:top-24 space-y-4">
                        {selectedDeviceId ? (
                            <>
                                {/* Acknowledged evidence banner for selected device */}
                                {selectedAck?.hasAcknowledgedOpenAlert && (
                                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-sm text-emerald-700 dark:text-emerald-300">
                                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>
                                            Alert acknowledged
                                            {selectedAck.latestAcknowledgedAt && (
                                                <> at <strong>{new Date(selectedAck.latestAcknowledgedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></>
                                            )}
                                            {selectedAck.acknowledgedBy && (
                                                <> by <strong>{displayName(selectedAck.acknowledgedBy)}</strong></>
                                            )}
                                            {' '}— device status will stay RED until the condition clears.
                                        </span>
                                    </div>
                                )}

                                <TemperatureHistoryCard deviceId={selectedDeviceId} />
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
                                                    <MetricChip icon={metricConfig.battery.icon} value={d.battery_percent ?? 0} unit={metricConfig.battery.unit} />
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
