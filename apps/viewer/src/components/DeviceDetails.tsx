import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import TemperatureHistoryCard from "./TemperatureHistoryCard";
import { updateDevice, listSites, type Site, getDashboardDevices, fetchClient, listDeviceRules, updateDeviceRule, deleteDeviceRule, type DeviceAlarmRule } from "../lib/api";
import { useAuth } from "../lib/auth";
import AddRuleModal from "./AddRuleModal";
import { AlertsTable, type ApiAlert, formatDateTime } from "../pages/Alerts";
import { AlertTimelineDrawer } from "./AlertTimelineDrawer";

type Device = {
    id: string;
    name: string;
    external_id?: string;
    source?: string;
    site_id?: string | null;
    area_id?: string | null;
    current_status: { status: string } | null;
    latest_telemetry: { occurred_at: string } | null;
    metrics: { temperature?: number | null; humidity?: number | null; battery_percent?: number | null };
};

function LocationAssignment({ device, onAssign }: { device: Device | null, onAssign: () => void }) {
    const [sites, setSites] = useState<Site[]>([]);
    // areas derived from selected site (if loaded) or separate fetch?
    // GET /sites now includes areas.
    const [selectedSiteId, setSelectedSiteId] = useState<string>("");
    const [selectedAreaId, setSelectedAreaId] = useState<string>("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (device) {
            setSelectedSiteId(device.site_id || "");
            setSelectedAreaId(device.area_id || "");
        }
        // Load sites (which now include areas)
        listSites().then(setSites).catch(console.error);
    }, [device]);

    // Derived areas from the site list to avoid extra fetch
    const availableAreas = sites.find(s => s.id === selectedSiteId)?.areas || [];

    const handleSave = async () => {
        if (!device) return;
        setLoading(true);
        try {
            await updateDevice(device.id, {
                site_id: selectedSiteId || null,
                area_id: selectedAreaId || null
            });
            onAssign();
        } catch (e) {
            alert("Failed to assign location");
        } finally {
            setLoading(false);
        }
    };

    if (!device) return null;

    return (
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 border border-slate-200 dark:border-white/5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Location</h3>
            <div className="space-y-3">
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Site</label>
                    <select
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-white/20 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        value={selectedSiteId}
                        onChange={e => {
                            setSelectedSiteId(e.target.value);
                            setSelectedAreaId(""); // Reset area when site changes
                        }}
                    >
                        <option value="">Unassigned</option>
                        {sites.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Area</label>
                    <select
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-white/20 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white disabled:opacity-50"
                        value={selectedAreaId}
                        onChange={e => setSelectedAreaId(e.target.value)}
                        disabled={!selectedSiteId}
                    >
                        <option value="">Unassigned</option>
                        {availableAreas.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-500 disabled:opacity-50"
                >
                    {loading ? "Saving..." : "Save Location"}
                </button>
            </div>
        </div>
    );
}

export default function DeviceDetails() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const [device, setDevice] = useState<Device | null>(null);
    const [alerts, setAlerts] = useState<ApiAlert[]>([]);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [rules, setRules] = useState<DeviceAlarmRule[]>([]);
    const [isAddRuleModalOpen, setIsAddRuleModalOpen] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [timelineAlertId, setTimelineAlertId] = useState<string | null>(null);


    // Fetch Device Details
    useEffect(() => {
        const fetchDevice = async () => {
            try {
                // Fetch list and find (simple v0 approach)
                const json = await getDashboardDevices({ limit: 100 });
                const found = json.data.find((d: Device) => d.id === id);
                setDevice(found || null);
            } catch (e: any) {
                setError(e.message);
            }
        };
        fetchDevice();
    }, [id]);

    // Fetch Alerts
    const fetchAlerts = async (cursor?: string) => {
        try {
            let url = `/api/v1/alerts?device_id=${id}&include_closed=1&limit=50`;
            if (cursor) url += `&cursor=${cursor}`;

            const json = await fetchClient(url);
            const rawList = Array.isArray(json) ? json : (json.data ?? []);
            const next = Array.isArray(json) ? null : (json.next_cursor ?? null);

            if (cursor) {
                setAlerts(prev => [...prev, ...rawList]);
            } else {
                setAlerts(rawList);
            }
            setNextCursor(next);
        } catch (e: any) {
            console.error(e);
            // Don't block UI for alerts error, just log
        } finally {
            setLoading(false);
        }
    };

    const fetchRules = async () => {
        if (!id) return;
        try {
            const data = await listDeviceRules(id);
            setRules(data);
        } catch (e) {
            console.error("Failed to fetch rules", e);
        }
    };

    useEffect(() => {
        fetchAlerts();
        fetchRules();
    }, [id]);

    const handleAcknowledge = async (alertId: string) => {
        const original = [...alerts];
        setAlerts(prev => prev.map(a => a.id === alertId
            ? { ...a, status: 'acknowledged', acknowledged_at: new Date().toISOString() } as ApiAlert
            : a
        ));
        setActionLoading(alertId);
        try {
            await fetchClient(`/api/v1/alerts/${alertId}/acknowledge`, { method: "POST", body: '{}' });
        } catch (e) {
            console.error("Ack failed", e);
            setAlerts(original);
        } finally {
            setActionLoading(null);
        }
    };

    const handleResolve = async (alertId: string) => {
        const original = [...alerts];
        setAlerts(prev => prev.map(a => a.id === alertId
            ? { ...a, status: 'resolved', resolved_at: new Date().toISOString() } as ApiAlert
            : a
        ));
        setActionLoading(alertId);
        try {
            await fetchClient(`/api/v1/alerts/${alertId}/resolve`, { method: 'POST', body: '{}' });
        } catch {
            setAlerts(original);
        } finally {
            setActionLoading(null);
        }
    };

    const openAlerts = alerts.filter(a => !['resolved', 'auto_resolved'].includes(a.status));
    const historyAlerts = alerts.filter(a => ['resolved', 'auto_resolved'].includes(a.status));

    const toggleRule = async (ruleId: string, enabled: boolean) => {
        try {
            const updated = await updateDeviceRule(ruleId, { enabled });
            setRules(prev => prev.map(r => r.id === ruleId ? updated : r));
        } catch (e) {
            console.error("Toggle rule failed", e);
        }
    };

    const deleteRule = async (ruleId: string) => {
        if (!confirm("Are you sure you want to delete this rule?")) return;
        try {
            await deleteDeviceRule(ruleId);
            setRules(prev => prev.filter(r => r.id !== ruleId));
        } catch (e: any) {
            console.error("Delete rule failed", e);
            alert(e?.message || "Failed to delete rule");
        }
    };

    const canManageRules = user?.role === 'SUPER_ADMIN'
        || user?.role === 'CLIENT_ADMIN'
        || (user?.role === 'SITE_ADMIN' && device?.site_id === user.site_id);

    if (!device && loading) return <div className="text-slate-400">Loading...</div>;
    if (error) return <div className="text-red-400">Error: {error}</div>;
    if (!device && !loading) return <div className="text-red-400">Device not found</div>;

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-6">
                <Link to="/" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">← Back to Dashboard</Link>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-6 mb-8">
                <div className="min-w-0 mr-4">
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 truncate">{device?.name}</h1>
                    <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">Sensor ID: <span className="font-mono">{device?.external_id || '—'}</span></div>
                </div>
                <div className="flex items-center gap-6 whitespace-nowrap shrink-0">
                    <StatusBadge status={device?.current_status?.status} />

                    <div className="flex items-center gap-2 shrink-0 text-sm text-slate-500 dark:text-slate-400">
                        <span>Last seen: {device?.latest_telemetry?.occurred_at ? formatDateTime(device.latest_telemetry.occurred_at) : 'Never'}</span>
                    </div>

                    {(device?.metrics?.battery_percent !== undefined) && (
                        <div className="flex items-center gap-2 shrink-0 text-sm text-slate-500 dark:text-slate-400">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2z M18 10v4" />
                            </svg>
                            <span>{device.metrics.battery_percent != null ? `${device.metrics.battery_percent}%` : '—'}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-3 shrink-0 border-l border-slate-200 dark:border-white/10 pl-6">
                        <div className="text-xl font-semibold text-slate-900 dark:text-slate-200">
                            {device?.metrics?.temperature != null ? `${device.metrics.temperature}°C` : '—'}
                        </div>
                        {device?.source !== 'hawk' && (
                            <div className="text-sm text-slate-500 dark:text-slate-400">
                                {device?.metrics?.humidity != null ? `${device.metrics.humidity}%` : '—'}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* Main Column */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Telemetry Chart Card */}
                    {id && <TemperatureHistoryCard deviceId={id} />}

                </div>

                {/* Sidebar / Extra Info */}
                <div className="space-y-6">
                    <LocationAssignment device={device} onAssign={() => window.location.reload()} />

                    {/* Alert Rules Section */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 border border-slate-200 dark:border-white/5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Alert Rules</h3>
                            {canManageRules && (
                                <button
                                    onClick={() => setIsAddRuleModalOpen(true)}
                                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                >
                                    + Add Rule
                                </button>
                            )}
                        </div>

                        {rules.length === 0 ? (
                            <div className="text-xs text-slate-500 italic">No alert rules configured.</div>
                        ) : (
                            <div className="space-y-3">
                                {rules.map(rule => (
                                    <div key={rule.id} className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-white/10 flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="text-xs font-semibold text-slate-900 dark:text-white capitalize">
                                                    {rule.metric} {rule.operator === 'gt' ? '>' : '<'} {rule.threshold}
                                                </div>
                                                <div className="text-[10px] text-slate-500 mt-0.5">
                                                    Delay: {Math.floor(rule.duration_seconds / 60)}m |
                                                    <span className={`ml-1 font-medium ${rule.severity === 'red' ? 'text-red-600' : 'text-amber-600'}`}>
                                                        {rule.severity.toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>
                                            {canManageRules && (
                                                <div className="flex flex-col items-end gap-2">
                                                    <label className="flex items-center cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={rule.enabled}
                                                            onChange={e => toggleRule(rule.id, e.target.checked)}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                                                    </label>
                                                    <button
                                                        onClick={() => deleteRule(rule.id)}
                                                        className="text-[10px] text-red-500 hover:text-red-700 font-medium"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                            {!canManageRules && (
                                                <div className="text-xs text-slate-500">
                                                    {rule.enabled ? 'Active' : 'Disabled'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Alerts */}
            <section className="space-y-8 w-full">
                <div>
                    <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">Open alerts ({openAlerts.length})</h2>
                    <AlertsTable
                        alerts={openAlerts}
                        loading={loading}
                        filter="all"
                        search=""
                        actionLoading={actionLoading}
                        onAcknowledge={handleAcknowledge}
                        onResolve={handleResolve}
                        onViewTimeline={setTimelineAlertId}
                    />
                    {openAlerts.length === 0 && !loading && (
                        <div className="p-8 text-center text-slate-500 italic border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900">
                            No open alerts
                        </div>
                    )}
                </div>

                <div>
                    <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">Resolved alerts ({historyAlerts.length})</h2>
                    <AlertsTable
                        alerts={historyAlerts}
                        loading={loading}
                        filter="all"
                        search=""
                        actionLoading={actionLoading}
                        onAcknowledge={handleAcknowledge}
                        onResolve={handleResolve}
                        onViewTimeline={setTimelineAlertId}
                    />
                    {historyAlerts.length === 0 && !loading && (
                        <div className="p-8 text-center text-slate-500 italic border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-slate-900">
                            No resolved alerts
                        </div>
                    )}
                </div>
                {nextCursor && (
                    <div className="mt-6 text-center">
                        <button
                            onClick={() => fetchAlerts(nextCursor)}
                            disabled={loading}
                            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm rounded shadow-sm transition-colors"
                        >
                            {loading ? "Loading..." : "Load More"}
                        </button>
                    </div>
                )}
            </section>

            {isAddRuleModalOpen && device && (
                <AddRuleModal
                    deviceId={device.id}
                    onClose={() => setIsAddRuleModalOpen(false)}
                    onCreated={(rule) => {
                        setRules(prev => [rule, ...prev]);
                    }}
                />
            )}

            {timelineAlertId && (
                <AlertTimelineDrawer
                    alertId={timelineAlertId}
                    onClose={() => setTimelineAlertId(null)}
                />
            )}
        </div>
    );
}

function StatusBadge({ status }: { status?: string }) {
    let styles = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-500/20";
    if (status === 'red') styles = "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/20";
    if (status === 'amber') styles = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/20";
    if (status === 'green') styles = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/20";
    if (status === 'offline') styles = "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600/30";

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles} capitalize`}>
            {status || 'Unknown'}
        </span>
    );
}
