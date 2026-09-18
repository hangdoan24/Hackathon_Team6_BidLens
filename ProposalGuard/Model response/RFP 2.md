# Request for Proposal — Enterprise AI & Hybrid Cloud Modernization for Supply Chain

**Client:** Bavarian Auto Logistics Group AG (fictional)  
**Industry:** Automotive / Supply Chain  
**Location:** Munich, Germany  

## 1. Background & Context
Bavarian Auto Logistics AG operates a European supply chain network servicing 14 assembly plants. Our legacy logistics coordination relies on an on-premise SAP S/4HANA ERP coupled with manual PDF processing for shipping manifests. We suffer from operational latency and lack automated exception handling.

## 2. Technical & Business Requirements
1. **Automated Manifest Document Processing (AI Engine):** An AI OCR/LLM extraction pipeline processing ~50,000 PDF invoices/manifests monthly, writing structured output directly to SAP S/4HANA.
2. **Hybrid Cloud Integration Architecture:** Solution must bridge our on-premise SAP ERP with a cloud-based exception dashboard. Strictly **no cloud migration of core SAP data**; read/write access must use secure SAP RFC/OData connectors via private VPN/ExpressRoute.
3. **Regulatory & Compliance (Non-negotiable):** 
   - 100% compliance with EU GDPR and the new **EU AI Act (Risk Class II Tier)**.
   - All AI models must run on ISO-27001 and **BSI C5-certified data centers within Germany**.
   - Zero retention/training on client data by third-party LLM vendors.
4. **Operations & Role-Based Access (RBAC):** Plant managers see local site data; Central Supply Chain Directors require full European network visibility.
5. **Multi-Platform Dispatch:** Urgent logistics exceptions must trigger automated alerts into Microsoft Teams and SAP Fiori.
6. **Implementation Phase:** Phased execution across 3 operational hubs: Pilot at Munich Hub, followed by Leipzig and Vienna hubs.

## 3. Commercial Terms & SLA Requirements
* **Budget:** €350,000 – €500,000 fixed price (inclusive of Year 1 24/7 Managed Services & SLA).
* **Timeline:** Working Pilot in Munich within 3 months; full 3-hub rollout within 7 months.
* **SLA Commitments:** 99.9% uptime; 15-minute response time for Critical (Severity 1) incidents during peak operational hours (06:00 - 22:00 CET).