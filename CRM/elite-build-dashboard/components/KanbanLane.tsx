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
  const hasLeads = leads.length > 0;

  return (
    <div className={`mn-lane-shell flex flex-col rounded-[1.75rem] ${fitToWindow ? 'p-2' : 'p-2.5'} ${sizingClasses}`}>
      <div className={`mn-lane-header mb-2 overflow-hidden rounded-[1.4rem] ${fitToWindow ? 'px-2 py-2' : 'px-3.5 py-3'}`}>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className={`flex min-w-0 items-center ${fitToWindow ? 'gap-1.5' : 'gap-2.5'}`}>
            <span className={`flex flex-shrink-0 items-center justify-center rounded-2xl text-base shadow-inner ring-1 ring-black/5 ${fitToWindow ? 'h-7 w-7 text-sm' : 'h-9 w-9'}`} role="img" style={{ backgroundColor: `${lane.color}18`, color: lane.color }}>
              {lane.emoji || '●'}
            </span>
            <div className="min-w-0">
              <h3 className={`block min-w-0 truncate font-black tracking-tight text-mn-text ${fitToWindow ? 'text-[0.8rem]' : 'text-[0.95rem]'}`}>
                {lane.label}
              </h3>
              <p className={`font-semibold uppercase text-mn-text-muted/70 ${fitToWindow ? 'text-[8px] tracking-[0.16em]' : 'text-[10px] tracking-[0.22em]'}`}>
                Stage
              </p>
            </div>
          </div>
          <span
            className={`flex-shrink-0 rounded-full border border-mn-border/35 font-black text-mn-text shadow-sm ${fitToWindow ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'}`}
            style={{ backgroundColor: `${lane.color}18` }}
          >
            {leads.length}
          </span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`mn-lane-well flex-1 overflow-y-auto rounded-[1.45rem] px-2.5 pb-3 pt-2.5 transition-all ${hasLeads ? 'space-y-3' : 'flex items-center justify-center'} ${
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

        {!hasLeads && (
          <div className="mn-soft-inset flex min-h-[10rem] w-full items-center justify-center rounded-[1.35rem] border border-dashed px-4 py-12 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-mn-text-muted/50">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}
