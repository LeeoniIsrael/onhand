import { randomUUID } from "expo-crypto";
import { requireDatabase } from "../services/supabase";
import type { HomeData, JobData } from "./types";
export function requestKey() {
  return randomUUID();
}
export function friendlyError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Something went wrong. Try again.";
  if (/network|fetch|connection|timeout/i.test(message))
    return "Connection interrupted. Check your connection, then try again.";
  if (/duplicate key.*reviews/i.test(message))
    return "You have already reviewed this job.";
  if (
    /violates|invalid input|syntax|relation|constraint|permission denied/i.test(
      message,
    )
  )
    return "This request could not be saved. Refresh and check the details.";
  return message;
}
async function rpc<T>(
  name: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await requireDatabase().rpc(name, params);
  if (error) throw new Error(friendlyError(error));
  return data as T;
}
export const marketplace = {
  home(before?: { created_at: string; id: string }) {
    return rpc<HomeData>("marketplace_home", {
      p_limit: 20,
      p_before: before?.created_at ?? null,
      p_before_id: before?.id ?? null,
    });
  },
  job(id: string, before?: { created_at: string; id: string }) {
    return rpc<JobData>("marketplace_job", {
      p_job: id,
      p_before: before?.created_at ?? null,
      p_before_id: before?.id ?? null,
    });
  },
  action<T = Record<string, unknown>>(
    action: string,
    payload: Record<string, unknown>,
    key = requestKey(),
  ) {
    return rpc<T>("marketplace_action", {
      p_action: action,
      p_payload: payload,
      p_key: key,
    });
  },
  async payment(jobId: string, action: "authorize" | "capture" | "cancel") {
    const { data, error } = await requireDatabase().functions.invoke(
      "payments",
      { body: { jobId, action } },
    );
    if (error) {
      let detail = "Payment could not be processed. Try again.";
      try {
        const body = await error.context?.json();
        detail = body?.error || detail;
      } catch {}
      throw new Error(detail);
    }
    return data as { clientSecret?: string; status?: string; mode?: string };
  },
  async deleteAccount() {
    const { data, error } = await requireDatabase().functions.invoke(
      "account",
      { body: { action: "delete" } },
    );
    if (error)
      throw new Error(
        "Your account could not be deleted. Finish active jobs and try again.",
      );
    return data;
  },
};
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
