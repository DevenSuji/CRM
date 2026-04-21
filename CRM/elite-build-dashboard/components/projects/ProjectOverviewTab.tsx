"use client";
import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDoc, Timestamp } from 'firebase/firestore';
import { Pencil, Save, MapPin, Building2, X, Images } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { Project, SchemaField, PropertyType, ProjectStatus, PROPERTY_TYPES, PROJECT_STATUSES, DEFAULT_SCHEMA_FIELDS } from '@/lib/types/project';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { MultiImageUpload } from '@/components/ui/MultiImageUpload';
import { LocationAutocomplete } from '@/components/ui/LocationAutocomplete';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { geocodeAddress } from '@/lib/utils/geocode';

interface ProjectOverviewTabProps {
  project: Project;
  isAdmin: boolean;
}

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger'> = {
  'Active': 'success',
  'Upcoming': 'warning',
  'Sold Out': 'danger',
};

export function ProjectOverviewTab({ project, isAdmin }: ProjectOverviewTabProps) {
  const { showToast } = useToast();

  // Edit mode for project info
  const [editingInfo, setEditingInfo] = useState(false);
  const [formName, setFormName] = useState(project.name);
  const [formBuilder, setFormBuilder] = useState(project.builder);
  const [formLocation, setFormLocation] = useState(project.location);
  const [formType, setFormType] = useState<PropertyType>(project.propertyType);
  const [formStatus, setFormStatus] = useState<ProjectStatus>(project.status);
  const [formImages, setFormImages] = useState<string[]>([]);
  const [savingInfo, setSavingInfo] = useState(false);

  // Edit mode for project fields
  const [editingFields, setEditingFields] = useState(false);
  const [projectFields, setProjectFields] = useState<Record<string, any>>(project.project_fields || {});
  const [savingFields, setSavingFields] = useState(false);

  // Image lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const allImages = useMemo(() => {
    const imgs: string[] = [];
    if (project.heroImage) imgs.push(project.heroImage);
    if (project.gallery) imgs.push(...project.gallery);
    return imgs;
  }, [project.heroImage, project.gallery]);

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Schema for this project (needed to know which project-scoped fields exist)
  const [schema, setSchema] = useState<SchemaField[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(true);

  // Reset states when project changes
  useEffect(() => {
    setEditingInfo(false);
    setEditingFields(false);
    setFormName(project.name);
    setFormBuilder(project.builder);
    setFormLocation(project.location);
    setFormType(project.propertyType);
    setFormStatus(project.status);
    const imgs: string[] = [];
    if (project.heroImage) imgs.push(project.heroImage);
    if (project.gallery) imgs.push(...project.gallery);
    setFormImages(imgs);
    setProjectFields(project.project_fields || {});
  }, [project]);

  // Load schema
  useEffect(() => {
    const loadSchema = async () => {
      setSchemaLoading(true);
      try {
        const snap = await getDoc(doc(db, 'project_schemas', project.id));
        const raw: SchemaField[] = snap.exists()
          ? (snap.data().fields || [])
          : (DEFAULT_SCHEMA_FIELDS[project.propertyType] || []);
        setSchema(raw.map(f => ({ ...f, scope: f.scope === 'project' ? 'project' : 'unit' })));
      } catch (err) {
        console.error(err);
        setSchema([]);
      } finally {
        setSchemaLoading(false);
      }
    };
    loadSchema();
  }, [project.id, project.propertyType]);

  const projectScopedFields = useMemo(
    () => schema.filter(f => f.scope === 'project'),
    [schema],
  );

  const handleSaveInfo = async () => {
    if (!formName.trim() || !formBuilder.trim() || !formLocation.trim()) {
      showToast('error', 'Please fill all required fields.');
      return;
    }
    setSavingInfo(true);
    try {
      const heroImage = formImages[0] || null;
      const gallery = formImages.slice(1);
      await updateDoc(doc(db, 'projects', project.id), {
        name: formName.trim(),
        builder: formBuilder.trim(),
        location: formLocation.trim(),
        propertyType: formType,
        status: formStatus,
        heroImage,
        gallery,
        updated_at: Timestamp.now(),
      });
      setEditingInfo(false);
      showToast('success', 'Project info updated.');
      // Geocode location in background if changed
      if (formLocation.trim() !== project.location || !project.geo) {
        geocodeAddress(formLocation.trim()).then(geo => {
          if (geo) updateDoc(doc(db, 'projects', project.id), { geo }).catch(() => {});
        });
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to update project info.');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleSaveProjectFields = async () => {
    setSavingFields(true);
    try {
      await updateDoc(doc(db, 'projects', project.id), {
        project_fields: projectFields,
        updated_at: Timestamp.now(),
      });
      setEditingFields(false);
      showToast('success', 'Project-level field values saved.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to save field values.');
    } finally {
      setSavingFields(false);
    }
  };

  const renderFieldValue = (field: SchemaField, value: any) => {
    if (value === null || value === undefined || value === '') return <span className="text-mn-text-muted/40">{'\u2014'}</span>;
    if (field.type === 'boolean') return <span className={value === true ? 'text-mn-success' : 'text-mn-danger'}>{value === true ? 'Yes' : 'No'}</span>;
    return <span>{String(value)}</span>;
  };

  const renderFieldInput = (field: SchemaField, value: any, onChange: (val: any) => void) => {
    const baseClass = 'w-full px-3 py-2 bg-mn-input-bg border border-mn-input-border rounded-lg text-sm text-mn-text focus:outline-none focus:border-mn-input-focus';
    const options = field.options ? field.options.split(',').map(o => o.trim()).filter(Boolean) : [];

    switch (field.type) {
      case 'dropdown':
        return (
          <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={baseClass}>
            <option value="">Select...</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case 'boolean':
        return (
          <div className="flex gap-2">
            {['Yes', 'No'].map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt === 'Yes')}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                  (opt === 'Yes' ? value === true : value === false)
                    ? 'bg-mn-h2 text-white border-mn-h2'
                    : 'bg-mn-input-bg text-mn-text-muted border-mn-input-border hover:border-mn-border'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        );
      case 'number':
        return <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={baseClass} />;
      case 'textarea':
        return <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={2} className={baseClass + ' resize-none'} />;
      default:
        return <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} className={baseClass} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner — clickable to open lightbox. object-contain preserves aspect;
          dark backdrop frames portrait/landscape shots without cropping or stretching. */}
      {!editingInfo && project.heroImage && (
        <div
          className="relative w-full aspect-[16/9] max-h-[420px] rounded-xl overflow-hidden cursor-pointer bg-mn-surface group"
          onClick={() => openLightbox(0)}
        >
          <img
            src={project.heroImage}
            alt={project.name}
            className="absolute inset-0 w-full h-full object-contain"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}

      {/* Project Info Section */}
      <div className="bg-mn-card border border-mn-border/30 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black text-mn-h3 uppercase tracking-wider">Project Info</h3>
          {isAdmin && !editingInfo && (
            <button onClick={() => setEditingInfo(true)} className="flex items-center gap-1.5 text-xs font-bold text-mn-h2 hover:text-mn-h2/80">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>

        {editingInfo ? (
          <div className="space-y-4">
            <Input label="Project Name" required value={formName} onChange={e => setFormName(e.target.value)} />
            <Input label="Builder" required value={formBuilder} onChange={e => setFormBuilder(e.target.value)} />
            <LocationAutocomplete label="Location" required value={formLocation} onChange={setFormLocation} />
            <MultiImageUpload label="Project Images" images={formImages} onChange={setFormImages} folder="projects" />
            <div className="grid grid-cols-2 gap-4">
              <Select label="Property Type" required value={formType} onChange={e => setFormType(e.target.value as PropertyType)} options={PROPERTY_TYPES.map(t => ({ value: t, label: t }))} />
              <Select label="Status" required value={formStatus} onChange={e => setFormStatus(e.target.value as ProjectStatus)} options={PROJECT_STATUSES.map(s => ({ value: s, label: s }))} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditingInfo(false)} icon={<X className="w-4 h-4" />}>Cancel</Button>
              <Button onClick={handleSaveInfo} disabled={savingInfo} icon={<Save className="w-4 h-4" />}>
                {savingInfo ? 'Saving...' : 'Save Info'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <h2 className="font-black text-xl text-mn-h1">{project.name}</h2>
              <p className="text-sm text-mn-h3 font-medium mt-0.5">{project.builder}</p>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-mn-text-muted">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span>{project.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="default">{project.propertyType}</Badge>
              <Badge variant={STATUS_BADGE[project.status] || 'default'}>{project.status}</Badge>
            </div>
          </div>
        )}
      </div>

      {/* Gallery Section — proper grid, not tile strip */}
      {!editingInfo && allImages.length > 1 && (
        <div className="bg-mn-card border border-mn-border/30 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Images className="w-4 h-4 text-mn-h3" />
              <h3 className="text-sm font-black text-mn-h3 uppercase tracking-wider">Gallery</h3>
              <span className="text-xs text-mn-text-muted">({allImages.length - 1} image{allImages.length - 1 > 1 ? 's' : ''})</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {allImages.slice(1, 9).map((img, i) => {
              const lightboxIdx = i + 1;
              const isLastVisible = i === 7 && allImages.length > 9;
              return (
                <button
                  key={lightboxIdx}
                  onClick={() => openLightbox(lightboxIdx)}
                  className="relative aspect-[4/3] rounded-lg overflow-hidden bg-mn-surface border border-mn-border/30 hover:border-mn-h2/50 hover:shadow-lg hover:shadow-mn-h2/5 transition-all group"
                >
                  <img
                    src={img}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {isLastVisible && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-lg font-black text-white">+{allImages.length - 9}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Project-Level Fields Section */}
      {!schemaLoading && projectScopedFields.length > 0 && (
        <div className="bg-mn-card border border-mn-border/30 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-mn-h3 uppercase tracking-wider">Project-Level Details</h3>
              <p className="text-[10px] text-mn-text-muted mt-0.5">These values apply to all units in this project</p>
            </div>
            {isAdmin && !editingFields && (
              <button onClick={() => setEditingFields(true)} className="flex items-center gap-1.5 text-xs font-bold text-mn-h2 hover:text-mn-h2/80">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            )}
          </div>

          {editingFields ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {projectScopedFields.map(field => (
                  <div key={field.id}>
                    <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">
                      {field.label} {field.required && <span className="text-mn-danger">*</span>}
                    </label>
                    {renderFieldInput(field, projectFields[field.key], val => setProjectFields(prev => ({ ...prev, [field.key]: val })))}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="secondary" onClick={() => { setEditingFields(false); setProjectFields(project.project_fields || {}); }} icon={<X className="w-4 h-4" />}>Cancel</Button>
                <Button onClick={handleSaveProjectFields} disabled={savingFields} icon={<Save className="w-4 h-4" />}>
                  {savingFields ? 'Saving...' : 'Save Details'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {projectScopedFields.map(field => (
                <div key={field.id} className="flex justify-between items-start gap-2">
                  <span className="text-xs font-bold text-mn-text-muted flex-shrink-0">{field.label}</span>
                  <span className="text-sm text-mn-text text-right font-medium">
                    {renderFieldValue(field, projectFields[field.key])}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Image Lightbox */}
      <ImageLightbox
        images={allImages}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
