# 🏗️ Elite Build CRM: AI-Native System Blueprint

**Location:** `/.gemini/GEMINI.md`
**Purpose:** Universal Context, Logic Constraints, and Architectural Guardrails.

## 🏛️ I. Strategic Vision

Elite Build is a high-velocity, vertical SaaS platform for the Indian plotted development market. It replaces fragmented workflows (Excel/WhatsApp/Paper maps) with a unified, AI-driven "Command Center."

### 🎯 Key Performance Indicators (KPIs)

- **Lead Response Time:** < 2 minutes (via AI Triage).
- **Information Parity:** 100% sync between Admin Schema, Inventory, and Sales Pitch.
- **Conversion Velocity:** Reduction in "Lead-to-Site Visit" friction via Gemini matching.

## 🎨 II. Midnight Neon Design System

Strict Visual Identity: All UI must adhere to these Tailwind-compatible hex codes.

| Element | Hex Code | Purpose |
| :--- | :--- | :--- |
| App Background | `#230338` | Deep Velvet (Base Canvas) |
| Tiles / Cards | `#3C0753` | Royal Purple (Information Containers) |
| H1 Headers | `#9290C3` | Lavender Slate (Page Titles) |
| H2 / Actions | `#D89216` | Golden Harvest (Sub-headers & CTAs) |
| H3 / Labels | `#D8B9C3` | Dust Rose (Metadata & Captions) |

## 🧠 III. Core Intelligence & Automation

### 1. Universal Lead Ingestion (Webhook)
- **Status:** DEPLOYED
- **Logic:** Centralized entry point for all lead sources. Triggers the `match_lead_to_inventory` Cloud Event upon Firestore document creation.

### 2. Intent Audit (Gemini 2.5 Flash)
- **Status:** DEPLOYED (`main.py`)
- **Model:** `gemini-2.5-flash` (Region: `asia-south1`)
- **Function:** Real-time analysis of `lead_note`. Extracts intent (Construction/Investment/Speculation) and urgency (High/Medium/Low) as structured JSON.

### 3. Probabilistic Plot Matcher
- **Status:** DEPLOYED (`match_lead/main.py`)
- **Query Strategy:** Uses `FieldFilter` for clean, index-friendly queries.
- **Criteria:**
  1. `status == 'Available'`
  2. `location == Lead's requested location`
  3. `price <= Lead's Budget`
- **Sorting:** Price (Descending) with a `pref_facings` tie-breaker logic.

## 🛠️ IV. Data Hierarchy & Schema Factory

Constraint: NO hardcoded property fields. All data structures must be dynamic.

### 1. The Core Tree

Builder (Parent) → Project (Child) → Module Category (e.g. Plot/Villa) → Inventory (Unit).

### 2. Admin Schema Factory (`/admin/schema`)

The Admin defines the "DNA" per project.
- **Metadata Schema:** A JSON array of objects defining label, type (text, num, select, bool), options (dropdown values), and validation.
- **Sales Injection:** The Lead Detail page must dynamically render inputs based on this schema.

## 📞 V. Communication & Compliance (Indian Market)

- **Cloud Telephony:** Integration with local stacks (Exotel/Twilio) for in-browser SIP dialing.
- **TRAI Compliance:** Mandatory "DND Scrub" check before any manual or automated call.
- **WhatsApp Flow:** Automatic delivery of project details and pictures upon first successful communication. Media and data are injected via the Admin Schema Factory.

## 🛰️ VI. Technical Guardrails

- **React:** Use Next.js 16 App Router, use client for interactive forms, and Lucide-React icons.
- **Firebase:**
  - **Auth:** Builder-level multi-tenancy.
  - **Firestore:** Hierarchical sub-collections; avoid deep nesting (>3 levels).
- **State Management:** Prioritize `useState` for local form state and `onSnapshot` for real-time inventory updates.
- **Infrastructure:** All GCP resources must be managed via Terraform in the /terraform directory. Manual console changes are prohibited to prevent configuration drift.

## 🚀 VII. Active Sprints

- **[CURRENT]** Finalize Admin Schema Factory (Firestore Write Logic).
- **[NEXT]** Build Dynamic Inventory Grid (Reading Schema).
- **[PLANNED]** Implement Lead Detail "Sales Cockpit" with Gemini Pitch integration.

## 🚨 Critical Instruction for Gemini

When generating code for this project, always cross-reference the Admin Schema Factory. Never hardcode property attributes like "Road Width" or "Carpet Area." Always assume these are dynamic keys retrieved from `projects/{projectId}/schema`.