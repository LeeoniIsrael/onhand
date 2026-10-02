import {
  Coordinates,
  Job,
  JobOffer,
  MatchCandidate,
  MatchResult,
  PricingEstimate,
  WorkerProfile,
} from "./models";
export const clamp = (n: number, low = 0, high = 1) =>
  Math.max(low, Math.min(high, n));
export function qualityScore(
  worker: WorkerProfile,
  skill = worker.skills[0]?.skill,
) {
  const m = worker.metrics;
  const review = ((m.rating / 5) * m.reviews + 0.88 * 35) / (m.reviews + 35);
  const reliability =
    m.completion * 0.55 + m.punctuality * 0.25 + m.response * 0.2;
  const performance =
    m.durationAccuracy * 0.45 + m.repeat * 0.2 + m.recentQuality * 0.35;
  const confidence =
    worker.skills.find((s) => s.skill === skill)?.confidence ?? 0;
  const experience = 1 - Math.exp(-m.completed / 100);
  const penalty =
    m.cancellation * 0.15 +
    m.complaints * 0.3 +
    m.refunds * 0.15 +
    m.disputes * 0.3;
  return clamp(
    review * 0.3 +
      reliability * 0.3 +
      performance * 0.16 +
      confidence * 0.16 +
      experience * 0.08 -
      penalty,
  );
}
export function kilometers(a: Coordinates, b: Coordinates) {
  const rad = Math.PI / 180,
    dLat = (b.latitude - a.latitude) * rad,
    dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export interface RoutingProvider {
  estimate(worker: WorkerProfile, destination: Coordinates): number;
}
export const simulatedRouting: RoutingProvider = {
  estimate(w, destination) {
    const distance = kilometers(w.location, destination);
    const riverPenalty = w.location.longitude < -73.974 ? 8 : 0;
    return Math.max(
      3,
      Math.round(
        distance * 4.2 + 3 + riverPenalty + Math.abs(Math.sin(w.heading)) * 3,
      ),
    );
  },
};
export interface AcceptanceModel {
  predict(w: WorkerProfile, job: Job, eta: number): number;
}
export const heuristicAcceptance: AcceptanceModel = {
  predict(w, job, eta) {
    const effectiveHourly = job.offer / ((job.duration + eta) / 60);
    const priceSignal = (effectiveHourly - w.minimumPay * 1.7) / 27;
    const logit =
      priceSignal -
      eta / 24 -
      w.utilization * 0.7 +
      (w.metrics.acceptance - 0.7) * 2 +
      (job.urgency === "scheduled" ? 0.25 : 0) -
      0.3;
    return clamp(
      (1 / (1 + Math.exp(-logit))) * w.metrics.response * 0.72,
      0.015,
      0.92,
    );
  },
};
export function eligible(
  w: WorkerProfile,
  job: Job,
  blocked: string[] = [],
  now = new Date(),
) {
  return (
    w.available &&
    w.standing === "good" &&
    !blocked.includes(w.id) &&
    w.skills.some((s) => s.skill === job.skill && s.confidence >= 0.7) &&
    kilometers(w.location, job.address.coordinates) <= w.serviceRadiusKm &&
    job.offer >= w.minimumPay &&
    (!job.requiresLicense ||
      w.licenses.some(
        (l) =>
          l.skill === job.skill &&
          l.verified &&
          l.jurisdiction === "NY" &&
          new Date(l.expiresAt) > now,
      ))
  );
}
export function rankCandidates(
  job: Job,
  workers: WorkerProfile[],
  blocked: string[] = [],
  routing: RoutingProvider = simulatedRouting,
  acceptance: AcceptanceModel = heuristicAcceptance,
): MatchCandidate[] {
  return workers
    .filter((w) => eligible(w, job, blocked))
    .map((worker) => {
      const eta = routing.estimate(worker, job.address.coordinates),
        quality = qualityScore(worker, job.skill),
        accept = acceptance.predict(worker, job, eta);
      const components = {
        skill: worker.skills.find((s) => s.skill === job.skill)!.confidence,
        quality,
        acceptance: accept,
        completion: worker.metrics.completion,
        eta: Math.exp(-eta / 18),
        price: clamp(job.offer / (worker.minimumPay * 1.5)),
        history: worker.metrics.repeat,
        cancellation: worker.metrics.cancellation,
        complaint: worker.metrics.complaints,
      };
      const premium = job.offer > 160;
      const score =
        components.skill * 0.21 +
        quality * (premium ? 0.26 : 0.2) +
        accept * 0.19 +
        components.completion * 0.14 +
        components.eta * (premium ? 0.06 : 0.12) +
        components.price * 0.08 +
        components.history * 0.06 -
        components.cancellation * 0.18 -
        components.complaint * 0.22;
      return {
        worker,
        eta,
        quality,
        acceptance: accept,
        completion: worker.metrics.completion,
        score: clamp(score),
        components,
      };
    })
    .sort((a, b) => b.score - a.score);
}
export function pricing(
  job: Job,
  workers: WorkerProfile[],
  blocked: string[] = [],
): PricingEstimate {
  const candidates = rankCandidates(job, workers, blocked);
  const potential = workers.filter((w) =>
    eligible(w, { ...job, offer: 1000 }, blocked),
  );
  const supplyFactor = 1 + Math.max(0, 6 - potential.length) * 0.025;
  const urgencyFactor =
    job.urgency === "now" ? 1.1 : job.urgency === "today" ? 1 : 0.94;
  const durationFactor = Math.sqrt(job.duration / 45);
  const recommended =
    Math.round((132 * supplyFactor * urgencyFactor * durationFactor) / 5) * 5;
  // Independent conditional acceptance approximation; availability and shared market shocks are not calibrated.
  const probability = Math.min(
    0.98,
    1 -
      candidates.reduce(
        (p, c) =>
          p *
          (1 -
            c.acceptance * c.completion * (1 - c.worker.metrics.cancellation)),
        1,
      ),
  );
  return {
    low: Math.round((recommended * 0.88) / 5) * 5,
    high: Math.round((recommended * 1.14) / 5) * 5,
    recommended,
    probability,
    eligible: candidates.length,
    minutes:
      probability > 0.9
        ? "3–8 min"
        : probability > 0.65
          ? "8–15 min"
          : probability > 0.3
            ? "15–25 min"
            : "25+ min",
    tier:
      candidates.length &&
      candidates.slice(0, 3).reduce((n, c) => n + c.quality, 0) /
        Math.min(3, candidates.length) >
        0.88
        ? "Top-rated"
        : candidates.length
          ? "Qualified"
          : "Low availability",
  };
}
export interface MatchingStrategy {
  rank(
    job: Job,
    workers: WorkerProfile[],
    blocked?: string[],
  ): MatchCandidate[];
}
export const balancedStrategy: MatchingStrategy = { rank: rankCandidates };
export function allocateBatch(jobs: Job[], workers: WorkerProfile[]) {
  const used = new Set<string>();
  return [...jobs]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((job) => {
      const candidate = rankCandidates(job, workers).find(
        (c) => !used.has(c.worker.id),
      );
      if (candidate) used.add(candidate.worker.id);
      return { jobId: job.id, candidate };
    });
}
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("cancelled"));
    const cancel = () => {
      clearTimeout(timer);
      reject(new Error("cancelled"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal?.addEventListener("abort", cancel, { once: true });
  });
export async function dispatch(
  job: Job,
  workers: WorkerProfile[],
  options: {
    signal?: AbortSignal;
    blocked?: string[];
    delay?: number;
    random?: () => number;
    onStage: (stage: string, wave: number, count: number) => void;
    onOffer?: (offer: JobOffer) => void;
  },
): Promise<MatchResult> {
  const offers: JobOffer[] = [],
    delay = options.delay ?? 1200,
    random = options.random ?? Math.random;
  try {
    options.onStage("Finding nearby specialists", 0, 0);
    await wait(delay, options.signal);
    const ranked = balancedStrategy.rank(job, workers, options.blocked);
    options.onStage("Comparing arrival times", 0, ranked.length);
    await wait(delay, options.signal);
    // Reserve one first-wave slot for a qualified newcomer; no relaxation of hard constraints.
    const newcomer = ranked.find((c) => c.worker.metrics.completed < 15);
    if (newcomer && ranked.indexOf(newcomer) > 2) {
      ranked.splice(ranked.indexOf(newcomer), 1);
      ranked.splice(2, 0, newcomer);
    }
    for (let wave = 0; wave < 3; wave++) {
      const candidates = ranked.slice(
        wave === 0 ? 0 : wave === 1 ? 3 : 7,
        wave === 0 ? 3 : wave === 1 ? 7 : ranked.length,
      );
      options.onStage(
        [
          "Checking availability",
          "Reaching a few more specialists",
          "Widening the search",
        ][wave],
        wave + 1,
        ranked.length,
      );
      const sent = candidates.map((c) => ({
        id: `offer-${job.id}-${c.worker.id}`,
        jobId: job.id,
        workerId: c.worker.id,
        expiresAt: Date.now() + delay,
        status: "pending" as const,
        wave: wave + 1,
      }));
      offers.push(...sent);
      sent.forEach((o) => options.onOffer?.(o));
      await wait(delay, options.signal);
      const accepted = candidates.find((c) => random() < c.acceptance);
      sent.forEach((o) => {
        const stored = offers.find((v) => v.id === o.id)!;
        stored.status =
          o.workerId === accepted?.worker.id ? "accepted" : "expired";
      });
      if (accepted)
        return {
          jobId: job.id,
          candidate: accepted,
          waves: wave + 1,
          reason: "accepted",
          offers,
        };
    }
    return { jobId: job.id, waves: 3, reason: "expired", offers };
  } catch (error) {
    if (!options.signal?.aborted) throw error;
    return { jobId: job.id, reason: "cancelled", waves: 0, offers };
  }
}

export function availableMarketplace(
  workers: WorkerProfile[],
  jobs: Job[],
  excludingJobId?: string,
) {
  const occupied = new Set(
    jobs
      .filter(
        (j) =>
          j.id !== excludingJobId &&
          [
            "matched",
            "worker_en_route",
            "worker_arrived",
            "in_progress",
            "awaiting_completion_confirmation",
          ].includes(j.status),
      )
      .map((j) => j.workerId),
  );
  return workers.map((w) =>
    occupied.has(w.id) ? { ...w, available: false } : w,
  );
}
