#!/bin/bash
set -e

API_URL="http://localhost:3000/api/v1"
CLIENT_ID="test-client"

echo "Checking API Health..."
curl -s "${API_URL}/health" | grep "ok"

# 1. Get first site and area
echo "Fetching Sites..."
SITES_JSON=$(curl -s -H "X-Client-Id: ${CLIENT_ID}" "${API_URL}/sites?includeDisabled=false")
SITE_ID=$(echo $SITES_JSON | jq -r '.data[0].id')
SITE_NAME=$(echo $SITES_JSON | jq -r '.data[0].name')

if [ "$SITE_ID" == "null" ] || [ -z "$SITE_ID" ]; then
  echo "No sites found. Please create a site first."
  exit 1
fi

echo "Selected Site: $SITE_NAME ($SITE_ID)"

# Assuming the site has areas (from previous test), get the first one.
# Note: In the previous step we updated GET /sites to include areas.
AREA_ID=$(echo $SITES_JSON | jq -r ".data[0].areas[0].id")
AREA_NAME=$(echo $SITES_JSON | jq -r ".data[0].areas[0].name")

if [ "$AREA_ID" == "null" ] || [ -z "$AREA_ID" ]; then
    echo "No areas found in site $SITE_NAME. Creating one..."
    AREA_NAME="Auto-Test Area $(date +%s)"
    AREA_ID=$(curl -s -X POST "${API_URL}/sites/${SITE_ID}/areas" \
      -H "Content-Type: application/json" \
      -H "X-Client-Id: ${CLIENT_ID}" \
      -d "{\"name\": \"${AREA_NAME}\"}" | jq -r '.id')
fi

echo "Selected Area: $AREA_NAME ($AREA_ID)"

# 2. Get UI Test Device
DEVICE_ID=$(curl -s -H "X-Client-Id: ${CLIENT_ID}" "${API_URL}/devices" | jq -r '.data[] | select(.external_id=="ui_test_ext") | .id')

if [ -z "$DEVICE_ID" ] || [ "$DEVICE_ID" == "null" ]; then
  echo "UI Test Device not found. Creating it..."
  DEVICE_ID=$(curl -s -X POST "${API_URL}/devices" \
    -H "Content-Type: application/json" \
    -H "X-Client-Id: ${CLIENT_ID}" \
    -d '{ "name": "UI Test Device", "source": "milesight", "external_id": "ui_test_ext" }' | jq -r '.id')
fi

echo "Device ID: $DEVICE_ID"

# 3. Assign Device to Site & Area
echo "Assigning to Site ($SITE_ID) and Area ($AREA_ID)..."
UPDATED_DEVICE=$(curl -s -X PATCH "${API_URL}/devices/${DEVICE_ID}" \
  -H "Content-Type: application/json" \
  -H "X-Client-Id: ${CLIENT_ID}" \
  -d "{\"site_id\": \"${SITE_ID}\", \"area_id\": \"${AREA_ID}\"}")

CHECK_SITE=$(echo $UPDATED_DEVICE | jq -r '.data.site_id')
CHECK_AREA=$(echo $UPDATED_DEVICE | jq -r '.data.area_id')

if [ "$CHECK_SITE" == "$SITE_ID" ] && [ "$CHECK_AREA" == "$AREA_ID" ]; then
  echo "SUCCESS: Assigned to Site and Area."
else
  echo "FAILURE: Assignment mismatch. Got Site: $CHECK_SITE, Area: $CHECK_AREA"
  exit 1
fi

# 4. Unassign (Clear Location)
echo "Unassigning Location..."
UPDATED_DEVICE=$(curl -s -X PATCH "${API_URL}/devices/${DEVICE_ID}" \
  -H "Content-Type: application/json" \
  -H "X-Client-Id: ${CLIENT_ID}" \
  -d '{"site_id": null}')

CHECK_SITE=$(echo $UPDATED_DEVICE | jq -r '.data.site_id')
CHECK_AREA=$(echo $UPDATED_DEVICE | jq -r '.data.area_id')

if [ "$CHECK_SITE" == "null" ] && [ "$CHECK_AREA" == "null" ]; then
  echo "SUCCESS: Location cleared."
else
  echo "FAILURE: Clearing mismatch. Got Site: $CHECK_SITE, Area: $CHECK_AREA"
  exit 1
fi

echo "ALL TESTS PASSED"
