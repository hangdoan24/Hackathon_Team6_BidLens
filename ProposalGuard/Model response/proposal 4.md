# Proposal: Real-Time Inventory Visibility Engine

**Submitted by:** DataStream Analytics GmbH (fictional)
**Variant: VERY GOOD (Score: 4.0/5) — Comprehensive, transparent pricing, strong SLA, fully compliant**

## Executive Summary
DataStream Analytics offers a lightweight, high-performance web dashboard built directly on top of NordFrame's existing PostgreSQL inventory database with zero database migration.

## Technical Solution & Deliverables
- **Live Inventory Dashboard**: Responsive web interface providing continuous real-time stock visibility for 6 warehouses.
- **Role-Based Access Control**: Enforced via secure API policies — HQ users query full dataset; regional managers query site-specific data only.
- **Automated Alerting**: Immediate SMS and Email triggers when stock drops below defined thresholds.
- **6-Site Onboarding & Rollout Plan**:
  - *Phase 1 (Pilot)*: Pilot site live within **8 weeks** (2 months).
  - *Phase 2 (Full Rollout)*: Remaining 5 sites onboarded in parallel batches by **Week 20** (5 months total).

## Support & Service Level Agreement (SLA)
- **Critical (System Down)**: 2-hour response time / 8-hour resolution target.
- **Minor Issues**: 24-hour response time.
- Standard support hours: 08:00 - 18:00 CET.

## Pricing Structure
| Item | Investment |
|---|---|
| Core Web Dashboard & PostgreSQL Connector | €52,000 |
| Role-Based Access & Alerting Module | €16,000 |
| Deployment & 6-Site Onboarding | €11,000 |
| Year 1 Premium SLA & Maintenance | €15,000 |
| **Total Project Cost** | **€94,000** |

## Risk Management & Assumptions
- **Dependency**: Requires prompt setup of database read-replicas by NordFrame IT to prevent UI queries from impacting core inventory operations.
- **Risk**: Delay in regional staff attending training sessions; mitigated by providing self-paced video documentation.