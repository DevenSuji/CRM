"use client";
import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Project } from '@/lib/types/project';
import { Search, Building2, MapPin } from 'lucide-react';

interface ProjectLocationSearchProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ProjectLocationSearch({ label, value, onChange, placeholder }: ProjectLocationSearchProps) {
  const [searchQuery, setSearchQuery] = useState(value);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync local state when value prop changes externally
  useEffect(() => { setSearchQuery(value); }, [value]);

  const loadProjects = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'projects'), orderBy('created_at', 'desc')));
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }, [loaded]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = projects.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.location.toLowerCase().includes(q) ||
      p.builder.toLowerCase().includes(q)
    );
  });

  const handleSelect = (project: Project) => {
    const locationStr = `${project.name}, ${project.location}`;
    setSearchQuery(locationStr);
    onChange(locationStr);
    setShowDropdown(false);
  };

  const handleInputChange = (val: string) => {
    setSearchQuery(val);
    onChange(val);
    setShowDropdown(true);
  };

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-mn-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => { loadProjects(); setShowDropdown(true); }}
          placeholder={placeholder || 'Search projects by name or location...'}
          className="w-full pl-9 pr-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
        />
      </div>

      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-mn-card border border-mn-border rounded-xl shadow-xl max-h-[200px] overflow-y-auto">
          {loading ? (
            <div className="px-4 py-3 text-xs text-mn-text-muted animate-pulse">Loading projects...</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-3 text-xs text-mn-text-muted">No matching projects found.</div>
          ) : (
            filtered.map(project => (
              <button
                key={project.id}
                onClick={() => handleSelect(project)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-mn-surface transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-mn-surface flex-shrink-0 overflow-hidden">
                  {project.heroImage ? (
                    <img src={project.heroImage} alt="" className="w-8 h-8 object-cover" />
                  ) : (
                    <div className="w-8 h-8 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-mn-text-muted" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-mn-text truncate">{project.name}</p>
                  <div className="flex items-center gap-2 text-[10px] text-mn-text-muted">
                    <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{project.location}</span>
                    <span>{project.propertyType}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
