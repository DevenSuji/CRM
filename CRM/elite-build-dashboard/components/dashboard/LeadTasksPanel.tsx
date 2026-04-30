"use client";
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { AlarmClock, CheckCircle, MessageCircle, MapPin, Phone, Send, UserRound } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Lead, ActivityLogEntry } from '@/lib/types/lead';
import type { CRMUser } from '@/lib/types/user';
import type { InventoryUnit } from '@/lib/types/inventory';
import type { NurtureConfig, SLAConfig } from '@/lib/types/config';
import { generateLeadTasks, LeadTask, LeadTaskPriority, LeadTaskType } from '@/lib/utils/leadTasks';
import { computeDailyBriefing } from '@/lib/utils/dailyBriefing';
import { computeInventoryIntelligence } from '@/lib/utils/inventoryIntelligence';
import { DailyBriefingPanel } from '@/components/tasks/DailyBriefingPanel';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';

interface LeadTasksPanelProps {
  leads: Lead[];
  users: CRMUser[];
  inventory?: InventoryUnit[];
  selectedUid?: string;
  currentUserUid?: string;
  currentUserName?: string;
  slaConfig: SLAConfig;
  nurtureConfig?: NurtureConfig;
}

const TASK_ICON: Record<LeadTaskType, typeof Phone> = {
  call_due: Phone,
  callback_due: AlarmClock,
  whatsapp_due: Send,
  welcome_whatsapp_due: Send,
  nurture_whatsapp_due: Send,
  property_match_follow_up_due: MessageCircle,
  whatsapp_reply_follow_up_due: MessageCircle,
  site_visit_confirmation_due: MapPin,
  site_visit_reminder_due: AlarmClock,
  post_site_visit_follow_up: MessageCircle,
  old_lead_reactivation_due: AlarmClock,
};

const TASK_TYPE_LABELS: Record<LeadTaskType, string> = {
  call_due: 'Call',
  callback_due: 'Callback',
  whatsapp_due: 'Property Details',
  welcome_whatsapp_due: 'Welcome',
  nurture_whatsapp_due: 'No Response',
  property_match_follow_up_due: 'Property Follow-Up',
  whatsapp_reply_follow_up_due: 'WhatsApp Reply',
  site_visit_confirmation_due: 'Visit Confirmation',
  site_visit_reminder_due: 'Visit Reminder',
  post_site_visit_follow_up: 'Post-Visit',
  old_lead_reactivation_due: 'Reactivation',
};

const TASK_TYPE_OPTIONS = Object.entries(TASK_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const PRIORITY_OPTIONS: { value: LeadTaskPriority; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
];

function dueLabel(dueAt: string): string {
  const due = new Date(dueAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const absMinutes = Math.abs(Math.round(diffMs / 60000));
  if (diffMs < 0) {
    if (absMinutes < 60) return `${absMinutes}m overdue`;
    const hours = Math.round(absMinutes / 60);
    if (hours < 24) return `${hours}h overdue`;
    return `${Math.round(hours / 24)}d overdue`;
  }
  if (absMinutes < 60) return `Due in ${absMinutes}m`;
  const hours = Math.round(absMinutes / 60);
  if (hours < 24) return `Due in ${hours}h`;
  return due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function userNameFor(users: CRMUser[], uid?: string | null): string {
  if (!uid) return 'Unassigned';
  return users.find(user => user.uid === uid)?.name || 'Unassigned';
}

export function LeadTasksPanel({ leads, users, inventory = [], selectedUid, currentUserUid, currentUserName = 'System', slaConfig, nurtureConfig }: LeadTasksPanelProps) {
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const allTasks = useMemo(() => {
    const visibleLeads = selectedUid ? leads.filter(lead => lead.assigned_to === selectedUid) : leads;
    return generateLeadTasks(visibleLeads, slaConfig, new Date(), nurtureConfig);
  }, [leads, selectedUid, slaConfig, nurtureConfig]);

  const inventoryIntelligence = useMemo(() =>
    computeInventoryIntelligence(inventory, leads),
    [inventory, leads],
  );

  const dailyBriefing = useMemo(() =>
    computeDailyBriefing({
      leads,
      users,
      inventoryIntelligence,
      slaConfig,
      selectedUid,
    }),
    [leads, users, inventoryIntelligence, slaConfig, selectedUid],
  );

  const filteredTasks = useMemo(() => allTasks.filter(task => {
    if (scope === 'mine' && currentUserUid && task.assignedTo !== currentUserUid) return false;
    if (assigneeFilter && (task.assignedTo || '') !== assigneeFilter) return false;
    if (typeFilter && task.type !== typeFilter) return false;
    if (priorityFilter && task.priority !== priorityFilter) return false;
    return true;
  }), [allTasks, scope, currentUserUid, assigneeFilter, typeFilter, priorityFilter]);

  const tasks = filteredTasks.slice(0, 50);

  const counters = useMemo(() => ({
    critical: allTasks.filter(task => task.priority === 'critical').length,
    high: allTasks.filter(task => task.priority === 'high').length,
    normal: allTasks.filter(task => task.priority === 'normal').length,
  }), [allTasks]);

  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>();
    return allTasks
      .map(task => task.assignedTo || '')
      .filter(uid => {
        if (!uid || seen.has(uid)) return false;
        seen.add(uid);
        return true;
      })
      .map(uid => ({ value: uid, label: userNameFor(users, uid) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allTasks, users]);

  const completeTask = async (task: LeadTask) => {
    const lead = leads.find(item => item.id === task.leadId);
    if (!lead) return;
    setCompletingId(task.id);
    try {
      const logEntry: ActivityLogEntry = {
        id: `task_${Date.now()}`,
        type: 'task_completed',
        task_id: task.id,
        text: `Completed task: ${task.title}`,
        author: currentUserName,
        created_at: new Date().toISOString(),
      };
      const update: Record<string, unknown> = {
        activity_log: arrayUnion(logEntry),
      };

      if (task.type === 'callback_due' && task.relatedId) {
        update.callback_requests = (lead.callback_requests || []).map(callback =>
          callback.id === task.relatedId ? { ...callback, status: 'completed' } : callback
        );
      }

      if (task.type === 'site_visit_confirmation_due' && task.relatedId) {
        update.site_visits = (lead.site_visits || []).map(visit =>
          visit.id === task.relatedId ? { ...visit, reminder_on_agreement: true } : visit
        );
      }

      if (task.type === 'site_visit_reminder_due' && task.relatedId) {
        update.site_visits = (lead.site_visits || []).map(visit =>
          visit.id === task.relatedId ? { ...visit, reminder_day_before: true } : visit
        );
      }

      await updateDoc(doc(db, 'leads', task.leadId), update);
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <DailyBriefingPanel briefing={dailyBriefing} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-mn-h2 uppercase tracking-wider">Today / Overdue Tasks</h2>
          <p className="mt-1 text-xs text-mn-text-muted">Generated from callbacks, site visits, property matches, and SLA timers.</p>
        </div>
        <Badge variant={allTasks.length > 0 ? 'warning' : 'success'}>{allTasks.length} open</Badge>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[auto_1fr] lg:items-center">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPriorityFilter(priorityFilter === 'critical' ? '' : 'critical')}
            className={`rounded-full border px-3 py-1.5 text-xs font-black ${priorityFilter === 'critical' ? 'border-mn-danger bg-mn-danger/12 text-mn-danger' : 'border-mn-border/50 text-mn-text-muted hover:text-mn-text'}`}
          >
            Critical {counters.critical}
          </button>
          <button
            type="button"
            onClick={() => setPriorityFilter(priorityFilter === 'high' ? '' : 'high')}
            className={`rounded-full border px-3 py-1.5 text-xs font-black ${priorityFilter === 'high' ? 'border-mn-warning bg-mn-warning/12 text-mn-warning' : 'border-mn-border/50 text-mn-text-muted hover:text-mn-text'}`}
          >
            High {counters.high}
          </button>
          <button
            type="button"
            onClick={() => setPriorityFilter(priorityFilter === 'normal' ? '' : 'normal')}
            className={`rounded-full border px-3 py-1.5 text-xs font-black ${priorityFilter === 'normal' ? 'border-mn-border bg-mn-border/30 text-mn-text' : 'border-mn-border/50 text-mn-text-muted hover:text-mn-text'}`}
          >
            Normal {counters.normal}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Select
            label="Scope"
            value={scope}
            onChange={e => setScope(e.target.value as 'all' | 'mine')}
            options={[
              { value: 'all', label: 'All Tasks' },
              { value: 'mine', label: 'My Tasks' },
            ]}
          />
          <Select
            label="Assignee"
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value)}
            placeholder="All assignees"
            options={assigneeOptions}
          />
          <Select
            label="Task Type"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            placeholder="All types"
            options={TASK_TYPE_OPTIONS}
          />
          <Select
            label="Priority"
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            placeholder="All priorities"
            options={PRIORITY_OPTIONS}
          />
        </div>
      </div>

      <div className="app-shell-panel overflow-hidden">
        {allTasks.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm font-bold text-mn-text-muted">
            <CheckCircle className="h-4 w-4 text-mn-success" />
            No overdue or due tasks right now.
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm font-bold text-mn-text-muted">
            <CheckCircle className="h-4 w-4 text-mn-success" />
            No tasks match the selected filters.
          </div>
        ) : (
          <div className="divide-y divide-mn-border/30">
            {tasks.map(task => {
              const Icon = TASK_ICON[task.type];
              return (
                <div key={task.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                        task.priority === 'critical' ? 'bg-mn-danger/12 text-mn-danger' : 'bg-mn-warning/12 text-mn-warning'
                      }`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <Link href={`/?leadId=${task.leadId}`} className="text-sm font-black text-mn-h1 hover:text-mn-h2">
                        {task.leadName}
                      </Link>
                      <Badge variant={task.priority === 'critical' ? 'danger' : task.priority === 'high' ? 'warning' : 'default'}>
                        {dueLabel(task.dueAt)}
                      </Badge>
                      <Badge variant="info">{TASK_TYPE_LABELS[task.type]}</Badge>
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-mn-text-muted">{task.status}</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-mn-text">{task.title}</p>
                    <p className="mt-0.5 text-xs text-mn-text-muted">{task.detail}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-mn-text-muted">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{task.phone || 'No phone'}</span>
                      <span className="flex items-center gap-1"><UserRound className="h-3 w-3" />{userNameFor(users, task.assignedTo)}</span>
                      <span>{task.source}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/?leadId=${task.leadId}`}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-mn-border/70 bg-mn-card/80 px-5 py-2.5 text-sm font-black text-mn-text shadow-sm transition-all hover:-translate-y-0.5 hover:border-mn-input-focus/40 hover:bg-mn-card-hover"
                    >
                      Open
                    </Link>
                    <Button
                      variant="secondary"
                      disabled={completingId === task.id}
                      onClick={() => completeTask(task)}
                      icon={<CheckCircle className="h-4 w-4" />}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
