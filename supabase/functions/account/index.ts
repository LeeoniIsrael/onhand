import {
  authenticate,
  db,
  payload,
  preflight,
  publicError,
  reply,
  rpc,
} from "../_shared/server.ts";
Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;
  try {
    const actor = await authenticate(request);
    const body = await payload(request);
    if (body.action !== "delete")
      return reply(request, { error: "Unsupported action" }, 400);
    await rpc("account_deletion_ready", { p_actor: actor.id });
    await rpc("clear_account_devices", { p_actor: actor.id });
    await rpc("erase_account", { p_actor: actor.id });
    const { error } = await db.auth.admin.deleteUser(actor.id);
    if (error) throw error;
    return reply(request, { deleted: true });
  } catch (error) {
    const message = publicError(error);
    return reply(
      request,
      { error: message },
      message === "Authentication required" ? 401 : 409,
    );
  }
});
