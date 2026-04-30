"use client";
import { MarketingTimeSeriesPoint, TimeSeriesPoint } from '@/lib/utils/dashboardMetrics';
import { formatPrice } from '@/lib/utils/formatPrice';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

function ChartCard({ title, children }: ChartCardProps) {
  return (
    <div className="bg-mn-card border border-mn-border rounded-2xl p-5 shadow-sm">
      <h3 className="text-xs font-black text-mn-text-muted uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-mn-card, #1a1b2e)',
  border: '1px solid var(--color-mn-border, #2a2b3e)',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: 700,
};

/* ==================== Pipeline & Revenue Trend ==================== */

interface PipelineTrendProps {
  data: TimeSeriesPoint[];
}

export function PipelineTrendChart({ data }: PipelineTrendProps) {
  if (data.length === 0) return null;
  return (
    <ChartCard title="Pipeline & Revenue Trend">
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="gradPipeline" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22C55E" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => formatPrice(v)}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => [
              formatPrice(Number(value)),
              name === 'pipelineValue' ? 'Pipeline' : 'Revenue',
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', fontWeight: 700 }}
            formatter={(value) => value === 'pipelineValue' ? 'Pipeline Value' : 'Revenue Closed'}
          />
          <Area
            type="monotone"
            dataKey="pipelineValue"
            stroke="#6366F1"
            strokeWidth={2}
            fill="url(#gradPipeline)"
            animationDuration={1200}
            animationEasing="ease-out"
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#22C55E"
            strokeWidth={2}
            fill="url(#gradRevenue)"
            animationDuration={1200}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ==================== Leads & Conversions Bar Chart ==================== */

interface LeadsConversionsProps {
  data: TimeSeriesPoint[];
}

export function LeadsConversionsChart({ data }: LeadsConversionsProps) {
  if (data.length === 0) return null;
  return (
    <ChartCard title="Leads & Conversions">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
          <Bar
            dataKey="newLeads"
            name="New Leads"
            fill="#6366F1"
            radius={[4, 4, 0, 0]}
            animationDuration={1000}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="siteVisits"
            name="Site Visits"
            fill="#22C55E"
            radius={[4, 4, 0, 0]}
            animationDuration={1000}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="closedDeals"
            name="Closed"
            fill="#F59E0B"
            radius={[4, 4, 0, 0]}
            animationDuration={1000}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ==================== Activity / Calls Trend ==================== */

interface CallsTrendProps {
  data: TimeSeriesPoint[];
}

export function CallsTrendChart({ data }: CallsTrendProps) {
  if (data.length === 0) return null;
  return (
    <ChartCard title="Call Activity">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="gradCalls" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Area
            type="monotone"
            dataKey="calls"
            name="Calls"
            stroke="#F59E0B"
            strokeWidth={2}
            fill="url(#gradCalls)"
            animationDuration={1200}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ==================== Executive Vital Signals ==================== */

export function ExecutiveConversionTrendChart({ data }: LeadsConversionsProps) {
  if (data.length === 0) return null;
  return (
    <ChartCard title="Conversion Signals">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="gradVisits" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradBookings" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradClosedDeals" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22C55E" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
          <Area type="monotone" dataKey="siteVisits" name="Site Visits" stroke="#06B6D4" strokeWidth={2} fill="url(#gradVisits)" />
          <Area type="monotone" dataKey="bookings" name="Bookings" stroke="#F59E0B" strokeWidth={2} fill="url(#gradBookings)" />
          <Area type="monotone" dataKey="closedDeals" name="Closed" stroke="#22C55E" strokeWidth={2} fill="url(#gradClosedDeals)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ==================== Marketing Conversion Trend ==================== */

interface MarketingTrendProps {
  data: MarketingTimeSeriesPoint[];
}

export function MarketingConversionTrendChart({ data }: MarketingTrendProps) {
  if (data.length === 0) return null;
  return (
    <ChartCard title="Marketing Conversion Trend">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
          <Line type="monotone" dataKey="leads" name="Leads" stroke="#6366F1" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="siteVisits" name="Site Visits" stroke="#06B6D4" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="bookings" name="Bookings" stroke="#F59E0B" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="closedDeals" name="Closed" stroke="#22C55E" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
