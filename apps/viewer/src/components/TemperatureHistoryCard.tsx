import { useEffect, useState } from "react";
import { formatTemperature } from "../lib/format";
import TelemetryChart from "./TelemetryChart";
import { fetchClient, listDeviceRules } from "../lib/api"; // adjust path if needed

type TemperatureHistoryCardProps = {
    deviceId: string;
    availableMetrics?: string[];
};

export type ChartPoint = {
    timestamp: string;
    value: number | null;
};

export default function TemperatureHistoryCard({ deviceId, availableMetrics }: TemperatureHistoryCardProps) {
    const defaultMetric = availableMetrics?.[0] || "temperature";
    const [selectedMetric, setSelectedMetric] = useState<string>(defaultMetric);
    // Sync state if availableMetrics changes
    useEffect(() => {
        if (availableMetrics?.length && !availableMetrics.includes(selectedMetric)) {
            setSelectedMetric(availableMetrics[0]);
        }
    }, [availableMetrics]);
    const [timeRange, setTimeRange] = useState<"24h" | "7d">("24h");
    console.log("TemperatureHistoryCard mounted for", deviceId);
    const [chartData, setChartData] = useState<ChartPoint[]>([]);
    const [loading, setLoading] = useState(false);
    const [avgTemp, setAvgTemp] = useState<number | null>(null); // Added state for avgTemp
    const [thresholds, setThresholds] = useState<{ value: number; label: string }[]>([]);

    useEffect(() => {
        const load = async () => {
            if (!deviceId) return;
            setLoading(true);
            setAvgTemp(null); // Reset avgTemp on new load

            try {
                const now = new Date();
                const from = new Date(
                    timeRange === "24h"
                        ? now.getTime() - 24 * 60 * 60 * 1000
                        : now.getTime() - 7 * 24 * 60 * 60 * 1000
                );

                // Your Fastify route returns an array of events:
                // [{ occurred_at, received_at, metrics: [...], ...}, ...]
                const res = await fetchClient(
                    `/api/v1/devices/${deviceId}/telemetry?from=${encodeURIComponent(
                        from.toISOString()
                    )}&to=${encodeURIComponent(now.toISOString())}&limit=500`
                );

                // fetchClient might return either the raw array OR { data: [...] }
                const events = Array.isArray(res) ? res : res?.data;

                // Use selectedMetric for parsing the array
                const mapped: ChartPoint[] = (events || []).map((e: any) => {
                    const foundMetric = Array.isArray(e.metrics)
                        ? e.metrics.find((m: any) => m?.parameter === selectedMetric)
                        : null;

                    return {
                        timestamp: e.occurred_at,
                        value: foundMetric?.value ?? null
                    };
                });

                // API returns newest-first (orderBy desc). Chart usually wants oldest-first.
                setChartData(mapped.reverse());

                // Calculate average value
                const validVals = mapped.filter(p => p.value !== null).map(p => p.value as number);
                if (validVals.length > 0) {
                    const sum = validVals.reduce((acc, val) => acc + val, 0);
                    setAvgTemp(sum / validVals.length);
                } else {
                    setAvgTemp(null);
                }

                // Fetch rules to build thresholds
                const rules = await listDeviceRules(deviceId);
                const tempThresholds: { value: number; label: string; operator: string }[] = [];
                for (const r of rules) {
                    if (r.metric === selectedMetric && r.enabled) {
                        const val = Number(r.threshold);
                        const unit = selectedMetric === 'humidity' ? '%' : '°C';
                        if (!isNaN(val)) {
                            const lbl = (r.operator === "gt" || r.operator === "gte") ? `Max ${val}${unit}` : (r.operator === "lt" || r.operator === "lte") ? `Min ${val}${unit}` : `${val}${unit}`;
                            if (!tempThresholds.find(t => t.value === val)) {
                                tempThresholds.push({ value: val, label: lbl, operator: r.operator });
                            }
                        }
                    }
                }
                setThresholds(tempThresholds);

            } catch (err) {
                console.error("Failed to load telemetry OR rules", err);
                setChartData([]);
                setAvgTemp(null);
                setThresholds([]);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [deviceId, timeRange, selectedMetric]);

    return (
        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white capitalize">
                        {selectedMetric.replace('_', ' ')} History
                    </h2>
                    {availableMetrics && availableMetrics.length > 1 && (
                        <select
                            value={selectedMetric}
                            onChange={e => setSelectedMetric(e.target.value)}
                            className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-md py-1 px-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer capitalize"
                        >
                            {availableMetrics.map(m => (
                                <option key={m} value={m}>{m.replace('_', ' ')}</option>
                            ))}
                        </select>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {loading && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Loading…
                        </span>
                    )}
                    {!loading && avgTemp !== null && (
                        <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
                            {avgTemp != null ? `${formatTemperature(avgTemp)}${selectedMetric === 'humidity' ? '%' : '°C'}` : '—'}
                        </div>
                    )}

                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                        <button
                            onClick={() => setTimeRange("24h")}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${timeRange === "24h"
                                ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                }`}
                        >
                            24h
                        </button>
                        <button
                            onClick={() => setTimeRange("7d")}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${timeRange === "7d"
                                ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                }`}
                        >
                            7d
                        </button>
                    </div>
                </div>
            </div>

            <div className="-mx-2">
                <TelemetryChart
                    data={chartData}
                    label={selectedMetric}
                    unit={selectedMetric === 'humidity' ? '%' : '°C'}
                    color={timeRange === "24h" ? "#3b82f6" : "#8b5cf6"}
                    thresholds={thresholds}
                />
            </div>
        </section>
    );
}