"use client";
import { useEffect, useRef, useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Lead, InterestedProperty } from '@/lib/types/lead';
import { InventoryUnit } from '@/lib/types/inventory';
import { Project } from '@/lib/types/project';

/** Resolve a lead's interests — uses new `interests[]` array with fallback to legacy single `interest` string */
export function resolveInterests(raw: Lead['raw_data']): string[] {
  if (raw.interests && raw.interests.length > 0) return raw.interests;
  if (raw.interest && raw.interest !== 'General Query') return [raw.interest];
  return [];
}

/** Resolve a lead's BHK preference — returns null if not set or not applicable */
export function resolveBHK(raw: Lead['raw_data']): number | null {
  if (raw.bhk && raw.bhk > 0) return raw.bhk;
  return null;
}

/** Property types where BHK is a non-negotiable matching factor */
const BHK_PROPERTY_TYPES = new Set(['Apartment', 'Villa', 'Individual House']);

interface MatchResult {
  projectId: string;
  projectName: string;
  location: string;
  propertyType: string;
  heroImage: string | null;
  matchedUnitCount: number;
  bestPrice: number;
  distanceKm?: number;
}

/** Haversine distance in km between two lat/lng points */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Pure matching function — no side effects, easy to test */
export function computeMatches(
  lead: Lead,
  inventory: InventoryUnit[],
  projects: Project[],
  thresholdPercent: number,
): MatchResult[] {
  const interests = resolveInterests(lead.raw_data);
  const budget = lead.raw_data.budget;
  if (interests.length === 0 || !budget || budget <= 0) return [];

  const maxPrice = budget * (1 + thresholdPercent / 100);
  const dismissed = new Set(lead.dismissed_matches || []);
  const leadBHK = resolveBHK(lead.raw_data);

  // Filter matching inventory units
  const matchingUnits = inventory.filter(unit => {
    if (!interests.includes(unit.propertyType)) return false;
    if (unit.status !== 'Available') return false;
    if (unit.price <= 0 || unit.price > maxPrice) return false;
    if (dismissed.has(unit.projectId)) return false;

    // BHK is non-negotiable for Apartment, Villa, Individual House
    if (leadBHK && BHK_PROPERTY_TYPES.has(unit.propertyType)) {
      const unitBHK = unit.fields?.bhk ? Number(unit.fields.bhk) : 0;
      if (unitBHK < leadBHK) return false;
    }

    return true;
  });

  // Group by project
  const projectMap = new Map<string, { units: InventoryUnit[]; bestPrice: number }>();
  for (const unit of matchingUnits) {
    const existing = projectMap.get(unit.projectId);
    if (existing) {
      existing.units.push(unit);
      if (unit.price < existing.bestPrice) existing.bestPrice = unit.price;
    } else {
      projectMap.set(unit.projectId, { units: [unit], bestPrice: unit.price });
    }
  }

  // Build results with project details + distance
  const leadGeo = lead.raw_data.geo;
  const results: MatchResult[] = [];
  for (const [projectId, data] of projectMap) {
    const project = projects.find(p => p.id === projectId);
    let distanceKm: number | undefined;
    if (leadGeo && project?.geo) {
      distanceKm = haversineKm(leadGeo, project.geo);
    }
    results.push({
      projectId,
      projectName: project?.name || data.units[0]?.projectName || 'Unknown',
      location: project?.location || data.units[0]?.location || '',
      propertyType: project?.propertyType || data.units[0]?.propertyType || '',
      heroImage: project?.heroImage || null,
      matchedUnitCount: data.units.length,
      bestPrice: data.bestPrice,
      distanceKm,
    });
  }

  // Sort: by proximity if geo available, then by bestPrice
  results.sort((a, b) => {
    // If both have distance, sort by distance first
    if (a.distanceKm != null && b.distanceKm != null) {
      const distDiff = a.distanceKm - b.distanceKm;
      if (Math.abs(distDiff) > 1) return distDiff; // >1km difference — proximity wins
    }
    // Fall back to price
    return a.bestPrice - b.bestPrice;
  });

  return results;
}

/** Diagnostic: explain why each inventory unit did or didn't match a lead.
 * Returns a per-unit report so the UI can surface exactly which gate is blocking matches.
 */
export interface UnitMatchDiagnosis {
  unitId: string;
  projectId: string;
  projectName: string;
  propertyType: string;
  status: string;
  price: number;
  unitBHK: number | null;
  matched: boolean;
  reason: string; // human-readable rejection reason, or 'MATCH' when kept
}

export interface MatchDiagnosis {
  leadOk: boolean;
  leadReason: string; // "OK" or why the lead itself is skipped
  interests: string[];
  budget: number;
  maxPrice: number;
  leadBHK: number | null;
  thresholdPercent: number;
  dismissedProjectIds: string[];
  inventoryCount: number;
  units: UnitMatchDiagnosis[];
  matchCount: number;
}

export function diagnoseMatches(
  lead: Lead,
  inventory: InventoryUnit[],
  projects: Project[],
  thresholdPercent: number,
): MatchDiagnosis {
  const interests = resolveInterests(lead.raw_data);
  const budget = lead.raw_data.budget || 0;
  const leadBHK = resolveBHK(lead.raw_data);
  const maxPrice = budget * (1 + thresholdPercent / 100);
  const dismissed = new Set(lead.dismissed_matches || []);

  let leadOk = true;
  let leadReason = 'OK';
  if (lead.status !== 'New' && lead.status !== 'First Call' && lead.status !== 'Nurturing' && lead.status !== 'Property Matched') {
    leadOk = false; leadReason = `Lead status "${lead.status}" is not eligible (only New / First Call / Nurturing / Property Matched auto-match).`;
  } else if (interests.length === 0) {
    leadOk = false; leadReason = 'Lead has no interests set.';
  } else if (!budget || budget <= 0) {
    leadOk = false; leadReason = 'Lead has no budget set.';
  }

  const projectNameById = new Map(projects.map(p => [p.id, p.name] as const));

  const units: UnitMatchDiagnosis[] = inventory.map(u => {
    const base = {
      unitId: u.id,
      projectId: u.projectId,
      projectName: projectNameById.get(u.projectId) || u.projectName || 'Unknown project',
      propertyType: u.propertyType,
      status: u.status,
      price: u.price,
      unitBHK: u.fields?.bhk !== undefined && u.fields?.bhk !== '' ? Number(u.fields.bhk) : null,
    };
    if (!interests.includes(u.propertyType)) {
      return { ...base, matched: false, reason: `Type "${u.propertyType}" not in lead interests (${interests.join(', ')}).` };
    }
    if (u.status !== 'Available') {
      return { ...base, matched: false, reason: `Unit status is "${u.status}", not Available.` };
    }
    if (u.price <= 0) {
      return { ...base, matched: false, reason: 'Unit has no price.' };
    }
    if (u.price > maxPrice) {
      return { ...base, matched: false, reason: `Price ₹${u.price.toLocaleString('en-IN')} exceeds ceiling ₹${maxPrice.toLocaleString('en-IN')} (budget +${thresholdPercent}%).` };
    }
    if (dismissed.has(u.projectId)) {
      return { ...base, matched: false, reason: 'Project is in this lead\'s dismissed_matches list.' };
    }
    if (leadBHK && BHK_PROPERTY_TYPES.has(u.propertyType)) {
      const unitBHK = u.fields?.bhk ? Number(u.fields.bhk) : 0;
      if (unitBHK < leadBHK) {
        return { ...base, matched: false, reason: `Unit BHK (${unitBHK || 'unset'}) is below lead's requirement of ${leadBHK} BHK.` };
      }
    }
    return { ...base, matched: true, reason: 'MATCH' };
  });

  return {
    leadOk,
    leadReason,
    interests,
    budget,
    maxPrice,
    leadBHK,
    thresholdPercent,
    dismissedProjectIds: Array.from(dismissed),
    inventoryCount: inventory.length,
    units,
    matchCount: units.filter(u => u.matched).length,
  };
}

/** Serialize match results into a stable fingerprint for change detection */
function matchFingerprint(matches: MatchResult[]): string {
  return matches.map(m => `${m.projectId}:${m.matchedUnitCount}:${m.bestPrice}:${m.distanceKm ?? ''}`).sort().join('|');
}

interface UsePropertyMatchingOptions {
  leads: Lead[];
  inventory: InventoryUnit[];
  projects: Project[];
  thresholdPercent: number;
  userName: string;
  enabled: boolean;
}

export function usePropertyMatching({
  leads,
  inventory,
  projects,
  thresholdPercent,
  userName,
  enabled,
}: UsePropertyMatchingOptions) {
  // Track processed leads to avoid write loops: leadId → hash
  const processedRef = useRef<Map<string, string>>(new Map());
  // Debounce timer
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  // Track if we're currently writing
  const writingRef = useRef(false);

  // Clear processedRef when threshold changes so all leads get re-evaluated
  const prevThresholdRef = useRef(thresholdPercent);
  useEffect(() => {
    if (prevThresholdRef.current !== thresholdPercent) {
      processedRef.current.clear();
      prevThresholdRef.current = thresholdPercent;
    }
  }, [thresholdPercent]);

  const runMatching = useCallback(async () => {
    if (!enabled || writingRef.current) return;
    if (inventory.length === 0 || projects.length === 0) return;

    writingRef.current = true;

    try {
      for (const lead of leads) {
        // Only match leads in 'New', 'First Call', 'Nurturing', or 'Property Matched' status
        if (lead.status !== 'New' && lead.status !== 'First Call' && lead.status !== 'Nurturing' && lead.status !== 'Property Matched') continue;

        const interests = resolveInterests(lead.raw_data);
        const budget = lead.raw_data.budget;
        if (interests.length === 0 || !budget || budget <= 0) continue;

        // Use per-lead threshold if set, otherwise global
        const effectiveThreshold = lead.match_threshold ?? thresholdPercent;

        // Build hash including all matching parameters
        const leadBHK = resolveBHK(lead.raw_data);
        const hash = `${budget}-${[...interests].sort().join(',')}-${effectiveThreshold}-${leadBHK || 0}-${(lead.dismissed_matches || []).join(',')}`;
        if (processedRef.current.get(lead.id) === hash) continue;

        const matches = computeMatches(lead, inventory, projects, effectiveThreshold);

        // Build system-match InterestedProperty entries
        const systemMatches: InterestedProperty[] = matches.map(m => ({
          projectId: m.projectId,
          projectName: m.projectName,
          location: m.location,
          propertyType: m.propertyType,
          heroImage: m.heroImage,
          tagged_at: new Date().toISOString(),
          tagged_by: 'system-match',
          matchedUnitCount: m.matchedUnitCount,
          bestPrice: m.bestPrice,
          ...(m.distanceKm != null ? { distanceKm: Math.round(m.distanceKm * 10) / 10 } : {}),
        }));

        // Merge: keep manual/ad tags, replace system-match tags
        const existingManual = (lead.interested_properties || []).filter(
          p => p.tagged_by !== 'system-match'
        );
        const merged = [...existingManual, ...systemMatches];

        // Check if anything actually changed — compare full fingerprint, not just IDs
        const existingFingerprint = matchFingerprint(
          (lead.interested_properties || [])
            .filter(p => p.tagged_by === 'system-match')
            .map(p => ({
              projectId: p.projectId,
              projectName: p.projectName,
              location: p.location,
              propertyType: p.propertyType,
              heroImage: p.heroImage || null,
              matchedUnitCount: p.matchedUnitCount || 0,
              bestPrice: p.bestPrice || 0,
            }))
        );
        const newFingerprint = matchFingerprint(matches);

        if (existingFingerprint === newFingerprint) {
          // No change — mark as processed without writing
          processedRef.current.set(lead.id, hash);
          continue;
        }

        // Write to Firestore
        const updates: Record<string, any> = {
          interested_properties: merged,
        };

        // Auto-move to Property Matched lane if matches found and lead is in New / First Call / Nurturing
        if (systemMatches.length > 0 && (lead.status === 'New' || lead.status === 'First Call' || lead.status === 'Nurturing')) {
          updates.status = 'Property Matched';
        }

        // If no matches and lead was in Property Matched, move to Nurturing
        if (systemMatches.length === 0 && lead.status === 'Property Matched') {
          // Only move if there are no manual tags either
          if (existingManual.length === 0) {
            updates.status = 'Nurturing';
          }
        }

        await updateDoc(doc(db, 'leads', lead.id), updates);
        processedRef.current.set(lead.id, hash);
      }
    } catch (err) {
      console.error('Property matching error:', err);
    } finally {
      writingRef.current = false;
    }
  }, [leads, inventory, projects, thresholdPercent, userName, enabled]);

  useEffect(() => {
    if (!enabled) return;

    // Debounce: wait 2 seconds after data changes before running
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      runMatching();
    }, 2000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runMatching, enabled]);
}
