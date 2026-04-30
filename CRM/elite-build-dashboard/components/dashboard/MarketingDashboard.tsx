"use client";
import { useState, useMemo } from 'react';
import { Lead } from '@/lib/types/lead';
import { MarketingTeam } from '@/lib/types/config';
import { computeMarketingMetrics, computeMarketingTimeSeries, TimePeriod } from '@/lib/utils/dashboardMetrics';
import { formatPrice } from '@/lib/utils/formatPrice';
import { MetricCard } from './MetricCard';
import { FunnelChart } from './FunnelChart';
import { MarketingConversionTrendChart } from './AnimatedCharts';
import {
  Users, IndianRupee, MapPin, Target, ThumbsDown, BarChart3, Settings,
} from 'lucide-react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const CHART_COLORS = ['#4F46E5', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899'];
const PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

interface Props {
  leads: Lead[];
  marketingTeams: MarketingTeam[];
}

function shortLabel(value: string, max = 16): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

export function MarketingDashboard({ leads, marketingTeams }: Props) {
  const activeTeams = marketingTeams.filter(t => t.active);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('monthly');

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

  const timeSeries = useMemo(() => {
    if (!team) return [];
    return computeMarketingTimeSeries(leads, team, timePeriod);
  }, [leads, team, timePeriod]);

  const sourceChartData = useMemo(() =>
    (metrics?.sourceBreakdown || []).slice(0, 7).map((item, i) => ({
      ...item,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    })),
    [metrics],
  );

  const campaignCurveData = useMemo(() =>
    (metrics?.campaignPerformance || []).slice(0, 8).map(item => ({
      ...item,
      shortName: shortLabel(item.name, 12),
    })),
    [metrics],
  );

  const projectTileData = useMemo(() => {
    const items = (metrics?.projectAttribution || []).slice(0, 8);
    const total = Math.max(1, items.reduce((sum, item) => sum + item.value, 0));
    return items.map((item, i) => ({
      ...item,
      fill: CHART_COLORS[(i + 2) % CHART_COLORS.length],
      share: (item.value / total) * 100,
    }));
  }, [metrics]);

  if (activeTeams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <BarChart3 className="w-16 h-16 text-mn-border mb-4" />
        <h3 className="text-lg font-bold text-mn-text mb-2">No Marketing Teams Configured</h3>
        <p className="text-sm text-mn-text-muted mb-6 text-center max-w-md">
          Add marketing teams in the Admin Console to track agency performance, CPL, campaign quality, and source conversion.
        </p>
        <Link
          href="/admin"
          className="flex items-center gap-2 px-4 py-2 bg-mn-brand text-mn-brand-contrast rounded-xl text-sm font-bold hover:bg-mn-brand/90 transition-colors"
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
      {(activeTeams.length > 1 || activeTeams.length === 1) && (
        <div className="app-shell-panel flex flex-wrap items-center gap-4 p-4">
          <label className="text-xs font-black text-mn-text-muted uppercase tracking-wider">Team:</label>
          {activeTeams.length > 1 ? (
            <select
              value={team.id}
              onChange={e => setSelectedTeamId(e.target.value)}
              className="rounded-xl border border-mn-input-border bg-mn-input-bg px-3 py-2 text-sm font-bold text-mn-text focus:outline-none focus:border-mn-input-focus"
            >
              {activeTeams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-sm font-black text-mn-text">{team.name}</span>
          )}
          <span className="text-xs text-mn-text-muted">
            Monthly spend: {formatPrice(team.monthly_spend)}
          </span>
          <div className="ml-auto flex overflow-hidden rounded-xl border border-mn-input-border bg-mn-input-bg">
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

      <div className="grid grid-cols-1 gap-4">
        <MarketingConversionTrendChart data={timeSeries} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="app-shell-panel p-5">
          <h3 className="text-xs font-black text-mn-text-muted uppercase tracking-wider mb-4">Source Breakdown</h3>
          {sourceChartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={sourceChartData} margin={{ left: 0, right: 12, top: 12, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    tick={{ fontSize: 10, fill: 'var(--mn-text-muted)' }}
                    tickFormatter={(value) => shortLabel(String(value), 10)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'var(--mn-text-muted)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--mn-card)', border: '1px solid var(--mn-border)', borderRadius: '12px', fontSize: '12px', color: 'var(--mn-text)' }}
                    formatter={(value) => [`${value} leads`, 'Leads']}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {sourceChartData.map((item) => (
                      <Cell key={item.name} fill={item.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2">
                {sourceChartData.map((item) => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                    <span className="text-[10px] font-bold text-mn-text-muted">{item.name} ({item.value})</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-mn-text-muted text-center py-16">No data yet</p>
          )}
        </div>

        <div className="app-shell-panel p-5">
          <h3 className="text-xs font-black text-mn-text-muted uppercase tracking-wider mb-4">Campaign Performance</h3>
          {campaignCurveData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={campaignCurveData} margin={{ left: 0, right: 12, top: 12, bottom: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="shortName"
                  interval={0}
                  tick={{ fontSize: 10, fill: 'var(--mn-text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: 'var(--mn-text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--mn-card)', border: '1px solid var(--mn-border)', borderRadius: '12px', fontSize: '12px', color: 'var(--mn-text)' }}
                  formatter={(value) => [`${value} leads`, 'Leads']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#6366F1"
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, fill: 'var(--mn-card)' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-mn-text-muted text-center py-16">No campaign data</p>
          )}
        </div>

        <div className="app-shell-panel p-5">
          <h3 className="text-xs font-black text-mn-text-muted uppercase tracking-wider mb-4">Project Attribution</h3>
          {projectTileData.length > 0 ? (
            <div className="flex h-[220px] flex-wrap gap-2 overflow-hidden rounded-2xl border border-mn-border/40 bg-mn-input-bg/40 p-2">
              {projectTileData.map(item => (
                <div
                  key={item.name}
                  className="flex min-h-[68px] min-w-[118px] flex-1 flex-col justify-between rounded-2xl p-3 text-white shadow-sm transition-transform hover:scale-[1.02]"
                  style={{
                    backgroundColor: item.fill,
                    flexBasis: `${Math.max(24, item.share)}%`,
                  }}
                  title={`${item.name}: ${item.value} leads`}
                >
                  <span className="text-[11px] font-black leading-tight">{shortLabel(item.name, 22)}</span>
                  <span className="text-2xl font-black leading-none">{item.value}</span>
                </div>
              ))}
            </div>
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
