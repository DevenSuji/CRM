"use client";
import { useState, useMemo } from 'react';
import { useFirestoreDoc } from '@/lib/hooks/useFirestoreDoc';
import { Lead } from '@/lib/types/lead';
import { CRMUser } from '@/lib/types/user';
import { MarketingTeam } from '@/lib/types/config';
import { InventoryUnit } from '@/lib/types/inventory';
import { DemandGapReport as DemandGapReportType } from '@/lib/types/intelligence';
import { computeInternalMetrics, computeTimeSeries, TimePeriod } from '@/lib/utils/dashboardMetrics';
import { computeInventoryIntelligence } from '@/lib/utils/inventoryIntelligence';
import { formatPrice } from '@/lib/utils/formatPrice';
import { MetricCard } from './MetricCard';
import { FunnelChart } from './FunnelChart';
import { Leaderboard } from './Leaderboard';
import { PipelineTrendChart, LeadsConversionsChart, CallsTrendChart, ExecutiveConversionTrendChart } from './AnimatedCharts';
import { DemandGapReport } from './DemandGapReport';
import { InventoryIntelligencePanel } from './InventoryIntelligencePanel';
import {
  Zap, MapPin, Bookmark, IndianRupee, TrendingUp, Clock,
  AlertTriangle, Phone, Timer, BarChart3, Activity, Flame, CalendarCheck,
  UserX, Target, ShieldAlert, Percent,
} from 'lucide-react';

const PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

interface Props {
  leads: Lead[];
  users: CRMUser[];
  inventory?: InventoryUnit[];
  marketingTeams?: MarketingTeam[];
  currentUid?: string;
  scopeUid?: string;
  allowUserScopeSelection?: boolean;
  showTeamInsights?: boolean;
  showRoi?: boolean;
  showDemandGap?: boolean;
}

export function InternalDashboard({
  leads,
  users,
  inventory = [],
  marketingTeams = [],
  currentUid,
  scopeUid,
  allowUserScopeSelection = true,
  showTeamInsights = true,
  showRoi = true,
  showDemandGap = false,
}: Props) {
  const [selectedUid, setSelectedUid] = useState<string>('');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('weekly');
  const { data: demandGapReport } = useFirestoreDoc<DemandGapReportType & { id: string }>(
    'demand_gap_reports',
    showDemandGap ? 'current' : '',
  );

  const salesUsers = useMemo(() =>
    users.filter(u => u.active && u.role !== 'viewer'),
    [users],
  );

  const marketingSpend = useMemo(() =>
    marketingTeams
      .filter(team => team.active)
      .reduce((sum, team) => sum + (team.monthly_spend || 0), 0),
    [marketingTeams],
  );
  const effectiveSelectedUid = allowUserScopeSelection
    ? (selectedUid || undefined)
    : (scopeUid || currentUid);

  const metrics = useMemo(() =>
    computeInternalMetrics(leads, users, effectiveSelectedUid, marketingSpend),
    [leads, users, effectiveSelectedUid, marketingSpend],
  );

  const timeSeries = useMemo(() =>
    computeTimeSeries(leads, timePeriod, effectiveSelectedUid),
    [leads, timePeriod, effectiveSelectedUid],
  );

  const inventoryIntelligence = useMemo(() =>
    computeInventoryIntelligence(inventory, leads),
    [inventory, leads],
  );

  const isTeamView = !effectiveSelectedUid;
  const selectedUserName = effectiveSelectedUid
    ? salesUsers.find(u => (u.uid || (u as any).id) === effectiveSelectedUid)?.name
    : null;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="app-shell-panel flex flex-wrap items-center gap-4 p-4">
        {allowUserScopeSelection && (
          <div className="flex items-center gap-3">
            <label className="text-xs font-black text-mn-text-muted uppercase tracking-wider">View:</label>
            <select
              value={selectedUid}
              onChange={e => setSelectedUid(e.target.value)}
              className="rounded-xl border border-mn-input-border bg-mn-input-bg px-3 py-2 text-sm font-bold text-mn-text focus:outline-none focus:border-mn-input-focus"
            >
              <option value="">All Team</option>
              {salesUsers.map(u => (
                <option key={u.uid || (u as any).id} value={u.uid || (u as any).id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-mn-text-muted" />
          <div className="flex overflow-hidden rounded-xl border border-mn-input-border bg-mn-input-bg">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setTimePeriod(opt.value)}
                className={`px-3 py-1.5 text-[11px] font-bold transition-all ${
                  timePeriod === opt.value
                    ? 'bg-mn-h2/15 text-mn-h2'
                    : 'text-mn-text-muted hover:text-mn-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Vital stats */}
      <div>
        <h2 className="text-sm font-black text-mn-h2 uppercase tracking-wider mb-4">
          Vital Stats
        </h2>
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${showRoi ? 'xl:grid-cols-7' : 'xl:grid-cols-6'}`}>
          <MetricCard
            title="Open Leads"
            value={metrics.vitalStats.openLeads}
            subtitle={`${metrics.vitalStats.totalLeads} total`}
            icon={<Activity className="w-5 h-5 text-mn-info" />}
            accent="text-mn-info"
          />
          <MetricCard
            title="Hot Leads"
            value={metrics.vitalStats.hotLeads}
            subtitle="AI-ready opportunities"
            icon={<Flame className="w-5 h-5 text-mn-danger" />}
            accent="text-mn-danger"
          />
          <MetricCard
            title="Expected Bookings"
            value={metrics.vitalStats.expectedBookings}
            subtitle="Weighted pipeline"
            icon={<Target className="w-5 h-5 text-mn-success" />}
            accent="text-mn-success"
          />
          <MetricCard
            title="Forecast Value"
            value={formatPrice(metrics.vitalStats.forecastRevenue)}
            subtitle="Probability weighted"
            icon={<IndianRupee className="w-5 h-5 text-mn-h2" />}
            accent="text-mn-h2"
          />
          {showRoi && (
            <MetricCard
              title="ROI"
              value={metrics.vitalStats.marketingSpend > 0 ? `${metrics.vitalStats.roiMultiple.toFixed(1)}x` : '--'}
              subtitle={metrics.vitalStats.marketingSpend > 0
                ? `${metrics.vitalStats.netRoiPercent.toFixed(0)}% net`
                : 'Add marketing spend'}
              icon={<Percent className="w-5 h-5 text-mn-success" />}
              accent={metrics.vitalStats.roiMultiple >= 1 ? 'text-mn-success' : 'text-mn-warning'}
            />
          )}
          <MetricCard
            title="Site Visits"
            value={metrics.vitalStats.scheduledSiteVisits}
            subtitle="Scheduled ahead"
            icon={<CalendarCheck className="w-5 h-5 text-mn-accent" />}
            accent="text-mn-accent"
          />
          <MetricCard
            title="Blocked Value"
            value={formatPrice(metrics.vitalStats.blockedRevenue)}
            subtitle={isTeamView ? `${metrics.vitalStats.unassignedLeads} unassigned` : 'At-risk pipeline'}
            icon={metrics.vitalStats.unassignedLeads > 0
              ? <UserX className="w-5 h-5 text-mn-warning" />
              : <ShieldAlert className="w-5 h-5 text-mn-warning" />}
            accent={metrics.vitalStats.blockedRevenue > 0 ? 'text-mn-warning' : 'text-mn-text'}
          />
        </div>
      </div>

      {/* Metric cards */}
      <div>
        <h2 className="text-sm font-black text-mn-h2 uppercase tracking-wider mb-4">
          {isTeamView ? 'Team Performance' : selectedUserName || 'My Performance'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <MetricCard
            title="Speed to Lead"
            value={metrics.speedToLeadMins > 0 ? `${metrics.speedToLeadMins}m` : '--'}
            subtitle="Avg. mins to first call"
            icon={<Zap className="w-5 h-5 text-mn-warning" />}
            accent={metrics.speedToLeadMins > 30 ? 'text-mn-danger' : 'text-mn-success'}
          />
          <MetricCard
            title="Lead to SV"
            value={`${metrics.leadToSVRatio.toFixed(1)}%`}
            icon={<MapPin className="w-5 h-5 text-mn-info" />}
            accent="text-mn-info"
          />
          <MetricCard
            title="SV to Booking"
            value={`${metrics.svToBookingRatio.toFixed(1)}%`}
            icon={<Bookmark className="w-5 h-5 text-mn-success" />}
            accent="text-mn-success"
          />
          <MetricCard
            title="Pipeline Value"
            value={formatPrice(metrics.pipelineValue)}
            icon={<IndianRupee className="w-5 h-5 text-mn-h2" />}
            accent="text-mn-h2"
          />
          <MetricCard
            title="Revenue Closed"
            value={formatPrice(metrics.revenueClosed)}
            icon={<TrendingUp className="w-5 h-5 text-mn-success" />}
            accent="text-mn-success"
          />
        </div>
      </div>

      {/* Second row of metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Avg. Closing Cycle"
          value={metrics.avgClosingCycleDays > 0 ? `${Math.round(metrics.avgClosingCycleDays)}d` : '--'}
          icon={<Clock className="w-5 h-5 text-mn-info" />}
          accent="text-mn-info"
        />
        <MetricCard
          title="Lead Leakage"
          value={`${metrics.leadLeakageRate.toFixed(1)}%`}
          subtitle="Stuck > 48h"
          icon={<AlertTriangle className="w-5 h-5 text-mn-danger" />}
          accent={metrics.leadLeakageRate > 20 ? 'text-mn-danger' : 'text-mn-text'}
        />
        <MetricCard
          title="Calls This Week"
          value={metrics.callsThisWeek}
          icon={<Phone className="w-5 h-5 text-mn-h2" />}
          accent="text-mn-h2"
        />
        <MetricCard
          title="Avg. Talk Time"
          value={metrics.avgTalkTimeMins > 0 ? `${metrics.avgTalkTimeMins}m` : '--'}
          icon={<Timer className="w-5 h-5 text-mn-accent" />}
          accent="text-mn-accent"
        />
      </div>

      {/* Animated Charts — 3 key visualizations */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <PipelineTrendChart data={timeSeries} />
        <ExecutiveConversionTrendChart data={timeSeries} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <LeadsConversionsChart data={timeSeries} />
        <CallsTrendChart data={timeSeries} />
      </div>

      {showTeamInsights && isTeamView && (
        <InventoryIntelligencePanel intelligence={inventoryIntelligence} />
      )}

      {/* Aging Leads table */}
      {metrics.agingLeads.length > 0 && (
        <div>
          <h2 className="text-sm font-black text-mn-h2 uppercase tracking-wider mb-4">Aging Leads</h2>
          <div className="app-shell-panel overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-mn-border/40">
                  <th className="text-left px-5 py-3 text-[10px] font-black text-mn-text-muted uppercase tracking-wider">Lead</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-mn-text-muted uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-mn-text-muted uppercase tracking-wider">Assigned To</th>
                  <th className="text-right px-5 py-3 text-[10px] font-black text-mn-text-muted uppercase tracking-wider">Hours Stuck</th>
                </tr>
              </thead>
              <tbody>
                {metrics.agingLeads.map(lead => (
                  <tr key={lead.id} className="border-b border-mn-border/20 hover:bg-mn-card-hover transition-colors">
                    <td className="px-5 py-3 text-sm font-bold text-mn-text">{lead.name}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-bold px-2 py-1 rounded-lg bg-mn-warning/15 text-mn-warning">{lead.status}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-mn-text-muted">{lead.assignedTo}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-sm font-black ${lead.hoursStuck > 96 ? 'text-mn-danger' : 'text-mn-warning'}`}>
                        {lead.hoursStuck}h
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showDemandGap && isTeamView && (
        <DemandGapReport report={demandGapReport} />
      )}

      {/* Funnel */}
      <FunnelChart stages={metrics.funnelStages} title="Lead Funnel" />

      {/* Leaderboard — only in team view */}
      {showTeamInsights && isTeamView && (
        <Leaderboard leads={leads} users={users} currentUid={currentUid} />
      )}
    </div>
  );
}
