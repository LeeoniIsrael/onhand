import { imageSize } from "npm:image-size@2.0.4";
import {
  authenticate,
  db,
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
    const job = request.headers.get("x-job-id");
    const key = request.headers.get("x-photo-id");
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!job || !key || !uuid.test(job) || !uuid.test(key))
      throw new Error("Job and photo identifiers are required");
    if (Number(request.headers.get("content-length") || 0) > 8388608)
      return reply(request, { error: "Image is too large" }, 413);
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Image is required");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8388608) {
        await reader.cancel();
        return reply(request, { error: "Image is too large" }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const dimensions = imageSize(bytes);
    const mime = (
      { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<
        string,
        string
      >
    )[dimensions.type as string];
    if (
      !mime ||
      mime !== request.headers.get("content-type") ||
      !dimensions.width ||
      !dimensions.height ||
      Math.max(dimensions.width, dimensions.height) > 1600
    )
      throw new Error(
        "Choose a JPEG, PNG or WebP image resized to 1600 pixels or less",
      );
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hash = Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const plan = await rpc<{ path: string; state: string }>("reserve_media", {
      p_actor: actor.id,
      p_job: job,
      p_key: key,
      p_mime: mime,
      p_bytes: size,
      p_hash: hash,
    });
    if (plan.state !== "uploaded") {
      const uploaded = await db.storage
        .from("job-photos")
        .upload(plan.path, bytes, {
          contentType: mime,
          upsert: false,
          cacheControl: "300",
        });
      if (
        uploaded.error &&
        !/already exists|duplicate/i.test(uploaded.error.message)
      )
        throw uploaded.error;
      if (
        !(await rpc<boolean>("confirm_media", {
          p_actor: actor.id,
          p_key: key,
        }))
      ) {
        await db.storage.from("job-photos").remove([plan.path]);
        throw new Error("Account unavailable");
      }
    }
    return reply(request, { path: plan.path });
  } catch (error) {
    const message = publicError(error);
    return reply(
      request,
      { error: message },
      message === "Authentication required" ? 401 : 409,
    );
  }
});
