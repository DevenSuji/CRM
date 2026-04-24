import math
from datetime import datetime, timezone

import functions_framework
from google.cloud import firestore
from google.cloud.firestore_v1 import FieldFilter


ELIGIBLE_STATUSES = {"New", "First Call", "Nurturing", "Property Matched", "Matched"}
ACTIVE_BUYER_STATUSES = ELIGIBLE_STATUSES | {"Site Visit"}
BHK_PROPERTY_TYPES = {"Apartment", "Villa", "Individual House"}
PROJECT_BUYER_LIMIT = 12
UNIT_BUYER_LIMIT = 8
WRITE_BATCH_LIMIT = 350
DEMAND_GAP_RECENT_LIMIT = 12


def _to_float(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value):
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _resolve_interests(raw_data):
    interests = raw_data.get("interests")
    if isinstance(interests, list):
        cleaned = [str(item).strip() for item in interests if str(item).strip()]
        if cleaned:
            return cleaned

    interest = str(raw_data.get("interest", "")).strip()
    if interest and interest != "General Query":
        return [interest]
    return []


def _resolve_bhk(raw_data):
    return _to_int(raw_data.get("bhk"))


def _read_geo(data):
    if not isinstance(data, dict):
        return None
    lat = _to_float(data.get("lat"), None)
    lng = _to_float(data.get("lng"), None)
    if lat is None or lng is None:
        return None
    return {"lat": lat, "lng": lng}


def _haversine_km(a, b):
    radius_km = 6371
    d_lat = math.radians(b["lat"] - a["lat"])
    d_lng = math.radians(b["lng"] - a["lng"])
    sin_lat = math.sin(d_lat / 2)
    sin_lng = math.sin(d_lng / 2)
    h = sin_lat * sin_lat + math.cos(math.radians(a["lat"])) * math.cos(math.radians(b["lat"])) * sin_lng * sin_lng
    return radius_km * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def _score_price_fit(best_price, budget, max_price):
    if best_price <= budget:
        return 30
    if max_price <= budget:
        return 30
    remaining_headroom = max(0, max_price - best_price)
    total_headroom = max_price - budget
    if total_headroom <= 0:
        return 10
    return round(10 + (remaining_headroom / total_headroom) * 20)


def _score_distance(distance_km):
    if distance_km is None:
        return 8
    if distance_km <= 5:
        return 15
    if distance_km <= 15:
        return 12
    if distance_km <= 30:
        return 9
    if distance_km <= 50:
        return 6
    return 3


def _build_match_reasons(match, budget, max_price, threshold_percent, lead_bhk):
    reasons = [
        f"Property type matches lead interest ({match['propertyType']}).",
        f"{match['matchedUnitCount']} available unit{'s' if match['matchedUnitCount'] > 1 else ''} matched.",
    ]

    if match["bestPrice"] <= budget:
        reasons.append(f"Best price Rs {match['bestPrice']:,.0f} is within budget.")
    else:
        reasons.append(
            f"Best price Rs {match['bestPrice']:,.0f} is within +{threshold_percent}% ceiling Rs {max_price:,.0f}."
        )

    if match["distanceKm"] is not None:
        reasons.append(f"Project is approximately {round(match['distanceKm'], 1)} km from lead location.")
    else:
        reasons.append("Location distance not scored because lead or project geo is missing.")

    if lead_bhk and match["propertyType"] in BHK_PROPERTY_TYPES:
        reasons.append(f"Meets the lead's {lead_bhk} BHK minimum.")

    return reasons


def _compute_match_score(best_price, budget, max_price, matched_unit_count, distance_km, property_type, lead_bhk):
    gate_score = 45
    price_score = _score_price_fit(best_price, budget, max_price)
    distance_score = _score_distance(distance_km)
    inventory_depth_score = min(5, matched_unit_count)
    bhk_fit_score = 5 if lead_bhk and property_type in BHK_PROPERTY_TYPES else 4
    return min(100, gate_score + price_score + distance_score + inventory_depth_score + bhk_fit_score)


def _compute_matches(lead, inventory, projects, threshold_percent):
    raw_data = lead.get("raw_data", {})
    interests = _resolve_interests(raw_data)
    budget = _to_float(raw_data.get("budget"), 0)
    if not interests or budget <= 0:
        return []

    max_price = budget * (1 + (threshold_percent / 100))
    dismissed = set(lead.get("dismissed_matches") or [])
    lead_bhk = _resolve_bhk(raw_data)

    project_map = {project["id"]: project for project in projects}
    grouped = {}

    for unit in inventory:
        property_type = str(unit.get("propertyType", "")).strip()
        if property_type not in interests:
            continue
        if unit.get("status") != "Available":
            continue

        price = _to_float(unit.get("price"), 0)
        if price <= 0 or price > max_price:
            continue

        project_id = unit.get("projectId")
        if not project_id or project_id in dismissed:
            continue

        if lead_bhk and property_type in BHK_PROPERTY_TYPES:
            unit_bhk = _to_int((unit.get("fields") or {}).get("bhk")) or 0
            if unit_bhk < lead_bhk:
                continue

        if project_id not in grouped:
            grouped[project_id] = {"units": [], "bestPrice": price}
        grouped[project_id]["units"].append(unit)
        if price < grouped[project_id]["bestPrice"]:
            grouped[project_id]["bestPrice"] = price

    lead_geo = _read_geo(raw_data.get("geo"))
    results = []
    for project_id, bucket in grouped.items():
        project = project_map.get(project_id, {})
        project_geo = _read_geo(project.get("geo"))
        distance_km = _haversine_km(lead_geo, project_geo) if lead_geo and project_geo else None
        property_type = project.get("propertyType") or bucket["units"][0].get("propertyType") or ""
        scored = {
            "propertyType": property_type,
            "matchedUnitCount": len(bucket["units"]),
            "bestPrice": bucket["bestPrice"],
            "distanceKm": distance_km,
        }
        results.append({
            "projectId": project_id,
            "projectName": project.get("name") or bucket["units"][0].get("projectName") or "Unknown",
            "location": project.get("location") or bucket["units"][0].get("location") or "",
            "propertyType": property_type,
            "heroImage": project.get("heroImage"),
            "matchedUnitCount": len(bucket["units"]),
            "bestPrice": bucket["bestPrice"],
            "distanceKm": distance_km,
            "score": _compute_match_score(
                bucket["bestPrice"], budget, max_price, len(bucket["units"]), distance_km, property_type, lead_bhk
            ),
            "reasons": _build_match_reasons(scored, budget, max_price, threshold_percent, lead_bhk),
        })

    def _sort_key(match):
        distance_bucket = match["distanceKm"] if match["distanceKm"] is not None else float("inf")
        return (-match["score"], distance_bucket, match["bestPrice"])

    results.sort(key=_sort_key)
    return results


def _match_fingerprint(matches):
    parts = []
    for match in matches:
        distance = "" if match.get("distanceKm") is None else round(match["distanceKm"], 1)
        parts.append(
            f"{match.get('projectId', '')}:{match.get('matchedUnitCount', 0)}:{match.get('bestPrice', 0)}:{distance}:{match.get('score', 0)}:{'~'.join(match.get('reasons', []))}"
        )
    parts.sort()
    return "|".join(parts)


def _system_match_entries(matches):
    tagged_at = datetime.now(timezone.utc).isoformat()
    entries = []
    for match in matches:
        entry = {
            "projectId": match["projectId"],
            "projectName": match["projectName"],
            "location": match["location"],
            "propertyType": match["propertyType"],
            "heroImage": match.get("heroImage"),
            "tagged_at": tagged_at,
            "tagged_by": "system-match",
            "matchedUnitCount": match["matchedUnitCount"],
            "bestPrice": match["bestPrice"],
            "matchScore": match["score"],
            "matchReasons": match["reasons"],
        }
        if match.get("distanceKm") is not None:
            entry["distanceKm"] = round(match["distanceKm"], 1)
        entries.append(entry)
    return entries


def _activity_entry(text):
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": f"match_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "type": "note",
        "text": text,
        "author": "System (Auto-Match)",
        "created_at": now,
    }


def _activity_text(matches, status_changed):
    if not matches:
        if status_changed:
            return "Auto-match cleared. Lead moved back to Nurturing because no eligible properties remain."
        return "Auto-match updated. No eligible properties remain for this lead."

    summary = ", ".join(f"{match['projectName']} ({match['score']}/100)" for match in matches[:3])
    if len(matches) > 3:
        summary += ", ..."
    prefix = "Auto-match updated"
    if status_changed:
        prefix = "Auto-match updated and lane moved to Property Matched"
    return f"{prefix}: {summary}"


def _timestamp_ms(value):
    if value is None:
        return 0
    if hasattr(value, "timestamp"):
        try:
            return int(value.timestamp() * 1000)
        except (TypeError, ValueError, OSError):
            return 0
    if isinstance(value, str):
        try:
            normalized = value.replace("Z", "+00:00")
            return int(datetime.fromisoformat(normalized).timestamp() * 1000)
        except ValueError:
            return 0
    return 0


def _latest_activity_ms(lead):
    latest_ms = _timestamp_ms(lead.get("created_at"))
    for entry in lead.get("activity_log") or []:
        latest_ms = max(latest_ms, _timestamp_ms(entry.get("created_at")))
    for visit in lead.get("site_visits") or []:
        latest_ms = max(latest_ms, _timestamp_ms(visit.get("scheduled_at")))
    return latest_ms


def _clamp_score(value):
    return max(0, min(100, round(value)))


def _infer_urgency(lead):
    explicit = ((lead.get("ai_audit") or {}).get("urgency") or "").strip()
    if explicit == "High":
        return {"label": "High", "points": 14, "reason": "AI audit marks this buyer as high urgency."}
    if explicit == "Medium":
        return {"label": "Medium", "points": 9, "reason": "AI audit marks this buyer as medium urgency."}
    if explicit == "Low":
        return {"label": "Low", "points": 4, "reason": "AI audit marks this buyer as low urgency."}

    plan = str((lead.get("raw_data") or {}).get("plan_to_buy", "")).lower()
    if any(term in plan for term in ["immediate", "asap", "urgent", "this week", "this month"]):
        return {
            "label": "High",
            "points": 12,
            "reason": f"Buying timeline suggests urgency ({(lead.get('raw_data') or {}).get('plan_to_buy', '')}).",
        }
    if any(term in plan for term in ["1 month", "2 month", "3 month", "quarter", "soon", "next month"]):
        return {
            "label": "Medium",
            "points": 8,
            "reason": f"Buying timeline is active ({(lead.get('raw_data') or {}).get('plan_to_buy', '')}).",
        }
    return {
        "label": "Low",
        "points": 5,
        "reason": "No strong urgency signal yet, so this buyer is treated as lower urgency.",
    }


def _status_signal(status):
    if status == "Site Visit":
        return {"points": 16, "reason": "Lead is already in Site Visit, which is the strongest open-stage intent signal."}
    if status in {"Property Matched", "Matched"}:
        return {"points": 13, "reason": "Lead is already in Property Matched, so the team has prior fit confirmation."}
    if status == "Nurturing":
        return {"points": 10, "reason": "Lead is in Nurturing, so there is active pipeline context to continue."}
    if status == "First Call":
        return {"points": 8, "reason": "Lead has already progressed to First Call, reducing cold-start friction."}
    if status == "New":
        return {"points": 6, "reason": "Lead is still new, so outreach is early but timely."}
    return {"points": 0, "reason": f"Lead stage is {status}."}


def _recency_signal(lead):
    last_touch_ms = _latest_activity_ms(lead)
    if not last_touch_ms:
        return {
            "points": 2,
            "reason": "No activity timestamp available; recency contribution is minimal.",
            "lastTouchMs": 0,
        }

    age_days = (datetime.now(timezone.utc).timestamp() * 1000 - last_touch_ms) / (1000 * 60 * 60 * 24)
    if age_days <= 3:
        return {"points": 12, "reason": "Recent activity in the last 3 days keeps this buyer hot.", "lastTouchMs": last_touch_ms}
    if age_days <= 7:
        return {"points": 10, "reason": "Recent activity in the last week keeps this buyer warm.", "lastTouchMs": last_touch_ms}
    if age_days <= 14:
        return {"points": 7, "reason": "Activity in the last two weeks keeps this buyer relevant.", "lastTouchMs": last_touch_ms}
    if age_days <= 30:
        return {"points": 4, "reason": "Buyer is not cold yet, but follow-up momentum is fading.", "lastTouchMs": last_touch_ms}
    return {"points": 2, "reason": "Buyer has been quiet for over a month.", "lastTouchMs": last_touch_ms}


def _engagement_signal(lead):
    activity_count = len(lead.get("activity_log") or [])
    visit_count = len(lead.get("site_visits") or [])
    callback_count = len(lead.get("callback_requests") or [])
    interested_count = len(lead.get("interested_properties") or [])
    raw_points = min(12, activity_count * 2 + visit_count * 4 + callback_count * 2 + min(2, interested_count))
    label = f"{activity_count} activity log{'s' if activity_count != 1 else ''}, {visit_count} site visit{'s' if visit_count != 1 else ''}"

    if raw_points >= 10:
        return {"points": raw_points, "label": label, "reason": "Strong engagement history makes this buyer easier to activate."}
    if raw_points >= 5:
        return {"points": raw_points, "label": label, "reason": "Buyer has some engagement history already recorded in CRM."}
    return {
        "points": raw_points,
        "label": label,
        "reason": "Limited engagement history means sales may need more qualification.",
    }


def _build_best_buyer_result(lead, match, unit_label=None):
    urgency = _infer_urgency(lead)
    stage = _status_signal(lead.get("status"))
    recency = _recency_signal(lead)
    engagement = _engagement_signal(lead)
    total_score = _clamp_score(
        match["score"] * 0.62
        + urgency["points"]
        + stage["points"]
        + recency["points"]
        + engagement["points"]
    )

    result = {
        "leadId": lead["id"],
        "leadName": ((lead.get("raw_data") or {}).get("lead_name") or "Unnamed lead"),
        "phone": (lead.get("raw_data") or {}).get("phone", ""),
        "email": (lead.get("raw_data") or {}).get("email", ""),
        "source": lead.get("source") or "Unknown",
        "status": lead.get("status", ""),
        "totalScore": total_score,
        "baseMatchScore": match["score"],
        "reasons": [
            *match["reasons"],
            urgency["reason"],
            stage["reason"],
            recency["reason"],
            engagement["reason"],
        ],
        "matchedUnitCount": match["matchedUnitCount"],
        "bestPrice": match["bestPrice"],
        "urgencyLabel": urgency["label"],
        "urgencyPoints": urgency["points"],
        "stagePoints": stage["points"],
        "recencyPoints": recency["points"],
        "engagementPoints": engagement["points"],
        "engagementLabel": engagement["label"],
        "lastTouchMs": recency["lastTouchMs"],
    }
    if match.get("distanceKm") is not None:
        result["distanceKm"] = round(match["distanceKm"], 1)
    if unit_label:
        result["unitLabel"] = unit_label
    return result


def _sort_best_buyers(a, b):
    if a["totalScore"] != b["totalScore"]:
        return b["totalScore"] - a["totalScore"]
    if a["lastTouchMs"] != b["lastTouchMs"]:
        return b["lastTouchMs"] - a["lastTouchMs"]
    return b["baseMatchScore"] - a["baseMatchScore"]


def _sort_best_buyers_key(buyer):
    return (-buyer["totalScore"], -buyer["lastTouchMs"], -buyer["baseMatchScore"])


def _global_threshold_percent(db):
    threshold_doc = db.collection("crm_config").document("property_match").get()
    if not threshold_doc.exists:
        return 5
    data = threshold_doc.to_dict() or {}
    return _to_float(data.get("threshold_percent", data.get("thresholdPercent")), 5)


def _load_projects(db):
    projects = []
    for snap in db.collection("projects").stream():
        project = snap.to_dict()
        project["id"] = snap.id
        projects.append(project)
    return projects


def _load_inventory(db):
    inventory = []
    for snap in db.collection("inventory").stream():
        unit = snap.to_dict()
        unit["id"] = snap.id
        inventory.append(unit)
    return inventory


def _load_active_buyer_leads(db):
    leads = []
    for snap in db.collection("leads").stream():
        lead = snap.to_dict()
        if lead.get("status") in ACTIVE_BUYER_STATUSES:
            lead["id"] = snap.id
            leads.append(lead)
    return leads


def _rank_best_buyers_for_project(project, project_units, leads, global_threshold, limit=PROJECT_BUYER_LIMIT):
    buyers = []
    for lead in leads:
        effective_threshold = _to_float(lead.get("match_threshold"), None)
        if effective_threshold is None:
            effective_threshold = global_threshold
        matches = _compute_matches(lead, project_units, [project], effective_threshold)
        match = next((candidate for candidate in matches if candidate["projectId"] == project["id"]), None)
        if match:
            buyers.append(_build_best_buyer_result(lead, match))
    buyers.sort(key=_sort_best_buyers_key)
    return buyers[:limit]


def _unit_label(unit):
    fields = unit.get("fields") or {}
    return str(fields.get("unit_number") or fields.get("plot_number") or unit["id"][-6:].upper())


def _rank_best_buyers_for_unit(project, unit, leads, global_threshold, limit=UNIT_BUYER_LIMIT):
    if unit.get("status") != "Available":
        return []

    buyers = []
    unit_label = _unit_label(unit)
    for lead in leads:
        effective_threshold = _to_float(lead.get("match_threshold"), None)
        if effective_threshold is None:
            effective_threshold = global_threshold
        matches = _compute_matches(lead, [unit], [project], effective_threshold)
        if matches:
            buyers.append(_build_best_buyer_result(lead, matches[0], unit_label))
    buyers.sort(key=_sort_best_buyers_key)
    return buyers[:limit]


def _project_snapshot_doc(project, units, leads, global_threshold):
    available_units = [unit for unit in units if unit.get("status") == "Available"]
    buyers = _rank_best_buyers_for_project(project, available_units, leads, global_threshold, PROJECT_BUYER_LIMIT)
    return {
        "projectId": project["id"],
        "projectName": project.get("name", ""),
        "propertyType": project.get("propertyType", ""),
        "inventoryCount": len(available_units),
        "buyerCount": len(buyers),
        "buyers": buyers,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def _unit_snapshot_doc(project, unit, leads, global_threshold):
    buyers = _rank_best_buyers_for_unit(project, unit, leads, global_threshold, UNIT_BUYER_LIMIT)
    return {
        "unitId": unit["id"],
        "projectId": project["id"],
        "projectName": project.get("name", ""),
        "propertyType": project.get("propertyType", unit.get("propertyType", "")),
        "unitLabel": _unit_label(unit),
        "status": unit.get("status", ""),
        "price": _to_float(unit.get("price"), 0),
        "buyerCount": len(buyers),
        "buyers": buyers,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def _reason_label(reason_code):
    labels = {
        "missing_interest": "Interest Missing",
        "missing_budget": "Budget Missing",
        "no_inventory_in_type": "No Inventory In Type",
        "budget_too_low": "Budget Too Low",
        "bhk_mismatch": "BHK Mismatch",
        "dismissed_projects_only": "Dismissed Matches Only",
        "other": "Other Matching Gap",
    }
    return labels.get(reason_code, "Other Matching Gap")


def _budget_band(budget):
    budget = _to_float(budget, 0)
    if budget <= 0:
        return "Unknown"
    if budget < 25_00_000:
        return "Below ₹25L"
    if budget < 50_00_000:
        return "₹25L – ₹50L"
    if budget < 1_00_00_000:
        return "₹50L – ₹1Cr"
    if budget < 2_00_00_000:
        return "₹1Cr – ₹2Cr"
    return "Above ₹2Cr"


def _increment_count(bucket, key, label):
    if not key:
        return
    if key not in bucket:
        bucket[key] = {"key": key, "label": label, "count": 0}
    bucket[key]["count"] += 1


def _sorted_counts(bucket, limit):
    return sorted(bucket.values(), key=lambda item: (-item["count"], item["label"]))[:limit]


def _classify_no_match_intelligence(lead, inventory, projects, global_threshold):
    raw_data = lead.get("raw_data", {})
    interests = _resolve_interests(raw_data)
    budget = _to_float(raw_data.get("budget"), 0)
    effective_threshold = _to_float(lead.get("match_threshold"), None)
    if effective_threshold is None:
        effective_threshold = global_threshold
    max_price = budget * (1 + (effective_threshold / 100))
    dismissed = set(lead.get("dismissed_matches") or [])
    lead_bhk = _resolve_bhk(raw_data)
    matches = _compute_matches(lead, inventory, projects, effective_threshold)

    if matches:
        return None

    reason_code = "other"
    details = []

    if not interests:
        reason_code = "missing_interest"
        details.append("Lead has no property interests captured yet.")
    elif budget <= 0:
        reason_code = "missing_budget"
        details.append("Lead has no valid budget captured yet.")
    else:
        relevant_units = [
            unit for unit in inventory
            if unit.get("status") == "Available" and str(unit.get("propertyType", "")).strip() in interests
        ]
        if not relevant_units:
            reason_code = "no_inventory_in_type"
            details.append(f"No available inventory exists in the requested type(s): {', '.join(interests)}.")
        else:
            priced_units = [unit for unit in relevant_units if _to_float(unit.get("price"), 0) > 0]
            budget_ok_units = [unit for unit in priced_units if _to_float(unit.get("price"), 0) <= max_price]
            non_dismissed_units = [unit for unit in budget_ok_units if unit.get("projectId") not in dismissed]

            if not budget_ok_units:
                reason_code = "budget_too_low"
                lowest_price = min((_to_float(unit.get("price"), 0) for unit in priced_units), default=0)
                if lowest_price > 0:
                    details.append(
                        f"Lowest available inventory price is Rs {lowest_price:,.0f}, above the lead ceiling of Rs {max_price:,.0f}."
                    )
                else:
                    details.append("Matching-type inventory exists, but none has a usable price yet.")
            elif not non_dismissed_units:
                reason_code = "dismissed_projects_only"
                details.append("The only budget-fit projects have already been dismissed from auto-match for this lead.")
            else:
                bhk_sensitive_units = [unit for unit in non_dismissed_units if unit.get("propertyType") in BHK_PROPERTY_TYPES]
                if lead_bhk and bhk_sensitive_units:
                    bhk_ok_units = [
                        unit
                        for unit in non_dismissed_units
                        if unit.get("propertyType") not in BHK_PROPERTY_TYPES
                        or (_to_int((unit.get("fields") or {}).get("bhk")) or 0) >= lead_bhk
                    ]
                    if not bhk_ok_units:
                        reason_code = "bhk_mismatch"
                        max_bhk = max((_to_int((unit.get("fields") or {}).get("bhk")) or 0 for unit in bhk_sensitive_units), default=0)
                        details.append(
                            f"Available units top out at {max_bhk} BHK while the lead requires at least {lead_bhk} BHK."
                        )
                    else:
                        details.append("No exact auto-match survived all gates even though some inventory is partially close.")
                else:
                    details.append("No exact auto-match survived all hard gates for this lead.")

    reason_label = _reason_label(reason_code)
    interest_summary = ", ".join(interests) if interests else "Unknown"
    budget_band = _budget_band(budget)
    summary = details[0] if details else "No eligible inventory currently satisfies this lead."

    return {
        "leadId": lead["id"],
        "leadName": raw_data.get("lead_name") or "Unnamed lead",
        "status": lead.get("status", ""),
        "source": lead.get("source", "Unknown"),
        "interests": interests,
        "interestSummary": interest_summary,
        "budget": budget,
        "budgetBand": budget_band,
        "location": raw_data.get("location", ""),
        "reasonCode": reason_code,
        "reasonLabel": reason_label,
        "summary": summary,
        "details": details,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "lastTouchMs": _latest_activity_ms(lead),
    }


def _refresh_no_match_intelligence(db, reason):
    projects = _load_projects(db)
    inventory = _load_inventory(db)
    leads = _load_active_buyer_leads(db)
    global_threshold = _global_threshold_percent(db)
    existing_ids = {snap.id for snap in db.collection("no_match_intelligence").stream()}

    reason_counts = {}
    interest_counts = {}
    location_counts = {}
    budget_counts = {}
    recent = []
    current_ids = set()

    batch = db.batch()
    writes = 0

    for lead in leads:
        insight = _classify_no_match_intelligence(lead, inventory, projects, global_threshold)
        if not insight:
            continue

        current_ids.add(lead["id"])
        batch.set(db.collection("no_match_intelligence").document(lead["id"]), insight)
        writes += 1

        _increment_count(reason_counts, insight["reasonCode"], insight["reasonLabel"])
        for interest in insight["interests"]:
            _increment_count(interest_counts, interest, interest)
        _increment_count(location_counts, insight["location"] or "Unknown", insight["location"] or "Unknown")
        _increment_count(budget_counts, insight["budgetBand"], insight["budgetBand"])
        recent.append(insight)

        if writes >= WRITE_BATCH_LIMIT:
            batch.commit()
            batch = db.batch()
            writes = 0

    for stale_id in sorted(existing_ids - current_ids):
        batch.delete(db.collection("no_match_intelligence").document(stale_id))
        writes += 1
        if writes >= WRITE_BATCH_LIMIT:
            batch.commit()
            batch = db.batch()
            writes = 0

    recent.sort(key=lambda item: item.get("lastTouchMs", 0), reverse=True)
    for item in recent:
        item.pop("lastTouchMs", None)

    summary = {
        "totalNoMatchLeads": len(current_ids),
        "reasons": _sorted_counts(reason_counts, 8),
        "interests": _sorted_counts(interest_counts, 8),
        "locations": _sorted_counts(location_counts, 8),
        "budgetBands": _sorted_counts(budget_counts, 8),
        "recentLeads": recent[:DEMAND_GAP_RECENT_LIMIT],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "refreshReason": reason,
    }
    batch.set(db.collection("demand_gap_reports").document("current"), summary)
    if writes or True:
        batch.commit()
    print(f"DEMAND_GAP_REFRESHED: reason={reason} leads={len(current_ids)}")


def _commit_batch(batch, writes):
    if writes:
        batch.commit()
    return firestore.Client().batch(), 0


def _refresh_reverse_snapshots_for_projects(db, project_ids, reason):
    project_ids = {project_id for project_id in (project_ids or set()) if project_id}
    if not project_ids:
        return

    projects = {project["id"]: project for project in _load_projects(db)}
    inventory = _load_inventory(db)
    leads = _load_active_buyer_leads(db)
    global_threshold = _global_threshold_percent(db)

    units_by_project = {}
    for unit in inventory:
        units_by_project.setdefault(unit.get("projectId"), []).append(unit)

    batch = db.batch()
    writes = 0
    refreshed_projects = 0
    refreshed_units = 0

    for project_id in sorted(project_ids):
        project = projects.get(project_id)
        if not project:
            batch.delete(db.collection("reverse_match_projects").document(project_id))
            writes += 1
            if writes >= WRITE_BATCH_LIMIT:
                batch.commit()
                batch = db.batch()
                writes = 0
            continue

        units = units_by_project.get(project_id, [])
        batch.set(db.collection("reverse_match_projects").document(project_id), _project_snapshot_doc(project, units, leads, global_threshold))
        writes += 1
        refreshed_projects += 1

        for unit in units:
            batch.set(db.collection("reverse_match_units").document(unit["id"]), _unit_snapshot_doc(project, unit, leads, global_threshold))
            writes += 1
            refreshed_units += 1
            if writes >= WRITE_BATCH_LIMIT:
                batch.commit()
                batch = db.batch()
                writes = 0

    if writes:
        batch.commit()
    print(
        f"REVERSE_SNAPSHOTS_UPDATED: reason={reason} projects={refreshed_projects} units={refreshed_units} targeted={len(project_ids)}"
    )


def _refresh_all_reverse_snapshots(db, reason):
    projects = _load_projects(db)
    inventory = _load_inventory(db)
    leads = _load_active_buyer_leads(db)
    global_threshold = _global_threshold_percent(db)

    units_by_project = {}
    current_project_ids = set()
    current_unit_ids = set()

    for project in projects:
        current_project_ids.add(project["id"])
    for unit in inventory:
        project_id = unit.get("projectId")
        units_by_project.setdefault(project_id, []).append(unit)
        current_unit_ids.add(unit["id"])

    existing_project_snapshot_ids = {snap.id for snap in db.collection("reverse_match_projects").stream()}
    existing_unit_snapshot_ids = {snap.id for snap in db.collection("reverse_match_units").stream()}

    batch = db.batch()
    writes = 0
    refreshed_projects = 0
    refreshed_units = 0

    for project in projects:
        units = units_by_project.get(project["id"], [])
        batch.set(db.collection("reverse_match_projects").document(project["id"]), _project_snapshot_doc(project, units, leads, global_threshold))
        writes += 1
        refreshed_projects += 1

        for unit in units:
            batch.set(db.collection("reverse_match_units").document(unit["id"]), _unit_snapshot_doc(project, unit, leads, global_threshold))
            writes += 1
            refreshed_units += 1
            if writes >= WRITE_BATCH_LIMIT:
                batch.commit()
                batch = db.batch()
                writes = 0

    for stale_project_id in sorted(existing_project_snapshot_ids - current_project_ids):
        batch.delete(db.collection("reverse_match_projects").document(stale_project_id))
        writes += 1
        if writes >= WRITE_BATCH_LIMIT:
            batch.commit()
            batch = db.batch()
            writes = 0

    for stale_unit_id in sorted(existing_unit_snapshot_ids - current_unit_ids):
        batch.delete(db.collection("reverse_match_units").document(stale_unit_id))
        writes += 1
        if writes >= WRITE_BATCH_LIMIT:
            batch.commit()
            batch = db.batch()
            writes = 0

    if writes:
        batch.commit()
    print(
        f"REVERSE_SNAPSHOTS_REFRESHED: reason={reason} projects={refreshed_projects} units={refreshed_units} staleProjects={len(existing_project_snapshot_ids - current_project_ids)} staleUnits={len(existing_unit_snapshot_ids - current_unit_ids)}"
    )


def _eligible_leads(db):
    leads = []
    for snap in db.collection("leads").stream():
        lead = snap.to_dict()
        if lead.get("status") in ELIGIBLE_STATUSES:
            lead["id"] = snap.id
            leads.append(lead)
    return leads


def _run_match_for_lead(db, lead_id, lead=None):
    lead_ref = db.collection("leads").document(lead_id)
    lead_data = lead
    if lead_data is None:
        lead_snap = lead_ref.get()
        if not lead_snap.exists:
            return {"updated": False, "affectedProjectIds": set()}
        lead_data = lead_snap.to_dict()

    lead = lead_data
    existing_system = [prop for prop in (lead.get("interested_properties") or []) if prop.get("tagged_by") == "system-match"]
    old_project_ids = {prop.get("projectId") for prop in existing_system if prop.get("projectId")}

    if lead.get("status") not in ELIGIBLE_STATUSES:
        return {"updated": False, "affectedProjectIds": old_project_ids}

    raw_data = lead.get("raw_data", {})
    interests = _resolve_interests(raw_data)
    budget = _to_float(raw_data.get("budget"), 0)
    if not interests or budget <= 0:
        return {"updated": False, "affectedProjectIds": old_project_ids}

    threshold_percent = _global_threshold_percent(db)
    per_lead_threshold = _to_float(lead.get("match_threshold"), None)
    if per_lead_threshold is not None:
        threshold_percent = per_lead_threshold

    inventory = []
    for snap in db.collection("inventory").where(filter=FieldFilter("status", "==", "Available")).stream():
        unit = snap.to_dict()
        unit["id"] = snap.id
        inventory.append(unit)

    projects = _load_projects(db)
    matches = _compute_matches(lead, inventory, projects, threshold_percent)
    new_project_ids = {match["projectId"] for match in matches}
    affected_project_ids = old_project_ids | new_project_ids
    new_fingerprint = _match_fingerprint(matches)

    existing_manual = [prop for prop in (lead.get("interested_properties") or []) if prop.get("tagged_by") != "system-match"]
    existing_fingerprint = _match_fingerprint([
        {
            "projectId": prop.get("projectId", ""),
            "matchedUnitCount": prop.get("matchedUnitCount", 0),
            "bestPrice": prop.get("bestPrice", 0),
            "distanceKm": prop.get("distanceKm"),
            "score": prop.get("matchScore", 0),
            "reasons": prop.get("matchReasons") or [],
        }
        for prop in existing_system
    ])

    next_status = lead.get("status")
    if matches and lead.get("status") in {"New", "First Call", "Nurturing"}:
        next_status = "Property Matched"
    elif not matches and lead.get("status") in {"Property Matched", "Matched"} and not existing_manual:
        next_status = "Nurturing"

    status_changed = next_status != lead.get("status")
    if existing_fingerprint == new_fingerprint and not status_changed:
        return {"updated": False, "affectedProjectIds": affected_project_ids}

    system_matches = _system_match_entries(matches)
    updates = {
        "interested_properties": existing_manual + system_matches,
        "status": next_status,
        "suggested_plot": matches[0]["projectId"] if matches else None,
        "matched_at": firestore.SERVER_TIMESTAMP if matches else None,
        "last_match_fingerprint": new_fingerprint,
    }

    existing_log = list(lead.get("activity_log") or [])
    existing_log.append(_activity_entry(_activity_text(matches, status_changed)))
    updates["activity_log"] = existing_log[-50:]

    lead_ref.update(updates)
    print(f"MATCH_V2_UPDATED: lead={lead_id} matches={len(matches)} status={next_status}")
    return {"updated": True, "affectedProjectIds": affected_project_ids}


def _rematch_all_eligible_leads(db, reason):
    leads = _eligible_leads(db)
    updated_count = 0
    for lead in leads:
        result = _run_match_for_lead(db, lead["id"], lead)
        if result["updated"]:
            updated_count += 1
    print(f"REMATCH_SWEEP: reason={reason} leads={len(leads)} updated={updated_count}")
    return updated_count


def _subject_doc_id(cloud_event):
    subject = cloud_event.get("subject", "")
    if not subject:
        return ""
    return subject.split("/")[-1]


@functions_framework.cloud_event
def match_lead_to_inventory(cloud_event):
    db = firestore.Client()
    lead_id = _subject_doc_id(cloud_event)
    if not lead_id:
        return
    result = _run_match_for_lead(db, lead_id)
    _refresh_reverse_snapshots_for_projects(db, result["affectedProjectIds"], f"lead:{lead_id}")
    _refresh_no_match_intelligence(db, f"lead:{lead_id}")


@functions_framework.cloud_event
def rematch_leads_on_inventory_change(cloud_event):
    db = firestore.Client()
    unit_id = _subject_doc_id(cloud_event)
    reason = f"inventory:{unit_id}" if unit_id else "inventory"
    _rematch_all_eligible_leads(db, reason)
    _refresh_all_reverse_snapshots(db, reason)
    _refresh_no_match_intelligence(db, reason)


@functions_framework.cloud_event
def rematch_leads_on_project_change(cloud_event):
    db = firestore.Client()
    project_id = _subject_doc_id(cloud_event)
    reason = f"project:{project_id}" if project_id else "project"
    _rematch_all_eligible_leads(db, reason)
    _refresh_all_reverse_snapshots(db, reason)
    _refresh_no_match_intelligence(db, reason)


@functions_framework.cloud_event
def rematch_leads_on_threshold_change(cloud_event):
    db = firestore.Client()
    config_id = _subject_doc_id(cloud_event)
    if config_id and config_id != "property_match":
        print(f"THRESHOLD_TRIGGER_SKIPPED: config={config_id}")
        return
    _rematch_all_eligible_leads(db, "property_match_threshold")
    _refresh_all_reverse_snapshots(db, "property_match_threshold")
    _refresh_no_match_intelligence(db, "property_match_threshold")
