"use client";

import type { ReactNode } from 'react';
import { AlertTriangle, Building2, IndianRupee, MapPin } from 'lucide-react';
import { DemandGapReport as DemandGapReportType } from '@/lib/types/intelligence';

interface Props {
  report: DemandGapReportType | null;
}

function CountList({
  title,
  icon,
  items,
  emptyText,
}: {
  title: string;
  icon: ReactNode;
  items: { key: string; label: string; count: number }[];
  emptyText: string;
}) {
  return (
    <div className="app-shell-panel rounded-[1.5rem] p-5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-black uppercase tracking-wider text-mn-h3">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-mn-text-muted">{emptyText}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map(item => (
            <div key={item.key} className="flex items-center justify-between rounded-xl bg-mn-surface/55 px-3 py-2.5">
              <span className="text-sm font-medium text-mn-text">{item.label}</span>
              <span className="rounded-full bg-mn-h2/10 px-2.5 py-1 text-xs font-black text-mn-h2">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DemandGapReport({ report }: Props) {
  if (!report) return null;

  return (
    <div className="space-y-4">
      <div className="app-shell-panel rounded-[1.5rem] p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-heading">Management intelligence</p>
            <h2 className="mt-2 text-sm font-black uppercase tracking-wider text-mn-h3">Demand Gap Report</h2>
            <p className="mt-1 text-sm text-mn-text-muted">
              Leads that currently have no auto-match, grouped by the strongest blocker in the inventory funnel.
            </p>
          </div>
          <div className="rounded-2xl border border-mn-warning/20 bg-mn-warning/8 px-4 py-3 text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-mn-warning">No-Match Leads</p>
            <p className="text-2xl font-black text-mn-warning">{report.totalNoMatchLeads}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <CountList
          title="Reason Breakdown"
          icon={<AlertTriangle className="w-4 h-4 text-mn-warning" />}
          items={report.reasons}
          emptyText="No no-match reasons recorded yet."
        />
        <CountList
          title="Top Missing Demand"
          icon={<Building2 className="w-4 h-4 text-mn-h2" />}
          items={report.interests}
          emptyText="No unmet property-type demand recorded yet."
        />
        <CountList
          title="Locality Gaps"
          icon={<MapPin className="w-4 h-4 text-mn-info" />}
          items={report.locations}
          emptyText="No location demand gaps recorded yet."
        />
        <CountList
          title="Budget Bands"
          icon={<IndianRupee className="w-4 h-4 text-mn-success" />}
          items={report.budgetBands}
          emptyText="No budget-band demand gaps recorded yet."
        />
      </div>

      <div className="app-shell-panel rounded-[1.5rem] p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-mn-h3">Recent No-Match Leads</h3>
            <p className="mt-1 text-sm text-mn-text-muted">Useful for checking if the same buyer pattern is repeating.</p>
          </div>
          <p className="text-xs text-mn-text-muted">Updated {new Date(report.updated_at).toLocaleString('en-IN')}</p>
        </div>

        {report.recentLeads.length === 0 ? (
          <p className="mt-4 text-sm text-mn-text-muted">No unmatched active leads right now.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-mn-border/40">
            <table className="w-full">
              <thead>
                <tr className="border-b border-mn-border/30 bg-mn-surface/40">
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Lead</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Need</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Budget</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Location</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-mn-text-muted">Blocker</th>
                </tr>
              </thead>
              <tbody>
                {report.recentLeads.map(lead => (
                  <tr key={lead.leadId} className="border-b border-mn-border/20 last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-mn-text">{lead.leadName}</p>
                      <p className="text-xs text-mn-text-muted">{lead.status} · {lead.source}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-mn-text">{lead.interestSummary}</td>
                    <td className="px-4 py-3 text-sm text-mn-text">{lead.budgetBand}</td>
                    <td className="px-4 py-3 text-sm text-mn-text">{lead.location || 'Unknown'}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-mn-warning">{lead.reasonLabel}</p>
                      <p className="text-xs text-mn-text-muted">{lead.summary}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
