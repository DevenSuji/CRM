"use client";
import { NameValue } from '@/lib/utils/dashboardMetrics';

const FUNNEL_COLORS = [
  '#4F46E5', '#6366F1', '#818CF8', '#A5B4FC',
  '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6',
];

interface Props {
  stages: NameValue[];
  title?: string;
}

export function FunnelChart({ stages, title }: Props) {
  if (stages.length === 0) {
    return (
      <div className="bg-mn-card border border-mn-border rounded-2xl p-5 shadow-sm">
        {title && <h3 className="text-xs font-black text-mn-text-muted uppercase tracking-wider mb-4">{title}</h3>}
        <p className="text-xs text-mn-text-muted text-center py-8">No data yet</p>
      </div>
    );
  }

  const maxValue = Math.max(...stages.map(s => s.value), 1);

  return (
    <div className="bg-mn-card border border-mn-border rounded-2xl p-5 shadow-sm">
      {title && <h3 className="text-xs font-black text-mn-text-muted uppercase tracking-wider mb-4">{title}</h3>}
      <div className="space-y-2">
        {stages.map((stage, i) => {
          const widthPct = Math.max((stage.value / maxValue) * 100, 8);
          return (
            <div key={stage.name} className="flex items-center gap-3">
              <div className="w-24 text-right flex-shrink-0">
                <span className="text-xs font-bold text-mn-text truncate">{stage.name}</span>
              </div>
              <div className="flex-1 h-7 bg-mn-border/20 rounded-lg overflow-hidden">
                <div
                  className="h-full rounded-lg flex items-center px-2 transition-all duration-500"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                  }}
                >
                  <span className="text-[11px] font-black text-white">{stage.value}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
