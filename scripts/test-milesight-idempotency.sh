#!/bin/bash
API_URL="http://localhost:3000/api/v1/ingest/milesight"
INGEST_KEY="${INGEST_SHARED_KEY:-dev-secret}"

echo "Sending Payload 1 (with messageId)..."
RAND_ID="msg-test-$(date +%s)"
curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $INGEST_KEY" \
  -d "{
    \"deviceEUI\": \"24E124126B316D59\",
    \"time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"temperature\": 20,
    \"humidity\": 50,
    \"messageId\": \"$RAND_ID\"
  }" | jq .

echo "Sending Payload 2 (NO messageId, different content)..."
curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: $INGEST_KEY" \
  -d "{
    \"deviceEUI\": \"24E124126B316D59\",
    \"time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"temperature\": 21,
    \"humidity\": 55
  }" | jq .
