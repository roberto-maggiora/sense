#!/bin/bash
set -e

# API Base URL
API_URL="http://localhost:3000"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Testing Alert History API..."

# 1. Reuse existing test logic to seed data (create client, device, rule, and alerts)
# We will use a dedicated seed script below to ensure deterministic data state.

echo "1. Seeding data for history test..."
TIMESTAMP=$(date +%s)
DEVICE_ID="hist_${TIMESTAMP}"
echo "   External ID: ${DEVICE_ID}"

# Create seed script
cat <<EOF > scripts/seed-history-test.ts
import { prisma } from '@sense/database';

async function main() {
    const client = await prisma.client.create({ data: { name: 'History Test Client ${TIMESTAMP}' } });
    const device = await prisma.device.create({
        data: {
            client_id: client.id,
            source: 'milesight',
            external_id: '${DEVICE_ID}',
            name: 'History Test Device'
        }
    });

    // Insert dummy notifications
    for (let i = 1; i <= 5; i++) {
        await prisma.notificationOutbox.create({
            data: {
                client_id: client.id,
                device_id: device.id,
                message: JSON.stringify({ event: 'ALERT_RED', value: i, timestamp: new Date().toISOString() }),
                created_at: new Date(Date.now() - i * 1000) // Staggered times
            }
        });
    }

    // Insert notification for another device (noise)
    const device2 = await prisma.device.create({
        data: {
            client_id: client.id,
            source: 'milesight',
            external_id: '${DEVICE_ID}_2',
            name: 'Noise Device'
        }
    });
    await prisma.notificationOutbox.create({
        data: {
            client_id: client.id,
            device_id: device2.id,
            message: JSON.stringify({ event: 'NOISE', value: 99 }),
        }
    });

    console.log(JSON.stringify({ client_id: client.id, device_id: device.id, device2_id: device2.id }));
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.\$disconnect(); });
EOF

SEED_OUTPUT=$(npx ts-node -r dotenv/config scripts/seed-history-test.ts)
CLIENT_ID=$(echo $SEED_OUTPUT | jq -r .client_id)
DEVICE_ID_DB=$(echo $SEED_OUTPUT | jq -r .device_id)
rm scripts/seed-history-test.ts

echo "   Client ID: ${CLIENT_ID}"

# Helper to call API
call_api() {
    URL="$1"
    curl -s -H "X-Client-Id: ${CLIENT_ID}" "${API_URL}${URL}"
}

# Test 1: List all (should be 6 total for this client)
echo "3. Testing List All..."
RESP=$(call_api "/api/v1/alerts/history")
COUNT=$(echo $RESP | jq '.data | length')
if [ "$COUNT" -eq 6 ]; then
    echo -e "   ${GREEN}SUCCESS: Got 6 alerts.${NC}"
else
    echo -e "   ${RED}FAILURE: Expected 6 alerts, got ${COUNT}.${NC}"
    echo $RESP
    exit 1
fi

# Test 2: Filter by Device ID (should be 5)
echo "4. Testing Filter by Device ID..."
RESP=$(call_api "/api/v1/alerts/history?device_id=${DEVICE_ID_DB}")
COUNT=$(echo $RESP | jq '.data | length')
if [ "$COUNT" -eq 5 ]; then
    echo -e "   ${GREEN}SUCCESS: Got 5 alerts for device.${NC}"
else
    echo -e "   ${RED}FAILURE: Expected 5 alerts, got ${COUNT}.${NC}"
    echo $RESP
    exit 1
fi

# Test 3: Pagination (Limit 2, 3 pages)
echo "5. Testing Pagination..."
# Page 1
RESP1=$(call_api "/api/v1/alerts/history?limit=2")
COUNT1=$(echo $RESP1 | jq '.data | length')
CURSOR1=$(echo $RESP1 | jq -r '.next_cursor')

if [ "$COUNT1" -eq 2 ] && [ "$CURSOR1" != "null" ]; then
    echo "   Page 1 OK. Cursor: ${CURSOR1}"
else
    echo -e "   ${RED}FAILURE: Page 1 invalid.${NC}"
    exit 1
fi

# Page 2
RESP2=$(call_api "/api/v1/alerts/history?limit=2&cursor=${CURSOR1}")
COUNT2=$(echo $RESP2 | jq '.data | length')
CURSOR2=$(echo $RESP2 | jq -r '.next_cursor')

if [ "$COUNT2" -eq 2 ] && [ "$CURSOR2" != "null" ] && [ "$CURSOR2" != "$CURSOR1" ]; then
    echo "   Page 2 OK. Cursor: ${CURSOR2}"
else
    echo -e "   ${RED}FAILURE: Page 2 invalid.${NC}"
    exit 1
fi

# Page 3
RESP3=$(call_api "/api/v1/alerts/history?limit=2&cursor=${CURSOR2}")
COUNT3=$(echo $RESP3 | jq '.data | length')
CURSOR3=$(echo $RESP3 | jq -r '.next_cursor')

if [ "$COUNT3" -eq 2 ] && [ "$CURSOR3" == "null" ]; then
    echo "   Page 3 OK. End of list."
else
    echo -e "   ${RED}FAILURE: Page 3 invalid.${NC}"
    exit 1
fi

echo -e "${GREEN}All Alert History Tests Passed!${NC}"
