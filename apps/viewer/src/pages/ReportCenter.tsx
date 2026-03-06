import { Link } from "react-router-dom";

export default function ReportCenterPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Report Center</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Generate compliance and operational reports
                    </p>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

                    {/* Active Card */}
                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
                        <div className="p-6 flex flex-col flex-1">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Asset Compliance Report</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6 flex-1">
                                Generate a compliance PDF for Temperature or Humidity over a selected period, including thresholds and breach analysis.
                            </p>
                            <Link
                                to="/reports/asset-compliance"
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                            >
                                Open
                            </Link>
                        </div>
                    </div>

                    {/* Placeholder Card 1 */}
                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 shadow-sm flex flex-col h-full opacity-70">
                        <div className="p-6 flex flex-col flex-1 relative">
                            <div className="absolute top-4 right-4">
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                    Coming soon
                                </span>
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white pr-20">Operational Summary</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6 flex-1">
                                Comprehensive system overview including offline device trends, alert resolution times, and system health metrics.
                            </p>
                            <button
                                disabled
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-sm font-semibold rounded-lg cursor-not-allowed"
                            >
                                Unavailable
                            </button>
                        </div>
                    </div>

                    {/* Placeholder Card 2 */}
                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 shadow-sm flex flex-col h-full opacity-70">
                        <div className="p-6 flex flex-col flex-1 relative">
                            <div className="absolute top-4 right-4">
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                    Coming soon
                                </span>
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white pr-20">Device Inventory</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6 flex-1">
                                Export a full list of devices across all sites and areas, including firmware versions and battery status.
                            </p>
                            <button
                                disabled
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-sm font-semibold rounded-lg cursor-not-allowed"
                            >
                                Unavailable
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
