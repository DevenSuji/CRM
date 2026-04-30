"use client";
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Lead } from '@/lib/types/lead';
import { LaneConfig, SLAConfig } from '@/lib/types/config';
import { KanbanCard } from '@/components/KanbanCard';

interface KanbanLaneProps {
  lane: LaneConfig;
  leads: Lead[];
  isLast?: boolean;
  onClickLead?: (lead: Lead) => void;
  availableColors?: string[];
  slaConfig?: SLAConfig;
  fitToWindow?: boolean;
  assigneeNameByUid?: Record<string, string>;
}

export function KanbanLane({ lane, leads, onClickLead, availableColors, slaConfig, fitToWindow = false, assigneeNameByUid = {} }: KanbanLaneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.id });

  const sizingClasses = fitToWindow
    ? 'flex-1 min-w-0'
    : 'min-w-[min(86vw,340px)] w-[min(86vw,340px)] sm:min-w-[320px] sm:w-[320px] flex-shrink-0';

  return (
    <div className={`mn-lane-shell flex flex-col rounded-[1.75rem] p-2.5 ${sizingClasses}`}>
      <div className="mn-lane-header mb-2 rounded-[1.4rem] px-3.5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl text-base shadow-inner ring-1 ring-black/5" role="img" style={{ backgroundColor: `${lane.color}18`, color: lane.color }}>
              {lane.emoji || '●'}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-[0.95rem] font-black tracking-tight text-mn-text">
                {lane.label}
              </h3>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-mn-text-muted/70">
                Stage
              </p>
            </div>
          </div>
          <span
            className="rounded-full border border-mn-border/35 px-2.5 py-1 text-[10px] font-black text-mn-text shadow-sm"
            style={{ backgroundColor: `${lane.color}18` }}
          >
            {leads.length}
          </span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`mn-lane-well flex-1 space-y-3 overflow-y-auto rounded-[1.45rem] px-2.5 pb-3 pt-2.5 transition-all ${
          isOver
            ? 'bg-mn-h2/10 ring-2 ring-mn-ring'
            : ''
        }`}
      >
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <KanbanCard
              key={lead.id}
              lead={lead}
              onClickLead={onClickLead}
              availableColors={availableColors}
              slaConfig={slaConfig}
              assigneeName={lead.assigned_to ? assigneeNameByUid[lead.assigned_to] : undefined}
            />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="mn-soft-inset flex items-center justify-center rounded-[1.35rem] border border-dashed py-16 text-[11px] font-bold uppercase tracking-[0.18em] text-mn-text-muted/50">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}
