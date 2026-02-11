# Hawk Monitor — Ingestion Adapters

## Purpose of This Document

This document defines the ingestion adapter model used by Hawk Monitor.

Its goal is to:
- formalise how external data sources integrate with the platform
- enforce strict boundaries between vendor-specific logic and core logic
- ensure new data sources can be added without impacting the core system

Ingestion adapters are a critical architectural seam and must remain simple, isolated, and replaceable.

---

## Definition: Ingestion Adapter

An ingestion adapter is a source-specific component responsible for translating external data into Hawk Monitor’s internal telemetry event format.

Adapters are the only place where:
- vendor-specific payloads are parsed
- source-specific authentication is handled
- transport-specific behaviour is implemented

Beyond this boundary, the platform is vendor-agnostic.

---

## Adapter Responsibilities

Each ingestion adapter is responsible for:

- receiving data via HTTP webhook, MQTT, or other supported transport
- authenticating the source and rejecting unauthorised input
- validating payload structure and required fields
- normalising source-specific data into the internal telemetry event contract
- preserving raw payloads for traceability
- generating deterministic deduplication identifiers
- forwarding events to the downstream pipeline asynchronously

Adapters must do nothing more than this.

---

## Explicit Non-Responsibilities

Ingestion adapters must not:

- write directly to databases
- evaluate alert conditions
- perform aggregation or rollups
- apply tenant-specific business logic
- trigger notifications
- depend on downstream availability

Any adapter that violates these rules is incorrectly designed.

---

## Internal Telemetry Contract

All ingestion adapters output events conforming to a single internal telemetry contract.

This contract is:
- source-agnostic
- stable
- shared across the entire platform

Adapters may enrich events with metadata, but must not alter core semantics.

The internal contract is defined in a separate document and treated as authoritative.

---

## Supported Adapter Types (Initial)

### Third-Party Platform Adapter (Milesight)

The Milesight adapter integrates with an external vendor platform that manages hardware and gateways and emits telemetry via webhooks or APIs.

Key characteristics:
- HTTP-based ingestion
- push-driven (webhooks preferred)
- external authentication mechanism
- vendor-managed device and gateway lifecycle

Milesight is treated strictly as an external data producer, not as a platform dependency.

---

### Proprietary Hub Adapter (Hawk Hub)

The Hawk Hub adapter integrates directly with Hawk-owned hardware.

The adapter is responsible for:
- mapping hub and sensor identifiers
- handling hub heartbeat events
- preserving compatibility with future protocol changes

Key characteristics:
- MQTT-based ingestion
- mutual TLS authentication
- direct connection to Hawk-managed infrastructure

---

## Multiple Adapters, Single Pipeline

All ingestion adapters feed into the same downstream pipeline:

Adapter → Queue → Processing → Storage → Access

No adapter has special privileges or bypasses.

This guarantees:
- consistent behaviour across sources
- predictable performance characteristics
- simpler reasoning about system behaviour

---

## Error Handling Strategy

Ingestion adapters adopt a conservative error-handling strategy:

- malformed or invalid payloads are rejected early
- authentication failures are logged and dropped
- transient transport failures rely on upstream retry mechanisms
- adapter failures do not affect other adapters

Adapters are isolated by design.

---

## Versioning and Evolution

Ingestion adapters may evolve independently of the core platform.

Changes to:
- vendor payload formats
- authentication schemes
- transport mechanisms

must be handled entirely within the adapter boundary.

The internal telemetry contract must evolve slowly and intentionally.

---

## Testing Philosophy

Each ingestion adapter must be testable in isolation.

Recommended tests include:
- payload validation tests
- normalisation mapping tests
- deduplication key consistency tests
- failure and retry scenarios

Adapters should be tested against representative real-world payloads whenever possible.

---

## Guiding Principle

Ingestion adapters are translation layers, not business logic.

If an adapter grows complex, the complexity is misplaced and must be refactored.
