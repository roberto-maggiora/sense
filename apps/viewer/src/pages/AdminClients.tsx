import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Client, listClients, createClient, updateClientAdmin } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function AdminClients() {
    const navigate = useNavigate();
    const { setSelectedClientId } = useAuth();
    const [clients, setClients] = useState<Client[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [newClientName, setNewClientName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        try {
            setLoading(true);
            const data = await listClients(true);
            setClients(data);
            setError(null);
        } catch (e: any) {
            setError(e?.message ?? "Failed to load clients");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newClientName.trim()) return;

        try {
            setCreating(true);
            await createClient(newClientName.trim());
            setNewClientName('');
            await fetchClients();
        } catch (e: any) {
            alert(e?.message || "Failed to create client");
        } finally {
            setCreating(false);
        }
    };

    const toggleStatus = async (client: Client) => {
        try {
            const newDisabledAt = client.disabled_at ? null : new Date().toISOString();
            await updateClientAdmin(client.id, { disabled_at: newDisabledAt });
            await fetchClients();
        } catch (e: any) {
            alert(e?.message || "Failed to update status");
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-8">
            <h1 className="text-2xl font-bold mb-6 dark:text-white">Admin &gt; Clients</h1>

            {error && (
                <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
                    {error}
                </div>
            )}

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-white/10 mb-8">
                <h2 className="text-lg font-semibold mb-4 dark:text-white">Create Client</h2>
                <form onSubmit={handleCreate} className="flex gap-4">
                    <input
                        type="text"
                        placeholder="Client Name"
                        className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-900 dark:border-white/20 dark:text-white"
                        value={newClientName}
                        onChange={e => setNewClientName(e.target.value)}
                        disabled={creating}
                    />
                    <button
                        type="submit"
                        disabled={creating || !newClientName.trim()}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                    >
                        {creating ? "Creating..." : "Create"}
                    </button>
                </form>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 font-medium border-b border-slate-200 dark:border-white/10">
                        <tr>
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">ID</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {loading && clients.length === 0 ? (
                            <tr><td colSpan={4} className="px-6 py-8 text-center">Loading...</td></tr>
                        ) : clients.length === 0 ? (
                            <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">No clients found.</td></tr>
                        ) : clients.map(client => (
                            <tr key={client.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                                <td className="px-6 py-4 font-medium dark:text-white">
                                    {client.name}
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-slate-400">
                                    {client.id}
                                </td>
                                <td className="px-6 py-4">
                                    {client.disabled_at ? (
                                        <span className="px-2.5 py-1 bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 rounded-full text-xs font-semibold">Disabled</span>
                                    ) : (
                                        <span className="px-2.5 py-1 bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300 rounded-full text-xs font-semibold">Active</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                                    <button
                                        onClick={() => {
                                            setSelectedClientId(client.id, client.name);
                                            navigate('/');
                                        }}
                                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                                    >
                                        Open
                                    </button>
                                    <button
                                        onClick={() => toggleStatus(client)}
                                        className={`text-sm font-medium ${client.disabled_at ? 'text-green-600 hover:text-green-800' : 'text-red-600 hover:text-red-800'}`}
                                    >
                                        {client.disabled_at ? "Enable" : "Disable"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
