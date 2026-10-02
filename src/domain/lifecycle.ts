import { Job, JobStatus } from "./models";
const transitions: Record<JobStatus, JobStatus[]> = {
  draft: ["pricing", "cancelled"],
  pricing: ["draft", "requested", "cancelled"],
  requested: ["matching", "cancelled"],
  matching: ["offered", "cancelled"],
  offered: ["matched", "matching", "cancelled"],
  matched: ["worker_en_route", "cancelled"],
  worker_en_route: ["worker_arrived", "cancelled"],
  worker_arrived: ["in_progress", "cancelled"],
  in_progress: ["awaiting_completion_confirmation", "disputed"],
  awaiting_completion_confirmation: ["completed", "disputed"],
  completed: ["disputed"],
  cancelled: [],
  disputed: ["completed", "cancelled"],
};
export function transition(job: Job, next: JobStatus): Job {
  if (!transitions[job.status].includes(next))
    throw new Error(`Cannot move a ${job.status} job to ${next}.`);
  return { ...job, status: next };
}
export const statusLabel: Record<JobStatus, string> = {
  draft: "Draft",
  pricing: "Set your price",
  requested: "Requested",
  matching: "Finding your specialist",
  offered: "Checking availability",
  matched: "Match found",
  worker_en_route: "On the way",
  worker_arrived: "At your door",
  in_progress: "Getting it fixed",
  awaiting_completion_confirmation: "Ready for your approval",
  completed: "All fixed",
  cancelled: "Cancelled",
  disputed: "Under review",
};
