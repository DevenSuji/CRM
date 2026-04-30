import type { ActivityLogEntry, CallbackRequest, InterestedProperty, Lead, LeadRawData, SiteVisit } from '@/lib/types/lead';
import { buildDuplicateKeys } from '@/lib/utils/leadDuplicates';

type MergeArrayItem = { id?: string };

export interface LeadMergeResult {
  blockedReason?: string;
  update: Partial<Lead> & { raw_data: LeadRawData };
  transferredBookedUnitId?: string;
}

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'n/a' || normalized === 'unknown' || normalized === 'not specified';
}

function preferPrimary<T>(primary: T, duplicate: T): T {
  return isBlank(primary) ? duplicate : primary;
}

function mergeById<T extends MergeArrayItem>(primary: T[] = [], duplicate: T[] = []): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of [...primary, ...duplicate]) {
    const key = item.id || JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function mergeInterestedProperties(primary: InterestedProperty[] = [], duplicate: InterestedProperty[] = []): InterestedProperty[] {
  const seen = new Set<string>();
  const merged: InterestedProperty[] = [];
  for (const item of [...primary, ...duplicate]) {
    const key = `${item.projectId}:${item.tagged_by || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function mergeRawData(primary: LeadRawData, duplicate: LeadRawData): LeadRawData {
  const merged: LeadRawData = {
    ...primary,
    lead_name: preferPrimary(primary.lead_name, duplicate.lead_name),
    phone: preferPrimary(primary.phone, duplicate.phone),
    whatsapp: preferPrimary(primary.whatsapp, duplicate.whatsapp),
    whatsapp_number: preferPrimary(primary.whatsapp_number, duplicate.whatsapp_number),
    email: preferPrimary(primary.email, duplicate.email),
    budget: primary.budget || duplicate.budget || 0,
    plan_to_buy: preferPrimary(primary.plan_to_buy, duplicate.plan_to_buy),
    profession: preferPrimary(primary.profession, duplicate.profession),
    location: preferPrimary(primary.location, duplicate.location),
    note: preferPrimary(primary.note, duplicate.note),
    pref_facings: Array.from(new Set([...(primary.pref_facings || []), ...(duplicate.pref_facings || [])])),
    interest: preferPrimary(primary.interest, duplicate.interest),
    interests: Array.from(new Set([...(primary.interests || []), ...(duplicate.interests || [])])),
    bhk: primary.bhk || duplicate.bhk,
    house_variant: preferPrimary(primary.house_variant, duplicate.house_variant),
    geo: primary.geo || duplicate.geo,
  };

  if (!merged.interests || merged.interests.length === 0) delete merged.interests;
  if (!merged.bhk) delete merged.bhk;
  if (!merged.house_variant) delete merged.house_variant;
  if (!merged.whatsapp) delete merged.whatsapp;
  if (!merged.whatsapp_number) delete merged.whatsapp_number;
  if (!merged.geo) delete merged.geo;
  return merged;
}

export function buildMergedLeadUpdate(primary: Lead, duplicate: Lead, actorName: string, now = new Date()): LeadMergeResult {
  const primaryBooking = primary.booked_unit || null;
  const duplicateBooking = duplicate.booked_unit || null;
  if (primaryBooking && duplicateBooking && primaryBooking.unitId !== duplicateBooking.unitId) {
    return {
      blockedReason: 'Both leads have different booked units. Release one booking before merging.',
      update: { raw_data: primary.raw_data },
    };
  }

  const rawData = mergeRawData(primary.raw_data, duplicate.raw_data);
  const mergedFrom = Array.from(new Set([
    ...(primary.merged_from || []),
    duplicate.id,
    ...(duplicate.merged_from || []),
  ]));

  const mergeEntry: ActivityLogEntry = {
    id: `merge_${now.getTime()}`,
    type: 'lead_merged',
    text: `Merged duplicate lead "${duplicate.raw_data.lead_name}" into this lead.`,
    author: actorName,
    created_at: now.toISOString(),
    merged_lead_id: duplicate.id,
  };

  return {
    update: {
      raw_data: rawData,
      duplicate_keys: buildDuplicateKeys(rawData),
      activity_log: mergeById<ActivityLogEntry>(primary.activity_log, [
        ...(duplicate.activity_log || []),
        mergeEntry,
      ]),
      site_visits: mergeById<SiteVisit>(primary.site_visits, duplicate.site_visits),
      callback_requests: mergeById<CallbackRequest>(primary.callback_requests, duplicate.callback_requests),
      objections: Array.from(new Set([...(primary.objections || []), ...(duplicate.objections || [])])),
      interested_properties: mergeInterestedProperties(primary.interested_properties, duplicate.interested_properties),
      dismissed_matches: Array.from(new Set([...(primary.dismissed_matches || []), ...(duplicate.dismissed_matches || [])])),
      booked_unit: primaryBooking || duplicateBooking || null,
      assigned_to: primary.assigned_to || duplicate.assigned_to || null,
      merged_from: mergedFrom,
      merged_at: now.toISOString(),
    },
    transferredBookedUnitId: !primaryBooking && duplicateBooking ? duplicateBooking.unitId : undefined,
  };
}
