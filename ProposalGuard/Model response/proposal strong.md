# Proposal: Integrated Warehouse Inventory Dashboard for NordFrame Logistics

**Submitted by:** Nexora Systems GmbH
**Variant:** TECHNICALLY STRONG / COMMERCIAL MISMATCH

## Executive Summary

Nexora Systems proposes a web-based inventory management dashboard designed
specifically for NordFrame Logistics' six regional warehouses in Germany and
Austria.

The solution will integrate with NordFrame's existing PostgreSQL database,
provide real-time inventory visibility, support warehouse-specific access
permissions, and automatically notify warehouse managers when inventory falls
below configurable thresholds.

Our objective is to modernize NordFrame's inventory visibility without
requiring replacement of the existing inventory database.

## Solution Scope

### 1\. Inventory Dashboard

The proposed application will provide:

* Real-time inventory levels across all six warehouses
* SKU-level search and filtering
* Stock-level trends
* Low-stock indicators
* HQ consolidated overview
* Warehouse-specific operational views

### 2\. Low-Stock Alerting

Warehouse managers will be able to configure minimum stock thresholds for
individual SKUs.

When inventory drops below the selected threshold, alerts will be distributed
through:

* Email
* Dashboard notifications

### 3\. PostgreSQL Integration

The existing PostgreSQL database will remain NordFrame's system of record.

Nexora will implement a secure integration service that reads inventory data
from the current database without migrating NordFrame to a new database
platform.

### 4\. Role-Based Access Control

Three user profiles will initially be configured:

**Warehouse Manager**

* Access limited to the user's assigned warehouse

**HQ Operations**

* Access to inventory information for all six warehouses

**System Administrator**

* User and configuration management privileges

## Rollout \& Onboarding

Deployment will follow a controlled warehouse-by-warehouse rollout.

### Stage 1 — Pilot

One selected warehouse will serve as the pilot location.

Activities include:

* Database integration
* User acceptance testing
* Manager training
* Alert configuration
* Production readiness review

Pilot completion target: Month 3.

### Stage 2 — Multi-Site Rollout

Following pilot acceptance, the remaining five sites will be onboarded in
three rollout waves.

Target for complete deployment: Month 6.

Training materials, administrator documentation and user guides will be
provided.

## Support \& Maintenance

Nexora provides one year of post-go-live application support.

Service targets:

|Severity|Initial Response|
|-|-:|
|Critical|2 hours|
|High|4 hours|
|Medium|1 business day|
|Low|2 business days|

Support hours are Monday–Friday, 08:00–18:00 CET.

Critical production incidents can be escalated outside standard support hours.

## Risks and Assumptions

The proposal assumes:

* NordFrame provides documented access to the existing PostgreSQL environment.
* Inventory data quality is sufficiently consistent across all six sites.
* NordFrame provides one operational representative per warehouse during rollout.
* Existing warehouse network connectivity is adequate for real-time dashboard use.

Potential risks include:

* Differences in data structures between warehouses
* Incomplete historical inventory records
* Delays in user acceptance testing
* Network instability at individual warehouse locations

These risks will be assessed during the pilot phase.

## Project Timeline

Total duration: 6 months.

* Month 1: Discovery and architecture
* Months 2–3: Pilot development and deployment
* Month 4: Pilot validation
* Months 4–6: Remaining warehouse rollout

## Pricing

|Item|Cost|
|-|-:|
|Discovery \& Architecture|€18,000|
|Application Development|€58,000|
|Database Integration|€22,000|
|Security \& RBAC|€14,000|
|Deployment \& Training|€16,000|
|**Implementation Total**|**€128,000**|

### Annual Support

First-year support and maintenance: **€18,000**

### Total First-Year Cost

**€146,000**

Additional travel expenses, where required, will be invoiced separately.

## Conclusion

Nexora's solution directly addresses NordFrame's inventory visibility
challenges while retaining the existing PostgreSQL database and enabling
controlled deployment across all six locations.

We look forward to supporting NordFrame's warehouse digitalization programme.

