"use client";
import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Plus, Trash2, Save, Database, GripVertical } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { Project, SchemaField, FieldType, FieldScope, DEFAULT_SCHEMA_FIELDS } from '@/lib/types/project';
import { Button } from '@/components/ui/Button';

interface ProjectSchemaTabProps {
  project: Project;
  isAdmin: boolean;
}

export function ProjectSchemaTab({ project, isAdmin }: ProjectSchemaTabProps) {
  const { showToast } = useToast();
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaExists, setSchemaExists] = useState(false);

  const loadSchema = useCallback(async () => {
    setLoading(true);
    setSchemaExists(false);
    try {
      const schemaDoc = await getDoc(doc(db, 'project_schemas', project.id));
      const raw: SchemaField[] = schemaDoc.exists()
        ? (schemaDoc.data().fields || [])
        : (DEFAULT_SCHEMA_FIELDS[project.propertyType] || DEFAULT_SCHEMA_FIELDS['Plotted Land']);
      setFields(raw.map(f => ({ ...f, scope: f.scope === 'project' ? 'project' : 'unit' })));
      if (schemaDoc.exists()) setSchemaExists(true);
    } catch (err) {
      console.error(err);
      setFields(DEFAULT_SCHEMA_FIELDS[project.propertyType] || []);
    } finally {
      setLoading(false);
    }
  }, [project.id, project.propertyType]);

  useEffect(() => { loadSchema(); }, [loadSchema]);

  const updateField = (idx: number, updates: Partial<SchemaField>) => {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, ...updates } : f));
  };

  const addField = () => {
    setFields(prev => [...prev, {
      id: `custom_${Date.now()}`,
      label: '',
      key: `custom_${Date.now()}`,
      type: 'text',
      options: '',
      required: false,
      scope: 'unit' as FieldScope,
    }]);
  };

  const removeField = (idx: number) => {
    setFields(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    const invalid = fields.find(f => !f.label.trim());
    if (invalid) { showToast('error', 'All fields must have a label.'); return; }
    setSaving(true);
    try {
      const cleanedFields = fields.map(f => ({
        ...f,
        key: f.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || f.key,
        scope: (f.scope === 'project' ? 'project' : 'unit') as FieldScope,
      }));
      await setDoc(doc(db, 'project_schemas', project.id), {
        projectId: project.id,
        projectName: project.name,
        propertyType: project.propertyType,
        fields: cleanedFields,
        updatedAt: new Date().toISOString(),
      });
      setFields(cleanedFields);
      setSchemaExists(true);
      showToast('success', `Schema for "${project.name}" saved.`);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to save schema.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-16 text-mn-text-muted animate-pulse">Loading schema...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="w-4 h-4 text-mn-text-muted" />
          <span className="text-sm font-bold text-mn-text">{fields.length} fields configured</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
            schemaExists ? 'bg-mn-success/20 text-mn-success' : 'bg-mn-warning/20 text-mn-warning'
          }`}>
            {schemaExists ? 'Saved' : 'Defaults'}
          </span>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <button onClick={addField} className="flex items-center gap-1.5 text-mn-h2 font-bold text-sm hover:text-mn-h2/80">
              <Plus className="w-4 h-4" /> Add Field
            </button>
            <Button onClick={handleSave} disabled={saving} icon={<Save className="w-4 h-4" />}>
              {saving ? 'Saving...' : 'Save Schema'}
            </Button>
          </div>
        )}
      </div>

      {/* Field Grid */}
      <div className="space-y-3">
        {fields.map((field, idx) => (
          <div
            key={field.id}
            className={`grid ${isAdmin ? 'grid-cols-[40px_1fr_100px_80px_1fr_60px_40px]' : 'grid-cols-[1fr_100px_80px_1fr_60px]'} gap-3 p-4 bg-mn-card border border-mn-border/30 rounded-xl items-center group hover:border-mn-border transition-all`}
          >
            {isAdmin && (
              <div className="flex justify-center text-mn-text-muted/30 group-hover:text-mn-text-muted cursor-grab">
                <GripVertical className="w-5 h-5" />
              </div>
            )}
            <div>
              <label className="block text-[10px] font-black text-mn-h3 uppercase mb-1">Label</label>
              {isAdmin ? (
                <input
                  value={field.label}
                  onChange={e => updateField(idx, { label: e.target.value })}
                  placeholder="e.g. Plot Number"
                  className="w-full px-3 py-2 bg-mn-input-bg border border-mn-input-border rounded-lg text-sm text-mn-text focus:outline-none focus:border-mn-input-focus"
                />
              ) : (
                <p className="px-3 py-2 text-sm text-mn-text">{field.label}</p>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-black text-mn-h3 uppercase mb-1">Type</label>
              {isAdmin ? (
                <select
                  value={field.type}
                  onChange={e => updateField(idx, { type: e.target.value as FieldType })}
                  className="w-full px-3 py-2 bg-mn-input-bg border border-mn-input-border rounded-lg text-sm text-mn-text focus:outline-none focus:border-mn-input-focus"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="dropdown">Dropdown</option>
                  <option value="boolean">Yes/No</option>
                  <option value="textarea">Long Text</option>
                </select>
              ) : (
                <p className="px-3 py-2 text-sm text-mn-text capitalize">{field.type === 'boolean' ? 'Yes/No' : field.type}</p>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-black text-mn-h3 uppercase mb-1">Scope</label>
              {isAdmin ? (
                <select
                  value={field.scope || 'unit'}
                  onChange={e => updateField(idx, { scope: e.target.value as FieldScope })}
                  className={`w-full px-2 py-2 border rounded-lg text-xs font-bold focus:outline-none focus:border-mn-input-focus ${
                    (field.scope || 'unit') === 'project'
                      ? 'bg-mn-info/10 border-mn-info/30 text-mn-info'
                      : 'bg-mn-input-bg border-mn-input-border text-mn-text'
                  }`}
                >
                  <option value="unit">Unit</option>
                  <option value="project">Project</option>
                </select>
              ) : (
                <span className={`inline-block px-2 py-1 rounded-lg text-xs font-bold ${
                  (field.scope || 'unit') === 'project'
                    ? 'bg-mn-info/10 text-mn-info'
                    : 'bg-mn-input-bg text-mn-text-muted'
                }`}>
                  {(field.scope || 'unit') === 'project' ? 'Project' : 'Unit'}
                </span>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-black text-mn-h3 uppercase mb-1">Options</label>
              {isAdmin ? (
                <input
                  value={field.options}
                  onChange={e => updateField(idx, { options: e.target.value })}
                  placeholder="A, B, C"
                  disabled={field.type !== 'dropdown'}
                  className="w-full px-3 py-2 bg-mn-input-bg border border-mn-input-border rounded-lg text-xs text-mn-text focus:outline-none focus:border-mn-input-focus disabled:opacity-30"
                />
              ) : (
                <p className="px-3 py-2 text-xs text-mn-text-muted">{field.type === 'dropdown' ? (field.options || '—') : '—'}</p>
              )}
            </div>
            <div className="flex flex-col items-center gap-1">
              <label className="text-[10px] font-black text-mn-h3 uppercase">Req.</label>
              {isAdmin ? (
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={e => updateField(idx, { required: e.target.checked })}
                  className="w-4 h-4 accent-mn-h2"
                />
              ) : (
                <span className={`text-xs font-bold ${field.required ? 'text-mn-danger' : 'text-mn-text-muted/40'}`}>
                  {field.required ? 'Yes' : 'No'}
                </span>
              )}
            </div>
            {isAdmin && (
              <div className="flex justify-center pt-3">
                <button onClick={() => removeField(idx)} className="text-mn-text-muted/30 hover:text-mn-danger transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}

        {isAdmin && (
          <button
            onClick={addField}
            className="mt-4 w-full p-4 border-2 border-dashed border-mn-border rounded-xl text-mn-text-muted hover:border-mn-h2 hover:text-mn-h2 font-bold text-sm transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Custom Field
          </button>
        )}
      </div>
    </div>
  );
}
