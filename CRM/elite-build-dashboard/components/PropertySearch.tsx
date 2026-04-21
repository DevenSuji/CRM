"use client";
import { useState, useRef, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Project } from '@/lib/types/project';
import { InterestedProperty } from '@/lib/types/lead';
import { Plus, Search, X, Building2, MapPin } from 'lucide-react';

interface PropertySearchProps {
  /** Already tagged properties — used to prevent duplicates */
  taggedProjectIds: string[];
  onTagProperty: (property: InterestedProperty) => void;
}

export function PropertySearch({ taggedProjectIds, onTagProperty }: PropertySearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load projects on first focus
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

  // Close dropdown on outside click
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
    if (taggedProjectIds.includes(p.id)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.location.toLowerCase().includes(q) ||
      p.builder.toLowerCase().includes(q) ||
      p.propertyType.toLowerCase().includes(q)
    );
  });

  const handleTag = (project: Project) => {
    onTagProperty({
      projectId: project.id,
      projectName: project.name,
      location: project.location,
      propertyType: project.propertyType,
      heroImage: project.heroImage || null,
      tagged_at: new Date().toISOString(),
      tagged_by: '', // Will be set by the parent component
    });
    setSearchQuery('');
    setShowDropdown(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">
        Matching Property
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-mn-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => { loadProjects(); setShowDropdown(true); }}
          placeholder="Search projects by name, location, or type..."
          className="w-full pl-9 pr-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
        />
      </div>

      {/* Dropdown results */}
      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-mn-card border border-mn-border rounded-xl shadow-xl max-h-[200px] overflow-y-auto">
          {loading ? (
            <div className="px-4 py-3 text-xs text-mn-text-muted animate-pulse">Loading projects...</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-3 text-xs text-mn-text-muted">
              {searchQuery ? 'No matching projects found.' : 'All projects are already tagged.'}
            </div>
          ) : (
            filtered.map(project => (
              <button
                key={project.id}
                onClick={() => handleTag(project)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-mn-surface transition-colors text-left"
              >
                {/* Thumbnail */}
                <div className="w-8 h-8 rounded-lg bg-mn-surface flex-shrink-0 overflow-hidden">
                  {project.heroImage ? (
                    <img src={project.heroImage} alt="" className="w-8 h-8 object-cover" />
                  ) : (
                    <div className="w-8 h-8 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-mn-text-muted" />
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-mn-text truncate">{project.name}</p>
                  <div className="flex items-center gap-2 text-[10px] text-mn-text-muted">
                    <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{project.location}</span>
                    <span>{project.propertyType}</span>
                  </div>
                </div>
                {/* Add button */}
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-mn-h2/15 flex items-center justify-center">
                  <Plus className="w-3.5 h-3.5 text-mn-h2" />
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
