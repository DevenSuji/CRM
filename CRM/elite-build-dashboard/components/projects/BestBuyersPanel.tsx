"use client";

import Link from 'next/link';
import { Download, Phone, Target, Clock3, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/lib/utils/formatPrice';
import { BestBuyerResult } from '@/lib/utils/reverseMatcher';
import { relativeTime } from '@/lib/utils/formatTimestamp';
import { Timestamp } from 'firebase/firestore';

interface BestBuyersPanelProps {
  title: string;
  subtitle: string;
  buyers: BestBuyerResult[];
  emptyText: string;
  onExport?: () => void;
  compact?: boolean;
}

function toTimestamp(ms: number): Timestamp | null {
  return ms > 0 ? Timestamp.fromMillis(ms) : null;
}

export function BestBuyersPanel({
  title,
  subtitle,
  buyers,
  emptyText,
  onExport,
  compact = false,
}: BestBuyersPanelProps) {
  return (
    <div className="app-shell-panel rounded-[1.5rem] p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-heading">Reverse matching</p>
          <h3 className="mt-2 text-sm font-black uppercase tracking-wider text-mn-h3">{title}</h3>
          <p className="mt-1 text-xs text-mn-text-muted">{subtitle}</p>
        </div>
        {onExport && buyers.length > 0 && (
          <Button variant="secondary" onClick={onExport} icon={<Download className="h-4 w-4" />} className="px-4">
            Export Call List
          </Button>
        )}
      </div>

      {buyers.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-mn-border/50 bg-mn-surface/40 px-4 py-8 text-center text-sm text-mn-text-muted">
          {emptyText}
        </div>
      ) : (
        <div className={`mt-5 grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
          {buyers.map((buyer, index) => (
            <Link
              key={buyer.leadId}
              href={`/?leadId=${encodeURIComponent(buyer.leadId)}`}
              className="block rounded-2xl border border-mn-border/50 bg-mn-card/75 p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:border-mn-input-focus/40 hover:bg-mn-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mn-ring"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-mn-h2/10 px-2 text-[11px] font-black text-mn-h2">
                      #{index + 1}
                    </span>
                    <h4 className="truncate text-base font-black text-mn-h1">{buyer.leadName}</h4>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mn-text-muted">
                    <span className="rounded-full border border-mn-border/40 px-2.5 py-1 font-bold text-mn-text">{buyer.status}</span>
                    <span>{buyer.source}</span>
                    {buyer.phone && <span>• {buyer.phone}</span>}
                  </div>
                </div>
                <div className="rounded-2xl border border-mn-success/20 bg-mn-success/8 px-3 py-2 text-right">
                  <p className="text-[10px] font-black uppercase tracking-wider text-mn-success">Best Buyer Score</p>
                  <p className="text-xl font-black text-mn-success">{buyer.totalScore}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-mn-surface/65 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Budget Fit</p>
                  <p className="mt-1 font-bold text-mn-text">{formatPrice(buyer.bestPrice)}</p>
                </div>
                <div className="rounded-xl bg-mn-surface/65 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Matched Units</p>
                  <p className="mt-1 font-bold text-mn-text">
                    {buyer.unitLabel ? buyer.unitLabel : `${buyer.matchedUnitCount} unit${buyer.matchedUnitCount === 1 ? '' : 's'}`}
                  </p>
                </div>
                <div className="rounded-xl bg-mn-surface/65 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Urgency</p>
                  <p className="mt-1 font-bold text-mn-text">{buyer.urgencyLabel}</p>
                </div>
                <div className="rounded-xl bg-mn-surface/65 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Last Touch</p>
                  <p className="mt-1 font-bold text-mn-text">{relativeTime(toTimestamp(buyer.lastTouchMs)) || 'Unknown'}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-mn-border/40 px-2.5 py-1 font-bold text-mn-text">
                  <Target className="h-3 w-3 text-mn-h2" /> Match {buyer.baseMatchScore}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-mn-border/40 px-2.5 py-1 font-bold text-mn-text">
                  <CircleDot className="h-3 w-3 text-mn-warning" /> Engagement +{buyer.engagementPoints}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-mn-border/40 px-2.5 py-1 font-bold text-mn-text">
                  <Clock3 className="h-3 w-3 text-mn-success" /> Recency +{buyer.recencyPoints}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-mn-border/40 px-2.5 py-1 font-bold text-mn-text">
                  <Phone className="h-3 w-3 text-mn-h2" /> Stage +{buyer.stagePoints}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Why this buyer</p>
                <ul className="space-y-1.5 text-sm text-mn-text-muted">
                  {buyer.reasons.slice(0, compact ? 3 : 4).map(reason => (
                    <li key={reason} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-mn-h2/80" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
                {buyer.email && (
                  <p className="pt-1 text-xs text-mn-text-muted">
                    Contact: <span className="font-bold text-mn-text">{buyer.email}</span>
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
