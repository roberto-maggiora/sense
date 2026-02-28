-- Create function to prevent modifications
CREATE OR REPLACE FUNCTION prevent_alert_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'alert_events are immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to alert_events table
CREATE TRIGGER trg_prevent_alert_events_mutation
BEFORE UPDATE OR DELETE ON alert_events
FOR EACH ROW
EXECUTE FUNCTION prevent_alert_events_mutation();