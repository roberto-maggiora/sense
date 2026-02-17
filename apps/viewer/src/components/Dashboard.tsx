import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TemperatureHistoryCard from "./TemperatureHistoryCard";

type Summary = {
    total_devices: number;
    red: number;
    amber: number;
    green: number;
    offline: number;
    open_alerts?: number;
    last_telemetry_at?: string | null;
};

type Device = {
    id: string;
    name: string;
    current_status: { status: string } | null;
    latest_telemetry: { occurred_at: string } | null;
    metrics: { temperature: number | null; humidity: number | null };
};

export default function Dashboard() {
    const [data, setData] = useState<Summary | null>(null);
    const [devices, setDevices] = useState<Device[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

    useEffect(() => {
        const run = async () => {
            try {
                setError(null);

                // Fetch Summary
                const resSum = await fetch("http://127.0.0.1:3000/api/v1/dashboard/summary", {
                    headers: { "X-Client-Id": "test-client" },
                });
                if (!resSum.ok) throw new Error(`Summary HTTP ${resSum.status}`);
                const jsonSum = (await resSum.json()) as Summary;
                setData(jsonSum);

                // Fetch Devices
                const resDev = await fetch("http://127.0.0.1:3000/api/v1/dashboard/devices?limit=50", {
                    headers: { "X-Client-Id": "test-client" },
                });
                if (!resDev.ok) throw new Error(`Devices HTTP ${resDev.status}`);
                const jsonDev = await resDev.json();
                const deviceList = jsonDev.data || [];
                setDevices(deviceList);

                // Auto-select first device
                if (deviceList.length > 0) {
                    setSelectedDeviceId(deviceList[0].id);
                }

            } catch (e: any) {
                setError(e?.message ?? "Unknown error");
            }
        };

        run();
    }, []);

    return (
        <div className="max-w-7xl mx-auto">
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
                                Select a device to view history
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
