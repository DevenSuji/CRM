"use client";
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { orderBy, addDoc, collection, Timestamp, doc, updateDoc, arrayUnion, arrayRemove, getDoc, deleteDoc, getDocs, query, where, writeBatch, deleteField, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  LayoutDashboard, UserPlus, Phone, Mail, MapPin, Calendar, Target, Save,
  Plus, PhoneCall, MessageSquare, Clock, CalendarPlus, CheckCircle, XCircle, Send,
  Trash2, Bell, PhoneForwarded, AlarmClock, Upload, FileSpreadsheet, AlertTriangle,
  Building2, SendHorizontal, X, Megaphone, Sparkles, Home,
  Maximize2, Minimize2,
} from 'lucide-react';
import { useFirestoreCollection, useFirestoreCollectionKeyed } from '@/lib/hooks/useFirestoreCollection';
import { useFirestoreDoc } from '@/lib/hooks/useFirestoreDoc';
import { useToast } from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/context/AuthContext';
import { Lead, ActivityLogEntry, SiteVisit, CallbackRequest, InterestedProperty, BookedUnit } from '@/lib/types/lead';
import { KanbanConfig, DEFAULT_KANBAN_CONFIG, LeadCardColorsConfig, DEFAULT_LEAD_CARD_COLORS, WhatsAppConfig, PropertyMatchConfig, DEFAULT_PROPERTY_MATCH_CONFIG } from '@/lib/types/config';
import { InventoryUnit } from '@/lib/types/inventory';
import { Project } from '@/lib/types/project';
import { usePropertyMatching, resolveInterests, diagnoseMatches } from '@/lib/hooks/usePropertyMatching';
import { can } from '@/lib/utils/permissions';
import { MatchThresholdSlider } from '@/components/MatchThresholdSlider';
import { KanbanBoard } from '@/components/KanbanBoard';
import { CallbackAlarmOverlay } from '@/components/CallbackAlarmOverlay';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LocationAutocomplete } from '@/components/ui/LocationAutocomplete';
import { PropertySearch } from '@/components/PropertySearch';
import { PropertyTooltip } from '@/components/PropertyTooltip';
import { formatPrice } from '@/lib/utils/formatPrice';
import { geocodeAddress } from '@/lib/utils/geocode';
import { ProjectLocationSearch } from '@/components/ProjectLocationSearch';
import { DateTimePicker } from '@/components/ui/DateTimePicker';
import { parseCSV, normalizeLead, isValidRow, getLeadName, getPhone, getEmail, type CSVRow } from '@/lib/utils/csvImport';
import { injectPropertyMatchedLane, backfillLaneEmojis } from '@/lib/utils/kanbanLanes';

export default function LeadsPage() {
  const { crmUser } = useAuth();
  const isAdmin = crmUser?.role === 'admin' || crmUser?.role === 'superadmin';
  const ownLeadsOnly = can(crmUser?.role, 'view_own_leads_only') && !can(crmUser?.role, 'view_all_leads');

  // Build the leads subscription deliberately: CPs must filter by owner_uid
  // at query-level (rules deny a full-collection listener for them). We wait
  // until crmUser resolves before subscribing — pass `null` as the key to skip.
  const leadsKey = !crmUser ? null : (ownLeadsOnly ? `own:${crmUser.uid}` : 'all');
  const leadsConstraints = useMemo(() => {
    if (ownLeadsOnly && crmUser?.uid) {
      return [where('owner_uid', '==', crmUser.uid), orderBy('created_at', 'desc')];
    }
    return [orderBy('created_at', 'desc')];
  }, [ownLeadsOnly, crmUser]);
  const { data: leads, loading: leadsLoading } = useFirestoreCollectionKeyed<Lead>(
    'leads',
    leadsKey,
    leadsConstraints,
  );

  const { data: kanbanConfig } = useFirestoreDoc<KanbanConfig & { id: string }>(
    'crm_config',
    'kanban',
  );

  const { data: cardColorsConfig } = useFirestoreDoc<LeadCardColorsConfig & { id: string }>(
    'crm_config',
    'lead_card_colors',
  );

  const { data: matchConfig } = useFirestoreDoc<PropertyMatchConfig & { id: string }>(
    'crm_config',
    'property_match',
  );

  const { data: inventoryUnits } = useFirestoreCollection<InventoryUnit>(
    'inventory',
    where('status', '==', 'Available'),
  );

  const { data: allProjects } = useFirestoreCollection<Project>(
    'projects',
    orderBy('created_at', 'desc'),
  );

  const thresholdPercent = matchConfig?.threshold_percent ?? DEFAULT_PROPERTY_MATCH_CONFIG.threshold_percent;

  // Property matching hook — auto-matches leads against available inventory
  usePropertyMatching({
    leads,
    inventory: inventoryUnits,
    projects: allProjects,
    thresholdPercent,
    userName: crmUser?.name || 'System',
    enabled: !leadsLoading,
  });

  const lanes = useMemo(() => {
    const raw = (kanbanConfig?.lanes && kanbanConfig.lanes.length > 0) ? kanbanConfig.lanes : DEFAULT_KANBAN_CONFIG.lanes;
    return backfillLaneEmojis(injectPropertyMatchedLane(raw));
  }, [kanbanConfig]);

  const availableColors = useMemo(
    () => (cardColorsConfig?.colors && cardColorsConfig.colors.length > 0) ? cardColorsConfig.colors : DEFAULT_LEAD_CARD_COLORS.colors,
    [cardColorsConfig],
  );

  const stats = useMemo(() => {
    const total = leads.length;
    const highUrgency = leads.filter(l => l.ai_audit?.urgency === 'High').length;
    const matched = leads.filter(l => l.suggested_plot).length;
    return { total, highUrgency, matched };
  }, [leads]);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const [fitToWindow, setFitToWindow] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('leads_fit_to_window') === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('leads_fit_to_window', fitToWindow ? '1' : '0');
  }, [fitToWindow]);

  const handleClickLead = useCallback((lead: Lead) => {
    setSelectedLead(lead);
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader
        title="Leads"
        subtitle=""
        actions={
          <div className="flex items-center gap-3">
            <MatchThresholdSlider value={thresholdPercent} />
            <div className="w-px h-6 bg-mn-border/30" />
            <button
              type="button"
              onClick={() => setFitToWindow(v => !v)}
              title={fitToWindow ? 'Switch to horizontal scroll' : 'Fit all lanes in one window'}
              aria-label={fitToWindow ? 'Switch to horizontal scroll' : 'Fit all lanes in one window'}
              aria-pressed={fitToWindow}
              className={`flex items-center justify-center w-8 h-8 rounded-md border transition-colors ${
                fitToWindow
                  ? 'bg-mn-accent/20 border-mn-accent text-mn-accent'
                  : 'bg-transparent border-mn-border/40 text-mn-text-muted hover:text-mn-text hover:border-mn-border'
              }`}
            >
              {fitToWindow ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <Badge variant="default">{stats.total} total</Badge>
            {stats.highUrgency > 0 && (
              <Badge variant="danger">{stats.highUrgency} high urgency</Badge>
            )}
            {stats.matched > 0 && (
              <Badge variant="success">{stats.matched} matched</Badge>
            )}
            {can(crmUser?.role, 'bulk_upload_leads') && (
              <Button variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={() => setShowImportModal(true)}>
                Import CSV
              </Button>
            )}
            <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
              Create Lead
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden pt-4">
        {leadsLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <LayoutDashboard className="w-12 h-12 text-mn-border mx-auto mb-3 animate-pulse" />
              <p className="text-mn-text-muted font-medium">Loading leads...</p>
            </div>
          </div>
        ) : (
          <KanbanBoard leads={leads} lanes={lanes} onClickLead={handleClickLead} availableColors={availableColors} fitToWindow={fitToWindow} />
        )}
      </div>

      <AddLeadModal open={showAddModal} onClose={() => setShowAddModal(false)} />
      <ImportCSVModal open={showImportModal} onClose={() => setShowImportModal(false)} userName={crmUser?.name || 'Unknown'} />
      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          isAdmin={isAdmin}
          userName={crmUser?.name || 'Unknown'}
          userUid={crmUser?.uid || ''}
          inventory={inventoryUnits}
          projects={allProjects}
          globalThresholdPercent={thresholdPercent}
        />
      )}

      {/* Callback alarm overlay — checks all leads for due callbacks */}
      <CallbackAlarmOverlay leads={leads} onOpenLead={handleClickLead} currentUserUid={crmUser?.uid || ''} />
    </div>
  );
}

/* ==================== ADD LEAD MODAL ==================== */
function AddLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const { crmUser } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [budget, setBudget] = useState('');
  const [planToBuy, setPlanToBuy] = useState('');
  const [profession, setProfession] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [interests, setInterests] = useState<string[]>(['Plotted Land']);
  const [bhk, setBhk] = useState<number>(0);
  const [houseVariant, setHouseVariant] = useState('');

  const toggleInterest = (opt: string) => {
    setInterests(prev => prev.includes(opt) ? prev.filter(i => i !== opt) : [...prev, opt]);
  };

  const showBhkField = interests.some(i => BHK_PROPERTY_TYPES.includes(i));
  const showVariantField = interests.includes('Individual House');

  const resetForm = () => {
    setName(''); setPhone(''); setEmail(''); setBudget('');
    setPlanToBuy(''); setProfession(''); setLocation('');
    setNote(''); setInterests(['Plotted Land']); setBhk(0); setHouseVariant('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      showToast('error', 'Name and phone number are required.');
      return;
    }
    const leadName = name.trim();
    const leadData = {
      status: 'New',
      created_at: Timestamp.now(),
      source: crmUser?.role === 'channel_partner' ? 'Channel Partner' : 'Walk-in',
      owner_uid: crmUser?.uid || null,
      raw_data: {
        lead_name: leadName,
        phone: phone.trim(),
        email: email.trim() || 'N/A',
        budget: Number(budget) || 0,
        plan_to_buy: planToBuy || 'Not Specified',
        profession: profession || 'Not Specified',
        location: location || 'Unknown',
        note: note || 'Walk-in customer',
        pref_facings: [],
        interest: interests[0] || 'General Query',
        interests: interests,
        ...(bhk > 0 ? { bhk } : {}),
        ...(houseVariant ? { house_variant: houseVariant } : {}),
      },
    };

    // Close modal immediately for snappy UX
    resetForm();
    onClose();
    showToast('success', `Lead "${leadName}" created successfully!`);

    // Write to Firestore in background
    try {
      const docRef = await addDoc(collection(db, 'leads'), leadData);
      // Geocode location in background
      if (location) {
        geocodeAddress(location).then(geo => {
          if (geo) {
            updateDoc(doc(db, 'leads', docRef.id), { 'raw_data.geo': geo }).catch(() => {});
          }
        });
      }
    } catch (err) {
      console.error(err);
      showToast('error', `Failed to save lead "${leadName}". Please try again.`);
    }
  };

  return (
    <Modal open={open} onClose={() => { onClose(); resetForm(); }} title="Create Lead">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Name"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Customer name"
          />
          <Input
            label="Phone"
            required
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="customer@email.com"
          />
          <Input
            label="Budget"
            type="number"
            value={budget}
            onChange={e => setBudget(e.target.value)}
            placeholder="e.g. 5000000"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <LocationAutocomplete
            label="Location"
            value={location}
            onChange={setLocation}
            placeholder="e.g. Bogadhi, Mysore"
          />
          <Select
            label="Timeline"
            value={planToBuy}
            onChange={e => setPlanToBuy(e.target.value)}
            placeholder="When planning to buy?"
            options={[
              { value: 'Immediately', label: 'Immediately' },
              { value: '1-3 months', label: '1-3 months' },
              { value: '3-6 months', label: '3-6 months' },
              { value: '6-12 months', label: '6-12 months' },
              { value: 'Just exploring', label: 'Just exploring' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Profession"
            value={profession}
            onChange={e => setProfession(e.target.value)}
            placeholder="e.g. Software Engineer"
          />
          <div>
            <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Interest</label>
            <div className="flex flex-wrap gap-1.5">
              {INTEREST_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleInterest(opt)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                    interests.includes(opt)
                      ? 'bg-mn-h2/15 border-mn-h2/40 text-mn-h2'
                      : 'bg-mn-input-bg border-mn-input-border text-mn-text-muted hover:border-mn-input-focus'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* BHK + Variant — shown conditionally based on selected interests */}
        {(showBhkField || showVariantField) && (
          <div className="grid grid-cols-2 gap-4">
            {showBhkField && (
              <Select
                label="BHK"
                value={String(bhk)}
                onChange={e => setBhk(Number(e.target.value))}
                placeholder="Select BHK"
                options={[
                  { value: '0', label: 'Any BHK' },
                  ...BHK_OPTIONS.map(b => ({ value: String(b), label: `${b} BHK` })),
                ]}
              />
            )}
            {showVariantField && (
              <Select
                label="House Variant"
                value={houseVariant}
                onChange={e => setHouseVariant(e.target.value)}
                placeholder="Select variant"
                options={[
                  { value: '', label: 'Any Variant' },
                  ...HOUSE_VARIANTS.map(v => ({ value: v, label: v })),
                ]}
              />
            )}
          </div>
        )}
        <div>
          <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Notes</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="Any notes from the conversation..."
            className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus resize-none"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => { onClose(); resetForm(); }}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1">
            Create Lead
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ==================== CSV IMPORT MODAL ==================== */
// Parser + transform live in lib/utils/csvImport.ts so they're testable.

function ImportCSVModal({ open, onClose, userName }: { open: boolean; onClose: () => void; userName: string }) {
  const { showToast } = useToast();
  const { crmUser } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CSVRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setPreview(rows);
    };
    reader.readAsText(selected);
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    setImporting(true);
    let success = 0;
    let failed = 0;

    for (const row of preview) {
      if (!isValidRow(row)) {
        failed++;
        continue;
      }
      const leadData = normalizeLead(row, { role: crmUser?.role, uid: crmUser?.uid });
      try {
        await addDoc(collection(db, 'leads'), leadData);
        success++;
      } catch {
        failed++;
      }
    }

    setImportResult({ success, failed });
    setImporting(false);
    if (success > 0) {
      showToast('success', `${success} lead${success > 1 ? 's' : ''} imported successfully!`);
    }
    if (failed > 0) {
      showToast('error', `${failed} row${failed > 1 ? 's' : ''} failed to import.`);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview([]);
    setImportResult(null);
    onClose();
  };

  if (!open) return null;

  return (
    <Modal open onClose={handleClose} title="Import Leads from CSV" maxWidth="max-w-3xl">
      <div className="space-y-4">
        {/* Instructions */}
        <div className="p-4 bg-mn-surface border border-mn-border/30 rounded-xl">
          <h4 className="text-sm font-black text-mn-h1 flex items-center gap-2 mb-2">
            <FileSpreadsheet className="w-4 h-4" />
            CSV Format
          </h4>
          <p className="text-xs text-mn-text-muted mb-2">
            Your CSV should have a header row. The following column names are recognized (case-insensitive):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {['name / lead_name / full_name', 'phone / mobile', 'email', 'budget', 'timeline / plan_to_buy', 'profession', 'location', 'note / notes', 'interest', 'source'].map(col => (
              <span key={col} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-mn-h2/10 text-mn-h2">
                {col}
              </span>
            ))}
          </div>
        </div>

        {/* File picker */}
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="secondary"
            icon={<Upload className="w-4 h-4" />}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? 'Change File' : 'Choose CSV File'}
          </Button>
          {file && (
            <span className="text-sm text-mn-text">
              {file.name} <span className="text-mn-text-muted">({preview.length} rows)</span>
            </span>
          )}
        </div>

        {/* Preview table */}
        {preview.length > 0 && (
          <div className="border border-mn-border/30 rounded-xl overflow-hidden">
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-mn-surface sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">#</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Name</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Phone</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Email</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Budget</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Location</th>
                    <th className="px-3 py-2 text-left font-black text-mn-h3 uppercase tracking-wider">Interest</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, idx) => {
                    const name = getLeadName(row);
                    const phone = getPhone(row);
                    const invalid = name === 'Unknown' && phone === 'N/A';
                    return (
                      <tr key={idx} className={`border-t border-mn-border/20 ${invalid ? 'bg-mn-danger/5' : ''}`}>
                        <td className="px-3 py-2 text-mn-text-muted">{idx + 1}</td>
                        <td className="px-3 py-2 text-mn-text font-bold">
                          {invalid && <AlertTriangle className="w-3 h-3 text-mn-danger inline mr-1" />}
                          {name}
                        </td>
                        <td className="px-3 py-2 text-mn-text">{phone}</td>
                        <td className="px-3 py-2 text-mn-text-muted">{getEmail(row)}</td>
                        <td className="px-3 py-2 text-mn-text">{row.budget || '—'}</td>
                        <td className="px-3 py-2 text-mn-text">{row.location || '—'}</td>
                        <td className="px-3 py-2 text-mn-text">{row.interest || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import result */}
        {importResult && (
          <div className="p-3 rounded-xl bg-mn-surface border border-mn-border/30 text-sm">
            <span className="text-mn-success font-bold">{importResult.success} imported</span>
            {importResult.failed > 0 && (
              <span className="text-mn-danger font-bold ml-3">{importResult.failed} failed</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2 border-t border-mn-border/30">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose}>
            {importResult ? 'Done' : 'Cancel'}
          </Button>
          {!importResult && (
            <Button
              type="button"
              className="flex-1"
              icon={<Upload className="w-4 h-4" />}
              disabled={importing || preview.length === 0}
              onClick={handleImport}
            >
              {importing ? `Importing... (${preview.length} leads)` : `Import ${preview.length} Lead${preview.length !== 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ==================== LEAD DETAIL / EDIT MODAL ==================== */
const INTEREST_OPTIONS = [
  'Plotted Land', 'Villa', 'Apartment', 'Individual House', 'Commercial Building', 'Commercial Land',
  'Managed Farmland', 'Agricultural Land', 'Industrial Building', 'Industrial Land',
];

const BHK_PROPERTY_TYPES = ['Apartment', 'Villa', 'Individual House'];
const HOUSE_VARIANTS = ['Simplex', 'Duplex', 'Triplex', 'Quadraplex'];
const BHK_OPTIONS = [1, 2, 3, 4, 5, 6];
const THRESHOLD_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

const STATUS_OPTIONS = [
  'New', 'First Call', 'Nurturing', 'Property Matched', 'Site Visit', 'Booked', 'Closed', 'Rejected',
];

type DetailTab = 'details' | 'activity' | 'visits';

function LeadDetailModal({ lead, onClose, isAdmin = false, userName = 'Admin', userUid = '', inventory = [], projects: allProjectsList = [], globalThresholdPercent = 0 }: { lead: Lead; onClose: () => void; isAdmin?: boolean; userName?: string; userUid?: string; inventory?: InventoryUnit[]; projects?: Project[]; globalThresholdPercent?: number }) {
  const { showToast } = useToast();
  const raw = lead.raw_data;
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('details');

  // Editable fields
  const [status, setStatus] = useState(lead.status);
  const [name, setName] = useState(raw.lead_name);
  const [phone, setPhone] = useState(raw.phone);
  const [email, setEmail] = useState(raw.email);
  const [budget, setBudget] = useState(String(raw.budget || ''));
  const [planToBuy, setPlanToBuy] = useState(raw.plan_to_buy);
  const [profession, setProfession] = useState(raw.profession);
  const [location, setLocation] = useState(raw.location);
  const [interests, setInterests] = useState<string[]>(resolveInterests(raw));
  const [bhk, setBhk] = useState<number>(raw.bhk || 0);
  const [houseVariant, setHouseVariant] = useState(raw.house_variant || '');
  const [matchThreshold, setMatchThreshold] = useState<number>(lead.match_threshold || 0); // 0 = use global
  const [showMatchDiagnosis, setShowMatchDiagnosis] = useState(false);

  const toggleInterest = (opt: string) => {
    setInterests(prev => prev.includes(opt) ? prev.filter(i => i !== opt) : [...prev, opt]);
  };

  const showBhkField = interests.some(i => BHK_PROPERTY_TYPES.includes(i));
  const showVariantField = interests.includes('Individual House');

  // Activity log
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Site visit
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [visitLocation, setVisitLocation] = useState('');
  const [visitNotes, setVisitNotes] = useState('');
  const [schedulingVisit, setSchedulingVisit] = useState(false);
  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);
  const [deleteVisitNotes, setDeleteVisitNotes] = useState('');
  const [deletingVisit, setDeletingVisit] = useState(false);

  // Callback request
  const [showCallbackForm, setShowCallbackForm] = useState(false);
  const [callbackDate, setCallbackDate] = useState('');
  const [callbackNotes, setCallbackNotes] = useState('');
  const [schedulingCallback, setSchedulingCallback] = useState(false);

  // Interested properties
  const [interestedProperties, setInterestedProperties] = useState<InterestedProperty[]>(lead.interested_properties || []);
  const [sendingPropertyDetails, setSendingPropertyDetails] = useState(false);

  // Booked unit (only set when lead is in Booked lane)
  const [bookedUnit, setBookedUnit] = useState<BookedUnit | null>(lead.booked_unit ?? null);
  const [pickerProjectId, setPickerProjectId] = useState<string>('');
  const [availableUnits, setAvailableUnits] = useState<InventoryUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [savingBooking, setSavingBooking] = useState(false);

  // Notes Polish (Gemini)
  const [polishing, setPolishing] = useState(false);

  // Hover tooltip for tagged properties
  const [hoveredProp, setHoveredProp] = useState<{ projectId: string; rect: DOMRect } | null>(null);
  const hoverTimer = useRef<number | null>(null);

  // Delete lead (admin only)
  const handleDeleteLead = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'leads', lead.id));
      showToast('success', `Lead "${raw.lead_name}" deleted.`);
      onClose();
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to delete lead.');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // Schedule callback
  const handleScheduleCallback = async () => {
    if (!callbackDate) { showToast('error', 'Select a date and time for the callback.'); return; }
    setSchedulingCallback(true);
    const callback: CallbackRequest = {
      id: `cb_${Date.now()}`,
      scheduled_at: new Date(callbackDate).toISOString(),
      notes: callbackNotes,
      created_at: new Date().toISOString(),
      created_by: userName,
      assigned_to: userUid,
      status: 'pending',
    };
    const logEntry: ActivityLogEntry = {
      id: `cb_log_${Date.now()}`,
      type: 'callback_scheduled',
      text: `Callback scheduled for ${new Date(callbackDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}${callbackNotes ? ` — ${callbackNotes}` : ''}`,
      author: userName,
      created_at: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        callback_requests: arrayUnion(callback),
        activity_log: arrayUnion(logEntry),
      });
      setShowCallbackForm(false);
      setCallbackDate('');
      setCallbackNotes('');
      showToast('success', 'Callback scheduled! You will be alerted when it is time.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to schedule callback.');
    } finally {
      setSchedulingCallback(false);
    }
  };

  // Load Available units for a given project when the picker chooses it.
  // Query filters to status == 'Available' — the hard block that makes double-booking impossible.
  useEffect(() => {
    if (!pickerProjectId) { setAvailableUnits([]); return; }
    let cancelled = false;
    setLoadingUnits(true);
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'inventory'),
          where('projectId', '==', pickerProjectId),
          where('status', '==', 'Available'),
        ));
        if (cancelled) return;
        const units = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InventoryUnit, 'id'>) }));
        setAvailableUnits(units);
      } catch (err) {
        console.error('Failed to load units:', err);
        if (!cancelled) setAvailableUnits([]);
      } finally {
        if (!cancelled) setLoadingUnits(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pickerProjectId]);

  // Commit the booking: write lead.booked_unit + flip status to Booked + mark unit as Booked
  // in a single batch so the two documents can never drift out of sync.
  const handleBookUnit = async (unit: InventoryUnit) => {
    const unitLabel = unit.fields?.unit_number || unit.fields?.plot_number || unit.id.slice(-6).toUpperCase();
    const newBooking: BookedUnit = {
      projectId: unit.projectId,
      projectName: unit.projectName,
      unitId: unit.id,
      unitLabel,
      booked_at: new Date().toISOString(),
      booked_by: userName,
    };
    setSavingBooking(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'leads', lead.id), {
        status: 'Booked',
        booked_unit: newBooking,
        lane_moved_at: serverTimestamp(),
      });
      batch.update(doc(db, 'inventory', unit.id), {
        status: 'Booked',
        booked_by_lead_id: lead.id,
      });
      // Activity log entry (separate update — arrayUnion not supported in batch.update payload
      // merge cleanly alongside status field due to Firestore types, use updateDoc after batch)
      await batch.commit();
      await updateDoc(doc(db, 'leads', lead.id), {
        activity_log: arrayUnion({
          id: `book_${Date.now()}`,
          type: 'status_change',
          text: `Booked ${unit.projectName} — Unit ${unitLabel}`,
          author: userName,
          created_at: new Date().toISOString(),
        } as ActivityLogEntry),
      });
      setBookedUnit(newBooking);
      setStatus('Booked');
      setPickerProjectId('');
      showToast('success', `Booked ${unit.projectName} — Unit ${unitLabel}`);
    } catch (err) {
      console.error('Failed to book unit:', err);
      showToast('error', 'Failed to book unit. Check connection.');
    } finally {
      setSavingBooking(false);
    }
  };

  // Release the held unit — moves the lead back to 'Site Visit' lane and frees the inventory unit.
  const handleUnbookUnit = async () => {
    if (!bookedUnit) return;
    setSavingBooking(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'leads', lead.id), {
        status: 'Site Visit',
        booked_unit: deleteField(),
        lane_moved_at: serverTimestamp(),
      });
      batch.update(doc(db, 'inventory', bookedUnit.unitId), {
        status: 'Available',
        booked_by_lead_id: deleteField(),
      });
      await batch.commit();
      setBookedUnit(null);
      setStatus('Site Visit');
      showToast('success', 'Unit released. Lead moved back to Site Visit.');
    } catch (err) {
      console.error('Failed to unbook unit:', err);
      showToast('error', 'Failed to release unit.');
    } finally {
      setSavingBooking(false);
    }
  };

  // Tag a property to this lead
  const handleTagProperty = async (property: InterestedProperty) => {
    const taggedProperty = { ...property, tagged_by: userName };
    const updated = [...interestedProperties, taggedProperty];
    setInterestedProperties(updated);
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        interested_properties: updated,
      });
      showToast('success', `${property.projectName} tagged.`);
    } catch (err) {
      console.error(err);
      setInterestedProperties(interestedProperties); // rollback
      showToast('error', 'Failed to tag property.');
    }
  };

  // Un-dismiss a previously dismissed project so auto-matching can reconsider it.
  const handleUndismissProject = async (projectId: string) => {
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        dismissed_matches: arrayRemove(projectId),
      });
      showToast('success', 'Project restored to auto-matching.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to restore project.');
    }
  };

  // Remove a tagged property — if it was auto-matched, add to dismissed_matches
  const handleRemoveProperty = async (projectId: string) => {
    const removedProp = interestedProperties.find(p => p.projectId === projectId);
    const updated = interestedProperties.filter(p => p.projectId !== projectId);
    setInterestedProperties(updated);
    try {
      const updateData: Record<string, any> = { interested_properties: updated };
      // If removing an auto-matched property, add to dismissed_matches so it won't re-appear
      if (removedProp?.tagged_by === 'system-match') {
        updateData.dismissed_matches = arrayUnion(projectId);
      }
      await updateDoc(doc(db, 'leads', lead.id), updateData);
      showToast('success', 'Property removed.');
    } catch (err) {
      console.error(err);
      setInterestedProperties(interestedProperties); // rollback
      showToast('error', 'Failed to remove property.');
    }
  };

  // Send property details via WhatsApp — fetches full project data for rich message
  const handleSendPropertyDetails = async () => {
    if (interestedProperties.length === 0) {
      showToast('error', 'No properties tagged. Tag at least one property first.');
      return;
    }
    setSendingPropertyDetails(true);
    try {
      const configSnap = await getDoc(doc(db, 'crm_config', 'whatsapp'));
      if (!configSnap.exists() || !configSnap.data().enabled) {
        showToast('error', 'WhatsApp is not configured. Go to Admin Console to set it up.');
        setSendingPropertyDetails(false);
        return;
      }
      const waConfig = configSnap.data() as WhatsAppConfig;

      // Clean phone number
      let toPhone = raw.phone.replace(/[\s\-()]/g, '');
      if (toPhone.startsWith('+')) toPhone = toPhone.slice(1);
      if (!toPhone.startsWith('91') && toPhone.length === 10) toPhone = '91' + toPhone;

      // Fetch full project details for each tagged property
      const projectDetails: { prop: InterestedProperty; project: any }[] = [];
      for (const prop of interestedProperties) {
        try {
          const projectSnap = await getDoc(doc(db, 'projects', prop.projectId));
          projectDetails.push({ prop, project: projectSnap.exists() ? projectSnap.data() : null });
        } catch {
          projectDetails.push({ prop, project: null });
        }
      }

      // Build rich formatted message with full property details
      const propertyLines = projectDetails.map(({ prop, project }, i) => {
        let line = `*${i + 1}. ${prop.projectName}*`;
        line += `\n📍 Location: ${prop.location}`;
        line += `\n🏠 Type: ${prop.propertyType}`;
        if (prop.bestPrice && prop.bestPrice > 0) {
          line += `\n💰 Starting from: ₹${prop.bestPrice.toLocaleString('en-IN')}`;
        }
        if (prop.matchedUnitCount && prop.matchedUnitCount > 0) {
          line += `\n📦 ${prop.matchedUnitCount} unit${prop.matchedUnitCount > 1 ? 's' : ''} available`;
        }
        if (project) {
          if (project.status) line += `\n📋 Status: ${project.status}`;
          // Include project-level fields (RERA, amenities, etc.)
          if (project.project_fields) {
            const fields = project.project_fields;
            if (fields.rera_approved) line += `\n✅ RERA Approved`;
            if (fields.gated_community) line += `\n🔒 Gated Community`;
            if (fields.amenities) line += `\n🏊 Amenities: ${fields.amenities}`;
            if (fields.water_source) line += `\n💧 Water: ${fields.water_source}`;
            if (fields.power_backup) line += `\n⚡ Power Backup: ${fields.power_backup}`;
            if (fields.khata_type) line += `\n📄 Khata: ${fields.khata_type}`;
            if (fields.road_type) line += `\n🛣️ Road: ${fields.road_type}`;
            if (fields.parking_type) line += `\n🅿️ Parking: ${fields.parking_type}`;
          }
        }
        return line;
      }).join('\n\n———————————\n\n');

      const messageBody = `Hello ${raw.lead_name}! 👋\n\nThank you for your interest in real estate. Here are the property details curated for you:\n\n${propertyLines}\n\n———————————\n\nWe'd love to help you find your dream property! Feel free to reach out for more details, floor plans, or to schedule a site visit.\n\n📞 Call us anytime\n🏠 Visit us for a personal tour\n\n_— Elite Build Infra Tech_`;

      // Send the text message first
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${waConfig.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: toPhone,
            type: 'text',
            text: { body: messageBody },
          }),
        }
      );

      // Send ALL images (hero + gallery) for each property
      for (const { prop, project } of projectDetails) {
        const images: string[] = [];
        if (prop.heroImage) images.push(prop.heroImage);
        if (project?.gallery) images.push(...project.gallery);

        // Send up to 5 images per property to avoid spam
        for (const imgUrl of images.slice(0, 5)) {
          try {
            await fetch(
              `https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${waConfig.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: toPhone,
                  type: 'image',
                  image: {
                    link: imgUrl,
                    caption: images.indexOf(imgUrl) === 0
                      ? `📸 ${prop.projectName} — ${prop.location}`
                      : `${prop.projectName}`,
                  },
                }),
              }
            );
          } catch (imgErr) {
            console.error('Failed to send image:', imgErr);
          }
        }
      }

      if (response.ok) {
        // Log to activity
        const propertyNames = interestedProperties.map(p => p.projectName).join(', ');
        const logEntry: ActivityLogEntry = {
          id: `prop_wa_${Date.now()}`,
          type: 'property_details_sent',
          text: `Property details sent via WhatsApp: ${propertyNames}`,
          author: userName,
          created_at: new Date().toISOString(),
        };
        await updateDoc(doc(db, 'leads', lead.id), {
          activity_log: arrayUnion(logEntry),
        });
        showToast('success', 'Property details sent via WhatsApp!');
      } else {
        const errText = await response.text();
        console.error('WhatsApp API error:', errText);
        showToast('error', 'Failed to send WhatsApp message. Check config.');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to send property details.');
    } finally {
      setSendingPropertyDetails(false);
    }
  };

  // Compute first contact date from activity log
  const firstContactDate = useMemo(() => {
    const contactTypes: string[] = ['call', 'note', 'whatsapp_sent'];
    const contactEntries = (lead.activity_log || [])
      .filter(e => contactTypes.includes(e.type))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return contactEntries.length > 0 ? contactEntries[0].created_at : null;
  }, [lead.activity_log]);

  const handleSave = async () => {
    // Block saving status=Booked without a unit selection — protects against the
    // double-booking scenario when the user changes status via the dropdown.
    if (status === 'Booked' && !bookedUnit) {
      showToast('error', 'Select a booked unit before saving with status "Booked".');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        status,
        raw_data: {
          ...raw,
          lead_name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || 'N/A',
          budget: Number(budget) || 0,
          plan_to_buy: planToBuy,
          profession: profession,
          location: location,
          interest: interests[0] || raw.interest || 'General Query',
          interests: interests,
          ...(bhk > 0 ? { bhk } : { bhk: 0 }),
          ...(houseVariant ? { house_variant: houseVariant } : {}),
        },
        interested_properties: interestedProperties,
        ...(matchThreshold > 0 ? { match_threshold: matchThreshold } : { match_threshold: null }),
      });
      showToast('success', `Lead "${name}" updated!`);
      onClose();

      // Geocode location in background (fire-and-forget) if location changed
      if (location !== raw.location || !lead.raw_data.geo) {
        geocodeAddress(location).then(geo => {
          if (geo) {
            updateDoc(doc(db, 'leads', lead.id), { 'raw_data.geo': geo }).catch(() => {});
          }
        });
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to update lead.');
    } finally {
      setSaving(false);
    }
  };

  const handlePolishNote = async () => {
    const text = newNote.trim();
    if (!text) return;
    setPolishing(true);
    try {
      const res = await fetch('/api/polish-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('error', data.error || 'Failed to polish note.');
        return;
      }
      if (typeof data.polished === 'string' && data.polished) {
        setNewNote(data.polished);
        showToast('success', 'Note polished. Review before adding.');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to polish note.');
    } finally {
      setPolishing(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    const entry: ActivityLogEntry = {
      id: `note_${Date.now()}`,
      type: 'note',
      text: newNote.trim(),
      author: userName,
      created_at: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        activity_log: arrayUnion(entry),
      });
      setNewNote('');
      showToast('success', 'Note added.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to add note.');
    } finally {
      setAddingNote(false);
    }
  };

  const handleScheduleVisit = async () => {
    if (!visitDate) { showToast('error', 'Select a date and time.'); return; }
    setSchedulingVisit(true);
    const visit: SiteVisit = {
      id: `visit_${Date.now()}`,
      scheduled_at: new Date(visitDate).toISOString(),
      location: visitLocation || raw.location || 'TBD',
      notes: visitNotes,
      created_at: new Date().toISOString(),
      reminder_on_agreement: false,
      reminder_day_before: false,
      reminder_morning_of: false,
      status: 'scheduled',
    };
    const logEntry: ActivityLogEntry = {
      id: `sv_${Date.now()}`,
      type: 'site_visit_scheduled',
      text: `Site visit scheduled for ${new Date(visitDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} at ${visit.location}`,
      author: userName,
      created_at: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        site_visits: arrayUnion(visit),
        activity_log: arrayUnion(logEntry),
      });
      // Send WhatsApp confirmation
      sendWhatsAppConfirmation(lead, visit);
      setShowVisitForm(false);
      setVisitDate('');
      setVisitLocation('');
      setVisitNotes('');
      showToast('success', 'Site visit scheduled! WhatsApp confirmation will be sent.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to schedule visit.');
    } finally {
      setSchedulingVisit(false);
    }
  };

  const handleDeleteVisit = async (visitId: string) => {
    if (!deleteVisitNotes.trim()) {
      showToast('error', 'Please add notes explaining why this visit is being cancelled.');
      return;
    }
    setDeletingVisit(true);
    try {
      const updatedVisits = (lead.site_visits || []).filter(v => v.id !== visitId);
      const deletedVisit = (lead.site_visits || []).find(v => v.id === visitId);
      const logEntry: ActivityLogEntry = {
        id: `sv_del_${Date.now()}`,
        type: 'site_visit_cancelled',
        text: `Site visit cancelled${deletedVisit ? ` (was scheduled for ${new Date(deletedVisit.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} at ${deletedVisit.location})` : ''}. Reason: ${deleteVisitNotes.trim()}`,
        author: userName,
        created_at: new Date().toISOString(),
      };
      await updateDoc(doc(db, 'leads', lead.id), {
        site_visits: updatedVisits,
        activity_log: arrayUnion(logEntry),
      });
      setDeletingVisitId(null);
      setDeleteVisitNotes('');
      showToast('success', 'Site visit cancelled and removed.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to delete site visit.');
    } finally {
      setDeletingVisit(false);
    }
  };

  // Merge old note (from raw_data.note) with activity_log
  const allActivity = useMemo(() => {
    const entries: ActivityLogEntry[] = [...(lead.activity_log || [])];
    // If there's an old-style note and no activity log entries, show it as the first entry
    if (raw.note && raw.note !== 'Walk-in customer' && raw.note !== 'No note provided' && entries.length === 0) {
      entries.push({
        id: 'legacy_note',
        type: 'note',
        text: raw.note,
        author: lead.source || 'System',
        created_at: lead.created_at?.toDate().toISOString() || new Date().toISOString(),
      });
    }
    return entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [lead.activity_log, raw.note, lead.source, lead.created_at]);

  const siteVisits = useMemo(
    () => (lead.site_visits || []).sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
    [lead.site_visits],
  );

  const TABS = [
    { id: 'details' as DetailTab, label: 'Details' },
    { id: 'activity' as DetailTab, label: `Activity (${allActivity.length})` },
    { id: 'visits' as DetailTab, label: `Site Visits (${siteVisits.length})` },
  ];

  return (
    <Modal open onClose={onClose} title={`Lead: ${raw.lead_name}`} maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Top bar: Status + AI + Actions */}
        <div className="flex items-center gap-3 pb-4 border-b border-mn-border/30 flex-wrap">
          <div className="w-40">
            <Select
              label="Status"
              value={status}
              onChange={e => setStatus(e.target.value)}
              options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))}
            />
          </div>
          {lead.ai_audit && (
            <div className="flex items-center gap-2 pt-5">
              <Badge variant={lead.ai_audit.urgency === 'High' ? 'danger' : lead.ai_audit.urgency === 'Medium' ? 'warning' : 'info'}>
                {lead.ai_audit.urgency}
              </Badge>
              <Badge variant="default">{lead.ai_audit.intent}</Badge>
            </div>
          )}
          {lead.suggested_plot && (
            <div className="flex items-center gap-1.5 pt-5 text-sm text-mn-success font-bold">
              <Target className="w-4 h-4" />
              Matched
            </div>
          )}
          <div className="flex-1" />
          {/* Quick actions */}
          <div className="flex items-center gap-2 pt-5">
            <Button
              variant="secondary"
              icon={<AlarmClock className="w-4 h-4" />}
              onClick={() => setShowCallbackForm(true)}
            >
              Callback
            </Button>
            <Button
              variant="secondary"
              icon={<CalendarPlus className="w-4 h-4" />}
              onClick={() => { setActiveTab('visits'); setShowVisitForm(true); }}
            >
              Schedule Visit
            </Button>
            {isAdmin && (
              <Button
                variant="danger"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-mn-border/30">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-bold transition-all border-b-2 -mb-[1px] ${
                activeTab === tab.id
                  ? 'border-mn-h2 text-mn-h2'
                  : 'border-transparent text-mn-text-muted hover:text-mn-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="min-h-[350px] max-h-[500px] overflow-y-auto">
          {activeTab === 'details' && (
            <div className="space-y-4 pr-2">
              {/* Booked Property — required when status === 'Booked' to prevent double-booking.
                  Picker only shows Available units (Firestore query filter); a unit already held
                  by another lead is not selectable here. */}
              {(status === 'Booked' || bookedUnit) && (
                <div className="p-4 bg-mn-warning/5 border border-mn-warning/30 rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <Home className="w-4 h-4 text-mn-warning" />
                    <h3 className="text-sm font-black text-mn-warning uppercase tracking-wider">Booked Property</h3>
                    <span className="text-[10px] text-mn-text-muted">Required — locks the unit for this lead</span>
                  </div>

                  {bookedUnit ? (
                    <div className="flex items-center gap-3 p-3 bg-mn-surface border border-mn-border/30 rounded-xl">
                      <Building2 className="w-6 h-6 text-mn-h2 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-mn-text truncate">{bookedUnit.projectName}</p>
                        <p className="text-xs text-mn-text-muted">Unit <span className="font-bold text-mn-text">{bookedUnit.unitLabel}</span> &middot; Booked by {bookedUnit.booked_by} on {new Date(bookedUnit.booked_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      </div>
                      <Button
                        variant="secondary"
                        icon={<X className="w-3.5 h-3.5" />}
                        disabled={savingBooking}
                        onClick={handleUnbookUnit}
                      >
                        {savingBooking ? 'Releasing...' : 'Release Unit'}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {interestedProperties.length === 0 ? (
                        <p className="text-xs text-mn-danger">
                          No properties tagged on this lead yet. Tag at least one project under &quot;Property Interested In&quot; below before booking.
                        </p>
                      ) : (
                        <>
                          <Select
                            label="Project"
                            value={pickerProjectId}
                            onChange={e => setPickerProjectId(e.target.value)}
                            options={[
                              { value: '', label: '— Select project —' },
                              ...interestedProperties.map(p => ({ value: p.projectId, label: p.projectName })),
                            ]}
                          />
                          {pickerProjectId && (
                            <div className="space-y-1.5">
                              <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider">Available Units</label>
                              {loadingUnits ? (
                                <p className="text-xs text-mn-text-muted">Loading units...</p>
                              ) : availableUnits.length === 0 ? (
                                <p className="text-xs text-mn-danger">No available units in this project. All units are booked or sold.</p>
                              ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                  {availableUnits.map(u => {
                                    const label = u.fields?.unit_number || u.fields?.plot_number || u.id.slice(-6).toUpperCase();
                                    return (
                                      <button
                                        key={u.id}
                                        type="button"
                                        disabled={savingBooking}
                                        onClick={() => handleBookUnit(u)}
                                        className="px-3 py-2 bg-mn-input-bg border border-mn-input-border hover:border-mn-h2 hover:bg-mn-h2/10 rounded-lg text-xs font-bold text-mn-text transition-colors disabled:opacity-50"
                                      >
                                        <div className="truncate">{label}</div>
                                        {u.price > 0 && <div className="text-[10px] text-mn-text-muted font-normal mt-0.5">{formatPrice(u.price)}</div>}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Input label="Name" value={name} onChange={e => setName(e.target.value)} />
                <Input label="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                <Input label="Budget" type="number" value={budget} onChange={e => setBudget(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <LocationAutocomplete label="Location" value={location} onChange={setLocation} />
                <Select
                  label="Timeline"
                  value={planToBuy}
                  onChange={e => setPlanToBuy(e.target.value)}
                  options={[
                    { value: 'Not Specified', label: 'Not Specified' },
                    { value: 'Immediately', label: 'Immediately' },
                    { value: '1-3 months', label: '1-3 months' },
                    { value: '3-6 months', label: '3-6 months' },
                    { value: '6-12 months', label: '6-12 months' },
                    { value: 'Just exploring', label: 'Just exploring' },
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Profession" value={profession} onChange={e => setProfession(e.target.value)} />
                <div>
                  <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Interest</label>
                  <div className="flex flex-wrap gap-1.5">
                    {INTEREST_OPTIONS.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleInterest(opt)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                          interests.includes(opt)
                            ? 'bg-mn-h2/15 border-mn-h2/40 text-mn-h2'
                            : 'bg-mn-input-bg border-mn-input-border text-mn-text-muted hover:border-mn-input-focus'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* BHK + Variant + Match Threshold — shown conditionally */}
              {(showBhkField || showVariantField) && (
                <div className="grid grid-cols-3 gap-4">
                  {showBhkField && (
                    <Select
                      label="BHK"
                      value={String(bhk)}
                      onChange={e => setBhk(Number(e.target.value))}
                      options={[
                        { value: '0', label: 'Any BHK' },
                        ...BHK_OPTIONS.map(b => ({ value: String(b), label: `${b} BHK` })),
                      ]}
                    />
                  )}
                  {showVariantField && (
                    <Select
                      label="House Variant"
                      value={houseVariant}
                      onChange={e => setHouseVariant(e.target.value)}
                      options={[
                        { value: '', label: 'Any Variant' },
                        ...HOUSE_VARIANTS.map(v => ({ value: v, label: v })),
                      ]}
                    />
                  )}
                  <Select
                    label="Match %"
                    value={String(matchThreshold)}
                    onChange={e => setMatchThreshold(Number(e.target.value))}
                    options={[
                      { value: '0', label: 'Use Global' },
                      ...THRESHOLD_OPTIONS.map(t => ({ value: String(t), label: `+${t}%` })),
                    ]}
                  />
                </div>
              )}
              {/* Match threshold shown even when no BHK fields needed */}
              {!showBhkField && !showVariantField && (
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Match %"
                    value={String(matchThreshold)}
                    onChange={e => setMatchThreshold(Number(e.target.value))}
                    options={[
                      { value: '0', label: 'Use Global' },
                      ...THRESHOLD_OPTIONS.map(t => ({ value: String(t), label: `+${t}%` })),
                    ]}
                  />
                </div>
              )}

              {/* Match diagnosis — why isn't this lead auto-matching? */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowMatchDiagnosis(v => !v)}
                  className="text-[11px] font-bold text-mn-h2 hover:text-mn-h2/80 underline underline-offset-2"
                >
                  {showMatchDiagnosis ? 'Hide match diagnosis' : 'Why no auto-match?'}
                </button>
                {showMatchDiagnosis && (() => {
                  const effective = matchThreshold > 0 ? matchThreshold : globalThresholdPercent;
                  const diag = diagnoseMatches(lead, inventory, allProjectsList, effective);
                  const kept = diag.units.filter(u => u.matched);
                  const rejected = diag.units.filter(u => !u.matched);
                  // Group rejection reasons
                  const reasonCounts = new Map<string, number>();
                  rejected.forEach(u => {
                    const key = u.reason.split(' (')[0].split('.')[0]; // coarse bucket
                    reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
                  });
                  return (
                    <div className="mt-2 p-3 bg-mn-surface border border-mn-border/50 rounded-lg space-y-2 text-[11px]">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div><span className="text-mn-text-muted">Lead eligible:</span> <strong className={diag.leadOk ? 'text-mn-success' : 'text-mn-danger'}>{diag.leadOk ? 'Yes' : 'No'}</strong></div>
                        <div><span className="text-mn-text-muted">Threshold:</span> <strong className="text-mn-text">+{effective}%</strong></div>
                        <div><span className="text-mn-text-muted">Budget ceiling:</span> <strong className="text-mn-text">₹{diag.maxPrice.toLocaleString('en-IN')}</strong></div>
                        <div><span className="text-mn-text-muted">BHK floor:</span> <strong className="text-mn-text">{diag.leadBHK || 'n/a'}</strong></div>
                        <div><span className="text-mn-text-muted">Interests:</span> <strong className="text-mn-text">{diag.interests.join(', ') || 'none'}</strong></div>
                        <div><span className="text-mn-text-muted">Dismissed:</span> <strong className="text-mn-text">{diag.dismissedProjectIds.length}</strong></div>
                        <div><span className="text-mn-text-muted">Inventory scanned:</span> <strong className="text-mn-text">{diag.inventoryCount}</strong></div>
                        <div><span className="text-mn-text-muted">Matches:</span> <strong className={diag.matchCount > 0 ? 'text-mn-success' : 'text-mn-danger'}>{diag.matchCount}</strong></div>
                      </div>
                      {!diag.leadOk && (
                        <div className="pt-2 border-t border-mn-border/30 text-mn-danger">{diag.leadReason}</div>
                      )}
                      {diag.dismissedProjectIds.length > 0 && (
                        <div className="pt-2 border-t border-mn-border/30 space-y-1">
                          <p className="font-bold text-mn-text">Dismissed projects <span className="text-mn-text-muted font-normal">(blocked from auto-match)</span>:</p>
                          <ul className="space-y-1">
                            {diag.dismissedProjectIds.map(pid => {
                              const p = allProjectsList.find(pr => pr.id === pid);
                              return (
                                <li key={pid} className="flex items-center justify-between gap-2">
                                  <span className="text-mn-text-muted">
                                    <strong className="text-mn-text">{p?.name || pid}</strong>
                                    {p?.location && <span className="text-mn-text-muted/60"> — {p.location}</span>}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUndismissProject(pid)}
                                    className="text-[10px] font-bold text-mn-h2 hover:text-mn-h2/80 px-2 py-0.5 rounded border border-mn-h2/30 hover:bg-mn-h2/10 transition-colors"
                                  >
                                    Restore
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                      {diag.leadOk && diag.matchCount === 0 && (
                        <div className="pt-2 border-t border-mn-border/30 space-y-1">
                          <p className="font-bold text-mn-text">Why each inventory unit was rejected:</p>
                          {diag.inventoryCount === 0 ? (
                            <p className="text-mn-text-muted italic">There is no inventory loaded at all. (The Kanban query loads only units with status = Available.)</p>
                          ) : (
                            <ul className="space-y-0.5 max-h-40 overflow-y-auto pr-2">
                              {rejected.slice(0, 20).map(u => (
                                <li key={u.unitId} className="text-mn-text-muted">
                                  <strong className="text-mn-text">{u.projectName}</strong> <span className="text-mn-text-muted/60">({u.propertyType}, ₹{u.price.toLocaleString('en-IN')}, {u.status}{u.unitBHK ? `, ${u.unitBHK} BHK` : ''})</span> — {u.reason}
                                </li>
                              ))}
                              {rejected.length > 20 && <li className="text-mn-text-muted/60 italic">…and {rejected.length - 20} more</li>}
                            </ul>
                          )}
                        </div>
                      )}
                      {diag.leadOk && diag.matchCount > 0 && (
                        <div className="pt-2 border-t border-mn-border/30 text-mn-success">
                          {diag.matchCount} unit{diag.matchCount > 1 ? 's' : ''} match. If the card isn&apos;t in the Property Matched lane yet, give the matcher ~2 seconds (debounced) or save any edit to trigger a re-run.
                          <ul className="mt-1 space-y-0.5">
                            {kept.slice(0, 10).map(u => (
                              <li key={u.unitId} className="text-mn-text-muted">✓ <strong className="text-mn-text">{u.projectName}</strong> — ₹{u.price.toLocaleString('en-IN')}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              {/* Property Interested In */}
              <div className="pt-3 border-t border-mn-border/30 space-y-3">
                <PropertySearch
                  taggedProjectIds={interestedProperties.map(p => p.projectId)}
                  onTagProperty={handleTagProperty}
                />

                {/* Tagged properties */}
                {interestedProperties.length > 0 && (
                  <div className="space-y-2">
                    {interestedProperties.map(prop => (
                      <div
                        key={prop.projectId}
                        onMouseEnter={e => {
                          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                          if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
                          hoverTimer.current = window.setTimeout(() => {
                            setHoveredProp({ projectId: prop.projectId, rect });
                          }, 200);
                        }}
                        onMouseLeave={() => {
                          if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
                          hoverTimer.current = window.setTimeout(() => setHoveredProp(null), 150);
                        }}
                        className="group/prop relative flex items-center gap-3 p-2.5 bg-mn-surface border border-mn-border/30 rounded-xl hover:border-mn-h2/30 transition-colors"
                      >
                        {/* Clickable area — opens project page */}
                        <a
                          href={`/projects?id=${prop.projectId}`}
                          className="absolute inset-0 z-0"
                          title={`View ${prop.projectName} in Projects`}
                        />
                        <div className="w-10 h-10 rounded-lg bg-mn-card overflow-hidden flex-shrink-0 relative z-[1] pointer-events-none">
                          {prop.heroImage ? (
                            <img src={prop.heroImage} alt="" className="w-10 h-10 object-cover" />
                          ) : (
                            <div className="w-10 h-10 flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-mn-text-muted" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 relative z-[1] pointer-events-none">
                          <p className="text-sm font-bold text-mn-text truncate group-hover/prop:text-mn-h2 transition-colors">{prop.projectName}</p>
                          <p className="text-[10px] text-mn-text-muted">{prop.location} &middot; {prop.propertyType}</p>
                          {prop.bestPrice && prop.bestPrice > 0 && (
                            <p className="text-[10px] font-bold text-mn-h2 mt-0.5">From {formatPrice(prop.bestPrice)}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0 relative z-[1] pointer-events-none">
                          {prop.tagged_by === 'system' && (
                            <span className="text-[9px] font-black text-mn-h2 bg-mn-h2/10 px-1.5 py-0.5 rounded">FROM AD</span>
                          )}
                          {prop.tagged_by === 'system-match' && (
                            <span className="text-[9px] font-black text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">AUTO</span>
                          )}
                          {prop.matchedUnitCount && prop.matchedUnitCount > 0 && (
                            <span className="text-[9px] text-mn-text-muted">{prop.matchedUnitCount} unit{prop.matchedUnitCount > 1 ? 's' : ''}</span>
                          )}
                          {prop.distanceKm != null && (
                            <span className="text-[9px] text-mn-text-muted">{prop.distanceKm} km away</span>
                          )}
                          <span className="text-[10px] text-mn-text-muted/60">
                            {new Date(prop.tagged_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveProperty(prop.projectId)}
                          className="p-1 rounded-lg text-mn-text-muted hover:text-mn-danger hover:bg-mn-danger/10 transition-all relative z-[2]"
                          title="Remove property"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {/* Send Property Details button */}
                    <Button
                      variant="secondary"
                      icon={<SendHorizontal className="w-4 h-4" />}
                      disabled={sendingPropertyDetails}
                      onClick={handleSendPropertyDetails}
                      className="w-full"
                    >
                      {sendingPropertyDetails ? 'Sending...' : `Send Property Details (${interestedProperties.length})`}
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 pt-3 border-t border-mn-border/30 text-xs text-mn-text-muted">
                <div className="flex items-center gap-4">
                  <span>Source: <strong className="text-mn-text">{lead.source}</strong></span>
                </div>
                {/* UTM / Ad Campaign Attribution */}
                {lead.utm && (lead.utm.source || lead.utm.campaign) && (
                  <div className="p-2.5 bg-mn-h2/5 border border-mn-h2/15 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-mn-h2 font-bold">
                      <Megaphone className="w-3.5 h-3.5" />
                      <span>Ad Campaign Attribution</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      {lead.utm.source && (
                        <div>
                          <span className="text-mn-text-muted">Platform: </span>
                          <strong className="text-mn-text">{lead.utm.source}</strong>
                        </div>
                      )}
                      {lead.utm.medium && (
                        <div>
                          <span className="text-mn-text-muted">Medium: </span>
                          <strong className="text-mn-text">{lead.utm.medium}</strong>
                        </div>
                      )}
                      {lead.utm.campaign && (
                        <div>
                          <span className="text-mn-text-muted">Campaign: </span>
                          <strong className="text-mn-text">{lead.utm.campaign}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {lead.created_at && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span>Created: <strong className="text-mn-text">{lead.created_at.toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong></span>
                  </div>
                )}
                {firstContactDate && (
                  <div className="flex items-center gap-1.5">
                    <PhoneCall className="w-3 h-3" />
                    <span>First contacted: <strong className="text-mn-text">{new Date(firstContactDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-4 pr-2">
              {/* Add new note */}
              <div className="p-4 bg-mn-surface border border-mn-border/30 rounded-xl">
                <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Add Note</label>
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  rows={3}
                  placeholder="Update from call, meeting, or follow-up..."
                  spellCheck
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  lang="en-IN"
                  className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus resize-none"
                />
                <div className="flex justify-end items-center gap-2 mt-2">
                  <Button
                    variant="secondary"
                    icon={<Sparkles className="w-4 h-4" />}
                    disabled={polishing || addingNote || !newNote.trim()}
                    onClick={handlePolishNote}
                    title="Fix spelling and grammar — preserves your meaning"
                  >
                    {polishing ? 'Polishing...' : 'Polish'}
                  </Button>
                  <Button
                    icon={<Plus className="w-4 h-4" />}
                    disabled={addingNote || polishing || !newNote.trim()}
                    onClick={handleAddNote}
                  >
                    {addingNote ? 'Adding...' : 'Add Note'}
                  </Button>
                </div>
              </div>

              {/* Activity timeline */}
              {allActivity.length === 0 ? (
                <div className="text-center py-12 text-mn-text-muted text-sm">No activity yet.</div>
              ) : (
                <div className="space-y-1">
                  {allActivity.map(entry => (
                    <div key={entry.id} className="flex gap-3 p-3 rounded-lg hover:bg-mn-card/50">
                      <div className="flex-shrink-0 mt-0.5">
                        {entry.type === 'note' && <MessageSquare className="w-4 h-4 text-mn-info" />}
                        {entry.type === 'call' && <PhoneCall className="w-4 h-4 text-mn-success" />}
                        {entry.type === 'site_visit_scheduled' && <Calendar className="w-4 h-4 text-mn-warning" />}
                        {entry.type === 'whatsapp_sent' && <Send className="w-4 h-4 text-mn-success" />}
                        {entry.type === 'status_change' && <CheckCircle className="w-4 h-4 text-mn-accent" />}
                        {entry.type === 'callback_scheduled' && <PhoneForwarded className="w-4 h-4 text-mn-warning" />}
                        {entry.type === 'property_details_sent' && <Building2 className="w-4 h-4 text-mn-h2" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-mn-text whitespace-pre-wrap">{entry.text}</p>
                        {entry.call_recording_url && (
                          <a href={entry.call_recording_url} target="_blank" rel="noopener noreferrer" className="text-xs text-mn-info hover:underline mt-1 inline-block">
                            Play Recording
                          </a>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-mn-text-muted">
                          <span>{entry.author}</span>
                          <span>&middot;</span>
                          <span>{new Date(entry.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'visits' && (
            <div className="space-y-4 pr-2">
              {/* Schedule new visit form */}
              {showVisitForm ? (
                <div className="p-4 bg-mn-surface border border-mn-border/30 rounded-xl space-y-3">
                  <h4 className="text-sm font-black text-mn-h1">Schedule Site Visit</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <DateTimePicker
                      label="Date & Time"
                      value={visitDate}
                      onChange={setVisitDate}
                      min={new Date().toISOString().slice(0, 16)}
                      required
                    />
                    <ProjectLocationSearch
                      label="Visit Location"
                      value={visitLocation}
                      onChange={setVisitLocation}
                      placeholder="Search project by name or location..."
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Notes</label>
                    <input
                      type="text"
                      value={visitNotes}
                      onChange={e => setVisitNotes(e.target.value)}
                      placeholder="e.g. Interested in corner plots, bring brochure"
                      className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
                    />
                  </div>
                  <p className="text-[10px] text-mn-text-muted">
                    WhatsApp reminders will be sent: on confirmation, 1 day before, and morning of the visit.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setShowVisitForm(false)}>Cancel</Button>
                    <Button
                      icon={<CalendarPlus className="w-4 h-4" />}
                      disabled={schedulingVisit || !visitDate}
                      onClick={handleScheduleVisit}
                    >
                      {schedulingVisit ? 'Scheduling...' : 'Schedule & Notify'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  icon={<CalendarPlus className="w-4 h-4" />}
                  onClick={() => setShowVisitForm(true)}
                >
                  Schedule New Visit
                </Button>
              )}

              {/* Visit list */}
              {siteVisits.length === 0 && !showVisitForm ? (
                <div className="text-center py-12 text-mn-text-muted text-sm">No site visits scheduled.</div>
              ) : (
                <div className="space-y-3">
                  {siteVisits.map(visit => {
                    const visitDt = new Date(visit.scheduled_at);
                    const isPast = visitDt < new Date();
                    return (
                      <div key={visit.id} className="p-4 bg-mn-card border border-mn-border/30 rounded-xl">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-mn-h2" />
                              <span className="font-bold text-sm text-mn-text">
                                {visitDt.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-mn-text-muted">
                              <MapPin className="w-3 h-3" />
                              {visit.location}
                            </div>
                            {visit.notes && <p className="text-xs text-mn-text-muted mt-1">{visit.notes}</p>}
                          </div>
                          <Badge variant={
                            visit.status === 'completed' ? 'success' :
                            visit.status === 'cancelled' ? 'danger' :
                            visit.status === 'no_show' ? 'warning' :
                            isPast ? 'warning' : 'info'
                          }>
                            {visit.status === 'scheduled' && isPast ? 'Pending Update' : visit.status}
                          </Badge>
                        </div>
                        {/* Reminder status */}
                        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-mn-border/20 text-[10px] text-mn-text-muted">
                          <span className={visit.reminder_on_agreement ? 'text-mn-success' : ''}>
                            {visit.reminder_on_agreement ? '✓' : '○'} Confirmation sent
                          </span>
                          <span className={visit.reminder_day_before ? 'text-mn-success' : ''}>
                            {visit.reminder_day_before ? '✓' : '○'} Day before
                          </span>
                          <span className={visit.reminder_morning_of ? 'text-mn-success' : ''}>
                            {visit.reminder_morning_of ? '✓' : '○'} Morning of
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => setDeletingVisitId(deletingVisitId === visit.id ? null : visit.id)}
                              className="ml-auto text-mn-danger hover:text-mn-danger/80 font-bold flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              Cancel Visit
                            </button>
                          )}
                        </div>
                        {/* Delete confirmation with notes */}
                        {isAdmin && deletingVisitId === visit.id && (
                          <div className="mt-3 p-3 bg-mn-danger/5 border border-mn-danger/20 rounded-lg space-y-2">
                            <p className="text-xs font-bold text-mn-danger">Cancel this site visit? Please provide a reason:</p>
                            <input
                              type="text"
                              value={deleteVisitNotes}
                              onChange={e => setDeleteVisitNotes(e.target.value)}
                              placeholder="Reason for cancellation (required)..."
                              className="w-full px-3 py-2 bg-mn-input-bg border border-mn-input-border rounded-lg text-xs text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setDeletingVisitId(null); setDeleteVisitNotes(''); }}
                                className="px-3 py-1.5 text-xs font-bold text-mn-text-muted bg-mn-card border border-mn-border rounded-lg hover:bg-mn-card-hover"
                              >
                                Keep Visit
                              </button>
                              <button
                                onClick={() => handleDeleteVisit(visit.id)}
                                disabled={deletingVisit || !deleteVisitNotes.trim()}
                                className="px-3 py-1.5 text-xs font-bold text-white bg-mn-danger rounded-lg hover:bg-mn-danger/80 disabled:opacity-50"
                              >
                                {deletingVisit ? 'Cancelling...' : 'Confirm Cancellation'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Callback Request Form */}
        {showCallbackForm && (
          <div className="p-4 bg-mn-surface border border-mn-border/30 rounded-xl space-y-3">
            <h4 className="text-sm font-black text-mn-h1 flex items-center gap-2">
              <AlarmClock className="w-4 h-4 text-mn-warning" />
              Schedule Callback
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <DateTimePicker
                label="Call Back Date & Time"
                value={callbackDate}
                onChange={setCallbackDate}
                min={new Date().toISOString().slice(0, 16)}
                required
              />
              <div>
                <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Notes</label>
                <input
                  type="text"
                  value={callbackNotes}
                  onChange={e => setCallbackNotes(e.target.value)}
                  placeholder="e.g. Lead asked to call after 5 PM"
                  className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
                />
              </div>
            </div>
            <p className="text-[10px] text-mn-text-muted">
              An alarm with lead details will pop up when the callback time arrives.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowCallbackForm(false)}>Cancel</Button>
              <Button
                icon={<AlarmClock className="w-4 h-4" />}
                disabled={schedulingCallback || !callbackDate}
                onClick={handleScheduleCallback}
              >
                {schedulingCallback ? 'Scheduling...' : 'Schedule Callback'}
              </Button>
            </div>
          </div>
        )}

        {/* Delete confirmation (admin only) */}
        {confirmDelete && (
          <div className="p-4 bg-red-950/30 border border-mn-danger/30 rounded-xl space-y-3">
            <p className="text-sm text-mn-text font-bold">
              Are you sure you want to permanently delete lead &quot;{raw.lead_name}&quot;?
            </p>
            <p className="text-xs text-mn-text-muted">This action cannot be undone. All activity logs, site visits, and callback requests for this lead will be lost.</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button
                variant="danger"
                icon={<Trash2 className="w-4 h-4" />}
                disabled={deleting}
                onClick={handleDeleteLead}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Lead'}
              </Button>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex gap-3 pt-3 border-t border-mn-border/30">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            className="flex-1"
            icon={<Save className="w-4 h-4" />}
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
      {hoveredProp && (
        <PropertyTooltip
          projectId={hoveredProp.projectId}
          anchorRect={hoveredProp.rect}
          onClose={() => setHoveredProp(null)}
        />
      )}
    </Modal>
  );
}

/* ==================== WhatsApp Helper ==================== */
async function sendWhatsAppConfirmation(lead: Lead, visit: SiteVisit) {
  try {
    const configSnap = await getDoc(doc(db, 'crm_config', 'whatsapp'));
    if (!configSnap.exists() || !configSnap.data().enabled) {
      console.warn('WhatsApp not configured. Skipping notification.');
      return;
    }
    const config = configSnap.data() as WhatsAppConfig;
    const visitDate = new Date(visit.scheduled_at);

    // Clean phone number: remove spaces, ensure country code
    let toPhone = lead.raw_data.phone.replace(/[\s\-()]/g, '');
    if (toPhone.startsWith('+')) toPhone = toPhone.slice(1);
    if (!toPhone.startsWith('91') && toPhone.length === 10) toPhone = '91' + toPhone;

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toPhone,
          type: 'template',
          template: {
            name: config.template_site_visit_confirmation,
            language: { code: 'en' },
            components: [{
              type: 'body',
              parameters: [
                { type: 'text', text: lead.raw_data.lead_name },
                { type: 'text', text: visitDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) },
                { type: 'text', text: visit.location },
              ],
            }],
          },
        }),
      }
    );

    if (response.ok) {
      // Log WhatsApp sent + update reminder flag
      const waEntry: ActivityLogEntry = {
        id: `wa_${Date.now()}`,
        type: 'whatsapp_sent',
        text: `WhatsApp confirmation sent for site visit on ${visitDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
        author: 'System',
        created_at: new Date().toISOString(),
      };
      await updateDoc(doc(db, 'leads', lead.id), {
        activity_log: arrayUnion(waEntry),
      });
      // Mark reminder_on_agreement for this visit
      const updatedVisits = (lead.site_visits || []).map(v =>
        v.id === visit.id ? { ...v, reminder_on_agreement: true } : v
      );
      // Since we just added the visit via arrayUnion, we need to include the new one too
      const allVisits = updatedVisits.length > 0 ? updatedVisits : [{ ...visit, reminder_on_agreement: true }];
      await updateDoc(doc(db, 'leads', lead.id), { site_visits: allVisits });
    } else {
      console.error('WhatsApp API error:', await response.text());
    }
  } catch (err) {
    console.error('WhatsApp send failed:', err);
  }
}
