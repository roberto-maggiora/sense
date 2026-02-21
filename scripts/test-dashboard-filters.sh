#!/bin/bash
set -e

# API URL
API_URL="http://localhost:3000/api/v1"

echo "1. Fetching dashboard summary (no filters)..."
curl -s -f -H "X-Client-Id: test-client" "$API_URL/dashboard/summary" > /tmp/summary_all.json
cat /tmp/summary_all.json
echo ""

echo "2. Fetching dashboard devices (no filters)..."
curl -s -f -H "X-Client-Id: test-client" "$API_URL/dashboard/devices?limit=1" > /tmp/devices_all.json
cat /tmp/devices_all.json
echo ""

# Extract a site_id from the devices list if available, otherwise we skip specific filter tests
SITE_ID=$(cat /tmp/devices_all.json | grep -o '"site_id":"[^"]*"' | head -n 1 | cut -d'"' -f4)

if [ -n "$SITE_ID" ]; then
    echo "Found Site ID: $SITE_ID"
    
    echo "3. Fetching dashboard summary (site_id=$SITE_ID)..."
    curl -s -f -H "X-Client-Id: test-client" "$API_URL/dashboard/summary?site_id=$SITE_ID" > /tmp/summary_site.json
    cat /tmp/summary_site.json
    echo ""

    echo "4. Fetching dashboard devices (site_id=$SITE_ID)..."
    curl -s -f -H "X-Client-Id: test-client" "$API_URL/dashboard/devices?site_id=$SITE_ID&limit=1" > /tmp/devices_site.json
    cat /tmp/devices_site.json
    echo ""
    
    # Assert that returned device has the correct site_id
    RETURNED_SITE_ID=$(cat /tmp/devices_site.json | grep -o '"site_id":"[^"]*"' | head -n 1 | cut -d'"' -f4)
    if [ "$RETURNED_SITE_ID" != "$SITE_ID" ]; then
        echo "ERROR: Returned device does not match requested site_id"
        exit 1
    fi
    echo "✅ Site filter verification passed"

else
    echo "No devices with site_id found to test filtering. Skipping specific filter tests."
fi

echo "5. Testing invalid filter (should still return 200 with empty data or 400 if validation fails, currently API implies valid SQL params)"
# Passing a UUID that likely doesn't exist
RANDOM_UUID="00000000-0000-0000-0000-000000000000"
curl -s -H "X-Client-Id: test-client" "$API_URL/dashboard/devices?site_id=$RANDOM_UUID" > /tmp/devices_empty.json
echo "Response for invalid site_id:"
cat /tmp/devices_empty.json
echo ""

# Check if data array is empty
COUNT=$(cat /tmp/devices_empty.json | grep -o '"data":\[\]' | wc -l)
if [ "$COUNT" -eq 1 ]; then
     echo "✅ Invalid filter returned empty list as expected"
else
     echo "⚠️  Invalid filter did NOT return empty list (or response format changed)"
fi

echo "OK"
