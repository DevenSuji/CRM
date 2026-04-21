import { Timestamp } from 'firebase/firestore';

export type InventoryStatus = 'Available' | 'Booked' | 'Sold';

export interface InventoryUnit {
  id: string;
  projectId: string;
  projectName: string;
  location: string;
  propertyType: string;
  builder?: string;
  status: InventoryStatus;
  price: number;
  fields: Record<string, any>;
  created_at: Timestamp | null;
  /** When status === 'Booked', points to the lead holding this unit.
   *  Written in the same batch that flips status → 'Booked' so the two never
   *  drift; clearing status back to 'Available' also clears this field. */
  booked_by_lead_id?: string | null;
}
