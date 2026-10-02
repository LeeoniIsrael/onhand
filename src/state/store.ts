import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Address,
  CounterOffer,
  Job,
  JobStatus,
  Message,
  Payment,
  Review,
  Role,
  Skill,
} from "../domain/models";
import { home, makeDraft, pastJobs, workers } from "../domain/seed";
import { simulatedRouting } from "../domain/marketplace";
import { transition } from "../domain/lifecycle";
import { analytics, demoPayments } from "../services/adapters";
interface AppState {
  role: Role;
  paymentMethod: string;
  workerSkills: Skill[];
  declinedOffers: string[];
  reports: { id: string; jobId?: string; body: string }[];
  setPaymentMethod: (method: string) => void;
  setWorkerSkills: (skills: Skill[]) => void;
  declineOffer: (id: string, reason: string) => void;
  report: (body: string, jobId?: string) => void;
  name: string;
  onboarded: boolean;
  available: boolean;
  notifications: boolean;
  reducedMotion: boolean;
  draft: Job;
  jobs: Job[];
  activeId?: string;
  messages: Message[];
  payments: Payment[];
  reviews: Review[];
  addresses: Address[];
  blocked: string[];
  counter?: CounterOffer;
  toast?: string;
  setRole: (role: Role) => void;
  updateProfile: (name: string) => void;
  setOnboarded: () => void;
  setAvailable: (value: boolean) => void;
  setting: (key: "notifications" | "reducedMotion", value: boolean) => void;
  notify: (text: string) => void;
  clearToast: () => void;
  resetDraft: () => void;
  editDraft: (patch: Partial<Job>) => void;
  submit: () => string;
  advance: (id: string, next: JobStatus) => void;
  match: (id: string, workerId: string, eta: number) => Promise<void>;
  complete: (id: string, tip: number) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, state: Message["state"]) => void;
  review: (review: Review) => void;
  saveAddress: (address: Address) => void;
  block: (id: string) => void;
  setCounter: (counter?: CounterOffer) => void;
  acceptWorkerJob: (job: Job) => Promise<void>;
  resetDemo: () => void;
}
export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      role: "customer",
      paymentMethod: "Visa",
      workerSkills: workers[0].skills.map((s) => s.skill),
      declinedOffers: [],
      reports: [],
      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
      setWorkerSkills: (workerSkills) => set({ workerSkills }),
      declineOffer: (id, reason) => {
        set((s) => ({
          declinedOffers: [...new Set([...s.declinedOffers, id])],
        }));
        get().notify(`Offer declined: ${reason}.`);
      },
      report: (body, jobId) =>
        set((s) => ({
          reports: [...s.reports, { id: `report-${Date.now()}`, jobId, body }],
        })),
      name: "Alex",
      onboarded: false,
      available: true,
      notifications: true,
      reducedMotion: false,
      draft: makeDraft(),
      jobs: pastJobs,
      messages: [],
      payments: [],
      reviews: [],
      addresses: [home],
      blocked: [],
      setRole: (role) => set({ role }),
      updateProfile: (name) => set({ name }),
      setOnboarded: () => set({ onboarded: true }),
      setAvailable: (available) => set({ available }),
      setting: (key, value) => set({ [key]: value }),
      notify: (toast) => set({ toast }),
      clearToast: () => set({ toast: undefined }),
      resetDraft: () => {
        set({ draft: { ...makeDraft(), address: get().draft.address } });
        analytics.track("request_created");
      },
      editDraft: (patch) =>
        set((s) => ({
          draft: {
            ...s.draft,
            ...patch,
            status: s.draft.status,
            id: s.draft.id,
          },
        })),
      submit: () => {
        const d = get().draft;
        if (get().jobs.some((j) => j.id === d.id)) return d.id;
        if (!d.title.trim() || !d.address.street.trim())
          throw new Error("Add a title and address first.");
        if (
          d.urgency === "scheduled" &&
          (!d.scheduledAt ||
            !Number.isFinite(Date.parse(d.scheduledAt)) ||
            new Date(d.scheduledAt) <= new Date())
        )
          throw new Error("Choose a future appointment.");
        let job = transition(d, "pricing");
        job = transition(job, "requested");
        job = transition(job, "matching");
        set((s) => ({ jobs: [job, ...s.jobs], activeId: job.id }));
        analytics.track("request_submitted", { offer: job.offer });
        return job.id;
      },
      advance: (id, next) => {
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === id ? transition(j, next) : j)),
        }));
        if (next === "worker_arrived") analytics.track("worker_arrived");
        if (next === "in_progress") analytics.track("job_started");
        if (next === "awaiting_completion_confirmation")
          analytics.track("job_completed");
      },
      match: async (id, workerId, eta) => {
        const job = get().jobs.find((j) => j.id === id);
        if (!job || !["matching", "offered"].includes(job.status)) return;
        const payment = await demoPayments.authorize(job);
        set((s) => {
          const current = s.jobs.find((j) => j.id === id);
          if (!current || !["matching", "offered"].includes(current.status))
            return s;
          const offered =
            current.status === "matching"
              ? transition(current, "offered")
              : current;
          const matched = transition(offered, "matched");
          return {
            jobs: s.jobs.map((j) =>
              j.id === id
                ? { ...matched, workerId, eta, paymentId: payment.id }
                : j,
            ),
            payments: [...s.payments.filter((p) => p.jobId !== id), payment],
          };
        });
        analytics.track("match_completed");
      },
      complete: async (id, tip) => {
        const job = get().jobs.find((j) => j.id === id),
          payment = get().payments.find((p) => p.jobId === id);
        if (!job || !payment)
          throw new Error("Payment authorization is missing.");
        if (!Number.isFinite(tip) || tip < 0 || tip > 1000)
          throw new Error("Enter a tip from $0 to $1,000.");
        if (job.status === "completed") return;
        const captured = await demoPayments.capture({ ...job, tip }, payment);
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id && j.status === "awaiting_completion_confirmation"
              ? transition({ ...j, tip }, "completed")
              : j,
          ),
          payments: s.payments.map((p) =>
            p.id === captured.id ? captured : p,
          ),
        }));
        analytics.track("payment_confirmed", { amount: captured.amount + tip });
      },
      addMessage: (message) =>
        set((s) => ({
          messages: s.messages.some((m) => m.id === message.id)
            ? s.messages
            : [...s.messages, message],
        })),
      updateMessage: (id, state) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, state } : m)),
        })),
      review: (review) => {
        set((s) => ({
          reviews: [
            ...s.reviews.filter((r) => r.jobId !== review.jobId),
            review,
          ],
        }));
        analytics.track("review_submitted");
      },
      saveAddress: (address) =>
        set((s) => ({
          addresses: [
            ...s.addresses.filter((a) => a.id !== address.id),
            address,
          ],
        })),
      block: (id) =>
        set((s) => ({
          blocked: s.blocked.includes(id) ? s.blocked : [...s.blocked, id],
        })),
      setCounter: (counter) => set({ counter }),
      acceptWorkerJob: async (job) => {
        if (
          !get().available ||
          !get().workerSkills.includes(job.skill) ||
          get().declinedOffers.includes(job.id)
        )
          throw new Error("This offer is no longer eligible for your account.");
        if (get().jobs.some((j) => j.id === job.id))
          throw new Error("This offer is already closed.");
        if (
          get().jobs.some(
            (j) =>
              j.workerId === "worker-0" &&
              !["completed", "cancelled", "disputed"].includes(j.status),
          )
        )
          throw new Error("Finish your current job before accepting another.");
        const matched = transition(job, "matched");
        const payment = await demoPayments.authorize(job);
        set((s) => ({
          jobs: [
            {
              ...matched,
              workerId: "worker-0",
              eta: simulatedRouting.estimate(
                workers[0],
                job.address.coordinates,
              ),
              paymentId: payment.id,
            },
            ...s.jobs.filter((j) => j.id !== job.id),
          ],
          payments: [...s.payments.filter((p) => p.jobId !== job.id), payment],
          activeId: job.id,
        }));
      },
      resetDemo: () =>
        set({
          role: "customer",
          paymentMethod: "Visa",
          workerSkills: workers[0].skills.map((s) => s.skill),
          declinedOffers: [],
          reports: [],
          draft: makeDraft(),
          jobs: pastJobs,
          activeId: undefined,
          payments: [],
          messages: [],
          reviews: [],
          blocked: [],
          counter: undefined,
          available: true,
        }),
    }),
    {
      name: "onhand-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ toast: _toast, ...state }) => state,
    },
  ),
);
