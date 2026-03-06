import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from "recharts";
import { useMemo } from "react";
import { getMetricMeta, formatMetricValue } from "../lib/metrics";

type DataPoint = {
    timestamp: string;
    value: number | null;
};

type TelemetryChartProps = {
    data: DataPoint[];
    parameter?: string;
    label: string;
    unit: string;
    color?: string;
    decimals?: number;
    thresholds?: { value: number; label: string; operator?: string }[];
};

export default function TelemetryChart({ data, parameter, label, unit, color = "#3b82f6", decimals = 1, thresholds = [] }: TelemetryChartProps) {
    const stats = useMemo(() => {
        if (!data.length) return { min: 0, max: 0, avg: 0, last: 0 };
        const values = data.map((d) => d.value).filter((v): v is number => v != null);
        if (!values.length) return { min: 0, max: 0, avg: 0, last: 0 };
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const last = values[values.length - 1];
        return { min, max, avg, last };
    }, [data]);

    const isDiscrete = parameter ? getMetricMeta(parameter).kind === 'discrete' : false;
    const fmt = (v: number) => isDiscrete ? formatMetricValue(v, parameter!) : v.toFixed(decimals);

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    if (data.length === 0) {
        return (
            <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5">
                No data available
            </div>
        )
    }

    return (
        <div className="w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</h3>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                        {fmt(stats.last)} <span className="text-base font-normal text-slate-500 dark:text-slate-400">{unit}</span>
                    </div>
                </div>
                <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400 text-right">
                    <div>
                        <div className="uppercase tracking-wide opacity-70">High</div>
                        <div className="font-semibold text-slate-700 dark:text-slate-300">{fmt(stats.max)}{unit}</div>
                    </div>
                    <div>
                        <div className="uppercase tracking-wide opacity-70">Low</div>
                        <div className="font-semibold text-slate-700 dark:text-slate-300">{fmt(stats.min)}{unit}</div>
                    </div>
                    <div>
                        <div className="uppercase tracking-wide opacity-70">Avg</div>
                        <div className="font-semibold text-slate-700 dark:text-slate-300">{fmt(stats.avg)}{unit}</div>
                    </div>
                </div>
            </div>

            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                        <XAxis
                            dataKey="timestamp"
                            tickFormatter={formatDate}
                            stroke="#94a3b8"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={30}
                        />
                        <YAxis
                            stroke="#94a3b8"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={isDiscrete ? (v) => fmt(v) : (v) => v.toFixed(decimals)}
                            domain={
                                isDiscrete ? [-0.1, 1.1] : [
                                    (dataMin: number) => {
                                        const minThreshold = thresholds.length ? Math.min(...thresholds.map(t => t.value)) : Infinity;
                                        const absoluteMin = Math.min(dataMin, minThreshold);
                                        if (absoluteMin === Infinity) return 'auto';
                                        const padding = 2;
                                        return Math.max(0, absoluteMin - padding);
                                    },
                                    (dataMax: number) => {
                                        const maxThreshold = thresholds.length ? Math.max(...thresholds.map(t => t.value)) : -Infinity;
                                        const absoluteMax = Math.max(dataMax, maxThreshold);
                                        if (absoluteMax === -Infinity) return 'auto';
                                        const padding = 2;
                                        return absoluteMax + padding;
                                    }
                                ]}
                        />
                        {thresholds.map((t, i) => {
                            const isMax = t.operator === 'gt' || t.operator === 'gte';
                            const isMin = t.operator === 'lt' || t.operator === 'lte';
                            const lineStroke = isMax ? "#dc2626" : (isMin ? "#2563eb" : "#ef4444");

                            return (
                                <ReferenceLine
                                    key={i}
                                    y={t.value}
                                    stroke={lineStroke}
                                    strokeWidth={2}
                                    label={{ position: 'insideTopLeft', value: t.label, fill: lineStroke, fontSize: 10, offset: 5, fontWeight: 600 }}
                                />
                            );
                        })}
                        <Tooltip
                            content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    const val = payload[0].value as number | null;
                                    return (
                                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded shadow-lg text-xs">
                                            <div className="text-slate-500 dark:text-slate-400 mb-1">{label ? new Date(label).toLocaleString() : ''}</div>
                                            <div className="font-semibold text-slate-900 dark:text-white">
                                                {val != null ? fmt(val) : '—'}{unit}
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke={color}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
