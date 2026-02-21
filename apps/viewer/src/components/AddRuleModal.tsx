import { useState } from 'react';
import { type DeviceAlarmRule, createDeviceRule } from '../lib/api';

interface AddRuleModalProps {
    deviceId: string;
    onClose: () => void;
    onCreated: (rule: DeviceAlarmRule) => void;
}

export default function AddRuleModal({ deviceId, onClose, onCreated }: AddRuleModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [metric, setMetric] = useState('temperature');
    const [operator, setOperator] = useState<'gt' | 'lt'>('gt');
    const [threshold, setThreshold] = useState<number>(30);
    const [durationMinutes, setDurationMinutes] = useState<number>(5);
    const [enabled, setEnabled] = useState(true);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const rule = await createDeviceRule(deviceId, {
                metric,
                operator,
                threshold,
                duration_seconds: durationMinutes * 60,
                severity: 'red',
                enabled
            });
            onCreated(rule);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create rule');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-white/10 w-full max-w-md overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Add Alert Rule</h2>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 rounded text-sm border border-red-100 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Metric</label>
                            <select
                                value={metric} onChange={e => setMetric(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                            >
                                <option value="temperature">Temperature (°C)</option>
                                <option value="humidity">Humidity (%)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Condition</label>
                            <select
                                value={operator} onChange={e => setOperator(e.target.value as any)}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                            >
                                <option value="gt">Greater Than (&gt;)</option>
                                <option value="lt">Less Than (&lt;)</option>
                            </select>
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

                    <div className="grid grid-cols-2 gap-4 items-center">
                        <div className="flex items-center mt-6">
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
                            {loading ? 'Saving...' : 'Create Rule'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
