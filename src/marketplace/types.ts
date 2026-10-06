import type { JobStatus, Role, Skill } from "../domain/models";
export interface Profile {
  id: string;
  display_name: string;
  role: Role;
  created_at: string;
}
export interface SavedAddress {
  id: string;
  label: string;
  street: string;
  unit: string;
  city: string;
  zone: string;
  instructions: string;
  latitude: number;
  longitude: number;
}
export interface WorkerSummary {
  id: string;
  name: string;
  bio: string;
  identity_verified: boolean;
  insured: boolean;
  rating: number;
  reviews: number;
  completed: number;
}
export interface MarketplaceJob {
  id: string;
  customer_id: string;
  worker_id: string | null;
  title: string;
  description: string;
  skill: Skill;
  category: string;
  status: JobStatus;
  approximate_zone: string;
  offer_cents: number;
  duration_minutes: number;
  urgency: "now" | "today" | "scheduled";
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  payment_approved_at: string | null;
  address: Omit<SavedAddress, "id" | "label" | "zone"> | null;
  worker: WorkerSummary | null;
  customer_name: string;
  eta_seconds: number | null;
}
export interface IncomingOffer {
  id: string;
  expires_at: string;
  score: number;
  eta_seconds: number;
  distance_m: number;
  reasons: {
    quality: number;
    reliability: number;
    skill: number;
    newcomer: boolean;
  };
  job: MarketplaceJob;
}
export interface WorkerAccount {
  id: string;
  bio: string;
  available: boolean;
  account_standing: "pending" | "good" | "suspended";
  identity_verified: boolean;
  payouts_ready: boolean;
  minimum_pay_cents: number;
  service_radius_m: number;
  completed_count: number;
}
export interface HomeData {
  profile: Profile;
  settings: { notifications: boolean; reduced_motion: boolean } | null;
  addresses: SavedAddress[];
  worker: WorkerAccount | null;
  skills: Skill[];
  jobs: MarketplaceJob[];
  offers: IncomingOffer[];
  payouts: { id: string; amount_cents: number; state: string }[];
}
export interface ChatMessage {
  id: string;
  job_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}
export interface JobData {
  job: MarketplaceJob;
  messages: ChatMessage[];
  photos: { id: string; storage_path: string; kind: string }[];
  payment: {
    id: string;
    state: string;
    amount_cents: number;
    fee_cents: number;
  } | null;
  review: { overall: number; note: string } | null;
  counters: {
    id: string;
    worker_name: string;
    amount_cents: number;
    reason: string;
  }[];
  matching: { eligible: number; sent: number; pending: number };
}
