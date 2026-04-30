import type { Lead, LeadObjection } from '@/lib/types/lead';
import { computeLeadIntelligence, LEAD_OBJECTION_LABELS } from '@/lib/utils/leadIntelligence';

export type SmartVisitWindow = 'today' | 'tomorrow' | 'this_week' | 'overdue';

export interface SmartLeadSearch {
  original: string;
  textTerms: string[];
  statuses: string[];
  propertyTypes: string[];
  projectTerms: string[];
  locationTerms: string[];
  objections: LeadObjection[];
  urgency?: 'High' | 'Medium' | 'Low';
  temperature?: 'Hot' | 'Warm' | 'Nurture' | 'Risk';
  minBudget?: number;
  maxBudget?: number;
  assignee?: 'assigned' | 'unassigned' | 'mine';
  matched?: boolean;
  siteVisitWindow?: SmartVisitWindow;
  staleDays?: number;
  stuck?: { status: string; days: number };
  noContact?: boolean;
  labels: string[];
}

export interface SmartLeadSearchInsight {
  label: string;
  value: string;
}

export interface SmartLeadSearchInsights {
  total: number;
  stats: SmartLeadSearchInsight[];
  topProjects: string[];
  suggestedAction: string;
}

const STATUS_ALIASES: Array<[RegExp, string]> = [
  [/\b(first call|first-call)\b/, 'First Call'],
  [/\b(new|fresh)\b/, 'New'],
  [/\bnurtur(?:e|ing)\b/, 'Nurturing'],
  [/\b(property matched|matched)\b/, 'Property Matched'],
  [/\bsite visits?\b/, 'Site Visit'],
  [/\bbook(?:ed|ing)\b/, 'Booked'],
  [/\bclosed|sold\b/, 'Closed'],
  [/\brejected|lost\b/, 'Rejected'],
];

const PROPERTY_ALIASES: Array<[RegExp, string]> = [
  [/\bplots?\b|\bplotted lands?\b/, 'Plotted Land'],
  [/\bvillas?\b/, 'Villa'],
  [/\bapartments?\b|\bflats?\b/, 'Apartment'],
  [/\bindividual houses?\b|\bhouses?\b/, 'Individual House'],
  [/\bcommercial buildings?\b/, 'Commercial Building'],
  [/\bcommercial lands?\b/, 'Commercial Land'],
  [/\bmanaged farmlands?\b/, 'Managed Farmland'],
  [/\bagricultural lands?\b/, 'Agricultural Land'],
  [/\bindustrial buildings?\b/, 'Industrial Building'],
  [/\bindustrial lands?\b/, 'Industrial Land'],
];

const OBJECTION_ALIASES: Array<[RegExp, LeadObjection]> = [
  [/\bprice\b|\bcost\b|\bbudget concern\b/, 'price'],
  [/\blocation\b|\bdistance\b|\bfar\b/, 'location'],
  [/\blegal\b|\brera\b|\bapproval\b|\btitle\b/, 'legal'],
  [/\bfamily\b|\bspouse\b|\bdecision maker\b/, 'family_decision'],
  [/\bloan\b|\bpayment\b|\bemi\b|\bbank\b/, 'loan_payment'],
  [/\bcompar(?:e|ing|ison)\b|\bother projects?\b/, 'comparison'],
  [/\btiming\b|\bnot clear\b|\blater\b/, 'timing'],
];

const STOP_WORDS = new Set([
  'show', 'find', 'get', 'list', 'me', 'all', 'leads', 'lead', 'buyers', 'buyer',
  'with', 'and', 'or', 'the', 'a', 'an', 'in', 'on', 'for', 'of', 'to', 'from',
  'but', 'not', 'above', 'below', 'under', 'over', 'more', 'less', 'than', 'stuck', 'scheduled',
  'this', 'week', 'today', 'tomorrow', 'interested', 'interest', 'day', 'days',
  'visit', 'visits', 'objection', 'objections', 'concern', 'concerns', 'blocker',
  'blockers', 'issue', 'contact', 'contacted', 'uncalled', 'never',
]);

function addUnique<T>(items: T[], item: T) {
  if (!items.includes(item)) items.push(item);
}

function parseMoney(raw: string): number {
  const normalized = raw.toLowerCase().replace(/[, ]/g, '');
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return 0;
  if (normalized.includes('cr') || normalized.includes('crore')) return Math.round(value * 10_000_000);
  if (normalized.includes('l') || normalized.includes('lac') || normalized.includes('lakh')) return Math.round(value * 100_000);
  return Math.round(value);
}

function timestampToMs(value: Lead['created_at'] | Lead['lane_moved_at']) {
  if (!value) return null;
  const maybeTimestamp = value as { toDate?: () => Date };
  if (typeof maybeTimestamp.toDate === 'function') return maybeTimestamp.toDate().getTime();
  return null;
}

function daysSince(ms: number | null, now: Date) {
  if (!ms) return null;
  return Math.max(0, (now.getTime() - ms) / 86_400_000);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function cleanEntityTerm(value: string) {
  return value
    .replace(/\b(?:but|with|without|not|and|or|above|below|under|over|stuck|scheduled|today|tomorrow|this week)\b.*$/i, '')
    .trim();
}

function isVisitInWindow(lead: Lead, window: SmartVisitWindow, now: Date) {
  const visits = lead.site_visits || [];
  const today = startOfDay(now);
  const tomorrow = today + 86_400_000;
  const dayAfterTomorrow = tomorrow + 86_400_000;
  const weekEnd = today + 7 * 86_400_000;
  return visits.some(visit => {
    const visitMs = new Date(visit.scheduled_at).getTime();
    if (Number.isNaN(visitMs)) return false;
    if (window === 'overdue') return visit.status === 'scheduled' && visitMs < now.getTime();
    if (window === 'today') return visitMs >= today && visitMs < tomorrow;
    if (window === 'tomorrow') return visitMs >= tomorrow && visitMs < dayAfterTomorrow;
    return visitMs >= today && visitMs < weekEnd;
  });
}

function latestContactMs(lead: Lead) {
  const contactTypes = new Set(['call', 'whatsapp_sent', 'whatsapp_received', 'property_details_sent', 'callback_scheduled', 'site_visit_scheduled']);
  const values = (lead.activity_log || [])
    .filter(entry => contactTypes.has(entry.type))
    .map(entry => new Date(entry.created_at).getTime())
    .filter(Number.isFinite);
  if (values.length === 0) return null;
  return Math.max(...values);
}

export function parseSmartLeadSearch(input: string): SmartLeadSearch {
  const original = input.trim();
  const query = original.toLowerCase();
  const search: SmartLeadSearch = {
    original,
    textTerms: [],
    statuses: [],
    propertyTypes: [],
    projectTerms: [],
    locationTerms: [],
    objections: [],
    labels: [],
  };

  for (const [pattern, status] of STATUS_ALIASES) {
    if (pattern.test(query)) {
      addUnique(search.statuses, status);
      addUnique(search.labels, `Stage: ${status}`);
    }
  }

  for (const [pattern, propertyType] of PROPERTY_ALIASES) {
    if (pattern.test(query)) {
      addUnique(search.propertyTypes, propertyType);
      addUnique(search.labels, `Type: ${propertyType}`);
    }
  }

  for (const [pattern, objection] of OBJECTION_ALIASES) {
    if (pattern.test(query) && /\bobjections?\b|\bconcerns?\b|\bblockers?\b|\bissue\b/.test(query)) {
      addUnique(search.objections, objection);
      addUnique(search.labels, `Objection: ${LEAD_OBJECTION_LABELS[objection]}`);
    }
  }

  if (/\bhot\b/.test(query)) { search.temperature = 'Hot'; addUnique(search.labels, 'AI: Hot'); }
  else if (/\bwarm\b/.test(query)) { search.temperature = 'Warm'; addUnique(search.labels, 'AI: Warm'); }
  else if (/\bnurture\b/.test(query)) { search.temperature = 'Nurture'; addUnique(search.labels, 'AI: Nurture'); }
  else if (/\brisk|cold\b/.test(query)) { search.temperature = 'Risk'; addUnique(search.labels, 'AI: Risk'); }

  if (/\bhigh urgency\b|\burgent\b/.test(query)) { search.urgency = 'High'; addUnique(search.labels, 'Urgency: High'); }
  else if (/\bmedium urgency\b/.test(query)) { search.urgency = 'Medium'; addUnique(search.labels, 'Urgency: Medium'); }
  else if (/\blow urgency\b/.test(query)) { search.urgency = 'Low'; addUnique(search.labels, 'Urgency: Low'); }

  const minMatch = query.match(/\b(?:above|over|more than|greater than)\s+(rs\.?\s*)?(\d+(?:\.\d+)?\s*(?:cr|crore|l|lac|lakh)?)\b/);
  if (minMatch) {
    search.minBudget = parseMoney(minMatch[2]);
    addUnique(search.labels, `Budget above ${minMatch[2].toUpperCase()}`);
  }
  const maxMatch = query.match(/\b(?:below|under|less than)\s+(rs\.?\s*)?(\d+(?:\.\d+)?\s*(?:cr|crore|l|lac|lakh)?)\b/);
  if (maxMatch) {
    search.maxBudget = parseMoney(maxMatch[2]);
    addUnique(search.labels, `Budget below ${maxMatch[2].toUpperCase()}`);
  }

  const betweenMatch = query.match(/\bbetween\s+(\d+(?:\.\d+)?\s*(?:cr|crore|l|lac|lakh)?)\s+(?:and|to|-)\s+(\d+(?:\.\d+)?\s*(?:cr|crore|l|lac|lakh)?)\b/);
  if (betweenMatch) {
    search.minBudget = parseMoney(betweenMatch[1]);
    search.maxBudget = parseMoney(betweenMatch[2]);
    addUnique(search.labels, `Budget ${betweenMatch[1].toUpperCase()}-${betweenMatch[2].toUpperCase()}`);
  }

  if (/\bunassigned\b/.test(query)) { search.assignee = 'unassigned'; addUnique(search.labels, 'Unassigned'); }
  else if (/\bmy leads?\b|\bassigned to me\b/.test(query)) { search.assignee = 'mine'; addUnique(search.labels, 'My leads'); }
  else if (/\bassigned\b/.test(query)) { search.assignee = 'assigned'; addUnique(search.labels, 'Assigned'); }

  if (/\bunmatched|no match|not matched\b/.test(query)) { search.matched = false; addUnique(search.labels, 'Unmatched'); }
  else if (/\bmatched\b/.test(query)) { search.matched = true; addUnique(search.labels, 'Matched'); }

  if (/\bnot contacted\b|\bno contact\b|\buncalled\b|\bnever called\b/.test(query)) {
    search.noContact = true;
    addUnique(search.labels, 'No contact');
  }

  if (/\bsite visits?\b/.test(query)) {
    if (/\boverdue\b/.test(query)) { search.siteVisitWindow = 'overdue'; addUnique(search.labels, 'Visit: Overdue'); }
    else if (/\btomorrow\b/.test(query)) { search.siteVisitWindow = 'tomorrow'; addUnique(search.labels, 'Visit: Tomorrow'); }
    else if (/\btoday\b/.test(query)) { search.siteVisitWindow = 'today'; addUnique(search.labels, 'Visit: Today'); }
    else if (/\bthis week\b|\bweek\b/.test(query)) { search.siteVisitWindow = 'this_week'; addUnique(search.labels, 'Visit: This week'); }
  }

  const staleMatch = query.match(/\b(?:stale|inactive|quiet|no follow[- ]?up)\s+(?:for\s+)?(\d+)\s+days?\b/);
  if (staleMatch) {
    search.staleDays = Number(staleMatch[1]);
    addUnique(search.labels, `Inactive ${staleMatch[1]}d`);
  } else if (/\bstale|inactive|quiet\b/.test(query)) {
    search.staleDays = 7;
    addUnique(search.labels, 'Inactive 7d');
  }

  const stuckMatch = query.match(/\bstuck\s+in\s+([a-z ]+?)\s+(?:for\s+)?(\d+)\s+days?\b/);
  if (stuckMatch) {
    const status = STATUS_ALIASES.find(([pattern]) => pattern.test(stuckMatch[1]))?.[1] || stuckMatch[1].trim().replace(/\b\w/g, char => char.toUpperCase());
    search.stuck = { status, days: Number(stuckMatch[2]) };
    addUnique(search.statuses, status);
    addUnique(search.labels, `Stuck: ${status} ${stuckMatch[2]}d`);
  }

  const projectMatch = query.match(/\b(?:project|interested in)\s+([a-z0-9][a-z0-9 '&.-]{2,})\b/);
  const projectTerm = projectMatch ? cleanEntityTerm(projectMatch[1]) : '';
  if (projectTerm && !/\b(site visit|nurturing|first call|this week|today|tomorrow)\b/.test(projectTerm)) {
    search.projectTerms.push(projectTerm);
    addUnique(search.labels, `Project: ${projectTerm}`);
  }

  const locationMatch = query.match(/\b(?:near|around|location|locality)\s+([a-z0-9][a-z0-9 '&.-]{2,})\b/);
  const locationTerm = locationMatch ? cleanEntityTerm(locationMatch[1]) : '';
  if (locationTerm) {
    search.locationTerms.push(locationTerm);
    addUnique(search.labels, `Location: ${locationTerm}`);
  }

  const leftover = query
    .replace(/\b(?:above|over|more than|greater than|below|under|less than)\s+(rs\.?\s*)?\d+(?:\.\d+)?\s*(?:cr|crore|l|lac|lakh)?\b/g, ' ')
    .replace(/\bbetween\s+\d+(?:\.\d+)?\s*(?:cr|crore|l|lac|lakh)?\s+(?:and|to|-)\s+\d+(?:\.\d+)?\s*(?:cr|crore|l|lac|lakh)?\b/g, ' ')
    .split(/[^a-z0-9]+/)
    .map(term => term.trim())
    .filter(term => term.length >= 3 && !STOP_WORDS.has(term));

  search.textTerms = Array.from(new Set(leftover)).filter(term => {
    const inLabel = search.labels.some(label => label.toLowerCase().includes(term));
    return !inLabel;
  });

  return search;
}

export function hasStructuredSmartSearch(search: SmartLeadSearch) {
  return Boolean(
    search.statuses.length ||
    search.propertyTypes.length ||
    search.projectTerms.length ||
    search.locationTerms.length ||
    search.objections.length ||
    search.urgency ||
    search.temperature ||
    search.minBudget ||
    search.maxBudget ||
    search.assignee ||
    search.matched !== undefined ||
    search.siteVisitWindow ||
    search.staleDays ||
    search.stuck ||
    search.noContact,
  );
}

function leadHaystack(lead: Lead) {
  const raw = lead.raw_data || {};
  return [
    raw.lead_name,
    raw.phone,
    raw.whatsapp,
    raw.whatsapp_number,
    raw.email,
    raw.location,
    raw.note,
    raw.interest,
    ...(raw.interests || []),
    lead.source,
    lead.status,
    lead.ai_audit?.intent,
    lead.ai_audit?.urgency,
    lead.utm?.source,
    lead.utm?.campaign,
    ...(lead.interested_properties || []).map(property => `${property.projectName} ${property.location} ${property.propertyType}`),
    ...(lead.activity_log || []).map(entry => entry.text),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function matchesSmartLeadSearch(
  lead: Lead,
  search: SmartLeadSearch,
  options: { now?: Date; currentUserUid?: string } = {},
) {
  if (!search.original) return true;
  const now = options.now || new Date();
  const raw = lead.raw_data || {};
  const haystack = leadHaystack(lead);

  if (search.statuses.length > 0 && !search.statuses.includes(lead.status)) return false;
  if (search.urgency && lead.ai_audit?.urgency !== search.urgency) return false;
  if (search.temperature && computeLeadIntelligence(lead, now).temperature !== search.temperature) return false;
  if (search.minBudget && Number(raw.budget || 0) < search.minBudget) return false;
  if (search.maxBudget && Number(raw.budget || 0) > search.maxBudget) return false;
  if (search.assignee === 'unassigned' && lead.assigned_to) return false;
  if (search.assignee === 'assigned' && !lead.assigned_to) return false;
  if (search.assignee === 'mine' && lead.assigned_to !== options.currentUserUid) return false;
  if (search.matched === true && !lead.suggested_plot && !(lead.interested_properties?.length)) return false;
  if (search.matched === false && (lead.suggested_plot || lead.interested_properties?.length)) return false;
  if (search.siteVisitWindow && !isVisitInWindow(lead, search.siteVisitWindow, now)) return false;
  if (search.noContact && (lead.activity_log || []).some(entry => ['call', 'whatsapp_sent', 'whatsapp_received', 'property_details_sent', 'callback_scheduled', 'site_visit_scheduled'].includes(entry.type))) return false;
  if (search.staleDays) {
    const latestActivityMs = Math.max(
      timestampToMs(lead.created_at) || 0,
      ...(lead.activity_log || []).map(entry => new Date(entry.created_at).getTime()).filter(Number.isFinite),
    );
    const inactiveDays = daysSince(latestActivityMs || timestampToMs(lead.created_at), now);
    if (inactiveDays == null || inactiveDays < search.staleDays) return false;
  }
  if (search.stuck) {
    if (lead.status !== search.stuck.status) return false;
    const movedDays = daysSince(timestampToMs(lead.lane_moved_at) || timestampToMs(lead.created_at), now);
    if (movedDays == null || movedDays < search.stuck.days) return false;
  }
  if (search.propertyTypes.length > 0) {
    const interests = [raw.interest, ...(raw.interests || []), ...(lead.interested_properties || []).map(item => item.propertyType)]
      .filter(Boolean)
      .map(item => String(item).toLowerCase());
    if (!search.propertyTypes.some(type => interests.includes(type.toLowerCase()))) return false;
  }
  if (search.projectTerms.length > 0) {
    const projectText = (lead.interested_properties || [])
      .map(property => `${property.projectName} ${property.location}`)
      .join(' ')
      .toLowerCase();
    if (!search.projectTerms.every(term => projectText.includes(term.toLowerCase()))) return false;
  }
  if (search.locationTerms.length > 0) {
    const locationText = [raw.location, ...(lead.interested_properties || []).map(property => property.location)].join(' ').toLowerCase();
    if (!search.locationTerms.every(term => locationText.includes(term.toLowerCase()))) return false;
  }
  if (search.objections.length > 0 && !search.objections.every(objection => (lead.objections || []).includes(objection))) return false;
  if (search.textTerms.length > 0 && !search.textTerms.every(term => haystack.includes(term))) return false;

  return true;
}

export function buildSmartLeadSearchInsights(
  leads: Lead[],
  _search: SmartLeadSearch,
  options: { now?: Date } = {},
): SmartLeadSearchInsights {
  const now = options.now || new Date();
  const total = leads.length;
  const unassigned = leads.filter(lead => !lead.assigned_to).length;
  const noRecentFollowUp = leads.filter(lead => {
    const latest = latestContactMs(lead);
    const fallback = timestampToMs(lead.created_at);
    const inactiveDays = daysSince(latest || fallback, now);
    return inactiveDays != null && inactiveDays >= 7 && !['Closed', 'Rejected'].includes(lead.status);
  }).length;
  const noContact = leads.filter(lead => latestContactMs(lead) === null).length;
  const objectionCounts = new Map<LeadObjection, number>();
  const projectCounts = new Map<string, number>();
  let hot = 0;
  let highUrgency = 0;

  for (const lead of leads) {
    const intelligence = computeLeadIntelligence(lead, now);
    if (intelligence.temperature === 'Hot') hot += 1;
    if (lead.ai_audit?.urgency === 'High') highUrgency += 1;
    for (const objection of lead.objections || []) {
      objectionCounts.set(objection, (objectionCounts.get(objection) || 0) + 1);
    }
    for (const property of lead.interested_properties || []) {
      projectCounts.set(property.projectName, (projectCounts.get(property.projectName) || 0) + 1);
    }
  }

  const topObjection = Array.from(objectionCounts.entries()).sort((a, b) => b[1] - a[1])[0] || null;
  const topProjects = Array.from(projectCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([name, count]) => `${name} (${count})`);

  const stats: SmartLeadSearchInsight[] = [
    { label: 'Found', value: String(total) },
  ];
  if (hot > 0) stats.push({ label: 'Hot', value: String(hot) });
  if (highUrgency > 0) stats.push({ label: 'High urgency', value: String(highUrgency) });
  if (unassigned > 0) stats.push({ label: 'Unassigned', value: String(unassigned) });
  if (topObjection) stats.push({ label: LEAD_OBJECTION_LABELS[topObjection[0]], value: String(topObjection[1]) });
  if (noContact > 0) stats.push({ label: 'Not contacted', value: String(noContact) });
  if (noRecentFollowUp > 0) stats.push({ label: 'No follow-up 7d', value: String(noRecentFollowUp) });

  let suggestedAction = 'Open the strongest matching lead and confirm the next action.';
  if (total === 0) {
    suggestedAction = 'No matching leads found. Loosen one search condition or clear filters.';
  } else if (unassigned > 0 && (hot > 0 || highUrgency > 0)) {
    suggestedAction = `Assign the ${unassigned} unassigned high-priority lead${unassigned === 1 ? '' : 's'} first.`;
  } else if (noContact > 0) {
    suggestedAction = `Call the ${noContact} not-contacted lead${noContact === 1 ? '' : 's'} first.`;
  } else if (topObjection) {
    suggestedAction = `Handle ${LEAD_OBJECTION_LABELS[topObjection[0]].toLowerCase()} across ${topObjection[1]} lead${topObjection[1] === 1 ? '' : 's'}.`;
  } else if (noRecentFollowUp > 0) {
    suggestedAction = `Revive the ${noRecentFollowUp} lead${noRecentFollowUp === 1 ? '' : 's'} with no follow-up in 7+ days.`;
  } else if (topProjects.length > 0) {
    suggestedAction = `Prioritize buyers around ${topProjects[0].replace(/\s\(\d+\)$/, '')}.`;
  }

  return {
    total,
    stats,
    topProjects,
    suggestedAction,
  };
}
