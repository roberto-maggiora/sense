
export type DeviceWithLocation = {
    site_id?: string | null;
    area_id?: string | null;
    site?: { name: string } | null;
    area?: { name: string } | null;
};

export function formatDeviceLocation(device: DeviceWithLocation | null | undefined): string {
    if (!device) return "";

    // Case 1: Site and Area
    if (device.site?.name && device.area?.name) {
        return `${device.site.name} › ${device.area.name}`;
    }

    // Case 2: Only Site
    if (device.site?.name) {
        return device.site.name;
    }

    // Case 3: Assigned IDs but names missing (shouldn't happen with updated API, but fallback)
    if (device.site_id) {
        // Fallback if we have ID but no name (e.g. data consistency issue or API partial response)
        return "Assigned (Loading...)";
    }

    // Case 4: Unassigned
    return "Unassigned";
}
