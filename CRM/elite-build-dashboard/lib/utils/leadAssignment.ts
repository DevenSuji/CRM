import type { Lead, LeadRawData } from '@/lib/types/lead';
import type { LeadAssignmentConfig } from '@/lib/types/config';
import { DEFAULT_LEAD_ASSIGNMENT_CONFIG } from '@/lib/types/config';
import type { CRMUser } from '@/lib/types/user';

export interface AssignmentResult {
  assigneeUid: string | null;
  assigneeName: string | null;
  reason: string;
  nextCursor?: number;
}

export type LeadAssignmentInput = {
  source?: string;
  raw_data?: Partial<LeadRawData>;
};

const OPEN_STATUSES = new Set(['New', 'First Call', 'Nurturing', 'Property Matched', 'Site Visit']);

export function normalizeAssignmentConfig(config?: Partial<LeadAssignmentConfig> | null): LeadAssignmentConfig {
  return {
    ...DEFAULT_LEAD_ASSIGNMENT_CONFIG,
    ...(config || {}),
    eligible_roles: config?.eligible_roles?.length ? config.eligible_roles : DEFAULT_LEAD_ASSIGNMENT_CONFIG.eligible_roles,
    eligible_user_uids: config?.eligible_user_uids || [],
    source_rules: config?.source_rules || [],
    round_robin_cursor: Number.isFinite(config?.round_robin_cursor) ? config?.round_robin_cursor : 0,
  };
}

function userName(user: CRMUser): string {
  return user.name || user.email || user.uid;
}

export function eligibleAssignees(users: CRMUser[], config: LeadAssignmentConfig): CRMUser[] {
  const explicit = new Set(config.eligible_user_uids);
  return users
    .filter(user => user.active)
    .filter(user => explicit.size > 0 ? explicit.has(user.uid) : config.eligible_roles.includes(user.role))
    .sort((a, b) => userName(a).localeCompare(userName(b)));
}

function openWorkload(leads: Lead[], uid: string): number {
  return leads.filter(lead => lead.assigned_to === uid && OPEN_STATUSES.has(lead.status)).length;
}

function sourceRuleAssignees(input: LeadAssignmentInput, users: CRMUser[], config: LeadAssignmentConfig): CRMUser[] {
  const source = (input.source || '').toLowerCase();
  if (!source) return [];

  const rule = config.source_rules.find(item =>
    item.active
    && item.source_contains.trim()
    && source.includes(item.source_contains.trim().toLowerCase())
    && item.assignee_uids.length > 0,
  );
  if (!rule) return [];

  const allowed = new Set(rule.assignee_uids);
  return eligibleAssignees(users, { ...config, eligible_user_uids: rule.assignee_uids })
    .filter(user => allowed.has(user.uid));
}

export function chooseLeadAssignee(
  input: LeadAssignmentInput,
  users: CRMUser[],
  leads: Lead[],
  rawConfig?: Partial<LeadAssignmentConfig> | null,
): AssignmentResult {
  const config = normalizeAssignmentConfig(rawConfig);
  if (!config.enabled) {
    return { assigneeUid: null, assigneeName: null, reason: 'Lead assignment is disabled.' };
  }

  const ruleCandidates = sourceRuleAssignees(input, users, config);
  const candidates = ruleCandidates.length > 0 ? ruleCandidates : eligibleAssignees(users, config);
  if (candidates.length === 0) {
    return { assigneeUid: null, assigneeName: null, reason: 'No active eligible assignees.' };
  }

  if (config.strategy === 'round_robin') {
    const index = (config.round_robin_cursor || 0) % candidates.length;
    const assignee = candidates[index];
    return {
      assigneeUid: assignee.uid,
      assigneeName: userName(assignee),
      reason: ruleCandidates.length > 0 ? 'Source rule round-robin assignment.' : 'Round-robin assignment.',
      nextCursor: (index + 1) % candidates.length,
    };
  }

  const assignee = [...candidates].sort((a, b) => {
    const diff = openWorkload(leads, a.uid) - openWorkload(leads, b.uid);
    return diff !== 0 ? diff : userName(a).localeCompare(userName(b));
  })[0];

  return {
    assigneeUid: assignee.uid,
    assigneeName: userName(assignee),
    reason: ruleCandidates.length > 0 ? 'Source rule workload assignment.' : 'Lowest open workload assignment.',
  };
}
