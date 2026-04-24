export interface DemandGapCount {
  key: string;
  label: string;
  count: number;
}

export interface NoMatchLeadIntelligence {
  leadId: string;
  leadName: string;
  status: string;
  source: string;
  interests: string[];
  interestSummary: string;
  budget: number;
  budgetBand: string;
  location: string;
  reasonCode: string;
  reasonLabel: string;
  summary: string;
  details: string[];
  updated_at: string;
}

export interface DemandGapReport {
  totalNoMatchLeads: number;
  reasons: DemandGapCount[];
  interests: DemandGapCount[];
  locations: DemandGapCount[];
  budgetBands: DemandGapCount[];
  recentLeads: NoMatchLeadIntelligence[];
  updated_at: string;
  refreshReason?: string;
}
