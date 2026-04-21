"use client";
import { useState, useMemo } from 'react';
import { Search, Plus, Building2, MapPin } from 'lucide-react';
import { Project, PROPERTY_TYPES, PROJECT_STATUSES } from '@/lib/types/project';
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
  const [filterStatus, setFilterStatus] = useState('');

  const filtered = useMemo(() => {
    let result = [...projects];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(p =>
        p.name?.toLowerCase().includes(s) ||
        p.builder?.toLowerCase().includes(s) ||
        p.location?.toLowerCase().includes(s)
      );
    }
    if (filterType) result = result.filter(p => p.propertyType === filterType);
    if (filterStatus) result = result.filter(p => p.status === filterStatus);
    return result;
  }, [projects, search, filterType, filterStatus]);

  return (
    <aside className="w-80 border-r border-mn-border/30 flex flex-col flex-shrink-0 bg-mn-surface/30">
      {/* Header */}
      <div className="p-4 border-b border-mn-border/30 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black text-mn-h3 uppercase tracking-wider">Projects</p>
          {isAdmin && (
            <Button onClick={onAddProject} icon={<Plus className="w-3.5 h-3.5" />} className="!text-xs !px-3 !py-1.5">
              Add
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-mn-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-2 bg-mn-input-bg border border-mn-input-border rounded-lg text-xs text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-mn-input-bg border border-mn-input-border rounded-lg text-[11px] text-mn-text focus:outline-none focus:border-mn-input-focus"
          >
            <option value="">All Types</option>
            {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-mn-input-bg border border-mn-input-border rounded-lg text-[11px] text-mn-text focus:outline-none focus:border-mn-input-focus"
          >
            <option value="">All Status</option>
            {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <p className="text-xs text-mn-text-muted text-center py-8 animate-pulse">Loading projects...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <Building2 className="w-10 h-10 text-mn-border mx-auto mb-2" />
            <p className="text-xs text-mn-text-muted">
              {projects.length === 0 ? 'No projects yet.' : 'No projects match filters.'}
            </p>
          </div>
        ) : (
          filtered.map(project => (
            <button
              key={project.id}
              onClick={() => onSelect(project)}
              className={`w-full text-left rounded-xl border transition-all overflow-hidden ${
                selectedId === project.id
                  ? 'border-mn-h2 bg-mn-h2/10 shadow-sm shadow-mn-h2/10'
                  : 'border-mn-border/30 bg-mn-card hover:border-mn-border hover:bg-mn-card-hover'
              }`}
            >
              {/* Mini hero */}
              {project.heroImage && (
                <div className="h-20 overflow-hidden">
                  <img src={project.heroImage} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className={`font-bold text-sm truncate ${selectedId === project.id ? 'text-mn-h2' : 'text-mn-text'}`}>
                      {project.name}
                    </h4>
                    <p className="text-[11px] text-mn-text-muted mt-0.5">{project.builder}</p>
                  </div>
                  <Badge variant={STATUS_BADGE[project.status] || 'default'} className="flex-shrink-0 !text-[9px]">
                    {project.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-[11px] text-mn-text-muted">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{project.location}</span>
                </div>
                <span className="inline-block mt-1.5 text-[9px] px-2 py-0.5 rounded-full font-bold bg-mn-border/30 text-mn-text-muted">
                  {project.propertyType}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
