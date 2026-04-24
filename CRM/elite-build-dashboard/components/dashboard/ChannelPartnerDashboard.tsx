"use client";
import { useMemo, useState } from 'react';
import { Lead } from '@/lib/types/lead';
import { computeInternalMetrics, computeTimeSeries, TimePeriod } from '@/lib/utils/dashboardMetrics';
import { formatPrice } from '@/lib/utils/formatPrice';
import { MetricCard } from './MetricCard';
import { FunnelChart } from './FunnelChart';
import { PipelineTrendChart, LeadsConversionsChart } from './AnimatedCharts';
import {
  Zap, MapPin, Bookmark, IndianRupee, TrendingUp, Clock,
  AlertTriangle, BarChart3,
} from 'lucide-react';

const PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

interface Props {
  leads: Lead[];
}

export function ChannelPartnerDashboard({ leads }: Props) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('weekly');

  const metrics = useMemo(() => computeInternalMetrics(leads, []), [leads]);
  const timeSeries = useMemo(() => computeTimeSeries(leads, timePeriod), [leads, timePeriod]);

  return (
    <div className="space-y-6">
      {/* Period picker */}
      <div className="app-shell-panel flex items-center gap-2 p-4">
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

      {/* Metric cards */}
      <div>
        <h2 className="text-sm font-black text-mn-h2 uppercase tracking-wider mb-4">
          My Performance
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

      {/* Second row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          title="Total Leads"
          value={leads.length}
          icon={<TrendingUp className="w-5 h-5 text-mn-h2" />}
          accent="text-mn-h2"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <PipelineTrendChart data={timeSeries} />
        <LeadsConversionsChart data={timeSeries} />
      </div>

      {/* Funnel */}
      <FunnelChart stages={metrics.funnelStages} title="My Lead Funnel" />
    </div>
  );
}
