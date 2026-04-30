"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Boxes, CheckCircle2, Clock3, Flame, IndianRupee, Sparkles } from 'lucide-react';
import type { DailyBriefing, DailyBriefingItem, DailyBriefingSeverity } from '@/lib/utils/dailyBriefing';
import { formatPrice } from '@/lib/utils/formatPrice';

interface Props {
  briefing: DailyBriefing;
}

const SEVERITY_CLASSES: Record<DailyBriefingSeverity, string> = {
  critical: 'border-mn-danger/25 bg-mn-danger/8 text-mn-danger',
  warning: 'border-mn-warning/25 bg-mn-warning/10 text-mn-warning',
  info: 'border-mn-info/25 bg-mn-info/8 text-mn-info',
  success: 'border-mn-success/25 bg-mn-success/8 text-mn-success',
};

function BriefingList({
  title,
  icon,
  items,
  emptyText,
}: {
  title: string;
  icon: ReactNode;
  items: DailyBriefingItem[];
  emptyText: string;
}) {
  return (
    <div className="app-shell-panel rounded-[1.5rem] p-5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-xs font-black uppercase tracking-wider text-mn-text-muted">{title}</h3>
      </div>
      <div className="mt-4 space-y-3">
        {items.slice(0, 3).map(item => (
          <div key={item.id} className="rounded-2xl border border-mn-border/35 bg-mn-surface/45 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-mn-text">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-mn-text-muted">{item.detail}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black ${SEVERITY_CLASSES[item.severity]}`}>
                {item.score != null ? item.score : item.severity}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-mn-text-muted">
              {item.owner && <span>{item.owner}</span>}
              {item.meta && <span>{item.meta}</span>}
              {item.value ? <span>{formatPrice(item.value)}</span> : null}
            </div>
            {(item.actionHref || item.secondaryHref) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {item.actionHref && (
                  <Link
                    href={item.actionHref}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-mn-border/70 bg-mn-card/80 px-3 py-1.5 text-xs font-black text-mn-text transition-all hover:-translate-y-0.5 hover:border-mn-input-focus/40 hover:bg-mn-card-hover"
                  >
                    {item.actionLabel || 'Open'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
                {item.secondaryHref && (
                  <Link
                    href={item.secondaryHref}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-mn-border/50 px-3 py-1.5 text-xs font-black text-mn-text-muted transition-all hover:-translate-y-0.5 hover:border-mn-input-focus/40 hover:text-mn-text"
                  >
                    {item.secondaryLabel || 'Open'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-mn-text-muted">{emptyText}</p>}
      </div>
    </div>
  );
}

export function DailyBriefingPanel({ briefing }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-mn-h2 uppercase tracking-wider">Daily Briefing</h2>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-mn-border/50 bg-mn-card/70 px-3 py-2 text-xs font-black text-mn-text-muted">
          <Sparkles className="h-3.5 w-3.5 text-mn-h2" />
          {new Date(briefing.generatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="app-shell-panel rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Hot Leads</p>
          <p className="mt-2 text-2xl font-black text-mn-danger">{briefing.summary.hotLeadCount}</p>
        </div>
        <div className="app-shell-panel rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Overdue</p>
          <p className="mt-2 text-2xl font-black text-mn-warning">{briefing.summary.overdueActionCount}</p>
        </div>
        <div className="app-shell-panel rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-mn-text-muted">New Matches</p>
          <p className="mt-2 text-2xl font-black text-mn-info">{briefing.summary.newMatchCount}</p>
        </div>
        <div className="app-shell-panel rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Inventory</p>
          <p className="mt-2 text-2xl font-black text-mn-success">{briefing.summary.inventoryOpportunityCount}</p>
        </div>
        <div className="app-shell-panel col-span-2 rounded-2xl p-4 lg:col-span-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Blocked Value</p>
          <p className="mt-2 text-2xl font-black text-mn-warning">{formatPrice(briefing.summary.blockedRevenueValue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <BriefingList
          title="Hot Leads Needing Action"
          icon={<Flame className="h-4 w-4 text-mn-danger" />}
          items={briefing.hotLeads}
          emptyText="No hot leads need action right now."
        />
        <BriefingList
          title="Overdue Actions"
          icon={<Clock3 className="h-4 w-4 text-mn-warning" />}
          items={briefing.overdueActions}
          emptyText="No SLA overdue actions right now."
        />
        <BriefingList
          title="New Property Matches"
          icon={<CheckCircle2 className="h-4 w-4 text-mn-info" />}
          items={briefing.newMatches}
          emptyText="No fresh property matches in the last 48 hours."
        />
        <BriefingList
          title="Inventory Opportunities"
          icon={<Boxes className="h-4 w-4 text-mn-success" />}
          items={briefing.inventoryOpportunities}
          emptyText="No inventory action stands out right now."
        />
        <div className="xl:col-span-2">
          <BriefingList
            title="Blocked Revenue"
            icon={<IndianRupee className="h-4 w-4 text-mn-warning" />}
            items={briefing.blockedRevenue}
            emptyText="No blocked revenue signals right now."
          />
        </div>
      </div>
    </div>
  );
}
