# Hawk Monitor — MVP Milestones

## Purpose of This Document

This document defines the **Minimum Viable Product (MVP)** for Hawk Monitor.

Its goals are to:
- establish a shared definition of “done”
- prevent scope creep during development
- provide a clear, incremental execution plan
- ensure the MVP is demonstrable, usable, and extensible

Anything not explicitly included here is **out of scope for the MVP**.

---

## MVP Definition

The Hawk Monitor MVP is a **multi-tenant monitoring platform** that:

- ingests telemetry from at least two heterogeneous sources
- stores and normalises historical data
- highlights abnormal conditions clearly
- supports multi-site organisations
- is usable via a web interface

The MVP must be **production-shaped**, even if not production-scaled.

---

## In-Scope Capabilities (MVP)

### 1. Multi-Tenancy & Structure
- Super Admin can create and manage clients
- Clients can define:
  - sites
  - sub-sites / areas
- All data is strictly tenant-scoped

---

### 2. User Management & Roles
- User authentication
- Role-based access control:
  - Company Admin
  - Site Admin
  - Viewer
- Permissions enforced consistently across API and UI

---

### 3. Device & Asset Registration
- Devices can be registered and associated with:
  - client
  - site / sub-site
- Devices are treated as logical data sources
- No hardware provisioning logic in the platform

---

### 4. Telemetry Ingestion (Core)
The MVP must support **at least two ingestion adapters**:

#### 4.1 Third-Party Platform Adapter (Milesight)
- Webhook-based ingestion
- Demo devices supported
- Normalisation into internal telemetry contract

#### 4.2 Proprietary Hub Adapter (Hawk Hub)
- Direct ingestion via Hawk-managed endpoint
- Authentication handled by the adapter
- Sensor data and heartbeat events supported

Both adapters must feed the **same downstream pipeline**.

---

### 5. Telemetry Storage & History
- Append-only storage of telemetry events
- Event time preserved
- Historical querying by:
  - device
  - parameter
  - time range

Retention policies may be simple and fixed for MVP.

---

### 6. Monitoring Dashboard
- Overview dashboard showing all devices for a site
- Devices displayed by **operational state**, prioritising attention:
  - abnormal states first
  - then warning states
  - then normal states
- Clear visual indication of current status per device
- Ability to drill down into:
  - device details
  - historical charts

Exact visual design is flexible, but clarity is mandatory.

---

### 7. Alerting (Foundational)
- Configurable alert rules based on parameters and thresholds
- Support for:
  - consecutive out-of-range conditions
  - time-based evaluation
- Alert lifecycle:
  - raised
  - acknowledged
  - resolved
- Audit trail for alert state changes

Notification channels may be limited in the MVP.

---

### 8. Performance & Responsiveness
- Dashboard pages must load quickly and predictably
- User-facing queries must not scan raw telemetry
- Aggregation and caching must be used where appropriate

“Fast enough” must be achieved through architecture, not shortcuts.

---

## Explicit Out-of-Scope Items (MVP)

The following are **intentionally excluded** from the MVP:

- AI / anomaly detection
- Predictive analytics
- Complex workflow automation
- Custom per-client logic
- White-label UI or theming
- Advanced reporting and scheduling
- Hardware firmware management
- Marketplace or plugin system

These may be revisited after MVP validation.

---

## Milestone Breakdown

### Milestone 1 — Foundation (Platform Skeleton)
- Repo structure and docs in place
- Core services bootstrapped
- Multi-tenant model enforced end-to-end
- Basic auth and role enforcement

Outcome: platform exists and is navigable.

---

### Milestone 2 — Ingestion Pipeline
- Queue-based ingestion pipeline operational
- Milesight adapter implemented
- Telemetry stored and queryable
- Deduplication enforced

Outcome: real data flowing end-to-end.

---

### Milestone 3 — Monitoring UI
- Site-level device overview
- Device detail page with historical charts
- Clear status representation

Outcome: usable monitoring experience.

---

### Milestone 4 — Alerting
- Alert rule configuration
- Alert evaluation logic
- Alert lifecycle management
- Basic notifications

Outcome: system reacts to abnormal conditions.

---

### Milestone 5 — Hardening & Demo Readiness
- Error handling and edge cases
- Performance sanity checks
- Seed/demo data
- Internal demo flow documented

Outcome: MVP ready for internal and early external demos.

---

## Acceptance Criteria

The MVP is considered complete when:

- Both ingestion sources are active and stable
- A new client can be onboarded end-to-end
- Abnormal conditions are surfaced clearly
- Alerts behave predictably
- No critical architectural principles are violated

---

## Guiding Rule

If a feature does not directly contribute to:
- validating the product
- demonstrating core value
- enabling future extensibility

…it does not belong in the MVP.

Stopping is a success condition.
