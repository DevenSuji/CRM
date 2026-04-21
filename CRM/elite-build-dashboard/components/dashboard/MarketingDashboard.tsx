"use client";
import { useState, useMemo } from 'react';
import { Lead } from '@/lib/types/lead';
import { MarketingTeam } from '@/lib/types/config';
import { computeMarketingMetrics } from '@/lib/utils/dashboardMetrics';
import { formatPrice } from '@/lib/utils/formatPrice';
import { MetricCard } from './MetricCard';
import { FunnelChart } from './FunnelChart';
import {
  Users, IndianRupee, MapPin, Target, ThumbsDown, BarChart3, Settings,
} from 'lucide-react';
import Link from 'next/link';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';

const PIE_COLORS = ['#4F46E5', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899'];
const BAR_COLORS = ['#6366F1', '#818CF8', '#A5B4FC', '#C7D2FE', '#8B5CF6', '#7C3AED'];

interface Props {
  leads: Lead[];
  marketingTeams: MarketingTeam[];
}

export function MarketingDashboard({ leads, marketingTeams }: Props) {
  const activeTeams = marketingTeams.filter(t => t.active);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');

  // Auto-select first team
  const team = useMemo(() => {
    if (activeTeams.length === 0) return null;
    if (selectedTeamId) return activeTeams.find(t => t.id === selectedTeamId) || activeTeams[0];
    return activeTeams[0];
  }, [activeTeams, selectedTeamId]);

  const metrics = useMemo(() => {
    if (!team) return null;
    return computeMarketingMetrics(leads, team);
  }, [leads, team]);

  if (activeTeams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BarChart3 className="w-16 h-16 text-mn-border mb-4" />
        <h3 className="text-lg font-bold text-mn-text mb-2">No Marketing Teams Configured</h3>
        <p className="text-sm text-mn-text-muted mb-6 text-center max-w-md">
          Add marketing teams in the Admin Console to track agency performance, CPL, and campaign ROI.
        </p>
        <Link
          href="/admin"
          className="flex items-center gap-2 px-4 py-2 bg-mn-h2 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
        >
          <Settings className="w-4 h-4" />
          Go to Admin Console
        </Link>
      </div>
    );
  }

  if (!metrics || !team) return null;

  return (
    <div className="space-y-6">
      {/* Team selector */}
      {activeTeams.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-xs font-black text-mn-text-muted uppercase tracking-wider">Team:</label>
          <select
            value={team.id}
            onChange={e => setSelectedTeamId(e.target.value)}
            className="px-3 py-2 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm font-bold text-mn-text focus:outline-none focus:border-mn-input-focus"
          >
            {activeTeams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <span className="text-xs text-mn-text-muted">
            Monthly spend: {formatPrice(team.monthly_spend)}
          </span>
        </div>
      )}

      {/* Metric cards row 1 */}
      <div>
        <h2 className="text-sm font-black text-mn-h2 uppercase tracking-wider mb-4">
          {team.name} — Performance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <MetricCard
            title="Total Leads"
            value={metrics.totalLeads}
            icon={<Users className="w-5 h-5 text-mn-h2" />}
            accent="text-mn-h2"
          />
          <MetricCard
            title="Cost Per Lead"
            value={metrics.cpl > 0 ? formatPrice(Math.round(metrics.cpl)) : '--'}
            icon={<IndianRupee className="w-5 h-5 text-mn-warning" />}
            accent="text-mn-warning"
          />
          <MetricCard
            title="Cost Per Site Visit"
            value={metrics.costPerSiteVisit > 0 ? formatPrice(Math.round(metrics.costPerSiteVisit)) : '--'}
            icon={<MapPin className="w-5 h-5 text-mn-info" />}
            accent="text-mn-info"
          />
          <MetricCard
            title="Lead to SV Ratio"
            value={`${metrics.leadToSVRatio.toFixed(1)}%`}
            icon={<Target className="w-5 h-5 text-mn-success" />}
            accent="text-mn-success"
          />
          <MetricCard
            title="Lead Quality"
            value={`${metrics.leadQualityScore.toFixed(0)}%`}
            subtitle="High urgency"
            icon={<BarChart3 className="w-5 h-5 text-mn-accent" />}
            accent="text-mn-accent"
          />
          <MetricCard
            title="Rejection Rate"
            value={`${metrics.rejectionRate.toFixed(1)}%`}
            icon={<ThumbsDown className="w-5 h-5 text-mn-danger" />}
            accent={metrics.rejectionRate > 30 ? 'text-mn-danger' : 'text-mn-text'}
          />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Source breakdown pie */}
        <div className="bg-mn-card border border-mn-border rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-black text-mn-text-muted uppercase tracking-wider mb-4">Source Breakdown</h3>
          {metrics.sourceBreakdown.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={metrics.sourceBreakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                    {metrics.sourceBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--mn-card)', border: '1px solid var(--mn-border)', borderRadius: '12px', fontSize: '12px', color: 'var(--mn-text)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2">
                {metrics.sourceBreakdown.map((item, i) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-[10px] font-bold text-mn-text-muted">{item.name} ({item.value})</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-mn-text-muted text-center py-16">No data yet</p>
          )}
        </div>

        {/* Campaign performance bar chart */}
        <div className="bg-mn-card border border-mn-border rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-black text-mn-text-muted uppercase tracking-wider mb-4">Campaign Performance</h3>
          {metrics.campaignPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, metrics.campaignPerformance.length * 40)}>
              <BarChart data={metrics.campaignPerformance.slice(0, 8)} layout="vertical" margin={{ left: 100, right: 10, top: 5, bottom: 5 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--mn-text-muted)' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--mn-text)' }} width={100} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--mn-card)', border: '1px solid var(--mn-border)', borderRadius: '12px', fontSize: '12px', color: 'var(--mn-text)' }}
                  formatter={(value) => [`${value} leads`, 'Leads']}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {metrics.campaignPerformance.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-mn-text-muted text-center py-16">No campaign data</p>
          )}
        </div>

        {/* Project attribution bar chart */}
        <div className="bg-mn-card border border-mn-border rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-black text-mn-text-muted uppercase tracking-wider mb-4">Project Attribution</h3>
          {metrics.projectAttribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, metrics.projectAttribution.length * 40)}>
              <BarChart data={metrics.projectAttribution.slice(0, 8)} layout="vertical" margin={{ left: 100, right: 10, top: 5, bottom: 5 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--mn-text-muted)' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--mn-text)' }} width={100} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--mn-card)', border: '1px solid var(--mn-border)', borderRadius: '12px', fontSize: '12px', color: 'var(--mn-text)' }}
                  formatter={(value) => [`${value} leads`, 'Leads']}
                />
                <Bar dataKey="value" fill="#8B5CF6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-mn-text-muted text-center py-16">No project data</p>
          )}
        </div>
      </div>

      {/* Funnel */}
      <FunnelChart stages={metrics.funnelStages} title="Lead Funnel" />
    </div>
  );
}
