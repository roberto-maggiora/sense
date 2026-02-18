import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { fetchClient } from "../lib/api";

type Alert = {
    id: string;
    created_at: string;
    client_id: string;
    device_id: string;
    message: string;
    // payload is parsed from message if available (API v1)
    payload?: {
        event: string;
        value?: number;
        rule_summary?: {
            parameter: string;
            operator: string;
            threshold: number;
            value: number;
        };
    };
    acknowledged_at?: string | null;
    acknowledged_by?: string | null;
};

type FilterType = 'all' | 'active' | 'acknowledged';

export default function Alerts() {
    // Data State
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // UI State
    const [filter, setFilter] = useState<FilterType>('all');
    const [search, setSearch] = useState("");
    const [actionLoading, setActionLoading] = useState<string | null>(null); // ID of alert being acted on

    const fetchAlerts = async (cursor?: string) => {
        try {
            setLoading(true);
            const params = new URLSearchParams({ limit: '50' });
            if (cursor) params.append('cursor', cursor);

            const json = await fetchClient(`/api/v1/alerts/history?${params.toString()}`);

            const newAlerts = json.data.map((a: any) => ({
                ...a,
                payload: typeof a.message === 'string' && a.message.startsWith('{') ? JSON.parse(a.message) : undefined
            }));

            if (cursor) {
                setAlerts(prev => [...prev, ...newAlerts]);
            } else {
                setAlerts(newAlerts);
            }
            setNextCursor(json.next_cursor);
            setError(null);
        } catch (e: any) {
            setError(e.message || "Failed to load alerts");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
    }, []);

    const handleAcknowledge = async (id: string) => {
        // Optimistic update
        const originalAlerts = [...alerts];
        const now = new Date().toISOString();

        setAlerts(prev => prev.map(a =>
            a.id === id ? { ...a, acknowledged_at: now } : a
        ));
        setActionLoading(id);

        try {
            await fetchClient(`/api/v1/alerts/${id}/acknowledge`, {
                method: 'POST',
                body: JSON.stringify({})
            });
        } catch (e) {
            // Revert on error
            setAlerts(originalAlerts);
            alert("Failed to acknowledge alert. Please try again.");
        } finally {
            setActionLoading(null);
        }
    };

    // Client-side filtering
    const filteredAlerts = useMemo(() => {
        return alerts.filter(a => {
            // Status Filter
            if (filter === 'active' && a.acknowledged_at) return false;
            if (filter === 'acknowledged' && !a.acknowledged_at) return false;

            // Search Filter
            if (search) {
                const s = search.toLowerCase();
                const matchesDevice = a.device_id.toLowerCase().includes(s);
                const matchesEvent = a.payload?.event?.toLowerCase().includes(s);
                const matchesSummary = a.payload?.rule_summary
                    ? `${a.payload.rule_summary.parameter} ${a.payload.rule_summary.operator}`.toLowerCase().includes(s)
                    : false;

                return matchesDevice || matchesEvent || matchesSummary;
            }

            return true;
        });
    }, [alerts, filter, search]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
                    Alerts Inbox
                </h2>

                <div className="flex items-center gap-4">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search device or event..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 pr-4 py-2 w-full sm:w-64 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                        <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>

                    <div className="flex p-1 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/5">
                        {(['all', 'active', 'acknowledged'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === f
                                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                    }`}
                            >
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-4 text-red-600 dark:text-red-400 text-sm">
                    {error}
                </div>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-900/5">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/50 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-white/5">
                        <tr>
                            <th className="p-4 w-48">Time</th>
                            <th className="p-4 w-40">Device</th>
                            <th className="p-4 w-32">Event</th>
                            <th className="p-4">Details</th>
                            <th className="p-4 w-32">Status</th>
                            <th className="p-4 w-24 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {loading && alerts.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-slate-500 italic">
                                    Loading alerts...
                                </td>
                            </tr>
                        ) : filteredAlerts.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-12 text-center text-slate-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <svg className="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                        <span className="italic">No alerts found matching your criteria.</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredAlerts.map((a) => (
                                <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                                    <td className="p-4 text-slate-600 dark:text-slate-300">
                                        {new Date(a.created_at).toLocaleString()}
                                    </td>
                                    <td className="p-4">
                                        <Link
                                            to={`/device/${a.device_id}`}
                                            className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline decoration-blue-300 underline-offset-2"
                                        >
                                            {a.device_id.split('-')[0]}...
                                        </Link>
                                    </td>
                                    <td className="p-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold tracking-wide ${a.payload?.event === 'ALERT_RED'
                                            ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/20'
                                            : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/20'
                                            }`}>
                                            {a.payload?.event || 'Unknown'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-slate-600 dark:text-slate-400">
                                        {a.payload?.rule_summary ? (
                                            <span className="flex items-center gap-2">
                                                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
                                                    {a.payload.rule_summary.parameter}
                                                </span>
                                                <span className="text-slate-400 text-xs">{a.payload.rule_summary.operator} {a.payload.rule_summary.threshold}</span>
                                                <span className="text-xs text-slate-500">(val: {a.payload.rule_summary.value})</span>
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-500 italic truncate max-w-[200px] block">
                                                {a.message}
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        {a.acknowledged_at ? (
                                            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                Acknowledged
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                                                <span className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                                </span>
                                                Active
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {!a.acknowledged_at && (
                                            <button
                                                onClick={() => handleAcknowledge(a.id)}
                                                disabled={actionLoading === a.id}
                                                className="text-xs font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
                                            >
                                                {actionLoading === a.id ? "..." : "Acknowledge"}
                                            </button>
                                        )}
                                        {a.acknowledged_at && (
                                            <span className="text-slate-300 dark:text-slate-700 select-none">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {nextCursor && (
                <div className="flex justify-center pt-4">
                    <button
                        onClick={() => fetchAlerts(nextCursor)}
                        disabled={loading}
                        className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shadow-sm border border-slate-200 dark:border-white/5"
                    >
                        {loading ? "Loading filters..." : "Load Older Alerts"}
                    </button>
                </div>
            )}
        </div>
    );
}
