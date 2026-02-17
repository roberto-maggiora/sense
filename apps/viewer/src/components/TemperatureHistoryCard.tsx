import { useState, useMemo } from "react";
import TelemetryChart from "./TelemetryChart";

type TemperatureHistoryCardProps = {
    deviceId: string;
};

export default function TemperatureHistoryCard({ deviceId }: TemperatureHistoryCardProps) {
    const [timeRange, setTimeRange] = useState<"24h" | "7d">("24h");

    // Mock Data Logic (extracted from DeviceDetails)
    const chartData = useMemo(() => {
        const now = new Date();
        const points = [];
        const count = 48; // number of points
        const durationHours = timeRange === "24h" ? 24 : 168;
        const interval = (durationHours * 60 * 60 * 1000) / count;

        // Deterministic-ish random for consistent look per device/reload
        // Simple sine wave + noise + deviceId generic hash influence
        const deviceHash = deviceId.split("").reduce((a, b) => a + b.charCodeAt(0), 0);

        for (let i = 0; i < count; i++) {
            const t = new Date(now.getTime() - (count - 1 - i) * interval);
            // Base temp around 22C, with day/night cycle (24h period)
            const hour = t.getHours();

            // Offset phase by deviceHash to make different devices look different
            const phase = (deviceHash % 24) / 24 * Math.PI * 2;

            const dayCycle = Math.sin(((hour - 6) / 24 * Math.PI * 2) + phase) * 5; // -5 to +5
            const noise = (Math.random() - 0.5) * 2; // -1 to +1

            points.push({
                timestamp: t.toISOString(),
                value: parseFloat((22 + dayCycle + noise).toFixed(1))
            });
        }
        return points;
    }, [timeRange, deviceId]);

    return (
        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Temperature History</h2>
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
