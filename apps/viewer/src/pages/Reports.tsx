import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchClient, BASE_URL } from "../lib/api";

type Device = {
    id: string;
    name: string;
    site?: { name: string } | null;
    area?: { name: string } | null;
    available_metrics?: string[];
};

export default function ReportsPage() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [searchParams] = useSearchParams();
    const urlDeviceId = searchParams.get("deviceId");

    // Form state
    const [selectedDeviceId, setSelectedDeviceId] = useState("");
    const [selectedMetric, setSelectedMetric] = useState("temperature");
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split("T")[0];
    });
    const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);

    useEffect(() => {
        fetchClient("/api/v1/dashboard/devices")
            .then(res => {
                const list = Array.isArray(res?.data) ? res.data : [];
                setDevices(list);

                if (urlDeviceId) {
                    const found = list.find((d: Device) => d.id === urlDeviceId);
                    if (found) {
                        setSelectedDeviceId(found.id);
                    } else {
                        setError("Selected device was not found or access is denied.");
                        setSelectedDeviceId(""); // keep picker empty
                    }
                } else if (list.length > 0) {
                    setSelectedDeviceId(list[0].id);
                }
            })
            .catch(() => setError("Failed to load devices"))
            .finally(() => setLoading(false));
    }, [urlDeviceId]);

    const selectedDevice = devices.find(d => d.id === selectedDeviceId);
    const availableMetrics = (selectedDevice?.available_metrics ?? ["temperature"]).filter(
        m => m !== "battery"
    );

    // Keep selected metric in sync when device changes
    useEffect(() => {
        if (availableMetrics.length > 0 && !availableMetrics.includes(selectedMetric)) {
            setSelectedMetric(availableMetrics[0]);
        }
    }, [selectedDeviceId]);

    const handleGenerate = async () => {
        if (!selectedDeviceId || !selectedMetric || !fromDate || !toDate) return;
        setGenerating(true);
        setError(null);
        try {
            const token = localStorage.getItem('sense_auth_token');
            const headers: Record<string, string> = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    if (payload.role === 'SUPER_ADMIN') {
                        const selectedClient = localStorage.getItem('sense_selected_client_id');
                        if (selectedClient) headers['X-Client-Id'] = selectedClient;
                    }
                } catch { /* ignore */ }
            }

            // Verification checklist:
            // - In dev, downloading a report should yield `file ...: PDF document`.
            // - `head -n 5 downloaded.pdf` should NOT show HTML.
            const res = await fetch(
                `${BASE_URL}/api/v1/reports/device/${selectedDeviceId}/metric/${selectedMetric}/temperature-compliance?from=${fromDate}&to=${toDate}`,
                { headers }
            );

            if (!res.ok) {
                const text = await res.text();
                let errMsg = `HTTP ${res.status}`;
                try {
                    const err = JSON.parse(text);
                    if (err.error) errMsg = err.error;
                } catch {
                    errMsg += ` - ${text.slice(0, 100)}`;
                }
                throw new Error(errMsg);
            }

            const contentType = res.headers.get("Content-Type") || "";
            if (!contentType.includes("application/pdf")) {
                const text = await res.text();
                throw new Error(`Invalid response type: ${contentType}. Server output: ${text.slice(0, 200)}`);
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `report_${selectedDevice?.name || selectedDeviceId}_${selectedMetric}_${fromDate}_${toDate}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setError(err?.message || "Failed to generate report");
        } finally {
            setGenerating(false);
        }
    };

    const metricLabel: Record<string, string> = {
        temperature: "Temperature",
        humidity: "Humidity",
        pir_status: "Motion Status",
        pir_count: "Motion Count",
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-6">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reports</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Generate PDF compliance reports for any device and metric.
                    </p>
                </div>

                {/* Card */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-6">
                    <h2 className="text-base font-bold text-slate-900 dark:text-white mb-5">
                        New Report
                    </h2>

                    <div className="space-y-5">
                        {/* Device */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Device
                            </label>
                            {loading ? (
                                <div className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                            ) : (
                                <select
                                    value={selectedDeviceId}
                                    onChange={e => setSelectedDeviceId(e.target.value)}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                >
                                    {!selectedDeviceId && <option value="" disabled>Select a device</option>}
                                    {devices.map(d => (
                                        <option key={d.id} value={d.id}>
                                            {d.name}
                                            {d.site ? ` — ${d.site.name}` : ""}
                                            {d.area ? ` › ${d.area.name}` : ""}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Metric */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Metric
                            </label>
                            <select
                                value={selectedMetric}
                                onChange={e => setSelectedMetric(e.target.value)}
                                className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                            >
                                {(availableMetrics.length > 0 ? availableMetrics : ["temperature"]).map(m => (
                                    <option key={m} value={m}>
                                        {metricLabel[m] || m.replace("_", " ")}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Date range */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                    From
                                </label>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={e => setFromDate(e.target.value)}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                    To
                                </label>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={e => setToDate(e.target.value)}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="mt-5 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                            {error}
                        </div>
                    )}

                    {/* Generate button */}
                    <button
                        onClick={handleGenerate}
                        disabled={generating || loading || !selectedDeviceId}
                        className="mt-6 w-full flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
                    >
                        {generating ? (
                            <>
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                Generating…
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Download PDF Report
                            </>
                        )}
                    </button>
                </div>

                {/* Info */}
                <div className="mt-4 text-xs text-slate-400 dark:text-slate-500 text-center">
                    Reports include Min/Max/Avg, breach analysis, compliance %, and a full breach table.
                </div>
            </div>
        </div>
    );
}
