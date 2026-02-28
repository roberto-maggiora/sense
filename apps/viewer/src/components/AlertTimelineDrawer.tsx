import { useEffect, useState, useCallback } from "react";
import { fetchClient } from "../lib/api";
import { formatDateTime } from "../pages/Alerts";

type AlertEvent = {
    id: string;
    event_type: string;
    created_at: string;
    metadata_json: any;
};

type AlertContextInfo = {
    id: string;
    name: string;
    external_id?: string;
};

type AlertDetail = {
    id: string;
    status: string;
    severity: string;
    parameter?: string;
    opened_at: string;
    resolved_at?: string;
    acknowledged_at?: string;
    acknowledged_by?: any; // could be object or string or null
    duration_ms?: number;
    device?: any;
    context?: {
        device?: AlertContextInfo;
        site?: AlertContextInfo;
        area?: AlertContextInfo;
    };
};

const EVENT_LABELS: Record<string, string> = {
    created: "Alert triggered",
    updated: "Alert updated",
    triggered: "Violation persisted",
    acknowledged: "Acknowledged",
    snoozed: "Snoozed",
    resolved: "Resolved",
    auto_resolved: "Resolved automatically"
};

function displayName(v: any): string {
    if (v == null) return '—';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (typeof v === 'object' && 'name' in v && typeof (v as any).name === 'string') return (v as any).name;
    return '—';
}

function formatDurationMs(ms: number | null | undefined): string {
    if (ms == null) return "—";
    const totalMinutes = Math.floor(ms / 60000);
    if (totalMinutes === 0) return "<1m";
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function StatusBadge({ status, severity }: { status: string, severity?: string }) {
    if (status === 'resolved' || status === 'auto_resolved') {
        return <span className="inline-flex items-center px-2 py-0.5 rounded textxs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/20 capitalize">Resolved</span>;
    }
    if (status === 'acknowledged' || status === 'snoozed') {
        return <span className="inline-flex items-center px-2 py-0.5 rounded textxs font-medium border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/20 capitalize">{status}</span>;
    }

    // Active statuses
    let badgeClass = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/20';
    if (severity === 'red') {
        badgeClass = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/20';
    }

    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize ${badgeClass}`}>Active</span>;
}

function generateNarrative(alert: AlertDetail, events: AlertEvent[]): string[] {
    const lines: string[] = [];
    const openStr = formatDateTime(alert.opened_at);

    let locStr = "an unknown device";
    const ctx = alert.context;

    const devName = ctx?.device?.name ?? alert.device?.name ?? "Unknown Device";
    const siteName = ctx?.site?.name ?? alert.device?.site?.name ?? alert.device?.area?.site?.name ?? null;
    const areaName = ctx?.area?.name ?? alert.device?.area?.name ?? null;

    if (devName !== "Unknown Device") {
        locStr = `device "${devName}"`;
        if (siteName) locStr += ` at ${siteName}`;
        if (areaName) locStr += ` (${areaName})`;
    }

    lines.push(`This alert was triggered on ${openStr} for ${locStr}.`);

    const firstEvt = events.find(e => e.event_type === 'created');
    const meta = firstEvt?.metadata_json || {};

    // Fallbacks
    const threshold = meta.threshold ?? (alert.context?.device as any)?.threshold ?? (alert as any).threshold ?? null;
    const currentValue = meta.current_value ?? (alert as any).current_value ?? null;
    const severity = meta.severity ?? alert.severity;
    const operator = meta.operator ?? (alert as any).context_json?.operator ?? null;
    const parameter = alert.parameter || meta.metric || (alert as any).context_json?.metric || "metric";

    const ruleText = operator ? `breached the threshold (${operator} ${threshold})` : `breached the threshold (${threshold})`;

    lines.push(`Rule: ${parameter} ${threshold !== null ? ruleText : 'was violated'}.`);

    if (currentValue !== null) {
        lines.push(`First recorded value: ${currentValue}.`);
    }
    lines.push(`Severity: ${severity}.`);

    if (alert.acknowledged_at) {
        // find a note if exists
        const ackEvt = events.find(e => e.event_type === 'acknowledged' && e.metadata_json?.note);
        let noteStr = ackEvt?.metadata_json.note ? ` Note: "${ackEvt.metadata_json.note}"` : '';
        lines.push(`It was acknowledged on ${formatDateTime(alert.acknowledged_at)} by ${displayName(alert.acknowledged_by)}.${noteStr}`);
    } else if (alert.status !== 'resolved' && alert.status !== 'auto_resolved') {
        lines.push(`It has not been acknowledged yet.`);
    }

    if (alert.resolved_at) {
        // Detect if auto_resolved
        const autoEvt = events.find(e => e.event_type === 'auto_resolved' || e.event_type === 'auto-resolved');
        const manEvt = events.find(e => e.event_type === 'resolved');

        if (autoEvt || alert.status === 'auto_resolved') {
            lines.push(`Resolved automatically on ${formatDateTime(alert.resolved_at)}.`);
        } else if (manEvt || alert.status === 'resolved') {
            const actor = manEvt?.metadata_json?.name || manEvt?.metadata_json?.actor || 'a user';
            lines.push(`Resolved manually on ${formatDateTime(alert.resolved_at)} by ${displayName(actor)}.`);
        }
    } else {
        lines.push(`Still active.`);
    }

    return lines;
}

function AlertEventItem({ evt, isLast }: { evt: AlertEvent; isLast: boolean }) {
    const [expanded, setExpanded] = useState(false);

    let label = EVENT_LABELS[evt.event_type] || evt.event_type;
    const meta = evt.metadata_json || {};
    const hasMeta = Object.keys(meta).length > 0;

    if (evt.event_type === 'snoozed' && meta.snoozed_until) {
        label = `Snoozed until ${formatDateTime(meta.snoozed_until).split(', ')[1]}`;
    }

    const chips: React.ReactNode[] = [];

    if (meta.severity || (meta.old_severity && meta.new_severity)) {
        chips.push(
            <span key="sev" className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                Sev: {meta.old_severity && meta.new_severity ? `${meta.old_severity}→${meta.new_severity}` : meta.severity}
            </span>
        );
    }

    if (meta.threshold !== undefined || (meta.old_threshold !== undefined && meta.new_threshold !== undefined)) {
        chips.push(
            <span key="thr" className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                Thr: {meta.old_threshold !== undefined && meta.new_threshold !== undefined ? `${meta.old_threshold}→${meta.new_threshold}` : meta.threshold}
            </span>
        );
    }
    if (meta.current_value !== undefined) {
        chips.push(
            <span key="val" className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                Val: {meta.current_value}
            </span>
        );
    }
    if (meta.note) {
        chips.push(
            <span key="note" className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded text-[11px] truncate max-w-[120px]" title={meta.note}>
                Note: {meta.note}
            </span>
        );
    }

    // Default tag if no specific chips but has details
    if (chips.length === 0 && hasMeta) {
        chips.push(
            <span key="det" className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                Metadata attached
            </span>
        );
    }

    return (
        <div className={`relative pl-6 ${!isLast ? 'border-l-2 border-slate-200 dark:border-slate-700 pb-6' : 'pb-2'}`}>
            <div className={`absolute w-2.5 h-2.5 rounded-full -left-[6px] top-1.5 ring-4 ring-white dark:ring-slate-900 ${['resolved', 'auto_resolved'].includes(evt.event_type) ? 'bg-emerald-500' :
                ['acknowledged'].includes(evt.event_type) ? 'bg-blue-500' :
                    'bg-slate-400 dark:bg-slate-500'
                }`} />
            <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight">
                    {label}
                </span>
                <span className="text-xs text-slate-500 mt-0.5">
                    {formatDateTime(evt.created_at)}
                </span>

                {chips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {chips}
                    </div>
                )}

                {hasMeta && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-2 self-start font-medium transition-colors focus:outline-none"
                    >
                        {expanded ? 'Hide JSON details' : 'View context'}
                    </button>
                )}

                {hasMeta && expanded && (
                    <div className="mt-2 text-[11px] leading-relaxed font-mono bg-slate-50 dark:bg-white/5 p-3 rounded-lg text-slate-600 dark:text-slate-400 overflow-auto max-h-48 whitespace-pre border border-slate-200 dark:border-white/10 shadow-inner">
                        <pre>{JSON.stringify(meta, null, 2)}</pre>
                    </div>
                )}
            </div>
        </div>
    );
}

export function AlertTimelineDrawer({
    alertId,
    onClose
}: {
    alertId: string;
    onClose: () => void;
}) {
    const [alertDetail, setAlertDetail] = useState<AlertDetail | null>(null);
    const [events, setEvents] = useState<AlertEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch both in parallel
            const [alrt, evts] = await Promise.all([
                fetchClient(`/api/v1/alerts/${alertId}`),
                fetchClient(`/api/v1/alerts/${alertId}/events`)
            ]);

            setAlertDetail(alrt);
            setEvents(evts.events || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load alert details');
        } finally {
            setLoading(false);
        }
    }, [alertId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const handleCopyId = () => {
        navigator.clipboard.writeText(alertId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-white/10 shadow-2xl z-50 flex flex-col transition-transform">

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200 dark:border-white/10 shrink-0 bg-white dark:bg-slate-800/50">
                <div className="flex flex-col">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Incident Summary</h2>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            Alert ID: {alertId.split('-')[0]}…
                        </span>
                        <button
                            onClick={handleCopyId}
                            className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors focus:outline-none"
                            title="Copy full ID"
                        >
                            {copied ? (
                                <span className="text-emerald-500 flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    Copied
                                </span>
                            ) : (
                                <span className="flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                    Copy
                                </span>
                            )}
                        </button>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors focus:outline-none"
                    aria-label="Close"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto w-full">
                {loading && (
                    <div className="flex flex-col items-center justify-center h-[300px] space-y-3 opacity-70">
                        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading incident data…</p>
                    </div>
                )}

                {error && (
                    <div className="flex flex-col items-center justify-center h-[300px] space-y-4 px-6 text-center">
                        <div className="p-3 bg-red-50 dark:bg-red-500/10 rounded-full">
                            <svg className="w-6 h-6 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Couldn’t load timeline</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{error}</p>
                        </div>
                        <button
                            onClick={loadData}
                            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {!loading && !error && alertDetail && (
                    <div className="p-6 space-y-6">

                        {/* Summary Block */}
                        <div className="bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">

                            {/* Context Row */}
                            <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5 flex flex-wrap gap-2 justify-between items-start bg-slate-50/50 dark:bg-transparent">
                                <div className="flex flex-col min-w-[200px]">
                                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                                        {alertDetail.context?.device?.name || alertDetail.device?.name || 'Unknown Device'}
                                        {(alertDetail.context?.device?.external_id || alertDetail.device?.external_id) && <span className="ml-2 font-mono text-[10px] text-slate-500 border border-slate-200 dark:border-slate-700 px-1 py-0.5 rounded">{alertDetail.context?.device?.external_id || alertDetail.device?.external_id}</span>}
                                    </span>
                                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        {(alertDetail.context?.site?.name ?? alertDetail.device?.site?.name ?? alertDetail.device?.area?.site?.name) ? (alertDetail.context?.site?.name ?? alertDetail.device?.site?.name ?? alertDetail.device?.area?.site?.name) : 'Unassigned Site'}
                                        {(alertDetail.context?.area?.name ?? alertDetail.device?.area?.name) ? ` › ${(alertDetail.context?.area?.name ?? alertDetail.device?.area?.name)}` : ''}
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    {alertDetail.parameter && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded textxs font-medium border bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600 capitalize">
                                            {alertDetail.parameter}
                                        </span>
                                    )}
                                    <StatusBadge status={alertDetail.status} severity={alertDetail.severity} />
                                </div>
                            </div>

                            {/* Timing Row */}
                            <div className="px-4 py-4 grid grid-cols-2 gap-4 text-sm bg-white dark:bg-slate-800">
                                <div className="flex flex-col">
                                    <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Time opened</span>
                                    <span className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{formatDateTime(alertDetail.opened_at)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Duration</span>
                                    <span className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{alertDetail.resolved_at ? formatDurationMs(alertDetail.duration_ms) : (
                                        <span className="text-amber-600 dark:text-amber-500 font-semibold italic flex items-center gap-1">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                            </span>
                                            Still active &mdash; {formatDurationMs(Date.now() - new Date(alertDetail.opened_at).getTime())}
                                        </span>
                                    )}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Resolution time</span>
                                    <span className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                                        {alertDetail.resolved_at ? formatDateTime(alertDetail.resolved_at) : '—'}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Acknowledged by</span>
                                    <span className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 truncate" title={alertDetail.acknowledged_at ? `${displayName(alertDetail.acknowledged_by)} at ${formatDateTime(alertDetail.acknowledged_at)}` : ''}>
                                        {alertDetail.acknowledged_at ? displayName(alertDetail.acknowledged_by) : '—'}
                                    </span>
                                </div>
                            </div>

                            {/* Narrative Row */}
                            <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-white/5 text-sm text-slate-600 dark:text-slate-300">
                                {generateNarrative(alertDetail, events).map((line, idx) => (
                                    <p key={idx} className={`${idx > 0 ? "mt-1.5" : ""} leading-relaxed`}>{line}</p>
                                ))}
                            </div>
                        </div>

                        {/* Audit Timeline */}
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 px-1">Audit Timeline</h3>

                            {events.length === 0 ? (
                                <div className="bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-white/10 p-6 flex flex-col items-center justify-center text-center opacity-70">
                                    <svg className="w-8 h-8 text-slate-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No timeline events recorded yet.</p>
                                </div>
                            ) : (
                                <div className="py-2 pl-2">
                                    {events.map((evt, idx) => (
                                        <AlertEventItem
                                            key={evt.id}
                                            evt={evt}
                                            isLast={idx === events.length - 1}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
