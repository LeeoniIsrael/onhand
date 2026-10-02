import {
  AnalyticsAdapter,
  ClassificationService,
  LiveActivityService,
  MessagingService,
  PaymentService,
} from "./contracts";
import { Message } from "../domain/models";
export const telemetryBuffer: {
  event: string;
  properties?: Record<string, string | number | boolean>;
  at: number;
}[] = [];
export const analytics: AnalyticsAdapter = {
  track(event, properties) {
    telemetryBuffer.push({ event, properties, at: Date.now() });
    if (telemetryBuffer.length > 300) telemetryBuffer.shift();
  },
};
export const classifier: ClassificationService = {
  async analyze(_photos, description) {
    await new Promise((r) => setTimeout(r, 1600));
    const electrical = /light|outlet|switch|electric/i.test(description);
    const assembly = /desk|chair|assembl|furniture/i.test(description);
    return electrical
      ? {
          category: "Electrical",
          title: "Light fixture repair",
          description:
            "We think this may be a fixture or connection issue. A qualified specialist should confirm.",
          confidence: 0.7,
          duration: 60,
        }
      : assembly
        ? {
            category: "Assembly",
            title: "Furniture assembly",
            description:
              "A specialist can help put everything together. Confirm the furniture and model.",
            confidence: 0.8,
            duration: 60,
          }
        : {
            category: "Plumbing",
            title: "Leaking kitchen sink",
            description:
              "We think this may be a loose or damaged drain connection. A specialist should confirm on arrival.",
            confidence: 0.76,
            duration: 45,
          };
  },
};
export const demoPayments: PaymentService = {
  async authorize(job) {
    if (job.offer <= 0) throw new Error("Choose a valid offer.");
    return {
      id: `demo-payment-${job.id}`,
      jobId: job.id,
      amount: job.offer,
      tip: job.tip,
      fee: Math.round(job.offer * 0.15 * 100) / 100,
      state: "authorized",
      mode: "demo",
    };
  },
  async capture(job, payment) {
    if (payment.state === "captured") return payment;
    if (
      job.status !== "awaiting_completion_confirmation" ||
      payment.state !== "authorized"
    )
      throw new Error("This job is not ready for payment.");
    if (payment.amount !== job.offer)
      throw new Error("The revised amount needs your approval.");
    return { ...payment, tip: job.tip, state: "captured" };
  },
  async refund(payment) {
    if (payment.state !== "captured")
      throw new Error("Only captured payments can be refunded.");
    return { ...payment, state: "refunded" };
  },
};
const listeners = new Map<string, Set<(m: Message) => void>>();
export const demoMessaging: MessagingService = {
  async send(message) {
    await new Promise((r) => setTimeout(r, 350));
    const sent: Message = { ...message, state: "sent" };
    listeners.get(message.jobId)?.forEach((fn) => fn(sent));
    return sent;
  },
  subscribe(id, listener) {
    const set = listeners.get(id) ?? new Set();
    set.add(listener);
    listeners.set(id, set);
    return () => {
      set.delete(listener);
      if (!set.size) listeners.delete(id);
    };
  },
};
export const demoLiveActivity: LiveActivityService = {
  async update() {},
  async end() {},
};
