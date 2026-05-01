"use client";
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { orderBy, addDoc, collection, Timestamp, doc, updateDoc, arrayUnion, arrayRemove, getDoc, getDocs, onSnapshot, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  LayoutDashboard, UserPlus, MapPin, Calendar, Target, Save,
  Plus, PhoneCall, MessageSquare, Clock, CalendarPlus, CheckCircle, Send,
  Trash2, PhoneForwarded, AlarmClock, Upload, FileSpreadsheet, AlertTriangle,
  Building2, SendHorizontal, X, Megaphone, Sparkles, Home,
  Maximize2, Minimize2, GitMerge, Search, RotateCcw,
} from 'lucide-react';
import { useFirestoreCollectionKeyed } from '@/lib/hooks/useFirestoreCollection';
import { useFirestoreDoc } from '@/lib/hooks/useFirestoreDoc';
import { useToast } from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/context/AuthContext';
import { Lead, ActivityLogEntry, SiteVisit, CallbackRequest, InterestedProperty, BookedUnit, type LeadObjection } from '@/lib/types/lead';
import { CRMUser } from '@/lib/types/user';
import {
  KanbanConfig, DEFAULT_KANBAN_CONFIG,
  LeadCardColorsConfig, DEFAULT_LEAD_CARD_COLORS,
  PropertyMatchConfig, DEFAULT_PROPERTY_MATCH_CONFIG,
  SLAConfig, DEFAULT_SLA_CONFIG,
} from '@/lib/types/config';
import { InventoryUnit } from '@/lib/types/inventory';
import { Project } from '@/lib/types/project';
import { usePropertyMatching, resolveInterests, diagnoseMatches } from '@/lib/hooks/usePropertyMatching';
import { can } from '@/lib/utils/permissions';
import { MatchThresholdSlider } from '@/components/MatchThresholdSlider';
import { KanbanBoard } from '@/components/KanbanBoard';
import { CallbackAlarmOverlay } from '@/components/CallbackAlarmOverlay';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LocationAutocomplete } from '@/components/ui/LocationAutocomplete';
import { PropertySearch } from '@/components/PropertySearch';
import { PropertyTooltip } from '@/components/PropertyTooltip';
import { formatPrice } from '@/lib/utils/formatPrice';
import { geocodeAddress } from '@/lib/utils/geocode';
import { ProjectLocationSearch } from '@/components/ProjectLocationSearch';
import { DateTimePicker } from '@/components/ui/DateTimePicker';
import { parseCSV, normalizeLead, isValidRow, getLeadName, getPhone, getEmail, type CSVRow } from '@/lib/utils/csvImport';
import { buildDuplicateKeys, describeDuplicateCandidate, findDuplicateLeads } from '@/lib/utils/leadDuplicates';
import { injectPropertyMatchedLane, backfillLaneEmojis } from '@/lib/utils/kanbanLanes';
import { computeLeadSLA, type LeadSLAAlert } from '@/lib/utils/leadSla';
import { LEAD_OBJECTION_LABELS } from '@/lib/utils/leadIntelligence';
import { buildSmartLeadSearchInsights, hasStructuredSmartSearch, matchesSmartLeadSearch, parseSmartLeadSearch } from '@/lib/utils/smartLeadSearch';
import { buildLeadCleanupCsv, getLeadDataQualityIssues, getRequiredGovernanceNoteForStatusChange, summarizeLeadDataQuality } from '@/lib/utils/leadDataQuality';
import { buildStageMoveLog, getStageMoveReasonOptions, type StageMoveReasonCategory } from '@/lib/utils/kanbanStageMoves';
import { getLeadSourceNormalizationPatch, leadSourceLabel, normalizeLeadSource } from '@/lib/utils/leadSourceHygiene';
import { filterLeadPageLeads, isChannelPartnerLead } from '@/lib/utils/leadVisibility';

type LeadPropertyRemovalUpdate = {
  interested_properties: InterestedProperty[];
  dismissed_matches?: ReturnType<typeof arrayUnion>;
};

type PropertyDetailsProject = {
  status?: Project['status'];
  project_fields?: Project['project_fields'];
  gallery?: Project['gallery'];
};

function useProjectScopedAvailableInventory(enabled: boolean, projects: Project[]) {
  const [snapshotState, setSnapshotState] = useState<{
    key: string;
    data: InventoryUnit[];
    loading: boolean;
  }>({ key: '', data: [], loading: false });
  const projectIds = useMemo(
    () => projects.map(project => project.id).filter(Boolean).sort(),
    [projects],
  );
  const projectKey = projectIds.join('|');
  const shouldSubscribe = enabled && projectIds.length > 0;

  useEffect(() => {
    if (!shouldSubscribe) {
      return;
    }

    const byProject = new Map<string, InventoryUnit[]>();
    const loaded = new Set<string>();
    const flatten = () => projectIds.flatMap(projectId => byProject.get(projectId) || []);

    const unsubs = projectIds.map(projectId => {
      const inventoryQuery = query(
        collection(db, 'inventory'),
        where('projectId', '==', projectId),
        where('status', '==', 'Available'),
      );

      return onSnapshot(
        inventoryQuery,
        { includeMetadataChanges: true },
        snapshot => {
          byProject.set(projectId, snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InventoryUnit)));
          loaded.add(projectId);
          setSnapshotState({ key: projectKey, data: flatten(), loading: loaded.size < projectIds.length });
        },
        err => {
          console.error(`Firestore error [inventory:${projectId}]:`, err);
          byProject.set(projectId, []);
          loaded.add(projectId);
          setSnapshotState({ key: projectKey, data: flatten(), loading: loaded.size < projectIds.length });
        },
      );
    });

    return () => unsubs.forEach(unsub => unsub());
  }, [projectIds, projectKey, shouldSubscribe]);

  if (!shouldSubscribe) {
    return { data: [], loading: false };
  }
  if (snapshotState.key !== projectKey) {
    return { data: [], loading: true };
  }
  return { data: snapshotState.data, loading: snapshotState.loading };
}

function leadCreatedAtMs(lead: Lead): number {
  const value = lead.created_at as unknown;
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (typeof value === 'object') {
    const timestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
    if (typeof timestamp.seconds === 'number') return timestamp.seconds * 1000;
  }
  return 0;
}

function mergeAndSortLeads(...groups: Lead[][]): Lead[] {
  const byId = new Map<string, Lead>();
  for (const group of groups) {
    for (const lead of group) {
      byId.set(lead.id, lead);
    }
  }
  return Array.from(byId.values()).sort((a, b) => leadCreatedAtMs(b) - leadCreatedAtMs(a));
}

export default function LeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { crmUser, firebaseUser } = useAuth();
  const isAdmin = crmUser?.role === 'admin' || crmUser?.role === 'superadmin';
  const isSalesExec = crmUser?.role === 'sales_exec';
  const canDeleteLead = can(crmUser?.role, 'delete_lead');
  const ownLeadsOnly = can(crmUser?.role, 'view_own_leads_only') && !can(crmUser?.role, 'view_all_leads');
  const isChannelPartner = crmUser?.role === 'channel_partner';

  // Build lead subscriptions deliberately: scoped roles must filter at
  // query-level because Firestore rules deny broad collection listeners.
  const leadsKey = !crmUser || isSalesExec ? null : (ownLeadsOnly ? `own:${crmUser.uid}` : 'all');
  const leadsConstraints = useMemo(() => {
    if (ownLeadsOnly && crmUser?.uid) {
      return [where('owner_uid', '==', crmUser.uid), orderBy('created_at', 'desc')];
    }
    return [orderBy('created_at', 'desc')];
  }, [ownLeadsOnly, crmUser]);
  const { data: baseLeads, loading: baseLeadsLoading } = useFirestoreCollectionKeyed<Lead>(
    'leads',
    leadsKey,
    leadsConstraints,
  );
  const salesAssignedLeadsKey = isSalesExec && crmUser?.uid ? `sales-assigned:${crmUser.uid}` : null;
  const salesAssignedLeadsConstraints = useMemo(() => (
    isSalesExec && crmUser?.uid ? [where('assigned_to', '==', crmUser.uid)] : []
  ), [crmUser?.uid, isSalesExec]);
  const { data: salesAssignedLeads, loading: salesAssignedLeadsLoading } = useFirestoreCollectionKeyed<Lead>(
    'leads',
    salesAssignedLeadsKey,
    salesAssignedLeadsConstraints,
  );
  const salesUnassignedLeadsKey = isSalesExec && crmUser?.uid ? `sales-unassigned:${crmUser.uid}` : null;
  const salesUnassignedLeadsConstraints = useMemo(() => (
    isSalesExec
      ? [where('assigned_to', '==', null), where('source_normalized', '!=', 'Channel Partner')]
      : []
  ), [isSalesExec]);
  const { data: salesUnassignedLeads, loading: salesUnassignedLeadsLoading } = useFirestoreCollectionKeyed<Lead>(
    'leads',
    salesUnassignedLeadsKey,
    salesUnassignedLeadsConstraints,
  );
  const leads = useMemo(
    () => isSalesExec ? mergeAndSortLeads(salesAssignedLeads, salesUnassignedLeads) : baseLeads,
    [baseLeads, isSalesExec, salesAssignedLeads, salesUnassignedLeads],
  );
  const leadsLoading = isSalesExec
    ? salesAssignedLeadsLoading || salesUnassignedLeadsLoading
    : baseLeadsLoading;
  const activeLeads = useMemo(
    () => leads.filter(lead => !lead.archived_at && !lead.archived_at_iso),
    [leads],
  );
  const visibleLeads = useMemo(
    () => filterLeadPageLeads(activeLeads, crmUser),
    [activeLeads, crmUser],
  );

  const { data: kanbanConfig } = useFirestoreDoc<KanbanConfig & { id: string }>(
    'crm_config',
    'kanban',
  );

  const { data: cardColorsConfig } = useFirestoreDoc<LeadCardColorsConfig & { id: string }>(
    'crm_config',
    'lead_card_colors',
  );

  const { data: matchConfig } = useFirestoreDoc<PropertyMatchConfig & { id: string }>(
    'crm_config',
    'property_match',
  );

  const { data: slaConfigDoc } = useFirestoreDoc<SLAConfig & { id: string }>(
    'crm_config',
    'sla',
  );

  const inventoryKey = !crmUser ? null : isChannelPartner ? null : 'available-inventory';
  const { data: internalInventoryUnits, loading: internalInventoryLoading } = useFirestoreCollectionKeyed<InventoryUnit>(
    'inventory',
    inventoryKey,
    [where('status', '==', 'Available')],
  );

  const projectKey = !crmUser
    ? null
    : isChannelPartner
      ? `assigned-projects:${crmUser.uid}`
      : 'all-projects';
  const projectConstraints = useMemo(() => {
    if (isChannelPartner && crmUser?.uid) {
      return [where('channel_partner_uids', 'array-contains', crmUser.uid)];
    }
    return [orderBy('created_at', 'desc')];
  }, [isChannelPartner, crmUser?.uid]);
  const { data: allProjects } = useFirestoreCollectionKeyed<Project>(
    'projects',
    projectKey,
    projectConstraints,
  );
  const { data: channelPartnerInventoryUnits, loading: channelPartnerInventoryLoading } = useProjectScopedAvailableInventory(
    Boolean(crmUser && isChannelPartner),
    allProjects,
  );
  const inventoryUnits = isChannelPartner ? channelPartnerInventoryUnits : internalInventoryUnits;
  const inventoryLoading = isChannelPartner ? channelPartnerInventoryLoading : internalInventoryLoading;

  const { data: teamUsers } = useFirestoreCollectionKeyed<CRMUser & { id: string }>(
    'users',
    isAdmin ? 'users:lead-assignment' : null,
    [],
  );

  const thresholdPercent = matchConfig?.threshold_percent ?? DEFAULT_PROPERTY_MATCH_CONFIG.threshold_percent;

  // Property matching hook — auto-matches leads against available inventory
  usePropertyMatching({
    leads: visibleLeads,
    inventory: inventoryUnits,
    projects: allProjects,
    thresholdPercent,
    enabled: !leadsLoading && !inventoryLoading && can(crmUser?.role, 'edit_lead'),
  });

  const lanes = useMemo(() => {
    const raw = (kanbanConfig?.lanes && kanbanConfig.lanes.length > 0) ? kanbanConfig.lanes : DEFAULT_KANBAN_CONFIG.lanes;
    return backfillLaneEmojis(injectPropertyMatchedLane(raw));
  }, [kanbanConfig]);

  const availableColors = useMemo(
    () => (cardColorsConfig?.colors && cardColorsConfig.colors.length > 0) ? cardColorsConfig.colors : DEFAULT_LEAD_CARD_COLORS.colors,
    [cardColorsConfig],
  );

  const slaConfig = useMemo(
    () => ({ ...DEFAULT_SLA_CONFIG, ...(slaConfigDoc || {}) }),
    [slaConfigDoc],
  );

  const [leadSearch, setLeadSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [matchFilter, setMatchFilter] = useState('');
  const [attentionFilter, setAttentionFilter] = useState('');
  const [dataQualityFilter, setDataQualityFilter] = useState('');
  const assignableUsers = useMemo(() => {
    const self = crmUser ? [{ ...crmUser, id: crmUser.uid }] : [];
    const known = new Map<string, CRMUser & { id?: string }>();
    for (const user of [...teamUsers, ...self]) {
      known.set(user.uid, user);
    }
    return Array.from(known.values())
      .filter(user => user.active)
      .filter(user => ['superadmin', 'admin', 'sales_exec', 'channel_partner'].includes(user.role))
      .sort((a, b) => (a.name || a.email || a.uid).localeCompare(b.name || b.email || b.uid));
  }, [crmUser, teamUsers]);
  const assigneeNameByUid = useMemo(() => Object.fromEntries(
    assignableUsers.map(user => [user.uid, user.name || user.email || user.uid]),
  ), [assignableUsers]);
  const assigneeOptions = useMemo(() => [
    { value: 'mine', label: 'My leads' },
    { value: 'unassigned', label: 'Unassigned' },
    ...assignableUsers.map(user => ({ value: `uid:${user.uid}`, label: user.name || user.email || user.uid })),
  ], [assignableUsers]);
  const sourceOptions = useMemo(() => {
    const sources = [...new Set(visibleLeads.map(lead => leadSourceLabel(lead)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return sources.map(source => ({ value: source, label: source }));
  }, [visibleLeads]);
  const smartLeadSearch = useMemo(() => parseSmartLeadSearch(leadSearch), [leadSearch]);
  const smartSearchActive = hasStructuredSmartSearch(smartLeadSearch);

  const filteredLeads = useMemo(() => {
    return visibleLeads.filter(lead => {
      const sla = computeLeadSLA(lead, slaConfig);
      if (sourceFilter && leadSourceLabel(lead) !== sourceFilter) return false;
      if (urgencyFilter && lead.ai_audit?.urgency !== urgencyFilter) return false;
      if (matchFilter === 'matched' && !lead.suggested_plot && !(lead.interested_properties?.length)) return false;
      if (matchFilter === 'unmatched' && (lead.suggested_plot || lead.interested_properties?.length)) return false;
      if (dataQualityFilter) {
        const quality = summarizeLeadDataQuality(lead);
        if (dataQualityFilter === 'any' && quality.totalIssues === 0) return false;
        if (dataQualityFilter === 'blocking' && quality.blockingIssues === 0) return false;
        if (dataQualityFilter === 'warnings' && quality.warningIssues === 0) return false;
        if (!['any', 'blocking', 'warnings'].includes(dataQualityFilter) && !quality.issueIds.includes(dataQualityFilter)) return false;
      }
      if (attentionFilter === 'needs_attention' && sla.alerts.length === 0) return false;
      if (attentionFilter && attentionFilter !== 'needs_attention' && !sla.alerts.some(alert => alert.id === attentionFilter)) return false;
      if (assigneeFilter === 'mine' && lead.assigned_to !== crmUser?.uid) return false;
      if (assigneeFilter === 'unassigned' && lead.assigned_to) return false;
      if (assigneeFilter.startsWith('uid:') && lead.assigned_to !== assigneeFilter.slice(4)) return false;
      return matchesSmartLeadSearch(lead, smartLeadSearch, { currentUserUid: crmUser?.uid });
    });
  }, [visibleLeads, assigneeFilter, attentionFilter, crmUser?.uid, dataQualityFilter, matchFilter, slaConfig, smartLeadSearch, sourceFilter, urgencyFilter]);
  const smartSearchInsights = useMemo(
    () => buildSmartLeadSearchInsights(filteredLeads, smartLeadSearch),
    [filteredLeads, smartLeadSearch],
  );

  const attentionCounts = useMemo(() => {
    const counts: Record<LeadSLAAlert['id'] | 'needs_attention', number> = {
      needs_attention: 0,
      missed_callback: 0,
      first_call: 0,
      no_follow_up: 0,
      stale: 0,
    };
    for (const lead of visibleLeads) {
      const alerts = computeLeadSLA(lead, slaConfig).alerts;
      if (alerts.length > 0) counts.needs_attention += 1;
      for (const alert of alerts) {
        counts[alert.id] += 1;
      }
    }
    return counts;
  }, [visibleLeads, slaConfig]);

  const dataQualityCounts = useMemo(() => {
    const counts: Record<string, number> = {
      any: 0,
      blocking: 0,
      warnings: 0,
      missing_phone: 0,
      missing_budget: 0,
      missing_location: 0,
      missing_assignee: 0,
      missing_source: 0,
      source_needs_normalization: 0,
      booked_without_unit: 0,
      site_visit_without_visit: 0,
      rejected_without_reason: 0,
      closed_without_details: 0,
    };

    for (const lead of visibleLeads) {
      const quality = summarizeLeadDataQuality(lead);
      if (quality.totalIssues > 0) counts.any += 1;
      if (quality.blockingIssues > 0) counts.blocking += 1;
      if (quality.warningIssues > 0) counts.warnings += 1;
      for (const issueId of quality.issueIds) {
        counts[issueId] = (counts[issueId] || 0) + 1;
      }
    }

    return counts;
  }, [visibleLeads]);

  const filtersActive = Boolean(leadSearch || sourceFilter || assigneeFilter || urgencyFilter || matchFilter || attentionFilter || dataQualityFilter);
  const clearLeadFilters = () => {
    setLeadSearch('');
    setSourceFilter('');
    setAssigneeFilter('');
    setUrgencyFilter('');
    setMatchFilter('');
    setAttentionFilter('');
    setDataQualityFilter('');
  };

  const stats = useMemo(() => {
    const total = filteredLeads.length;
    const highUrgency = filteredLeads.filter(l => l.ai_audit?.urgency === 'High').length;
    const matched = filteredLeads.filter(l => l.suggested_plot || l.interested_properties?.length).length;
    return { total, highUrgency, matched };
  }, [filteredLeads]);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [normalizingSources, setNormalizingSources] = useState(false);
  const [assigningUnassigned, setAssigningUnassigned] = useState(false);

  const sourceNormalizationLeads = useMemo(
    () => visibleLeads.filter(lead => getLeadSourceNormalizationPatch(lead)),
    [visibleLeads],
  );
  const cleanupExportLeads = useMemo(
    () => filteredLeads.filter(lead => summarizeLeadDataQuality(lead).totalIssues > 0),
    [filteredLeads],
  );
  const unassignedCleanupLeads = useMemo(
    () => filteredLeads.filter(lead => summarizeLeadDataQuality(lead).issueIds.includes('missing_assignee')),
    [filteredLeads],
  );

  const leadIdFromUrl = searchParams.get('leadId');
  const leadFromUrl = useMemo(
    () => leadIdFromUrl ? visibleLeads.find(item => item.id === leadIdFromUrl) || null : null,
    [visibleLeads, leadIdFromUrl],
  );
  const selectedVisibleLead = useMemo(
    () => selectedLead ? visibleLeads.find(item => item.id === selectedLead.id) || null : null,
    [selectedLead, visibleLeads],
  );
  const activeLead = selectedVisibleLead || leadFromUrl;

  const [fitToWindow, setFitToWindow] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('leads_fit_to_window') === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('leads_fit_to_window', fitToWindow ? '1' : '0');
  }, [fitToWindow]);

  const handleClickLead = useCallback((lead: Lead) => {
    setSelectedLead(lead);
  }, []);

  const handleCloseLead = useCallback(() => {
    setSelectedLead(null);
    if (searchParams.has('leadId')) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('leadId');
      const queryString = params.toString();
      router.replace(queryString ? `/?${queryString}` : '/');
    }
  }, [router, searchParams]);

  const handleNormalizeSources = useCallback(async () => {
    if (!isAdmin || sourceNormalizationLeads.length === 0 || normalizingSources) return;
    setNormalizingSources(true);
    try {
      const chunks: Lead[][] = [];
      for (let index = 0; index < sourceNormalizationLeads.length; index += 400) {
        chunks.push(sourceNormalizationLeads.slice(index, index + 400));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const lead of chunk) {
          const patch = getLeadSourceNormalizationPatch(lead);
          if (!patch) continue;
          const logEntry: ActivityLogEntry = {
            id: `source_norm_${Date.now()}_${lead.id}`,
            type: 'note',
            text: `Source normalized from "${patch.source}" to "${patch.source_normalized}" for reporting hygiene.`,
            author: crmUser?.name || crmUser?.email || 'Admin',
            created_at: new Date().toISOString(),
          };
          batch.update(doc(db, 'leads', lead.id), {
            source_normalized: patch.source_normalized,
            activity_log: arrayUnion(logEntry),
          });
        }
        await batch.commit();
      }

      showToast('success', `Normalized source labels for ${sourceNormalizationLeads.length} lead${sourceNormalizationLeads.length === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error('Failed to normalize sources:', err);
      showToast('error', 'Failed to normalize lead sources.');
    } finally {
      setNormalizingSources(false);
    }
  }, [crmUser?.email, crmUser?.name, isAdmin, normalizingSources, showToast, sourceNormalizationLeads]);

  const handleExportCleanupQueue = useCallback(() => {
    if (cleanupExportLeads.length === 0) {
      showToast('error', 'No cleanup leads to export.');
      return;
    }
    const csv = buildLeadCleanupCsv(cleanupExportLeads, assigneeNameByUid);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    link.download = `lead-cleanup-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', `Exported ${cleanupExportLeads.length} cleanup lead${cleanupExportLeads.length === 1 ? '' : 's'}.`);
  }, [assigneeNameByUid, cleanupExportLeads, showToast]);

  const handleAssignUnassigned = useCallback(async () => {
    if (!isAdmin || assigningUnassigned || unassignedCleanupLeads.length === 0) return;
    if (!firebaseUser) {
      showToast('error', 'Sign in again before assigning leads.');
      return;
    }

    setAssigningUnassigned(true);
    let assigned = 0;
    let skipped = 0;
    try {
      for (const lead of unassignedCleanupLeads) {
        const assignment = await resolveLeadAssignment(
          () => firebaseUser.getIdToken(),
          lead.source,
          lead.raw_data,
          true,
        );

        if (!assignment?.assigneeUid) {
          skipped++;
          continue;
        }

        await updateDoc(doc(db, 'leads', lead.id), {
          assigned_to: assignment.assigneeUid,
          activity_log: arrayUnion(buildAssignmentEntry(
            assignment.assigneeUid,
            assignment.assigneeName,
            `Bulk cleanup: ${assignment.reason}`,
            crmUser?.name || crmUser?.email || 'Admin',
          )),
        });
        await fetch('/api/whatsapp/sync-lead', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await firebaseUser.getIdToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ leadId: lead.id }),
        }).catch(syncErr => {
          console.warn('Failed to sync WhatsApp conversation access:', syncErr);
        });
        assigned++;
      }

      if (assigned > 0) {
        showToast('success', `Assigned ${assigned} lead${assigned === 1 ? '' : 's'}${skipped > 0 ? `, skipped ${skipped}` : ''}.`);
      } else {
        showToast('error', 'No eligible assignee was available for these leads.');
      }
    } catch (err) {
      console.error('Failed to bulk assign leads:', err);
      showToast('error', `Assigned ${assigned}, then failed while assigning remaining leads.`);
    } finally {
      setAssigningUnassigned(false);
    }
  }, [assigningUnassigned, crmUser?.email, crmUser?.name, firebaseUser, isAdmin, showToast, unassignedCleanupLeads]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader
        title="Leads"
        subtitle=""
        actions={
          <div className="mn-segmented flex flex-wrap items-center gap-2 rounded-[1.4rem] p-2">
            {isAdmin && (
              <>
                <MatchThresholdSlider value={thresholdPercent} />
                <div className="hidden h-6 w-px bg-mn-border/30 sm:block" />
              </>
            )}
            <button
              type="button"
              onClick={() => setFitToWindow(v => !v)}
              title={fitToWindow ? 'Switch to horizontal scroll' : 'Fit all lanes in one window'}
              aria-label={fitToWindow ? 'Switch to horizontal scroll' : 'Fit all lanes in one window'}
              aria-pressed={fitToWindow}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                fitToWindow
                  ? 'bg-mn-accent/20 border-mn-accent text-mn-accent'
                  : 'bg-transparent border-mn-border/40 text-mn-text-muted hover:border-mn-border hover:bg-mn-card-hover/50 hover:text-mn-text'
              }`}
            >
              {fitToWindow ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <Badge variant="default">{stats.total} total</Badge>
            {filtersActive && (
              <Badge variant="info">{filteredLeads.length} of {visibleLeads.length}</Badge>
            )}
            {dataQualityCounts.any > 0 && (
              <Badge variant={dataQualityCounts.blocking > 0 ? 'danger' : 'warning'}>{dataQualityCounts.any} cleanup</Badge>
            )}
            {stats.highUrgency > 0 && (
              <Badge variant="danger">{stats.highUrgency} high urgency</Badge>
            )}
            {stats.matched > 0 && (
              <Badge variant="success">{stats.matched} matched</Badge>
            )}
            {can(crmUser?.role, 'bulk_upload_leads') && (
              <Button variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={() => setShowImportModal(true)}>
                Import CSV
              </Button>
            )}
            {isAdmin && cleanupExportLeads.length > 0 && (
              <Button
                variant="secondary"
                icon={<FileSpreadsheet className="w-4 h-4" />}
                onClick={handleExportCleanupQueue}
              >
                Export Cleanup ({cleanupExportLeads.length})
              </Button>
            )}
            {isAdmin && unassignedCleanupLeads.length > 0 && (
              <Button
                variant="secondary"
                icon={<UserPlus className="w-4 h-4" />}
                onClick={handleAssignUnassigned}
                disabled={assigningUnassigned}
              >
                {assigningUnassigned ? 'Assigning...' : `Assign Unassigned (${unassignedCleanupLeads.length})`}
              </Button>
            )}
            {isAdmin && sourceNormalizationLeads.length > 0 && (
              <Button
                variant="secondary"
                icon={<CheckCircle className="w-4 h-4" />}
                onClick={handleNormalizeSources}
                disabled={normalizingSources}
              >
                {normalizingSources ? 'Normalizing...' : `Normalize Sources (${sourceNormalizationLeads.length})`}
              </Button>
            )}
            <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
              Create Lead
            </Button>
          </div>
        }
      />

      <div className="px-4 pt-4 sm:px-6 lg:px-8">
        <div className="app-shell-panel rounded-[1.5rem] p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.3fr)_repeat(6,minmax(130px,0.8fr))_auto] lg:items-end">
            <div className="relative">
              <Input
                label="Search Leads"
                value={leadSearch}
                onChange={event => setLeadSearch(event.target.value)}
                placeholder="Try: hot villa leads above 80L..."
                className="pl-10"
              />
              <Search className="pointer-events-none absolute bottom-[13px] left-3.5 h-4 w-4 text-mn-text-muted" />
            </div>
            <Select
              label="Source"
              value={sourceFilter}
              onChange={event => setSourceFilter(event.target.value)}
              placeholder="All sources"
              options={sourceOptions}
            />
            <Select
              label="Assignee"
              value={assigneeFilter}
              onChange={event => setAssigneeFilter(event.target.value)}
              placeholder="All leads"
              options={assigneeOptions}
            />
            <Select
              label="Urgency"
              value={urgencyFilter}
              onChange={event => setUrgencyFilter(event.target.value)}
              placeholder="Any urgency"
              options={[
                { value: 'High', label: 'High' },
                { value: 'Medium', label: 'Medium' },
                { value: 'Low', label: 'Low' },
              ]}
            />
            <Select
              label="Match"
              value={matchFilter}
              onChange={event => setMatchFilter(event.target.value)}
              placeholder="Any match"
              options={[
                { value: 'matched', label: 'Matched' },
                { value: 'unmatched', label: 'Unmatched' },
              ]}
            />
            <Select
              label="Attention"
              value={attentionFilter}
              onChange={event => setAttentionFilter(event.target.value)}
              placeholder="Any SLA"
              options={[
                { value: 'needs_attention', label: `Needs attention (${attentionCounts.needs_attention})` },
                { value: 'first_call', label: `First call overdue (${attentionCounts.first_call})` },
                { value: 'missed_callback', label: `Callback overdue (${attentionCounts.missed_callback})` },
                { value: 'no_follow_up', label: `No follow-up (${attentionCounts.no_follow_up})` },
                { value: 'stale', label: `Stale lead (${attentionCounts.stale})` },
              ]}
            />
            <Select
              label="Data Quality"
              value={dataQualityFilter}
              onChange={event => setDataQualityFilter(event.target.value)}
              placeholder="Any quality"
              options={[
                { value: 'any', label: `Needs cleanup (${dataQualityCounts.any})` },
                { value: 'blocking', label: `Blocking (${dataQualityCounts.blocking})` },
                { value: 'warnings', label: `Warnings (${dataQualityCounts.warnings})` },
                { value: 'missing_phone', label: `Missing phone (${dataQualityCounts.missing_phone})` },
                { value: 'missing_budget', label: `Missing budget (${dataQualityCounts.missing_budget})` },
                { value: 'missing_location', label: `Missing location (${dataQualityCounts.missing_location})` },
                { value: 'missing_assignee', label: `Missing assignee (${dataQualityCounts.missing_assignee})` },
                { value: 'source_needs_normalization', label: `Source cleanup (${dataQualityCounts.source_needs_normalization})` },
                { value: 'site_visit_without_visit', label: `Visit details (${dataQualityCounts.site_visit_without_visit})` },
                { value: 'booked_without_unit', label: `Booked unit (${dataQualityCounts.booked_without_unit})` },
                { value: 'rejected_without_reason', label: `Reject reason (${dataQualityCounts.rejected_without_reason})` },
                { value: 'closed_without_details', label: `Closure details (${dataQualityCounts.closed_without_details})` },
              ]}
            />
            <button
              type="button"
              onClick={clearLeadFilters}
              disabled={!filtersActive}
              title="Clear filters"
              aria-label="Clear lead filters"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-mn-border/60 bg-mn-card/70 text-mn-text-muted transition-colors hover:bg-mn-card-hover hover:text-mn-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
          {smartSearchActive && smartLeadSearch.labels.length > 0 && (
            <div className="mt-3 space-y-3 border-t border-mn-border/35 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-mn-text-muted">Smart Search</span>
                {smartLeadSearch.labels.slice(0, 8).map(label => (
                  <Badge key={label} variant="info">{label}</Badge>
                ))}
              </div>
              <div className="rounded-2xl border border-mn-h2/15 bg-mn-h2/5 p-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    {smartSearchInsights.stats.slice(0, 7).map(stat => (
                      <div key={stat.label} className="rounded-xl border border-mn-border/45 bg-mn-card/75 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-mn-text-muted">{stat.label}</p>
                        <p className="text-sm font-black text-mn-text">{stat.value}</p>
                      </div>
                    ))}
                    {smartSearchInsights.topProjects.length > 0 && (
                      <div className="rounded-xl border border-mn-border/45 bg-mn-card/75 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-mn-text-muted">Top Projects</p>
                        <p className="text-sm font-black text-mn-text">{smartSearchInsights.topProjects.join(', ')}</p>
                      </div>
                    )}
                  </div>
                  <p className="max-w-xl text-sm font-bold leading-relaxed text-mn-text">{smartSearchInsights.suggestedAction}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden pt-4">
        {leadsLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <LayoutDashboard className="w-12 h-12 text-mn-border mx-auto mb-3 animate-pulse" />
              <p className="text-mn-text-muted font-medium">Loading leads...</p>
            </div>
          </div>
        ) : (
          <KanbanBoard
            leads={filteredLeads}
            lanes={lanes}
            onClickLead={handleClickLead}
            availableColors={availableColors}
            slaConfig={slaConfig}
            fitToWindow={fitToWindow}
            assigneeNameByUid={assigneeNameByUid}
            actorName={crmUser?.name || crmUser?.email || firebaseUser?.email || 'Admin'}
            canManageBookings={isAdmin}
            getAuthToken={() => firebaseUser?.getIdToken() ?? Promise.resolve(null)}
          />
        )}
      </div>

      <AddLeadModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        existingLeads={visibleLeads}
        onOpenLead={handleClickLead}
        getAuthToken={() => firebaseUser?.getIdToken() ?? Promise.resolve(null)}
      />
      <ImportCSVModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        userName={crmUser?.name || 'Unknown'}
        existingLeads={visibleLeads}
        getAuthToken={() => firebaseUser?.getIdToken() ?? Promise.resolve(null)}
      />
      {activeLead && (
        <LeadDetailModal
          lead={activeLead}
          onClose={handleCloseLead}
          isAdmin={isAdmin}
          canDeleteLead={canDeleteLead}
          userName={crmUser?.name || 'Unknown'}
          userUid={crmUser?.uid || ''}
          inventory={inventoryUnits}
          projects={allProjects}
          globalThresholdPercent={thresholdPercent}
          existingLeads={visibleLeads}
          assignableUsers={assignableUsers}
          assigneeNameByUid={assigneeNameByUid}
          getAuthToken={() => firebaseUser?.getIdToken() ?? Promise.resolve(null)}
        />
      )}

      {/* Callback alarm overlay — checks all leads for due callbacks */}
      <CallbackAlarmOverlay leads={visibleLeads} onOpenLead={handleClickLead} currentUserUid={crmUser?.uid || ''} />
    </div>
  );
}

/* ==================== ADD LEAD MODAL ==================== */
async function resolveLeadAssignment(
  getAuthToken: (() => Promise<string | null>) | undefined,
  source: string,
  rawData: Lead['raw_data'],
  commit = false,
): Promise<{ assigneeUid: string | null; assigneeName: string | null; reason: string } | null> {
  const token = await getAuthToken?.();
  if (!token) return null;

  const res = await fetch('/api/lead-assignment/next', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ source, raw_data: rawData, commit }),
  });
  if (!res.ok) return null;
  return res.json();
}

function buildAssignmentEntry(assigneeUid: string, assigneeName: string | null, reason: string, author: string): ActivityLogEntry {
  return {
    id: `assign_${Date.now()}_${assigneeUid}`,
    type: 'lead_assigned',
    text: `Lead assigned to ${assigneeName || assigneeUid}. ${reason}`,
    author,
    created_at: new Date().toISOString(),
    assigned_to: assigneeUid,
  };
}

function AddLeadModal({ open, onClose, existingLeads, onOpenLead, getAuthToken }: { open: boolean; onClose: () => void; existingLeads: Lead[]; onOpenLead: (lead: Lead) => void; getAuthToken?: () => Promise<string | null> }) {
  const { showToast } = useToast();
  const { crmUser } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [budget, setBudget] = useState('');
  const [planToBuy, setPlanToBuy] = useState('');
  const [profession, setProfession] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [interests, setInterests] = useState<string[]>(['Plotted Land']);
  const [bhk, setBhk] = useState<number>(0);
  const [houseVariant, setHouseVariant] = useState('');
  const [assignmentPreview, setAssignmentPreview] = useState<{ assigneeUid: string | null; assigneeName: string | null; reason: string } | null>(null);
  const [assignmentPrepared, setAssignmentPrepared] = useState(false);
  const [savingLead, setSavingLead] = useState(false);

  const toggleInterest = (opt: string) => {
    setInterests(prev => prev.includes(opt) ? prev.filter(i => i !== opt) : [...prev, opt]);
    setAssignmentPrepared(false);
    setAssignmentPreview(null);
  };

  const showBhkField = interests.some(i => BHK_PROPERTY_TYPES.includes(i));
  const showVariantField = interests.includes('Individual House');
  const duplicateCandidates = useMemo(() => findDuplicateLeads({
    lead_name: name,
    phone,
    email,
  }, existingLeads).slice(0, 3), [email, existingLeads, name, phone]);

  const resetForm = () => {
    setName(''); setPhone(''); setEmail(''); setBudget('');
    setPlanToBuy(''); setProfession(''); setLocation('');
    setNote(''); setInterests(['Plotted Land']); setBhk(0); setHouseVariant('');
    setAssignmentPreview(null); setAssignmentPrepared(false); setSavingLead(false);
  };

  const markAssignmentDirty = () => {
    if (assignmentPrepared) {
      setAssignmentPrepared(false);
      setAssignmentPreview(null);
    }
  };

  const buildDraftLead = () => {
    const leadName = name.trim();
    const source = crmUser?.role === 'channel_partner' ? 'Channel Partner' : 'Walk-in';
    const rawData: Lead['raw_data'] = {
      lead_name: leadName,
      phone: phone.trim(),
      email: email.trim() || 'N/A',
      budget: Number(budget) || 0,
      plan_to_buy: planToBuy || 'Not Specified',
      profession: profession || 'Not Specified',
      location: location || 'Unknown',
      note: note || 'Walk-in customer',
      pref_facings: [],
      interest: interests[0] || 'General Query',
      interests: interests,
      ...(bhk > 0 ? { bhk } : {}),
      ...(houseVariant ? { house_variant: houseVariant } : {}),
    };
    const leadData = {
      status: 'New',
      created_at: Timestamp.now(),
      source,
      source_normalized: normalizeLeadSource(source),
      owner_uid: crmUser?.uid || null,
      duplicate_keys: buildDuplicateKeys(rawData),
      raw_data: rawData,
    };
    return { leadName, source, rawData, leadData };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      showToast('error', 'Name and phone number are required.');
      return;
    }
    const { leadName, source, rawData, leadData } = buildDraftLead();
    const selfAssignment = crmUser?.role === 'channel_partner' && crmUser.uid
      ? {
          assigneeUid: crmUser.uid,
          assigneeName: crmUser.name || crmUser.email || crmUser.uid,
          reason: 'Channel partner leads stay assigned to the partner.',
        }
      : crmUser?.role === 'sales_exec' && crmUser.uid
        ? {
            assigneeUid: crmUser.uid,
            assigneeName: crmUser.name || crmUser.email || crmUser.uid,
            reason: 'Sales executive manual leads stay assigned to the creator.',
          }
      : null;

    if (!assignmentPrepared) {
      setSavingLead(true);
      try {
        const preview = selfAssignment || await resolveLeadAssignment(getAuthToken, source, rawData, false);
        setAssignmentPreview(preview || {
          assigneeUid: null,
          assigneeName: null,
          reason: 'No automatic assignment was available.',
        });
        setAssignmentPrepared(true);
        showToast('success', 'Review the lead assignment before saving.');
      } catch (err) {
        console.error(err);
        setAssignmentPreview({
          assigneeUid: null,
          assigneeName: null,
          reason: 'Assignment preview failed. You can still save the lead unassigned.',
        });
        setAssignmentPrepared(true);
      } finally {
        setSavingLead(false);
      }
      return;
    }

    setSavingLead(true);

    // Write to Firestore in background
    try {
      const assignment = selfAssignment || await resolveLeadAssignment(getAuthToken, source, rawData, true) || assignmentPreview;
      const assignedLeadData = {
        ...leadData,
        ...(assignment?.assigneeUid ? {
          assigned_to: assignment.assigneeUid,
          activity_log: [
            buildAssignmentEntry(assignment.assigneeUid, assignment.assigneeName, assignment.reason, crmUser?.name || 'System'),
          ],
        } : {}),
      };
      const docRef = await addDoc(collection(db, 'leads'), assignedLeadData);
      // Geocode location in background
      if (location) {
        geocodeAddress(location).then(geo => {
          if (geo) {
            updateDoc(doc(db, 'leads', docRef.id), { 'raw_data.geo': geo }).catch(() => {});
          }
        });
      }
      showToast('success', `Lead "${leadName}" created successfully!`);
      resetForm();
      onClose();
    } catch (err) {
      console.error(err);
      showToast('error', `Failed to save lead "${leadName}". Please try again.`);
    } finally {
      setSavingLead(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { onClose(); resetForm(); }} title="Create Lead">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Name"
            required
            value={name}
            onChange={e => { setName(e.target.value); markAssignmentDirty(); }}
            placeholder="Customer name"
          />
          <Input
            label="Phone"
            required
            value={phone}
            onChange={e => { setPhone(e.target.value); markAssignmentDirty(); }}
            placeholder="+91 98765 43210"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); markAssignmentDirty(); }}
            placeholder="customer@email.com"
          />
          <Input
            label="Budget"
            type="number"
            value={budget}
            onChange={e => { setBudget(e.target.value); markAssignmentDirty(); }}
            placeholder="e.g. 5000000"
          />
        </div>
        {duplicateCandidates.length > 0 && (
          <div className="rounded-xl border border-mn-warning/40 bg-mn-warning/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-mn-warning" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-wider text-mn-h3">Possible duplicate lead</p>
                <div className="mt-2 space-y-1.5">
                  {duplicateCandidates.map(candidate => (
                    <button
                      key={candidate.lead.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        resetForm();
                        onOpenLead(candidate.lead);
                      }}
                      className="block w-full rounded-lg border border-mn-border/40 bg-mn-card/70 px-3 py-2 text-left text-xs text-mn-text transition-colors hover:border-mn-warning/60"
                    >
                      <span className="font-bold">{candidate.lead.raw_data?.lead_name || 'Existing lead'}</span>
                      <span className="ml-2 text-mn-text-muted">{candidate.reasons.join(', ')}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <LocationAutocomplete
            label="Location"
            value={location}
            onChange={value => { setLocation(value); markAssignmentDirty(); }}
            placeholder="e.g. Bogadhi, Mysore"
          />
          <Select
            label="Timeline"
            value={planToBuy}
            onChange={e => { setPlanToBuy(e.target.value); markAssignmentDirty(); }}
            placeholder="When planning to buy?"
            options={[
              { value: 'Immediately', label: 'Immediately' },
              { value: '1-3 months', label: '1-3 months' },
              { value: '3-6 months', label: '3-6 months' },
              { value: '6-12 months', label: '6-12 months' },
              { value: 'Just exploring', label: 'Just exploring' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Profession"
            value={profession}
            onChange={e => { setProfession(e.target.value); markAssignmentDirty(); }}
            placeholder="e.g. Software Engineer"
          />
          <div>
            <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Interest</label>
            <div className="flex flex-wrap gap-1.5">
              {INTEREST_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleInterest(opt)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                    interests.includes(opt)
                      ? 'bg-mn-h2/15 border-mn-h2/40 text-mn-h2'
                      : 'bg-mn-input-bg border-mn-input-border text-mn-text-muted hover:border-mn-input-focus'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* BHK + Variant — shown conditionally based on selected interests */}
        {(showBhkField || showVariantField) && (
          <div className="grid grid-cols-2 gap-4">
            {showBhkField && (
              <Select
                label="BHK"
                value={String(bhk)}
                onChange={e => { setBhk(Number(e.target.value)); markAssignmentDirty(); }}
                placeholder="Select BHK"
                options={[
                  { value: '0', label: 'Any BHK' },
                  ...BHK_OPTIONS.map(b => ({ value: String(b), label: `${b} BHK` })),
                ]}
              />
            )}
            {showVariantField && (
              <Select
                label="House Variant"
                value={houseVariant}
                onChange={e => { setHouseVariant(e.target.value); markAssignmentDirty(); }}
                placeholder="Select variant"
                options={[
                  { value: '', label: 'Any Variant' },
                  ...HOUSE_VARIANTS.map(v => ({ value: v, label: v })),
                ]}
              />
            )}
          </div>
        )}
        <div>
          <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Notes</label>
          <textarea
            value={note}
            onChange={e => { setNote(e.target.value); markAssignmentDirty(); }}
            rows={3}
            placeholder="Any notes from the conversation..."
            className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus resize-none"
          />
        </div>
        {assignmentPrepared && assignmentPreview && (
          <div className={`rounded-xl border p-3 ${
            assignmentPreview.assigneeUid
              ? 'border-mn-success/35 bg-mn-success/10'
              : 'border-mn-warning/40 bg-mn-warning/10'
          }`}>
            <div className="flex items-start gap-2">
              <PhoneForwarded className={`mt-0.5 h-4 w-4 flex-shrink-0 ${assignmentPreview.assigneeUid ? 'text-mn-success' : 'text-mn-warning'}`} />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wider text-mn-h3">Assignment before save</p>
                <p className="mt-1 text-sm font-bold text-mn-text">
                  {assignmentPreview.assigneeUid
                    ? `Assign to ${assignmentPreview.assigneeName || assignmentPreview.assigneeUid}`
                    : 'Save unassigned'}
                </p>
                <p className="mt-0.5 text-xs text-mn-text-muted">{assignmentPreview.reason}</p>
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => { onClose(); resetForm(); }}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={savingLead}>
            {savingLead
              ? (assignmentPrepared ? 'Saving...' : 'Checking Assignment...')
              : (assignmentPrepared ? 'Confirm & Save Lead' : 'Review Assignment')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ==================== CSV IMPORT MODAL ==================== */
// Parser + transform live in lib/utils/csvImport.ts so they're testable.

function ImportCSVModal({ open, onClose, userName, existingLeads, getAuthToken }: { open: boolean; onClose: () => void; userName: string; existingLeads: Lead[]; getAuthToken?: () => Promise<string | null> }) {
  const { showToast } = useToast();
  const { crmUser } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CSVRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; duplicates: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewDuplicateMap = useMemo(() => {
    const seenKeys = new Map<string, number>();
    return preview.map((row, index) => {
      if (!isValidRow(row)) return null;
      const leadData = normalizeLead(row, { role: crmUser?.role, uid: crmUser?.uid });
      const existingDuplicate = findDuplicateLeads(leadData.raw_data, existingLeads).find(candidate => candidate.strength === 'exact');
      const keys = [
        ...leadData.duplicate_keys.phones.map(phoneKey => `phone:${phoneKey}`),
        ...(leadData.duplicate_keys.email ? [`email:${leadData.duplicate_keys.email}`] : []),
      ];
      const duplicateRow = keys
        .map(key => seenKeys.get(key))
        .find((rowIndex): rowIndex is number => rowIndex !== undefined);
      keys.forEach(key => {
        if (!seenKeys.has(key)) seenKeys.set(key, index);
      });
      if (existingDuplicate) return describeDuplicateCandidate(existingDuplicate);
      if (duplicateRow !== undefined) return `duplicate of CSV row ${duplicateRow + 1}`;
      return null;
    });
  }, [crmUser?.role, crmUser?.uid, existingLeads, preview]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setPreview(rows);
    };
    reader.readAsText(selected);
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    setImporting(true);
    let success = 0;
    let failed = 0;
    let duplicates = 0;
    const importKeys = new Set<string>();

    for (const row of preview) {
      if (!isValidRow(row)) {
        failed++;
        continue;
      }
      const leadData = normalizeLead(row, { role: crmUser?.role, uid: crmUser?.uid });
      const keys = [
        ...leadData.duplicate_keys.phones.map(phoneKey => `phone:${phoneKey}`),
        ...(leadData.duplicate_keys.email ? [`email:${leadData.duplicate_keys.email}`] : []),
      ];
      const duplicate = findDuplicateLeads(leadData.raw_data, existingLeads).some(candidate => candidate.strength === 'exact')
        || keys.some(key => importKeys.has(key));
      if (duplicate) {
        duplicates++;
        continue;
      }
      try {
        const selfAssignment = crmUser?.role === 'channel_partner' && crmUser.uid
          ? {
              assigneeUid: crmUser.uid,
              assigneeName: crmUser.name || crmUser.email || crmUser.uid,
              reason: 'Channel partner CSV leads stay assigned to the partner.',
            }
          : crmUser?.role === 'sales_exec' && crmUser.uid
            ? {
                assigneeUid: crmUser.uid,
                assigneeName: crmUser.name || crmUser.email || crmUser.uid,
                reason: 'Sales executive CSV leads stay assigned to the creator.',
              }
            : null;
        const assignment = selfAssignment || await resolveLeadAssignment(getAuthToken, leadData.source, leadData.raw_data, true);
        await addDoc(collection(db, 'leads'), {
          ...leadData,
          ...(assignment?.assigneeUid ? {
            assigned_to: assignment.assigneeUid,
            activity_log: [
              buildAssignmentEntry(assignment.assigneeUid, assignment.assigneeName, assignment.reason, userName || crmUser?.name || 'System'),
            ],
          } : {}),
        });
        keys.forEach(key => importKeys.add(key));
        success++;
      } catch {
        failed++;
      }
    }

    setImportResult({ success, failed, duplicates });
    setImporting(false);
    if (success > 0) {
      showToast('success', `${success} lead${success > 1 ? 's' : ''} imported successfully!`);
    }
    if (failed > 0) {
      showToast('error', `${failed} row${failed > 1 ? 's' : ''} failed to import.`);
    }
    if (duplicates > 0) {
      showToast('error', `${duplicates} duplicate row${duplicates > 1 ? 's were' : ' was'} skipped.`);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview([]);
    setImportResult(null);
    onClose();
  };

  if (!open) return null;

  return (
    <Modal open onClose={handleClose} title="Import Leads from CSV" maxWidth="max-w-3xl">
      <div className="space-y-4">
        {/* Instructions */}
        <div className="p-4 bg-mn-surface border border-mn-border/30 rounded-xl">
          <h4 className="text-sm font-black text-mn-h1 flex items-center gap-2 mb-2">
            <FileSpreadsheet className="w-4 h-4" />
            CSV Format
          </h4>
          <p className="text-xs text-mn-text-muted mb-2">
            Your CSV should have a header row. The following column names are recognized (case-insensitive):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {['name / lead_name / full_name', 'phone / mobile', 'email', 'budget', 'timeline / plan_to_buy', 'profession', 'location', 'note / notes', 'interest', 'source'].map(col => (
              <span key={col} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-mn-h2/10 text-mn-h2">
                {col}
              </span>
            ))}
          </div>
        </div>

        {/* File picker */}
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="secondary"
            icon={<Upload className="w-4 h-4" />}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? 'Change File' : 'Choose CSV File'}
          </Button>
          {file && (
            <span className="text-sm text-mn-text">
              {file.name} <span className="text-mn-text-muted">({preview.length} rows)</span>
            </span>
          )}
        </div>

        {/* Preview table */}
        {preview.length > 0 && (
          <div className="border border-mn-border/30 rounded-xl overflow-hidden">
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-mn-surface sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">#</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Name</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Phone</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Email</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Budget</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Location</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Interest</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Duplicate</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, idx) => {
                    const name = getLeadName(row);
                    const phone = getPhone(row);
                    const invalid = name === 'Unknown' && phone === 'N/A';
                    const duplicateLabel = previewDuplicateMap[idx];
                    return (
                      <tr key={idx} className={`border-t border-mn-border/20 ${invalid ? 'bg-mn-danger/5' : duplicateLabel ? 'bg-mn-warning/10' : ''}`}>
                        <td className="px-3 py-2 text-mn-text-muted">{idx + 1}</td>
                        <td className="px-3 py-2 text-mn-text font-bold">
                          {invalid && <AlertTriangle className="w-3 h-3 text-mn-danger inline mr-1" />}
                          {name}
                        </td>
                        <td className="px-3 py-2 text-mn-text">{phone}</td>
                        <td className="px-3 py-2 text-mn-text-muted">{getEmail(row)}</td>
                        <td className="px-3 py-2 text-mn-text">{row.budget || '—'}</td>
                        <td className="px-3 py-2 text-mn-text">{row.location || '—'}</td>
                        <td className="px-3 py-2 text-mn-text">{row.interest || '—'}</td>
                        <td className="px-3 py-2 text-mn-text-muted">
                          {duplicateLabel ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-mn-warning/15 px-2 py-0.5 text-[10px] font-bold text-mn-warning">
                              <AlertTriangle className="h-3 w-3" />
                              {duplicateLabel}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import result */}
        {importResult && (
          <div className="p-3 rounded-xl bg-mn-surface border border-mn-border/30 text-sm">
            <span className="text-mn-success font-bold">{importResult.success} imported</span>
            {importResult.failed > 0 && (
              <span className="text-mn-danger font-bold ml-3">{importResult.failed} failed</span>
            )}
            {importResult.duplicates > 0 && (
              <span className="text-mn-warning font-bold ml-3">{importResult.duplicates} duplicates skipped</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2 border-t border-mn-border/30">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
            {importResult ? 'Done' : 'Cancel'}
          </Button>
          {!importResult && (
            <Button
              type="button"
              className="flex-1"
              icon={<Upload className="w-4 h-4" />}
              disabled={importing || preview.length === 0}
              onClick={handleImport}
            >
              {importing ? `Importing... (${preview.length} leads)` : `Import ${preview.length} Lead${preview.length !== 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ==================== LEAD DETAIL / EDIT MODAL ==================== */
const INTEREST_OPTIONS = [
  'Plotted Land', 'Villa', 'Apartment', 'Individual House', 'Commercial Building', 'Commercial Land',
  'Managed Farmland', 'Agricultural Land', 'Industrial Building', 'Industrial Land',
];

const BHK_PROPERTY_TYPES = ['Apartment', 'Villa', 'Individual House'];
const HOUSE_VARIANTS = ['Simplex', 'Duplex', 'Triplex', 'Quadraplex'];
const BHK_OPTIONS = [1, 2, 3, 4, 5, 6];
const THRESHOLD_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
const OBJECTION_OPTIONS: LeadObjection[] = ['price', 'location', 'legal', 'family_decision', 'loan_payment', 'comparison', 'timing'];

const STATUS_OPTIONS = [
  'New', 'First Call', 'Nurturing', 'Property Matched', 'Site Visit', 'Booked', 'Closed', 'Rejected',
];

type DetailTab = 'details' | 'activity' | 'visits';

function LeadDetailModal({ lead, onClose, isAdmin = false, canDeleteLead = false, userName = 'Admin', userUid = '', inventory = [], projects: allProjectsList = [], globalThresholdPercent = 0, existingLeads = [], assignableUsers = [], assigneeNameByUid = {}, getAuthToken }: { lead: Lead; onClose: () => void; isAdmin?: boolean; canDeleteLead?: boolean; userName?: string; userUid?: string; inventory?: InventoryUnit[]; projects?: Project[]; globalThresholdPercent?: number; existingLeads?: Lead[]; assignableUsers?: CRMUser[]; assigneeNameByUid?: Record<string, string>; getAuthToken?: () => Promise<string | null> }) {
  const { showToast } = useToast();
  const { crmUser } = useAuth();
  const raw = lead.raw_data;
  const isChannelPartnerSelfLead = crmUser?.role === 'channel_partner' && lead.owner_uid === crmUser.uid;
  const canSelfAssignChannelPartner = Boolean(isChannelPartnerSelfLead && (!lead.assigned_to || lead.assigned_to === crmUser?.uid));
  const canSelfAssignSalesExec = Boolean(crmUser?.role === 'sales_exec' && !lead.assigned_to && !isChannelPartnerLead(lead));
  const canEditAssignee = isAdmin || canSelfAssignChannelPartner || canSelfAssignSalesExec;
  const initialAssignedTo = canSelfAssignChannelPartner ? (lead.assigned_to || crmUser?.uid || '') : (lead.assigned_to || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergingLead, setMergingLead] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('details');

  // Editable fields
  const [status, setStatus] = useState(lead.status);
  const [assignedTo, setAssignedTo] = useState(initialAssignedTo);
  const [name, setName] = useState(raw.lead_name);
  const [phone, setPhone] = useState(raw.phone);
  const [email, setEmail] = useState(raw.email);
  const [budget, setBudget] = useState(String(raw.budget || ''));
  const [planToBuy, setPlanToBuy] = useState(raw.plan_to_buy);
  const [profession, setProfession] = useState(raw.profession);
  const [location, setLocation] = useState(raw.location);
  const [interests, setInterests] = useState<string[]>(resolveInterests(raw));
  const [bhk, setBhk] = useState<number>(raw.bhk || 0);
  const [houseVariant, setHouseVariant] = useState(raw.house_variant || '');
  const [matchThreshold, setMatchThreshold] = useState<number>(lead.match_threshold || 0); // 0 = use global
  const [objections, setObjections] = useState<LeadObjection[]>(lead.objections || []);
  const [governanceNote, setGovernanceNote] = useState('');
  const [governanceReasonCategory, setGovernanceReasonCategory] = useState<StageMoveReasonCategory | ''>('');
  const [showMatchDiagnosis, setShowMatchDiagnosis] = useState(false);

  const toggleInterest = (opt: string) => {
    setInterests(prev => prev.includes(opt) ? prev.filter(i => i !== opt) : [...prev, opt]);
  };

  const showBhkField = interests.some(i => BHK_PROPERTY_TYPES.includes(i));
  const showVariantField = interests.includes('Individual House');
  const toggleObjection = (objection: LeadObjection) => {
    setObjections(prev => prev.includes(objection) ? prev.filter(item => item !== objection) : [...prev, objection]);
  };

  useEffect(() => {
    setObjections(lead.objections || []);
  }, [lead.id, lead.objections]);

  useEffect(() => {
    setGovernanceNote('');
    setGovernanceReasonCategory('');
  }, [lead.id, status]);

  // Activity log
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Site visit
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [visitLocation, setVisitLocation] = useState('');
  const [visitNotes, setVisitNotes] = useState('');
  const [schedulingVisit, setSchedulingVisit] = useState(false);
  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);
  const [deleteVisitNotes, setDeleteVisitNotes] = useState('');
  const [deletingVisit, setDeletingVisit] = useState(false);

  // Callback request
  const [showCallbackForm, setShowCallbackForm] = useState(false);
  const [callbackDate, setCallbackDate] = useState('');
  const [callbackNotes, setCallbackNotes] = useState('');
  const [schedulingCallback, setSchedulingCallback] = useState(false);

  // Interested properties
  const [interestedProperties, setInterestedProperties] = useState<InterestedProperty[]>(lead.interested_properties || []);
  const [sendingPropertyDetails, setSendingPropertyDetails] = useState(false);

  // Booked unit (only set when lead is in Booked lane)
  const [bookedUnit, setBookedUnit] = useState<BookedUnit | null>(lead.booked_unit ?? null);
  const [pickerProjectId, setPickerProjectId] = useState<string>('');
  const [availableUnits, setAvailableUnits] = useState<InventoryUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [savingBooking, setSavingBooking] = useState(false);

  // Notes Polish (Gemini)
  const [polishing, setPolishing] = useState(false);

  const mergeCandidates = useMemo(() => {
    const detected = findDuplicateLeads(raw, existingLeads, { excludeLeadId: lead.id });
    const detectedIds = new Set(detected.map(candidate => candidate.lead.id));
    const manualOptions = existingLeads
      .filter(item => item.id !== lead.id && !detectedIds.has(item.id))
      .slice(0, 20)
      .map(item => ({ lead: item, strength: 'likely' as const, reasons: ['manual merge option'] }));
    return [...detected, ...manualOptions];
  }, [existingLeads, lead.id, raw]);

  const selectedMergeCandidate = mergeCandidates.find(candidate => candidate.lead.id === mergeTargetId) || null;

  // Hover tooltip for tagged properties
  const [hoveredProp, setHoveredProp] = useState<{ projectId: string; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<number | null>(null);

  // Archive lead (admin only). The server keeps the history for audit/reporting
  // and releases any active booked unit transactionally.
  const handleDeleteLead = async () => {
    if (!canDeleteLead) {
      showToast('error', 'Your role does not have permission to archive leads.');
      return;
    }
    setDeleting(true);
    try {
      const token = await getAuthToken?.();
      if (!token) {
        showToast('error', 'Sign in again before archiving this lead.');
        return;
      }
      const response = await fetch('/api/leads/lifecycle', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'archive',
          leadId: lead.id,
          reason: 'Archived from Lead Detail.',
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; releasedUnitId?: string | null };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to archive lead.');
      }
      showToast('success', `Lead "${raw.lead_name}" archived${data.releasedUnitId ? ' and booked unit released' : ''}.`);
      onClose();
    } catch (err) {
      console.error(err);
      showToast('error', `Failed to archive lead: ${(err as Error)?.message || 'permission or connection error'}`);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleMergeLead = async () => {
    if (!selectedMergeCandidate) {
      showToast('error', 'Select a duplicate lead to merge.');
      return;
    }
    setMergingLead(true);
    try {
      const duplicate = selectedMergeCandidate.lead;
      const token = await getAuthToken?.();
      if (!token) {
        showToast('error', 'Sign in again before merging leads.');
        return;
      }
      const response = await fetch('/api/leads/lifecycle', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'merge',
          primaryLeadId: lead.id,
          duplicateLeadId: duplicate.id,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to merge duplicate lead.');
      }

      showToast('success', `Merged "${duplicate.raw_data.lead_name}" into "${raw.lead_name}".`);
      setMergeTargetId('');
      onClose();
    } catch (err) {
      console.error(err);
      showToast('error', (err as Error).message || 'Failed to merge duplicate lead.');
    } finally {
      setMergingLead(false);
    }
  };

  // Schedule callback
  const handleScheduleCallback = async () => {
    if (!callbackDate) { showToast('error', 'Select a date and time for the callback.'); return; }
    setSchedulingCallback(true);
    const callback: CallbackRequest = {
      id: `cb_${Date.now()}`,
      scheduled_at: new Date(callbackDate).toISOString(),
      notes: callbackNotes,
      created_at: new Date().toISOString(),
      created_by: userName,
      assigned_to: userUid,
      status: 'pending',
    };
    const logEntry: ActivityLogEntry = {
      id: `cb_log_${Date.now()}`,
      type: 'callback_scheduled',
      text: `Callback scheduled for ${new Date(callbackDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}${callbackNotes ? ` — ${callbackNotes}` : ''}`,
      author: userName,
      created_at: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        callback_requests: arrayUnion(callback),
        activity_log: arrayUnion(logEntry),
      });
      setShowCallbackForm(false);
      setCallbackDate('');
      setCallbackNotes('');
      showToast('success', 'Callback scheduled! You will be alerted when it is time.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to schedule callback.');
    } finally {
      setSchedulingCallback(false);
    }
  };

  // Load Available units for a given project when the picker chooses it.
  // Query filters to status == 'Available' — the hard block that makes double-booking impossible.
  useEffect(() => {
    if (!pickerProjectId) { setAvailableUnits([]); return; }
    let cancelled = false;
    setLoadingUnits(true);
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'inventory'),
          where('projectId', '==', pickerProjectId),
          where('status', '==', 'Available'),
        ));
        if (cancelled) return;
        const units = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InventoryUnit, 'id'>) }));
        setAvailableUnits(units);
      } catch (err) {
        console.error('Failed to load units:', err);
        if (!cancelled) setAvailableUnits([]);
      } finally {
        if (!cancelled) setLoadingUnits(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pickerProjectId]);

  // Commit the booking through the server so lead and inventory changes stay transactional.
  const handleBookUnit = async (unit: InventoryUnit) => {
    if (!isAdmin) {
      showToast('error', 'Booking a unit requires Admin or Super Admin access.');
      return;
    }
    setSavingBooking(true);
    try {
      const token = await getAuthToken?.();
      if (!token) {
        showToast('error', 'Sign in again before booking a unit.');
        return;
      }
      const response = await fetch('/api/leads/booking', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'book',
          leadId: lead.id,
          unitId: unit.id,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; bookedUnit?: BookedUnit };
      if (!response.ok || !data.bookedUnit) {
        throw new Error(data.error || 'Failed to book unit.');
      }
      setBookedUnit(data.bookedUnit);
      setStatus('Booked');
      setPickerProjectId('');
      showToast('success', `Booked ${data.bookedUnit.projectName} - Unit ${data.bookedUnit.unitLabel}`);
    } catch (err) {
      console.error('Failed to book unit:', err);
      showToast('error', (err as Error).message || 'Failed to book unit. Check connection.');
    } finally {
      setSavingBooking(false);
    }
  };

  // Release the held unit — moves the lead back to 'Site Visit' lane and frees the inventory unit.
  const handleUnbookUnit = async () => {
    if (!bookedUnit) return;
    if (!isAdmin) {
      showToast('error', 'Releasing a booked unit requires Admin or Super Admin access.');
      return;
    }
    setSavingBooking(true);
    try {
      const token = await getAuthToken?.();
      if (!token) {
        showToast('error', 'Sign in again before releasing a booked unit.');
        return;
      }
      const response = await fetch('/api/leads/booking', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'release',
          leadId: lead.id,
          unitId: bookedUnit.unitId,
          newStatus: 'Site Visit',
          note: 'Released from lead detail.',
          reasonCategory: 'other',
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; status?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to release unit.');
      }
      setBookedUnit(null);
      setStatus(data.status || 'Site Visit');
      showToast('success', 'Unit released. Lead moved back to Site Visit.');
    } catch (err) {
      console.error('Failed to unbook unit:', err);
      showToast('error', (err as Error).message || 'Failed to release unit.');
    } finally {
      setSavingBooking(false);
    }
  };

  // Tag a property to this lead
  const handleTagProperty = async (property: InterestedProperty) => {
    const taggedProperty = { ...property, tagged_by: userName };
    const updated = [...interestedProperties, taggedProperty];
    setInterestedProperties(updated);
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        interested_properties: updated,
      });
      showToast('success', `${property.projectName} tagged.`);
    } catch (err) {
      console.error(err);
      setInterestedProperties(interestedProperties); // rollback
      showToast('error', 'Failed to tag property.');
    }
  };

  // Un-dismiss a previously dismissed project so auto-matching can reconsider it.
  const handleUndismissProject = async (projectId: string) => {
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        dismissed_matches: arrayRemove(projectId),
      });
      showToast('success', 'Project restored to auto-matching.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to restore project.');
    }
  };

  // Remove a tagged property — if it was auto-matched, add to dismissed_matches
  const handleRemoveProperty = async (projectId: string) => {
    const removedProp = interestedProperties.find(p => p.projectId === projectId);
    const updated = interestedProperties.filter(p => p.projectId !== projectId);
    setInterestedProperties(updated);
    try {
      const updateData: LeadPropertyRemovalUpdate = { interested_properties: updated };
      // If removing an auto-matched property, add to dismissed_matches so it won't re-appear
      if (removedProp?.tagged_by === 'system-match') {
        updateData.dismissed_matches = arrayUnion(projectId);
      }
      await updateDoc(doc(db, 'leads', lead.id), updateData);
      showToast('success', 'Property removed.');
    } catch (err) {
      console.error(err);
      setInterestedProperties(interestedProperties); // rollback
      showToast('error', 'Failed to remove property.');
    }
  };

  // Send property details via WhatsApp — fetches full project data for rich message
  const handleSendPropertyDetails = async () => {
    if (interestedProperties.length === 0) {
      showToast('error', 'No properties tagged. Tag at least one property first.');
      return;
    }
    setSendingPropertyDetails(true);
    try {
      const authToken = await getAuthToken?.();
      if (!authToken) {
        showToast('error', 'Sign in again before sending WhatsApp messages.');
        setSendingPropertyDetails(false);
        return;
      }

      // Clean phone number
      let toPhone = raw.phone.replace(/[\s\-()]/g, '');
      if (toPhone.startsWith('+')) toPhone = toPhone.slice(1);
      if (!toPhone.startsWith('91') && toPhone.length === 10) toPhone = '91' + toPhone;

      // Fetch full project details for each tagged property
      const projectDetails: { prop: InterestedProperty; project: PropertyDetailsProject | null }[] = [];
      for (const prop of interestedProperties) {
        try {
          const projectSnap = await getDoc(doc(db, 'projects', prop.projectId));
          projectDetails.push({ prop, project: projectSnap.exists() ? projectSnap.data() as PropertyDetailsProject : null });
        } catch {
          projectDetails.push({ prop, project: null });
        }
      }

      // Build rich formatted message with full property details
      const propertyLines = projectDetails.map(({ prop, project }, i) => {
        let line = `*${i + 1}. ${prop.projectName}*`;
        line += `\n📍 Location: ${prop.location}`;
        line += `\n🏠 Type: ${prop.propertyType}`;
        if (prop.bestPrice && prop.bestPrice > 0) {
          line += `\n💰 Starting from: ₹${prop.bestPrice.toLocaleString('en-IN')}`;
        }
        if (prop.matchedUnitCount && prop.matchedUnitCount > 0) {
          line += `\n📦 ${prop.matchedUnitCount} unit${prop.matchedUnitCount > 1 ? 's' : ''} available`;
        }
        if (project) {
          if (project.status) line += `\n📋 Status: ${project.status}`;
          // Include project-level fields (RERA, amenities, etc.)
          if (project.project_fields) {
            const fields = project.project_fields;
            if (fields.rera_approved) line += `\n✅ RERA Approved`;
            if (fields.gated_community) line += `\n🔒 Gated Community`;
            if (fields.amenities) line += `\n🏊 Amenities: ${fields.amenities}`;
            if (fields.water_source) line += `\n💧 Water: ${fields.water_source}`;
            if (fields.power_backup) line += `\n⚡ Power Backup: ${fields.power_backup}`;
            if (fields.khata_type) line += `\n📄 Khata: ${fields.khata_type}`;
            if (fields.road_type) line += `\n🛣️ Road: ${fields.road_type}`;
            if (fields.parking_type) line += `\n🅿️ Parking: ${fields.parking_type}`;
          }
        }
        return line;
      }).join('\n\n———————————\n\n');

      const messageBody = `Hello ${raw.lead_name}! 👋\n\nThank you for your interest in real estate. Here are the property details curated for you:\n\n${propertyLines}\n\n———————————\n\nWe'd love to help you find your dream property! Feel free to reach out for more details, floor plans, or to schedule a site visit.\n\n📞 Call us anytime\n🏠 Visit us for a personal tour\n\n_— Elite Build Infra Tech_`;

      // Send the text message first
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          to: toPhone,
          type: 'text',
          leadId: lead.id,
          text: { body: messageBody },
        }),
      });

      // Send ALL images (hero + gallery) for each property
      for (const { prop, project } of projectDetails) {
        const images: string[] = [];
        if (prop.heroImage) images.push(prop.heroImage);
        if (project?.gallery) images.push(...project.gallery);

        // Send up to 5 images per property to avoid spam
        for (const imgUrl of images.slice(0, 5)) {
          try {
            await fetch('/api/whatsapp/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                to: toPhone,
                type: 'image',
                leadId: lead.id,
                image: {
                  link: imgUrl,
                  caption: images.indexOf(imgUrl) === 0
                    ? `📸 ${prop.projectName} — ${prop.location}`
                    : `${prop.projectName}`,
                },
              }),
            });
          } catch (imgErr) {
            console.error('Failed to send image:', imgErr);
          }
        }
      }

      if (response.ok) {
        // Log to activity
        const propertyNames = interestedProperties.map(p => p.projectName).join(', ');
        const logEntry: ActivityLogEntry = {
          id: `prop_wa_${Date.now()}`,
          type: 'property_details_sent',
          text: `Property details sent via WhatsApp: ${propertyNames}`,
          author: userName,
          created_at: new Date().toISOString(),
        };
        await updateDoc(doc(db, 'leads', lead.id), {
          activity_log: arrayUnion(logEntry),
        });
        showToast('success', 'Property details sent via WhatsApp!');
      } else {
        const data = await response.json().catch(() => null);
        showToast('error', data?.error || 'Failed to send WhatsApp message. Check server config.');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to send property details.');
    } finally {
      setSendingPropertyDetails(false);
    }
  };

  // Compute first contact date from activity log
  const firstContactDate = useMemo(() => {
    const contactTypes: string[] = ['call', 'note', 'whatsapp_sent'];
    const contactEntries = (lead.activity_log || [])
      .filter(e => contactTypes.includes(e.type))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return contactEntries.length > 0 ? contactEntries[0].created_at : null;
  }, [lead.activity_log]);

  const handleSave = async () => {
    if (!isAdmin && status !== lead.status && (status === 'Booked' || lead.status === 'Booked')) {
      showToast('error', 'Booked lead stage changes require Admin or Super Admin access.');
      return;
    }
    // Block saving status=Booked without a unit selection — protects against the
    // double-booking scenario when the user changes status via the dropdown.
    if (status === 'Booked' && !bookedUnit) {
      showToast('error', 'Select a booked unit before saving with status "Booked".');
      return;
    }
    if (governanceRequirement && !governanceNote.trim()) {
      showToast('error', `${governanceRequirement.label} is required for this status change.`);
      return;
    }
    if (governanceRequirement && !governanceReasonCategory) {
      showToast('error', 'Select a reason category for this status change.');
      return;
    }
    if (canSelfAssignChannelPartner && assignedTo !== crmUser?.uid) {
      showToast('error', 'Channel Partner leads must stay assigned to the partner.');
      return;
    }
    if (canSelfAssignSalesExec && assignedTo && assignedTo !== crmUser?.uid) {
      showToast('error', 'Sales Executives can only assign an unassigned lead to themselves.');
      return;
    }
    setSaving(true);
    try {
      const rawData = {
        ...raw,
        lead_name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || 'N/A',
        budget: Number(budget) || 0,
        plan_to_buy: planToBuy,
        profession: profession,
        location: location,
        interest: interests[0] || raw.interest || 'General Query',
        interests: interests,
        ...(bhk > 0 ? { bhk } : { bhk: 0 }),
        ...(houseVariant ? { house_variant: houseVariant } : {}),
      };
      const assigneeEditable = isAdmin || canSelfAssignChannelPartner || canSelfAssignSalesExec;
      const reassigned = assigneeEditable && assignedTo !== (lead.assigned_to || '');
      const previousObjections = lead.objections || [];
      const objectionsChanged = previousObjections.slice().sort().join('|') !== objections.slice().sort().join('|');
      const selectedAssigneeName = assignedTo ? assigneeNameByUid[assignedTo] || assignedTo : 'Unassigned';
      const activityEntries: ActivityLogEntry[] = [];
      const bookedStatusTransition = isAdmin && lead.status === 'Booked' && status !== lead.status;
      const bookedStatusToken = bookedStatusTransition ? await getAuthToken?.() : null;
      if (bookedStatusTransition && !bookedStatusToken) {
        throw new Error('Sign in again before changing a booked lead.');
      }
      const updateData: Record<string, unknown> = {
        raw_data: rawData,
        duplicate_keys: buildDuplicateKeys(rawData),
        interested_properties: interestedProperties,
        objections,
        ...(matchThreshold > 0 ? { match_threshold: matchThreshold } : { match_threshold: null }),
      };
      if (!bookedStatusTransition) {
        updateData.status = status;
      }
      if (isAdmin) {
        updateData.assigned_to = assignedTo || null;
      } else if (canSelfAssignChannelPartner && assignedTo === crmUser?.uid && assignedTo !== (lead.assigned_to || '')) {
        updateData.assigned_to = assignedTo;
      } else if (canSelfAssignSalesExec && assignedTo === crmUser?.uid && !lead.assigned_to) {
        updateData.assigned_to = assignedTo;
      }
      if (reassigned) {
        activityEntries.push({
          id: `assign_manual_${Date.now()}`,
          type: 'lead_assigned',
          text: assignedTo ? `Lead reassigned to ${selectedAssigneeName}.` : 'Lead unassigned.',
          author: userName,
          created_at: new Date().toISOString(),
          ...(assignedTo ? { assigned_to: assignedTo } : {}),
        });
      }
      if (status !== lead.status && !bookedStatusTransition) {
        activityEntries.push(buildStageMoveLog(lead, status, userName, governanceNote, governanceReasonCategory));
        updateData.lane_moved_at = serverTimestamp();
      }
      if (objectionsChanged) {
        const labels = objections.map(item => LEAD_OBJECTION_LABELS[item]).join(', ') || 'None';
        activityEntries.push({
          id: `objection_${Date.now()}`,
          type: 'objection_updated',
          text: `Buyer objections updated: ${labels}.`,
          author: userName,
          created_at: new Date().toISOString(),
        });
      }
      if (activityEntries.length > 0) {
        updateData.activity_log = arrayUnion(...activityEntries);
      }
      await updateDoc(doc(db, 'leads', lead.id), updateData);
      if (reassigned) {
        try {
          const syncToken = await getAuthToken?.();
          if (syncToken) {
            await fetch('/api/whatsapp/sync-lead', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${syncToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ leadId: lead.id }),
            });
          }
        } catch (syncErr) {
          console.warn('Failed to sync WhatsApp conversation access:', syncErr);
        }
      }
      if (bookedStatusTransition) {
        const response = await fetch('/api/leads/booking', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bookedStatusToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'move_booked',
            leadId: lead.id,
            unitId: bookedUnit?.unitId,
            newStatus: status,
            note: governanceNote,
            reasonCategory: governanceReasonCategory,
          }),
        });
        const data = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error || 'Failed to update booked lead.');
        }
      }
      showToast('success', `Lead "${name}" updated!`);
      onClose();

      // Geocode location in background (fire-and-forget) if location changed
      if (location !== raw.location || !lead.raw_data.geo) {
        geocodeAddress(location).then(geo => {
          if (geo) {
            updateDoc(doc(db, 'leads', lead.id), { 'raw_data.geo': geo }).catch(() => {});
          }
        });
      }
    } catch (err) {
      console.error(err);
      showToast('error', (err as Error).message || 'Failed to update lead.');
    } finally {
      setSaving(false);
    }
  };

  const handlePolishNote = async () => {
    const text = newNote.trim();
    if (!text) return;
    setPolishing(true);
    try {
      const authToken = await getAuthToken?.();
      if (!authToken) {
        showToast('error', 'Sign in again before polishing notes.');
        return;
      }
      const res = await fetch('/api/polish-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error || 'Failed to polish note.');
        return;
      }
      if (typeof data.polished === 'string' && data.polished) {
        setNewNote(data.polished);
        showToast('success', 'Note polished. Review before adding.');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to polish note.');
    } finally {
      setPolishing(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    const entry: ActivityLogEntry = {
      id: `note_${Date.now()}`,
      type: 'note',
      text: newNote.trim(),
      author: userName,
      created_at: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        activity_log: arrayUnion(entry),
      });
      setNewNote('');
      showToast('success', 'Note added.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to add note.');
    } finally {
      setAddingNote(false);
    }
  };

  const handleScheduleVisit = async () => {
    if (!visitDate) { showToast('error', 'Select a date and time.'); return; }
    setSchedulingVisit(true);
    const visit: SiteVisit = {
      id: `visit_${Date.now()}`,
      scheduled_at: new Date(visitDate).toISOString(),
      location: visitLocation || raw.location || 'TBD',
      notes: visitNotes,
      created_at: new Date().toISOString(),
      reminder_on_agreement: false,
      reminder_day_before: false,
      reminder_morning_of: false,
      status: 'scheduled',
    };
    const logEntry: ActivityLogEntry = {
      id: `sv_${Date.now()}`,
      type: 'site_visit_scheduled',
      text: `Site visit scheduled for ${new Date(visitDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} at ${visit.location}`,
      author: userName,
      created_at: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        site_visits: arrayUnion(visit),
        activity_log: arrayUnion(logEntry),
      });
      // Send WhatsApp confirmation
      sendWhatsAppConfirmation(lead, visit, getAuthToken);
      setShowVisitForm(false);
      setVisitDate('');
      setVisitLocation('');
      setVisitNotes('');
      showToast('success', 'Site visit scheduled! WhatsApp confirmation will be sent.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to schedule visit.');
    } finally {
      setSchedulingVisit(false);
    }
  };

  const handleDeleteVisit = async (visitId: string) => {
    if (!deleteVisitNotes.trim()) {
      showToast('error', 'Please add notes explaining why this visit is being cancelled.');
      return;
    }
    setDeletingVisit(true);
    try {
      const updatedVisits = (lead.site_visits || []).filter(v => v.id !== visitId);
      const deletedVisit = (lead.site_visits || []).find(v => v.id === visitId);
      const logEntry: ActivityLogEntry = {
        id: `sv_del_${Date.now()}`,
        type: 'site_visit_cancelled',
        text: `Site visit cancelled${deletedVisit ? ` (was scheduled for ${new Date(deletedVisit.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} at ${deletedVisit.location})` : ''}. Reason: ${deleteVisitNotes.trim()}`,
        author: userName,
        created_at: new Date().toISOString(),
      };
      await updateDoc(doc(db, 'leads', lead.id), {
        site_visits: updatedVisits,
        activity_log: arrayUnion(logEntry),
      });
      setDeletingVisitId(null);
      setDeleteVisitNotes('');
      showToast('success', 'Site visit cancelled and removed.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to delete site visit.');
    } finally {
      setDeletingVisit(false);
    }
  };

  // Merge old note (from raw_data.note) with activity_log
  const allActivity = useMemo(() => {
    const entries: ActivityLogEntry[] = [...(lead.activity_log || [])];
    // If there's an old-style note and no activity log entries, show it as the first entry
    if (raw.note && raw.note !== 'Walk-in customer' && raw.note !== 'No note provided' && entries.length === 0) {
      entries.push({
        id: 'legacy_note',
        type: 'note',
        text: raw.note,
        author: lead.source || 'System',
        created_at: lead.created_at?.toDate().toISOString() || new Date().toISOString(),
      });
    }
    return entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [lead.activity_log, raw.note, lead.source, lead.created_at]);

  const siteVisits = useMemo(
    () => (lead.site_visits || []).sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
    [lead.site_visits],
  );
  const governanceRequirement = useMemo(
    () => status !== lead.status ? getRequiredGovernanceNoteForStatusChange(lead.status, status) : null,
    [lead.status, status],
  );
  const dataQualityIssues = useMemo(() => getLeadDataQualityIssues({
    ...lead,
    status,
    assigned_to: assignedTo || null,
    raw_data: {
      ...raw,
      lead_name: name,
      phone,
      email,
      budget: Number(budget) || 0,
      plan_to_buy: planToBuy,
      profession,
      location,
      interest: interests[0] || raw.interest || '',
      interests,
      bhk,
      house_variant: houseVariant,
    },
    interested_properties: interestedProperties,
    booked_unit: bookedUnit,
    objections,
  }), [assignedTo, bhk, bookedUnit, budget, email, houseVariant, interestedProperties, interests, lead, location, name, objections, phone, planToBuy, profession, raw, status]);
  const TABS = [
    { id: 'details' as DetailTab, label: 'Details' },
    { id: 'activity' as DetailTab, label: `Activity (${allActivity.length})` },
    { id: 'visits' as DetailTab, label: `Site Visits (${siteVisits.length})` },
  ];
  const statusOptions = useMemo(() => {
    if (isAdmin || lead.status === 'Booked') return STATUS_OPTIONS;
    return STATUS_OPTIONS.filter(option => option !== 'Booked');
  }, [isAdmin, lead.status]);
  const assigneeOptionsForLead = useMemo(() => {
    const options = new Map<string, string>();
    const addUser = (user: CRMUser) => {
      if (user.active) options.set(user.uid, user.name || user.email || user.uid);
    };

    if (isAdmin) {
      assignableUsers.forEach(addUser);
    } else if ((canSelfAssignChannelPartner || canSelfAssignSalesExec) && crmUser) {
      addUser(crmUser);
    }

    if (lead.assigned_to && !options.has(lead.assigned_to)) {
      options.set(lead.assigned_to, assigneeNameByUid[lead.assigned_to] || lead.assigned_to);
    }

    return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
  }, [assignableUsers, assigneeNameByUid, canSelfAssignChannelPartner, canSelfAssignSalesExec, crmUser, isAdmin, lead.assigned_to]);

  useEffect(() => {
    setAssignedTo(initialAssignedTo);
  }, [initialAssignedTo, lead.id]);

  return (
    <Modal open onClose={onClose} title={`Lead: ${raw.lead_name}`} maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Top bar: Status + AI + Actions */}
        <div className="flex items-center gap-3 pb-4 border-b border-mn-border/30 flex-wrap">
          <div className="w-40">
            <Select
              label="Status"
              value={status}
              onChange={e => setStatus(e.target.value)}
              options={statusOptions.map(s => ({ value: s, label: s }))}
            />
          </div>
          <div className="w-52">
            <Select
              label="Assignee"
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              disabled={!canEditAssignee}
              placeholder="Unassigned"
              options={assigneeOptionsForLead}
            />
          </div>
          {lead.ai_audit && (
            <div className="flex items-center gap-2 pt-5">
              <Badge variant={lead.ai_audit.urgency === 'High' ? 'danger' : lead.ai_audit.urgency === 'Medium' ? 'warning' : 'info'}>
                {lead.ai_audit.urgency}
              </Badge>
              <Badge variant="default">{lead.ai_audit.intent}</Badge>
            </div>
          )}
          {lead.suggested_plot && (
            <div className="flex items-center gap-1.5 pt-5 text-sm text-mn-success font-bold">
              <Target className="w-4 h-4" />
              Matched
            </div>
          )}
          <div className="flex-1" />
          {/* Quick actions */}
          <div className="flex items-center gap-2 pt-5">
            <Button
              variant="secondary"
              icon={<AlarmClock className="w-4 h-4" />}
              onClick={() => setShowCallbackForm(true)}
            >
              Callback
            </Button>
            <Button
              variant="secondary"
              icon={<CalendarPlus className="w-4 h-4" />}
              onClick={() => { setActiveTab('visits'); setShowVisitForm(true); }}
            >
              Schedule Visit
            </Button>
            {canDeleteLead && (
              <Button
                variant="danger"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                Archive
              </Button>
            )}
          </div>
        </div>

        {governanceRequirement && (
          <div className="rounded-2xl border border-mn-warning/35 bg-mn-warning/10 p-4">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-mn-warning">
              Reason Category
              <span className="text-mn-danger ml-0.5">*</span>
            </label>
            <select
              value={governanceReasonCategory}
              onChange={event => setGovernanceReasonCategory(event.target.value as StageMoveReasonCategory)}
              className="mb-4 h-11 w-full rounded-2xl border border-mn-input-border bg-mn-input-bg px-4 text-sm font-bold text-mn-text shadow-sm transition-all focus:border-mn-input-focus focus:outline-none focus:ring-4 focus:ring-mn-ring"
            >
              <option value="">Select reason</option>
              {getStageMoveReasonOptions(governanceRequirement.kind).map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-mn-warning">
              {governanceRequirement.label}
              <span className="text-mn-danger ml-0.5">*</span>
            </label>
            <textarea
              value={governanceNote}
              onChange={event => setGovernanceNote(event.target.value)}
              rows={3}
              placeholder={
                governanceRequirement.kind === 'rejection'
                  ? 'Why is this lead being rejected?'
                  : governanceRequirement.kind === 'booking_cancellation'
                    ? 'Why is this booking being cancelled?'
                    : 'Add booking amount, payment notes, or closure context...'
              }
              className="w-full resize-none rounded-2xl border border-mn-input-border bg-mn-input-bg px-4 py-3 text-sm font-medium text-mn-text shadow-sm transition-all placeholder:text-mn-text-muted/50 focus:border-mn-input-focus focus:outline-none focus:ring-4 focus:ring-mn-ring"
            />
          </div>
        )}

        {dataQualityIssues.length > 0 && (
          <div className="rounded-2xl border border-mn-border/45 bg-mn-surface/70 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-mn-warning" />
              <p className="text-xs font-black uppercase tracking-[0.18em] text-mn-text-muted">Data Quality</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {dataQualityIssues.map(issue => (
                <div
                  key={issue.id}
                  className={`rounded-xl border px-3 py-2 ${
                    issue.severity === 'blocking'
                      ? 'border-mn-danger/25 bg-mn-danger/8'
                      : 'border-mn-warning/25 bg-mn-warning/8'
                  }`}
                >
                  <p className={`text-xs font-black ${issue.severity === 'blocking' ? 'text-mn-danger' : 'text-mn-warning'}`}>{issue.label}</p>
                  <p className="mt-1 text-xs text-mn-text-muted">{issue.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-mn-border/30">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-bold transition-all border-b-2 -mb-[1px] ${
                activeTab === tab.id
                  ? 'border-mn-h2 text-mn-h2'
                  : 'border-transparent text-mn-text-muted hover:text-mn-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="min-h-[350px] max-h-[500px] overflow-y-auto">
          {activeTab === 'details' && (
            <div className="space-y-4 pr-2">
              {/* Booked Property — required when status === 'Booked' to prevent double-booking.
                  Picker only shows Available units (Firestore query filter); a unit already held
                  by another lead is not selectable here. */}
              {(isAdmin || bookedUnit) && (status === 'Booked' || bookedUnit) && (
                <div className="p-4 bg-mn-warning/5 border border-mn-warning/30 rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <Home className="w-4 h-4 text-mn-warning" />
                    <h3 className="text-sm font-black text-mn-warning uppercase tracking-wider">Booked Property</h3>
                    <span className="text-[10px] text-mn-text-muted">Required — locks the unit for this lead</span>
                  </div>

                  {bookedUnit ? (
                    <div className="flex items-center gap-3 p-3 bg-mn-surface border border-mn-border/30 rounded-xl">
                      <Building2 className="w-6 h-6 text-mn-h2 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-mn-text truncate">{bookedUnit.projectName}</p>
                        <p className="text-xs text-mn-text-muted">Unit <span className="font-bold text-mn-text">{bookedUnit.unitLabel}</span> &middot; Booked by {bookedUnit.booked_by} on {new Date(bookedUnit.booked_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      </div>
                      {isAdmin && (
                        <Button
                          variant="secondary"
                          icon={<X className="w-3.5 h-3.5" />}
                          disabled={savingBooking}
                          onClick={handleUnbookUnit}
                        >
                          {savingBooking ? 'Releasing...' : 'Release Unit'}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      {interestedProperties.length === 0 ? (
                        <p className="text-xs text-mn-danger">
                          No properties tagged on this lead yet. Tag at least one project under &quot;Property Interested In&quot; below before booking.
                        </p>
                      ) : (
                        <>
                          <Select
                            label="Project"
                            value={pickerProjectId}
                            onChange={e => setPickerProjectId(e.target.value)}
                            options={[
                              { value: '', label: '— Select project —' },
                              ...interestedProperties.map(p => ({ value: p.projectId, label: p.projectName })),
                            ]}
                          />
                          {pickerProjectId && (
                            <div className="space-y-1.5">
                              <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider">Available Units</label>
                              {loadingUnits ? (
                                <p className="text-xs text-mn-text-muted">Loading units...</p>
                              ) : availableUnits.length === 0 ? (
                                <p className="text-xs text-mn-danger">No available units in this project. All units are booked or sold.</p>
                              ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                  {availableUnits.map(u => {
                                    const label = u.fields?.unit_number || u.fields?.plot_number || u.id.slice(-6).toUpperCase();
                                    return (
                                      <button
                                        key={u.id}
                                        type="button"
                                        disabled={savingBooking}
                                        onClick={() => handleBookUnit(u)}
                                        className="px-3 py-2 bg-mn-input-bg border border-mn-input-border hover:border-mn-h2 hover:bg-mn-h2/10 rounded-lg text-xs font-bold text-mn-text transition-colors disabled:opacity-50"
                                      >
                                        <div className="truncate">{label}</div>
                                        {u.price > 0 && <div className="text-[10px] text-mn-text-muted font-normal mt-0.5">{formatPrice(u.price)}</div>}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Input label="Name" value={name} onChange={e => setName(e.target.value)} />
                <Input label="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                <Input label="Budget" type="number" value={budget} onChange={e => setBudget(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <LocationAutocomplete label="Location" value={location} onChange={setLocation} />
                <Select
                  label="Timeline"
                  value={planToBuy}
                  onChange={e => setPlanToBuy(e.target.value)}
                  options={[
                    { value: 'Not Specified', label: 'Not Specified' },
                    { value: 'Immediately', label: 'Immediately' },
                    { value: '1-3 months', label: '1-3 months' },
                    { value: '3-6 months', label: '3-6 months' },
                    { value: '6-12 months', label: '6-12 months' },
                    { value: 'Just exploring', label: 'Just exploring' },
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Profession" value={profession} onChange={e => setProfession(e.target.value)} />
                <div>
                  <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Interest</label>
                  <div className="flex flex-wrap gap-1.5">
                    {INTEREST_OPTIONS.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleInterest(opt)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                          interests.includes(opt)
                            ? 'bg-mn-h2/15 border-mn-h2/40 text-mn-h2'
                            : 'bg-mn-input-bg border-mn-input-border text-mn-text-muted hover:border-mn-input-focus'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* BHK + Variant + Match Threshold — shown conditionally */}
              {(showBhkField || showVariantField) && (
                <div className="grid grid-cols-3 gap-4">
                  {showBhkField && (
                    <Select
                      label="BHK"
                      value={String(bhk)}
                      onChange={e => setBhk(Number(e.target.value))}
                      options={[
                        { value: '0', label: 'Any BHK' },
                        ...BHK_OPTIONS.map(b => ({ value: String(b), label: `${b} BHK` })),
                      ]}
                    />
                  )}
                  {showVariantField && (
                    <Select
                      label="House Variant"
                      value={houseVariant}
                      onChange={e => setHouseVariant(e.target.value)}
                      options={[
                        { value: '', label: 'Any Variant' },
                        ...HOUSE_VARIANTS.map(v => ({ value: v, label: v })),
                      ]}
                    />
                  )}
                  <Select
                    label="Match %"
                    value={String(matchThreshold)}
                    onChange={e => setMatchThreshold(Number(e.target.value))}
                    options={[
                      { value: '0', label: 'Use Global' },
                      ...THRESHOLD_OPTIONS.map(t => ({ value: String(t), label: `+${t}%` })),
                    ]}
                  />
                </div>
              )}
              {/* Match threshold shown even when no BHK fields needed */}
              {!showBhkField && !showVariantField && (
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Match %"
                    value={String(matchThreshold)}
                    onChange={e => setMatchThreshold(Number(e.target.value))}
                    options={[
                      { value: '0', label: 'Use Global' },
                      ...THRESHOLD_OPTIONS.map(t => ({ value: String(t), label: `+${t}%` })),
                    ]}
                  />
                </div>
              )}

              <div className="rounded-2xl border border-mn-warning/25 bg-mn-warning/5 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.16em] text-mn-warning">Buyer Objections</h3>
                    <p className="mt-1 text-xs font-semibold text-mn-text-muted">
                      Mark what is blocking this buyer. Copilot will adapt score, pitch, and next action.
                    </p>
                  </div>
                  {objections.length > 0 && (
                    <Badge variant="warning">{objections.length} active</Badge>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {OBJECTION_OPTIONS.map(option => {
                    const active = objections.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => toggleObjection(option)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-black transition-all ${
                          active
                            ? 'border-mn-warning/45 bg-mn-warning/18 text-mn-warning'
                            : 'border-mn-border/60 bg-mn-card/70 text-mn-text-muted hover:border-mn-warning/35 hover:text-mn-text'
                        }`}
                      >
                        {LEAD_OBJECTION_LABELS[option]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Match diagnosis — why isn't this lead auto-matching? */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowMatchDiagnosis(v => !v)}
                  className="text-[11px] font-bold text-mn-h2 hover:text-mn-h2/80 underline underline-offset-2"
                >
                  {showMatchDiagnosis ? 'Hide match diagnosis' : 'Why no auto-match?'}
                </button>
                {showMatchDiagnosis && (() => {
                  const effective = matchThreshold > 0 ? matchThreshold : globalThresholdPercent;
                  const diag = diagnoseMatches(lead, inventory, allProjectsList, effective);
                  const kept = diag.units.filter(u => u.matched);
                  const rejected = diag.units.filter(u => !u.matched);
                  // Group rejection reasons
                  const reasonCounts = new Map<string, number>();
                  rejected.forEach(u => {
                    const key = u.reason.split(' (')[0].split('.')[0]; // coarse bucket
                    reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
                  });
                  return (
                    <div className="mt-2 p-3 bg-mn-surface border border-mn-border/50 rounded-lg space-y-2 text-[11px]">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div><span className="text-mn-text-muted">Lead eligible:</span> <strong className={diag.leadOk ? 'text-mn-success' : 'text-mn-danger'}>{diag.leadOk ? 'Yes' : 'No'}</strong></div>
                        <div><span className="text-mn-text-muted">Threshold:</span> <strong className="text-mn-text">+{effective}%</strong></div>
                        <div><span className="text-mn-text-muted">Budget ceiling:</span> <strong className="text-mn-text">₹{diag.maxPrice.toLocaleString('en-IN')}</strong></div>
                        <div><span className="text-mn-text-muted">BHK floor:</span> <strong className="text-mn-text">{diag.leadBHK || 'n/a'}</strong></div>
                        <div><span className="text-mn-text-muted">Interests:</span> <strong className="text-mn-text">{diag.interests.join(', ') || 'none'}</strong></div>
                        <div><span className="text-mn-text-muted">Dismissed:</span> <strong className="text-mn-text">{diag.dismissedProjectIds.length}</strong></div>
                        <div><span className="text-mn-text-muted">Inventory scanned:</span> <strong className="text-mn-text">{diag.inventoryCount}</strong></div>
                        <div><span className="text-mn-text-muted">Matches:</span> <strong className={diag.matchCount > 0 ? 'text-mn-success' : 'text-mn-danger'}>{diag.matchCount}</strong></div>
                      </div>
                      {!diag.leadOk && (
                        <div className="pt-2 border-t border-mn-border/30 text-mn-danger">{diag.leadReason}</div>
                      )}
                      {diag.dismissedProjectIds.length > 0 && (
                        <div className="pt-2 border-t border-mn-border/30 space-y-1">
                          <p className="font-bold text-mn-text">Dismissed projects <span className="text-mn-text-muted font-normal">(blocked from auto-match)</span>:</p>
                          <ul className="space-y-1">
                            {diag.dismissedProjectIds.map(pid => {
                              const p = allProjectsList.find(pr => pr.id === pid);
                              return (
                                <li key={pid} className="flex items-center justify-between gap-2">
                                  <span className="text-mn-text-muted">
                                    <strong className="text-mn-text">{p?.name || pid}</strong>
                                    {p?.location && <span className="text-mn-text-muted/60"> — {p.location}</span>}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUndismissProject(pid)}
                                    className="text-[10px] font-bold text-mn-h2 hover:text-mn-h2/80 px-2 py-0.5 rounded border border-mn-h2/30 hover:bg-mn-h2/10 transition-colors"
                                  >
                                    Restore
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      {diag.leadOk && diag.matchCount === 0 && (
                        <div className="pt-2 border-t border-mn-border/30 space-y-1">
                          <p className="font-bold text-mn-text">Why each inventory unit was rejected:</p>
                          {diag.inventoryCount === 0 ? (
                            <p className="text-mn-text-muted italic">There is no inventory loaded at all. (The Kanban query loads only units with status = Available.)</p>
                          ) : (
                            <ul className="space-y-0.5 max-h-40 overflow-y-auto pr-2">
                              {rejected.slice(0, 20).map(u => (
                                <li key={u.unitId} className="text-mn-text-muted">
                                  <strong className="text-mn-text">{u.projectName}</strong> <span className="text-mn-text-muted/60">({u.propertyType}, ₹{u.price.toLocaleString('en-IN')}, {u.status}{u.unitBHK ? `, ${u.unitBHK} BHK` : ''})</span> — {u.reason}
                                </li>
                              ))}
                              {rejected.length > 20 && <li className="text-mn-text-muted/60 italic">…and {rejected.length - 20} more</li>}
                            </ul>
                          )}
                        </div>
                      )}
                      {diag.leadOk && diag.matchCount > 0 && (
                        <div className="pt-2 border-t border-mn-border/30 text-mn-success">
                          {diag.matchCount} unit{diag.matchCount > 1 ? 's' : ''} match. If the card isn&apos;t in the Property Matched lane yet, give the matcher ~2 seconds (debounced) or save any edit to trigger a re-run.
                          <ul className="mt-1 space-y-0.5">
                            {kept.slice(0, 10).map(u => (
                              <li key={u.unitId} className="text-mn-text-muted">✓ <strong className="text-mn-text">{u.projectName}</strong> — ₹{u.price.toLocaleString('en-IN')}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              {/* Property Interested In */}
              <div className="pt-3 border-t border-mn-border/30 space-y-3">
                <PropertySearch
                  taggedProjectIds={interestedProperties.map(p => p.projectId)}
                  onTagProperty={handleTagProperty}
                  projects={allProjectsList}
                />

                {/* Tagged properties */}
                {interestedProperties.length > 0 && (
                  <div className="space-y-2">
                    {interestedProperties.map(prop => (
                      <div
                        key={prop.projectId}
                        onMouseEnter={e => {
                          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                          if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
                          hoverTimer.current = window.setTimeout(() => {
                            setHoveredProp({ projectId: prop.projectId, rect });
                          }, 200);
                        }}
                        onMouseLeave={() => {
                          if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
                          hoverTimer.current = window.setTimeout(() => setHoveredProp(null), 150);
                        }}
                        className="group/prop relative flex items-center gap-3 p-2.5 bg-mn-surface border border-mn-border/30 rounded-xl hover:border-mn-h2/30 transition-colors"
                      >
                        {/* Clickable area — opens project page */}
                        <a
                          href={`/projects?id=${prop.projectId}`}
                          className="absolute inset-0 z-0"
                          title={`View ${prop.projectName} in Projects`}
                        />
                        <div className="w-10 h-10 rounded-lg bg-mn-card overflow-hidden flex-shrink-0 relative z-[1] pointer-events-none">
                          {prop.heroImage ? (
                            <img src={prop.heroImage} alt="" className="w-10 h-10 object-cover" />
                          ) : (
                            <div className="w-10 h-10 flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-mn-text-muted" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 relative z-[1] pointer-events-none">
                          <p className="text-sm font-bold text-mn-text truncate group-hover/prop:text-mn-h2 transition-colors">{prop.projectName}</p>
                          <p className="text-[10px] text-mn-text-muted">{prop.location} &middot; {prop.propertyType}</p>
                          {prop.bestPrice && prop.bestPrice > 0 && (
                            <p className="text-[10px] font-bold text-mn-h2 mt-0.5">From {formatPrice(prop.bestPrice)}</p>
                          )}
                          {prop.matchReasons && prop.matchReasons.length > 0 && (
                            <p
                              className="text-[10px] text-mn-text-muted mt-0.5 truncate"
                              title={prop.matchReasons.join(' ')}
                            >
                              {prop.matchReasons[0]}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0 relative z-[1] pointer-events-none">
                          {prop.tagged_by === 'system' && (
                            <span className="text-[9px] font-black text-mn-h2 bg-mn-h2/10 px-1.5 py-0.5 rounded">FROM AD</span>
                          )}
                          {prop.tagged_by === 'system-match' && (
                            <span className="text-[9px] font-black text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">AUTO</span>
                          )}
                          {prop.matchScore != null && (
                            <span className="text-[9px] font-black text-mn-success bg-mn-success/10 px-1.5 py-0.5 rounded">{prop.matchScore}/100</span>
                          )}
                          {prop.matchedUnitCount && prop.matchedUnitCount > 0 && (
                            <span className="text-[9px] text-mn-text-muted">{prop.matchedUnitCount} unit{prop.matchedUnitCount > 1 ? 's' : ''}</span>
                          )}
                          {prop.distanceKm != null && (
                            <span className="text-[9px] text-mn-text-muted">{prop.distanceKm} km away</span>
                          )}
                          <span className="text-[10px] text-mn-text-muted/60">
                            {new Date(prop.tagged_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveProperty(prop.projectId)}
                          className="p-1 rounded-lg text-mn-text-muted hover:text-mn-danger hover:bg-mn-danger/10 transition-all relative z-[2]"
                          title="Remove property"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {/* Send Property Details button */}
                    <Button
                      variant="secondary"
                      icon={<SendHorizontal className="w-4 h-4" />}
                      disabled={sendingPropertyDetails}
                      onClick={handleSendPropertyDetails}
                      className="w-full"
                    >
                      {sendingPropertyDetails ? 'Sending...' : `Send Property Details (${interestedProperties.length})`}
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 pt-3 border-t border-mn-border/30 text-xs text-mn-text-muted">
                <div className="flex items-center gap-4">
                  <span>Source: <strong className="text-mn-text">{lead.source}</strong></span>
                </div>
                {/* UTM / Ad Campaign Attribution */}
                {lead.utm && (lead.utm.source || lead.utm.campaign) && (
                  <div className="p-2.5 bg-mn-h2/5 border border-mn-h2/15 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-mn-h2 font-bold">
                      <Megaphone className="w-3.5 h-3.5" />
                      <span>Ad Campaign Attribution</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      {lead.utm.source && (
                        <div>
                          <span className="text-mn-text-muted">Platform: </span>
                          <strong className="text-mn-text">{lead.utm.source}</strong>
                        </div>
                      )}
                      {lead.utm.medium && (
                        <div>
                          <span className="text-mn-text-muted">Medium: </span>
                          <strong className="text-mn-text">{lead.utm.medium}</strong>
                        </div>
                      )}
                      {lead.utm.campaign && (
                        <div>
                          <span className="text-mn-text-muted">Campaign: </span>
                          <strong className="text-mn-text">{lead.utm.campaign}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {lead.created_at && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span>Created: <strong className="text-mn-text">{lead.created_at.toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong></span>
                  </div>
                )}
                {firstContactDate && (
                  <div className="flex items-center gap-1.5">
                    <PhoneCall className="w-3 h-3" />
                    <span>First contacted: <strong className="text-mn-text">{new Date(firstContactDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-4 pr-2">
              {/* Add new note */}
              <div className="p-4 bg-mn-surface border border-mn-border/30 rounded-xl">
                <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Add Note</label>
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  rows={3}
                  placeholder="Update from call, meeting, or follow-up..."
                  spellCheck
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  lang="en-IN"
                  className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus resize-none"
                />
                <div className="flex justify-end items-center gap-2 mt-2">
                  <Button
                    variant="secondary"
                    icon={<Sparkles className="w-4 h-4" />}
                    disabled={polishing || addingNote || !newNote.trim()}
                    onClick={handlePolishNote}
                    title="Fix spelling and grammar — preserves your meaning"
                  >
                    {polishing ? 'Polishing...' : 'Polish'}
                  </Button>
                  <Button
                    icon={<Plus className="w-4 h-4" />}
                    disabled={addingNote || polishing || !newNote.trim()}
                    onClick={handleAddNote}
                  >
                    {addingNote ? 'Adding...' : 'Add Note'}
                  </Button>
                </div>
              </div>

              {/* Activity timeline */}
              {allActivity.length === 0 ? (
                <div className="text-center py-12 text-mn-text-muted text-sm">No activity yet.</div>
              ) : (
                <div className="space-y-1">
                  {allActivity.map(entry => (
                    <div key={entry.id} className="flex gap-3 p-3 rounded-lg hover:bg-mn-card/50">
                      <div className="flex-shrink-0 mt-0.5">
                        {entry.type === 'note' && <MessageSquare className="w-4 h-4 text-mn-info" />}
                        {entry.type === 'call' && <PhoneCall className="w-4 h-4 text-mn-success" />}
                        {entry.type === 'site_visit_scheduled' && <Calendar className="w-4 h-4 text-mn-warning" />}
                        {entry.type === 'whatsapp_sent' && <Send className="w-4 h-4 text-mn-success" />}
                        {entry.type === 'status_change' && <CheckCircle className="w-4 h-4 text-mn-accent" />}
                        {entry.type === 'callback_scheduled' && <PhoneForwarded className="w-4 h-4 text-mn-warning" />}
                        {entry.type === 'property_details_sent' && <Building2 className="w-4 h-4 text-mn-h2" />}
                        {entry.type === 'lead_merged' && <GitMerge className="w-4 h-4 text-mn-warning" />}
                        {entry.type === 'task_completed' && <CheckCircle className="w-4 h-4 text-mn-success" />}
                        {entry.type === 'objection_updated' && <AlertTriangle className="w-4 h-4 text-mn-warning" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-mn-text whitespace-pre-wrap">{entry.text}</p>
                        {entry.call_recording_url && (
                          <a href={entry.call_recording_url} target="_blank" rel="noopener noreferrer" className="text-xs text-mn-info hover:underline mt-1 inline-block">
                            Play Recording
                          </a>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-mn-text-muted">
                          <span>{entry.author}</span>
                          <span>&middot;</span>
                          <span>{new Date(entry.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'visits' && (
            <div className="space-y-4 pr-2">
              {/* Schedule new visit form */}
              {showVisitForm ? (
                <div className="p-4 bg-mn-surface border border-mn-border/30 rounded-xl space-y-3">
                  <h4 className="text-sm font-black text-mn-h1">Schedule Site Visit</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <DateTimePicker
                      label="Date & Time"
                      value={visitDate}
                      onChange={setVisitDate}
                      min={new Date().toISOString().slice(0, 16)}
                      required
                    />
                    <ProjectLocationSearch
                      label="Visit Location"
                      value={visitLocation}
                      onChange={setVisitLocation}
                      projects={allProjectsList}
                      placeholder="Search project by name or location..."
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Notes</label>
                    <input
                      type="text"
                      value={visitNotes}
                      onChange={e => setVisitNotes(e.target.value)}
                      placeholder="e.g. Interested in corner plots, bring brochure"
                      className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
                    />
                  </div>
                  <p className="text-[10px] text-mn-text-muted">
                    WhatsApp reminders will be sent: on confirmation, 1 day before, and morning of the visit.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setShowVisitForm(false)}>Cancel</Button>
                    <Button
                      icon={<CalendarPlus className="w-4 h-4" />}
                      disabled={schedulingVisit || !visitDate}
                      onClick={handleScheduleVisit}
                    >
                      {schedulingVisit ? 'Scheduling...' : 'Schedule & Notify'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  icon={<CalendarPlus className="w-4 h-4" />}
                  onClick={() => setShowVisitForm(true)}
                >
                  Schedule New Visit
                </Button>
              )}

              {/* Visit list */}
              {siteVisits.length === 0 && !showVisitForm ? (
                <div className="text-center py-12 text-mn-text-muted text-sm">No site visits scheduled.</div>
              ) : (
                <div className="space-y-3">
                  {siteVisits.map(visit => {
                    const visitDt = new Date(visit.scheduled_at);
                    const isPast = visitDt < new Date();
                    return (
                      <div key={visit.id} className="p-4 bg-mn-card border border-mn-border/30 rounded-xl">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-mn-h2" />
                              <span className="font-bold text-sm text-mn-text">
                                {visitDt.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-mn-text-muted">
                              <MapPin className="w-3 h-3" />
                              {visit.location}
                            </div>
                            {visit.notes && <p className="text-xs text-mn-text-muted mt-1">{visit.notes}</p>}
                          </div>
                          <Badge variant={
                            visit.status === 'completed' ? 'success' :
                            visit.status === 'cancelled' ? 'danger' :
                            visit.status === 'no_show' ? 'warning' :
                            isPast ? 'warning' : 'info'
                          }>
                            {visit.status === 'scheduled' && isPast ? 'Pending Update' : visit.status}
                          </Badge>
                        </div>
                        {/* Reminder status */}
                        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-mn-border/20 text-[10px] text-mn-text-muted">
                          <span className={visit.reminder_on_agreement ? 'text-mn-success' : ''}>
                            {visit.reminder_on_agreement ? '✓' : '○'} Confirmation sent
                          </span>
                          <span className={visit.reminder_day_before ? 'text-mn-success' : ''}>
                            {visit.reminder_day_before ? '✓' : '○'} Day before
                          </span>
                          <span className={visit.reminder_morning_of ? 'text-mn-success' : ''}>
                            {visit.reminder_morning_of ? '✓' : '○'} Morning of
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => setDeletingVisitId(deletingVisitId === visit.id ? null : visit.id)}
                              className="ml-auto text-mn-danger hover:text-mn-danger/80 font-bold flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              Cancel Visit
                            </button>
                          )}
                        </div>
                        {/* Delete confirmation with notes */}
                        {isAdmin && deletingVisitId === visit.id && (
                          <div className="mt-3 p-3 bg-mn-danger/5 border border-mn-danger/20 rounded-lg space-y-2">
                            <p className="text-xs font-bold text-mn-danger">Cancel this site visit? Please provide a reason:</p>
                            <input
                              type="text"
                              value={deleteVisitNotes}
                              onChange={e => setDeleteVisitNotes(e.target.value)}
                              placeholder="Reason for cancellation (required)..."
                              className="w-full px-3 py-2 bg-mn-input-bg border border-mn-input-border rounded-lg text-xs text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setDeletingVisitId(null); setDeleteVisitNotes(''); }}
                                className="px-3 py-1.5 text-xs font-bold text-mn-text-muted bg-mn-card border border-mn-border rounded-lg hover:bg-mn-card-hover"
                              >
                                Keep Visit
                              </button>
                              <button
                                onClick={() => handleDeleteVisit(visit.id)}
                                disabled={deletingVisit || !deleteVisitNotes.trim()}
                                className="px-3 py-1.5 text-xs font-bold text-mn-danger-contrast bg-mn-danger-action rounded-lg hover:bg-mn-danger-action/90 disabled:border disabled:border-mn-border/70 disabled:bg-mn-card/80 disabled:text-mn-text-muted"
                              >
                                {deletingVisit ? 'Cancelling...' : 'Confirm Cancellation'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Callback Request Form */}
        {showCallbackForm && (
          <div className="p-4 bg-mn-surface border border-mn-border/30 rounded-xl space-y-3">
            <h4 className="text-sm font-black text-mn-h1 flex items-center gap-2">
              <AlarmClock className="w-4 h-4 text-mn-warning" />
              Schedule Callback
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <DateTimePicker
                label="Call Back Date & Time"
                value={callbackDate}
                onChange={setCallbackDate}
                min={new Date().toISOString().slice(0, 16)}
                required
              />
              <div>
                <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Notes</label>
                <input
                  type="text"
                  value={callbackNotes}
                  onChange={e => setCallbackNotes(e.target.value)}
                  placeholder="e.g. Lead asked to call after 5 PM"
                  className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
                />
              </div>
            </div>
            <p className="text-[10px] text-mn-text-muted">
              An alarm with lead details will pop up when the callback time arrives.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowCallbackForm(false)}>Cancel</Button>
              <Button
                icon={<AlarmClock className="w-4 h-4" />}
                disabled={schedulingCallback || !callbackDate}
                onClick={handleScheduleCallback}
              >
                {schedulingCallback ? 'Scheduling...' : 'Schedule Callback'}
              </Button>
            </div>
          </div>
        )}

        {/* Duplicate merge (admin only) */}
        {isAdmin && (
          <div className="p-4 bg-mn-surface border border-mn-border/30 rounded-xl space-y-3">
            <h4 className="text-sm font-black text-mn-h1 flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-mn-warning" />
              Merge Duplicate Lead
            </h4>
            <p className="text-xs text-mn-text-muted">
              Keep this lead as the primary record. Activity, site visits, callbacks, tagged properties, and missing contact details from the duplicate will be merged here.
            </p>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <Select
                label="Duplicate Lead"
                value={mergeTargetId}
                onChange={e => setMergeTargetId(e.target.value)}
                placeholder="Select duplicate to merge"
                options={mergeCandidates.map(candidate => ({
                  value: candidate.lead.id,
                  label: `${candidate.lead.raw_data?.lead_name || 'Unnamed'} — ${candidate.reasons.join(', ')}`,
                }))}
              />
              <Button
                variant="secondary"
                icon={<GitMerge className="w-4 h-4" />}
                disabled={mergingLead || !mergeTargetId}
                onClick={handleMergeLead}
              >
                {mergingLead ? 'Merging...' : 'Merge Into This Lead'}
              </Button>
            </div>
            {selectedMergeCandidate && (
              <div className="rounded-lg border border-mn-warning/25 bg-mn-warning/10 p-3 text-xs text-mn-text-muted">
                <span className="font-bold text-mn-text">{selectedMergeCandidate.lead.raw_data?.lead_name}</span>
                {' '}will be archived after its history is copied into this lead.
              </div>
            )}
          </div>
        )}

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="p-4 bg-red-950/30 border border-mn-danger/30 rounded-xl space-y-3">
            <p className="text-sm text-mn-text font-bold">
              Are you sure you want to archive lead &quot;{raw.lead_name}&quot;?
            </p>
            <p className="text-xs text-mn-text-muted">The lead will leave active workflows, but its history stays available for audit and future analysis.</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button
                variant="danger"
                icon={<Trash2 className="w-4 h-4" />}
                disabled={deleting}
                onClick={handleDeleteLead}
              >
                {deleting ? 'Archiving...' : 'Archive Lead'}
              </Button>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex gap-3 pt-3 border-t border-mn-border/30">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            className="flex-1"
            icon={<Save className="w-4 h-4" />}
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
      {hoveredProp && (
        <PropertyTooltip
          projectId={hoveredProp.projectId}
          anchorRect={hoveredProp.rect}
          onClose={() => setHoveredProp(null)}
        />
      )}
    </Modal>
  );
}

/* ==================== WhatsApp Helper ==================== */
async function sendWhatsAppConfirmation(lead: Lead, visit: SiteVisit, getAuthToken?: () => Promise<string | null>) {
  try {
    const authToken = await getAuthToken?.();
    if (!authToken) return;

    const visitDate = new Date(visit.scheduled_at);

    // Clean phone number: remove spaces, ensure country code
    let toPhone = lead.raw_data.phone.replace(/[\s\-()]/g, '');
    if (toPhone.startsWith('+')) toPhone = toPhone.slice(1);
    if (!toPhone.startsWith('91') && toPhone.length === 10) toPhone = '91' + toPhone;

    const response = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        to: toPhone,
        type: 'template',
        leadId: lead.id,
        templateName: 'site_visit_confirmation',
        parameters: [
          lead.raw_data.lead_name,
          visitDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
          visit.location,
        ],
      }),
    });

    if (response.ok) {
      // Log WhatsApp sent + update reminder flag
      const waEntry: ActivityLogEntry = {
        id: `wa_${Date.now()}`,
        type: 'whatsapp_sent',
        text: `WhatsApp confirmation sent for site visit on ${visitDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
        author: 'System',
        created_at: new Date().toISOString(),
      };
      await updateDoc(doc(db, 'leads', lead.id), {
        activity_log: arrayUnion(waEntry),
      });
      // Mark reminder_on_agreement for this visit
      const updatedVisits = (lead.site_visits || []).map(v =>
        v.id === visit.id ? { ...v, reminder_on_agreement: true } : v
      );
      // Since we just added the visit via arrayUnion, we need to include the new one too
      const allVisits = updatedVisits.length > 0 ? updatedVisits : [{ ...visit, reminder_on_agreement: true }];
      await updateDoc(doc(db, 'leads', lead.id), { site_visits: allVisits });
    } else {
      const data = await response.json().catch(() => null);
      console.error('WhatsApp API error:', data?.error || response.statusText);
    }
  } catch (err) {
    console.error('WhatsApp send failed:', err);
  }
}
