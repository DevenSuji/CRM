"use client";
import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Plus, Trash2, Megaphone, Save, X } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/context/AuthContext';
import { Project, Campaign } from '@/lib/types/project';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

interface Props {
  project: Project;
  canEdit: boolean;
}

const BLANK_CAMPAIGN = (): Omit<Campaign, 'id' | 'created_at'> => ({
  name: '',
  source: '',
  medium: '',
  utm_campaign: '',
  start_date: '',
  end_date: '',
  spend: 0,
  notes: '',
});

export function ProjectCampaignsTab({ project, canEdit }: Props) {
  const { showToast } = useToast();
  const { crmUser } = useAuth();
  const campaigns = project.campaigns || [];

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(BLANK_CAMPAIGN());
  const [saving, setSaving] = useState(false);

  const handleSaveCampaign = async () => {
    if (!draft.name.trim() || !draft.source.trim()) {
      showToast('error', 'Campaign name and source are required.');
      return;
    }
    setSaving(true);
    try {
      const newCampaign: Campaign = {
        id: `cmp_${Date.now()}`,
        created_at: new Date().toISOString(),
        created_by: crmUser?.uid || '',
        ...draft,
        spend: Number(draft.spend) || 0,
      };
      await updateDoc(doc(db, 'projects', project.id), {
        campaigns: [...campaigns, newCampaign],
      });
      showToast('success', `Campaign "${newCampaign.name}" added.`);
      setDraft(BLANK_CAMPAIGN());
      setAdding(false);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to save campaign.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!canEdit) return;
    try {
      await updateDoc(doc(db, 'projects', project.id), {
        campaigns: campaigns.filter(c => c.id !== campaignId),
      });
      showToast('success', 'Campaign removed.');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to remove campaign.');
    }
  };

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-mn-h1 text-base flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-mn-h2" />
            Marketing Campaigns
          </h3>
          <p className="text-xs text-mn-text-muted mt-0.5">
            Track which campaigns are driving leads into this project.
          </p>
        </div>
        {canEdit && !adding && (
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAdding(true)}>
            Add Campaign
          </Button>
        )}
      </div>

      {/* Add form */}
      {adding && canEdit && (
        <div className="p-5 bg-mn-surface border border-mn-border/30 rounded-xl space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Campaign Name"
              required
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Summer 2026 Plots"
            />
            <Input
              label="Source / Platform"
              required
              value={draft.source}
              onChange={e => setDraft({ ...draft, source: e.target.value })}
              placeholder="e.g. Meta Ads, Google Ads"
            />
            <Input
              label="Medium"
              value={draft.medium || ''}
              onChange={e => setDraft({ ...draft, medium: e.target.value })}
              placeholder="e.g. CPC, Display"
            />
            <Input
              label="UTM Campaign"
              value={draft.utm_campaign || ''}
              onChange={e => setDraft({ ...draft, utm_campaign: e.target.value })}
              placeholder="e.g. summer_plots_2026"
            />
            <Input
              label="Start Date"
              type="date"
              value={draft.start_date || ''}
              onChange={e => setDraft({ ...draft, start_date: e.target.value })}
            />
            <Input
              label="End Date"
              type="date"
              value={draft.end_date || ''}
              onChange={e => setDraft({ ...draft, end_date: e.target.value })}
            />
            <Input
              label="Spend (₹)"
              type="number"
              value={String(draft.spend || '')}
              onChange={e => setDraft({ ...draft, spend: Number(e.target.value) || 0 })}
              placeholder="0"
            />
          </div>
          <Input
            label="Notes"
            value={draft.notes || ''}
            onChange={e => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Creatives, audiences, landing page, etc."
          />
          <div className="flex gap-2 pt-1">
            <Button
              variant="secondary"
              icon={<X className="w-4 h-4" />}
              onClick={() => { setAdding(false); setDraft(BLANK_CAMPAIGN()); }}
            >
              Cancel
            </Button>
            <Button
              icon={<Save className="w-4 h-4" />}
              disabled={saving || !draft.name.trim() || !draft.source.trim()}
              onClick={handleSaveCampaign}
            >
              {saving ? 'Saving...' : 'Save Campaign'}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {campaigns.length === 0 ? (
        <div className="p-8 bg-mn-card/40 border border-dashed border-mn-border rounded-xl text-center">
          <Megaphone className="w-10 h-10 text-mn-border mx-auto mb-2" />
          <p className="text-sm font-bold text-mn-text-muted">No campaigns tagged yet.</p>
          <p className="text-xs text-mn-text-muted/70 mt-1">
            {canEdit ? 'Click "Add Campaign" to attach a marketing campaign to this project.' : 'A Digital Marketing user can add campaigns here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map(c => (
            <div key={c.id} className="p-4 bg-mn-card border border-mn-border/30 rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm text-mn-h1">{c.name}</span>
                    <Badge variant="info">{c.source}</Badge>
                    {c.medium && <Badge variant="default">{c.medium}</Badge>}
                  </div>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-mn-text-muted">
                    {c.utm_campaign && <div><span className="font-bold">UTM:</span> {c.utm_campaign}</div>}
                    {c.start_date && <div><span className="font-bold">Start:</span> {c.start_date}</div>}
                    {c.end_date && <div><span className="font-bold">End:</span> {c.end_date}</div>}
                    {c.spend ? <div><span className="font-bold">Spend:</span> ₹{c.spend.toLocaleString('en-IN')}</div> : null}
                  </div>
                  {c.notes && (
                    <p className="text-xs text-mn-text mt-2 whitespace-pre-wrap">{c.notes}</p>
                  )}
                </div>
                {canEdit && (
                  <button
                    onClick={() => handleDeleteCampaign(c.id)}
                    className="text-mn-text-muted/40 hover:text-mn-danger transition-colors flex-shrink-0"
                    title="Remove campaign"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
