"use client";
import { Lead } from '@/lib/types/lead';
import { Badge } from '@/components/ui/Badge';
import { formatPrice } from '@/lib/utils/formatPrice';
import { Phone, Mail, MapPin, Briefcase, Calendar, MessageSquare, Target, Megaphone, Building2 } from 'lucide-react';

interface LeadDetailPopoverProps {
  lead: Lead;
}

export function LeadDetailPopover({ lead }: LeadDetailPopoverProps) {
  const raw = lead.raw_data;

  return (
    <div className="w-80 space-y-4 rounded-[1.6rem] border border-white/50 bg-[color-mix(in_srgb,var(--mn-card)_94%,transparent)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-black text-mn-h1 text-base">{raw.lead_name}</h3>
          <p className="mt-0.5 text-xs text-mn-text-muted">{lead.source}</p>
        </div>
        {lead.ai_audit && (
          <Badge variant={lead.ai_audit.urgency === 'High' ? 'danger' : lead.ai_audit.urgency === 'Medium' ? 'warning' : 'info'}>
            {lead.ai_audit.intent} / {lead.ai_audit.urgency}
          </Badge>
        )}
      </div>

      <div className="space-y-2 rounded-[1.2rem] border border-mn-border/20 bg-white/35 p-3 dark:bg-white/5">
        <div className="flex items-center gap-2 text-sm text-mn-text">
          <Phone className="w-3.5 h-3.5 text-mn-h3 flex-shrink-0" />
          <span>{raw.phone}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-mn-text">
          <Mail className="w-3.5 h-3.5 text-mn-h3 flex-shrink-0" />
          <span className="truncate">{raw.email}</span>
        </div>
        {raw.location && raw.location !== 'Unknown' && (
          <div className="flex items-center gap-2 text-sm text-mn-text">
            <MapPin className="w-3.5 h-3.5 text-mn-h3 flex-shrink-0" />
            <span>{raw.location}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-mn-border/30 pt-3">
        <div>
          <p className="text-[10px] font-black text-mn-h3 uppercase">Budget</p>
          <p className="text-sm font-bold text-mn-h2">{formatPrice(raw.budget)}</p>
        </div>
        <div>
          <p className="text-[10px] font-black text-mn-h3 uppercase">Timeline</p>
          <p className="text-sm text-mn-text">{raw.plan_to_buy}</p>
        </div>
        <div>
          <p className="text-[10px] font-black text-mn-h3 uppercase">Profession</p>
          <p className="text-sm text-mn-text">{raw.profession}</p>
        </div>
        <div>
          <p className="text-[10px] font-black text-mn-h3 uppercase">Interest</p>
          <p className="text-sm text-mn-text">{raw.interest}</p>
        </div>
      </div>

      {/* Facings */}
      {raw.pref_facings && raw.pref_facings.length > 0 && (
        <div className="pt-3 border-t border-mn-border/30">
          <p className="text-[10px] font-black text-mn-h3 uppercase mb-1.5">Preferred Facings</p>
          <div className="flex flex-wrap gap-1.5">
            {raw.pref_facings.map(f => (
              <Badge key={f} variant="default">{f}</Badge>
            ))}
          </div>
        </div>
      )}

      {raw.note && raw.note !== 'No note provided' && (
        <div className="border-t border-mn-border/30 pt-3">
          <p className="text-[10px] font-black text-mn-h3 uppercase mb-1">Note</p>
          <p className="rounded-[1rem] border border-mn-border/15 bg-white/35 px-3 py-2 text-sm italic leading-relaxed text-mn-text dark:bg-white/5">&ldquo;{raw.note}&rdquo;</p>
        </div>
      )}

      {(lead.utm?.campaign || (lead.interested_properties && lead.interested_properties.length > 0)) && (
        <div className="space-y-2 border-t border-mn-border/30 pt-3">
          <p className="text-[10px] font-black text-mn-h3 uppercase">Campaign Attribution</p>
          {lead.interested_properties && lead.interested_properties.length > 0 && (
            <div className="flex items-center gap-2 rounded-[1rem] border border-mn-border/15 bg-mn-h2/6 px-3 py-2 text-sm text-mn-text">
              <Building2 className="w-3.5 h-3.5 text-mn-h2 flex-shrink-0" />
              <span className="font-bold text-mn-h2 truncate">
                {lead.interested_properties.map(p => p.projectName).join(', ')}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {lead.source && (
              <div>
                <p className="text-[10px] text-mn-text-muted">Source</p>
                <p className="text-xs font-bold text-mn-text">{lead.source}</p>
              </div>
            )}
            {lead.utm?.medium && (
              <div>
                <p className="text-[10px] text-mn-text-muted">Medium</p>
                <p className="text-xs font-bold text-mn-text">{lead.utm.medium}</p>
              </div>
            )}
          </div>
          {lead.utm?.campaign && (
            <div className="flex items-center gap-2 text-sm text-mn-text">
              <Megaphone className="w-3.5 h-3.5 text-mn-h3 flex-shrink-0" />
              <span className="truncate">{lead.utm.campaign}</span>
            </div>
          )}
        </div>
      )}

      {lead.suggested_plot && (
        <div className="flex items-center gap-2 border-t border-mn-border/30 pt-3">
          <Target className="w-4 h-4 text-mn-success" />
          <span className="text-sm font-bold text-mn-success">Matched: {lead.suggested_plot}</span>
        </div>
      )}
    </div>
  );
}
