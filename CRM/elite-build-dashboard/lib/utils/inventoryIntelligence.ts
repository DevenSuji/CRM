import type { InventoryUnit } from '@/lib/types/inventory';
import type { Lead } from '@/lib/types/lead';

export interface InventoryProjectHealth {
  projectId: string;
  projectName: string;
  propertyType: string;
  totalUnits: number;
  availableUnits: number;
  bookedUnits: number;
  soldUnits: number;
  availableValue: number;
  bestBuyerCount: number;
  staleAvailableUnits: number;
  healthScore: number;
  recommendation: string;
}

export interface DemandSupplyBand {
  key: string;
  label: string;
  demand: number;
  supply: number;
}

export interface InventoryIntelligence {
  totalUnits: number;
  availableUnits: number;
  bookedUnits: number;
  soldUnits: number;
  availableValue: number;
  staleAvailableUnits: number;
  projectsNeedingPush: InventoryProjectHealth[];
  healthiestProjects: InventoryProjectHealth[];
  demandSupplyByType: DemandSupplyBand[];
  demandSupplyByBudget: DemandSupplyBand[];
  demandSupplyByLocation: DemandSupplyBand[];
}

const OPEN_LEAD_STATUSES = new Set(['New', 'First Call', 'Nurturing', 'Property Matched', 'Site Visit', 'Booked']);
const STALE_AVAILABLE_DAYS = 60;

function timestampToMs(value: InventoryUnit['created_at']): number | null {
  return value?.toDate?.().getTime?.() ?? null;
}

function leadInterests(lead: Lead): string[] {
  const raw = lead.raw_data || {};
  const values = raw.interests?.length ? raw.interests : raw.interest ? [raw.interest] : [];
  return values.map(item => item.trim()).filter(Boolean);
}

function budgetBand(value: number): DemandSupplyBand['key'] {
  if (value <= 0) return 'unknown';
  if (value < 50_00_000) return 'under_50l';
  if (value < 1_00_00_000) return '50l_1cr';
  if (value < 2_00_00_000) return '1cr_2cr';
  return 'above_2cr';
}

function budgetLabel(key: string): string {
  switch (key) {
    case 'under_50l': return 'Under 50L';
    case '50l_1cr': return '50L-1Cr';
    case '1cr_2cr': return '1Cr-2Cr';
    case 'above_2cr': return 'Above 2Cr';
    default: return 'Unknown';
  }
}

function normalizeLocation(value: string | undefined): string {
  const normalized = value?.trim().replace(/\s+/g, ' ') || '';
  return normalized || 'Unknown';
}

function buildRecommendation(health: Omit<InventoryProjectHealth, 'recommendation'>): string {
  if (health.availableUnits === 0) return 'No available units. Keep project status and sold-out messaging updated.';
  if (health.bestBuyerCount === 0) return 'Needs marketing push: available inventory has no visible buyer demand.';
  if (health.staleAvailableUnits > 0) return 'Stale available inventory. Prioritize refreshed creative, pricing review, or buyer call list.';
  if (health.availableUnits > health.bestBuyerCount * 2) return 'Supply is ahead of buyer interest. Increase campaign pressure or revisit positioning.';
  return 'Healthy inventory movement. Keep sales follow-up tight.';
}

function scoreProject(availableUnits: number, bestBuyerCount: number, staleAvailableUnits: number): number {
  if (availableUnits === 0) return 100;
  const buyerCoverage = Math.min(1, bestBuyerCount / availableUnits);
  const stalePenalty = Math.min(35, staleAvailableUnits * 10);
  return Math.max(0, Math.round(35 + buyerCoverage * 60 - stalePenalty));
}

export function computeInventoryIntelligence(
  inventory: InventoryUnit[],
  leads: Lead[],
  now = new Date(),
): InventoryIntelligence {
  const openLeads = leads.filter(lead => OPEN_LEAD_STATUSES.has(lead.status));
  const projectBuyerMap = new Map<string, Set<string>>();
  const demandByType = new Map<string, number>();
  const demandByBudget = new Map<string, number>();
  const demandByLocation = new Map<string, number>();
  const supplyByType = new Map<string, number>();
  const supplyByBudget = new Map<string, number>();
  const supplyByLocation = new Map<string, number>();

  for (const lead of openLeads) {
    for (const interest of leadInterests(lead)) {
      demandByType.set(interest, (demandByType.get(interest) || 0) + 1);
    }
    const band = budgetBand(Number(lead.raw_data?.budget || 0));
    demandByBudget.set(band, (demandByBudget.get(band) || 0) + 1);
    const location = normalizeLocation(lead.raw_data?.location);
    demandByLocation.set(location, (demandByLocation.get(location) || 0) + 1);

    for (const property of lead.interested_properties || []) {
      if (!projectBuyerMap.has(property.projectId)) projectBuyerMap.set(property.projectId, new Set());
      projectBuyerMap.get(property.projectId)?.add(lead.id);
    }
  }

  const projectMap = new Map<string, InventoryUnit[]>();
  let availableUnits = 0;
  let bookedUnits = 0;
  let soldUnits = 0;
  let availableValue = 0;
  let staleAvailableUnits = 0;

  for (const unit of inventory) {
    if (!projectMap.has(unit.projectId)) projectMap.set(unit.projectId, []);
    projectMap.get(unit.projectId)?.push(unit);

    if (unit.status === 'Available') {
      availableUnits++;
      availableValue += unit.price || 0;
      supplyByType.set(unit.propertyType, (supplyByType.get(unit.propertyType) || 0) + 1);
      supplyByBudget.set(budgetBand(unit.price || 0), (supplyByBudget.get(budgetBand(unit.price || 0)) || 0) + 1);
      const location = normalizeLocation(unit.location);
      supplyByLocation.set(location, (supplyByLocation.get(location) || 0) + 1);
      const createdMs = timestampToMs(unit.created_at);
      if (createdMs && now.getTime() - createdMs > STALE_AVAILABLE_DAYS * 86_400_000) staleAvailableUnits++;
    } else if (unit.status === 'Booked') {
      bookedUnits++;
    } else if (unit.status === 'Sold') {
      soldUnits++;
    }
  }

  const projectHealth = Array.from(projectMap.entries()).map(([projectId, units]) => {
    const available = units.filter(unit => unit.status === 'Available');
    const booked = units.filter(unit => unit.status === 'Booked');
    const sold = units.filter(unit => unit.status === 'Sold');
    const projectStale = available.filter(unit => {
      const createdMs = timestampToMs(unit.created_at);
      return createdMs ? now.getTime() - createdMs > STALE_AVAILABLE_DAYS * 86_400_000 : false;
    }).length;
    const bestBuyerCount = projectBuyerMap.get(projectId)?.size || 0;
    const healthWithoutRecommendation = {
      projectId,
      projectName: units[0]?.projectName || 'Unknown Project',
      propertyType: units[0]?.propertyType || 'Unknown',
      totalUnits: units.length,
      availableUnits: available.length,
      bookedUnits: booked.length,
      soldUnits: sold.length,
      availableValue: available.reduce((sum, unit) => sum + (unit.price || 0), 0),
      bestBuyerCount,
      staleAvailableUnits: projectStale,
      healthScore: scoreProject(available.length, bestBuyerCount, projectStale),
    };
    return {
      ...healthWithoutRecommendation,
      recommendation: buildRecommendation(healthWithoutRecommendation),
    };
  });

  const toDemandSupply = (demand: Map<string, number>, supply: Map<string, number>, labelFor = (key: string) => key) =>
    Array.from(new Set([...demand.keys(), ...supply.keys()]))
      .map(key => ({ key, label: labelFor(key), demand: demand.get(key) || 0, supply: supply.get(key) || 0 }))
      .sort((a, b) => (b.demand - b.supply) - (a.demand - a.supply));

  return {
    totalUnits: inventory.length,
    availableUnits,
    bookedUnits,
    soldUnits,
    availableValue,
    staleAvailableUnits,
    projectsNeedingPush: projectHealth
      .filter(project => project.availableUnits > 0)
      .sort((a, b) => a.healthScore - b.healthScore || b.availableValue - a.availableValue)
      .slice(0, 5),
    healthiestProjects: projectHealth
      .sort((a, b) => b.healthScore - a.healthScore || b.bestBuyerCount - a.bestBuyerCount)
      .slice(0, 5),
    demandSupplyByType: toDemandSupply(demandByType, supplyByType),
    demandSupplyByBudget: toDemandSupply(demandByBudget, supplyByBudget, budgetLabel),
    demandSupplyByLocation: toDemandSupply(demandByLocation, supplyByLocation),
  };
}
