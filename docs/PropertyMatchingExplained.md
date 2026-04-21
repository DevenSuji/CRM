# How Property Matching Works

A plain-English guide to how leads get automatically paired with properties from our inventory.

## The Big Idea

Every lead tells us what they want. Every inventory unit has a price, type, and location. The matching engine runs in the browser, looks at both sides, and tags each lead with the projects that fit their requirements. When a match is found, the lead card automatically moves into the **Property Matched** swim lane.

## What the Engine Needs

For a lead to be matched, the lead card must have:

1. **Interests** — one or more property types (Plotted Land, Villa, Apartment, etc.)
2. **Budget** — an upper limit in rupees
3. **Status** — must be in `New`, `First Call`, `Nurturing`, or `Property Matched`. Leads in Site Visit, Booked, Closed, or Rejected are skipped.

If any of these are missing, the lead is left alone.

## The Matching Rules

For each inventory unit, the engine runs through a checklist. All gates must pass:

| Gate | Rule |
|------|------|
| **Type** | The unit's property type must be in the lead's interests list. |
| **Availability** | The unit's status must be `Available`. Sold/blocked units are ignored. |
| **Price** | The unit's price must be at or below `budget × (1 + threshold%)`. Default threshold is 5%, so a lead with an ₹80L budget will match units up to ₹84L. |
| **BHK** | For Apartment, Villa, and Individual House only — the unit's BHK must be **at least** the lead's BHK requirement. A lead asking for 3 BHK will match 3 BHK or bigger, but never smaller. |
| **Not dismissed** | If a sales associate previously dismissed a project for this lead, it stays dismissed. |

If a unit passes all five gates, it's a match.

## The Threshold Slider

The threshold percentage is adjustable from the Leads page (5% → 100% in 5% steps). Raising it widens the net — a 50% threshold means an ₹80L-budget lead will match units up to ₹1.2Cr. It can also be set **per lead** to override the global default.

## Grouping and Ranking

Matches are grouped by project (not by individual unit), so a project with 10 matching units shows up once with a "10 units match" badge. Results are then sorted:

1. **By distance first** — if both the lead and project have geo coordinates, the nearer project wins (we use the Haversine formula for lat/lng distance).
2. **By price second** — when distances are close (within 1 km) or missing, the cheaper project wins.

## Auto-Moving Between Lanes

The engine also manages the lead's lane:

- **Matches found + lead is in New / First Call / Nurturing** → lead moves to **Property Matched**.
- **No matches + lead is already in Property Matched + no manual tags exist** → lead moves to **Nurturing** (and waits there for future inventory).
- **Lead has manual tags** (sales associate hand-tagged a property) → the manual tags are preserved; only system-generated matches get refreshed.

## When It Runs

The engine runs automatically in the background, debounced by 2 seconds after any data change (lead edit, inventory update, threshold change). It won't run twice for the same lead unless something meaningful changes — budget, interests, threshold, BHK, or dismissed list.

## Diagnosing Misses

If a lead isn't matching as expected, the "Why didn't this match?" diagnostic in the lead card shows a per-unit breakdown: for every inventory unit, it tells you exactly which gate rejected it — "Price ₹95L exceeds ceiling ₹90L", "Unit BHK (2) is below lead's requirement of 3 BHK", and so on.

---

**In one sentence:** match a lead's interests and budget (with a tolerance buffer) against available, BHK-appropriate inventory, group by project, rank by proximity then price, and auto-move the lead to the Property Matched lane when hits are found.


## Pseudocode for the Property Match Algorithm

```
FOR each Lead where status ∈ {New, First Call, Nurturing, Property Matched}
                AND interests is non-empty
                AND budget > 0:

  candidateUnits = all inventory units where:
      unit.propertyType ∈ lead.interests
      AND unit.status = "Available"
      AND unit.price > 0
      AND unit.price <= lead.budget × (1 + threshold/100)     // threshold default 5%
      AND project.location within 5 km of any lead locality    // geo gate
      AND unit.project NOT IN lead.dismissed_matches
      AND (
           unit.propertyType ∉ {Apartment, Villa, Individual House}
           OR unit.bhk >= lead.bhk       // bigger BHK is fine (3 BHK lead matches 3/4/5 BHK)
          )

  IF candidateUnits is non-empty:
     group by project, rank by distance then price
     tag matched projects on the lead
     IF lead.status ∈ {New, First Call, Nurturing}:
        move lead → Property Matched lane
     auto-send a beautifully formatted WhatsApp message with the property details
     write an entry to the lead's activity log:
        { type: "whatsapp_sent",
          timestamp: <now>,
          sent_by: "system-match",
          projects: [<project names>],
          message_preview: <first 200 chars of the body> }

  ELSE IF lead was in Property Matched AND now has no system matches AND no manual tags:
     move lead → Nurturing
```

### Note on the budget comparison

A common slip is to write "Budget ≤ Unit Price + 5%". That's backwards — it would reject a lead whose budget is *lower* than the unit price, which is exactly the case we want to accept when the unit sits within the tolerance band. The correct form is:

> **Unit Price ≤ Budget × (1 + threshold%)**

A ₹80L-budget lead at 5% threshold matches any unit priced ≤ ₹84L.

## The Rejection Flow

When a sales associate calls the lead and they reject a tagged project, here is what happens:

1. **Associate untags the project** from the lead card. The project ID is added to the lead's `dismissed_matches` list so it will never re-tag automatically, even if the matcher runs again.
2. **The matcher re-evaluates the lead.** It ignores dismissed projects and recomputes the remaining matches.
3. **If other system matches still remain**, the lead stays in the Property Matched lane — a dismissal of one project doesn't invalidate the others.
4. **If this was the last match** (no system matches left, no manual tags either), the lead is moved to the **Nurturing** lane and waits there until a new project comes into inventory that fits the lead's preferences.
5. **When a new project later matches a Nurturing lead**, the matcher auto-fires again: it tags the new project, moves the card to Property Matched, and sends the WhatsApp — no approval step, always automatic. Every send is written to the activity log so the team has a complete audit trail of what went out and when.
