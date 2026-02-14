import { useEffect, useState } from "react";

type Summary = {
  total_devices: number;
  red: number;
  amber: number;
  green: number;
  offline: number;
  open_alerts?: number;
  last_telemetry_at?: string | null;
};

export default function App() {
  const [data, setData] = useState<Summary | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        setError(null);

        // Fetch Summary
        const resSum = await fetch("http://127.0.0.1:3000/api/v1/dashboard/summary", {
          headers: { "X-Client-Id": "test-client" },
        });
        if (!resSum.ok) throw new Error(`Summary HTTP ${resSum.status}`);
        const jsonSum = (await resSum.json()) as Summary;
        setData(jsonSum);

        // Fetch Devices
        const resDev = await fetch("http://127.0.0.1:3000/api/v1/dashboard/devices?limit=50", {
          headers: { "X-Client-Id": "test-client" },
        });
        if (!resDev.ok) throw new Error(`Devices HTTP ${resDev.status}`);
        const jsonDev = await resDev.json();
        setDevices(jsonDev.data || []);

      } catch (e: any) {
        setError(e?.message ?? "Unknown error");
      }
    };

    run();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-slate-900/40 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-slate-300">Internal Viewer v0</div>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">Dashboard</h1>
            <div className="text-xs text-slate-400 mt-1">
              Source: /api/v1/dashboard (X-Client-Id: test-client)
            </div>
          </div>
          <div className="text-xs text-slate-400 text-right">
            {data?.last_telemetry_at ? (
              <>
                <div>Last telemetry</div>
                <div className="text-slate-200">{new Date(data.last_telemetry_at).toLocaleString()}</div>
              </>
            ) : (
              <div>Last telemetry: —</div>
            )}
          </div>
        </div>

        {/* Summary Tiles */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Total" value={data?.total_devices} />
          <Stat label="Red" value={data?.red} pill="bg-red-500/15 text-red-200 border-red-500/25" />
          <Stat label="Amber" value={data?.amber} pill="bg-amber-500/15 text-amber-200 border-amber-500/25" />
          <Stat label="Green" value={data?.green} pill="bg-emerald-500/15 text-emerald-200 border-emerald-500/25" />
          <Stat label="Offline" value={data?.offline} pill="bg-slate-500/15 text-slate-200 border-slate-500/25" />
        </div>

        {/* Device List */}
        <div className="mt-8">
          <h2 className="text-lg font-medium mb-4">Device List (Severity Order)</h2>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-slate-400 font-medium">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Temp</th>
                  <th className="p-3">Humidity</th>
                  <th className="p-3 text-right">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {devices.map((d) => (
                  <tr key={d.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 font-medium text-slate-200">{d.name}</td>
                    <td className="p-3">
                      <StatusBadge status={d.current_status?.status} />
                    </td>
                    <td className="p-3 tabular-nums text-slate-300">
                      {d.metrics?.temperature != null ? `${d.metrics.temperature}°C` : '—'}
                    </td>
                    <td className="p-3 tabular-nums text-slate-300">
                      {d.metrics?.humidity != null ? `${d.metrics.humidity}%` : '—'}
                    </td>
                    <td className="p-3 text-right text-xs text-slate-500 tabular-nums">
                      {d.latest_telemetry?.occurred_at
                        ? new Date(d.latest_telemetry.occurred_at).toLocaleString()
                        : 'Never'}
                    </td>
                  </tr>
                ))}
                {devices.length === 0 && !error && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 italic">
                      No devices found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            <div className="font-semibold">Fetch failed</div>
            <div className="mt-1 break-words">{error}</div>
            <div className="mt-2 text-xs text-red-200/80">
              Ensure API is running on port 3000 and CORS is enabled.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Types & Components
type Device = {
  id: string;
  name: string;
  current_status: { status: string } | null;
  latest_telemetry: { occurred_at: string } | null;
  metrics: { temperature: number | null; humidity: number | null };
};

function StatusBadge({ status }: { status?: string }) {
  let styles = "bg-slate-500/20 text-slate-400 border-slate-500/20";
  if (status === 'red') styles = "bg-red-500/20 text-red-300 border-red-500/20";
  if (status === 'amber') styles = "bg-amber-500/20 text-amber-300 border-amber-500/20";
  if (status === 'green') styles = "bg-emerald-500/20 text-emerald-300 border-emerald-500/20";
  if (status === 'offline') styles = "bg-slate-700/50 text-slate-400 border-slate-600/30";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles} capitalize`}>
      {status || 'Unknown'}
    </span>
  );
}

function Stat({
  label,
  value,
  pill,
}: {
  label: string;
  value?: number;
  pill?: string;
}) {
  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-3 ${pill ?? ""}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">
        {typeof value === "number" ? value : "—"}
      </div>
    </div>
  );
}
