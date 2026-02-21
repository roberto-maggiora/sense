import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import TemperatureHistoryCard from "./TemperatureHistoryCard";
import {
    type Site,
    type Area,
    type DashboardSummary,
    listSites,
    listAreas,
    getDashboardSummary,
    getDashboardDevices
} from "../lib/api";

import { formatDeviceLocation } from "../lib/location";

type Device = {
    id: string;
    name: string;
    site_id?: string | null;
    area_id?: string | null;
    site?: { name: string } | null;
    area?: { name: string } | null;
    current_status: { status: string } | null;
    latest_telemetry: { occurred_at: string } | null;
    metrics: { temperature: number | null; humidity: number | null };
};

export default function Dashboard() {
    const [data, setData] = useState<DashboardSummary | null>(null);
    const [devices, setDevices] = useState<Device[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

    // Filter State
    const [sites, setSites] = useState<Site[]>([]);
    const [areas, setAreas] = useState<Area[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState<string>("");
    const [selectedAreaId, setSelectedAreaId] = useState<string>("");
    const [loadingFilters, setLoadingFilters] = useState(true);

    // Initial load of sites
    useEffect(() => {
        listSites().then(setSites).catch(console.error).finally(() => setLoadingFilters(false));
    }, []);

    // Load areas when site changes
    useEffect(() => {
        if (selectedSiteId) {
            listAreas(selectedSiteId).then(setAreas).catch(console.error);
        } else {
            setAreas([]);
        }
    }, [selectedSiteId]);

    // Fetch Dashboard Data
    const fetchData = useCallback(async () => {
        try {
            setError(null);

            const filters = {
                site_id: selectedSiteId || undefined,
                area_id: selectedAreaId || undefined
            };

            const [summary, devicesRes] = await Promise.all([
                getDashboardSummary(filters),
                getDashboardDevices({ ...filters, limit: 50 })
            ]);

            setData(summary);
            setDevices(devicesRes.data || []);

            // Auto-select first device if none selected or if current selection is filtered out
            // Simple logic: if list changes and current selection not in it, pick first
            // But preserving selection is nice if possible. 
            // For now, let's keep it simple: if device list loads and current not found, default to first.
            if (devicesRes.data?.length > 0) {
                const found = devicesRes.data.find((d: Device) => d.id === selectedDeviceId);
                if (!found) {
                    setSelectedDeviceId(devicesRes.data[0].id);
                }
            } else {
                setSelectedDeviceId(null);
            }

        } catch (e: any) {
            setError(e?.message ?? "Unknown error");
        }
    }, [selectedSiteId, selectedAreaId, selectedDeviceId]);

    // Re-fetch when filters change
    useEffect(() => {
        fetchData();
    }, [fetchData]);


    const handleSiteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedSiteId(e.target.value);
        setSelectedAreaId(""); // Reset area
    };

    const handleAreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedAreaId(e.target.value);
    };

    const clearFilters = () => {
        setSelectedSiteId("");
        setSelectedAreaId("");
    };

    return (
        <div className="max-w-7xl mx-auto">

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 bg-white dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mr-2">Dashboard</h2>
                    {selectedSiteId && (
                        <span className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200 rounded-full border border-blue-100 dark:border-blue-500/20">
                            Filtered
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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

                    {(selectedSiteId || selectedAreaId) && (
                        <button
                            onClick={clearFilters}
                            className="text-sm px-3 py-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-medium"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Overview</h2>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 text-right">
                    {data?.last_telemetry_at ? (
                        <>
                            <div>Last telemetry</div>
                            <div className="text-slate-700 dark:text-slate-200">{new Date(data.last_telemetry_at).toLocaleString()}</div>
                        </>
                    ) : (
                        <div>Last telemetry: —</div>
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

                {/* Left Column: Device List */}
                <div className="lg:col-span-5 xl:col-span-4">

                    {error && (
                        <div className="mb-4 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-200">
                            <div className="font-semibold">Fetch failed</div>
                            <div className="mt-1 break-words">{error}</div>
                        </div>
                    )}

                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm">
                        <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[800px] overflow-y-auto">
                            {devices.map((d) => (
                                <div
                                    key={d.id}
                                    onClick={() => setSelectedDeviceId(d.id)}
                                    className={`p-4 transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 ${selectedDeviceId === d.id
                                        ? "bg-blue-50/50 dark:bg-blue-500/5 border-l-4 border-l-blue-500"
                                        : "border-l-4 border-l-transparent"
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="font-medium text-slate-900 dark:text-slate-200">{d.name}</div>
                                        <StatusBadge status={d.current_status?.status} />
                                    </div>
                                    <div className="text-xs text-slate-400 mb-2 truncate">
                                        {formatDeviceLocation(d)}
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                                            {d.metrics?.temperature != null ? `${d.metrics.temperature}°C` : '—'}
                                            <span className="mx-2 text-slate-300">|</span>
                                            {d.metrics?.humidity != null ? `${d.metrics.humidity}%` : '—'}
                                        </div>
                                        <Link
                                            to={`/device/${d.id}`}
                                            onClick={(e) => e.stopPropagation()}
                                            title="Full Details"
                                            className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        </Link>
                                    </div>
                                </div>
                            ))}
                            {devices.length === 0 && !error && (
                                <div className="p-8 text-center text-slate-500 italic">
                                    No devices found.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Chart Panel */}
                <div className="lg:col-span-7 xl:col-span-8">
                    <div className="lg:sticky lg:top-24 space-y-6">
                        {selectedDeviceId ? (
                            <>
                                <TemperatureHistoryCard deviceId={selectedDeviceId} />
                                {/* We could add more details here later if we wanted a true master/detail */}
                            </>
                        ) : (
                            <div className="h-64 flex items-center justify-center text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                                {devices.length > 0 ? "Select a device to view history" : "No devices matching filter"}
                            </div>
                        )}
                    </div>
                </div>
            </div>
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

function Stat({ label, value, pill }: { label: string; value?: number; pill?: string }) {
    return (
        <div className={`rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-4 shadow-sm ${pill ?? ""}`}>
            <div className="text-xs opacity-70 uppercase tracking-wider font-semibold">{label}</div>
            <div className="text-2xl font-bold mt-1 tabular-nums">
                {typeof value === "number" ? value : "—"}
            </div>
        </div>
    );
}
