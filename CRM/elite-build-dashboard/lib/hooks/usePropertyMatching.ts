"use client";
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Lead, InterestedProperty } from '@/lib/types/lead';
import { InventoryUnit } from '@/lib/types/inventory';
import { Project } from '@/lib/types/project';
import {
  resolveInterests,
  resolveBHK,
  computeMatches,
} from '@/lib/utils/propertyMatcher';
import type { MatchResult } from '@/lib/utils/propertyMatcher';

export {
  resolveInterests,
  resolveBHK,
  computeMatches,
  diagnoseMatches,
  BHK_PROPERTY_TYPES,
} from '@/lib/utils/propertyMatcher';
export type {
  MatchResult,
  UnitMatchDiagnosis,
  MatchDiagnosis,
} from '@/lib/utils/propertyMatcher';

/** Serialize match results into a stable fingerprint for change detection */
function matchFingerprint(matches: MatchResult[]): string {
  return matches.map(m => `${m.projectId}:${m.matchedUnitCount}:${m.bestPrice}:${m.distanceKm ?? ''}:${m.score}:${m.reasons.join('~')}`).sort().join('|');
}

function matchDataFingerprint(inventory: InventoryUnit[], projects: Project[]): string {
  const inventoryKey = inventory
    .map(unit => [
      unit.id,
      unit.projectId,
      unit.propertyType,
      unit.status,
      unit.price,
      unit.fields?.bhk ?? '',
    ].join(':'))
    .sort()
    .join('|');

  const projectKey = projects
    .map(project => [
      project.id,
      project.name,
      project.location,
      project.propertyType,
      project.heroImage ?? '',
      project.geo?.lat ?? '',
      project.geo?.lng ?? '',
    ].join(':'))
    .sort()
    .join('|');

  return `${inventoryKey}||${projectKey}`;
}

interface UsePropertyMatchingOptions {
  leads: Lead[];
  inventory: InventoryUnit[];
  projects: Project[];
  thresholdPercent: number;
  enabled: boolean;
}

export function usePropertyMatching({
  leads,
  inventory,
  projects,
  thresholdPercent,
  enabled,
}: UsePropertyMatchingOptions) {
  // Track processed leads to avoid write loops: leadId → hash
  const processedRef = useRef<Map<string, string>>(new Map());
  // Debounce timer
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  // Track if we're currently writing
  const writingRef = useRef(false);
  const dataFingerprint = useMemo(
    () => matchDataFingerprint(inventory, projects),
    [inventory, projects],
  );

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
        const hash = `${budget}-${[...interests].sort().join(',')}-${effectiveThreshold}-${leadBHK || 0}-${(lead.dismissed_matches || []).join(',')}-${dataFingerprint}`;
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
          matchScore: m.score,
          matchReasons: m.reasons,
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
              score: p.matchScore || 0,
              reasons: p.matchReasons || [],
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
  }, [leads, inventory, projects, thresholdPercent, dataFingerprint, enabled]);

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
