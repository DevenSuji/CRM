"use client";
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Lead } from '@/lib/types/lead';
import { LaneConfig } from '@/lib/types/config';
import { KanbanCard } from '@/components/KanbanCard';

interface KanbanLaneProps {
  lane: LaneConfig;
  leads: Lead[];
  isLast?: boolean;
  onClickLead?: (lead: Lead) => void;
  availableColors?: string[];
  fitToWindow?: boolean;
}

export function KanbanLane({ lane, leads, isLast = false, onClickLead, availableColors, fitToWindow = false }: KanbanLaneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.id });

  const sizingClasses = fitToWindow
    ? 'flex-1 min-w-0'
    : 'min-w-[300px] w-[300px] flex-shrink-0';

  return (
    <div className={`flex flex-col ${sizingClasses} ${
      !isLast ? 'border-r border-mn-lane-divider' : ''
    }`}>
      {/* Lane Header */}
      <div className="px-3 py-2.5 mb-2 border-b-2" style={{ borderBottomColor: lane.color }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-base flex-shrink-0" role="img">
              {lane.emoji || '●'}
            </span>
            <h3 className="font-black text-sm text-mn-text uppercase tracking-wider">
              {lane.label}
            </h3>
          </div>
          <span
            className="text-[10px] font-black px-2.5 py-0.5 rounded-full text-mn-text"
            style={{ backgroundColor: `${lane.color}20` }}
          >
            {leads.length}
          </span>
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 px-2 pb-2 space-y-2 overflow-y-auto transition-colors rounded-xl ${
          isOver
            ? 'bg-mn-h2/8'
            : ''
        }`}
      >
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <KanbanCard key={lead.id} lead={lead} onClickLead={onClickLead} availableColors={availableColors} />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="flex items-center justify-center py-16 text-xs text-mn-text-muted/30 font-medium">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}
