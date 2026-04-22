"use client";
import { useMemo, useCallback } from 'react';
import {
  DndContext, DragEndEvent, DragOverEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
  DragOverlay, DragStartEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
import { Lead } from '@/lib/types/lead';
import { LaneConfig } from '@/lib/types/config';
import { KanbanLane } from '@/components/KanbanLane';
import { KanbanCard } from '@/components/KanbanCard';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp, writeBatch, deleteField } from 'firebase/firestore';
import { useToast } from '@/lib/hooks/useToast';
import { groupLeadsByLane, computeDragMove } from '@/lib/utils/kanbanLanes';

interface KanbanBoardProps {
  leads: Lead[];
  lanes: LaneConfig[];
  onClickLead?: (lead: Lead) => void;
  availableColors?: string[];
  fitToWindow?: boolean;
}

export function KanbanBoard({ leads, lanes, onClickLead, availableColors, fitToWindow = false }: KanbanBoardProps) {
  const { showToast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);

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
      showToast('error', 'Select the booked unit in the lead detail to complete this move.');
      onClickLead?.(decision.lead);
      return;
    }

    if (decision.kind === 'unbook_batch') {
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'leads', decision.leadId), {
          status: decision.newStatus,
          lane_moved_at: serverTimestamp(),
          booked_unit: deleteField(),
        });
        batch.update(doc(db, 'inventory', decision.unitId), {
          status: 'Available',
          booked_by_lead_id: deleteField(),
        });
        await batch.commit();
      } catch (err) {
        console.error('Failed to unbook lead:', err);
        showToast('error', 'Failed to move lead. Check connection.');
      }
      return;
    }

    try {
      await updateDoc(doc(db, 'leads', decision.leadId), {
        status: decision.newStatus,
        lane_moved_at: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to move lead:', err);
      showToast('error', 'Failed to move lead. Check connection.');
    }
  }, [leads, sortedLanes, showToast, onClickLead]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={`flex h-full pb-4 px-4 ${fitToWindow ? 'overflow-x-hidden' : 'overflow-x-auto'}`}>
        {sortedLanes.map((lane, idx) => (
          <KanbanLane
            key={lane.id}
            lane={lane}
            leads={leadsByLane[lane.id] || []}
            isLast={idx === sortedLanes.length - 1}
            onClickLead={onClickLead}
            availableColors={availableColors}
            fitToWindow={fitToWindow}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead && <KanbanCard lead={activeLead} availableColors={availableColors} />}
      </DragOverlay>
    </DndContext>
  );
}
