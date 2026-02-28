import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDashboardDevices, updateDevice } from "../lib/api";
import { formatDeviceLocation } from "../lib/location";
import AddDeviceModal from "./AddDeviceModal";
import EditDeviceModal from "./EditDeviceModal";

type Device = {
    id: string;
    name: string;
    source: string;
    external_id: string;
    site_id?: string | null;
    area_id?: string | null;
    site?: { name: string } | null;
    area?: { name: string } | null;
    manufacturer?: string | null;
    model?: string | null;
    current_status: { status: string } | null;
    latest_telemetry: { occurred_at: string } | null;
    metrics: { temperature: number | null; humidity: number | null };
};

export default function DevicesPage() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDevice, setEditingDevice] = useState<Device | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

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

    useEffect(() => {
        fetchDevices();
    }, []);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    const handleDisable = async (device: Device) => {
        const confirmed = window.confirm(
            `Disable "${device.name}"? It will no longer appear in this list.`
        );
        if (!confirmed) return;

        try {
            await updateDevice(device.id, { disabled: true });
            showToast("Device disabled");
            fetchDevices();
        } catch (err: any) {
            alert(err?.message || "Failed to disable device");
        }
    };

    if (loading) return <div className="text-slate-400">Loading...</div>;
    if (error) return <div className="text-red-400">Error: {error}</div>;

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">All Devices</h2>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add device
                </button>
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
                            <th className="p-3 text-right">Actions</th>
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
                                    {formatLastSeen(d.latest_telemetry?.occurred_at)}
                                </td>
                                <td className="p-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        {/* Edit */}
                                        <button
                                            onClick={() => setEditingDevice(d)}
                                            title="Edit device"
                                            className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 dark:hover:text-blue-400 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.232-6.232a2 2 0 012.828 0l.707.707a2 2 0 010 2.828L12 14H9v-3z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 20h14" />
                                            </svg>
                                        </button>
                                        {/* Disable */}
                                        <button
                                            onClick={() => handleDisable(d)}
                                            title="Disable device"
                                            className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                            </svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {devices.length === 0 && (
                            <tr>
                                <td colSpan={7} className="p-8 text-center text-slate-500 italic">
                                    No devices found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <AddDeviceModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => {
                    showToast("Device created successfully");
                    fetchDevices();
                }}
            />

            {editingDevice && (
                <EditDeviceModal
                    isOpen={!!editingDevice}
                    device={editingDevice}
                    onClose={() => setEditingDevice(null)}
                    onSuccess={() => {
                        showToast("Device updated successfully");
                        setEditingDevice(null);
                        fetchDevices();
                    }}
                />
            )}

            {toastMessage && (
                <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 z-50">
                    <svg className="w-5 h-5 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium text-sm">{toastMessage}</span>
                </div>
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

function formatLastSeen(dateStr: string | null | undefined) {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

    if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
}
