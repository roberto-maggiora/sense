import { useState, useEffect } from "react";
import { type Site, listSites, createDevice, registerHub } from "../lib/api";

type AddDeviceModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
};

export default function AddDeviceModal({ isOpen, onClose, onSuccess }: AddDeviceModalProps) {
    const [sites, setSites] = useState<Site[]>([]);
    const [loadingSites, setLoadingSites] = useState(true);

    const [tab, setTab] = useState<'sensor' | 'hub'>('sensor');

    // Sensor State
    const [name, setName] = useState("");
    const [source, setSource] = useState("milesight");
    const [externalId, setExternalId] = useState("");
    const [siteId, setSiteId] = useState("");
    const [manufacturer, setManufacturer] = useState("");
    const [model, setModel] = useState("");

    // Hub State
    const [hubSerial, setHubSerial] = useState("");
    const [hubFriendlyName, setHubFriendlyName] = useState("");

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [extIdError, setExtIdError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        setLoadingSites(true);
        listSites()
            .then(setSites)
            .catch(console.error)
            .finally(() => setLoadingSites(false));

        // Reset form
        setTab("sensor");
        setName("");
        setSource("milesight");
        setExternalId("");
        setSiteId("");
        setManufacturer("Milesight"); // sensible default for default source
        setModel("");
        setHubSerial("");
        setHubFriendlyName("");
        setError(null);
        setExtIdError(null);
    }, [isOpen]);

    if (!isOpen) return null;

    const validateMilesightId = (val: string) => {
        const normalized = val.trim().replace(/[\s:-]/g, "");
        const isValid =
            /^[0-9a-fA-F]{16}$/.test(normalized) || /^DEMO_[A-Za-z0-9_]+$/.test(normalized);
        return { normalized, isValid };
    };

    // Hawk sensor IDs are numeric strings (your sensor serial like "11042")
    const validateHawkId = (val: string) => {
        const normalized = val.trim();
        const isValid = /^[0-9]{3,20}$/.test(normalized); // keep it basic; adjust later if needed
        return { normalized, isValid };
    };

    const handleExternalIdBlur = () => {
        if (!externalId) return;

        if (source === "milesight") {
            const { normalized, isValid } = validateMilesightId(externalId);
            setExternalId(normalized);
            setExtIdError(isValid ? null : "Must be a 16-hex DevEUI or DEMO_ ID");
            return;
        }

        if (source === "hawk") {
            const { normalized, isValid } = validateHawkId(externalId);
            setExternalId(normalized);
            setExtIdError(isValid ? null : "Must be a numeric sensor ID (e.g. 11042)");
            return;
        }

        setExtIdError(null);
    };

    const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newSource = e.target.value;
        setSource(newSource);

        if (newSource === "milesight") {
            setManufacturer("Milesight");
            setModel(""); // or leave if you prefer
        }

        if (newSource === "hawk") {
            setManufacturer("Hawk");
            setModel(""); // Hawk sensors don’t have AM304L-style models
        }

        setExtIdError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (tab === 'hub') {
            setIsSubmitting(true);
            try {
                await registerHub({ serial: hubSerial.trim(), friendly_name: hubFriendlyName.trim() || undefined });
                alert("Hub registered. Waiting for heartbeat...");
                onSuccess();
                onClose();
            } catch (err: any) {
                setError(err?.message || "Failed to register hub");
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        // Validate & normalize external id per source before submit (Sensor branch)
        let finalExtId = externalId;

        if (source === "milesight") {
            const { normalized, isValid } = validateMilesightId(externalId);
            finalExtId = normalized;
            setExternalId(normalized);
            if (!isValid) {
                setExtIdError("Must be a 16-hex DevEUI or DEMO_ ID");
                return;
            }
        }

        if (source === "hawk") {
            const { normalized, isValid } = validateHawkId(externalId);
            finalExtId = normalized;
            setExternalId(normalized);
            if (!isValid) {
                setExtIdError("Must be a numeric sensor ID (e.g. 11042)");
                return;
            }
        }

        setIsSubmitting(true);
        try {
            await createDevice({
                name,
                source,
                external_id: finalExtId,
                site_id: siteId || null,
                manufacturer: manufacturer || null,
                model: model || null,
            });

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err?.message || "Failed to create device");
        } finally {
            setIsSubmitting(false);
        }
    };

    const externalIdPlaceholder =
        source === "milesight"
            ? "devEUI (e.g. 03678c01046879ab or DEMO_...)"
            : source === "hawk"
                ? "Sensor ID (e.g. 11042)"
                : "Unique Identifier";

    const externalIdHelp =
        source === "milesight"
            ? "16-hex DevEUI (e.g. 03678c01046879ab) or Milesight demo IDs (e.g. DEMO_...)"
            : source === "hawk"
                ? "Numeric sensor serial number"
                : "The unique hardware ID the device sends data with.";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add Device</h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex border-b border-slate-200 dark:border-white/10 relative z-10 px-6">
                    <button
                        className={`py-3 px-2 text-sm font-medium border-b-2 mr-4 ${tab === 'sensor' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        onClick={() => setTab('sensor')}
                    >
                        Add sensor
                    </button>
                    <button
                        className={`py-3 px-2 text-sm font-medium border-b-2 ${tab === 'hub' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        onClick={() => setTab('hub')}
                    >
                        Register hub
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {error && (
                        <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-4 text-sm text-red-600 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    <form id="add-device-form" onSubmit={handleSubmit} className="space-y-4">
                        {tab === 'sensor' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Source <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        required
                                        value={source}
                                        onChange={handleSourceChange}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="milesight">Milesight</option>
                                        <option value="hawk">Hawk</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        External ID <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={externalId}
                                        onChange={(e) => {
                                            setExternalId(e.target.value);
                                            if (extIdError) setExtIdError(null);
                                        }}
                                        onBlur={handleExternalIdBlur}
                                        placeholder={externalIdPlaceholder}
                                        className={`w-full px-3 py-2 rounded-lg border ${extIdError
                                            ? "border-red-500 focus:ring-red-500"
                                            : "border-slate-300 dark:border-white/10 focus:ring-blue-500"
                                            } bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2`}
                                    />
                                    <p className="text-xs text-slate-500 mt-1">{externalIdHelp}</p>
                                    {extIdError && <p className="text-xs text-red-500 mt-1">{extIdError}</p>}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Manufacturer
                                        </label>
                                        <input
                                            type="text"
                                            value={manufacturer}
                                            onChange={(e) => setManufacturer(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Model
                                        </label>
                                        <input
                                            type="text"
                                            value={model}
                                            onChange={(e) => setModel(e.target.value)}
                                            placeholder={source === "milesight" ? "AM304L" : ""}
                                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Site
                                    </label>
                                    <select
                                        value={siteId}
                                        onChange={(e) => setSiteId(e.target.value)}
                                        disabled={loadingSites}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                    >
                                        <option value="">None (Unassigned)</option>
                                        {sites.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}

                        {tab === 'hub' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Hub Serial <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={hubSerial}
                                        onChange={(e) => setHubSerial(e.target.value)}
                                        placeholder="e.g. E831CDE75C64"
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Found on the bottom of the device.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Friendly Name
                                    </label>
                                    <input
                                        type="text"
                                        value={hubFriendlyName}
                                        onChange={(e) => setHubFriendlyName(e.target.value)}
                                        placeholder="e.g. Main Hall Hub"
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </>
                        )}
                    </form>
                </div>

                <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-end gap-3 sticky bottom-0 z-10">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="add-device-form"
                        disabled={isSubmitting || !!extIdError}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSubmitting ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                {tab === 'hub' ? 'Registering...' : 'Creating...'}
                            </>
                        ) : (
                            tab === 'hub' ? 'Register Hub' : 'Create Device'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}