import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import TemperatureHistoryCard from "./TemperatureHistoryCard";
import { updateDevice, listSites, type Site, getDashboardDevices, fetchClient, listDeviceRules, updateDeviceRule, deleteDeviceRule, type DeviceAlarmRule } from "../lib/api";
import { useAuth } from "../lib/auth";
import AddRuleModal from "./AddRuleModal";

type Device = {
    id: string;
    name: string;
    site_id?: string | null;
    area_id?: string | null;
    current_status: { status: string } | null;
    latest_telemetry: { occurred_at: string } | null;
    metrics: { temperature: number | null; humidity: number | null };
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

type Alert = {
    id: string;
    created_at: string;
    // payload is parsed from message
    payload: {
        event: string;
        value?: number;
        rule_summary?: {
            parameter: string;
            operator: string;
            threshold: number;
            value: number;
        };
    };
    acknowledged_at?: string | null;
};

export default function DeviceDetails() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const [device, setDevice] = useState<Device | null>(null);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [rules, setRules] = useState<DeviceAlarmRule[]>([]);
    const [isAddRuleModalOpen, setIsAddRuleModalOpen] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);


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
            let url = `/api/v1/alerts/history?device_id=${id}&limit=20`;
            if (cursor) url += `&cursor=${cursor}`;

            const json = await fetchClient(url);

            if (cursor) {
                setAlerts(prev => [...prev, ...json.data]);
            } else {
                setAlerts(json.data);
            }
            setNextCursor(json.next_cursor);
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
        try {
            await fetchClient(`/api/v1/alerts/${alertId}/acknowledge`, {
                method: "POST"
            });

            // Optimistic update
            setAlerts(prev => prev.map(a =>
                a.id === alertId ? { ...a, acknowledged_at: new Date().toISOString() } : a
            ));
        } catch (e) {
            console.error("Ack failed", e);
        }
    };

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
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{device?.name}</h1>
                    <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-mono">{device?.id}</div>
                </div>
                <div className="flex items-center gap-6">
                    <StatusBadge status={device?.current_status?.status} />
                    <div className="text-right">
                        <div className="text-xl font-semibold text-slate-900 dark:text-slate-200">
                            {device?.metrics?.temperature != null ? `${device.metrics.temperature}°C` : '—'}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                            {device?.metrics?.humidity != null ? `${device.metrics.humidity}%` : '—'} Humidity
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Column */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Telemetry Chart Card */}
                    {id && <TemperatureHistoryCard deviceId={id} />}

                    {/* Alerts */}
                    <section>
                        <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">Alert History</h2>
                        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-white/5">
                                    <tr>
                                        <th className="p-3">Time</th>
                                        <th className="p-3">Event</th>
                                        <th className="p-3">Details</th>
                                        <th className="p-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {alerts.map((a) => (
                                        <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                            <td className="p-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                                {new Date(a.created_at).toLocaleString()}
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.payload?.event === 'ALERT_RED'
                                                    ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/20'
                                                    : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/20'
                                                    }`}>
                                                    {a.payload?.event || 'Unknown'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-slate-600 dark:text-slate-400 text-xs">
                                                {a.payload?.rule_summary ? (
                                                    <>
                                                        <span className="font-semibold">{a.payload.rule_summary.parameter}</span> {a.payload.rule_summary.operator} {a.payload.rule_summary.threshold}
                                                        {' '}(val: {a.payload.rule_summary.value})
                                                    </>
                                                ) : JSON.stringify(a.payload).slice(0, 50)}
                                            </td>
                                            <td className="p-3 text-right">
                                                {a.acknowledged_at ? (
                                                    <span className="text-xs text-emerald-600 dark:text-emerald-400 px-2 py-1 bg-emerald-50 dark:bg-emerald-500/10 rounded border border-emerald-200 dark:border-emerald-500/20">
                                                        Acknowledged
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleAcknowledge(a.id)}
                                                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded shadow-sm transition-colors"
                                                    >
                                                        Acknowledge
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {alerts.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-500 italic">
                                                No alert history.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
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
                </div>

                {/* Sidebar / Extra Info */}
                <div className="space-y-6">
                    <LocationAssignment device={device} onAssign={() => window.location.reload()} />

                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 border border-slate-200 dark:border-white/5">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Device Info</h3>
                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <dt className="text-slate-500">ID</dt>
                                <dd className="font-mono text-xs">{device?.id}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-slate-500">Last Seen</dt>
                                <dd>{device?.latest_telemetry?.occurred_at ? new Date(device.latest_telemetry.occurred_at).toLocaleString() : 'Never'}</dd>
                            </div>
                        </dl>
                    </div>

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

            {isAddRuleModalOpen && device && (
                <AddRuleModal
                    deviceId={device.id}
                    onClose={() => setIsAddRuleModalOpen(false)}
                    onCreated={(rule) => {
                        setRules(prev => [rule, ...prev]);
                    }}
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
