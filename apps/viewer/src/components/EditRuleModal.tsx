import { useEffect, useState } from 'react';
import { type DeviceAlarmRule, type User, updateDeviceRule, listMyCompanyUsers } from '../lib/api';

interface EditRuleModalProps {
    rule: DeviceAlarmRule;
    onClose: () => void;
    onUpdated: (rule: DeviceAlarmRule) => void;
}

export default function EditRuleModal({ rule, onClose, onUpdated }: EditRuleModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [users, setUsers] = useState<User[]>([]);
    const [recipients, setRecipients] = useState<string[]>(
        rule.recipients ? rule.recipients.map(r => r.user.id) : []
    );

    const [threshold, setThreshold] = useState<number>(rule.threshold);
    const [durationMinutes, setDurationMinutes] = useState<number>(Math.floor(rule.duration_seconds / 60));
    const [enabled, setEnabled] = useState(rule.enabled);

    useEffect(() => {
        listMyCompanyUsers().then(setUsers).catch(console.error);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (recipients.length === 0) {
            setError('Please select at least one recipient.');
            return;
        }

        setLoading(true);

        try {
            const updated = await updateDeviceRule(rule.id, {
                threshold,
                duration_seconds: durationMinutes * 60,
                enabled,
                recipients
            });
            onUpdated(updated);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to update rule');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-white/10 w-full max-w-md overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Edit Alert Rule</h2>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 rounded text-sm border border-red-100 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    {/* Metric and Condition are readonly */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Metric</label>
                            <input
                                type="text"
                                disabled
                                value={rule.metric}
                                className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-500 dark:text-slate-400"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Condition</label>
                            <input
                                type="text"
                                disabled
                                value={rule.operator === 'gt' ? 'Greater Than (>)' : 'Less Than (<)'}
                                className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-500 dark:text-slate-400"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Threshold</label>
                            <input
                                type="number"
                                step="any"
                                required
                                value={threshold}
                                onChange={e => setThreshold(parseFloat(e.target.value))}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Delay (Mins)</label>
                            <input
                                type="number"
                                min="0"
                                required
                                value={durationMinutes}
                                onChange={e => setDurationMinutes(parseInt(e.target.value))}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1 mt-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Recipients (at least 1 required)</label>
                        <div className="max-h-32 overflow-y-auto w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-sm outline-none text-slate-900 dark:text-white flex flex-col gap-2">
                            {users.map(u => (
                                <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={recipients.includes(u.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) setRecipients(prev => [...prev, u.id]);
                                            else setRecipients(prev => prev.filter(id => id !== u.id));
                                        }}
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-slate-700 dark:text-slate-300">{u.name || u.email} ({u.role})</span>
                                </label>
                            ))}
                            {users.length === 0 && <span className="text-slate-400 italic">No users found</span>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 items-center">
                        <div className="flex items-center mt-4">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={e => setEnabled(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                                <span className="ml-3 text-sm font-medium text-slate-700 dark:text-slate-300">Enabled</span>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 mt-6 border-t border-slate-100 dark:border-white/5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg shadow hover:bg-blue-500 focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 transition-colors"
                        >
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
