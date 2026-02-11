# Hawk Monitor — Event Pipeline Processing Rules

## Purpose of This Document

This document defines how Hawk Monitor processes telemetry and operational events after ingestion and before exposure through APIs.

Its goals are to:

* ensure deterministic, scalable, and fault-tolerant event handling
* make performance characteristics predictable
* prevent ad-hoc logic from leaking into ingestion or API layers
* define the contracts assumed by dashboards and alerting

These rules apply to all event types (telemetry, heartbeat, future events).

---

## Event Lifecycle Overview

All external events follow the same high-level lifecycle:

Ingestion Adapter → Queue → Processing Workers → Storage → Derived State → API

Each stage has a single, well-defined responsibility. No stage bypasses the next.

---

## Queueing Rules

All events emitted by ingestion adapters MUST be enqueued before any processing occurs.

Queueing guarantees:

* decoupling between ingestion and processing
* backpressure handling under burst load
* retry semantics for transient failures

Rules:

* ingestion adapters MUST NOT write directly to storage
* enqueue operations MUST be fast and non-blocking
* events are immutable once enqueued

---

## Idempotency & Deduplication

Deduplication is enforced in the processing layer using the `idempotency_key` defined in the event contract.

Rules:

* events with the same idempotency key are processed at most once
* duplicate events are safely discarded
* deduplication checks MUST occur before any side effects

Deduplication state MAY be stored in:

* a database constraint
* a fast key-value store

The mechanism must be deterministic and auditable.

---

## Processing Workers

Processing workers are responsible for all non-trivial computation and side effects.

Responsibilities include:

* validating event schema and version
* enforcing idempotency
* persisting raw events
* updating derived state
* evaluating alert conditions

Workers MUST be horizontally scalable and stateless.

---

## Batch Processing Rules

To support high ingestion volumes, events SHOULD be processed in batches.

Rules:

* batch size should be configurable
* batch failures must be isolated; one failing event must not block the batch
* partial batch success is acceptable

Batching must be transparent to downstream consumers.

---

## Storage Strategy

### Raw Event Storage

Raw telemetry events are stored in an append-only manner.

Rules:

* raw events are immutable
* storage is optimised for write-heavy workloads
* event time and ingestion time are both preserved

### Derived State Storage

Derived state is stored separately from raw events.

Derived state includes:

* latest value per device and parameter
* device operational status
* pre-aggregated time buckets

Derived state MAY be rebuilt from raw events if necessary.

---

## Latest-State Cache

The platform maintains a latest-state representation per device.

Rules:

* updated on successful event processing
* used by dashboard overview endpoints
* treated as a cache, not a source of truth

If the cache is unavailable, the system may temporarily degrade but must not fail ingestion.

---

## Time-Series Aggregation

Time-series data exposed through APIs MUST be pre-aggregated.

Rules:

* raw telemetry is never scanned for dashboard page loads
* aggregation buckets (e.g. 1m, 5m, 1h) are computed asynchronously
* aggregation logic is deterministic and repeatable

Aggregations are derived data and may be recomputed.

---

## Alert Evaluation

Alert conditions are evaluated during event processing.

Rules:

* evaluation occurs after deduplication
* alert state transitions are deterministic
* consecutive violation windows are tracked explicitly

Alert state changes generate audit events.

---

## Ordering & Late Events

The system does not assume ordered delivery.

Rules:

* event time (`occurred_at`) is authoritative for evaluation
* late-arriving events may update historical aggregates
* late events MUST NOT retroactively resolve already resolved alerts unless explicitly designed

---

## Failure Handling & Retries

Failures are handled at each stage explicitly.

Rules:

* transient failures trigger retries with backoff
* permanent failures are logged and isolated
* poison messages must not block the queue

Retry policies must be bounded and observable.

---

## Observability & Metrics

The pipeline MUST expose operational metrics, including:

* queue depth and lag
* processing throughput
* deduplication rate
* failure and retry counts

These metrics are used to assess system health.

---

## Performance Guarantees (MVP)

For the MVP, the system aims to:

* ingest bursts of events without data loss
* process events within a bounded delay
* serve dashboard data with low, predictable latency

Exact SLAs are out of scope but architectural guarantees are required.

---

## Guiding Rule

If processing logic becomes complex or stateful inside ingestion or API layers, it is in the wrong place.

The event pipeline exists to absorb complexity so the rest of the system stays simple.
