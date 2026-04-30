"use client";
import { useMemo, useCallback } from 'react';
import {
  DndContext, DragEndEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
  DragOverlay, DragStartEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
import { Lead } from '@/lib/types/lead';
import { LaneConfig, SLAConfig } from '@/lib/types/config';
import { KanbanLane } from '@/components/KanbanLane';
import { KanbanCard } from '@/components/KanbanCard';
import { db } from '@/lib/firebase';
import { arrayUnion, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/lib/hooks/useToast';
import { groupLeadsByLane, computeDragMove, type DragDecision } from '@/lib/utils/kanbanLanes';
import {
  buildStageMoveLog,
  getRequiredStageMoveNoteKind,
  getRequiredStageMoveNoteLabel,
  getStageMoveDialogTitle,
  getStageMoveReasonOptions,
  type StageMoveReasonCategory,
  type StageMoveReasonKind,
} from '@/lib/utils/kanbanStageMoves';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface KanbanBoardProps {
  leads: Lead[];
  lanes: LaneConfig[];
  onClickLead?: (lead: Lead) => void;
  availableColors?: string[];
  slaConfig?: SLAConfig;
  fitToWindow?: boolean;
  assigneeNameByUid?: Record<string, string>;
  actorName?: string;
  canManageBookings?: boolean;
  getAuthToken?: () => Promise<string | null>;
}

interface PendingStageMove {
  decision: Exclude<DragDecision, { kind: 'noop' | 'block_booked' }>;
  lead: Lead;
  noteLabel: string;
  title: string;
  reasonKind: StageMoveReasonKind;
}

export function KanbanBoard({
  leads,
  lanes,
  onClickLead,
  availableColors,
  slaConfig,
  fitToWindow = false,
  assigneeNameByUid = {},
  actorName = 'Admin',
  canManageBookings = false,
  getAuthToken,
}: KanbanBoardProps) {
  const { showToast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingStageMove, setPendingStageMove] = useState<PendingStageMove | null>(null);
  const [stageMoveNote, setStageMoveNote] = useState('');
  const [stageMoveReasonCategory, setStageMoveReasonCategory] = useState<StageMoveReasonCategory | ''>('');
  const [stageMoveSaving, setStageMoveSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const sortedLanes = useMemo(
    () => [...lanes].sort((a, b) => a.order - b.order),
    [lanes],
  );

  const leadsByLane = useMemo(
    () => groupLeadsByLane(leads, sortedLanes),
    [leads, sortedLanes],
  );

  const activeLead = useMemo(
    () => activeId ? leads.find(l => l.id === activeId) || null : null,
    [activeId, leads],
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const performStageMove = useCallback(async (
    decision: Exclude<DragDecision, { kind: 'noop' | 'block_booked' }>,
    lead: Lead,
    note?: string,
    reasonCategory?: StageMoveReasonCategory | '',
  ) => {
    const activityEntry = buildStageMoveLog(lead, decision.newStatus, actorName, note, reasonCategory);
    if (decision.kind === 'unbook_batch') {
      const token = await getAuthToken?.();
      if (!token) throw new Error('Sign in again before changing a booked lead.');
      const response = await fetch('/api/leads/booking', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'move_booked',
          leadId: decision.leadId,
          unitId: decision.unitId,
          newStatus: decision.newStatus,
          note,
          reasonCategory,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to move booked lead.');
      return;
    }

    if (decision.kind === 'close_sale_batch') {
      const token = await getAuthToken?.();
      if (!token) throw new Error('Sign in again before closing a booked lead.');
      const response = await fetch('/api/leads/booking', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'move_booked',
          leadId: decision.leadId,
          unitId: decision.unitId,
          newStatus: decision.newStatus,
          note,
          reasonCategory,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to close booked lead.');
      return;
    }

    await updateDoc(doc(db, 'leads', decision.leadId), {
      status: decision.newStatus,
      lane_moved_at: serverTimestamp(),
      activity_log: arrayUnion(activityEntry),
    });
  }, [actorName, getAuthToken]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    const decision = computeDragMove(
      active.id as string,
      over?.id as string | undefined,
      leads,
      sortedLanes,
    );

    if (decision.kind === 'noop') return;

    if (decision.kind === 'block_booked') {
      if (!canManageBookings) {
        showToast('error', 'Booking a lead requires Admin or Super Admin access.');
        return;
      }
      showToast('error', 'Select the booked unit in the lead detail to complete this move.');
      onClickLead?.(decision.lead);
      return;
    }

    const lead = leads.find(item => item.id === decision.leadId);
    if (!lead) return;

    if (
      !canManageBookings
      && (decision.kind === 'unbook_batch' || decision.kind === 'close_sale_batch')
    ) {
      showToast('error', 'Changing a booked lead requires Admin or Super Admin access.');
      return;
    }

    const requiredNoteKind = getRequiredStageMoveNoteKind(lead.status, decision.newStatus);
    const requiredNoteLabel = getRequiredStageMoveNoteLabel(lead.status, decision.newStatus);
    if (requiredNoteKind && requiredNoteLabel) {
      setStageMoveNote('');
      setStageMoveReasonCategory('');
      setPendingStageMove({
        decision,
        lead,
        title: getStageMoveDialogTitle(lead.status, decision.newStatus),
        noteLabel: requiredNoteLabel,
        reasonKind: requiredNoteKind,
      });
      return;
    }

    try {
      await performStageMove(decision, lead);
      if (decision.newStatus === 'Site Visit' && !(lead.site_visits || []).some(visit => visit.status === 'scheduled')) {
        showToast('success', 'Lead moved to Site Visit. Schedule the visit details now.');
        onClickLead?.(lead);
      }
    } catch (err) {
      console.error('Failed to move lead:', err);
      showToast('error', 'Failed to move lead. Check connection.');
    }
  }, [canManageBookings, leads, sortedLanes, showToast, onClickLead, performStageMove]);

  const handleConfirmStageMove = useCallback(async () => {
    if (!pendingStageMove) return;
    const note = stageMoveNote.trim();
    if (!note) {
      showToast('error', `${pendingStageMove.noteLabel} is required.`);
      return;
    }
    if (!stageMoveReasonCategory) {
      showToast('error', 'Select a reason category.');
      return;
    }

    setStageMoveSaving(true);
    try {
      await performStageMove(pendingStageMove.decision, pendingStageMove.lead, note, stageMoveReasonCategory);
      showToast('success', `Lead moved to ${pendingStageMove.decision.newStatus}.`);
      setPendingStageMove(null);
      setStageMoveNote('');
      setStageMoveReasonCategory('');
    } catch (err) {
      console.error('Failed to move lead:', err);
      showToast('error', 'Failed to move lead. Check connection.');
    } finally {
      setStageMoveSaving(false);
    }
  }, [pendingStageMove, performStageMove, showToast, stageMoveNote, stageMoveReasonCategory]);

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="mn-board-shell relative h-full overflow-hidden rounded-[2rem]">
          <div className={`relative z-10 flex h-full gap-4 overflow-y-hidden p-4 ${fitToWindow ? 'overflow-x-hidden' : 'overflow-x-auto'}`}>
            {sortedLanes.map((lane, idx) => (
              <KanbanLane
                key={lane.id}
                lane={lane}
                leads={leadsByLane[lane.id] || []}
                isLast={idx === sortedLanes.length - 1}
                onClickLead={onClickLead}
                availableColors={availableColors}
                slaConfig={slaConfig}
                fitToWindow={fitToWindow}
                assigneeNameByUid={assigneeNameByUid}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeLead && (
            <KanbanCard
              lead={activeLead}
              availableColors={availableColors}
              slaConfig={slaConfig}
              assigneeName={activeLead.assigned_to ? assigneeNameByUid[activeLead.assigned_to] : undefined}
            />
          )}
        </DragOverlay>
      </DndContext>

      {pendingStageMove && (
        <Modal
          open
          onClose={() => {
            if (!stageMoveSaving) {
              setPendingStageMove(null);
              setStageMoveNote('');
              setStageMoveReasonCategory('');
            }
          }}
          title={pendingStageMove.title}
          maxWidth="max-w-lg"
        >
          <div className="space-y-5">
            <div className="rounded-2xl border border-mn-border/50 bg-mn-surface/70 p-4">
              <p className="text-sm font-bold text-mn-text">
                {pendingStageMove.lead.raw_data.lead_name}
              </p>
              <p className="mt-1 text-xs font-semibold text-mn-text-muted">
                {pendingStageMove.lead.status} → {pendingStageMove.decision.newStatus}
              </p>
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-mn-text-muted">
                Reason Category
                <span className="text-mn-danger ml-0.5">*</span>
              </label>
              <select
                value={stageMoveReasonCategory}
                onChange={event => setStageMoveReasonCategory(event.target.value as StageMoveReasonCategory)}
                className="mb-4 h-11 w-full rounded-2xl border border-mn-input-border bg-mn-input-bg px-4 text-sm font-bold text-mn-text shadow-sm transition-all focus:border-mn-input-focus focus:outline-none focus:ring-4 focus:ring-mn-ring"
              >
                <option value="">Select reason</option>
                {getStageMoveReasonOptions(pendingStageMove.reasonKind).map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-mn-text-muted">
                {pendingStageMove.noteLabel}
                <span className="text-mn-danger ml-0.5">*</span>
              </label>
              <textarea
                value={stageMoveNote}
                onChange={event => setStageMoveNote(event.target.value)}
                rows={4}
                placeholder={
                  pendingStageMove.noteLabel === 'Rejection Reason'
                    ? 'Why are we rejecting this lead?'
                    : pendingStageMove.noteLabel === 'Cancellation Reason'
                      ? 'Why is this booking being cancelled?'
                      : 'Add booking amount, payment notes, or closure context...'
                }
                className="w-full resize-none rounded-2xl border border-mn-input-border bg-mn-input-bg px-4 py-3 text-sm font-medium text-mn-text shadow-sm transition-all placeholder:text-mn-text-muted/50 focus:border-mn-input-focus focus:outline-none focus:ring-4 focus:ring-mn-ring"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                disabled={stageMoveSaving}
                onClick={() => {
                  setPendingStageMove(null);
                  setStageMoveNote('');
                  setStageMoveReasonCategory('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={stageMoveSaving}
                onClick={handleConfirmStageMove}
              >
                {stageMoveSaving ? 'Saving...' : 'Confirm Move'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
