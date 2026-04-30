import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { DEFAULT_NURTURE_CONFIG, DEFAULT_SLA_CONFIG } from '@/lib/types/config';
import { generateLeadTasks } from '@/lib/utils/leadTasks';
import type { ActivityLogEntry, Lead } from '@/lib/types/lead';

const now = new Date('2026-04-26T12:00:00Z');
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead_1',
    status: 'New',
    created_at: ts('2026-04-26T10:00:00Z'),
    source: 'Meta Ads',
    raw_data: {
      lead_name: 'Test Lead',
      phone: '9999999999',
      email: '',
      budget: 0,
      plan_to_buy: '',
      profession: '',
      location: '',
      note: '',
      pref_facings: [],
      interest: '',
    },
    activity_log: [],
    interested_properties: [],
    ...overrides,
  };
}

function activity(type: ActivityLogEntry['type'], createdAt: string, patch: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: `${type}_${createdAt}`,
    type,
    text: type,
    author: 'Sales User',
    created_at: createdAt,
    ...patch,
  };
}

describe('generateLeadTasks', () => {
  it('creates a first-call task when no call exists after the SLA', () => {
    const tasks = generateLeadTasks([lead()], DEFAULT_SLA_CONFIG, now);
    expect(tasks.map(task => task.type)).toContain('call_due');
    expect(tasks[0].priority).toBe('critical');
  });

  it('does not create first-call tasks for terminal leads', () => {
    const tasks = generateLeadTasks([lead({ status: 'Closed' })], DEFAULT_SLA_CONFIG, now);
    expect(tasks).toEqual([]);
  });

  it('creates callback tasks for due pending callbacks', () => {
    const tasks = generateLeadTasks([
      lead({
        callback_requests: [{
          id: 'cb1',
          scheduled_at: '2026-04-26T11:00:00Z',
          notes: 'Promised callback',
          created_at: '2026-04-26T10:00:00Z',
          created_by: 'u1',
          assigned_to: 'u1',
          status: 'pending',
        }],
      }),
    ], DEFAULT_SLA_CONFIG, now);

    expect(tasks.map(task => task.id)).toContain('lead_1:callback_due:cb1');
  });

  it('creates a WhatsApp task when matched property details have not been sent', () => {
    const tasks = generateLeadTasks([
      lead({
        interested_properties: [{
          projectId: 'p1',
          projectName: 'Rare Earth',
          location: 'Mysore',
          propertyType: 'Plotted Land',
          tagged_at: '2026-04-26T09:00:00Z',
          tagged_by: 'system',
        }],
      }),
    ], DEFAULT_SLA_CONFIG, now);

    expect(tasks.map(task => task.type)).toContain('whatsapp_due');
  });

  it('suppresses WhatsApp tasks after property details are sent', () => {
    const tasks = generateLeadTasks([
      lead({
        activity_log: [activity('property_details_sent', '2026-04-26T09:30:00Z')],
        interested_properties: [{
          projectId: 'p1',
          projectName: 'Rare Earth',
          location: 'Mysore',
          propertyType: 'Plotted Land',
          tagged_at: '2026-04-26T09:00:00Z',
          tagged_by: 'system',
        }],
      }),
    ], DEFAULT_SLA_CONFIG, now);

    expect(tasks.map(task => task.type)).not.toContain('whatsapp_due');
  });

  it('creates site visit confirmation and post-visit follow-up tasks', () => {
    const tasks = generateLeadTasks([
      lead({
        activity_log: [activity('call', '2026-04-25T09:00:00Z')],
        site_visits: [{
          id: 'visit1',
          scheduled_at: '2026-04-26T08:00:00Z',
          location: 'Rare Earth',
          notes: '',
          created_at: '2026-04-25T09:00:00Z',
          reminder_on_agreement: false,
          reminder_day_before: false,
          reminder_morning_of: false,
          status: 'scheduled',
        }],
      }),
    ], DEFAULT_SLA_CONFIG, now);

    expect(tasks.map(task => task.id)).toContain('lead_1:site_visit_confirmation_due:visit1');
    expect(tasks.map(task => task.id)).toContain('lead_1:post_site_visit_follow_up:visit1');
  });

  it('suppresses post-visit follow-up when disabled', () => {
    const tasks = generateLeadTasks([
      lead({
        activity_log: [activity('call', '2026-04-25T09:00:00Z')],
        site_visits: [{
          id: 'visit1',
          scheduled_at: '2026-04-26T08:00:00Z',
          location: 'Rare Earth',
          notes: '',
          created_at: '2026-04-25T09:00:00Z',
          reminder_on_agreement: true,
          reminder_day_before: true,
          reminder_morning_of: false,
          status: 'scheduled',
        }],
      }),
    ], DEFAULT_SLA_CONFIG, now, { ...DEFAULT_NURTURE_CONFIG, post_site_visit_follow_up_enabled: false });

    expect(tasks.map(task => task.type)).not.toContain('post_site_visit_follow_up');
  });

  it('respects the configured post-visit follow-up window', () => {
    const tasks = generateLeadTasks([
      lead({
        activity_log: [activity('call', '2026-04-25T09:00:00Z')],
        site_visits: [{
          id: 'visit1',
          scheduled_at: '2026-04-26T08:00:00Z',
          location: 'Rare Earth',
          notes: '',
          created_at: '2026-04-25T09:00:00Z',
          reminder_on_agreement: true,
          reminder_day_before: true,
          reminder_morning_of: false,
          status: 'scheduled',
        }],
      }),
    ], DEFAULT_SLA_CONFIG, now, { ...DEFAULT_NURTURE_CONFIG, post_site_visit_follow_up_hours_after: 8 });

    expect(tasks.map(task => task.type)).not.toContain('post_site_visit_follow_up');
  });

  it('hides tasks that have a completed task log entry', () => {
    const taskId = 'lead_1:callback_due:cb1';
    const tasks = generateLeadTasks([
      lead({
        activity_log: [activity('task_completed', '2026-04-26T11:30:00Z', { task_id: taskId })],
        callback_requests: [{
          id: 'cb1',
          scheduled_at: '2026-04-26T11:00:00Z',
          notes: '',
          created_at: '2026-04-26T10:00:00Z',
          created_by: 'u1',
          assigned_to: 'u1',
          status: 'pending',
        }],
      }),
    ], DEFAULT_SLA_CONFIG, now);

    expect(tasks.map(task => task.id)).not.toContain(taskId);
  });

  it('creates a no-response WhatsApp nurture task after outbound silence', () => {
    const tasks = generateLeadTasks([
      lead({
        activity_log: [activity('property_details_sent', '2026-04-24T09:00:00Z')],
      }),
    ], DEFAULT_SLA_CONFIG, now, DEFAULT_NURTURE_CONFIG);

    expect(tasks.map(task => task.type)).toContain('nurture_whatsapp_due');
    expect(tasks.find(task => task.type === 'nurture_whatsapp_due')?.title).toBe('Send no-response follow-up');
  });

  it('suppresses no-response nurture when there is newer activity', () => {
    const tasks = generateLeadTasks([
      lead({
        activity_log: [
          activity('property_details_sent', '2026-04-24T09:00:00Z'),
          activity('note', '2026-04-25T09:00:00Z'),
        ],
      }),
    ], DEFAULT_SLA_CONFIG, now, DEFAULT_NURTURE_CONFIG);

    expect(tasks.map(task => task.type)).not.toContain('nurture_whatsapp_due');
  });

  it('suppresses no-response nurture when the sequence is disabled', () => {
    const tasks = generateLeadTasks([
      lead({
        activity_log: [activity('property_details_sent', '2026-04-24T09:00:00Z')],
      }),
    ], DEFAULT_SLA_CONFIG, now, { ...DEFAULT_NURTURE_CONFIG, no_response_follow_up_enabled: false });

    expect(tasks.map(task => task.type)).not.toContain('nurture_whatsapp_due');
  });

  it('creates a new lead welcome WhatsApp task', () => {
    const tasks = generateLeadTasks([
      lead({ created_at: ts('2026-04-26T11:30:00Z') }),
    ], DEFAULT_SLA_CONFIG, now, DEFAULT_NURTURE_CONFIG);

    expect(tasks.map(task => task.type)).toContain('welcome_whatsapp_due');
    expect(tasks.find(task => task.type === 'welcome_whatsapp_due')?.title).toBe('Send welcome message');
  });

  it('suppresses welcome tasks after WhatsApp has been sent', () => {
    const tasks = generateLeadTasks([
      lead({
        created_at: ts('2026-04-26T10:00:00Z'),
        activity_log: [activity('whatsapp_sent', '2026-04-26T10:10:00Z')],
      }),
    ], DEFAULT_SLA_CONFIG, now, DEFAULT_NURTURE_CONFIG);

    expect(tasks.map(task => task.type)).not.toContain('welcome_whatsapp_due');
  });

  it('suppresses welcome tasks when the sequence is disabled', () => {
    const tasks = generateLeadTasks([
      lead({ created_at: ts('2026-04-26T11:30:00Z') }),
    ], DEFAULT_SLA_CONFIG, now, { ...DEFAULT_NURTURE_CONFIG, welcome_enabled: false });

    expect(tasks.map(task => task.type)).not.toContain('welcome_whatsapp_due');
  });

  it('creates a property match follow-up after matched details were sent and the lead is quiet', () => {
    const tasks = generateLeadTasks([
      lead({
        interested_properties: [{
          projectId: 'p1',
          projectName: 'Rare Earth',
          location: 'Mysore',
          propertyType: 'Plotted Land',
          tagged_at: '2026-04-24T08:00:00Z',
          tagged_by: 'system',
        }],
        activity_log: [activity('property_details_sent', '2026-04-24T09:00:00Z')],
      }),
    ], DEFAULT_SLA_CONFIG, now, DEFAULT_NURTURE_CONFIG);

    expect(tasks.map(task => task.type)).toContain('property_match_follow_up_due');
    expect(tasks.map(task => task.type)).not.toContain('nurture_whatsapp_due');
  });

  it('creates a WhatsApp reply task when a buyer replies and sales has not responded', () => {
    const tasks = generateLeadTasks([
      lead({
        activity_log: [
          activity('whatsapp_sent', '2026-04-26T09:00:00Z'),
          activity('whatsapp_received', '2026-04-26T11:00:00Z', { text: 'WhatsApp received: Can I visit tomorrow?' }),
        ],
      }),
    ], DEFAULT_SLA_CONFIG, now, DEFAULT_NURTURE_CONFIG);

    const replyTask = tasks.find(task => task.type === 'whatsapp_reply_follow_up_due');
    expect(replyTask?.title).toBe('Reply to WhatsApp');
    expect(replyTask?.priority).toBe('high');
  });

  it('suppresses WhatsApp reply tasks after sales responds', () => {
    const tasks = generateLeadTasks([
      lead({
        activity_log: [
          activity('whatsapp_received', '2026-04-26T10:00:00Z'),
          activity('whatsapp_sent', '2026-04-26T10:05:00Z'),
        ],
      }),
    ], DEFAULT_SLA_CONFIG, now, DEFAULT_NURTURE_CONFIG);

    expect(tasks.map(task => task.type)).not.toContain('whatsapp_reply_follow_up_due');
  });

  it('suppresses property match follow-up when there is newer activity', () => {
    const tasks = generateLeadTasks([
      lead({
        interested_properties: [{
          projectId: 'p1',
          projectName: 'Rare Earth',
          location: 'Mysore',
          propertyType: 'Plotted Land',
          tagged_at: '2026-04-24T08:00:00Z',
          tagged_by: 'system',
        }],
        activity_log: [
          activity('property_details_sent', '2026-04-24T09:00:00Z'),
          activity('note', '2026-04-25T09:00:00Z'),
        ],
      }),
    ], DEFAULT_SLA_CONFIG, now, DEFAULT_NURTURE_CONFIG);

    expect(tasks.map(task => task.type)).not.toContain('property_match_follow_up_due');
  });

  it('suppresses property match follow-up when disabled', () => {
    const tasks = generateLeadTasks([
      lead({
        interested_properties: [{
          projectId: 'p1',
          projectName: 'Rare Earth',
          location: 'Mysore',
          propertyType: 'Plotted Land',
          tagged_at: '2026-04-24T08:00:00Z',
          tagged_by: 'system',
        }],
        activity_log: [activity('property_details_sent', '2026-04-24T09:00:00Z')],
      }),
    ], DEFAULT_SLA_CONFIG, now, { ...DEFAULT_NURTURE_CONFIG, property_match_follow_up_enabled: false });

    expect(tasks.map(task => task.type)).not.toContain('property_match_follow_up_due');
  });

  it('creates a site visit reminder before a scheduled visit', () => {
    const tasks = generateLeadTasks([
      lead({
        activity_log: [activity('call', '2026-04-25T09:00:00Z')],
        site_visits: [{
          id: 'visit1',
          scheduled_at: '2026-04-27T08:00:00Z',
          location: 'Rare Earth',
          notes: '',
          created_at: '2026-04-25T09:00:00Z',
          reminder_on_agreement: true,
          reminder_day_before: false,
          reminder_morning_of: false,
          status: 'scheduled',
        }],
      }),
    ], DEFAULT_SLA_CONFIG, now, DEFAULT_NURTURE_CONFIG);

    expect(tasks.map(task => task.id)).toContain('lead_1:site_visit_reminder_due:visit1');
  });

  it('does not create a site visit reminder before the reminder window', () => {
    const tasks = generateLeadTasks([
      lead({
        site_visits: [{
          id: 'visit1',
          scheduled_at: '2026-04-28T14:00:00Z',
          location: 'Rare Earth',
          notes: '',
          created_at: '2026-04-25T09:00:00Z',
          reminder_on_agreement: true,
          reminder_day_before: false,
          reminder_morning_of: false,
          status: 'scheduled',
        }],
      }),
    ], DEFAULT_SLA_CONFIG, now, DEFAULT_NURTURE_CONFIG);

    expect(tasks.map(task => task.type)).not.toContain('site_visit_reminder_due');
  });

  it('suppresses site visit reminders when disabled or already sent', () => {
    const visit = {
      id: 'visit1',
      scheduled_at: '2026-04-27T08:00:00Z',
      location: 'Rare Earth',
      notes: '',
      created_at: '2026-04-25T09:00:00Z',
      reminder_on_agreement: true,
      reminder_day_before: false,
      reminder_morning_of: false,
      status: 'scheduled' as const,
    };

    const disabled = generateLeadTasks([
      lead({ site_visits: [visit] }),
    ], DEFAULT_SLA_CONFIG, now, { ...DEFAULT_NURTURE_CONFIG, site_visit_reminder_enabled: false });
    const alreadySent = generateLeadTasks([
      lead({ site_visits: [{ ...visit, reminder_day_before: true }] }),
    ], DEFAULT_SLA_CONFIG, now, DEFAULT_NURTURE_CONFIG);

    expect(disabled.map(task => task.type)).not.toContain('site_visit_reminder_due');
    expect(alreadySent.map(task => task.type)).not.toContain('site_visit_reminder_due');
  });

  it('creates an old lead reactivation task when no more specific task exists', () => {
    const tasks = generateLeadTasks([
      lead({ created_at: ts('2026-03-01T10:00:00Z') }),
    ], { ...DEFAULT_SLA_CONFIG, enabled: false }, now, {
      ...DEFAULT_NURTURE_CONFIG,
      welcome_enabled: false,
      no_response_follow_up_enabled: false,
      property_match_follow_up_enabled: false,
      site_visit_reminder_enabled: false,
      post_site_visit_follow_up_enabled: false,
      old_lead_reactivation_days: 30,
    });

    expect(tasks.map(task => task.type)).toContain('old_lead_reactivation_due');
  });

  it('suppresses old lead reactivation when disabled', () => {
    const tasks = generateLeadTasks([
      lead({ created_at: ts('2026-03-01T10:00:00Z') }),
    ], { ...DEFAULT_SLA_CONFIG, enabled: false }, now, {
      ...DEFAULT_NURTURE_CONFIG,
      welcome_enabled: false,
      old_lead_reactivation_enabled: false,
    });

    expect(tasks.map(task => task.type)).not.toContain('old_lead_reactivation_due');
  });

  it('suppresses old lead reactivation when a more specific nurture task exists', () => {
    const tasks = generateLeadTasks([
      lead({
        created_at: ts('2026-03-01T10:00:00Z'),
        interested_properties: [{
          projectId: 'p1',
          projectName: 'Rare Earth',
          location: 'Mysore',
          propertyType: 'Plotted Land',
          tagged_at: '2026-03-20T08:00:00Z',
          tagged_by: 'system',
        }],
        activity_log: [activity('property_details_sent', '2026-03-20T09:00:00Z')],
      }),
    ], { ...DEFAULT_SLA_CONFIG, enabled: false }, now, {
      ...DEFAULT_NURTURE_CONFIG,
      welcome_enabled: false,
      old_lead_reactivation_days: 1,
    });

    expect(tasks.map(task => task.type)).toContain('property_match_follow_up_due');
    expect(tasks.map(task => task.type)).not.toContain('old_lead_reactivation_due');
  });
});
