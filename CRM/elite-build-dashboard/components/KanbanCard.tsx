"use client";
import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Lead } from '@/lib/types/lead';
import { Badge } from '@/components/ui/Badge';
import { LeadDetailPopover } from '@/components/LeadDetailPopover';
import { relativeTime } from '@/lib/utils/formatTimestamp';
import { formatPrice } from '@/lib/utils/formatPrice';
import { contrastingTextColor } from '@/lib/utils/colorUtils';
import { Phone, Target, GripVertical, Palette, X, Building2, Megaphone } from 'lucide-react';

interface KanbanCardProps {
  lead: Lead;
  onClickLead?: (lead: Lead) => void;
  availableColors?: string[];
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
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="mn-soft-inset flex h-6 w-6 items-center justify-center rounded-full opacity-0 transition-all group-hover:opacity-100"
        style={{ backgroundColor: currentColor || 'transparent' }}
        title="Set card color"
      >
        {!currentColor && <Palette className="w-3 h-3 text-mn-text-muted" />}
      </button>

      {open && (
        <div
          className="app-shell-panel absolute right-0 top-8 z-50 flex w-[168px] flex-wrap gap-1.5 rounded-2xl p-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          {colors.map((color) => (
            <button
              key={color}
              onClick={(e) => handleSelect(color, e)}
              className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                currentColor === color ? 'border-mn-text ring-2 ring-mn-h2/40' : 'border-mn-border/30'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          {currentColor && (
            <button
              onClick={(e) => handleSelect(null, e)}
              className="w-6 h-6 rounded-full border-2 border-mn-border bg-mn-card flex items-center justify-center hover:bg-mn-danger/10 transition-colors"
              title="Remove color"
            >
              <X className="w-3 h-3 text-mn-text-muted" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const SOURCE_COLORS: Record<string, string> = {
  'Meta Ads': '#1877F2',
  'Facebook': '#1877F2',
  'Google Ads': '#34A853',
  'Google': '#34A853',
  'Website': '#9290C3',
  'Instagram': '#E4405F',
};

function SourceBadge({
  source,
  cardColor,
  mutedTextColor,
}: {
  source: string;
  cardColor: string | null;
  mutedTextColor?: string;
}) {
  const dotColor = SOURCE_COLORS[source] || (cardColor ? undefined : '#9290C3');
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      {dotColor && (
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
      )}
      <span className={!cardColor ? 'text-mn-text-muted' : ''} style={{ color: mutedTextColor }}>
        {source}
      </span>
    </div>
  );
}

export function KanbanCard({ lead, onClickLead, availableColors = [] }: KanbanCardProps) {
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
    ? (textColor === '#FFFFFF' ? 'rgba(255,255,255,0.6)' : 'rgba(5,14,60,0.5)')
    : undefined;

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
        className={`cursor-pointer rounded-[1.45rem] border p-4 shadow-sm transition-all backdrop-blur-xl ${
          cardColor
            ? `border-black/8 shadow-[0_14px_34px_rgba(18,39,33,0.1)] ${isDragging ? 'scale-105 shadow-2xl' : 'hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(18,39,33,0.14)]'}`
            : `mn-kanban-card ${
                isDragging
                  ? 'scale-105 border-mn-h2/50 shadow-2xl shadow-mn-h2/20'
                  : 'hover:-translate-y-0.5 hover:border-mn-input-focus/45 hover:shadow-[0_18px_40px_rgba(18,39,33,0.12)]'
              }`
        }`}
      >
        <div className="flex items-start gap-2">
          <div
            data-drag-handle
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab active:cursor-grabbing"
            style={{ color: mutedTextColor || undefined }}
          >
            <GripVertical className={`w-4 h-4 ${!cardColor ? 'text-mn-text-muted/30 hover:text-mn-text-muted' : 'opacity-40 hover:opacity-70'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className={`truncate text-[15px] font-black tracking-tight ${!cardColor ? 'text-mn-text' : ''}`}>{raw.lead_name}</h4>
                <p className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${!cardColor ? 'text-mn-text-muted/60' : ''}`} style={{ color: mutedTextColor }}>
                  Lead card
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {availableColors.length > 0 && (
                  <ColorPicker leadId={lead.id} currentColor={cardColor || undefined} colors={availableColors} />
                )}
                {lead.ai_audit && (
                  <Badge
                    variant={lead.ai_audit.urgency === 'High' ? 'danger' : lead.ai_audit.urgency === 'Medium' ? 'warning' : 'info'}
                    className="text-[10px]"
                  >
                    {lead.ai_audit.urgency}
                  </Badge>
                )}
              </div>
            </div>

            {/* Phone */}
            <div className="mt-1.5 flex items-center gap-1.5 text-xs" style={{ color: mutedTextColor }}>
              <Phone className={`w-3 h-3 ${!cardColor ? 'text-mn-text-muted' : ''}`} />
              <span className={!cardColor ? 'text-mn-text-muted' : ''}>{raw.phone}</span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {raw.budget > 0 && (
                <span className={`rounded-full border px-2.5 py-1 text-xs font-black shadow-sm ${!cardColor ? 'border-mn-h2/10 bg-mn-h2/8 text-mn-h2' : 'border-black/5 bg-white/18'}`}>{formatPrice(raw.budget)}</span>
              )}
              {lead.ai_audit?.intent && (
                <Badge variant="default" className="text-[10px]">
                  {lead.ai_audit.intent}
                </Badge>
              )}
            </div>

            {/* Interested property from ad */}
            {lead.interested_properties && lead.interested_properties.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 rounded-2xl border border-black/5 bg-mn-h2/8 px-2.5 py-2">
                <Building2 className={`w-3 h-3 flex-shrink-0 ${!cardColor ? 'text-mn-h2' : ''}`} />
                <span className={`text-[10px] font-bold truncate ${!cardColor ? 'text-mn-h2' : ''}`}>
                  {lead.interested_properties.map(p => p.projectName).join(', ')}
                </span>
              </div>
            )}

            {/* Campaign source badge */}
            {lead.utm?.campaign && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <Megaphone className={`w-3 h-3 flex-shrink-0 ${!cardColor ? 'text-mn-text-muted' : ''}`} />
                <span className={`text-[10px] truncate ${!cardColor ? 'text-mn-text-muted' : ''}`} style={{ color: mutedTextColor }}>
                  {lead.utm.campaign}
                </span>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-mn-border/40 pt-3" style={{ borderTopColor: cardColor ? (textColor === '#FFFFFF' ? 'rgba(255,255,255,0.16)' : 'rgba(5,14,60,0.1)') : undefined }}>
              {lead.suggested_plot ? (
                <div className="flex items-center gap-1 text-[10px]" style={{ color: cardColor ? textColor : undefined }}>
                  <Target className={`w-3 h-3 ${!cardColor ? 'text-mn-success' : ''}`} />
                  <span className={`font-bold ${!cardColor ? 'text-mn-success' : ''}`}>Matched</span>
                </div>
              ) : (
                <SourceBadge source={lead.source} cardColor={cardColor} mutedTextColor={mutedTextColor} />
              )}
              <span className={`text-[10px] ${!cardColor ? 'text-mn-text-muted/60' : ''}`} style={{ color: mutedTextColor }}>
                {relativeTime(lead.created_at)}
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
