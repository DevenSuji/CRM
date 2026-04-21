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

- **Telephony:** Manual calling (no in-app click-to-call). Exotel integration was removed 2026-04-21.
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


## 📜 Gemini Operating Protocol

**One Instruction at a Time:** I will provide only a single command or a single file modification in each response. I must wait for you to share the output or confirm completion before proceeding to the next step.

**Terraform First Mindset:** All infrastructure changes (e.g., creating Cloud Functions, Firestore indexes, or Storage Buckets) must be documented with their CLI commands in `docs/INFRA_MIGRATION_LOG.md`. The ultimate goal is to translate this log into `.tf` files that will live in the `/terraform` directory.

**No Assumptions:** I will not assume a step has been completed. I will ask for verification at each stage.

**Clarity and Precision:** All file paths will be absolute. All code will be production-grade and adhere to the "No Emojis" rule.



For now we need to focus on just 3 pages in the CRM. These 3 pages are the MVP.

1. Leads
2. Projects
3. Admin Console.


### Leads (Shows up as a card)

1. We already have /Users/devensuji/Documents/github/CRM/CRM/functions/lead_ingestion_webhook/main.py that has the capability to inject the lead into the database.
2. The basic details that'll be collected from end users through ADs, Forms and other means are:
  a. Name
  b. Email Address
  c. Phone Number
  d. Budget
  e. When are you planning to buy the property?
  f. Profession.
3. These details needs to be routed to the proper table in the database by the script /Users/devensuji/Documents/github/CRM/CRM/functions/lead_ingestion_webhook/main.py 
4. Once these leads shows up in the leads page in the CRM, our sales associates will call the leads and make the necessary correction if needed in the above given files.
5. The leads page also needs to have the below fields that the sales associate will fill and save. 
  a. Property Type Interested In: Sales associate needs to be able to make multiple selections here. And this is where the details from the Project page is utilised. 
  b. Project Interested In: Sales associate needs to be able to make multiple selections here. And this is where the details from the Project page is utilised. If we do not have the project that the lead is interested in, there should be an option to choose by the name Future Allocation.
  c. Preferred Location: Sales associate needs to be able to make multiple selections here. I want to ensure every name of the location is available here. Also I think sourcing the names from google maps is a good idea here, however I'll leave this decision to you when it comes to sourcing the names of evey possible location.
  d. Notes section with grammer and spell check.
  e. Alternate Phone Number.
  f. Current Address (Optional)
  g. 
6. If needed, an admin should be able to add additional fields to the leads page using admin console.
7. After the first call is made to the lead and the correct details are captured, the lead would have been questioned about which property type and project the lead is interested in and the same would have been selected during the call in the Property Type Interested In and Project Interested In fields. The moment the save button is clicked, the details of the property that the lead is interested in should be nicely formatted as a whatsapp message and be automatically sent to the lead. 
8. When the lead card is clicked and opened. There should be an option to call the lead through the CRM and this call needs to be recorded and saved for a day. Within a day the AI should be able to summarize the call and append to the summary field. Note that it always needs to appened to ensure we are preserving all the conversation that we've had with the lead.

#### The KANBAN BOARD

1. The lead page needs to be a KANBAN board, with visually stunning swimming lanes.

#### Journey Of The Lead
1. The moment the leads are injected to the database, Leads should show up vertically stacked on top of each other with the latest one showing on the top in the first swimming lane in the KANBAN board. The name of this swimming lane should be customizable only by the admin.
2. Everone should be able to sort and filter the leads in every individual swimming lane in the KANBAN board.
3. Admin should be able to add swimming lanes if needed through admin console.
4. Though the names of the swimming lanes in the KANBAN board are customizable and an admin will be able to add and remove swimming lanes, let's keep the default swimming lanes as:
  a. New Leads
  b. First Call
  c. Lead Nurturing
  d. Site Visit
  e. Booked
  f. Closed
  g. Rejected
5. Everyone should be able to drag and drop the leads card to any swimming lanes.
6. When the cursor is hovered over any lead, a ballon needs to pop up where one can scroll over the ballon and read all the fields of the lead.
7. After the call when a Site visit is scheduled for the lead, an immediate notfication should be sent to lead. One more notication needs to be sent 1 day prior and another one the very morning of the site visit day.


### Projects

Projects is the page where we keep the property related details systematically.
Each Project should show up as a big tile as shown in the screenshot /Users/devensuji/Documents/github/CRM/docs/Pictures/ExampleOfProjectsArrengedLikeATile.png.
One should be able to search project using the search bar.
It should also have a filter that uses different fileds.

Some of the default attributes of each property type are given below and rest when needed an admin should be able to define it from the admin console.

1. Plotted Land
    Facing
    Dimension
    Plot Number [Admin should be able to add default values that shows up in the dropdown]
    Asphalt or Cemented roads? [Admin should be able to add default values that shows up in the dropdown]
    Road Width [Admin should be able to add default values that shows up in the dropdown]
    Corner Plot (Yes/No)
    Drainage system
    Electricity connection
    Source of water (Borewell vs Cauvery water) [Admin should be able to add default values that shows up in the dropdown]
    Sewage system
    RERA Approved (Yes/No)
    Khata Type
        MUDA Approved (Yes/No)
        MUDA Allotted (Yes/No)
        Panchayat (DTCP)
        Panchayat (11 B)



2. Apartment
    Unit Number
    Floor Number 
    Carpet Area
    Built Area
    Super Built Up Area 
    Facing
    Dimension 
    Source of water [Admin should be able to add default values that shows up in the dropdown]
    Power backup (full or partial)
    Sewage treatment plant (STP)
    Rainwater harvesting
    Amenities [Admin should be able to add default values that shows up in the dropdown]
    Security (Yes/No)
    CCTV (Yes/No) 
    Gated Community (Yes/No)
    Maintenance deposit [Admin should be able to add default values that shows up in the dropdown]
    Parking Type [Admin should be able to add default values that shows up in the dropdown]
    Lift Availbility (Yes/No)
    Visitor parking availability

3. Villa
    Unit Number
    Carpet Area
    Built Area
    Facing
    Dimension
    Source of water (Borewell vs Cauvery water)
    Power Backup
    Sewage treatment plant (STP)
    Rainwater harvesting
    Amenities [Admin should be able to add default values that shows up in the dropdown]
    Security (Yes/No)
    CCTV (Yes/No) 
    Gated Community (Yes/No)
    Maintenance deposit [Admin should be able to add default values that shows up in the dropdown]
    Parking Type [Admin should be able to add default values that shows up in the dropdown]
    Visitor parking availability

### Features:
1. WhatsApp Integration
2. Leads and Property matching assisted by AI.
3. Admin Console where any fields in the Leads and 


Document Vault (The Trust Builder): Not Needed for now. But in future we'll add it.

Associate Performance Leaderboard: A simple visual in the Admin Console showing which associate has the highest "Site Visit to Booking" ratio. Yes this is needed.

For now we need to focus on just 3 pages in the CRM. These 3 pages are the MVP.

1. Leads
2. Projects
3. Admin Console.


### Leads (Shows up as a card)

1. We already have /Users/devensuji/Documents/github/CRM/CRM/functions/lead_ingestion_webhook/main.py that has the capability to inject the lead into the database.
2. The basic details that'll be collected from end users through ADs, Forms and other means are:
  a. Name
  b. Email Address
  c. Phone Number
  d. Budget
  e. When are you planning to buy the property?
  f. Profession.
3. These details needs to be routed to the proper table in the database by the script /Users/devensuji/Documents/github/CRM/CRM/functions/lead_ingestion_webhook/main.py 
4. Once these leads shows up in the leads page in the CRM, our sales associates will call the leads and make the necessary correction if needed in the above given files.
5. The leads page also needs to have the below fields that the sales associate will fill and save. 
  a. Property Type Interested In: Sales associate needs to be able to make multiple selections here. And this is where the details from the Project page is utilised. 
  b. Project Interested In: Sales associate needs to be able to make multiple selections here. And this is where the details from the Project page is utilised. If we do not have the project that the lead is interested in, there should be an option to choose by the name Future Allocation.
  c. Preferred Location: Sales associate needs to be able to make multiple selections here. I want to ensure every name of the location is available here. Also I think sourcing the names from google maps is a good idea here, however I'll leave this decision to you when it comes to sourcing the names of evey possible location.
  d. Notes section with grammer and spell check.
  e. Alternate Phone Number.
  f. Current Address (Optional)
  g. 
6. If needed, an admin should be able to add additional fields to the leads page using admin console.
7. After the first call is made to the lead and the correct details are captured, the lead would have been questioned about which property type and project the lead is interested in and the same would have been selected during the call in the Property Type Interested In and Project Interested In fields. The moment the save button is clicked, the details of the property that the lead is interested in should be nicely formatted as a whatsapp message and be automatically sent to the lead. 
8. When the lead card is clicked and opened. There should be an option to call the lead through the CRM and this call needs to be recorded and saved for a day. Within a day the AI should be able to summarize the call and append to the summary field. Note that it always needs to appened to ensure we are preserving all the conversation that we've had with the lead.

#### The KANBAN BOARD

1. The lead page needs to be a KANBAN board, with visually stunning swimming lanes.

#### Journey Of The Lead
1. The moment the leads are injected to the database, Leads should show up vertically stacked on top of each other with the latest one showing on the top in the first swimming lane in the KANBAN board. The name of this swimming lane should be customizable only by the admin.
2. Everone should be able to sort and filter the leads in every individual swimming lane in the KANBAN board.
3. Admin should be able to add swimming lanes if needed through admin console.
4. Though the names of the swimming lanes in the KANBAN board are customizable and an admin will be able to add and remove swimming lanes, let's keep the default swimming lanes as:
  a. New Leads
  b. First Call
  c. Lead Nurturing
  d. Site Visit
  e. Booked
  f. Closed
  g. Rejected
5. Everyone should be able to drag and drop the leads card to any swimming lanes.
6. When the cursor is hovered over any lead, a ballon needs to pop up where one can scroll over the ballon and read all the fields of the lead.
7. After the call when a Site visit is scheduled for the lead, an immediate notfication should be sent to lead. One more notication needs to be sent 1 day prior and another one the very morning of the site visit day.


### Projects

Projects is the page where we keep the property related details systematically.
Each Project should show up as a big tile as shown in the screenshot /Users/devensuji/Documents/github/CRM/docs/Pictures/ExampleOfProjectsArrengedLikeATile.png.
One should be able to search project using the search bar.
It should also have a filter that uses different fileds.

Some of the default attributes of each property type are given below and rest when needed an admin should be able to define it from the admin console.

1. Plotted Land
    Facing
    Dimension
    Plot Number [Admin should be able to add default values that shows up in the dropdown]
    Asphalt or Cemented roads? [Admin should be able to add default values that shows up in the dropdown]
    Road Width [Admin should be able to add default values that shows up in the dropdown]
    Corner Plot (Yes/No)
    Drainage system
    Electricity connection
    Source of water (Borewell vs Cauvery water) [Admin should be able to add default values that shows up in the dropdown]
    Sewage system
    RERA Approved (Yes/No)
    Khata Type
        MUDA Approved (Yes/No)
        MUDA Allotted (Yes/No)
        Panchayat (DTCP)
        Panchayat (11 B)



2. Apartment
    Unit Number
    Floor Number 
    Carpet Area
    Built Area
    Super Built Up Area 
    Facing
    Dimension 
    Source of water [Admin should be able to add default values that shows up in the dropdown]
    Power backup (full or partial)
    Sewage treatment plant (STP)
    Rainwater harvesting
    Amenities [Admin should be able to add default values that shows up in the dropdown]
    Security (Yes/No)
    CCTV (Yes/No) 
    Gated Community (Yes/No)
    Maintenance deposit [Admin should be able to add default values that shows up in the dropdown]
    Parking Type [Admin should be able to add default values that shows up in the dropdown]
    Lift Availbility (Yes/No)
    Visitor parking availability

3. Villa
    Unit Number
    Carpet Area
    Built Area
    Facing
    Dimension
    Source of water (Borewell vs Cauvery water)
    Power Backup
    Sewage treatment plant (STP)
    Rainwater harvesting
    Amenities [Admin should be able to add default values that shows up in the dropdown]
    Security (Yes/No)
    CCTV (Yes/No) 
    Gated Community (Yes/No)
    Maintenance deposit [Admin should be able to add default values that shows up in the dropdown]
    Parking Type [Admin should be able to add default values that shows up in the dropdown]
    Visitor parking availability

### Features:
1. WhatsApp Integration
2. Leads and Property matching assisted by AI.
3. Admin Console where any fields in the Leads and 


Document Vault (The Trust Builder): Not Needed for now. But in future we'll add it.

Associate Performance Leaderboard: A simple visual in the Admin Console showing which associate has the highest "Site Visit to Booking" ratio. Yes this is needed.

For now we need to focus on just 3 pages in the CRM. These 3 pages are the MVP.

1. Leads
2. Projects
3. Admin Console.


### Leads (Shows up as a card)

1. We already have /Users/devensuji/Documents/github/CRM/CRM/functions/lead_ingestion_webhook/main.py that has the capability to inject the lead into the database.
2. The basic details that'll be collected from end users through ADs, Forms and other means are:
  a. Name
  b. Email Address
  c. Phone Number
  d. Budget
  e. When are you planning to buy the property?
  f. Profession.
3. These details needs to be routed to the proper table in the database by the script /Users/devensuji/Documents/github/CRM/CRM/functions/lead_ingestion_webhook/main.py 
4. Once these leads shows up in the leads page in the CRM, our sales associates will call the leads and make the necessary correction if needed in the above given files.
5. The leads page also needs to have the below fields that the sales associate will fill and save. 
  a. Property Type Interested In: Sales associate needs to be able to make multiple selections here. And this is where the details from the Project page is utilised. 
  b. Project Interested In: Sales associate needs to be able to make multiple selections here. And this is where the details from the Project page is utilised. If we do not have the project that the lead is interested in, there should be an option to choose by the name Future Allocation.
  c. Preferred Location: Sales associate needs to be able to make multiple selections here. I want to ensure every name of the location is available here. Also I think sourcing the names from google maps is a good idea here, however I'll leave this decision to you when it comes to sourcing the names of evey possible location.
  d. Notes section with grammer and spell check.
  e. Alternate Phone Number.
  f. Current Address (Optional)
  g. 
6. If needed, an admin should be able to add additional fields to the leads page using admin console.
7. After the first call is made to the lead and the correct details are captured, the lead would have been questioned about which property type and project the lead is interested in and the same would have been selected during the call in the Property Type Interested In and Project Interested In fields. The moment the save button is clicked, the details of the property that the lead is interested in should be nicely formatted as a whatsapp message and be automatically sent to the lead. 
8. When the lead card is clicked and opened. There should be an option to call the lead through the CRM and this call needs to be recorded and saved for a day. Within a day the AI should be able to summarize the call and append to the summary field. Note that it always needs to appened to ensure we are preserving all the conversation that we've had with the lead.

#### The KANBAN BOARD

1. The lead page needs to be a KANBAN board, with visually stunning swimming lanes.

#### Journey Of The Lead
1. The moment the leads are injected to the database, Leads should show up vertically stacked on top of each other with the latest one showing on the top in the first swimming lane in the KANBAN board. The name of this swimming lane should be customizable only by the admin.
2. Everone should be able to sort and filter the leads in every individual swimming lane in the KANBAN board.
3. Admin should be able to add swimming lanes if needed through admin console.
4. Though the names of the swimming lanes in the KANBAN board are customizable and an admin will be able to add and remove swimming lanes, let's keep the default swimming lanes as:
  a. New Leads
  b. First Call
  c. Lead Nurturing
  d. Site Visit
  e. Booked
  f. Closed
  g. Rejected
5. Everyone should be able to drag and drop the leads card to any swimming lanes.
6. When the cursor is hovered over any lead, a ballon needs to pop up where one can scroll over the ballon and read all the fields of the lead.
7. After the call when a Site visit is scheduled for the lead, an immediate notfication should be sent to lead. One more notication needs to be sent 1 day prior and another one the very morning of the site visit day.


### Projects

Projects is the page where we keep the property related details systematically.
Each Project should show up as a big tile as shown in the screenshot /Users/devensuji/Documents/github/CRM/docs/Pictures/ExampleOfProjectsArrengedLikeATile.png.
One should be able to search project using the search bar.
It should also have a filter that uses different fileds.

Some of the default attributes of each property type are given below and rest when needed an admin should be able to define it from the admin console.

1. Plotted Land
    Facing
    Dimension
    Plot Number [Admin should be able to add default values that shows up in the dropdown]
    Asphalt or Cemented roads? [Admin should be able to add default values that shows up in the dropdown]
    Road Width [Admin should be able to add default values that shows up in the dropdown]
    Corner Plot (Yes/No)
    Drainage system
    Electricity connection
    Source of water (Borewell vs Cauvery water) [Admin should be able to add default values that shows up in the dropdown]
    Sewage system
    RERA Approved (Yes/No)
    Khata Type
        MUDA Approved (Yes/No)
        MUDA Allotted (Yes/No)
        Panchayat (DTCP)
        Panchayat (11 B)



2. Apartment
    Unit Number
    Floor Number 
    Carpet Area
    Built Area
    Super Built Up Area 
    Facing
    Dimension 
    Source of water [Admin should be able to add default values that shows up in the dropdown]
    Power backup (full or partial)
    Sewage treatment plant (STP)
    Rainwater harvesting
    Amenities [Admin should be able to add default values that shows up in the dropdown]
    Security (Yes/No)
    CCTV (Yes/No) 
    Gated Community (Yes/No)
    Maintenance deposit [Admin should be able to add default values that shows up in the dropdown]
    Parking Type [Admin should be able to add default values that shows up in the dropdown]
    Lift Availbility (Yes/No)
    Visitor parking availability

3. Villa
    Unit Number
    Carpet Area
    Built Area
    Facing
    Dimension
    Source of water (Borewell vs Cauvery water)
    Power Backup
    Sewage treatment plant (STP)
    Rainwater harvesting
    Amenities [Admin should be able to add default values that shows up in the dropdown]
    Security (Yes/No)
    CCTV (Yes/No) 
    Gated Community (Yes/No)
    Maintenance deposit [Admin should be able to add default values that shows up in the dropdown]
    Parking Type [Admin should be able to add default values that shows up in the dropdown]
    Visitor parking availability

### Features:
1. WhatsApp Integration
2. Leads and Property matching assisted by AI.
3. Admin Console where any fields in the Leads and 


Document Vault (The Trust Builder): Not Needed for now. But in future we'll add it.

Associate Performance Leaderboard: A simple visual in the Admin Console showing which associate has the highest "Site Visit to Booking" ratio. Yes this is needed.

For now we need to focus on just 3 pages in the CRM. These 3 pages are the MVP.

1. Leads
2. Projects
3. Admin Console.


### Leads (Shows up as a card)

1. We already have /Users/devensuji/Documents/github/CRM/CRM/functions/lead_ingestion_webhook/main.py that has the capability to inject the lead into the database.
2. The basic details that'll be collected from end users through ADs, Forms and other means are:
  a. Name
  b. Email Address
  c. Phone Number
  d. Budget
  e. When are you planning to buy the property?
  f. Profession.
3. These details needs to be routed to the proper table in the database by the script /Users/devensuji/Documents/github/CRM/CRM/functions/lead_ingestion_webhook/main.py 
4. Once these leads shows up in the leads page in the CRM, our sales associates will call the leads and make the necessary correction if needed in the above given files.
5. The leads page also needs to have the below fields that the sales associate will fill and save. 
  a. Property Type Interested In: Sales associate needs to be able to make multiple selections here. And this is where the details from the Project page is utilised. 
  b. Project Interested In: Sales associate needs to be able to make multiple selections here. And this is where the details from the Project page is utilised. If we do not have the project that the lead is interested in, there should be an option to choose by the name Future Allocation.
  c. Preferred Location: Sales associate needs to be able to make multiple selections here. I want to ensure every name of the location is available here. Also I think sourcing the names from google maps is a good idea here, however I'll leave this decision to you when it comes to sourcing the names of evey possible location.
  d. Notes section with grammer and spell check.
  e. Alternate Phone Number.
  f. Current Address (Optional)
  g. 
6. If needed, an admin should be able to add additional fields to the leads page using admin console.
7. After the first call is made to the lead and the correct details are captured, the lead would have been questioned about which property type and project the lead is interested in and the same would have been selected during the call in the Property Type Interested In and Project Interested In fields. The moment the save button is clicked, the details of the property that the lead is interested in should be nicely formatted as a whatsapp message and be automatically sent to the lead. 
8. When the lead card is clicked and opened. There should be an option to call the lead through the CRM and this call needs to be recorded and saved for a day. Within a day the AI should be able to summarize the call and append to the summary field. Note that it always needs to appened to ensure we are preserving all the conversation that we've had with the lead.

#### The KANBAN BOARD

1. The lead page needs to be a KANBAN board, with visually stunning swimming lanes.

#### Journey Of The Lead
1. The moment the leads are injected to the database, Leads should show up vertically stacked on top of each other with the latest one showing on the top in the first swimming lane in the KANBAN board. The name of this swimming lane should be customizable only by the admin.
2. Everone should be able to sort and filter the leads in every individual swimming lane in the KANBAN board.
3. Admin should be able to add swimming lanes if needed through admin console.
4. Though the names of the swimming lanes in the KANBAN board are customizable and an admin will be able to add and remove swimming lanes, let's keep the default swimming lanes as:
  a. New Leads
  b. First Call
  c. Lead Nurturing
  d. Site Visit
  e. Booked
  f. Closed
  g. Rejected
5. Everyone should be able to drag and drop the leads card to any swimming lanes.
6. When the cursor is hovered over any lead, a ballon needs to pop up where one can scroll over the ballon and read all the fields of the lead.


### Projects

Projects is the page where we keep the property related details systematically.
Each Project should show up as a big tile as shown in the screenshot /Users/devensuji/Documents/github/CRM/docs/Pictures/ExampleOfProjectsArrengedLikeATile.png.
One should be able to search project using the search bar.
It should also have a filter that uses different fileds.

Some of the default attributes of each property type are given below and rest when needed an admin should be able to define it from the admin console.

1. Plotted Land
    Facing
    Dimension
    Plot Number [Admin should be able to add default values that shows up in the dropdown]
    Asphalt or Cemented roads? [Admin should be able to add default values that shows up in the dropdown]
    Road Width [Admin should be able to add default values that shows up in the dropdown]
    Corner Plot (Yes/No)
    Drainage system
    Electricity connection
    Source of water (Borewell vs Cauvery water) [Admin should be able to add default values that shows up in the dropdown]
    Sewage system
    RERA Approved (Yes/No)
    Khata Type
        MUDA Approved (Yes/No)
        MUDA Allotted (Yes/No)
        Panchayat (DTCP)
        Panchayat (11 B)



2. Apartment
    Unit Number
    Floor Number 
    Carpet Area
    Built Area
    Super Built Up Area 
    Facing
    Dimension 
    Source of water [Admin should be able to add default values that shows up in the dropdown]
    Power backup (full or partial)
    Sewage treatment plant (STP)
    Rainwater harvesting
    Amenities [Admin should be able to add default values that shows up in the dropdown]
    Security (Yes/No)
    CCTV (Yes/No) 
    Gated Community (Yes/No)
    Maintenance deposit [Admin should be able to add default values that shows up in the dropdown]
    Parking Type [Admin should be able to add default values that shows up in the dropdown]
    Lift Availbility (Yes/No)
    Visitor parking availability

3. Villa
    Unit Number
    Carpet Area
    Built Area
    Facing
    Dimension
    Source of water (Borewell vs Cauvery water)
    Power Backup
    Sewage treatment plant (STP)
    Rainwater harvesting
    Amenities [Admin should be able to add default values that shows up in the dropdown]
    Security (Yes/No)
    CCTV (Yes/No) 
    Gated Community (Yes/No)
    Maintenance deposit [Admin should be able to add default values that shows up in the dropdown]
    Parking Type [Admin should be able to add default values that shows up in the dropdown]
    Visitor parking availability

### Features:
1. WhatsApp Integration
2. Leads and Property matching assisted by AI.
3. Admin Console where any fields in the Leads and 