import { useState } from "react";
import { fetchClient } from "../lib/api";

interface ResolveAlertModalProps {
    alertId: string;
    onClose: () => void;
    onSuccess: (alertId: string) => void;
}

export default function ResolveAlertModal({ alertId, onClose, onSuccess }: ResolveAlertModalProps) {
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleResolve = async () => {
        setLoading(true);
        setError(null);
        try {
            await fetchClient(`/api/v1/alerts/${alertId}/resolve`, {
                method: "POST",
                body: JSON.stringify({ note: note.trim() || undefined }),
            });
            onSuccess(alertId);
            onClose();
        } catch (err: any) {
            setError(err?.message || "Failed to resolve alert");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-md mx-4 p-6 z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                            <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Resolve Alert</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
                    Mark this alert as manually resolved. Optionally add a note explaining what action was taken.
                </p>

                {/* Note */}
                <div className="mb-5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Resolution note <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        rows={3}
                        placeholder="e.g. Checked device — sensor recalibrated"
                        className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                </div>

                {error && (
                    <div className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleResolve}
                        disabled={loading}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-60 shadow-sm"
                    >
                        {loading ? "Resolving…" : "Resolve Alert"}
                    </button>
                </div>
            </div>
        </div>
    );
}
