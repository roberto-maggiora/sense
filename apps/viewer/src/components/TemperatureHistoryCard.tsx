import { useEffect, useState } from "react";
import TelemetryChart from "./TelemetryChart";
import { fetchClient, listDeviceRules } from "../lib/api";
import { getMetricMeta, formatMetricValue } from "../lib/metrics";

type TemperatureHistoryCardProps = {
    deviceId: string;
    availableMetrics?: string[];
};

export type ChartPoint = {
    timestamp: string;
    value: number | null;
};

function getStorageKey(deviceId: string) {
    return `chartMetric:${deviceId}`;
}

export default function TemperatureHistoryCard({ deviceId, availableMetrics }: TemperatureHistoryCardProps) {
    // Determine initial metric: localStorage → first available → temperature
    const getInitialMetric = () => {
        const stored = localStorage.getItem(getStorageKey(deviceId));
        if (stored && availableMetrics?.includes(stored)) return stored;
        return availableMetrics?.[0] || "temperature";
    };

    const [selectedMetric, setSelectedMetric] = useState<string>(getInitialMetric);
    const [timeRange, setTimeRange] = useState<"24h" | "7d">("24h");
    const [chartData, setChartData] = useState<ChartPoint[]>([]);
    const [loading, setLoading] = useState(false);
    const [avgValue, setAvgValue] = useState<number | null>(null);
    const [thresholds, setThresholds] = useState<{ value: number; label: string; operator: string }[]>([]);

    // Sync state if availableMetrics changes (e.g. device reloaded)
    useEffect(() => {
        if (availableMetrics?.length && !availableMetrics.includes(selectedMetric)) {
            const stored = localStorage.getItem(getStorageKey(deviceId));
            if (stored && availableMetrics.includes(stored)) {
                setSelectedMetric(stored);
            } else {
                setSelectedMetric(availableMetrics[0]);
            }
        }
    }, [availableMetrics, deviceId]);

    // Persist selection
    const handleSelectMetric = (metric: string) => {
        setSelectedMetric(metric);
        localStorage.setItem(getStorageKey(deviceId), metric);
    };

    const metricMeta = getMetricMeta(selectedMetric);

    useEffect(() => {
        const load = async () => {
            if (!deviceId) return;
            setLoading(true);
            setAvgValue(null);

            try {
                const now = new Date();
                const from = new Date(
                    timeRange === "24h"
                        ? now.getTime() - 24 * 60 * 60 * 1000
                        : now.getTime() - 7 * 24 * 60 * 60 * 1000
                );

                const res = await fetchClient(
                    `/api/v1/devices/${deviceId}/telemetry?from=${encodeURIComponent(
                        from.toISOString()
                    )}&to=${encodeURIComponent(now.toISOString())}&limit=500`
                );

                const events = Array.isArray(res) ? res : res?.data;

                const mapped: ChartPoint[] = (events || []).map((e: any) => {
                    let val: number | null = null;

                    if (Array.isArray(e.metrics)) {
                        const found = e.metrics.find((m: any) => m?.parameter === selectedMetric);
                        if (found && typeof found.value === 'number') val = found.value;
                    }
                    if (val == null && e.payload) {
                        const p = e.payload;
                        if (typeof p[selectedMetric] === 'number') val = p[selectedMetric];
                        else if (selectedMetric === 'co2' && typeof p.concentration === 'number') val = p.concentration;
                        else if (typeof p.raw?.data?.payload?.[selectedMetric] === 'number') val = p.raw.data.payload[selectedMetric];
                        else if (selectedMetric === 'co2' && typeof p.raw?.data?.payload?.concentration === 'number') val = p.raw.data.payload.concentration;
                    }

                    return {
                        timestamp: e.occurred_at,
                        value: val,
                    };
                });

                // API returns newest-first. Chart wants oldest-first.
                setChartData(mapped.reverse());

                const validVals = mapped.filter(p => p.value !== null).map(p => p.value as number);
                if (validVals.length > 0) {
                    setAvgValue(validVals.reduce((a, b) => a + b, 0) / validVals.length);
                } else {
                    setAvgValue(null);
                }

                // Build threshold reference lines from rules for this metric
                const rules = await listDeviceRules(deviceId);
                const tempThresholds: { value: number; label: string; operator: string }[] = [];
                for (const r of rules) {
                    if (r.metric === selectedMetric && r.enabled) {
                        const val = Number(r.threshold);
                        if (!isNaN(val)) {
                            const lbl =
                                (r.operator === "gt" || r.operator === "gte")
                                    ? `Max ${val}${metricMeta.unitSuffix}`
                                    : (r.operator === "lt" || r.operator === "lte")
                                        ? `Min ${val}${metricMeta.unitSuffix}`
                                        : `${val}${metricMeta.unitSuffix}`;
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
                setAvgValue(null);
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
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        {metricMeta.label} History
                    </h2>
                    {availableMetrics && availableMetrics.length > 1 && (
                        <select
                            value={selectedMetric}
                            onChange={e => handleSelectMetric(e.target.value)}
                            className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-md py-1 px-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
                        >
                            {availableMetrics.map(m => (
                                <option key={m} value={m}>{getMetricMeta(m).label}</option>
                            ))}
                        </select>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {loading && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Loading…</span>
                    )}
                    {!loading && avgValue !== null && (
                        <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">
                            {formatMetricValue(avgValue, selectedMetric)}{metricMeta.unitSuffix}
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
                    parameter={selectedMetric}
                    label={metricMeta.label}
                    unit={metricMeta.unitSuffix}
                    decimals={metricMeta.decimals}
                    color={timeRange === "24h" ? "#3b82f6" : "#8b5cf6"}
                    thresholds={thresholds}
                />
            </div>
        </section>
    );
}