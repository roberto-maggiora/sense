# Hawk Monitor — API Contract (MVP)

## Purpose of This Document

This document defines the MVP API contract for Hawk Monitor.

Its goals are to:

* provide a clear, stable interface for the web UI and mobile app
* enforce tenant isolation and RBAC consistently
* support the monitoring + alerting MVP without over-building
* prevent endpoint sprawl and inconsistent patterns

This is an MVP contract: it favours clarity and consistency over completeness.

---

## API Principles (Non-Negotiable)

Tenant isolation is enforced server-side for every request. RBAC is enforced server-side for every request. All list endpoints are paginated. All timestamps are ISO8601 in UTC. Telemetry reads never require scanning raw telemetry at page-load scale; they must use latest or pre-aggregated endpoints. External vendor payloads are never exposed through the public API.

---

## Base Conventions

### Base URL

`/api/v1`

### Authentication

JWT bearer token via `Authorization: Bearer <token>`. The token contains user id, client id, and role/scope references.

### Response Envelope

Successful responses return:

```
{ "data": {}, "meta": {} }
```

Errors return:

```
{ "error": { "code": "string", "message": "string", "details": {} } }
```

### Pagination

List endpoints accept `limit` (default 25, max 100) and `cursor` (opaque). Responses include `next_cursor` when applicable.

---

## Roles & Permissions (MVP)

The platform supports four roles: Super Admin, Company Admin, Site Admin, and Viewer. Super Admins manage clients. Company Admins manage sites, areas, users, devices, and alert rules. Site Admins manage scoped devices and alerts and can acknowledge alerts. Viewers have read-only access.

---

## Core Entities

Clients represent organisations. Sites represent physical or logical locations within a client. Areas are subdivisions of sites. Devices represent logical data sources registered under a client and optionally associated with a site or area. Alert Rules define threshold-based monitoring logic. Alerts represent active or historical violations. Telemetry is exposed only through derived views.

---

## Authentication Endpoints

`POST /auth/login` authenticates a user and returns an access token. `GET /auth/me` returns the authenticated user context.

---

## Super Admin — Client Management

Super Admins can list, create, retrieve, and update clients using `/sa/clients` endpoints.

---

## Client Admin — Sites & Areas

Sites and areas are managed through `/sites` and `/sites/{siteId}/areas` endpoints. These endpoints support create, list, retrieve, and update operations.

---

## Client Admin — Users

Users are managed through `/users` endpoints. Users can be created, updated, and scoped to one or more sites.

---

## Client Admin — Devices (Registry)

Devices are registered via `POST /devices`, which stores the mapping between source and external identifier. Devices can be listed, retrieved, updated (excluding identity fields), and disabled.

---

## Monitoring — Dashboard Data

`GET /monitor/overview` returns a site-centric dashboard optimised for fast load, including device status ordering (red, amber, green, unknown). Device-level latest metrics and historical time series are available via `/devices/{deviceId}/latest` and `/devices/{deviceId}/timeseries`.

---

## Alert Rules

Alert rules are managed through `/alert-rules` endpoints. Rules define parameter thresholds, consecutive violation windows, severity, and notification targets.

---

## Alerts

Active and historical alerts are accessed via `/alerts`. Alerts support acknowledgement and resolution actions.

---

## Ingestion Endpoints (Internal)

Telemetry ingestion endpoints such as `/ingest/milesight` and `/ingest/hawk-hub` are internal-only and protected separately from UI APIs.

---

## Health & Observability

`/health` provides a public liveness check. `/health/internal` exposes internal system health metrics for operators.

---

## Audit Expectations

The platform must record audit events for authentication, device changes, alert rule changes, and alert lifecycle events. All audit logs are tenant-scoped.

---

## MVP Constraints

All UI-facing telemetry reads must use derived or cached data. Unknown devices must never be accepted by ingestion paths. Cross-tenant access must be impossible, even with guessed identifiers.

---

## Future Extensions

Bulk imports, external webhooks, advanced RBAC, per-tenant retention, richer notifications, and location history are explicitly out of scope for the MVP.
