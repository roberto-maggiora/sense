#!/bin/bash
API_URL="http://localhost:3000/api/v1/ingest/milesight"
STATS_URL="http://localhost:3000/api/v1/internal/ingest-stats"
INGEST_KEY="${INGEST_SHARED_KEY:-dev-secret}"

echo "1. Initial Stats"
curl -s "$STATS_URL" | jq .

echo -e "\n2. Successful Ingest"
curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $INGEST_KEY" \
  -d '{
    "deviceEUI": "24E124126B316D59",
    "temperature": 25
  }' | jq .

echo -e "\n3. Invalid Secret (Auth Fail)"
curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: wrong-key" \
  -d '{
    "deviceEUI": "24E124126B316D59",
    "temperature": 25
  }' | jq .

echo -e "\n4. Device Not Found"
curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $INGEST_KEY" \
  -d '{
    "deviceEUI": "NON_EXISTENT_EUI",
    "temperature": 25
  }' | jq .

echo -e "\n5. Final Stats"
curl -s "$STATS_URL" | jq .
