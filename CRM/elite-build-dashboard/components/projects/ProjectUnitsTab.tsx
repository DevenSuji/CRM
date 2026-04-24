"use client";
import { useState, useEffect, useMemo } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, Timestamp,
} from 'firebase/firestore';
import {
  Plus, Trash2, X, ChevronRight, MapPin, ArrowUpDown, Search, Building2, Pencil, Save, AlertTriangle,
} from 'lucide-react';
import { useFirestoreDoc } from '@/lib/hooks/useFirestoreDoc';
import { useToast } from '@/lib/hooks/useToast';
import { Project, SchemaField, DEFAULT_SCHEMA_FIELDS } from '@/lib/types/project';
import { InventoryUnit, InventoryStatus } from '@/lib/types/inventory';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatPrice } from '@/lib/utils/formatPrice';
import { BestBuyersPanel } from '@/components/projects/BestBuyersPanel';
import { ReverseMatchUnitSnapshot } from '@/lib/utils/reverseMatcher';

interface ProjectUnitsTabProps {
  project: Project;
  isAdmin: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  Available: 'bg-mn-success/20 text-mn-success border-mn-success/30',
  Booked: 'bg-mn-warning/20 text-mn-warning border-mn-warning/30',
  Sold: 'bg-mn-danger/20 text-mn-danger border-mn-danger/30',
};

const STATUS_OPTIONS = ['Available', 'Booked', 'Sold'];

export function ProjectUnitsTab({ project, isAdmin }: ProjectUnitsTabProps) {
  const { showToast } = useToast();

  // Units data
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState<InventoryUnit | null>(null);

  // Schema
  const [schema, setSchema] = useState<SchemaField[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortField, setSortField] = useState<'price' | 'created_at'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Bulk add
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkRows, setBulkRows] = useState<Record<string, any>[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

  // Delete
  const [confirmDeleteUnit, setConfirmDeleteUnit] = useState<string | null>(null);
  const [deletingUnit, setDeletingUnit] = useState(false);

  // Edit fields on the selected unit
  const [editingUnitFields, setEditingUnitFields] = useState(false);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const { data: reverseSnapshot } = useFirestoreDoc<ReverseMatchUnitSnapshot & { id: string }>(
    'reverse_match_units',
    selectedUnit?.id || '',
  );

  // Load schema. Normalize legacy fields saved before `scope` was required:
  // treat missing/unknown scope as 'unit' so they show up in the bulk-add grid.
  useEffect(() => {
    const load = async () => {
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
    load();
  }, [project.id, project.propertyType]);

  // Real-time units listener filtered by projectId
  useEffect(() => {
    setLoading(true);
    setSelectedUnit(null);
    const q = query(collection(db, 'inventory'), where('projectId', '==', project.id));
    const unsub = onSnapshot(q, (snap) => {
      setUnits(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryUnit)));
      setLoading(false);
    }, (err) => {
      console.error('Units snapshot error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, [project.id]);

  // Unit-scoped fields only (for bulk add grid and detail view)
  const unitFields = useMemo(() => schema.filter(f => f.scope === 'unit'), [schema]);

  // Resolve booked_by_lead_id → lead name for the "Booked by X" badge.
  // Fetched once per unique lead id; cache survives as long as the tab is mounted.
  const [leadNameById, setLeadNameById] = useState<Record<string, string>>({});
  useEffect(() => {
    const neededIds = Array.from(new Set(
      units
        .filter(u => u.status === 'Booked' && u.booked_by_lead_id)
        .map(u => u.booked_by_lead_id as string),
    )).filter(id => leadNameById[id] === undefined);
    if (neededIds.length === 0) return;
    (async () => {
      const updates: Record<string, string> = {};
      await Promise.all(neededIds.map(async (id) => {
        try {
          const snap = await getDoc(doc(db, 'leads', id));
          updates[id] = snap.exists() ? ((snap.data() as any).raw_data?.lead_name || 'Unknown lead') : 'Deleted lead';
        } catch {
          updates[id] = 'Unknown lead';
        }
      }));
      setLeadNameById(prev => ({ ...prev, ...updates }));
    })();
  }, [units, leadNameById]);

  // Filtered & sorted units
  const filteredUnits = useMemo(() => {
    let result = [...units];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(u =>
        JSON.stringify(u.fields).toLowerCase().includes(s)
      );
    }
    if (filterStatus) result = result.filter(u => u.status === filterStatus);
    result.sort((a, b) => {
      const aVal = sortField === 'price' ? (a.price || 0) : (a.created_at?.toMillis?.() || 0);
      const bVal = sortField === 'price' ? (b.price || 0) : (b.created_at?.toMillis?.() || 0);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return result;
  }, [units, search, filterStatus, sortField, sortDir]);

  // Stats
  const stats = useMemo(() => ({
    total: filteredUnits.length,
    available: filteredUnits.filter(u => u.status === 'Available').length,
    booked: filteredUnits.filter(u => u.status === 'Booked').length,
    sold: filteredUnits.filter(u => u.status === 'Sold').length,
  }), [filteredUnits]);

  // Init bulk rows
  const initBulkAdd = () => {
    if (schema.length === 0) {
      showToast('error', 'Define a schema first (Schema tab) before adding units.');
      return;
    }
    if (unitFields.length === 0) {
      showToast('error', 'No unit-level fields defined. Open the Schema tab and mark at least one field as "Unit-level".');
      return;
    }
    const emptyRow: Record<string, any> = {};
    unitFields.forEach(f => { emptyRow[f.key] = f.type === 'boolean' ? null : ''; });
    setBulkRows(Array.from({ length: 5 }, () => ({ ...emptyRow })));
    setShowBulkAdd(true);
  };

  const addBulkRow = () => {
    const emptyRow: Record<string, any> = {};
    unitFields.forEach(f => { emptyRow[f.key] = f.type === 'boolean' ? null : ''; });
    setBulkRows(prev => [...prev, { ...emptyRow }]);
  };

  const updateBulkCell = (rowIdx: number, key: string, value: any) => {
    setBulkRows(prev => prev.map((row, i) => i === rowIdx ? { ...row, [key]: value } : row));
  };

  const removeBulkRow = (rowIdx: number) => {
    setBulkRows(prev => prev.filter((_, i) => i !== rowIdx));
  };

  const handleBulkSave = async () => {
    // Filter out completely empty rows
    const nonEmpty = bulkRows.filter(row => {
      return unitFields.some(f => {
        const val = row[f.key];
        return val !== null && val !== undefined && val !== '';
      });
    });

    if (nonEmpty.length === 0) {
      showToast('error', 'No data to save. Fill in at least one row.');
      return;
    }

    // Validate required fields
    for (let i = 0; i < nonEmpty.length; i++) {
      for (const f of unitFields) {
        if (f.required) {
          const val = nonEmpty[i][f.key];
          if (val === null || val === undefined || val === '') {
            showToast('error', `Row ${i + 1}: "${f.label}" is required.`);
            return;
          }
        }
      }
    }

    // BHK is non-negotiable for types where the matcher filters on it.
    // Without a BHK set, these units silently never auto-match any BHK-filtering lead.
    const bhkRequiredTypes = new Set(['Apartment', 'Villa', 'Individual House']);
    if (bhkRequiredTypes.has(project.propertyType)) {
      const hasBhkField = unitFields.some(f => f.key === 'bhk');
      if (!hasBhkField) {
        showToast('error', `This project is ${project.propertyType}. Add a "BHK" unit-level field in the Schema tab — the property matcher requires it.`);
        return;
      }
      for (let i = 0; i < nonEmpty.length; i++) {
        const val = nonEmpty[i]['bhk'];
        if (val === null || val === undefined || val === '' || Number(val) <= 0) {
          showToast('error', `Row ${i + 1}: BHK is required for ${project.propertyType} units (auto-matcher depends on it).`);
          return;
        }
      }
    }

    setBulkSaving(true);
    setBulkProgress({ current: 0, total: nonEmpty.length });
    try {
      for (let i = 0; i < nonEmpty.length; i++) {
        const row = nonEmpty[i];
        await addDoc(collection(db, 'inventory'), {
          projectId: project.id,
          projectName: project.name,
          location: project.location,
          propertyType: project.propertyType,
          builder: project.builder,
          status: row['status'] || 'Available',
          price: Number(row['price']) || 0,
          fields: row,
          created_at: Timestamp.now(),
        });
        setBulkProgress({ current: i + 1, total: nonEmpty.length });
      }
      showToast('success', `${nonEmpty.length} unit${nonEmpty.length > 1 ? 's' : ''} created.`);
      setShowBulkAdd(false);
      setBulkRows([]);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to save some units. Please try again.');
    } finally {
      setBulkSaving(false);
      setBulkProgress(null);
    }
  };

  const handleStatusChange = async (unit: InventoryUnit, newStatus: InventoryStatus) => {
    try {
      await updateDoc(doc(db, 'inventory', unit.id), { status: newStatus });
      if (selectedUnit?.id === unit.id) {
        setSelectedUnit(prev => prev ? { ...prev, status: newStatus } : null);
      }
      showToast('success', `Status updated to ${newStatus}.`);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to update status.');
    }
  };

  // Reset edit draft when selected unit changes
  useEffect(() => {
    setEditingUnitFields(false);
    setEditDraft({});
  }, [selectedUnit?.id]);

  const startEditFields = () => {
    if (!selectedUnit) return;
    setEditDraft({ ...(selectedUnit.fields || {}) });
    setEditingUnitFields(true);
  };

  const handleSaveEditedFields = async () => {
    if (!selectedUnit) return;
    // Validate required unit-level fields
    for (const f of unitFields) {
      if (f.required) {
        const val = editDraft[f.key];
        if (val === null || val === undefined || val === '') {
          showToast('error', `"${f.label}" is required.`);
          return;
        }
      }
    }
    // Enforce BHK for BHK-sensitive property types
    const bhkRequiredTypes = new Set(['Apartment', 'Villa', 'Individual House']);
    if (bhkRequiredTypes.has(project.propertyType)) {
      const val = editDraft['bhk'];
      if (val === null || val === undefined || val === '' || Number(val) <= 0) {
        showToast('error', `BHK is required for ${project.propertyType} units.`);
        return;
      }
    }
    setSavingEdit(true);
    try {
      const newPrice = Number(editDraft['price']) || selectedUnit.price || 0;
      const newStatus = (editDraft['status'] || selectedUnit.status || 'Available') as InventoryStatus;
      await updateDoc(doc(db, 'inventory', selectedUnit.id), {
        fields: editDraft,
        price: newPrice,
        status: newStatus,
      });
      setSelectedUnit(prev => prev ? { ...prev, fields: editDraft, price: newPrice, status: newStatus } : null);
      setEditingUnitFields(false);
      showToast('success', 'Unit updated.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to update unit.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    setDeletingUnit(true);
    try {
      await deleteDoc(doc(db, 'inventory', unitId));
      if (selectedUnit?.id === unitId) setSelectedUnit(null);
      setConfirmDeleteUnit(null);
      showToast('success', 'Unit deleted.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to delete unit.');
    } finally {
      setDeletingUnit(false);
    }
  };

  const renderCellInput = (field: SchemaField, value: any, onChange: (val: any) => void) => {
    const baseClass = 'w-full px-2 py-1.5 bg-mn-input-bg border border-mn-input-border rounded-lg text-xs text-mn-text focus:outline-none focus:border-mn-input-focus';
    const options = field.options ? field.options.split(',').map(o => o.trim()).filter(Boolean) : [];

    switch (field.type) {
      case 'dropdown':
        return (
          <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={baseClass}>
            <option value="">—</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case 'boolean':
        return (
          <select value={value === true ? 'yes' : value === false ? 'no' : ''} onChange={e => onChange(e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null)} className={baseClass}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        );
      case 'number':
        return <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={baseClass} />;
      case 'textarea':
        return <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} className={baseClass} placeholder="..." />;
      default:
        return <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} className={baseClass} />;
    }
  };

  // Bulk Add Grid View
  if (showBulkAdd) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-mn-h3 uppercase tracking-wider">Bulk Add Units</h3>
            <p className="text-[10px] text-mn-text-muted mt-0.5">Fill in unit-level fields. Empty rows are skipped.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => { setShowBulkAdd(false); setBulkRows([]); }} icon={<X className="w-4 h-4" />}>
              Cancel
            </Button>
            <Button onClick={handleBulkSave} disabled={bulkSaving}>
              {bulkSaving
                ? `Saving... (${bulkProgress?.current || 0}/${bulkProgress?.total || 0})`
                : `Save All Units`
              }
            </Button>
          </div>
        </div>

        {/* Spreadsheet grid */}
        <div className="overflow-x-auto border border-mn-border/30 rounded-xl">
          <table className="w-full text-left">
            <thead className="bg-mn-card/50 border-b border-mn-border/30">
              <tr>
                <th className="px-3 py-2.5 text-[10px] font-black text-mn-h3 uppercase tracking-wider w-10">#</th>
                {unitFields.map(f => (
                  <th key={f.id} className="px-3 py-2.5 text-[10px] font-black text-mn-h3 uppercase tracking-wider min-w-[120px]">
                    {f.label} {f.required && <span className="text-mn-danger">*</span>}
                  </th>
                ))}
                <th className="px-3 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mn-border/10">
              {bulkRows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-mn-card/30">
                  <td className="px-3 py-2 text-xs text-mn-text-muted font-bold">{rowIdx + 1}</td>
                  {unitFields.map(f => (
                    <td key={f.id} className="px-2 py-1.5">
                      {renderCellInput(f, row[f.key], val => updateBulkCell(rowIdx, f.key, val))}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <button onClick={() => removeBulkRow(rowIdx)} className="text-mn-text-muted/30 hover:text-mn-danger transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={addBulkRow}
          className="w-full p-3 border-2 border-dashed border-mn-border rounded-xl text-mn-text-muted hover:border-mn-h2 hover:text-mn-h2 font-bold text-sm transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add More Rows
        </button>
      </div>
    );
  }

  // Up to 3 secondary unit fields to show inline in the table row (skip price/status
   // since they have their own columns, and skip unit_number/plot_number since they
   // are shown as the primary label).
  const inlineFields = unitFields
    .filter(f => !['price', 'status', 'unit_number', 'plot_number'].includes(f.key))
    .slice(0, 3);
  const unitBestBuyers = reverseSnapshot?.buyers || [];

  const renderInlineValue = (field: SchemaField, value: any) => {
    if (value === null || value === undefined || value === '') return '—';
    if (field.type === 'boolean') return value === true ? 'Yes' : 'No';
    return String(value);
  };

  // Main Units View
  return (
    <div className="space-y-5">
      {/* Stats row — proper cards, not a text strip */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-mn-card border border-mn-border/50 rounded-xl p-4">
          <p className="text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1">Total Units</p>
          <p className="text-2xl font-black text-mn-text">{stats.total}</p>
        </div>
        <div className="bg-mn-success/5 border border-mn-success/30 rounded-xl p-4">
          <p className="text-[10px] font-black text-mn-success uppercase tracking-wider mb-1">Available</p>
          <p className="text-2xl font-black text-mn-success">{stats.available}</p>
        </div>
        <div className="bg-mn-warning/5 border border-mn-warning/30 rounded-xl p-4">
          <p className="text-[10px] font-black text-mn-warning uppercase tracking-wider mb-1">Booked</p>
          <p className="text-2xl font-black text-mn-warning">{stats.booked}</p>
        </div>
        <div className="bg-mn-danger/5 border border-mn-danger/30 rounded-xl p-4">
          <p className="text-[10px] font-black text-mn-danger uppercase tracking-wider mb-1">Sold</p>
          <p className="text-2xl font-black text-mn-danger">{stats.sold}</p>
        </div>
      </div>

      {/* Table + Detail — wrapped in a single framed card for visual weight */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0 bg-mn-card border border-mn-border/50 rounded-2xl shadow-sm overflow-hidden">
          {/* Toolbar: search + filter + add button, anchored to the table */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-mn-border/40 bg-mn-card/50">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-mn-text-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search units…"
                className="w-full pl-9 pr-3 py-2 bg-mn-input-bg border border-mn-input-border rounded-lg text-xs text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-mn-input-bg border border-mn-input-border rounded-lg text-xs font-bold text-mn-text focus:outline-none focus:border-mn-input-focus"
            >
              <option value="">All Status</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex-1" />
            {isAdmin && (
              <Button onClick={initBulkAdd} icon={<Plus className="w-4 h-4" />}>Add Units</Button>
            )}
          </div>

          {/* Table body */}
          <div className="overflow-x-auto">
          {loading || schemaLoading ? (
            <div className="text-center py-16 text-mn-text-muted animate-pulse">Loading units...</div>
          ) : filteredUnits.length === 0 ? (
            <div className="text-center py-16 px-6">
              <Building2 className="w-10 h-10 text-mn-border mx-auto mb-2" />
              {units.length === 0 ? (
                schema.length === 0 ? (
                  <p className="text-xs text-mn-text-muted">
                    No schema defined yet. Open the <strong className="text-mn-h2">Schema</strong> tab to define fields first.
                  </p>
                ) : unitFields.length === 0 ? (
                  <p className="text-xs text-mn-text-muted">
                    No unit-level fields in the schema. Open the <strong className="text-mn-h2">Schema</strong> tab and mark at least one field as <strong>Unit-level</strong> before adding units.
                  </p>
                ) : (
                  <p className="text-xs text-mn-text-muted">No units yet. Click <strong className="text-mn-h2">Add Units</strong> to create.</p>
                )
              ) : (
                <p className="text-xs text-mn-text-muted">No units match filters.</p>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-mn-surface/60 border-b-2 border-mn-border/60 sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-3 text-[10px] font-black text-mn-h3 uppercase tracking-wider">Unit</th>
                  {inlineFields.map(f => (
                    <th key={f.id} className="px-5 py-3 text-[10px] font-black text-mn-h3 uppercase tracking-wider whitespace-nowrap">
                      {f.label}
                    </th>
                  ))}
                  <th
                    className="px-5 py-3 text-[10px] font-black text-mn-h3 uppercase tracking-wider cursor-pointer hover:text-mn-h2 transition-colors select-none"
                    onClick={() => { setSortField('price'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
                  >
                    <div className="flex items-center gap-1">Price <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-5 py-3 text-[10px] font-black text-mn-h3 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filteredUnits.map(unit => {
                  const isSelected = selectedUnit?.id === unit.id;
                  return (
                  <tr
                    key={unit.id}
                    onClick={() => setSelectedUnit(unit)}
                    className={`border-b border-mn-border/40 last:border-b-0 transition-colors cursor-pointer ${
                      isSelected ? 'bg-mn-h2/5' : 'hover:bg-mn-surface/40'
                    }`}
                  >
                    <td className={`px-5 py-3.5 ${isSelected ? 'border-l-2 border-l-mn-h2' : 'border-l-2 border-l-transparent'}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-mn-text">
                          {unit.fields?.unit_number || unit.fields?.plot_number || unit.id.slice(-6).toUpperCase()}
                        </span>
                        {unit.status === 'Booked' && unit.booked_by_lead_id && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-mn-warning/15 text-mn-warning border border-mn-warning/30">
                            Booked by {leadNameById[unit.booked_by_lead_id] || '…'}
                          </span>
                        )}
                      </div>
                    </td>
                    {inlineFields.map(f => (
                      <td key={f.id} className="px-5 py-3.5 text-sm text-mn-text whitespace-nowrap">
                        {renderInlineValue(f, unit.fields?.[f.key])}
                      </td>
                    ))}
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-sm text-mn-h2 font-bold">{formatPrice(unit.price)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {isAdmin ? (
                        <select
                          value={unit.status || 'Available'}
                          onChange={e => { e.stopPropagation(); handleStatusChange(unit, e.target.value as InventoryStatus); }}
                          onClick={e => e.stopPropagation()}
                          className={`text-[11px] px-2.5 py-1 rounded-full font-black border cursor-pointer focus:outline-none ${
                            STATUS_COLORS[unit.status] || 'bg-mn-border/20 text-mn-text border-mn-border/30'
                          }`}
                        >
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className={`text-[11px] px-2.5 py-1 rounded-full font-black border ${
                          STATUS_COLORS[unit.status] || 'bg-mn-border/20 text-mn-text border-mn-border/30'
                        }`}>
                          {unit.status}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <ChevronRight className={`w-4 h-4 transition-colors ${isSelected ? 'text-mn-h2' : 'text-mn-text-muted/40'}`} />
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          )}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedUnit && (
          <div className="w-80 flex-shrink-0 border border-mn-border/50 rounded-2xl bg-mn-card shadow-sm overflow-y-auto max-h-[70vh]">
            <div className="sticky top-0 bg-mn-card border-b border-mn-border/50 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <div className="font-black text-mn-h1 text-base">
                  {selectedUnit.fields?.unit_number || selectedUnit.fields?.plot_number || 'Unit Details'}
                </div>
              </div>
              <button onClick={() => setSelectedUnit(null)} className="text-mn-text-muted hover:text-mn-text">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Status */}
              <div>
                <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1">Status</label>
                {isAdmin ? (
                  <select
                    value={selectedUnit.status}
                    onChange={e => handleStatusChange(selectedUnit, e.target.value as InventoryStatus)}
                    className={`text-sm px-3 py-1.5 rounded-lg font-bold border cursor-pointer bg-transparent focus:outline-none w-full ${
                      STATUS_COLORS[selectedUnit.status] || 'bg-mn-border/20 text-mn-text border-mn-border/30'
                    }`}
                  >
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <span className={`text-sm px-3 py-1.5 rounded-lg font-bold border inline-block ${
                    STATUS_COLORS[selectedUnit.status] || 'bg-mn-border/20 text-mn-text border-mn-border/30'
                  }`}>
                    {selectedUnit.status}
                  </span>
                )}
              </div>

              {/* Admin Delete */}
              {isAdmin && (
                <div className="border-t border-mn-border/20 pt-4">
                  {confirmDeleteUnit === selectedUnit.id ? (
                    <div className="p-3 bg-mn-danger/10 border border-mn-danger/20 rounded-lg space-y-2">
                      <p className="text-xs font-bold text-mn-danger">Permanently delete this unit?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmDeleteUnit(null)}
                          className="px-3 py-1.5 text-xs font-bold text-mn-text-muted bg-mn-card border border-mn-border rounded-lg hover:bg-mn-card-hover"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDeleteUnit(selectedUnit.id)}
                          disabled={deletingUnit}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-mn-danger rounded-lg hover:bg-mn-danger/80 disabled:opacity-50"
                        >
                          {deletingUnit ? 'Deleting...' : 'Yes, Delete'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteUnit(selectedUnit.id)}
                      className="flex items-center gap-1.5 text-xs font-bold text-mn-danger hover:text-mn-danger/80 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Unit
                    </button>
                  )}
                </div>
              )}

              {/* BHK missing warning — only for Apartment/Villa/Individual House */}
              {(['Apartment', 'Villa', 'Individual House'] as const).includes(project.propertyType as any) &&
                (!selectedUnit.fields?.bhk || Number(selectedUnit.fields.bhk) <= 0) && (
                  <div className="flex items-start gap-2 p-3 bg-mn-warning/10 border border-mn-warning/30 rounded-lg text-[11px]">
                    <AlertTriangle className="w-4 h-4 text-mn-warning flex-shrink-0 mt-0.5" />
                    <div className="text-mn-warning">
                      <p className="font-bold">BHK missing</p>
                      <p className="text-mn-warning/80 mt-0.5">This {project.propertyType} unit has no BHK set, so the property matcher will silently skip it for every lead that filters on BHK. Click Edit below to fix.</p>
                    </div>
                  </div>
              )}

              {/* All Fields */}
              <div className="border-t border-mn-border/20 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-black text-mn-h3 uppercase tracking-wider">Unit Fields</h3>
                  {isAdmin && !editingUnitFields && (
                    <button
                      onClick={startEditFields}
                      className="flex items-center gap-1 text-[11px] font-bold text-mn-h2 hover:text-mn-h2/80"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
                {editingUnitFields ? (
                  <div className="space-y-3">
                    {unitFields.map(field => (
                      <div key={field.id}>
                        <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1">
                          {field.label} {field.required && <span className="text-mn-danger">*</span>}
                        </label>
                        {renderCellInput(field, editDraft[field.key], val => setEditDraft(prev => ({ ...prev, [field.key]: val })))}
                      </div>
                    ))}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => { setEditingUnitFields(false); setEditDraft({}); }}
                        className="flex-1 px-3 py-2 text-xs font-bold text-mn-text-muted bg-mn-card border border-mn-border rounded-lg hover:bg-mn-card-hover transition-colors flex items-center justify-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                      <button
                        onClick={handleSaveEditedFields}
                        disabled={savingEdit}
                        className="flex-1 px-3 py-2 text-xs font-bold text-white bg-mn-h2 rounded-lg hover:bg-mn-h2/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                      >
                        <Save className="w-3.5 h-3.5" /> {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {unitFields.length > 0 ? (
                      unitFields.map(field => {
                        const val = selectedUnit.fields?.[field.key];
                        return (
                          <div key={field.id} className="flex justify-between items-start gap-2">
                            <span className="text-xs font-bold text-mn-text-muted flex-shrink-0">{field.label}</span>
                            <span className="text-sm text-mn-text text-right font-medium">
                              {val === null || val === undefined || val === ''
                                ? <span className="text-mn-text-muted/40">{'\u2014'}</span>
                                : field.type === 'boolean'
                                  ? <span className={val === true ? 'text-mn-success' : 'text-mn-danger'}>{val === true ? 'Yes' : 'No'}</span>
                                  : field.type === 'number' && field.key === 'price'
                                    ? formatPrice(Number(val))
                                    : String(val)
                              }
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      Object.entries(selectedUnit.fields || {}).map(([key, val]) => (
                        <div key={key} className="flex justify-between items-start gap-2">
                          <span className="text-xs font-bold text-mn-text-muted flex-shrink-0 capitalize">{key.replace(/_/g, ' ')}</span>
                          <span className="text-sm text-mn-text text-right">
                            {val === true ? 'Yes' : val === false ? 'No' : val === null || val === undefined || val === '' ? '\u2014' : String(val)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-mn-border/20 pt-4">
                <BestBuyersPanel
                  title="Best Buyers"
                  subtitle={`Server-ranked buyers for this ${project.propertyType.toLowerCase()} unit.`}
                  buyers={unitBestBuyers}
                  emptyText={selectedUnit.status !== 'Available'
                    ? 'This unit is not available, so reverse matching is intentionally paused.'
                    : 'No active leads currently fit this unit strongly enough to rank here yet.'}
                  compact
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
