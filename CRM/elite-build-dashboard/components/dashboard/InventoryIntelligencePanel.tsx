"use client";

import { AlertTriangle, Boxes, IndianRupee, LineChart, Target } from 'lucide-react';
import type { InventoryIntelligence } from '@/lib/utils/inventoryIntelligence';
import { formatPrice } from '@/lib/utils/formatPrice';
import { MetricCard } from './MetricCard';

interface Props {
  intelligence: InventoryIntelligence;
}

function DemandSupplyList({
  title,
  items,
}: {
  title: string;
  items: InventoryIntelligence['demandSupplyByType'];
}) {
  const max = Math.max(1, ...items.map(item => Math.max(item.demand, item.supply)));
  return (
    <div className="app-shell-panel rounded-[1.5rem] p-5">
      <h3 className="text-xs font-black uppercase tracking-wider text-mn-text-muted">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.slice(0, 6).map(item => (
          <div key={item.key}>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-mn-text">{item.label}</span>
              <span className="text-[11px] font-black text-mn-text-muted">D {item.demand} / S {item.supply}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-2 overflow-hidden rounded-full bg-mn-border/25">
                <div className="h-full rounded-full bg-mn-h2" style={{ width: `${(item.demand / max) * 100}%` }} />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-mn-border/25">
                <div className="h-full rounded-full bg-mn-success" style={{ width: `${(item.supply / max) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-mn-text-muted">No demand/supply data yet.</p>}
      </div>
    </div>
  );
}

export function InventoryIntelligencePanel({ intelligence }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-black text-mn-h2 uppercase tracking-wider mb-4">Inventory Intelligence</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Available Units"
            value={intelligence.availableUnits}
            subtitle={`${intelligence.totalUnits} total inventory`}
            icon={<Boxes className="h-5 w-5 text-mn-info" />}
            accent="text-mn-info"
          />
          <MetricCard
            title="Available Value"
            value={formatPrice(intelligence.availableValue)}
            icon={<IndianRupee className="h-5 w-5 text-mn-h2" />}
            accent="text-mn-h2"
          />
          <MetricCard
            title="Stale Units"
            value={intelligence.staleAvailableUnits}
            subtitle="Available > 60 days"
            icon={<AlertTriangle className="h-5 w-5 text-mn-warning" />}
            accent={intelligence.staleAvailableUnits > 0 ? 'text-mn-warning' : 'text-mn-success'}
          />
          <MetricCard
            title="Booked / Sold"
            value={`${intelligence.bookedUnits}/${intelligence.soldUnits}`}
            icon={<Target className="h-5 w-5 text-mn-success" />}
            accent="text-mn-success"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="app-shell-panel rounded-[1.5rem] p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-mn-warning" />
            <h3 className="text-xs font-black uppercase tracking-wider text-mn-text-muted">Needs Marketing Push</h3>
          </div>
          <div className="mt-4 space-y-3">
            {intelligence.projectsNeedingPush.map(project => (
              <div key={project.projectId} className="rounded-2xl border border-mn-border/35 bg-mn-surface/45 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-mn-text">{project.projectName}</p>
                    <p className="mt-1 text-xs text-mn-text-muted">{project.availableUnits} available · {project.bestBuyerCount} buyers · {formatPrice(project.availableValue)}</p>
                  </div>
                  <span className="rounded-full bg-mn-warning/12 px-2.5 py-1 text-xs font-black text-mn-warning">{project.healthScore}</span>
                </div>
                <p className="mt-2 text-xs text-mn-text-muted">{project.recommendation}</p>
              </div>
            ))}
            {intelligence.projectsNeedingPush.length === 0 && (
              <p className="text-sm text-mn-text-muted">No available inventory needs a push right now.</p>
            )}
          </div>
        </div>

        <div className="app-shell-panel rounded-[1.5rem] p-5">
          <div className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-mn-success" />
            <h3 className="text-xs font-black uppercase tracking-wider text-mn-text-muted">Healthiest Projects</h3>
          </div>
          <div className="mt-4 space-y-3">
            {intelligence.healthiestProjects.map(project => (
              <div key={project.projectId} className="flex items-center justify-between gap-3 rounded-2xl bg-mn-surface/45 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-mn-text">{project.projectName}</p>
                  <p className="text-xs text-mn-text-muted">{project.availableUnits} available · {project.bestBuyerCount} buyers</p>
                </div>
                <span className="rounded-full bg-mn-success/12 px-2.5 py-1 text-xs font-black text-mn-success">{project.healthScore}</span>
              </div>
            ))}
            {intelligence.healthiestProjects.length === 0 && (
              <p className="text-sm text-mn-text-muted">Add inventory units to start health scoring.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DemandSupplyList title="Demand vs Supply by Type" items={intelligence.demandSupplyByType} />
        <DemandSupplyList title="Demand vs Supply by Budget" items={intelligence.demandSupplyByBudget} />
      </div>

      <DemandSupplyList title="Demand vs Supply by Location" items={intelligence.demandSupplyByLocation} />
    </div>
  );
}
