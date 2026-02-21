#!/bin/bash
set -e

API_URL="http://localhost:3000/api/v1"
CLIENT_ID="test-client"

echo "Checking API Health..."
curl -s "${API_URL}/health" | grep "ok"

echo "Creating Site..."
SITE_NAME="Test Site $(date +%s)"
SITE_ID=$(curl -s -X POST "${API_URL}/sites" \
  -H "Content-Type: application/json" \
  -H "X-Client-Id: ${CLIENT_ID}" \
  -d "{\"name\": \"${SITE_NAME}\"}" | jq -r '.id')

if [ "$SITE_ID" == "null" ]; then
  echo "Failed to create site"
  exit 1
fi
echo "Created Site: $SITE_ID"

echo "Creating Area..."
AREA_NAME="Test Area $(date +%s)"
AREA_ID=$(curl -s -X POST "${API_URL}/sites/${SITE_ID}/areas" \
  -H "Content-Type: application/json" \
  -H "X-Client-Id: ${CLIENT_ID}" \
  -d "{\"name\": \"${AREA_NAME}\"}" | jq -r '.id')

if [ "$AREA_ID" == "null" ]; then
  echo "Failed to create area"
  exit 1
fi
echo "Created Area: $AREA_ID"

echo "Listing Sites..."
curl -s -H "X-Client-Id: ${CLIENT_ID}" "${API_URL}/sites" | jq '.data[] | .name'

echo "Listing Areas..."
curl -s -H "X-Client-Id: ${CLIENT_ID}" "${API_URL}/sites/${SITE_ID}/areas" | jq '.data[] | .name'

echo "Getting UI Test Device..."
DEVICE_ID=$(curl -s -H "X-Client-Id: ${CLIENT_ID}" "${API_URL}/devices" | jq -r '.data[] | select(.external_id=="ui_test_ext") | .id')

if [ -z "$DEVICE_ID" ] || [ "$DEVICE_ID" == "null" ]; then
  echo "UI Test Device not found. Skipping assignment."
else
  echo "Assigning Location to Device $DEVICE_ID..."
  curl -s -X PATCH "${API_URL}/devices/${DEVICE_ID}" \
    -H "Content-Type: application/json" \
    -H "X-Client-Id: ${CLIENT_ID}" \
    -d "{\"site_id\": \"${SITE_ID}\", \"area_id\": \"${AREA_ID}\"}" | jq .

  echo "Verifying Assignment..."
  ASSIGNED_SITE=$(curl -s -H "X-Client-Id: ${CLIENT_ID}" "${API_URL}/devices/${DEVICE_ID}" | jq -r '.site_id')
  ASSIGNED_AREA=$(curl -s -H "X-Client-Id: ${CLIENT_ID}" "${API_URL}/devices/${DEVICE_ID}" | jq -r '.area_id')

  if [ "$ASSIGNED_SITE" == "$SITE_ID" ] && [ "$ASSIGNED_AREA" == "$AREA_ID" ]; then
    echo "SUCCESS: Device assigned to correct Site and Area."
  else
    echo "FAILURE: Assignment mismatch. Expected Site: $SITE_ID, Area: $AREA_ID. Got Site: $ASSIGNED_SITE, Area: $ASSIGNED_AREA"
    exit 1
  fi
fi

echo "OK"
