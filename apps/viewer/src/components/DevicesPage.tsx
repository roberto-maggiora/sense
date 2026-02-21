import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDashboardDevices } from "../lib/api";
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

export default function DevicesPage() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDevices = async () => {
            try {
                const json = await getDashboardDevices({ limit: 100 });
                setDevices(json.data || []);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchDevices();
    }, []);

    if (loading) return <div className="text-slate-400">Loading...</div>;
    if (error) return <div className="text-red-400">Error: {error}</div>;

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">All Devices</h2>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-white/5">
                        <tr>
                            <th className="p-3">Name</th>
                            <th className="p-3">Location</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Temp</th>
                            <th className="p-3">Humidity</th>
                            <th className="p-3 text-right">Last Seen</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {devices.map((d) => (
                            <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                                <td className="p-3 font-medium text-slate-900 dark:text-slate-200">
                                    <Link to={`/device/${d.id}`} className="hover:underline decoration-blue-500 underline-offset-4">
                                        {d.name}
                                    </Link>
                                </td>
                                <td className="p-3 text-slate-600 dark:text-slate-400">
                                    {formatDeviceLocation(d)}
                                </td>
                                <td className="p-3">
                                    <StatusBadge status={d.current_status?.status} />
                                </td>
                                <td className="p-3 tabular-nums text-slate-600 dark:text-slate-300">
                                    {d.metrics?.temperature != null ? `${d.metrics.temperature}°C` : '—'}
                                </td>
                                <td className="p-3 tabular-nums text-slate-600 dark:text-slate-300">
                                    {d.metrics?.humidity != null ? `${d.metrics.humidity}%` : '—'}
                                </td>
                                <td className="p-3 text-right text-xs text-slate-500 tabular-nums">
                                    {d.latest_telemetry?.occurred_at
                                        ? new Date(d.latest_telemetry.occurred_at).toLocaleString()
                                        : 'Never'}
                                </td>
                            </tr>
                        ))}
                        {devices.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-slate-500 italic">
                                    No devices found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
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
