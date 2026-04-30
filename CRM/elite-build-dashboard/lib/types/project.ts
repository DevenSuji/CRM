import { Timestamp } from 'firebase/firestore';

export type PropertyType = 'Plotted Land' | 'Apartment' | 'Villa' | 'Commercial Building' | 'Commercial Land' | 'Managed Farmland' | 'Agricultural Land' | 'Industrial Building' | 'Industrial Land' | 'Individual House';

export type ProjectStatus = 'Active' | 'Upcoming' | 'Sold Out';

export interface Campaign {
  id: string;
  name: string;
  /** Platform — e.g. Meta Ads, Google Ads, Magicbricks, 99acres */
  source: string;
  /** Campaign medium — CPC, Display, Listing, Organic, etc. */
  medium?: string;
  /** UTM campaign identifier used in landing URLs */
  utm_campaign?: string;
  /** ISO dates */
  start_date?: string;
  end_date?: string;
  spend?: number;
  notes?: string;
  /** UID of the user who created/tagged this campaign */
  created_by?: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  builder: string;
  location: string;
  propertyType: PropertyType;
  status: ProjectStatus;
  heroImage?: string | null;
  /** Gallery images (additional images beyond heroImage) */
  gallery?: string[];
  totalUnits?: number;
  priceRange?: { min: number; max: number } | null;
  /** Values for schema fields with scope='project' (e.g. Road Type, RERA, Drainage) */
  project_fields?: Record<string, any>;
  /** Geocoded coordinates for proximity matching */
  geo?: { lat: number; lng: number };
  /** Channel Partner user IDs allowed to view/work this project. */
  channel_partner_uids?: string[];
  /** Marketing campaigns attached to this project. Writable by digital_marketing, admin, superadmin. */
  campaigns?: Campaign[];
  created_at: Timestamp | null;
  updated_at?: Timestamp | null;
}

export type FieldType = 'text' | 'number' | 'dropdown' | 'boolean' | 'textarea';

export type FieldScope = 'project' | 'unit';

export interface SchemaField {
  id: string;
  label: string;
  key: string;
  type: FieldType;
  options: string;
  required: boolean;
  scope: FieldScope;
}

export const PROPERTY_TYPES: PropertyType[] = ['Plotted Land', 'Apartment', 'Villa', 'Individual House', 'Commercial Building', 'Commercial Land', 'Managed Farmland', 'Agricultural Land', 'Industrial Building', 'Industrial Land'];
export const PROJECT_STATUSES: ProjectStatus[] = ['Active', 'Upcoming', 'Sold Out'];

/** Default schema fields per property type — used when a project has no saved schema yet */
export const DEFAULT_SCHEMA_FIELDS: Record<string, SchemaField[]> = {
  "Plotted Land": [
    { id: 'f1', label: 'Plot Number', key: 'plot_number', type: 'dropdown', options: '', required: true, scope: 'unit' },
    { id: 'f2', label: 'Facing', key: 'facing', type: 'dropdown', options: 'North,South,East,West,North-East,North-West,South-East,South-West', required: false, scope: 'unit' },
    { id: 'f3', label: 'Dimension', key: 'dimension', type: 'text', options: '', required: false, scope: 'unit' },
    { id: 'f4', label: 'Road Type', key: 'road_type', type: 'dropdown', options: 'Asphalt,Cemented', required: false, scope: 'project' },
    { id: 'f5', label: 'Road Width', key: 'road_width', type: 'dropdown', options: '', required: false, scope: 'unit' },
    { id: 'f6', label: 'Corner Plot', key: 'corner_plot', type: 'boolean', options: '', required: false, scope: 'unit' },
    { id: 'f7', label: 'Drainage System', key: 'drainage_system', type: 'boolean', options: '', required: false, scope: 'project' },
    { id: 'f8', label: 'Electricity Connection', key: 'electricity_connection', type: 'boolean', options: '', required: false, scope: 'project' },
    { id: 'f9', label: 'Source of Water', key: 'water_source', type: 'dropdown', options: 'Borewell,Cauvery', required: false, scope: 'project' },
    { id: 'f10', label: 'Sewage System', key: 'sewage_system', type: 'boolean', options: '', required: false, scope: 'project' },
    { id: 'f11', label: 'RERA Approved', key: 'rera_approved', type: 'boolean', options: '', required: false, scope: 'project' },
    { id: 'f12', label: 'Khata Type', key: 'khata_type', type: 'dropdown', options: 'MUDA Approved,MUDA Allotted,Panchayat (DTCP),Panchayat (11B)', required: false, scope: 'project' },
    { id: 'f15', label: 'Price', key: 'price', type: 'number', options: '', required: true, scope: 'unit' },
    { id: 'f16', label: 'Area (sq ft)', key: 'area_sqft', type: 'number', options: '', required: false, scope: 'unit' },
    { id: 'f17', label: 'Status', key: 'status', type: 'dropdown', options: 'Available,Booked,Sold', required: true, scope: 'unit' },
    { id: 'f18', label: 'Notes', key: 'notes', type: 'textarea', options: '', required: false, scope: 'unit' },
  ],
  "Apartment": [
    { id: 'f1', label: 'Unit Number', key: 'unit_number', type: 'text', options: '', required: true, scope: 'unit' },
    { id: 'f2a', label: 'BHK', key: 'bhk', type: 'dropdown', options: '1,2,3,4,5,6', required: true, scope: 'unit' },
    { id: 'f2', label: 'Floor Number', key: 'floor_number', type: 'number', options: '', required: false, scope: 'unit' },
    { id: 'f3', label: 'Carpet Area (sq ft)', key: 'carpet_area', type: 'number', options: '', required: false, scope: 'unit' },
    { id: 'f4', label: 'Built Area (sq ft)', key: 'built_area', type: 'number', options: '', required: false, scope: 'unit' },
    { id: 'f5', label: 'Super Built-Up Area (sq ft)', key: 'super_builtup_area', type: 'number', options: '', required: false, scope: 'unit' },
    { id: 'f6', label: 'Facing', key: 'facing', type: 'dropdown', options: 'North,South,East,West,North-East,North-West,South-East,South-West', required: false, scope: 'unit' },
    { id: 'f8', label: 'Source of Water', key: 'water_source', type: 'dropdown', options: 'Borewell,Cauvery', required: false, scope: 'project' },
    { id: 'f9', label: 'Power Backup', key: 'power_backup', type: 'dropdown', options: 'Full,Partial,None', required: false, scope: 'project' },
    { id: 'f12', label: 'Amenities', key: 'amenities', type: 'dropdown', options: 'Gym,Clubhouse,Swimming Pool,Play Area,Jogging Track', required: false, scope: 'project' },
    { id: 'f13', label: 'Security', key: 'security', type: 'boolean', options: '', required: false, scope: 'project' },
    { id: 'f15', label: 'Gated Community', key: 'gated_community', type: 'boolean', options: '', required: false, scope: 'project' },
    { id: 'f17', label: 'Parking Type', key: 'parking_type', type: 'dropdown', options: 'Covered,Open,Mechanical', required: false, scope: 'project' },
    { id: 'f20', label: 'Price', key: 'price', type: 'number', options: '', required: true, scope: 'unit' },
    { id: 'f21', label: 'Status', key: 'status', type: 'dropdown', options: 'Available,Booked,Sold', required: true, scope: 'unit' },
    { id: 'f22', label: 'Notes', key: 'notes', type: 'textarea', options: '', required: false, scope: 'unit' },
  ],
  "Villa": [
    { id: 'f1', label: 'Unit Number', key: 'unit_number', type: 'text', options: '', required: true, scope: 'unit' },
    { id: 'f2', label: 'BHK', key: 'bhk', type: 'dropdown', options: '1,2,3,4,5,6', required: true, scope: 'unit' },
    { id: 'f3', label: 'Carpet Area (sq ft)', key: 'carpet_area', type: 'number', options: '', required: false, scope: 'unit' },
    { id: 'f4', label: 'Built Area (sq ft)', key: 'built_area', type: 'number', options: '', required: false, scope: 'unit' },
    { id: 'f5', label: 'Facing', key: 'facing', type: 'dropdown', options: 'North,South,East,West,North-East,North-West,South-East,South-West', required: false, scope: 'unit' },
    { id: 'f6', label: 'Source of Water', key: 'water_source', type: 'dropdown', options: 'Borewell,Cauvery', required: false, scope: 'project' },
    { id: 'f7', label: 'Power Backup', key: 'power_backup', type: 'dropdown', options: 'Full,Partial,None', required: false, scope: 'project' },
    { id: 'f10', label: 'Amenities', key: 'amenities', type: 'dropdown', options: 'Gym,Clubhouse,Swimming Pool,Private Garden,Jogging Track', required: false, scope: 'project' },
    { id: 'f11', label: 'Security', key: 'security', type: 'boolean', options: '', required: false, scope: 'project' },
    { id: 'f13', label: 'Gated Community', key: 'gated_community', type: 'boolean', options: '', required: false, scope: 'project' },
    { id: 'f15', label: 'Parking Type', key: 'parking_type', type: 'dropdown', options: 'Covered,Open', required: false, scope: 'project' },
    { id: 'f17', label: 'Price', key: 'price', type: 'number', options: '', required: true, scope: 'unit' },
    { id: 'f18', label: 'Status', key: 'status', type: 'dropdown', options: 'Available,Booked,Sold', required: true, scope: 'unit' },
    { id: 'f19', label: 'Notes', key: 'notes', type: 'textarea', options: '', required: false, scope: 'unit' },
  ],
  "Individual House": [
    { id: 'f1', label: 'Unit Number', key: 'unit_number', type: 'text', options: '', required: true, scope: 'unit' },
    { id: 'f2', label: 'Variant', key: 'house_variant', type: 'dropdown', options: 'Simplex,Duplex,Triplex,Quadraplex', required: true, scope: 'unit' },
    { id: 'f3', label: 'BHK', key: 'bhk', type: 'dropdown', options: '1,2,3,4,5,6', required: true, scope: 'unit' },
    { id: 'f4', label: 'Carpet Area (sq ft)', key: 'carpet_area', type: 'number', options: '', required: false, scope: 'unit' },
    { id: 'f5', label: 'Built Area (sq ft)', key: 'built_area', type: 'number', options: '', required: false, scope: 'unit' },
    { id: 'f6', label: 'Facing', key: 'facing', type: 'dropdown', options: 'North,South,East,West,North-East,North-West,South-East,South-West', required: false, scope: 'unit' },
    { id: 'f7', label: 'Source of Water', key: 'water_source', type: 'dropdown', options: 'Borewell,Cauvery', required: false, scope: 'project' },
    { id: 'f8', label: 'Power Backup', key: 'power_backup', type: 'dropdown', options: 'Full,Partial,None', required: false, scope: 'project' },
    { id: 'f9', label: 'Amenities', key: 'amenities', type: 'dropdown', options: 'Gym,Clubhouse,Swimming Pool,Private Garden,Jogging Track', required: false, scope: 'project' },
    { id: 'f10', label: 'Security', key: 'security', type: 'boolean', options: '', required: false, scope: 'project' },
    { id: 'f11', label: 'Gated Community', key: 'gated_community', type: 'boolean', options: '', required: false, scope: 'project' },
    { id: 'f12', label: 'Parking Type', key: 'parking_type', type: 'dropdown', options: 'Covered,Open', required: false, scope: 'project' },
    { id: 'f13', label: 'Price', key: 'price', type: 'number', options: '', required: true, scope: 'unit' },
    { id: 'f14', label: 'Status', key: 'status', type: 'dropdown', options: 'Available,Booked,Sold', required: true, scope: 'unit' },
    { id: 'f15', label: 'Notes', key: 'notes', type: 'textarea', options: '', required: false, scope: 'unit' },
  ],
};
