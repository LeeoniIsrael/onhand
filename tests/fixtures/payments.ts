import type { PaymentService } from "../../src/services/contracts";
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
