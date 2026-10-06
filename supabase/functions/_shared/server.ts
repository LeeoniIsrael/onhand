import { createClient } from "npm:@supabase/supabase-js@2.117.2";
export const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            AbortSignal.timeout(30000),
          ]),
        }),
    },
  },
);
export const localTests =
  Deno.env.get("ONHAND_LOCAL_TESTS") === "true" &&
  ["localhost", "127.0.0.1", "kong", "host.docker.internal"].includes(
    new URL(Deno.env.get("SUPABASE_URL")!).hostname,
  );
export function headers(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = Deno.env.get("APP_ORIGIN");
  const accepted =
    origin &&
    (origin === allowed ||
      (localTests && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)));
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": accepted ? origin! : "null",
    "Access-Control-Allow-Headers":
      "authorization, content-type, apikey, x-client-info, x-job-id, x-photo-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
export function reply(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers(request),
  });
}
export async function authenticate(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new Error("Authentication required");
  const { data, error } = await db.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new Error("Authentication required");
  try {
    const claims = JSON.parse(
      atob(
        authorization
          .slice(7)
          .split(".")[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/"),
      ),
    );
    if (
      !claims.session_id ||
      !(await rpc<boolean>("valid_actor_session", {
        p_actor: data.user.id,
        p_session: claims.session_id,
      }))
    )
      throw new Error("Authentication required");
  } catch {
    throw new Error("Authentication required");
  }
  return data.user;
}
export async function payload(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 16384)
    throw new Error("Request too large");
  const text = await request.text();
  if (text.length > 16384) throw new Error("Request too large");
  return JSON.parse(text) as Record<string, unknown>;
}
export function preflight(request: Request) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: headers(request) });
  if (request.method !== "POST")
    return reply(request, { error: "Method not allowed" }, 405);
  const origin = request.headers.get("origin");
  if (origin && headers(request)["Access-Control-Allow-Origin"] === "null")
    return reply(request, { error: "Origin unavailable" }, 403);
  return null;
}
export async function rpc<T = Record<string, unknown>>(
  name: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.rpc(name, params);
  if (error) throw new Error(error.message);
  return data as T;
}
export function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  if (/violates|invalid input|permission denied|syntax error/i.test(message))
    return "This request could not be processed. Refresh and try again.";
  if (
    /required|approve|approval|match|unavailable|configured|Authorize|Cancel|Finish|different payment|restart this payment|device where|Too many|amount|agreement|Account/i.test(
      message,
    )
  )
    return message;
  return "This request could not be processed. Retry or contact support.";
}
