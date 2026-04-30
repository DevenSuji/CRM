import type { Timestamp } from 'firebase/firestore';
import type { Lead } from '@/lib/types/lead';
import type { NurtureConfig, SLAConfig } from '@/lib/types/config';

export type LeadTaskType =
  | 'call_due'
  | 'callback_due'
  | 'whatsapp_due'
  | 'welcome_whatsapp_due'
  | 'nurture_whatsapp_due'
  | 'property_match_follow_up_due'
  | 'whatsapp_reply_follow_up_due'
  | 'site_visit_confirmation_due'
  | 'site_visit_reminder_due'
  | 'post_site_visit_follow_up'
  | 'old_lead_reactivation_due';

export type LeadTaskPriority = 'critical' | 'high' | 'normal';

export interface LeadTask {
  id: string;
  type: LeadTaskType;
  leadId: string;
  leadName: string;
  phone: string;
  status: string;
  source: string;
  assignedTo?: string | null;
  title: string;
  detail: string;
  dueAt: string;
  priority: LeadTaskPriority;
  relatedId?: string;
}

const TERMINAL_STATUSES = new Set(['Booked', 'Closed', 'Rejected']);
const CONTACT_TYPES = new Set(['call', 'note', 'whatsapp_sent', 'whatsapp_received', 'property_details_sent', 'site_visit_scheduled']);
const OUTBOUND_NURTURE_ANCHOR_TYPES = new Set(['call', 'whatsapp_sent', 'property_details_sent']);
const PROPERTY_DETAILS_TYPES = new Set(['whatsapp_sent', 'property_details_sent']);
const INBOUND_WHATSAPP_TYPES = new Set(['whatsapp_received']);
const SALES_RESPONSE_TYPES = new Set(['call', 'note', 'whatsapp_sent', 'property_details_sent', 'callback_scheduled', 'site_visit_scheduled']);

function timestampToMs(value: Timestamp | Date | string | null | undefined): number | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value instanceof Date) return value.getTime();
  if ('toMillis' in value && typeof value.toMillis === 'function') return value.toMillis();
  return null;
}

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

function completedTaskIds(lead: Lead): Set<string> {
  return new Set(
    (lead.activity_log || [])
      .filter(entry => entry.type === 'task_completed' && entry.task_id)
      .map(entry => entry.task_id as string),
  );
}

function hasActivityAfter(lead: Lead, types: Set<string>, afterMs: number): boolean {
  return (lead.activity_log || []).some(entry => {
    if (!types.has(entry.type)) return false;
    const activityMs = timestampToMs(entry.created_at);
    return activityMs !== null && activityMs >= afterMs;
  });
}

function latestActivityMs(lead: Lead): number | null {
  const values = (lead.activity_log || [])
    .map(entry => timestampToMs(entry.created_at))
    .filter((value): value is number => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

function latestActivityForTypesMs(lead: Lead, types: Set<string>): number | null {
  const values = (lead.activity_log || [])
    .filter(entry => types.has(entry.type))
    .map(entry => timestampToMs(entry.created_at))
    .filter((value): value is number => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

function baseTask(lead: Lead, patch: Omit<LeadTask, 'leadId' | 'leadName' | 'phone' | 'status' | 'source' | 'assignedTo'>): LeadTask {
  return {
    ...patch,
    leadId: lead.id,
    leadName: lead.raw_data.lead_name || 'Unnamed Lead',
    phone: lead.raw_data.phone || lead.raw_data.whatsapp || lead.raw_data.whatsapp_number || '',
    status: lead.status,
    source: lead.source,
    assignedTo: lead.assigned_to || null,
  };
}

export function generateLeadTasks(
  leads: Lead[],
  config: SLAConfig,
  now: Date = new Date(),
  nurtureConfig?: NurtureConfig,
): LeadTask[] {
  const nowMs = now.getTime();
  const tasks: LeadTask[] = [];

  for (const lead of leads) {
    if (TERMINAL_STATUSES.has(lead.status)) continue;

    const completed = completedTaskIds(lead);
    const createdMs = timestampToMs(lead.created_at);
    const lastActivity = latestActivityMs(lead) ?? createdMs;
    const latestNurtureAnchor = latestActivityForTypesMs(lead, OUTBOUND_NURTURE_ANCHOR_TYPES);
    let nurtureTaskCreated = false;

    const latestInboundWhatsAppMs = latestActivityForTypesMs(lead, INBOUND_WHATSAPP_TYPES);
    if (latestInboundWhatsAppMs !== null) {
      const taskId = `${lead.id}:whatsapp_reply_follow_up_due:${latestInboundWhatsAppMs}`;
      const hasSalesResponse = hasActivityAfter(lead, SALES_RESPONSE_TYPES, latestInboundWhatsAppMs + 1);
      if (!hasSalesResponse && !completed.has(taskId)) {
        nurtureTaskCreated = true;
        tasks.push(baseTask(lead, {
          id: taskId,
          type: 'whatsapp_reply_follow_up_due',
          title: 'Reply to WhatsApp',
          detail: 'Buyer replied on WhatsApp. Review the message and respond with the next step.',
          dueAt: isoFromMs(latestInboundWhatsAppMs),
          priority: 'high',
        }));
      }
    }

    if (
      nurtureConfig?.enabled &&
      nurtureConfig.welcome_enabled &&
      createdMs !== null
    ) {
      const dueMs = createdMs + nurtureConfig.welcome_delay_minutes * 60000;
      const taskId = `${lead.id}:welcome_whatsapp_due:${createdMs}`;
      const welcomeAlreadySent = hasActivityAfter(lead, new Set(['whatsapp_sent']), createdMs);
      if (nowMs >= dueMs && !welcomeAlreadySent && !completed.has(taskId)) {
        tasks.push(baseTask(lead, {
          id: taskId,
          type: 'welcome_whatsapp_due',
          title: 'Send welcome message',
          detail: 'Suggested WhatsApp welcome message for this new lead.',
          dueAt: isoFromMs(dueMs),
          priority: 'high',
        }));
      }
    }

    if (config.enabled && createdMs !== null && !hasActivityAfter(lead, new Set(['call']), createdMs)) {
      const dueMs = createdMs + config.first_call_minutes * 60000;
      const taskId = `${lead.id}:call_due:first_call`;
      if (nowMs >= dueMs && !completed.has(taskId)) {
        tasks.push(baseTask(lead, {
          id: taskId,
          type: 'call_due',
          title: 'Call lead',
          detail: `First call is overdue for ${lead.raw_data.lead_name || 'this lead'}.`,
          dueAt: isoFromMs(dueMs),
          priority: 'critical',
        }));
      }
    }

    for (const callback of lead.callback_requests || []) {
      if (callback.status !== 'pending') continue;
      const scheduledMs = timestampToMs(callback.scheduled_at);
      if (scheduledMs === null) continue;
      const taskId = `${lead.id}:callback_due:${callback.id}`;
      if (nowMs >= scheduledMs && !completed.has(taskId)) {
        tasks.push(baseTask(lead, {
          id: taskId,
          type: 'callback_due',
          title: 'Callback due',
          detail: callback.notes || 'Call back at the scheduled time.',
          dueAt: callback.scheduled_at,
          priority: nowMs - scheduledMs > config.missed_callback_minutes * 60000 ? 'critical' : 'high',
          relatedId: callback.id,
        }));
      }
    }

    const latestTaggedPropertyMs = Math.max(
      0,
      ...(lead.interested_properties || []).map(property => timestampToMs(property.tagged_at) || 0),
    );
    const latestPropertyDetailsSentMs = latestActivityForTypesMs(lead, PROPERTY_DETAILS_TYPES);
    if (latestTaggedPropertyMs > 0) {
      const taskId = `${lead.id}:whatsapp_due:${latestTaggedPropertyMs}`;
      const detailsSent = hasActivityAfter(lead, new Set(['whatsapp_sent', 'property_details_sent']), latestTaggedPropertyMs);
      if (!detailsSent && !completed.has(taskId)) {
        tasks.push(baseTask(lead, {
          id: taskId,
          type: 'whatsapp_due',
          title: 'Send property details',
          detail: 'Matched property details have not been sent yet.',
          dueAt: isoFromMs(latestTaggedPropertyMs),
          priority: 'high',
        }));
      }
    }

    if (
      nurtureConfig?.enabled &&
      nurtureConfig.property_match_follow_up_enabled &&
      latestTaggedPropertyMs > 0 &&
      latestPropertyDetailsSentMs !== null &&
      latestPropertyDetailsSentMs >= latestTaggedPropertyMs
    ) {
      const dueMs = latestPropertyDetailsSentMs + nurtureConfig.property_match_follow_up_days * 86400000;
      const taskId = `${lead.id}:property_match_follow_up_due:${latestTaggedPropertyMs}:${latestPropertyDetailsSentMs}`;
      const hasNewerActivity = hasActivityAfter(lead, CONTACT_TYPES, latestPropertyDetailsSentMs + 1);
      if (nowMs >= dueMs && !hasNewerActivity && !completed.has(taskId)) {
        nurtureTaskCreated = true;
        tasks.push(baseTask(lead, {
          id: taskId,
          type: 'property_match_follow_up_due',
          title: 'Follow up on property match',
          detail: 'Suggested follow-up after matched property details were sent.',
          dueAt: isoFromMs(dueMs),
          priority: 'high',
        }));
      }
    }

    for (const visit of lead.site_visits || []) {
      if (visit.status === 'cancelled') continue;
      const visitMs = timestampToMs(visit.scheduled_at);
      if (visitMs === null) continue;

      const confirmationTaskId = `${lead.id}:site_visit_confirmation_due:${visit.id}`;
      if (visit.status === 'scheduled' && !visit.reminder_on_agreement && !completed.has(confirmationTaskId)) {
        tasks.push(baseTask(lead, {
          id: confirmationTaskId,
          type: 'site_visit_confirmation_due',
          title: 'Confirm site visit',
          detail: `${visit.location || 'Site visit'} needs confirmation.`,
          dueAt: visit.created_at || isoFromMs(nowMs),
          priority: 'high',
          relatedId: visit.id,
        }));
      }

      if (
        nurtureConfig?.enabled &&
        nurtureConfig.site_visit_reminder_enabled &&
        visit.status === 'scheduled' &&
        !visit.reminder_day_before
      ) {
        const reminderDueMs = visitMs - nurtureConfig.site_visit_reminder_hours_before * 60 * 60000;
        const reminderTaskId = `${lead.id}:site_visit_reminder_due:${visit.id}`;
        if (nowMs >= reminderDueMs && nowMs < visitMs && !completed.has(reminderTaskId)) {
          tasks.push(baseTask(lead, {
            id: reminderTaskId,
            type: 'site_visit_reminder_due',
            title: 'Send site visit reminder',
            detail: `${visit.location || 'Site visit'} is coming up. Send a reminder to the lead.`,
            dueAt: isoFromMs(reminderDueMs),
            priority: 'high',
            relatedId: visit.id,
          }));
        }
      }

      const followUpTaskId = `${lead.id}:post_site_visit_follow_up:${visit.id}`;
      const followUpDueMs = visitMs + (nurtureConfig?.post_site_visit_follow_up_hours_after ?? 2) * 60 * 60000;
      const followedUp = hasActivityAfter(lead, CONTACT_TYPES, visitMs + 1);
      if (
        nurtureConfig?.enabled !== false &&
        nurtureConfig?.post_site_visit_follow_up_enabled !== false &&
        nowMs >= followUpDueMs &&
        !followedUp &&
        !completed.has(followUpTaskId)
      ) {
        tasks.push(baseTask(lead, {
          id: followUpTaskId,
          type: 'post_site_visit_follow_up',
          title: 'Post-visit follow-up',
          detail: `${visit.location || 'Site visit'} needs a follow-up update. Capture objections, buyer feedback, and next steps.`,
          dueAt: isoFromMs(followUpDueMs),
          priority: 'high',
          relatedId: visit.id,
        }));
        nurtureTaskCreated = true;
      }
    }

    if (
      !nurtureTaskCreated &&
      nurtureConfig?.enabled &&
      nurtureConfig.no_response_follow_up_enabled &&
      latestNurtureAnchor !== null
    ) {
      const dueMs = latestNurtureAnchor + nurtureConfig.no_response_follow_up_days * 86400000;
      const taskId = `${lead.id}:nurture_whatsapp_due:no_response:${latestNurtureAnchor}`;
      const hasNewerActivity = hasActivityAfter(lead, CONTACT_TYPES, latestNurtureAnchor + 1);
      if (nowMs >= dueMs && !hasNewerActivity && !completed.has(taskId)) {
        nurtureTaskCreated = true;
        tasks.push(baseTask(lead, {
          id: taskId,
          type: 'nurture_whatsapp_due',
          title: 'Send no-response follow-up',
          detail: 'Suggested WhatsApp follow-up because the lead has gone quiet after the last outbound touch.',
          dueAt: isoFromMs(dueMs),
          priority: 'normal',
        }));
      }
    }

    if (config.enabled && lastActivity !== null) {
      const followUpDueMs = lastActivity + config.no_follow_up_days * 86400000;
      const taskId = `${lead.id}:call_due:follow_up:${lastActivity}`;
      if (!nurtureTaskCreated && nowMs >= followUpDueMs && hasActivityAfter(lead, CONTACT_TYPES, createdMs || lastActivity) && !completed.has(taskId)) {
        tasks.push(baseTask(lead, {
          id: taskId,
          type: 'call_due',
          title: 'Follow up',
          detail: 'No recent follow-up activity on this lead.',
          dueAt: isoFromMs(followUpDueMs),
          priority: 'normal',
        }));
      }
    }

    if (
      !nurtureTaskCreated &&
      nurtureConfig?.enabled &&
      nurtureConfig.old_lead_reactivation_enabled &&
      lastActivity !== null
    ) {
      const dueMs = lastActivity + nurtureConfig.old_lead_reactivation_days * 86400000;
      const taskId = `${lead.id}:old_lead_reactivation_due:${lastActivity}`;
      const hasExistingLeadTask = tasks.some(task => task.leadId === lead.id);
      if (!hasExistingLeadTask && nowMs >= dueMs && !completed.has(taskId)) {
        tasks.push(baseTask(lead, {
          id: taskId,
          type: 'old_lead_reactivation_due',
          title: 'Reactivate old lead',
          detail: 'Lead has been quiet for a long time. Consider a reactivation WhatsApp or call.',
          dueAt: isoFromMs(dueMs),
          priority: 'normal',
        }));
      }
    }
  }

  return tasks.sort((a, b) => {
    const priorityRank: Record<LeadTaskPriority, number> = { critical: 0, high: 1, normal: 2 };
    const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return Date.parse(a.dueAt) - Date.parse(b.dueAt);
  });
}
