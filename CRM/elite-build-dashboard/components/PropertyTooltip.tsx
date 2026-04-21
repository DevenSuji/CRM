"use client";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Project } from '@/lib/types/project';
import { Building2, MapPin, Ruler, ShieldCheck } from 'lucide-react';
import { formatPrice } from '@/lib/utils/formatPrice';

interface PropertyTooltipProps {
  projectId: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

/** Shared in-memory cache so hovering the same property twice doesn't refetch. */
const projectCache = new Map<string, Project | null>();

/**
 * Balloon popup anchored above/below a tagged property card showing project
 * details (no images). Rendered via createPortal so it escapes the modal's
 * overflow-hidden clipping. Max height ~70vh with overflow-y-auto for tall content.
 */
export function PropertyTooltip({ projectId, anchorRect, onClose }: PropertyTooltipProps) {
  const [project, setProject] = useState<Project | null | undefined>(projectCache.get(projectId));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (projectCache.has(projectId)) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', projectId));
        const data = snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Project, 'id'>) }) : null;
        projectCache.set(projectId, data);
        if (!cancelled) setProject(data);
      } catch {
        projectCache.set(projectId, null);
        if (!cancelled) setProject(null);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Position: prefer above the anchor; flip below if there isn't room.
  const tooltipWidth = 340;
  const tooltipMaxHeight = Math.min(window.innerHeight * 0.7, 520);
  const spaceAbove = anchorRect.top;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const placeBelow = spaceBelow > spaceAbove;

  const top = placeBelow ? anchorRect.bottom + 8 : Math.max(8, anchorRect.top - tooltipMaxHeight - 8);
  let left = anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2;
  // Keep it inside viewport horizontally
  left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));

  const body = (
    <div
      ref={ref}
      onMouseEnter={e => e.stopPropagation()}
      onMouseLeave={onClose}
      className="fixed z-[100] bg-mn-card border border-mn-border rounded-xl shadow-2xl overflow-hidden"
      style={{ top, left, width: tooltipWidth, maxHeight: tooltipMaxHeight }}
    >
      <div className="overflow-y-auto" style={{ maxHeight: tooltipMaxHeight }}>
        {project === undefined ? (
          <div className="p-4 text-xs text-mn-text-muted">Loading…</div>
        ) : project === null ? (
          <div className="p-4 text-xs text-mn-danger">Project not found or has been deleted.</div>
        ) : (
          <>
            <div className="p-3 space-y-2">
              <div>
                <h4 className="text-sm font-black text-mn-text">{project.name}</h4>
                {project.builder && <p className="text-[11px] text-mn-text-muted">by {project.builder}</p>}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-mn-text-muted">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{project.location}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-mn-text-muted">
                <Building2 className="w-3 h-3 flex-shrink-0" />
                <span>{project.propertyType} &middot; {project.status}</span>
              </div>
              {project.priceRange && (project.priceRange.min > 0 || project.priceRange.max > 0) && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-mn-h2">
                  <span>{formatPrice(project.priceRange.min)} – {formatPrice(project.priceRange.max)}</span>
                </div>
              )}
              {typeof project.totalUnits === 'number' && project.totalUnits > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-mn-text-muted">
                  <Ruler className="w-3 h-3 flex-shrink-0" />
                  <span>{project.totalUnits} total units</span>
                </div>
              )}
              {project.project_fields && Object.keys(project.project_fields).length > 0 && (
                <div className="pt-2 border-t border-mn-border/30 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {Object.entries(project.project_fields).map(([k, v]) => {
                    if (v === null || v === undefined || v === '') return null;
                    const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    const display = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
                    return (
                      <div key={k} className="flex items-start gap-1 min-w-0">
                        {k === 'rera_approved' && v === true && <ShieldCheck className="w-3 h-3 text-mn-success flex-shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                          <span className="text-mn-text-muted">{label}: </span>
                          <span className="text-mn-text font-bold break-words">{display}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(body, document.body);
}
