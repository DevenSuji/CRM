"use client";
import type { CSSProperties } from 'react';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Lead } from '@/lib/types/lead';
import { LeadDetailPopover } from '@/components/LeadDetailPopover';
import { contrastingTextColor } from '@/lib/utils/colorUtils';
import { SLAConfig } from '@/lib/types/config';
import { computeLeadIntelligence } from '@/lib/utils/leadIntelligence';
import { Phone, GripVertical, Palette, X, UserRound, Sparkles } from 'lucide-react';

interface KanbanCardProps {
  lead: Lead;
  onClickLead?: (lead: Lead) => void;
  availableColors?: string[];
  slaConfig?: SLAConfig;
  assigneeName?: string;
}

function ColorPicker({
  leadId,
  currentColor,
  colors,
}: {
  leadId: string;
  currentColor?: string;
  colors: string[];
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const iconColor = currentColor ? contrastingTextColor(currentColor) : undefined;

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = buttonRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panelWidth = 178;
      const panelHeight = 116;
      const padding = 12;
      const left = Math.min(
        window.innerWidth - panelWidth - padding,
        Math.max(padding, rect.left),
      );
      let top = rect.bottom + 8;
      if (top + panelHeight > window.innerHeight - padding) {
        top = Math.max(padding, rect.top - panelHeight - 8);
      }
      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const handleSelect = async (color: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    try {
      await updateDoc(doc(db, 'leads', leadId), {
        card_color: color,
      });
    } catch (err) {
      console.error('Failed to set card color:', err);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-all hover:scale-105 ${
          currentColor
            ? 'border-white/35 bg-white/20'
            : 'border-mn-border/60 bg-mn-card/90 text-mn-text-muted hover:border-mn-h2/45 hover:text-mn-h2'
        }`}
        style={currentColor ? {
          color: iconColor,
          backgroundColor: iconColor === '#FFFFFF' ? 'rgba(255,255,255,0.18)' : 'rgba(5,14,60,0.12)',
          borderColor: iconColor === '#FFFFFF' ? 'rgba(255,255,255,0.35)' : 'rgba(5,14,60,0.2)',
        } : undefined}
        title="Set card color"
      >
        {currentColor ? (
          <span
            className="h-2.5 w-2.5 rounded-full border shadow-inner"
            style={{
              backgroundColor: currentColor,
              borderColor: iconColor === '#FFFFFF' ? 'rgba(255,255,255,0.78)' : 'rgba(5,14,60,0.45)',
            }}
          />
        ) : (
          <Palette className="h-3 w-3" />
        )}
      </button>

      {open && position && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="app-shell-panel fixed z-[90] grid w-[178px] grid-cols-5 gap-2 rounded-2xl p-2.5 shadow-2xl"
          style={{ top: position.top, left: position.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {colors.map((color) => (
            <button
              key={color}
              onClick={(e) => handleSelect(color, e)}
              className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                currentColor === color ? 'border-mn-text ring-2 ring-mn-h2/40' : 'border-mn-border/30'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          {currentColor && (
            <button
              onClick={(e) => handleSelect(null, e)}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-mn-border bg-mn-card transition-colors hover:bg-mn-danger/10"
              title="Remove color"
            >
              <X className="w-3 h-3 text-mn-text-muted" />
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

export function KanbanCard({ lead, onClickLead, availableColors = [], assigneeName }: KanbanCardProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { lead } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const raw = lead.raw_data;
  const cardColor = lead.card_color || null;
  const textColor = cardColor ? contrastingTextColor(cardColor) : undefined;
  const mutedTextColor = cardColor
    ? (textColor === '#FFFFFF' ? 'rgba(255,255,255,0.78)' : 'rgba(5,14,60,0.72)')
    : undefined;
  const aiPillStyle: CSSProperties | undefined = cardColor && textColor ? {
    backgroundColor: textColor === '#FFFFFF' ? 'rgba(255,255,255,0.9)' : 'rgba(5,14,60,0.88)',
    border: `1px solid ${textColor === '#FFFFFF' ? 'rgba(255,255,255,0.95)' : 'rgba(5,14,60,0.9)'}`,
    color: textColor === '#FFFFFF' ? '#050E3C' : '#FFFFFF',
  } : undefined;
  const intelligence = useMemo(() => computeLeadIntelligence(lead), [lead]);

  // Reposition popover after it renders to prevent viewport overflow
  useEffect(() => {
    if (!showPopover || !popoverRef.current || !cardRef.current) return;
    const popoverEl = popoverRef.current;
    const cardRect = cardRef.current.getBoundingClientRect();
    const popoverRect = popoverEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const padding = 12;

    // Desired top: align with card top
    let top = cardRect.top;

    // If popover overflows bottom of viewport, shift up
    if (top + popoverRect.height > viewportHeight - padding) {
      top = viewportHeight - popoverRect.height - padding;
    }

    // If that pushes it above viewport top, clamp to top
    if (top < padding) {
      top = padding;
    }

    setPopoverPos({ top, left: cardRect.right + 12 });
  }, [showPopover]);

  const handleMouseEnter = useCallback(() => {
    hoverTimeout.current = setTimeout(() => {
      setShowPopover(true);
    }, 300);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setShowPopover(false);
    setPopoverPos(null);
  }, []);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Don't open if user is dragging
    if (isDragging) return;
    // Don't open if clicking the drag handle
    const target = e.target as HTMLElement;
    if (target.closest('[data-drag-handle]')) return;
    onClickLead?.(lead);
  }, [isDragging, lead, onClickLead]);

  return (
    <div
      ref={cardRef}
      className={`relative group ${isDragging ? 'z-50 opacity-80' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={setNodeRef}
        style={{
          ...style,
          ...(cardColor ? { backgroundColor: cardColor, color: textColor } : {}),
        }}
        onClick={handleCardClick}
        className={`cursor-pointer rounded-[1.1rem] border p-2.5 shadow-sm transition-all backdrop-blur-xl ${
          cardColor
            ? `border-black/8 shadow-[0_14px_34px_rgba(18,39,33,0.1)] ${isDragging ? 'scale-105 shadow-2xl' : 'hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(18,39,33,0.14)]'}`
            : `mn-kanban-card ${
                isDragging
                  ? 'scale-105 border-mn-h2/50 shadow-2xl shadow-mn-h2/20'
                  : 'hover:-translate-y-0.5 hover:border-mn-input-focus/45 hover:shadow-[0_18px_40px_rgba(18,39,33,0.12)]'
              }`
        }`}
      >
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1">
              <div
                data-drag-handle
                {...attributes}
                {...listeners}
                className="flex h-5 w-4 cursor-grab items-center justify-center rounded-full active:cursor-grabbing"
                style={{ color: mutedTextColor || undefined }}
                title="Drag lead"
              >
                <GripVertical className={`h-3.5 w-3.5 ${!cardColor ? 'text-mn-text-muted/45 hover:text-mn-text-muted' : 'opacity-55 hover:opacity-80'}`} />
              </div>
              {availableColors.length > 0 && (
                <ColorPicker leadId={lead.id} currentColor={cardColor || undefined} colors={availableColors} />
              )}
            </div>
            <span
              className="flex min-w-[38px] items-center justify-center gap-1 rounded-full border border-mn-h2/12 bg-mn-card/90 px-1.5 py-0.5 text-[9px] font-black leading-none text-mn-h1 shadow-sm"
              title={`${intelligence.temperature}: ${intelligence.nextBestAction}`}
              style={aiPillStyle}
            >
              <Sparkles className="h-2.5 w-2.5" />
              <span>AI</span>
              <span>{intelligence.score}</span>
            </span>
          </div>
          <h4 className={`min-w-0 truncate text-[14px] font-black leading-tight tracking-tight ${!cardColor ? 'text-mn-text' : ''}`}>
            {raw.lead_name}
          </h4>
          <div className="space-y-1.5 text-[11px] font-semibold leading-tight" style={{ color: mutedTextColor }}>
            <div className="flex min-w-0 items-center gap-1.5">
              <Phone className={`h-3.5 w-3.5 flex-shrink-0 ${!cardColor ? 'text-mn-text-muted' : ''}`} />
              <span className={`min-w-0 truncate ${!cardColor ? 'text-mn-text-muted' : ''}`}>{raw.phone || 'Phone pending'}</span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <UserRound className={`h-3.5 w-3.5 flex-shrink-0 ${!cardColor ? 'text-mn-text-muted' : ''}`} />
              <span className={`min-w-0 truncate ${!cardColor ? 'text-mn-text-muted' : ''}`}>
                {assigneeName || (lead.assigned_to ? 'Assigned' : 'Unassigned')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Popover on hover — rendered via portal to escape overflow clipping */}
      {showPopover && !isDragging && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[60] pointer-events-none"
          style={{
            top: popoverPos?.top ?? -9999,
            left: popoverPos?.left ?? -9999,
            maxHeight: 'calc(100vh - 24px)',
            overflow: 'auto',
          }}
        >
          <LeadDetailPopover lead={lead} />
        </div>,
        document.body,
      )}
    </div>
  );
}
