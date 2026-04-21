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
    <div className={`bg-mn-card border border-mn-border rounded-2xl p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-mn-text-muted uppercase tracking-wider">{title}</p>
          <p className={`text-2xl font-black mt-1 ${accent || 'text-mn-text'}`}>{value}</p>
          {subtitle && (
            <p className="text-xs text-mn-text-muted mt-1">{subtitle}</p>
          )}
        </div>
        <div className="w-10 h-10 rounded-xl bg-mn-h2/10 flex items-center justify-center flex-shrink-0 ml-3">
          {icon}
        </div>
      </div>
    </div>
  );
}
