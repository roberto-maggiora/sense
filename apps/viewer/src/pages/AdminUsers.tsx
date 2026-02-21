import { useEffect, useState } from "react";
import { type User, type Client, listUsers, createUser, updateUserAdmin, listClients } from "../lib/api";

export default function AdminUsers() {
    const [clients, setClients] = useState<Client[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [users, setUsers] = useState<User[]>([]);

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [newEmail, setNewEmail] = useState('');
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState('VIEWER');
    const [creating, setCreating] = useState(false);

    // Initial load: get clients to populate dropdown
    useEffect(() => {
        listClients(false).then(res => {
            setClients(res);
            if (res.length > 0) setSelectedClientId(res[0].id);
            setLoading(false);
        }).catch(e => {
            setError(e.message || "Failed to load clients");
            setLoading(false);
        });
    }, []);

    // Load users when client changes
    useEffect(() => {
        if (!selectedClientId) {
            setUsers([]);
            return;
        }
        fetchUsers();
    }, [selectedClientId]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const data = await listUsers(selectedClientId, true);
            setUsers(data);
            setError(null);
        } catch (e: any) {
            setError(e?.message ?? "Failed to load users");
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmail.trim() || !selectedClientId) return;

        try {
            setCreating(true);
            await createUser({
                client_id: selectedClientId,
                email: newEmail.trim(),
                name: newName.trim() || undefined,
                role: newRole
            });
            setNewEmail('');
            setNewName('');
            setNewRole('VIEWER');
            await fetchUsers();
        } catch (e: any) {
            alert(e?.message || "Failed to create user");
        } finally {
            setCreating(false);
        }
    };

    const toggleStatus = async (user: User) => {
        try {
            const newDisabledAt = user.disabled_at ? null : new Date().toISOString();
            await updateUserAdmin(user.id, { disabled_at: newDisabledAt });
            await fetchUsers();
        } catch (e: any) {
            alert(e?.message || "Failed to update status");
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-8">
            <h1 className="text-2xl font-bold mb-6 dark:text-white">Admin &gt; Users</h1>

            {error && (
                <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
                    {error}
                </div>
            )}

            <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Client</label>
                <select
                    className="w-full max-w-sm px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-900 dark:border-white/20 dark:text-white"
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    disabled={loading}
                >
                    <option value="" disabled>Select a client...</option>
                    {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>

            {selectedClientId && (
                <>
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-white/10 mb-8">
                        <h2 className="text-lg font-semibold mb-4 dark:text-white">Create User</h2>
                        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Email *</label>
                                <input
                                    type="email"
                                    required
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-900 dark:border-white/20 dark:text-white"
                                    value={newEmail}
                                    onChange={e => setNewEmail(e.target.value)}
                                    disabled={creating}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Name</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-900 dark:border-white/20 dark:text-white"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    disabled={creating}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Role</label>
                                <select
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-900 dark:border-white/20 dark:text-white"
                                    value={newRole}
                                    onChange={e => setNewRole(e.target.value)}
                                    disabled={creating}
                                >
                                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                                    <option value="CLIENT_ADMIN">CLIENT_ADMIN</option>
                                    <option value="SITE_ADMIN">SITE_ADMIN</option>
                                    <option value="VIEWER">VIEWER</option>
                                </select>
                            </div>
                            <div>
                                <button
                                    type="submit"
                                    disabled={creating || !newEmail.trim()}
                                    className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                                >
                                    {creating ? "Creating..." : "Create User"}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden">
                        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 font-medium border-b border-slate-200 dark:border-white/10">
                                <tr>
                                    <th className="px-6 py-4">Email</th>
                                    <th className="px-6 py-4">Name</th>
                                    <th className="px-6 py-4">Role</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                {loading && users.length === 0 ? (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center">Loading...</td></tr>
                                ) : users.length === 0 ? (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No users found.</td></tr>
                                ) : users.map(user => (
                                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                                        <td className="px-6 py-4 font-medium dark:text-white">
                                            {user.email}
                                        </td>
                                        <td className="px-6 py-4">
                                            {user.name || <span className="text-slate-400 italic">None</span>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs font-mono">{user.role}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {user.disabled_at ? (
                                                <span className="px-2.5 py-1 bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 rounded-full text-xs font-semibold">Disabled</span>
                                            ) : (
                                                <span className="px-2.5 py-1 bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300 rounded-full text-xs font-semibold">Active</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => toggleStatus(user)}
                                                className={`text-sm font-medium ${user.disabled_at ? 'text-green-600 hover:text-green-800' : 'text-red-600 hover:text-red-800'}`}
                                            >
                                                {user.disabled_at ? "Enable" : "Disable"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
