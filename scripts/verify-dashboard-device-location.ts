
const API_URL = "http://127.0.0.1:3000/api/v1";

async function verify() {
    try {
        console.log("Fetching dashboard devices...");
        const res = await fetch(`${API_URL}/dashboard/devices?limit=10`, {
            headers: { "X-Client-Id": "test-client" }
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        const json = await res.json();
        const devices = json.data;

        if (!Array.isArray(devices)) {
            throw new Error("Response data is not an array");
        }

        console.log(`Found ${devices.length} devices.`);

        // Check first few devices for structure
        for (const d of devices) {
            if (d.site === undefined) throw new Error(`Device ${d.id} missing 'site' field (should be object or null)`);
            if (d.area === undefined) throw new Error(`Device ${d.id} missing 'area' field (should be object or null)`);

            // Log what we see
            const locStr = d.site ? (d.area ? `${d.site.name} > ${d.area.name}` : d.site.name) : "Unassigned";
            console.log(`Device ${d.name} (${d.id}): ${locStr}`);

            // If we have IDs we MUST have objects (unless names are missing in DB which shouldn't happen with our join)
            if (d.site_id && !d.site) console.warn(`WARNING: Device ${d.id} has site_id but no site object`);
            if (d.area_id && !d.area) console.warn(`WARNING: Device ${d.id} has area_id but no area object`);
        }

        console.log("OK");

    } catch (e: any) {
        console.error("Verification failed:", e.message);
        process.exit(1);
    }
}

verify();
