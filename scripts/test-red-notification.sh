#!/bin/bash
set -e

# API Base URL
API_URL="http://localhost:3000"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Testing Alert Notifications (Red Transition Only)..."

# 1. Setup - Create unique source to avoid conflict
TIMESTAMP=$(date +%s)
SOURCE="notif_test_${TIMESTAMP}"
DEVICE_ID="ext_${TIMESTAMP}"
echo "Using Source: ${SOURCE}, External ID: ${DEVICE_ID}"

# Create a deterministic seed script for this test
cat <<EOF > scripts/seed-notif-test.ts
import { prisma } from '@sense/database';

async function main() {
    // 1. Ensure Unique Client
    const client = await prisma.client.create({ data: { name: 'Notif Test Client ${TIMESTAMP}' } });

    // 2. Create Device
    const device = await prisma.device.create({
        data: {
            client_id: client.id,
            source: 'milesight',
            external_id: '${DEVICE_ID}',
            name: 'Notification Test Device'
        }
    });

    // 3. Create Alert Rule (Temp > 50, duration = 5s)
    await prisma.alertRule.create({
        data: {
            client_id: client.id,
            scope_type: 'device',
            scope_id: device.id,
            parameter: 'temperature',
            operator: 'gt',
            threshold: 50,
            breach_duration_seconds: 5,
            enabled: true
        }
    });

    console.log(JSON.stringify({ client_id: client.id, device_id: device.id }));
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.\$disconnect(); });
EOF

# Run Seeding
echo "1. Seeding Device and Rule..."
SEED_OUTPUT=$(npx ts-node -r dotenv/config scripts/seed-notif-test.ts)
CLIENT_ID=$(echo $SEED_OUTPUT | jq -r .client_id)
# Clean up temp script
rm scripts/seed-notif-test.ts

# Helper to ingest
ingest_temp() {
    VAL=$1
    echo "   Ingesting Temp=${VAL}..."
    RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "${API_URL}/api/v1/ingest/milesight" \
      -H "Content-Type: application/json" \
      -H "X-Ingest-Key: dev-secret" \
      -d '{
            "event_type": "uplink",
            "dev_eui": "'${DEVICE_ID}'",
            "timestamp": '$(date +%s)000',
            "data": {
                "temperature": '${VAL}',
                "humidity": 50
            }
          }')
    echo "   Response: $RESPONSE"
    
    # Wait for worker
    sleep 2
}

# Helper to check notifications
check_notifs() {
    EXPECTED_COUNT=$1
    echo "   Verifying Notification Count (Expected: ${EXPECTED_COUNT})..."
    
    # Create temp script to count
    cat <<EOF > scripts/count-notifs.ts
import { prisma } from '@sense/database';

async function main() {
    // We can filter by the dynamically created client ID to isolate this test run
    const count = await prisma.notificationOutbox.count({
        where: { client_id: '${CLIENT_ID}' }
    });
    console.log(count);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await prisma.\$disconnect(); });
EOF
    
    COUNT=$(npx ts-node -r dotenv/config scripts/count-notifs.ts)
    rm scripts/count-notifs.ts
    
    if [ "$COUNT" -eq "$EXPECTED_COUNT" ]; then
        echo -e "   ${GREEN}SUCCESS: Check passed.${NC}"
    else
        echo -e "   ${RED}FAILURE: Expected ${EXPECTED_COUNT}, got ${COUNT}.${NC}"
        exit 1
    fi
}

# 2. Test Scenario

# A. Green Point (20) -> Valid (Green) -> No Notif
echo "2. Sending Green Point (20)..."
ingest_temp 20
check_notifs 0

# B. Start of Breach (60)
# T=0. Duration 0. Status Amber? Rule requires 5s.
echo "3. Starting Red Episode (Wait for breach)..."
ingest_temp 60
check_notifs 0

# C. Complete Breach (Wait 6s > 5s)
echo "4. Waiting 6s to complete breach..."
sleep 6
ingest_temp 60
# Now duration > 5s. Should be RED. 1st Notification.
check_notifs 1

# D. Repeat Notification (Wait 6s > 5s repeat interval)
echo "5. Waiting 6s for repeat notification..."
sleep 6
ingest_temp 60
# Elapsed since last notif > 5s. Should send 2nd Notification.
check_notifs 2

# E. Green Point (20). Clears status.
echo "6. Sending Green Point (Reset)..."
ingest_temp 20
# Notification count unchanged.
check_notifs 2

# F. New Episode
echo "7. Starting New Red Episode..."
ingest_temp 60 # Start breach
sleep 6
echo "   Completing breach..."
ingest_temp 60 # Trigger breach
# Should satisfy duration > 5s. New RED episode. 3rd Notification.
check_notifs 3

echo -e "${GREEN}All Notification Tests Passed!${NC}"
