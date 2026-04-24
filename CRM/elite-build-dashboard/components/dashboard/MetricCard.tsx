"use client";
import { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  accent?: string;
  className?: string;
}

export function MetricCard({ title, value, subtitle, icon, accent, className = '' }: MetricCardProps) {
  return (
    <div className={`app-shell-panel rounded-[1.5rem] p-5 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-mn-text-muted">{title}</p>
          <p className={`mt-2 text-[2rem] font-black leading-none tracking-[-0.04em] ${accent || 'text-mn-text'}`}>{value}</p>
          {subtitle && (
            <p className="mt-2 text-xs text-mn-text-muted">{subtitle}</p>
          )}
        </div>
        <div className="ml-3 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-mn-border/60 bg-mn-card/50">
          {icon}
        </div>
      </div>
    </div>
  );
}
