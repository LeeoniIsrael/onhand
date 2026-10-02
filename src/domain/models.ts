export type Role = "customer" | "worker";
export type Category =
  | "Plumbing"
  | "Electrical"
  | "Assembly"
  | "Mounting"
  | "Appliances"
  | "Painting"
  | "HVAC"
  | "Carpentry"
  | "General repair"
  | "Moving"
  | "Outdoor"
  | "Other";
export type Skill =
  | "plumbing.leak"
  | "plumbing.drain"
  | "electrical.fixture"
  | "assembly.furniture"
  | "mounting.tv"
  | "appliances.repair"
  | "painting.interior"
  | "hvac.service"
  | "carpentry.repair"
  | "general.repair"
  | "moving.help"
  | "outdoor.help"
  | "other.help";
export type Urgency = "now" | "today" | "scheduled";
export type JobStatus =
  | "draft"
  | "pricing"
  | "requested"
  | "matching"
  | "offered"
  | "matched"
  | "worker_en_route"
  | "worker_arrived"
  | "in_progress"
  | "awaiting_completion_confirmation"
  | "completed"
  | "cancelled"
  | "disputed";
export interface Coordinates {
  latitude: number;
  longitude: number;
}
export interface Address {
  id: string;
  label: string;
  street: string;
  unit: string;
  city: string;
  zone: string;
  coordinates: Coordinates;
  instructions: string;
}
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
}
export interface CustomerProfile extends User {
  addresses: Address[];
  blockedWorkers: string[];
}
export interface License {
  id: string;
  skill: Skill;
  jurisdiction: string;
  expiresAt: string;
  verified: boolean;
}
export interface WorkerSkill {
  skill: Skill;
  confidence: number;
  verified: boolean;
  completed: number;
}
export interface WorkerMetrics {
  rating: number;
  reviews: number;
  completed: number;
  completion: number;
  cancellation: number;
  response: number;
  acceptance: number;
  punctuality: number;
  durationAccuracy: number;
  complaints: number;
  refunds: number;
  disputes: number;
  repeat: number;
  recentQuality: number;
}
export interface WorkerProfile extends User {
  role: "worker";
  skills: WorkerSkill[];
  licenses: License[];
  metrics: WorkerMetrics;
  available: boolean;
  standing: "good" | "suspended";
  location: Coordinates;
  serviceRadiusKm: number;
  minimumPay: number;
  utilization: number;
  heading: number;
  identityVerified: boolean;
  backgroundCheck: "verified" | "pending" | "not_provided";
  insured: boolean;
  bio: string;
  color: string;
}
export interface JobPhoto {
  id: string;
  uri: string;
  kind: "before" | "after" | "video";
}
export interface Job {
  id: string;
  customerId: string;
  workerId?: string;
  title: string;
  description: string;
  category: Category;
  skill: Skill;
  status: JobStatus;
  address: Address;
  urgency: Urgency;
  scheduledAt?: string;
  offer: number;
  duration: number;
  complexity: "small" | "medium" | "large";
  photos: JobPhoto[];
  createdAt: string;
  eta?: number;
  requiresLicense: boolean;
  tip: number;
  paymentId?: string;
}
export interface JobOffer {
  id: string;
  jobId: string;
  workerId: string;
  expiresAt: number;
  status: "pending" | "accepted" | "declined" | "expired";
  wave: number;
}
export interface CounterOffer {
  id: string;
  jobId: string;
  amount: number;
  reason: string;
  status: "pending" | "accepted" | "declined";
}
export interface MatchCandidate {
  worker: WorkerProfile;
  eta: number;
  quality: number;
  acceptance: number;
  completion: number;
  score: number;
  components: Record<string, number>;
}
export interface MatchResult {
  jobId: string;
  candidate?: MatchCandidate;
  waves: number;
  reason: "accepted" | "expired" | "cancelled";
  offers: JobOffer[];
}
export interface Review {
  id: string;
  jobId: string;
  workerId: string;
  overall: number;
  quality: number;
  communication: number;
  punctuality: number;
  tags: string[];
  note: string;
}
export interface Payment {
  id: string;
  jobId: string;
  amount: number;
  tip: number;
  fee: number;
  state: "authorized" | "captured" | "refunded" | "failed";
  mode: "demo" | "live";
}
export interface Payout {
  id: string;
  paymentId: string;
  amount: number;
  status: "scheduled" | "paid";
}
export interface Message {
  id: string;
  jobId: string;
  sender: "customer" | "worker" | "system";
  text: string;
  photo?: string;
  createdAt: string;
  state: "sending" | "sent" | "failed";
}
export interface PricingEstimate {
  low: number;
  high: number;
  recommended: number;
  probability: number;
  eligible: number;
  minutes: string;
  tier: string;
}
export interface MatchingEstimate {
  stage: string;
  eligible: number;
  wave: number;
  probability: number;
}
export const taxonomy: Record<Category, Skill[]> = {
  Plumbing: ["plumbing.leak", "plumbing.drain"],
  Electrical: ["electrical.fixture"],
  Assembly: ["assembly.furniture"],
  Mounting: ["mounting.tv"],
  Appliances: ["appliances.repair"],
  Painting: ["painting.interior"],
  HVAC: ["hvac.service"],
  Carpentry: ["carpentry.repair"],
  "General repair": ["general.repair"],
  Moving: ["moving.help"],
  Outdoor: ["outdoor.help"],
  Other: ["other.help"],
};
export const categories = Object.keys(taxonomy) as Category[];
