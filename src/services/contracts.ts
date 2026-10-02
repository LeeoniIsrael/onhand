import {
  Job,
  JobPhoto,
  Message,
  Payment,
  WorkerProfile,
} from "../domain/models";
export interface PhotoAnalysis {
  category: Job["category"];
  title: string;
  description: string;
  confidence: number;
  duration: number;
}
export interface ClassificationService {
  analyze(photos: JobPhoto[], description: string): Promise<PhotoAnalysis>;
}
export interface PaymentService {
  authorize(job: Job): Promise<Payment>;
  capture(job: Job, payment: Payment): Promise<Payment>;
  refund(payment: Payment): Promise<Payment>;
}
export interface MessagingService {
  send(message: Message): Promise<Message>;
  subscribe(jobId: string, listener: (message: Message) => void): () => void;
}
export interface LiveActivityService {
  update(job: Job, worker?: WorkerProfile): Promise<void>;
  end(jobId: string): Promise<void>;
}
export type TelemetryEvent =
  | "request_created"
  | "pricing_slider_changed"
  | "request_submitted"
  | "matching_started"
  | "candidate_generated"
  | "offer_sent"
  | "offer_accepted"
  | "match_completed"
  | "worker_arrived"
  | "job_started"
  | "job_completed"
  | "payment_confirmed"
  | "review_submitted";
export interface AnalyticsAdapter {
  track(
    event: TelemetryEvent,
    properties?: Record<string, string | number | boolean>,
  ): void;
}
