"use client";
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import {
  Plus, Trash2, Save, GripVertical,
  Settings, Palette, Users, MessageCircle, PhoneCall, CheckCircle, Clock,
  Shield, ShieldCheck, Eye, UserPlus, Mail, ImageIcon, SwatchBook, Megaphone,
  Sparkles, ExternalLink, Briefcase, Calculator, Handshake, Crown, PhoneForwarded,
} from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/context/AuthContext';
import { notifyBrandingUpdated } from '@/lib/context/BrandingContext';
import { CRMUser, UserRole } from '@/lib/types/user';
import { can, ROLE_LABELS } from '@/lib/utils/permissions';
import {
  canChangeRole as guardCanChangeRole,
  canToggleActive as guardCanToggleActive,
  canRemoveMember as guardCanRemoveMember,
  canOnboardRole as guardCanOnboardRole,
  assignableRoles as guardAssignableRoles,
  compareTeamMembers,
} from '@/lib/auth/teamGuards';
import { DEFAULT_LEAD_CARD_COLORS } from '@/lib/types/config';
import { contrastingTextColor } from '@/lib/utils/colorUtils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ImageUpload } from '@/components/ui/ImageUpload';
import {
  LaneConfig, DEFAULT_KANBAN_CONFIG,
  WhatsAppConfig, DEFAULT_WHATSAPP_CONFIG,
  AIConfig, DEFAULT_AI_CONFIG,
  MarketingTeam,
  LeadAssignmentConfig, DEFAULT_LEAD_ASSIGNMENT_CONFIG, LeadAssignmentRule,
  SLAConfig, DEFAULT_SLA_CONFIG,
  NurtureConfig, DEFAULT_NURTURE_CONFIG,
} from '@/lib/types/config';

const TABS = [
  { id: 'lanes', label: 'Kanban Lanes', icon: Palette },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'ai', label: 'AI Settings', icon: Sparkles },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'assignment', label: 'Lead Assignment', icon: PhoneForwarded },
  { id: 'sla', label: 'Lead SLA', icon: Clock },
  { id: 'nurture', label: 'Nurture Sequences', icon: MessageCircle },
  { id: 'branding', label: 'Branding', icon: ImageIcon },
  { id: 'card_colors', label: 'Card Colors', icon: SwatchBook },
  { id: 'marketing_teams', label: 'Marketing Teams', icon: Megaphone },
] as const;

type TabId = typeof TABS[number]['id'];


export default function AdminConsolePage() {
  const { crmUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('lanes');

  if (!can(crmUser?.role, 'view_admin_console')) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <Shield className="w-16 h-16 text-mn-border mb-4" />
        <p className="font-bold text-lg text-mn-text-muted">Admin Console Restricted</p>
        <p className="text-sm text-mn-text-muted/70 mt-1">
          Your role does not have access to the Admin Console.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Admin Console" subtitle="System configuration" />

      <div className="px-4 py-4 md:px-8">
        <div className="mn-segmented flex items-center gap-1 overflow-x-auto whitespace-nowrap px-2 py-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all ${
                activeTab === tab.id
                  ? 'mn-segmented-active'
                  : 'mn-segmented-idle'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex flex-col">
        {activeTab === 'lanes' && <KanbanLanesTab />}
        {activeTab === 'whatsapp' && <WhatsAppSettingsTab />}
        {activeTab === 'ai' && <AISettingsTab />}
        {activeTab === 'team' && <TeamTab />}
        {activeTab === 'assignment' && <LeadAssignmentTab />}
        {activeTab === 'sla' && <LeadSLATab />}
        {activeTab === 'nurture' && <NurtureSequencesTab />}
        {activeTab === 'branding' && <BrandingTab />}
        {activeTab === 'card_colors' && <CardColorsTab />}
        {activeTab === 'marketing_teams' && <MarketingTeamsTab />}
      </div>
    </div>
  );
}

/* ==================== KANBAN LANES TAB ==================== */
function KanbanLanesTab() {
  const { showToast } = useToast();
  const [lanes, setLanes] = useState<LaneConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'crm_config', 'kanban'));
        if (snap.exists()) {
          const firestoreLanes: LaneConfig[] = snap.data().lanes || [];
          // Backfill emojis for lanes saved before the emoji field was added
          const lanesWithEmoji = firestoreLanes.map(lane => {
            if (!lane.emoji) {
              const defaultLane = DEFAULT_KANBAN_CONFIG.lanes.find(d => d.id === lane.id);
              return { ...lane, emoji: defaultLane?.emoji || '📌' };
            }
            return lane;
          });
          setLanes(lanesWithEmoji);
        } else {
          setLanes(DEFAULT_KANBAN_CONFIG.lanes);
        }
      } catch (err) {
        console.error(err);
        setLanes(DEFAULT_KANBAN_CONFIG.lanes);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const updateLane = (idx: number, updates: Partial<LaneConfig>) => {
    setLanes(prev => prev.map((l, i) => i === idx ? { ...l, ...updates } : l));
  };

  const addLane = () => {
    setLanes(prev => [...prev, {
      id: `lane_${Date.now()}`,
      label: '',
      color: '#9290C3',
      order: prev.length,
      emoji: '📌',
    }]);
  };

  const removeLane = (idx: number) => {
    setLanes(prev => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, order: i })));
  };

  const handleSave = async () => {
    const invalid = lanes.find(l => !l.label.trim());
    if (invalid) { showToast('error', 'All lanes must have a name.'); return; }
    setSaving(true);
    try {
      await setDoc(doc(db, 'crm_config', 'kanban'), {
        lanes: lanes.map((l, i) => ({ ...l, order: i })),
        updated_at: new Date().toISOString(),
      });
      showToast('success', 'Kanban lanes saved.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to save lanes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-mn-text-muted">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-8">
      <div className="app-shell-panel p-5 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="section-heading">Pipeline setup</p>
          <h2 className="mt-2 text-lg font-black text-mn-h1">Kanban Swim Lanes</h2>
          <p className="mt-0.5 text-xs text-mn-text-muted">Configure the stages of your lead pipeline</p>
        </div>
        <Button onClick={handleSave} disabled={saving} icon={<Save className="w-4 h-4" />}>
          {saving ? 'Saving...' : 'Save Lanes'}
        </Button>
      </div>

      <div className="space-y-3">
        {lanes.map((lane, idx) => (
          <div key={lane.id} className="group flex items-center gap-3 rounded-[1.35rem] border border-mn-border/45 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--mn-card-hover)_84%,transparent),color-mix(in_srgb,var(--mn-card)_92%,transparent))] p-4 transition-all hover:border-mn-border/70">
            <GripVertical className="w-4 h-4 text-mn-text-muted/30 group-hover:text-mn-text-muted cursor-grab flex-shrink-0" />
            <input
              value={lane.emoji || ''}
              onChange={e => updateLane(idx, { emoji: e.target.value })}
              placeholder="😀"
              className="w-10 h-10 text-center text-lg bg-mn-input-bg border border-mn-input-border rounded-lg focus:outline-none focus:border-mn-input-focus flex-shrink-0"
              title="Lane emoji"
            />
            <input
              type="color"
              value={lane.color}
              onChange={e => updateLane(idx, { color: e.target.value })}
              className="h-8 w-8 flex-shrink-0 cursor-pointer rounded-lg border border-mn-border bg-transparent"
            />
            <input
              value={lane.label}
              onChange={e => updateLane(idx, { label: e.target.value })}
              placeholder="Lane name..."
              className="flex-1 px-3 py-2 bg-mn-input-bg border border-mn-input-border rounded-lg text-sm text-mn-text focus:outline-none focus:border-mn-input-focus"
            />
            <span className="text-xs text-mn-text-muted font-mono w-6 text-center">{idx + 1}</span>
            <button onClick={() => removeLane(idx)} className="text-mn-text-muted/30 hover:text-mn-danger transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addLane}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-[1.35rem] border-2 border-dashed border-mn-border p-4 text-sm font-bold text-mn-text-muted transition-all hover:border-mn-h2 hover:text-mn-h2"
      >
        <Plus className="w-4 h-4" /> Add Lane
      </button>
      </div>
    </div>
  );
}

/* ==================== WHATSAPP SETTINGS TAB ==================== */
function WhatsAppSettingsTab() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<WhatsAppConfig>(DEFAULT_WHATSAPP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'crm_config', 'whatsapp'));
        if (snap.exists()) setConfig(snap.data() as WhatsAppConfig);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'crm_config', 'whatsapp'), config);
      showToast('success', 'WhatsApp settings saved.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to save WhatsApp settings.');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-mn-text-muted">Loading...</div>;

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-mn-h1">WhatsApp Business API</h2>
          <p className="text-xs text-mn-text-muted mt-0.5">Configure Meta WhatsApp Business API for automated notifications</p>
        </div>
        <Button onClick={handleSave} disabled={saving} icon={<Save className="w-4 h-4" />}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <div className="space-y-5">
        {/* Enable toggle */}
        <div className="flex items-center gap-3 p-4 bg-mn-card border border-mn-border/30 rounded-xl">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={e => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
            className="w-5 h-5 accent-mn-h2"
          />
          <div>
            <p className="font-bold text-sm text-mn-text">Enable WhatsApp Notifications</p>
            <p className="text-xs text-mn-text-muted">Send automated site visit reminders via WhatsApp</p>
          </div>
        </div>

        <Card>
          <div className="p-5 space-y-4">
            <h3 className="text-sm font-black text-mn-h3 uppercase tracking-wider">API Credentials</h3>
            <Input
              label="Phone Number ID"
              value={config.phone_number_id}
              onChange={e => setConfig(prev => ({ ...prev, phone_number_id: e.target.value }))}
              placeholder="e.g. 123456789012345"
            />
            <Input
              label="Business Account ID"
              value={config.business_account_id}
              onChange={e => setConfig(prev => ({ ...prev, business_account_id: e.target.value }))}
              placeholder="e.g. 123456789012345"
            />
            <Input
              label="Permanent Access Token"
              value="Stored server-side"
              disabled
              placeholder="Stored server-side"
            />
            <p className="text-[10px] text-mn-text-muted">
              WhatsApp tokens are not stored in Firestore or shown in the browser. Set <code className="px-1 py-0.5 bg-mn-border/30 rounded">WHATSAPP_ACCESS_TOKEN</code> in the server environment.
            </p>
          </div>
        </Card>

        <Card>
          <div className="p-5 space-y-4">
            <h3 className="text-sm font-black text-mn-h3 uppercase tracking-wider">Message Templates</h3>
            <div className="p-3 bg-mn-info/5 border border-mn-info/30 rounded-lg text-xs text-mn-text-muted leading-relaxed">
              These fields hold the <strong className="text-mn-text">template name</strong> (identifier) that Meta uses to look up the pre-approved message — <strong>not</strong> the message body itself. The actual text lives in your Meta Business Suite; the CRM only sends the template name plus the variables (lead name, date, location, etc.).{' '}
              <a
                href="https://business.facebook.com/wa/manage/message-templates/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-mn-h2 underline hover:text-mn-h2/80"
              >
                Manage templates in Meta Business Suite →
              </a>
            </div>
            <Input
              label="Site Visit Confirmation — Template Name"
              value={config.template_site_visit_confirmation}
              onChange={e => setConfig(prev => ({ ...prev, template_site_visit_confirmation: e.target.value }))}
              placeholder="site_visit_confirmation"
            />
            <Input
              label="Site Visit Reminder — Template Name"
              value={config.template_site_visit_reminder}
              onChange={e => setConfig(prev => ({ ...prev, template_site_visit_reminder: e.target.value }))}
              placeholder="site_visit_reminder"
            />
            <Input
              label="Property Match (Auto-Send) — Template Name"
              value={config.template_property_match}
              onChange={e => setConfig(prev => ({ ...prev, template_property_match: e.target.value }))}
              placeholder="property_match"
            />
            <div className="text-xs text-mn-text-muted mt-1">
              Leave blank to disable auto-send on match. Template variables: {'{{1}}'} lead name, {'{{2}}'} match count, {'{{3}}'} top project name.
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-5">
            <h3 className="text-sm font-black text-mn-h3 uppercase tracking-wider mb-3">Reminder Schedule</h3>
            <div className="space-y-2 text-sm text-mn-text">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-mn-success flex-shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">Immediately on site visit confirmation</span>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-mn-warning flex-shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">1 day before the scheduled visit (6:00 PM)</span>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-mn-info flex-shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">Morning of the visit (8:00 AM)</span>
              </div>
            </div>
            <p className="text-[10px] text-mn-text-muted mt-3">
              Reminders are sent by the scheduled Cloud Function (check_site_visit_reminders).
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ==================== AI SETTINGS TAB ==================== */
const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (fast, low cost)' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (highest quality)' },
];

function AISettingsTab() {
  const { showToast } = useToast();
  const { firebaseUser } = useAuth();
  const [config, setConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'crm_config', 'ai'));
        if (snap.exists()) setConfig(snap.data() as AIConfig);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const handleSave = async () => {
    const normalizedConfig = {
      ...config,
      model: config.model.trim(),
    };
    setSaving(true);
    try {
      await setDoc(doc(db, 'crm_config', 'ai'), normalizedConfig);
      setConfig(normalizedConfig);
      showToast('success', 'AI settings saved.');
    } catch (err) {
      console.error('[AISettings] Save failed:', err);
      showToast('error', `Save failed: ${(err as Error)?.message || 'unknown'}`);
    } finally { setSaving(false); }
  };

  // Save the visible config first, then round-trip through /api/polish-note.
  const handleTest = async () => {
    const normalizedConfig = {
      ...config,
      model: config.model.trim(),
    };
    setTesting(true);
    try {
      await setDoc(doc(db, 'crm_config', 'ai'), normalizedConfig);
      setConfig(normalizedConfig);
      const token = await firebaseUser?.getIdToken();
      if (!token) {
        showToast('error', 'Sign in again before testing Gemini.');
        return;
      }
      const res = await fetch('/api/polish-note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: 'teh quik test.' }),
      });
      const data = await res.json();
      if (res.ok && data.polished) {
        showToast('success', `Gemini responded: "${data.polished}"`);
      } else {
        showToast('error', data.error || 'Test failed. Check the Gemini key, model, quota, and API access.');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Test request failed.');
    } finally { setTesting(false); }
  };

  if (loading) return <div className="p-8 text-mn-text-muted">Loading...</div>;

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-mn-h1">AI Settings (Gemini)</h2>
          <p className="text-xs text-mn-text-muted mt-0.5">Powers the Notes &quot;Polish&quot; button and future AI features in the CRM.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} icon={<Save className="w-4 h-4" />}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <div className="space-y-5">
        <div className="flex items-center gap-3 p-4 bg-mn-card border border-mn-border/30 rounded-xl">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={e => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
            className="w-5 h-5 accent-mn-h2"
          />
          <div>
            <p className="font-bold text-sm text-mn-text">Enable Gemini AI features</p>
            <p className="text-xs text-mn-text-muted">Turn off to disable Polish and any future AI calls from the dashboard.</p>
          </div>
        </div>

        <Card>
          <div className="p-5 space-y-4">
            <h3 className="text-sm font-black text-mn-h3 uppercase tracking-wider">Server Credential</h3>
            <div className="p-3 bg-mn-info/5 border border-mn-info/30 rounded-lg text-xs text-mn-text-muted leading-relaxed">
              Gemini keys are no longer stored in Firestore or shown in the browser. Create or rotate the key in{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-mn-h2 underline hover:text-mn-h2/80 inline-flex items-center gap-1"
              >
                Google AI Studio <ExternalLink className="w-3 h-3" />
              </a>
              {' '}and set it only as the server environment variable <code className="px-1 py-0.5 bg-mn-border/30 rounded">GEMINI_API_KEY</code>.
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider">Model</label>
              <select
                value={config.model}
                onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))}
                className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text focus:outline-none focus:border-mn-input-focus"
              >
                {GEMINI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-[10px] text-mn-text-muted">
                Firestore stores only enabled/model settings at <code className="px-1 py-0.5 bg-mn-border/30 rounded">crm_config/ai</code>.
              </p>
              <Button
                variant="secondary"
                disabled={testing}
                onClick={handleTest}
                icon={<Sparkles className="w-4 h-4" />}
              >
                {testing ? 'Testing...' : 'Test Key'}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-5">
            <h3 className="text-sm font-black text-mn-h3 uppercase tracking-wider mb-3">Where Gemini is used</h3>
            <div className="space-y-2 text-sm text-mn-text">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-mn-success flex-shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">Notes &quot;Polish&quot; button — fixes spelling/grammar while preserving meaning.</span>
              </div>
            </div>
            <p className="text-[10px] text-mn-text-muted mt-3">
              Other AI features (lead intent classification, property matching, call summarization) run in Cloud Functions using a separate Vertex AI service account — they are not controlled by this key.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ==================== TEAM TAB ==================== */
const ROLE_OPTIONS: { value: UserRole; label: string; icon: typeof Shield; superadminOnly?: boolean }[] = [
  { value: 'superadmin', label: ROLE_LABELS.superadmin, icon: Crown, superadminOnly: true },
  { value: 'admin', label: ROLE_LABELS.admin, icon: ShieldCheck },
  { value: 'sales_exec', label: ROLE_LABELS.sales_exec, icon: PhoneCall },
  { value: 'digital_marketing', label: ROLE_LABELS.digital_marketing, icon: Megaphone },
  { value: 'channel_partner', label: ROLE_LABELS.channel_partner, icon: Handshake },
  { value: 'hr', label: ROLE_LABELS.hr, icon: Briefcase },
  { value: 'payroll_finance', label: ROLE_LABELS.payroll_finance, icon: Calculator },
  { value: 'viewer', label: ROLE_LABELS.viewer, icon: Eye },
];

function TeamTab() {
  const { showToast } = useToast();
  const { crmUser } = useAuth();
  const [teamMembers, setTeamMembers] = useState<CRMUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('sales_exec');
  const [adding, setAdding] = useState(false);

  // Admins can onboard pending users. Super Admin keeps the stronger role/status controls.
  const canOnboard = can(crmUser?.role, 'onboard_users');
  const canManage = can(crmUser?.role, 'manage_users');
  // Only SuperAdmin can promote someone else to SuperAdmin. Used below to
  // disable the role dropdown when the current row is a superadmin.
  const canPromoteSuperAdmin = can(crmUser?.role, 'promote_to_superadmin');
  // Role options filtered by what the current user is allowed to assign.
  const assignableRoles = guardAssignableRoles(crmUser, ROLE_OPTIONS);

  // Load team members
  useEffect(() => {
    const loadTeam = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'users'));
        const members = snap.docs.map(d => ({ uid: d.id, ...d.data() } as CRMUser));
        members.sort(compareTeamMembers);
        setTeamMembers(members);
      } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load team members.');
      } finally {
        setLoading(false);
      }
    };
    loadTeam();
  }, [showToast]);

  // Pre-register a user by email (they sign in later with Google)
  const handleAddMember = async () => {
    if (!newEmail.trim()) { showToast('error', 'Email is required.'); return; }
    if (!newName.trim()) { showToast('error', 'Name is required.'); return; }
    const check = guardCanOnboardRole(crmUser, newRole);
    if (!check.allowed) {
      showToast('error', check.reason!);
      return;
    }
    if (!assignableRoles.some(role => role.value === newRole)) {
      showToast('error', 'You cannot onboard this role.');
      return;
    }
    setAdding(true);
    try {
      const normalizedEmail = newEmail.trim().toLowerCase();
      // Use email as a temporary document ID — will be migrated to UID on first sign-in
      const tempId = `pending_${normalizedEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
      await setDoc(doc(db, 'users', tempId), {
        email: normalizedEmail,
        name: newName.trim(),
        role: newRole,
        active: true,
        photo_url: '',
        created_at: serverTimestamp(),
        pending_registration: true, // Will be resolved on first Google sign-in
      });

      // Update local state
      setTeamMembers(prev => [...prev, {
        uid: tempId,
        email: normalizedEmail,
        name: newName.trim(),
        role: newRole,
        active: true,
        created_at: null,
      }]);

      setNewEmail('');
      setNewName('');
      setNewRole('sales_exec');
      setShowAddForm(false);
      showToast('success', `${newName.trim()} added. They can now sign in with ${normalizedEmail}.`);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to add team member.');
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (member: CRMUser, newRole: UserRole) => {
    const check = guardCanChangeRole(crmUser, member, newRole);
    if (!check.allowed) {
      showToast('error', check.reason!);
      return;
    }
    try {
      await updateDoc(doc(db, 'users', member.uid), { role: newRole });
      setTeamMembers(prev => prev.map(m => m.uid === member.uid ? { ...m, role: newRole } : m));
      showToast('success', `${member.name} is now ${ROLE_OPTIONS.find(r => r.value === newRole)?.label || newRole}.`);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to update role.');
    }
  };

  const handleToggleActive = async (member: CRMUser) => {
    const check = guardCanToggleActive(crmUser, member);
    if (!check.allowed) {
      showToast('error', check.reason!);
      return;
    }
    try {
      const newActive = !member.active;
      await updateDoc(doc(db, 'users', member.uid), { active: newActive });
      setTeamMembers(prev => prev.map(m => m.uid === member.uid ? { ...m, active: newActive } : m));
      showToast('success', `${member.name} ${newActive ? 'activated' : 'deactivated'}.`);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to update member status.');
    }
  };

  const handleRemoveMember = async (member: CRMUser) => {
    const check = guardCanRemoveMember(crmUser, member);
    if (!check.allowed) {
      showToast('error', check.reason!);
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', member.uid));
      setTeamMembers(prev => prev.filter(m => m.uid !== member.uid));
      showToast('success', `${member.name} removed from team.`);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to remove member.');
    }
  };

  if (!canOnboard && !canManage) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-center">
        <Shield className="w-16 h-16 text-mn-border mb-4" />
        <p className="font-bold text-lg text-mn-text-muted">Admin Access Required</p>
        <p className="text-sm text-mn-text-muted/70 mt-1">
          Only Admins and Super Admins can view or onboard team members.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 overflow-y-auto h-full">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-mn-h1">Team Members</h2>
            <p className="text-sm text-mn-text-muted">Manage who can access the CRM and what they can do.</p>
          </div>
          {canOnboard && (
            <Button
              icon={<UserPlus className="w-4 h-4" />}
              onClick={() => setShowAddForm(true)}
            >
              Add Member
            </Button>
          )}
        </div>

        {/* Add member form */}
        {showAddForm && (
          <div className="p-5 bg-mn-surface border border-mn-border/30 rounded-xl space-y-4">
            <h3 className="text-sm font-black text-mn-h1">Add New Team Member</h3>
            <p className="text-xs text-mn-text-muted">
              Enter their Google account email. They will be able to sign in after you add them.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">
                  Name <span className="text-mn-danger">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Ravi Kumar"
                  className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">
                  Google Email <span className="text-mn-danger">*</span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="e.g. ravi@elitebuild.com"
                  className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text placeholder:text-mn-text-muted/50 focus:outline-none focus:border-mn-input-focus"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Role</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as UserRole)}
                  className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text focus:outline-none focus:border-mn-input-focus"
                >
                  {assignableRoles.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setShowAddForm(false); setNewEmail(''); setNewName(''); }}>
                Cancel
              </Button>
              <Button
                icon={<UserPlus className="w-4 h-4" />}
                disabled={adding || !newEmail.trim() || !newName.trim()}
                onClick={handleAddMember}
              >
                {adding ? 'Adding...' : 'Add Member'}
              </Button>
            </div>
          </div>
        )}

        {/* Team list */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-mn-text-muted animate-pulse">Loading team...</p>
          </div>
        ) : (
          <div className="space-y-2">
            {teamMembers.map(member => {
              const roleInfo = ROLE_OPTIONS.find(r => r.value === member.role);
              const RoleIcon = roleInfo?.icon || Users;
              const isCurrentUser = member.uid === crmUser?.uid;
              const isPending = member.uid.startsWith('pending_');

              return (
                <div
                  key={member.uid}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    member.active
                      ? 'bg-mn-card border-mn-border/30'
                      : 'bg-mn-surface/50 border-mn-border/20 opacity-60'
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-mn-h2/15 flex items-center justify-center flex-shrink-0">
                    {member.photo_url ? (
                      <img src={member.photo_url} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <span className="text-mn-h2 font-black text-sm">
                        {(member.name || '?')[0].toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-mn-text truncate">{member.name}</span>
                      {isCurrentUser && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-mn-h2/15 text-mn-h2">You</span>
                      )}
                      {isPending && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-mn-warning/15 text-mn-warning">Pending Sign-in</span>
                      )}
                      {!member.active && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-mn-danger/15 text-mn-danger">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-mn-text-muted">
                      <Mail className="w-3 h-3" />
                      <span>{member.email}</span>
                    </div>
                  </div>

                  {/* Role selector */}
                  <div className="flex items-center gap-2">
                    <RoleIcon className="w-4 h-4 text-mn-h3" />
                      <select
                        value={member.role}
                        onChange={e => handleRoleChange(member, e.target.value as UserRole)}
                      disabled={!canManage || isCurrentUser || (member.role === 'superadmin' && !canPromoteSuperAdmin)}
                      className="px-3 py-1.5 bg-mn-input-bg border border-mn-input-border rounded-lg text-xs font-bold text-mn-text focus:outline-none focus:border-mn-input-focus disabled:opacity-50"
                    >
                      {/* Include the member's current role in the options (even superadmin, so the dropdown displays it) plus whatever this user can assign. */}
                      {[...new Set([member.role, ...assignableRoles.map(r => r.value)])].map(val => {
                        const info = ROLE_OPTIONS.find(r => r.value === val);
                        return <option key={val} value={val}>{info?.label || val}</option>;
                      })}
                    </select>
                  </div>

                  {/* Actions */}
                  {canManage && !isCurrentUser && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleActive(member)}
                        className={`p-2 rounded-lg text-xs font-bold transition-all ${
                          member.active
                            ? 'text-mn-warning hover:bg-mn-warning/10'
                            : 'text-mn-success hover:bg-mn-success/10'
                        }`}
                        title={member.active ? 'Deactivate' : 'Activate'}
                      >
                        {member.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleRemoveMember(member)}
                        className="p-2 rounded-lg text-mn-danger hover:bg-mn-danger/10 transition-all"
                        title="Remove from team"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Role legend */}
        <div className="p-4 bg-mn-surface border border-mn-border/20 rounded-xl">
          <h4 className="text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-3">Role Permissions</h4>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <div className="flex items-center gap-1.5 font-bold text-mn-text mb-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Admin
              </div>
              <ul className="text-mn-text-muted space-y-0.5 list-disc list-inside">
                <li>Full access to all features</li>
                <li>Delete leads</li>
                <li>Manage team & config</li>
                <li>View all leads</li>
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-mn-text mb-1">
                <PhoneCall className="w-3.5 h-3.5" /> Sales Executive
              </div>
              <ul className="text-mn-text-muted space-y-0.5 list-disc list-inside">
                <li>Create & edit leads</li>
                <li>Add notes & callbacks</li>
                <li>Schedule visits & calls</li>
                <li>Receive own alarms</li>
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-mn-text mb-1">
                <Eye className="w-3.5 h-3.5" /> Viewer
              </div>
              <ul className="text-mn-text-muted space-y-0.5 list-disc list-inside">
                <li>Read-only board access</li>
                <li>View lead details</li>
                <li>No edit permissions</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================== LEAD ASSIGNMENT TAB ==================== */
function LeadAssignmentTab() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<LeadAssignmentConfig>(DEFAULT_LEAD_ASSIGNMENT_CONFIG);
  const [teamMembers, setTeamMembers] = useState<CRMUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [configSnap, usersSnap] = await Promise.all([
          getDoc(doc(db, 'crm_config', 'lead_assignment')),
          getDocs(collection(db, 'users')),
        ]);
        if (configSnap.exists()) {
          setConfig({
            ...DEFAULT_LEAD_ASSIGNMENT_CONFIG,
            ...(configSnap.data() as Partial<LeadAssignmentConfig>),
          });
        }
        const members = usersSnap.docs
          .map(d => ({ uid: d.id, ...d.data() } as CRMUser))
          .filter(member => member.active && member.role === 'sales_exec')
          .sort(compareTeamMembers);
        setTeamMembers(members);
      } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load lead assignment settings.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [showToast]);

  const toggleUser = (uid: string) => {
    setConfig(prev => ({
      ...prev,
      eligible_user_uids: prev.eligible_user_uids.includes(uid)
        ? prev.eligible_user_uids.filter(item => item !== uid)
        : [...prev.eligible_user_uids, uid],
    }));
  };

  const addRule = () => {
    const rule: LeadAssignmentRule = {
      id: `rule_${Date.now()}`,
      label: 'New Source Rule',
      source_contains: '',
      assignee_uids: [],
      active: true,
    };
    setConfig(prev => ({ ...prev, source_rules: [...prev.source_rules, rule] }));
  };

  const updateRule = (ruleId: string, patch: Partial<LeadAssignmentRule>) => {
    setConfig(prev => ({
      ...prev,
      source_rules: prev.source_rules.map(rule => rule.id === ruleId ? { ...rule, ...patch } : rule),
    }));
  };

  const removeRule = (ruleId: string) => {
    setConfig(prev => ({ ...prev, source_rules: prev.source_rules.filter(rule => rule.id !== ruleId) }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'crm_config', 'lead_assignment'), {
        ...config,
        eligible_roles: ['sales_exec'],
        updated_at: serverTimestamp(),
      }, { merge: true });
      showToast('success', 'Lead assignment settings saved.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to save lead assignment settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-mn-text-muted">Loading...</div>;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-black text-mn-h3 uppercase tracking-[0.25em]">Sales Automation</p>
          <h2 className="text-lg font-black text-mn-h1 mt-1">Lead Assignment</h2>
          <p className="text-sm text-mn-text-muted">Assign new leads by source rules, round-robin, or lowest open workload.</p>
        </div>
        <Button icon={<Save className="w-4 h-4" />} disabled={saving} onClick={save}>
          {saving ? 'Saving...' : 'Save Assignment'}
        </Button>
      </div>

      <Card>
        <div className="p-5 space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
              className="h-4 w-4"
            />
            <div>
              <p className="text-sm font-bold text-mn-text">Enable automatic assignment</p>
              <p className="text-xs text-mn-text-muted">New walk-in and CSV leads will be assigned before saving.</p>
            </div>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-1.5">Fallback Strategy</label>
              <select
                value={config.strategy}
                onChange={e => setConfig(prev => ({ ...prev, strategy: e.target.value as LeadAssignmentConfig['strategy'] }))}
                className="w-full px-4 py-2.5 bg-mn-input-bg border border-mn-input-border rounded-xl text-sm text-mn-text focus:outline-none focus:border-mn-input-focus"
              >
                <option value="workload">Lowest Open Workload</option>
                <option value="round_robin">Round Robin</option>
              </select>
            </div>
            <div className="rounded-xl border border-mn-border/30 bg-mn-surface p-3 text-xs text-mn-text-muted">
              If no source rule matches, the CRM assigns to the selected sales executives using this fallback.
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-5 space-y-4">
          <div>
            <h3 className="text-sm font-black text-mn-h1">Eligible Sales Executives</h3>
            <p className="text-xs text-mn-text-muted">Leave everyone unchecked to use all active sales executives.</p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {teamMembers.map(member => (
              <label key={member.uid} className="flex items-center gap-3 rounded-xl border border-mn-border/30 bg-mn-card p-3">
                <input
                  type="checkbox"
                  checked={config.eligible_user_uids.includes(member.uid)}
                  onChange={() => toggleUser(member.uid)}
                  className="h-4 w-4"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-mn-text">{member.name}</p>
                  <p className="truncate text-xs text-mn-text-muted">{member.email}</p>
                </div>
              </label>
            ))}
            {teamMembers.length === 0 && (
              <p className="text-sm text-mn-text-muted">No active sales executives found.</p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-mn-h1">Source Rules</h3>
              <p className="text-xs text-mn-text-muted">Example: source contains “Meta” routes to selected executives first.</p>
            </div>
            <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={addRule}>Add Rule</Button>
          </div>

          <div className="space-y-3">
            {config.source_rules.map(rule => (
              <div key={rule.id} className="rounded-xl border border-mn-border/30 bg-mn-card p-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <Input
                    label="Rule Name"
                    value={rule.label}
                    onChange={e => updateRule(rule.id, { label: e.target.value })}
                    placeholder="Meta leads"
                  />
                  <Input
                    label="Source Contains"
                    value={rule.source_contains}
                    onChange={e => updateRule(rule.id, { source_contains: e.target.value })}
                    placeholder="Meta"
                  />
                  <button
                    type="button"
                    onClick={() => removeRule(rule.id)}
                    className="self-end rounded-xl p-3 text-mn-danger hover:bg-mn-danger/10"
                    title="Remove rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-mn-text">
                  <input
                    type="checkbox"
                    checked={rule.active}
                    onChange={e => updateRule(rule.id, { active: e.target.checked })}
                  />
                  Active
                </label>
                <div className="flex flex-wrap gap-2">
                  {teamMembers.map(member => {
                    const checked = rule.assignee_uids.includes(member.uid);
                    return (
                      <button
                        key={member.uid}
                        type="button"
                        onClick={() => updateRule(rule.id, {
                          assignee_uids: checked
                            ? rule.assignee_uids.filter(uid => uid !== member.uid)
                            : [...rule.assignee_uids, member.uid],
                        })}
                        className={`rounded-full border px-3 py-1 text-xs font-bold ${
                          checked
                            ? 'border-mn-h2 bg-mn-h2/15 text-mn-h2'
                            : 'border-mn-border/40 text-mn-text-muted hover:border-mn-border'
                        }`}
                      >
                        {member.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {config.source_rules.length === 0 && (
              <p className="rounded-xl border border-dashed border-mn-border p-6 text-center text-sm text-mn-text-muted">
                No source rules yet. Fallback assignment will handle every new lead.
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ==================== LEAD SLA TAB ==================== */
function LeadSLATab() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<SLAConfig>(DEFAULT_SLA_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'crm_config', 'sla'));
        if (snap.exists()) {
          setConfig({
            ...DEFAULT_SLA_CONFIG,
            ...(snap.data() as Partial<SLAConfig>),
          });
        }
      } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load SLA settings.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [showToast]);

  const updateNumber = (key: keyof Pick<SLAConfig, 'first_call_minutes' | 'stale_lead_days' | 'no_follow_up_days' | 'missed_callback_minutes'>, value: string) => {
    const parsed = Number(value);
    setConfig(prev => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'crm_config', 'sla'), {
        ...config,
        updated_at: serverTimestamp(),
      }, { merge: true });
      showToast('success', 'Lead SLA settings saved.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to save SLA settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-mn-text-muted">Loading...</div>;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-black text-mn-h3 uppercase tracking-[0.25em]">Sales Automation</p>
          <h2 className="text-lg font-black text-mn-h1 mt-1">Lead SLA</h2>
          <p className="text-sm text-mn-text-muted">Show overdue first calls, missed callbacks, and stale leads on the Kanban board.</p>
        </div>
        <Button icon={<Save className="w-4 h-4" />} disabled={saving} onClick={save}>
          {saving ? 'Saving...' : 'Save SLA'}
        </Button>
      </div>

      <Card>
        <div className="p-5 space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
              className="h-4 w-4"
            />
            <div>
              <p className="text-sm font-bold text-mn-text">Enable lead SLA alerts</p>
              <p className="text-xs text-mn-text-muted">Closed, booked, and rejected leads are ignored automatically.</p>
            </div>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="First Call SLA (minutes)"
              type="number"
              min="0"
              value={config.first_call_minutes}
              onChange={e => updateNumber('first_call_minutes', e.target.value)}
            />
            <Input
              label="Missed Callback Grace (minutes)"
              type="number"
              min="0"
              value={config.missed_callback_minutes}
              onChange={e => updateNumber('missed_callback_minutes', e.target.value)}
            />
            <Input
              label="Follow-up Due After (days)"
              type="number"
              min="0"
              value={config.no_follow_up_days}
              onChange={e => updateNumber('no_follow_up_days', e.target.value)}
            />
            <Input
              label="Stale Lead After (days)"
              type="number"
              min="0"
              value={config.stale_lead_days}
              onChange={e => updateNumber('stale_lead_days', e.target.value)}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ==================== NURTURE SEQUENCES TAB ==================== */
function NurtureSequencesTab() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<NurtureConfig>(DEFAULT_NURTURE_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'crm_config', 'nurture'));
        if (snap.exists()) {
          setConfig({
            ...DEFAULT_NURTURE_CONFIG,
            ...(snap.data() as Partial<NurtureConfig>),
          });
        }
      } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load nurture settings.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [showToast]);

  const updateNumber = (key: keyof Pick<NurtureConfig, 'welcome_delay_minutes' | 'property_match_follow_up_days' | 'site_visit_reminder_hours_before' | 'post_site_visit_follow_up_hours_after' | 'old_lead_reactivation_days' | 'no_response_follow_up_days'>, value: string) => {
    const parsed = Number(value);
    setConfig(prev => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'crm_config', 'nurture'), {
        ...config,
        updated_at: serverTimestamp(),
      }, { merge: true });
      showToast('success', 'Nurture sequence settings saved.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to save nurture settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-mn-text-muted">Loading...</div>;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-black text-mn-h3 uppercase tracking-[0.25em]">Sales Automation</p>
          <h2 className="text-lg font-black text-mn-h1 mt-1">Nurture Sequences</h2>
          <p className="text-sm text-mn-text-muted">Configure suggested follow-ups. The CRM creates tasks; it does not auto-send messages.</p>
        </div>
        <Button icon={<Save className="w-4 h-4" />} disabled={saving} onClick={save}>
          {saving ? 'Saving...' : 'Save Nurture'}
        </Button>
      </div>

      <Card>
        <div className="p-5 space-y-5">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
              className="h-4 w-4"
            />
            <div>
              <p className="text-sm font-bold text-mn-text">Enable nurture suggestions</p>
              <p className="text-xs text-mn-text-muted">Suggestions appear on Overdue Tasks for human approval.</p>
            </div>
          </label>

          <div className="rounded-2xl border border-mn-border/35 bg-mn-surface p-4 space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config.welcome_enabled}
                onChange={e => setConfig(prev => ({ ...prev, welcome_enabled: e.target.checked }))}
                className="h-4 w-4"
              />
              <div>
                <p className="text-sm font-bold text-mn-text">New lead welcome message</p>
                <p className="text-xs text-mn-text-muted">Suggest a WhatsApp welcome message for newly captured leads.</p>
              </div>
            </label>

            <div className="max-w-sm">
              <Input
                label="Suggest Welcome After (minutes)"
                type="number"
                min="0"
                value={config.welcome_delay_minutes}
                onChange={e => updateNumber('welcome_delay_minutes', e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-mn-border/35 bg-mn-surface p-4 space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config.no_response_follow_up_enabled}
                onChange={e => setConfig(prev => ({ ...prev, no_response_follow_up_enabled: e.target.checked }))}
                className="h-4 w-4"
              />
              <div>
                <p className="text-sm font-bold text-mn-text">No-response WhatsApp follow-up</p>
                <p className="text-xs text-mn-text-muted">Suggest a WhatsApp follow-up when a lead goes quiet after the last outbound touch.</p>
              </div>
            </label>

            <div className="max-w-sm">
              <Input
                label="Suggest After Silence (days)"
                type="number"
                min="0"
                value={config.no_response_follow_up_days}
                onChange={e => updateNumber('no_response_follow_up_days', e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-mn-border/35 bg-mn-surface p-4 space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config.property_match_follow_up_enabled}
                onChange={e => setConfig(prev => ({ ...prev, property_match_follow_up_enabled: e.target.checked }))}
                className="h-4 w-4"
              />
              <div>
                <p className="text-sm font-bold text-mn-text">Property match follow-up</p>
                <p className="text-xs text-mn-text-muted">Suggest a follow-up after matched property details were sent and the lead goes quiet.</p>
              </div>
            </label>

            <div className="max-w-sm">
              <Input
                label="Suggest After Match Silence (days)"
                type="number"
                min="0"
                value={config.property_match_follow_up_days}
                onChange={e => updateNumber('property_match_follow_up_days', e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-mn-border/35 bg-mn-surface p-4 space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config.site_visit_reminder_enabled}
                onChange={e => setConfig(prev => ({ ...prev, site_visit_reminder_enabled: e.target.checked }))}
                className="h-4 w-4"
              />
              <div>
                <p className="text-sm font-bold text-mn-text">Site visit reminder</p>
                <p className="text-xs text-mn-text-muted">Suggest a reminder message before a scheduled site visit.</p>
              </div>
            </label>

            <div className="max-w-sm">
              <Input
                label="Suggest Before Visit (hours)"
                type="number"
                min="0"
                value={config.site_visit_reminder_hours_before}
                onChange={e => updateNumber('site_visit_reminder_hours_before', e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-mn-border/35 bg-mn-surface p-4 space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config.post_site_visit_follow_up_enabled}
                onChange={e => setConfig(prev => ({ ...prev, post_site_visit_follow_up_enabled: e.target.checked }))}
                className="h-4 w-4"
              />
              <div>
                <p className="text-sm font-bold text-mn-text">Post-site-visit follow-up</p>
                <p className="text-xs text-mn-text-muted">Suggest a follow-up after the visit to capture buyer feedback, objections, and next steps.</p>
              </div>
            </label>

            <div className="max-w-sm">
              <Input
                label="Suggest After Visit (hours)"
                type="number"
                min="0"
                value={config.post_site_visit_follow_up_hours_after}
                onChange={e => updateNumber('post_site_visit_follow_up_hours_after', e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-mn-border/35 bg-mn-surface p-4 space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config.old_lead_reactivation_enabled}
                onChange={e => setConfig(prev => ({ ...prev, old_lead_reactivation_enabled: e.target.checked }))}
                className="h-4 w-4"
              />
              <div>
                <p className="text-sm font-bold text-mn-text">Old lead reactivation</p>
                <p className="text-xs text-mn-text-muted">Suggest reactivation for inactive non-terminal leads that have no more specific task.</p>
              </div>
            </label>

            <div className="max-w-sm">
              <Input
                label="Reactivate After Inactivity (days)"
                type="number"
                min="0"
                value={config.old_lead_reactivation_days}
                onChange={e => updateNumber('old_lead_reactivation_days', e.target.value)}
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ==================== BRANDING TAB ==================== */
function BrandingTab() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [tagline, setTagline] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#555856');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'crm_config', 'branding'));
        if (snap.exists()) {
          const d = snap.data();
          setCompanyName(d.companyName || '');
          setTagline(d.tagline || '');
          setLogo(d.logo || null);
          setBanner(d.banner || null);
          setPrimaryColor(d.primaryColor || '#555856');
          setPhone(d.phone || '');
          setEmail(d.email || '');
          setWebsite(d.website || '');
        }
      } catch (err) {
        console.error('Failed to load branding:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'crm_config', 'branding'), {
        companyName: companyName.trim(),
        tagline: tagline.trim(),
        logo,
        banner,
        primaryColor,
        phone: phone.trim(),
        email: email.trim(),
        website: website.trim(),
        updated_at: serverTimestamp(),
      }, { merge: true });
      notifyBrandingUpdated();
      showToast('success', 'Branding saved successfully.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to save branding.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-mn-text-muted">Loading branding settings...</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Preview banner */}
        <Card className="overflow-hidden">
          <div className="relative h-36 bg-gradient-to-r from-mn-card to-mn-surface">
            {banner ? (
              <img src={banner} alt="Banner" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-mn-text-muted text-xs">
                No banner uploaded
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
              <div className="flex items-center gap-3">
                {logo ? (
                  <img src={logo} alt="Logo" className="w-12 h-12 rounded-xl object-cover border-2 border-white shadow-lg" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-white/20 border-2 border-white/30 flex items-center justify-center">
                    <ImageIcon className="w-6 h-6 text-white/60" />
                  </div>
                )}
                <div>
                  <h3 className="text-white font-black text-lg">{companyName || 'Your Company Name'}</h3>
                  {tagline && <p className="text-white/70 text-xs">{tagline}</p>}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Company Info */}
        <Card className="p-6">
          <h3 className="text-sm font-black text-mn-h1 uppercase tracking-wider mb-4">Company Info</h3>
          <div className="space-y-4">
            <Input
              label="Company Name"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Elite Build Realtors"
            />
            <Input
              label="Tagline"
              value={tagline}
              onChange={e => setTagline(e.target.value)}
              placeholder="e.g. Building Dreams, Delivering Trust"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Phone"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
              <Input
                label="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="info@elitebuild.in"
              />
            </div>
            <Input
              label="Website"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="https://elitebuild.in"
            />
          </div>
        </Card>

        {/* Logo & Banner Upload */}
        <Card className="p-6">
          <h3 className="text-sm font-black text-mn-h1 uppercase tracking-wider mb-4">Logo & Banner</h3>
          <div className="grid grid-cols-2 gap-6">
            <ImageUpload
              label="Company Logo"
              value={logo}
              onChange={setLogo}
              folder="branding"
              helperText="Square logo, minimum 512 x 512px."
            />
            <ImageUpload
              label="Banner Image"
              value={banner}
              onChange={setBanner}
              folder="branding"
              helperText="Minimum 1600 x 900px, landscape. Use a real high-resolution background image, not a small logo or screenshot."
              minWidth={1600}
              minHeight={900}
            />
          </div>
          <p className="text-[10px] text-mn-text-muted mt-3">
            Banner images are used as full-bleed backgrounds. Low-resolution images will be rejected to avoid blurry or oversized rendering.
          </p>
        </Card>

        {/* Brand Color */}
        <Card className="p-6">
          <h3 className="text-sm font-black text-mn-h1 uppercase tracking-wider mb-4">Brand Color</h3>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={primaryColor}
              onChange={e => setPrimaryColor(e.target.value)}
              className="w-12 h-12 rounded-xl border border-mn-border cursor-pointer"
            />
            <div>
              <p className="text-sm font-bold text-mn-text">{primaryColor}</p>
              <p className="text-[10px] text-mn-text-muted">Used in WhatsApp messages and generated documents</p>
            </div>
          </div>
        </Card>

        {/* Save */}
        <div className="flex justify-end pb-8">
          <Button
            icon={<Save className="w-4 h-4" />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Branding'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ==================== CARD COLORS TAB ==================== */
function CardColorsTab() {
  const { showToast } = useToast();
  const [colors, setColors] = useState<string[]>([]);
  const [newColor, setNewColor] = useState('#');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'crm_config', 'lead_card_colors'));
        if (snap.exists()) {
          const d = snap.data();
          setColors(d.colors || DEFAULT_LEAD_CARD_COLORS.colors);
        } else {
          setColors(DEFAULT_LEAD_CARD_COLORS.colors);
        }
      } catch (err) {
        console.error('Failed to load card colors:', err);
        setColors(DEFAULT_LEAD_CARD_COLORS.colors);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleAddColor = () => {
    const hex = newColor.trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      showToast('error', 'Enter a valid 6-digit hex color (e.g. #FF5733)');
      return;
    }
    if (colors.includes(hex.toUpperCase())) {
      showToast('error', 'This color already exists');
      return;
    }
    setColors(prev => [...prev, hex.toUpperCase()]);
    setNewColor('#');
  };

  const handleRemoveColor = (color: string) => {
    setColors(prev => prev.filter(c => c !== color));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'crm_config', 'lead_card_colors'), {
        colors,
        updated_at: serverTimestamp(),
      });
      showToast('success', 'Card colors saved');
    } catch (err) {
      console.error('Failed to save card colors:', err);
      showToast('error', 'Failed to save card colors');
    }
    setSaving(false);
  };

  const handleReset = () => {
    setColors(DEFAULT_LEAD_CARD_COLORS.colors);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-mn-text-muted font-medium animate-pulse">Loading colors...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-8">
        <Card className="p-6">
          <h3 className="text-sm font-black text-mn-h2 mb-1">Lead Card Colors</h3>
          <p className="text-xs text-mn-text-muted mb-6">
            Manage the color palette available on lead cards. All users can pick from these colors.
          </p>

          {/* Current colors */}
          <div className="flex flex-wrap gap-3 mb-6">
            {colors.map((color) => (
              <div key={color} className="flex items-center gap-2 bg-mn-bg rounded-xl px-3 py-2">
                <div
                  className="w-8 h-8 rounded-lg border border-mn-border shadow-sm flex items-center justify-center text-[10px] font-bold"
                  style={{ backgroundColor: color, color: contrastingTextColor(color) }}
                >
                  Aa
                </div>
                <span className="text-xs font-mono font-bold text-mn-text">{color}</span>
                <button
                  onClick={() => handleRemoveColor(color)}
                  className="ml-1 p-1 rounded-lg text-mn-text-muted hover:text-mn-danger hover:bg-mn-danger/10 transition-all"
                  title="Remove color"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add new color */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newColor.length === 7 ? newColor : '#000000'}
                onChange={(e) => setNewColor(e.target.value.toUpperCase())}
                className="w-8 h-8 rounded-lg border border-mn-border cursor-pointer"
              />
              <Input
                value={newColor}
                onChange={(e) => setNewColor(e.target.value.toUpperCase())}
                placeholder="#FF5733"
                className="w-32 font-mono"
              />
            </div>
            <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={handleAddColor}>
              Add Color
            </Button>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-between pb-8">
          <button
            onClick={handleReset}
            className="text-xs font-bold text-mn-text-muted hover:text-mn-danger transition-colors"
          >
            Reset to defaults
          </button>
          <Button
            icon={<Save className="w-4 h-4" />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Colors'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ==================== MARKETING TEAMS TAB ==================== */

const KNOWN_SOURCES = ['Meta Ads', 'Google Ads', 'Instagram', 'Website', 'Referral', 'Walk-in', 'YouTube', 'Other'];

function MarketingTeamsTab() {
  const { showToast } = useToast();
  const [teams, setTeams] = useState<MarketingTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formSources, setFormSources] = useState<string[]>([]);
  const [formSpend, setFormSpend] = useState('');
  const [formActive, setFormActive] = useState(true);

  useEffect(() => {
    const loadTeams = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'marketing_teams'));
        const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as MarketingTeam));
        loaded.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setTeams(loaded);
      } catch (err) {
        console.error(err);
        showToast('error', 'Failed to load marketing teams.');
      } finally {
        setLoading(false);
      }
    };
    loadTeams();
  }, [showToast]);

  const resetForm = () => {
    setFormName('');
    setFormSources([]);
    setFormSpend('');
    setFormActive(true);
    setEditingId(null);
    setShowForm(false);
  };

  const openEdit = (team: MarketingTeam) => {
    setFormName(team.name);
    setFormSources(team.sources);
    setFormSpend(String(team.monthly_spend));
    setFormActive(team.active);
    setEditingId(team.id);
    setShowForm(true);
  };

  const toggleSource = (source: string) => {
    setFormSources(prev =>
      prev.includes(source)
        ? prev.filter(s => s !== source)
        : [...prev, source],
    );
  };

  const handleSave = async () => {
    if (!formName.trim()) { showToast('error', 'Team name is required.'); return; }
    if (formSources.length === 0) { showToast('error', 'Select at least one source.'); return; }
    const spend = parseFloat(formSpend) || 0;

    setSaving(true);
    try {
      const data = {
        name: formName.trim(),
        sources: formSources,
        monthly_spend: spend,
        active: formActive,
        created_at: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'marketing_teams', editingId), data);
        setTeams(prev => prev.map(t => t.id === editingId ? { ...t, ...data, id: editingId } as MarketingTeam : t));
        showToast('success', `${formName.trim()} updated.`);
      } else {
        const newRef = doc(collection(db, 'marketing_teams'));
        await setDoc(newRef, data);
        setTeams(prev => [...prev, { id: newRef.id, ...data } as MarketingTeam]);
        showToast('success', `${formName.trim()} added.`);
      }
      resetForm();
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to save marketing team.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (team: MarketingTeam) => {
    try {
      await deleteDoc(doc(db, 'marketing_teams', team.id));
      setTeams(prev => prev.filter(t => t.id !== team.id));
      showToast('success', `${team.name} deleted.`);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to delete marketing team.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black text-mn-h2 uppercase tracking-wider">Marketing Teams</h2>
          <p className="text-xs text-mn-text-muted mt-1">
            Configure outsourced marketing agencies. Leads are attributed by matching the lead source to team sources.
          </p>
        </div>
        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => { resetForm(); setShowForm(true); }}
        >
          Add Team
        </Button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card>
          <div className="p-5 space-y-4">
            <h3 className="text-xs font-black text-mn-h3 uppercase tracking-wider">
              {editingId ? 'Edit Team' : 'New Marketing Team'}
            </h3>

            <Input
              label="Team Name"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="e.g., Skyline Digital Agency"
            />

            <div>
              <label className="block text-[10px] font-black text-mn-h3 uppercase tracking-wider mb-2">Lead Sources</label>
              <div className="flex flex-wrap gap-2">
                {KNOWN_SOURCES.map(source => (
                  <button
                    key={source}
                    onClick={() => toggleSource(source)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      formSources.includes(source)
                        ? 'bg-mn-h2/15 text-mn-h2 border-mn-h2/30'
                        : 'bg-mn-card text-mn-text-muted border-mn-border hover:border-mn-h2/30'
                    }`}
                  >
                    {source}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Monthly Spend (INR)"
              type="number"
              value={formSpend}
              onChange={e => setFormSpend(e.target.value)}
              placeholder="e.g., 50000"
            />

            <div className="flex items-center gap-3">
              <label className="text-[10px] font-black text-mn-h3 uppercase tracking-wider">Active:</label>
              <button
                onClick={() => setFormActive(!formActive)}
                className={`w-10 h-5 rounded-full transition-all ${formActive ? 'bg-mn-success' : 'bg-mn-border'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${formActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} icon={<Save className="w-4 h-4" />}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Add Team'}
              </Button>
              <button onClick={resetForm} className="px-4 py-2 text-sm font-bold text-mn-text-muted hover:text-mn-text">
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Teams List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-mn-card border border-mn-border rounded-2xl p-5 h-20 animate-pulse" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <Card>
          <div className="p-8 text-center">
            <Megaphone className="w-12 h-12 text-mn-border mx-auto mb-3" />
            <p className="text-sm text-mn-text-muted">No marketing teams yet. Add one to start tracking agency performance.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {teams.map(team => (
            <Card key={team.id}>
              <div className="p-5 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-mn-text">{team.name}</h3>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${team.active ? 'bg-mn-success/15 text-mn-success' : 'bg-mn-border text-mn-text-muted'}`}>
                      {team.active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {team.sources.map(s => (
                      <span key={s} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-mn-h2/10 text-mn-h2">{s}</span>
                    ))}
                  </div>
                  <p className="text-xs text-mn-text-muted">
                    Monthly spend: {team.monthly_spend > 0 ? `₹${team.monthly_spend.toLocaleString('en-IN')}` : 'Not set'}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => openEdit(team)}
                    className="p-2 rounded-lg text-mn-text-muted hover:text-mn-h2 hover:bg-mn-h2/10 transition-all"
                    title="Edit"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(team)}
                    className="p-2 rounded-lg text-mn-text-muted hover:text-mn-danger hover:bg-mn-danger/10 transition-all"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
