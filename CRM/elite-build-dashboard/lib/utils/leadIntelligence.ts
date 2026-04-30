import type { ActivityLogEntry, Lead, LeadObjection } from '@/lib/types/lead';

export type LeadTemperature = 'Hot' | 'Warm' | 'Nurture' | 'Risk' | 'Closed' | 'Lost';

export interface LeadIntelligence {
  score: number;
  temperature: LeadTemperature;
  nextBestAction: string;
  reasons: string[];
  risks: string[];
}

export interface LeadPitch {
  opener: string;
  pitch: string;
  ask: string;
  objectionHandlers: string[];
}

export interface LeadActivitySummary {
  headline: string;
  buyerProfile: string;
  currentBlocker: string;
  lastTouch: string;
  siteVisitSummary: string;
  nextAction: string;
  timeline: string[];
}

const STAGE_POINTS: Record<string, number> = {
  New: 24,
  'First Call': 34,
  Nurturing: 42,
  'Property Matched': 58,
  'Site Visit': 72,
  Booked: 86,
  Closed: 100,
  Rejected: 0,
};

const CONTACT_ACTIVITY = new Set<ActivityLogEntry['type']>([
  'call',
  'whatsapp_sent',
  'whatsapp_received',
  'property_details_sent',
  'callback_scheduled',
  'site_visit_scheduled',
]);

export const LEAD_OBJECTION_LABELS: Record<LeadObjection, string> = {
  price: 'Price concern',
  location: 'Location concern',
  legal: 'Legal/RERA concern',
  family_decision: 'Family decision delay',
  loan_payment: 'Loan/payment concern',
  comparison: 'Comparing other projects',
  timing: 'Timing not clear',
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function daysBetween(now: Date, iso: string | null | undefined) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, (now.getTime() - time) / 86_400_000);
}

function timestampToIso(value: Lead['created_at']) {
  return value?.toDate?.().toISOString?.() || null;
}

function latestActivityIso(lead: Lead) {
  const values = (lead.activity_log || [])
    .map(entry => entry.created_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return values[0] || timestampToIso(lead.created_at);
}

function hasActivity(lead: Lead, type: ActivityLogEntry['type']) {
  return (lead.activity_log || []).some(entry => entry.type === type);
}

function bestMatchScore(lead: Lead) {
  return Math.max(0, ...(lead.interested_properties || []).map(property => property.matchScore || 0));
}

function bestMatchedProperty(lead: Lead) {
  return [...(lead.interested_properties || [])]
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))[0] || null;
}

function compactBudget(value: number) {
  if (!value || value <= 0) return 'the right budget';
  if (value >= 10_000_000) return `Rs. ${(value / 10_000_000).toFixed(value % 10_000_000 === 0 ? 0 : 1)} Cr`;
  if (value >= 100_000) return `Rs. ${(value / 100_000).toFixed(value % 100_000 === 0 ? 0 : 1)} L`;
  return `Rs. ${value.toLocaleString('en-IN')}`;
}

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return null;
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return null;
  return time.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function inferTimelineUrgency(planToBuy: string | undefined) {
  const value = (planToBuy || '').toLowerCase();
  if (value.includes('immediate') || value.includes('now')) return 12;
  if (value.includes('1-3')) return 9;
  if (value.includes('3-6')) return 5;
  if (value.includes('exploring')) return -5;
  return 0;
}

function temperatureFor(status: string, score: number): LeadTemperature {
  if (status === 'Closed') return 'Closed';
  if (status === 'Rejected') return 'Lost';
  if (score >= 78) return 'Hot';
  if (score >= 58) return 'Warm';
  if (score >= 36) return 'Nurture';
  return 'Risk';
}

function computeNextBestAction(lead: Lead, risks: string[]) {
  const pendingCallback = (lead.callback_requests || [])
    .filter(callback => callback.status === 'pending')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

  if (lead.status === 'Closed') return 'Archive win details and ask for referral.';
  if (lead.status === 'Rejected') return 'Keep rejection reason clean for demand analysis.';
  if (pendingCallback) return 'Call the buyer for the scheduled callback.';
  if (lead.status === 'Booked') return 'Collect closure details and move to Closed once payment/legal steps are complete.';
  if ((lead.objections || []).length > 0) {
    const firstObjection = lead.objections?.[0];
    return firstObjection ? `Handle ${LEAD_OBJECTION_LABELS[firstObjection].toLowerCase()} before pushing the next stage.` : 'Resolve the buyer objection before pushing the next stage.';
  }
  if (lead.status === 'Site Visit') {
    const hasScheduledVisit = (lead.site_visits || []).some(visit => visit.status === 'scheduled');
    return hasScheduledVisit ? 'Confirm the site visit and capture buyer objections after the visit.' : 'Schedule the site visit immediately.';
  }
  if (!hasActivity(lead, 'call')) return 'Call this lead now and capture the outcome.';
  if ((lead.interested_properties || []).length > 0 && !hasActivity(lead, 'property_details_sent')) {
    return 'Send the matched property details and ask for a site-visit slot.';
  }
  if (risks.some(risk => risk.toLowerCase().includes('stale'))) return 'Revive with a crisp follow-up and a fresh property angle.';
  if (lead.status === 'Property Matched') return 'Pitch the highest-scoring match and ask for visit availability.';
  return 'Clarify budget, location, and timeline, then set a concrete next follow-up.';
}

export function computeLeadIntelligence(lead: Lead, now = new Date()): LeadIntelligence {
  if (lead.status === 'Closed') {
    return {
      score: 100,
      temperature: 'Closed',
      nextBestAction: 'Archive win details and ask for referral.',
      reasons: ['Sale is marked closed.'],
      risks: [],
    };
  }

  if (lead.status === 'Rejected') {
    return {
      score: 0,
      temperature: 'Lost',
      nextBestAction: 'Keep rejection reason clean for demand analysis.',
      reasons: ['Lead is rejected.'],
      risks: ['Lost lead.'],
    };
  }

  const reasons: string[] = [];
  const risks: string[] = [];
  let score = STAGE_POINTS[lead.status] ?? 30;
  reasons.push(`Current stage signal: ${lead.status}.`);

  const urgency = lead.ai_audit?.urgency;
  if (urgency === 'High') { score += 13; reasons.push('AI audit marks urgency as high.'); }
  else if (urgency === 'Medium') { score += 8; reasons.push('AI audit marks urgency as medium.'); }
  else if (urgency === 'Low') { score += 2; risks.push('AI audit marks urgency as low.'); }

  const timelinePoints = inferTimelineUrgency(lead.raw_data?.plan_to_buy);
  if (timelinePoints > 0) {
    score += timelinePoints;
    reasons.push(`Buying timeline looks active: ${lead.raw_data.plan_to_buy}.`);
  } else if (timelinePoints < 0) {
    score += timelinePoints;
    risks.push('Buyer is still exploring.');
  }

  const budget = Number(lead.raw_data?.budget || 0);
  if (budget > 0) {
    score += 6;
    reasons.push('Budget is captured.');
  } else {
    score -= 8;
    risks.push('Budget is missing.');
  }

  const matchScore = bestMatchScore(lead);
  if (matchScore >= 80) {
    score += 16;
    reasons.push(`Strong property fit (${matchScore}/100).`);
  } else if (matchScore >= 60) {
    score += 11;
    reasons.push(`Good property fit (${matchScore}/100).`);
  } else if ((lead.interested_properties || []).length > 0) {
    score += 6;
    reasons.push('At least one property is tagged.');
  } else {
    score -= 7;
    risks.push('No property is tagged yet.');
  }

  if ((lead.site_visits || []).some(visit => visit.status === 'scheduled')) {
    score += 12;
    reasons.push('Site visit is scheduled.');
  }
  if ((lead.site_visits || []).some(visit => visit.status === 'completed')) {
    score += 14;
    reasons.push('Site visit has happened.');
  }
  if (lead.booked_unit) {
    score += 18;
    reasons.push('A unit is booked for this lead.');
  }

  const objections = lead.objections || [];
  if (objections.length > 0) {
    score -= Math.min(18, objections.length * 6);
    risks.push(`Active objection: ${objections.map(item => LEAD_OBJECTION_LABELS[item]).join(', ')}.`);
  }

  const activity = lead.activity_log || [];
  const contactCount = activity.filter(entry => CONTACT_ACTIVITY.has(entry.type)).length;
  if (contactCount >= 3) {
    score += 8;
    reasons.push('Healthy engagement history.');
  } else if (contactCount === 0) {
    score -= 7;
    risks.push('No contact activity recorded.');
  }

  const ageDays = daysBetween(now, timestampToIso(lead.created_at));
  const lastActivityDays = daysBetween(now, latestActivityIso(lead));
  if (lastActivityDays != null && lastActivityDays <= 1) {
    score += 8;
    reasons.push('Recent activity in the last 24 hours.');
  } else if (lastActivityDays != null && lastActivityDays >= 7) {
    score -= 12;
    risks.push('Lead is stale: no recent activity for 7+ days.');
  }

  if (ageDays != null && ageDays <= 2 && lead.status === 'New') {
    score += 5;
    reasons.push('Fresh lead.');
  }

  const pendingCallback = (lead.callback_requests || []).some(callback => callback.status === 'pending');
  if (pendingCallback) {
    score += 5;
    reasons.push('Pending callback exists.');
  }

  const finalScore = clamp(score);
  return {
    score: finalScore,
    temperature: temperatureFor(lead.status, finalScore),
    nextBestAction: computeNextBestAction(lead, risks),
    reasons: reasons.slice(0, 6),
    risks: risks.slice(0, 4),
  };
}

export function generateLeadPitch(lead: Lead, intelligence = computeLeadIntelligence(lead)): LeadPitch {
  const raw = lead.raw_data || {};
  const firstName = (raw.lead_name || 'there').trim().split(/\s+/)[0] || 'there';
  const interests = raw.interests?.length ? raw.interests.join(', ') : raw.interest || 'property';
  const property = bestMatchedProperty(lead);
  const projectName = property?.projectName || 'the best-fit property';
  const location = property?.location || raw.location || 'your preferred location';
  const budget = compactBudget(Number(raw.budget || 0));
  const timeline = raw.plan_to_buy && raw.plan_to_buy !== 'Not Specified' ? raw.plan_to_buy : 'your timeline';

  const opener = intelligence.temperature === 'Hot'
    ? `Hi ${firstName}, I noticed your requirement is looking active, so I wanted to quickly help you narrow this down.`
    : intelligence.temperature === 'Risk'
      ? `Hi ${firstName}, I wanted to reconnect and make this easier by filtering only the options that truly fit you.`
      : `Hi ${firstName}, I reviewed your requirement and shortlisted the cleanest next step for you.`;

  const pitch = property
    ? `${projectName} in ${location} fits your ${interests} requirement around ${budget}. The strongest reason to look at it now is: ${property.matchReasons?.[0] || `it has a strong fit score of ${property.matchScore || intelligence.score}/100`}.`
    : `Based on your ${interests} requirement around ${budget}, the first goal is to clarify the exact location and unit preference so I can avoid sending irrelevant options.`;

  const ask = lead.status === 'Site Visit'
    ? 'Can I confirm the site-visit slot and keep 10 minutes after the visit to capture your feedback?'
    : lead.status === 'Booked'
      ? 'Can we confirm the remaining payment/legal step needed to move this booking to closure?'
      : property
        ? `Would you be open to a quick site visit for ${projectName}, or should I send you the unit details first?`
        : `Is ${timeline} still accurate, and should I filter options strictly around ${budget}?`;

  const objectionHandlersByType: Record<LeadObjection, string> = {
    price: raw.budget ? `Price: keep the conversation anchored to ${budget}, then explain only options that fit or clearly justify any stretch.` : 'Price: confirm budget before pitching inventory.',
    location: property?.distanceKm != null ? `Location: acknowledge the ${property.distanceKm} km distance and position the strongest access/connectivity reason.` : 'Location: ask for the top two preferred localities before narrowing choices.',
    legal: 'Legal/RERA: share approval status, title clarity, and the exact document checklist before asking for commitment.',
    family_decision: 'Family decision: offer a short second discussion with the decision maker and keep the pitch simple.',
    loan_payment: 'Loan/payment: clarify booking amount, loan eligibility, bank support, and payment milestones.',
    comparison: 'Comparison: ask which project they are comparing against, then contrast only location, price, legal clarity, and possession confidence.',
    timing: 'Timing: ask what event must happen before they can decide, then set the next follow-up around that date.',
  };

  const selectedObjections = lead.objections || [];
  const objectionHandlers = selectedObjections.length > 0
    ? selectedObjections.map(item => objectionHandlersByType[item])
    : [objectionHandlersByType.price, objectionHandlersByType.location, lead.status === 'Site Visit' ? 'Delay: turn the visit into a low-pressure inspection, not a buying commitment.' : objectionHandlersByType.family_decision];

  return { opener, pitch, ask, objectionHandlers };
}

export function generateLeadActivitySummary(
  lead: Lead,
  intelligence = computeLeadIntelligence(lead),
): LeadActivitySummary {
  const raw = lead.raw_data || {};
  const name = raw.lead_name || 'This buyer';
  const budget = compactBudget(Number(raw.budget || 0));
  const interests = raw.interests?.length ? raw.interests.join(', ') : raw.interest || 'property';
  const preferredLocation = raw.location || 'location not captured';
  const bestProperty = bestMatchedProperty(lead);
  const objections = lead.objections || [];
  const activeObjections = objections.map(item => LEAD_OBJECTION_LABELS[item]);

  const buyerProfile = `${name} is looking for ${interests} around ${budget} in ${preferredLocation}. Timeline: ${raw.plan_to_buy || 'not captured'}.`;

  const currentBlocker = activeObjections.length > 0
    ? activeObjections.join(', ')
    : intelligence.risks[0] || 'No explicit blocker captured yet.';

  const activity = [...(lead.activity_log || [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latestActivity = activity[0] || null;
  const lastTouchDate = latestActivity ? formatShortDate(latestActivity.created_at) : null;
  const lastTouch = latestActivity
    ? `${latestActivity.text}${lastTouchDate ? ` (${lastTouchDate})` : ''}`
    : raw.note
      ? raw.note
      : 'No activity has been recorded yet.';

  const visits = [...(lead.site_visits || [])]
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
  const latestVisit = visits[0] || null;
  const visitDate = latestVisit ? formatShortDate(latestVisit.scheduled_at) : null;
  const siteVisitSummary = latestVisit
    ? `${latestVisit.status} visit${visitDate ? ` on ${visitDate}` : ''}${latestVisit.location ? ` at ${latestVisit.location}` : ''}${latestVisit.notes ? `: ${latestVisit.notes}` : '.'}`
    : 'No site visit is scheduled or completed yet.';

  const propertySummary = bestProperty
    ? `${bestProperty.projectName} is the strongest property angle${bestProperty.matchScore ? ` (${bestProperty.matchScore}/100 fit)` : ''}.`
    : 'No strongest property angle is available yet.';

  const headline = `${intelligence.temperature} lead in ${lead.status}: ${propertySummary}`;

  const timeline = [
    ...activity.slice(0, 3).map(entry => {
      const date = formatShortDate(entry.created_at);
      return `${date ? `${date}: ` : ''}${entry.text}`;
    }),
  ];
  if (timeline.length === 0 && raw.note) {
    timeline.push(raw.note);
  }

  return {
    headline,
    buyerProfile,
    currentBlocker,
    lastTouch,
    siteVisitSummary,
    nextAction: intelligence.nextBestAction,
    timeline,
  };
}
