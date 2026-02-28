import { useEffect, useState } from "react";
import TelemetryChart from "./TelemetryChart";
import { fetchClient } from "../lib/api"; // adjust path if needed

type TemperatureHistoryCardProps = {
    deviceId: string;
};

type ChartPoint = {
    timestamp: string;
    value: number | null;
};

export default function TemperatureHistoryCard({ deviceId }: TemperatureHistoryCardProps) {
    const [timeRange, setTimeRange] = useState<"24h" | "7d">("24h");
    console.log("TemperatureHistoryCard mounted for", deviceId);
    const [chartData, setChartData] = useState<ChartPoint[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (!deviceId) return;
            setLoading(true);

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

                const mapped: ChartPoint[] = (events || []).map((e: any) => {
                    const tempMetric = Array.isArray(e.metrics)
                        ? e.metrics.find((m: any) => m?.parameter === "temperature")
                        : null;

                    return {
                        timestamp: e.occurred_at,
                        value: tempMetric?.value ?? null
                    };
                });

                // API returns newest-first (orderBy desc). Chart usually wants oldest-first.
                setChartData(mapped.reverse());
            } catch (err) {
                console.error("Failed to load telemetry", err);
                setChartData([]);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [deviceId, timeRange]);

    return (
        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Temperature History
                </h2>

                <div className="flex items-center gap-3">
                    {loading && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Loading…
                        </span>
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
                    label="Temperature"
                    unit="°C"
                    color={timeRange === "24h" ? "#3b82f6" : "#8b5cf6"}
                />
            </div>
        </section>
    );
}