
import { useEffect, useState } from "react";

import { createArea, createSite, listAreas, listSites, updateArea, updateSite, type Area, type Site } from "../lib/api";

export default function SitesPage() {
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedSite, setSelectedSite] = useState<Site | null>(null);
    const [areas, setAreas] = useState<Area[]>([]);
    const [loadingSites, setLoadingSites] = useState(true);
    const [loadingAreas, setLoadingAreas] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [newSiteName, setNewSiteName] = useState("");
    const [newAreaName, setNewAreaName] = useState("");
    const [creatingSite, setCreatingSite] = useState(false);
    const [creatingArea, setCreatingArea] = useState(false);

    useEffect(() => {
        fetchSites();
    }, []);

    useEffect(() => {
        if (selectedSite) {
            fetchAreas(selectedSite.id);
        } else {
            setAreas([]);
        }
    }, [selectedSite]);

    const fetchSites = async () => {
        setLoadingSites(true);
        try {
            const data = await listSites(true);
            setSites(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoadingSites(false);
        }
    };

    const fetchAreas = async (siteId: string) => {
        setLoadingAreas(true);
        try {
            const data = await listAreas(siteId, true);
            setAreas(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoadingAreas(false);
        }
    };

    const handleCreateSite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSiteName.trim()) return;
        setCreatingSite(true);
        try {
            const site = await createSite(newSiteName);
            setSites([site, ...sites]);
            setNewSiteName("");
            setSelectedSite(site); // Select the new site
        } catch (e: any) {
            alert(e.message || "Failed to create site");
        } finally {
            setCreatingSite(false);
        }
    };

    const handleCreateArea = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAreaName.trim() || !selectedSite) return;
        setCreatingArea(true);
        try {
            const area = await createArea(selectedSite.id, newAreaName);
            setAreas([area, ...areas]);
            setNewAreaName("");
        } catch (e: any) {
            alert(e.message || "Failed to create area");
        } finally {
            setCreatingArea(false);
        }
    };

    const toggleSiteDisabled = async (site: Site) => {
        try {
            const updated = await updateSite(site.id, { disabled: !site.disabled_at });
            setSites(sites.map(s => s.id === site.id ? updated : s));
            if (selectedSite?.id === site.id) {
                setSelectedSite(updated);
            }
        } catch (e: any) {
            alert(e.message);
        }
    };

    const toggleAreaDisabled = async (area: Area) => {
        try {
            const updated = await updateArea(area.id, { disabled: !area.disabled_at });
            setAreas(areas.map(a => a.id === area.id ? updated : a));
        } catch (e: any) {
            alert(e.message);
        }
    };

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Sites & Areas</h1>

            {error && <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}

            <div className="flex flex-1 gap-6 min-h-0">
                {/* Sites Column */}
                <div className="w-1/3 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                        <h2 className="font-semibold text-slate-900 dark:text-white mb-3">Sites</h2>
                        <form onSubmit={handleCreateSite} className="flex gap-2">
                            <input
                                type="text"
                                placeholder="New Site Name"
                                className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-white/20 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={newSiteName}
                                onChange={e => setNewSiteName(e.target.value)}
                            />
                            <button
                                type="submit"
                                disabled={creatingSite || !newSiteName.trim()}
                                className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-500 disabled:opacity-50"
                            >
                                Add
                            </button>
                        </form>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {loadingSites ? (
                            <div className="p-4 text-center text-slate-500 text-sm">Loading...</div>
                        ) : sites.length === 0 ? (
                            <div className="p-4 text-center text-slate-500 text-sm">No sites found.</div>
                        ) : (
                            sites.map(site => (
                                <div
                                    key={site.id}
                                    onClick={() => setSelectedSite(site)}
                                    className={`p-3 rounded-lg cursor-pointer transition-colors flex justify-between items-center group ${selectedSite?.id === site.id
                                        ? 'bg-blue-50 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30'
                                        : 'hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent'
                                        }`}
                                >
                                    <div className="min-w-0">
                                        <div className={`font-medium truncate ${site.disabled_at ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                                            {site.name}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleSiteDisabled(site); }}
                                        className={`text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${site.disabled_at
                                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                                            }`}
                                    >
                                        {site.disabled_at ? 'Enable' : 'Disable'}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Areas Column */}
                <div className="w-2/3 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                        <h2 className="font-semibold text-slate-900 dark:text-white mb-3">
                            {selectedSite ? `Areas in ${selectedSite.name}` : 'Areas'}
                        </h2>
                        {selectedSite ? (
                            <form onSubmit={handleCreateArea} className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="New Area Name"
                                    className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-white/20 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={newAreaName}
                                    onChange={e => setNewAreaName(e.target.value)}
                                />
                                <button
                                    type="submit"
                                    disabled={creatingArea || !newAreaName.trim()}
                                    className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-500 disabled:opacity-50"
                                >
                                    Add
                                </button>
                            </form>
                        ) : (
                            <div className="text-sm text-slate-500 h-[2.125rem] flex items-center">Select a site to manage areas</div>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {!selectedSite ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <svg className="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                <p>Select a site on the left</p>
                            </div>
                        ) : loadingAreas ? (
                            <div className="p-4 text-center text-slate-500 text-sm">Loading...</div>
                        ) : areas.length === 0 ? (
                            <div className="p-4 text-center text-slate-500 text-sm">No areas found in this site.</div>
                        ) : (
                            areas.map(area => (
                                <div
                                    key={area.id}
                                    className="p-3 rounded-lg border border-slate-100 dark:border-white/5 flex justify-between items-center group hover:bg-slate-50 dark:hover:bg-white/5"
                                >
                                    <div className={`font-medium ${area.disabled_at ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                                        {area.name}
                                    </div>
                                    <button
                                        onClick={() => toggleAreaDisabled(area)}
                                        className={`text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${area.disabled_at
                                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                                            }`}
                                    >
                                        {area.disabled_at ? 'Enable' : 'Disable'}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
