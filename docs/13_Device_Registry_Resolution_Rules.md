# Hawk Monitor — Device Registry & Resolution Rules

## Purpose of This Document

This document defines how Hawk Monitor resolves incoming telemetry payloads to the correct tenant, site, and device.

Its goals are to:
- guarantee strict tenant isolation
- ensure deterministic device ownership resolution
- prevent accidental or malicious cross-tenant data leakage
- provide a single authoritative reference for ingestion adapters

These rules are mandatory for all ingestion paths.

---

## Core Principle

**No telemetry event may enter the system without an explicitly resolved tenant context.**

Resolution of device ownership is a prerequisite to emitting any valid telemetry or heartbeat event.

If ownership cannot be resolved deterministically, the event must not be processed.

---

## Device Registry Overview

Hawk Monitor maintains a **Device Registry** as an authoritative mapping between:

- external device identifiers (as provided by hardware vendors or hubs)
- internal platform entities (client, site, device, asset)

The registry is created and maintained through the platform’s device onboarding process.

---

## Canonical Identity Model

### External Device Identity

Each physical or logical device is identified externally by:

- `source`  
  The ingestion source or adapter (e.g. `milesight`, `hawk_hub`)

- `external_id`  
  A vendor-specific unique identifier such as:
  - serial number
  - device EUI
  - hub serial
  - gateway identifier

**The pair `(source, external_id)` is the canonical external identity.**

---

### Internal Device Identity

Internally, Hawk Monitor assigns each device:

- `device_id` (UUID)
- `client_id`
- optional `site_id`
- optional `area_id`
- optional `asset_name`

The internal identity is never inferred from telemetry payloads.

---

## Uniqueness & Constraints (Critical)

The following constraints MUST be enforced at the data layer:

- `(source, external_id)` MUST be unique across the entire platform
- `external_id` alone MUST NOT be assumed globally unique
- a device MUST belong to exactly one client at any point in time

Violating these constraints is a critical defect.

---

## Device Onboarding Rules

### Creation

When a device is created in the platform:

1. The user selects a client context
2. The user provides:
   - `source`
   - `external_id`
   - optional asset name
   - site / area assignment
3. The platform validates:
   - uniqueness of `(source, external_id)`
   - user permissions within the client
4. The device is persisted in the registry

From this point forward, the device is owned by exactly one client.

---

### Modification

The following fields MAY be updated after creation:
- asset name
- site / area assignment
- display metadata

The following fields MUST NOT be changed:
- `source`
- `external_id`
- `client_id`

Changing ownership or identity requires an explicit de-registration and re-registration process.

---

## Telemetry Resolution Flow

When an ingestion adapter receives a payload:

1. Extract `source` and `external_id` from the payload
2. Query the Device Registry using `(source, external_id)`
3. If a match is found:
   - retrieve `client_id`
   - retrieve `device_id`
   - retrieve site / area assignment
4. Populate the Telemetry v1 event with resolved context
5. Emit the event downstream

No fallback logic is permitted.

---

## Unknown Device Handling

If `(source, external_id)` cannot be resolved:

- the event MUST NOT be emitted as telemetry
- the event MUST NOT be assigned to a default tenant
- the event MUST NOT be guessed or inferred

Permitted handling strategies:
- discard the event and log the occurrence
- place the event in a quarantine / unknown-device queue for review

The chosen strategy must be consistent and auditable.

---

## Multi-Sensor and Hub Devices

For hub-based payloads:

- the hub itself is the registered device
- individual sensors or probes are treated as sub-identifiers (`sensor.external_id`)
- tenant resolution is performed at the hub level

Sensors do not exist independently of a registered device.

---

## Device Movement & Reassignment

In the MVP, devices are considered statically assigned.

Rules:
- a device may change site or area within the same client
- a device MUST NOT change client ownership
- historical telemetry remains associated with the original site at time of ingestion

Future support for device transfer between clients requires explicit data migration and is out of scope.

---

## Security Implications

These rules are security-critical.

Any violation may result in:
- cross-tenant data leakage
- compliance breaches
- audit failures

Therefore:
- all resolution logic must be deterministic
- all failures must be explicit
- all resolution paths must be logged

Silent failure is unacceptable.

---

## Adapter Responsibilities

Ingestion adapters are responsible for:

- extracting correct `(source, external_id)` values
- performing resolution before event emission
- rejecting unresolved payloads
- never bypassing the registry

Adapters MUST NOT:
- create devices implicitly
- modify registry entries
- infer tenant ownership

---

## Operational Observability

The platform SHOULD provide visibility into:
- rejected unknown devices
- resolution failures
- registry conflicts

This supports:
- operational debugging
- onboarding troubleshooting
- security review

---

## Guiding Rule

If a telemetry event cannot be unambiguously attributed to a single client, it must not exist.

Correctness and isolation are more important than completeness.
