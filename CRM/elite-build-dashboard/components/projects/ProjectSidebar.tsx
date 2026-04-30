"use client";
import { useState, useMemo } from 'react';
import { Search, Plus, Building2, MapPin, IndianRupee } from 'lucide-react';
import { Project, PROPERTY_TYPES } from '@/lib/types/project';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger'> = {
  'Active': 'success',
  'Upcoming': 'warning',
  'Sold Out': 'danger',
};

interface ProjectSidebarProps {
  projects: Project[];
  selectedId: string | null;
  onSelect: (project: Project) => void;
  onAddProject: () => void;
  isAdmin: boolean;
  loading: boolean;
}

export function ProjectSidebar({ projects, selectedId, onSelect, onAddProject, isAdmin, loading }: ProjectSidebarProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [location, setLocation] = useState('');

  const filtered = useMemo(() => {
    let result = [...projects].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(p =>
        p.name?.toLowerCase().includes(s) ||
        p.builder?.toLowerCase().includes(s) ||
        p.location?.toLowerCase().includes(s)
      );
    }
    if (filterType) result = result.filter(p => p.propertyType === filterType);
    if (location.trim()) {
      const s = location.trim().toLowerCase();
      result = result.filter(p => p.location?.toLowerCase().includes(s));
    }

    const min = Number(budgetMin);
    const max = Number(budgetMax);
    const hasMin = budgetMin.trim() !== '' && Number.isFinite(min);
    const hasMax = budgetMax.trim() !== '' && Number.isFinite(max);
    if (hasMin || hasMax) {
      result = result.filter(p => {
        if (!p.priceRange) return false;
        const projectMin = p.priceRange.min || 0;
        const projectMax = p.priceRange.max || projectMin;
        if (hasMin && projectMax < min) return false;
        if (hasMax && projectMin > max) return false;
        return true;
      });
    }

    return result;
  }, [projects, search, filterType, location, budgetMin, budgetMax]);

  return (
    <section className="app-shell-panel flex w-full flex-shrink-0 flex-col overflow-hidden">
      <div className="space-y-4 border-b border-mn-border/20 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-heading">Projects</p>
            <p className="mt-1 text-xs text-mn-text-muted">Browse and manage inventory-ready launches</p>
          </div>
          {isAdmin && (
            <Button onClick={onAddProject} icon={<Plus className="w-3.5 h-3.5" />} className="!text-xs !px-3 !py-1.5">
              Add
            </Button>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1.3fr)_minmax(12rem,0.8fr)_minmax(18rem,1fr)_minmax(14rem,0.8fr)]">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-mn-h3">Search</span>
            <span className="relative block">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mn-text-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search projects, builders..."
                className="w-full rounded-xl border border-mn-input-border bg-mn-input-bg py-2.5 pl-9 pr-3 text-xs text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-mn-h3">Property Type</span>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="w-full rounded-xl border border-mn-input-border bg-mn-input-bg px-3 py-2.5 text-xs text-mn-text focus:outline-none focus:border-mn-input-focus"
            >
              <option value="">All Types</option>
              {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <div>
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-mn-h3">Budget Range</span>
            <div className="grid grid-cols-2 gap-2">
              <label className="relative block">
                <IndianRupee className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mn-text-muted" />
                <input
                  value={budgetMin}
                  onChange={e => setBudgetMin(e.target.value)}
                  inputMode="numeric"
                  placeholder="Min"
                  className="w-full rounded-xl border border-mn-input-border bg-mn-input-bg py-2.5 pl-9 pr-3 text-xs text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
                />
              </label>
              <label className="relative block">
                <IndianRupee className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mn-text-muted" />
                <input
                  value={budgetMax}
                  onChange={e => setBudgetMax(e.target.value)}
                  inputMode="numeric"
                  placeholder="Max"
                  className="w-full rounded-xl border border-mn-input-border bg-mn-input-bg py-2.5 pl-9 pr-3 text-xs text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
                />
              </label>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-mn-h3">Location</span>
            <span className="relative block">
              <MapPin className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mn-text-muted" />
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Filter location"
                className="w-full rounded-xl border border-mn-input-border bg-mn-input-bg py-2.5 pl-9 pr-3 text-xs text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
              />
            </span>
          </label>
        </div>
      </div>

      {/* Project list */}
      <div className="overflow-x-auto p-3 sm:p-4">
        {loading ? (
          <p className="py-8 text-center text-xs text-mn-text-muted animate-pulse">Loading projects...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <Building2 className="w-10 h-10 text-mn-border mx-auto mb-2" />
            <p className="text-xs text-mn-text-muted">
              {projects.length === 0 ? 'No projects yet.' : 'No projects match filters.'}
            </p>
          </div>
        ) : (
          <div className="flex gap-3">
            {filtered.map(project => (
              <button
                key={project.id}
                onClick={() => onSelect(project)}
                className={`w-[17rem] flex-shrink-0 overflow-hidden rounded-[1.4rem] border text-left transition-all ${
                  selectedId === project.id
                    ? 'border-mn-h2/40 bg-mn-h2/10 shadow-[0_16px_32px_color-mix(in_srgb,var(--mn-text)_12%,transparent)]'
                    : 'border-mn-border/45 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--mn-card-hover)_84%,transparent),color-mix(in_srgb,var(--mn-card)_92%,transparent))] hover:border-mn-border/70 hover:bg-mn-card-hover/85'
                }`}
              >
                {project.heroImage && (
                  <div className="h-24 overflow-hidden">
                    <img src={project.heroImage} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className={`truncate text-sm font-black ${selectedId === project.id ? 'text-mn-h2' : 'text-mn-text'}`}>
                        {project.name}
                      </h4>
                      <p className="mt-0.5 truncate text-[11px] text-mn-text-muted">{project.builder}</p>
                    </div>
                    <Badge variant={STATUS_BADGE[project.status] || 'default'} className="flex-shrink-0 !text-[9px]">
                      {project.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-[11px] text-mn-text-muted">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{project.location}</span>
                  </div>
                  <span className="inline-block mt-2 text-[9px] px-2 py-0.5 rounded-full font-bold bg-mn-border/30 text-mn-text-muted">
                    {project.propertyType}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
