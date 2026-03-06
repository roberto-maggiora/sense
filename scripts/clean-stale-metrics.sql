-- USE THIS TO DEBUG/CLEAN STALE METRICS FOR A SPECIFIC DEVICE
-- This script safely removes co2, barometric_pressure, and concentration from the top-level payload JSON 
-- of recent telemetry events for a specific device, hiding them from the Dashboard 7-day rolling window.
--
-- Replace <YOUR_DEVICE_ID> with the actual UUID of the device.

UPDATE "telemetry_events" 
SET payload = payload::jsonb - 'co2' - 'barometric_pressure' - 'concentration'
WHERE device_id = '<YOUR_DEVICE_ID>' 
  AND occurred_at >= NOW() - INTERVAL '7 days';

-- If you also need to wipe out the raw nested Milesight data for those specific metrics, 
-- you can run a targeted delete or simply delete the test telemetry rows entirely if they are no longer needed:
-- DELETE FROM "telemetry_events" WHERE device_id = '<YOUR_DEVICE_ID>' AND ... ;
