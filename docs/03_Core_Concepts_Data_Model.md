# Hawk Monitor — Core Concepts & Data Model

## Purpose of This Document

This document defines the **core concepts and mental model** of Hawk Monitor.

Its goal is to ensure that:
- product, engineering, and design share the same vocabulary
- core entities are clearly distinguished
- future features and modules build on consistent foundations

This document is **conceptual**, not physical.
It intentionally avoids database schemas, APIs, or implementation details.

---

## Tenancy Model

### Super Admin
The Super Admin represents Hawk’s internal operational role.

Responsibilities include:
- creating and managing clients
- overseeing system health
- enforcing platform-level constraints

The Super Admin does not interact with operational data in day-to-day usage.

---

### Client
A Client represents an **organisation** using Hawk Monitor.

All operational data belongs to exactly one client.

Clients:
- are fully isolated from one another
- cannot access or infer data across tenants
- own their users, sites, devices, and configurations

There is no shared or global client context.

---

## Organisational Structure

### Site
A Site represents a **physical or logical location** where monitoring occurs.

Examples:
- a building
- a facility
- a campus
- a vehicle depot

Sites provide:
- organisational grouping
- access scoping
- reporting boundaries

---

### Sub-site / Area
A Sub-site (or Area) represents a **finer-grained subdivision** within a site.

Examples:
- rooms
- zones
- storage areas
- vehicles within a fleet

Sub-sites are optional but enable more precise attribution of data and responsibility.

---

## Users & Roles

Users belong to a client and are assigned one or more roles.

Roles define:
- scope (client-wide or site-specific)
- permissions (view, configure, acknowledge)

The core roles are:
- Company Admin
- Site Admin
- Viewer

Role definitions and permissions are detailed in a separate document.

---

## Assets, Devices, and Sensors

### Asset
An Asset represents a **logical object of interest** from an operational perspective.

Examples:
- a fridge
- a cold room
- a transport container
- a piece of equipment

Assets exist regardless of how they are monitored.

---

### Device
A Device represents a **data-emitting entity** known to the platform.

A device may:
- correspond to a physical sensor
- represent a hub aggregating multiple sensors
- map to a virtual or third-party source

Devices are associated with:
- one client
- optionally a site or sub-site
- one or more assets

The platform does not assume a one-to-one relationship between assets and devices.

---

### Sensor
A Sensor represents a **logical measurement point** within a device.

Examples:
- internal temperature probe
- external probe
- humidity sensor
- power meter channel

Sensors are identified by:
- a stable identifier within a device
- the parameters they emit

Sensors do not exist independently of devices.

---

## Parameters

A Parameter represents a **type of measurable quantity**.

Examples:
- temperature
- humidity
- CO₂ concentration
- voltage

Parameters are defined by:
- a key
- a unit
- a semantic meaning

The platform does not embed parameter-specific behaviour at the core level.

---

## Telemetry

### Telemetry Event
A Telemetry Event is the **fundamental unit of data** in Hawk Monitor.

Each event represents:
- one or more parameter readings
- at a specific point in time
- originating from a known device and sensor context

Telemetry events are:
- immutable
- append-only
- timestamped

Events may arrive:
- out of order
- duplicated
- delayed

The platform must tolerate all of these conditions.

---

### Normalisation
All incoming telemetry, regardless of source, is normalised into a consistent internal representation.

This ensures that:
- downstream processing is vendor-independent
- alerts and dashboards operate uniformly
- historical data remains comparable over time

---

## Alerts & Conditions (Conceptual)

### Condition
A Condition represents a **rule that evaluates telemetry**.

Conditions are expressed in terms of:
- parameters
- values
- time

Conditions do not perform actions themselves.

---

### Alert
An Alert represents the **result of a condition being met**.

Alerts:
- are tied to specific assets, devices, or sites
- have a lifecycle (raised, acknowledged, resolved)
- are auditable

Alert behaviour and configuration are defined elsewhere.

---

## Time & History

Time is a first-class concern in Hawk Monitor.

The platform distinguishes between:
- event time (when the measurement occurred)
- processing time (when the platform received it)

Historical data is preserved to support:
- audits
- compliance
- trend analysis
- operational review

---

## Cross-Module Consistency

All current and future modules (e.g. Monitoring, Workflows) must:
- reuse these core concepts
- avoid redefining entities or semantics
- integrate through shared identifiers and events

Modules may extend behaviour, but must not fork the core model.

---

## Guiding Principle

If a new feature cannot be clearly expressed using the concepts in this document, either:
- the feature is incorrectly designed, or
- this model needs to be consciously extended

Silent divergence is not acceptable.
