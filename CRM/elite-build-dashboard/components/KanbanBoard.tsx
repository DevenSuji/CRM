"use client";
import { useMemo, useCallback } from 'react';
import {
  DndContext, DragEndEvent, DragOverEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
  DragOverlay, DragStartEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
import { Lead } from '@/lib/types/lead';
import { LaneConfig, statusToLaneId, laneIdToStatus } from '@/lib/types/config';
import { KanbanLane } from '@/components/KanbanLane';
import { KanbanCard } from '@/components/KanbanCard';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp, writeBatch, deleteField } from 'firebase/firestore';
import { useToast } from '@/lib/hooks/useToast';

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

  const leadsByLane = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const lane of sortedLanes) {
      map[lane.id] = [];
    }
    for (const lead of leads) {
      const laneId = statusToLaneId(lead.status);
      if (map[laneId]) {
        map[laneId].push(lead);
      } else {
        // Unknown lane — put in first lane
        const firstLane = sortedLanes[0]?.id;
        if (firstLane && map[firstLane]) {
          map[firstLane].push(lead);
        }
      }
    }
    // Sort each lane by lane_moved_at desc, then created_at desc
    for (const laneId of Object.keys(map)) {
      map[laneId].sort((a, b) => {
        const aTime = a.lane_moved_at?.toMillis?.() || a.created_at?.toMillis?.() || 0;
        const bTime = b.lane_moved_at?.toMillis?.() || b.created_at?.toMillis?.() || 0;
        return bTime - aTime;
      });
    }
    return map;
  }, [leads, sortedLanes]);

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
    if (!over) return;

    const leadId = active.id as string;
    let targetLaneId: string;

    // Determine target lane — could be dropping on a lane or on another card
    if (sortedLanes.find(l => l.id === over.id)) {
      targetLaneId = over.id as string;
    } else {
      // Dropped on a card — find which lane that card is in
      const overLead = leads.find(l => l.id === over.id);
      if (overLead) {
        targetLaneId = statusToLaneId(overLead.status);
      } else {
        return;
      }
    }

    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    const currentLaneId = statusToLaneId(lead.status);
    if (currentLaneId === targetLaneId) return;

    const newStatus = laneIdToStatus(targetLaneId);

    // Moving INTO Booked without a booked_unit — block and prompt user to pick the unit
    // in the lead detail. Prevents double-booking by forcing the unit selection step.
    if (targetLaneId === 'booked' && !lead.booked_unit) {
      showToast('error', 'Select the booked unit in the lead detail to complete this move.');
      onClickLead?.(lead);
      return;
    }

    // Moving OUT of Booked while a unit is held — free the inventory unit in the same batch.
    if (currentLaneId === 'booked' && lead.booked_unit) {
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'leads', leadId), {
          status: newStatus,
          lane_moved_at: serverTimestamp(),
          booked_unit: deleteField(),
        });
        batch.update(doc(db, 'inventory', lead.booked_unit.unitId), {
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
      await updateDoc(doc(db, 'leads', leadId), {
        status: newStatus,
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
