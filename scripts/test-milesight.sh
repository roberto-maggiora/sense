#!/bin/bash
# Test Milesight Ingestion Endpoint

# Ensure you have set INGEST_SHARED_KEY in .env and restarted the API
# Ensure you have a device with source="milesight" and external_id="24E124126B316D59" in DB

API_URL="http://localhost:3000/api/v1/ingest/milesight"
INGEST_KEY="${INGEST_SHARED_KEY:-change-me}"

echo "Serving to $API_URL with key $INGEST_KEY"

curl -v -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $INGEST_KEY" \
  -d '{
    "deviceEUI": "24E124126B316D59",
    "time": "2023-01-01T12:00:00Z",
    "temperature": 25.5,
    "humidity": 60,
    "messageId": "msg-12345"
  }'

echo -e "\nDone."
