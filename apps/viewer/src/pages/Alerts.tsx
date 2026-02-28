import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchClient } from "../lib/api";
import { AlertTimelineDrawer } from "../components/AlertTimelineDrawer";

// ─── API types matching Alert State Machine v1 ───────────────────────────────

type AlertStatus =
    | 'triggered'
    | 'notified'
    | 'acknowledged'
    | 'snoozed'
    | 'resolved'
    | 'auto_resolved';

export type ApiAlert = {
    id: string;
    client_id: string;
    device_id: string;
    rule_id: string | null;
    severity: string;
    status: AlertStatus;
    opened_at: string;
    last_triggered_at: string;
    acknowledged_at: string | null;
    acknowledged_by: { id: string; name: string | null } | null;
    parameter: string | null;
    resolution_ms: number | null;
    snoozed_until: string | null;
    resolved_at: string | null;
    current_value: number | null;
    threshold: number | null;
    context_json: Record<string, unknown>;
    created_at: string;
    device: { id: string; name: string } | null;
};

// ─── Display helpers ─────────────────────────────────────────────────────────

function deriveEventLabel(a: ApiAlert): string {
    // Event column = what happened (not current state)
    switch (a.status) {
        case 'triggered':
        case 'notified':
        case 'acknowledged': // still an alert event, not resolved
        case 'snoozed':      // still an alert event
            return 'Alert';
        case 'resolved': return 'Resolved';
        case 'auto_resolved': return 'Auto resolved';
        default: return String(a.status).charAt(0).toUpperCase() + String(a.status).slice(1);
    }
}

// ─── Time formatting ─────────────────────────────────────────────────────────

export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hh}:${mm}`;
}

function deriveDetails(a: ApiAlert): string {
    // Battery details are rendered as a multi-line JSX element (see renderDetails)
    // This string version is only used for search matching.
    if (a.parameter === 'battery') {
        return `Battery low (${a.current_value}%)`;
    }

    const ctx = a.context_json ?? {};
    const metric = a.parameter || (ctx.metric as string | undefined) || 'Unknown';
    const operator = (ctx.operator as string | undefined) ?? null;
    const threshold = a.threshold ?? (ctx.threshold as number | undefined) ?? null;
    const value = a.current_value;

    if (operator != null && threshold != null) {
        const valPart = value != null ? ` (val: ${value})` : '';
        const capMetric = metric.charAt(0).toUpperCase() + metric.slice(1);
        return `${capMetric} ${operator} ${threshold}${valPart}`;
    }
    return a.rule_id ? `Rule ${a.rule_id.split('-')[0]}` : '—';
}

function ParameterIcon({ param }: { param: string | null }) {
    if (param === 'temperature') {
        return (
            <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 01-2-2V5a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2H9a2 2 0 00-2 2v6" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 14.76V3.5a2.5 2.5 0 0 1 5 0v11.26a4.5 4.5 0 1 1-5 0z" />
            </svg>
        );
    }
    if (param === 'humidity') {
        return (
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
        );
    }
    if (param === 'battery') {
        return (
            <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2z M18 10v4" />
            </svg>
        );
    }
    return (
        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    );
}

function formatDuration(ms: number) {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function eventBadgeClass(a: ApiAlert): string {
    // Resolved / auto_resolved → green
    if (a.status === 'resolved' || a.status === 'auto_resolved') {
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/20';
    }
    // Acknowledged / snoozed → neutral blue
    if (a.status === 'acknowledged' || a.status === 'snoozed') {
        return 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/20';
    }
    // Active alerts — colour by severity
    if (a.severity === 'red') {
        return 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/20';
    }
    return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/20';
}

// ─── Filter logic ────────────────────────────────────────────────────────────

type FilterType = 'all' | 'active' | 'acknowledged';

/** Active = alert requires attention but not yet acknowledged/resolved */
const ACTIVE_STATUSES: AlertStatus[] = ['triggered', 'notified', 'snoozed'];

// ─── Component ───────────────────────────────────────────────────────────────


export function AlertsTable({
    alerts,
    loading,
    search,
    filter,
    actionLoading,
    onAcknowledge,
    onResolve,
    onViewTimeline
}: {
    alerts: ApiAlert[];
    loading: boolean;
    search: string;
    filter: string;
    actionLoading: string | null;
    onAcknowledge: (id: string) => void;
    onResolve: (id: string) => void;
    onViewTimeline: (id: string) => void;
}) {
    function renderAction(a: ApiAlert) {
        const busy = actionLoading === a.id;

        if (a.status === 'triggered' || a.status === 'notified') {
            return (
                <button
                    onClick={() => onAcknowledge(a.id)}
                    disabled={busy}
                    className="text-xs font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
                >
                    {busy ? '…' : 'Acknowledge'}
                </button>
            );
        }

        if (a.status === 'acknowledged' || a.status === 'snoozed') {
            return (
                <button
                    onClick={() => onResolve(a.id)}
                    disabled={busy}
                    className="text-xs font-medium text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors disabled:opacity-50"
                >
                    {busy ? '…' : 'Resolve'}
                </button>
            );
        }

        return <span className="text-slate-300 dark:text-slate-700 select-none">—</span>;
    }

    function renderStatusPill(a: ApiAlert) {
        if (a.status === 'acknowledged') {
            return (
                <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    Acknowledged
                </span>
            );
        }
        if (a.status === 'resolved' || a.status === 'auto_resolved') {
            return (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    Resolved
                </span>
            );
        }
        if (a.status === 'snoozed') {
            return (
                <span className="flex items-center gap-1.5 text-xs text-blue-500 dark:text-blue-400 font-medium">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                    Snoozed
                </span>
            );
        }
        // Active — colour by severity
        const isRed = a.severity === 'red';
        const dotColour = isRed ? 'bg-red-500' : 'bg-amber-500';
        const pingColour = isRed ? 'bg-red-400' : 'bg-amber-400';
        const textColour = isRed
            ? 'text-red-600 dark:text-red-400'
            : 'text-amber-600 dark:text-amber-400';
        return (
            <span className={`flex items-center gap-1.5 text-xs font-medium ${textColour}`}>
                <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pingColour} opacity-75`} />
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColour}`} />
                </span>
                Active
            </span>
        );
    }

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm ring-1 ring-slate-900/5">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/50 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-white/5">
                    <tr>
                        <th className="px-4 py-3 w-[180px]">Time</th>
                        <th className="px-4 py-3">Device</th>
                        <th className="px-4 py-3 w-[110px]">Event</th>
                        <th className="px-4 py-3 w-[320px]">Details</th>
                        <th className="px-4 py-3 w-[120px]">Corrective Action</th>
                        <th className="px-4 py-3 w-[120px]">Status</th>
                        <th className="px-4 py-3 w-[120px] text-right">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {loading && alerts.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-500 italic">Loading alerts…</td>
                        </tr>
                    ) : alerts.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="p-12 text-center text-slate-500">
                                <div className="flex flex-col items-center gap-2">
                                    <svg className="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                    </svg>
                                    <span className="italic">No alerts{search || filter !== 'all' ? ' matching your criteria' : ''}.</span>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        alerts.map(a => (
                            <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors align-middle">
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap w-[180px]">
                                    {formatDateTime(a.opened_at)}
                                </td>
                                <td className="px-4 py-3 max-w-[200px]">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="shrink-0"><ParameterIcon param={a.parameter} /></span>
                                        <Link
                                            to={`/device/${a.device_id}`}
                                            title={a.device?.name ?? a.device_id}
                                            className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline decoration-blue-300 underline-offset-2 truncate"
                                        >
                                            {a.device?.name ?? `${a.device_id.split('-')[0]}…`}
                                        </Link>
                                    </div>
                                </td>
                                <td className="px-4 py-3 w-[110px] whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wide ${eventBadgeClass(a)}`}>
                                        {deriveEventLabel(a)}
                                    </span>
                                </td>
                                <td className="px-4 py-3 w-[320px] text-slate-600 dark:text-slate-400">
                                    {a.parameter === 'battery' ? (
                                        <span className="text-xs text-slate-500">
                                            Battery low — {a.current_value ?? '?'}%
                                            {a.severity === 'red' && !['resolved', 'auto_resolved'].includes(a.status) && (
                                                <span className="block text-slate-400">Threshold: &lt;10%</span>
                                            )}
                                            {a.severity === 'amber' && !['resolved', 'auto_resolved'].includes(a.status) && (
                                                <span className="block text-slate-400">Threshold: &lt;25%</span>
                                            )}
                                        </span>
                                    ) : (
                                        <span className="text-xs font-mono text-slate-500">{deriveDetails(a)}</span>
                                    )}
                                    {a.resolved_at && a.created_at && (
                                        <div className="text-xs text-slate-400 mt-0.5">
                                            {a.status === 'auto_resolved' ? 'Auto resolved' : 'Resolved'} in {formatDuration(new Date(a.resolved_at).getTime() - new Date(a.created_at).getTime())}
                                        </div>
                                    )}
                                    {a.acknowledged_at && (
                                        <div className="text-xs text-slate-400 mt-0.5">
                                            Ack’d by {a.acknowledged_by?.name || a.acknowledged_by?.id || 'System'} at {formatDateTime(a.acknowledged_at).split(', ')[1]}
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3 w-[120px]">
                                    <span className="text-sm text-gray-400 italic">Coming soon</span>
                                </td>
                                <td className="px-4 py-3 w-[120px] whitespace-nowrap">{renderStatusPill(a)}</td>
                                <td className="px-4 py-3 w-[120px] text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-3">
                                        <button
                                            onClick={() => onViewTimeline(a.id)}
                                            className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                                        >
                                            Timeline
                                        </button>
                                        {renderAction(a)}
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}

export default function Alerts() {
    const [alerts, setAlerts] = useState<ApiAlert[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<FilterType>('all');
    const [search, setSearch] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [timelineAlertId, setTimelineAlertId] = useState<string | null>(null);

    const fetchAlerts = useCallback(async (cursor?: string, currentFilter: FilterType = filter) => {
        try {
            setLoading(true);
            const params = new URLSearchParams({ limit: '100' });
            if (cursor) params.set('cursor', cursor);

            // "All" and "Acknowledged" tabs need closed alerts too
            if (currentFilter === 'all' || currentFilter === 'acknowledged') {
                params.set('include_closed', '1');
            }
            // "Active" tab: no param → API defaults to active-only (notIn resolved/auto_resolved)

            const json = await fetchClient(`/api/v1/alerts?${params.toString()}`);
            const rawList: ApiAlert[] = Array.isArray(json) ? json : (json.data ?? []);
            const next: string | null = Array.isArray(json) ? null : (json.next_cursor ?? null);

            setAlerts(prev => cursor ? [...prev, ...rawList] : rawList);
            setNextCursor(next);
            setError(null);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to load alerts');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { fetchAlerts(undefined, filter); }, [filter]);


    // ─── Actions ───────────────────────────────────────────────────────────

    const handleAcknowledge = async (id: string) => {
        const original = [...alerts];
        // Optimistic update
        setAlerts(prev => prev.map(a => a.id === id
            ? { ...a, status: 'acknowledged' as AlertStatus, acknowledged_at: new Date().toISOString() }
            : a
        ));
        setActionLoading(id);
        try {
            await fetchClient(`/api/v1/alerts/${id}/acknowledge`, { method: 'POST', body: '{}' });
        } catch {
            setAlerts(original);
            window.alert('Failed to acknowledge alert. Please try again.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleResolve = async (id: string) => {
        const original = [...alerts];
        setAlerts(prev => prev.map(a => a.id === id
            ? { ...a, status: 'resolved' as AlertStatus, resolved_at: new Date().toISOString() }
            : a
        ));
        setActionLoading(id);
        try {
            await fetchClient(`/api/v1/alerts/${id}/resolve`, { method: 'POST', body: '{}' });
        } catch {
            setAlerts(original);
            window.alert('Failed to resolve alert. Please try again.');
        } finally {
            setActionLoading(null);
        }
    };





    // ─── Client-side filter ────────────────────────────────────────────────

    const filteredAlerts = useMemo(() => {
        return alerts.filter(a => {
            if (filter === 'active' && !ACTIVE_STATUSES.includes(a.status)) return false;
            // The API handles "acknowledged" correctly if we pass the status filter now,
            // but for client-side matching, we consider "acknowledged" as having acknowledged_at set or status acknowledged.
            if (filter === 'acknowledged' && (!a.acknowledged_at && a.status !== 'acknowledged')) return false;

            if (search) {
                const s = search.toLowerCase();
                return (
                    a.device_id.toLowerCase().includes(s) ||
                    (a.device?.name ?? '').toLowerCase().includes(s) ||
                    deriveEventLabel(a).toLowerCase().includes(s) ||
                    deriveDetails(a).toLowerCase().includes(s)
                );
            }
            return true;
        });
    }, [alerts, filter, search]);

    const openAlerts = useMemo(() => filteredAlerts.filter(a => !['resolved', 'auto_resolved'].includes(a.status)), [filteredAlerts]);
    const historyAlerts = useMemo(() => filteredAlerts.filter(a => ['resolved', 'auto_resolved'].includes(a.status)), [filteredAlerts]);
    const [showHistory, setShowHistory] = useState(false);

    // ─── Render ────────────────────────────────────────────────────────────

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col">
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
                        Alerts Inbox
                    </h2>
                    <span className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Open ({openAlerts.length}) &bull; History ({historyAlerts.length})
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search device or event…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9 pr-4 py-2 w-full sm:w-64 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                        <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <div className="flex p-1 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/5">
                        {(['all', 'active', 'acknowledged'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === f
                                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                    }`}
                            >
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Error — only real failures, not empty state */}
            {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-4 text-red-600 dark:text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Table */}
            <AlertsTable
                alerts={openAlerts}
                loading={loading}
                search={search}
                filter={filter}
                actionLoading={actionLoading}
                onAcknowledge={handleAcknowledge}
                onResolve={handleResolve}
                onViewTimeline={setTimelineAlertId}
            />

            {historyAlerts.length > 0 && (
                <div className="space-y-4 pt-6 mt-6 border-t border-slate-200 dark:border-white/10">
                    <div className="flex justify-between items-center px-1">
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">History</h3>
                        <button
                            onClick={() => setShowHistory(s => !s)}
                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        >
                            {showHistory ? 'Hide history' : `Show history (${historyAlerts.length})`}
                        </button>
                    </div>
                    {showHistory && (
                        <AlertsTable
                            alerts={historyAlerts}
                            loading={loading}
                            search={search}
                            filter={filter}
                            actionLoading={actionLoading}
                            onAcknowledge={handleAcknowledge}
                            onResolve={handleResolve}
                            onViewTimeline={setTimelineAlertId}
                        />
                    )}
                </div>
            )}

            {/* Load more */}
            {nextCursor && (
                <div className="flex justify-center pt-4">
                    <button
                        onClick={() => fetchAlerts(nextCursor!, filter)}
                        disabled={loading}
                        className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shadow-sm border border-slate-200 dark:border-white/5"
                    >
                        {loading ? 'Loading…' : 'Load Older Alerts'}
                    </button>
                </div>
            )}

            {timelineAlertId && (
                <AlertTimelineDrawer
                    alertId={timelineAlertId}
                    onClose={() => setTimelineAlertId(null)}
                />
            )}
        </div>
    );
}
