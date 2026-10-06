import { db, rpc } from "./server.ts";
// Includes unregistered/orphaned uploads, not only photo metadata rows.
export async function eraseMediaAndAuth(actor: string): Promise<boolean> {
  const photos = await rpc<{ name: string }[]>("account_media_batch", {
    p_actor: actor,
  });
  if (photos.length) {
    const paths = photos.map((photo) => photo.name);
    const { error } = await db.storage.from("job-photos").remove(paths);
    if (error) throw error;
    const removed = await db
      .from("job_photos")
      .delete()
      .eq("owner_id", actor)
      .in("storage_path", paths);
    if (removed.error) throw removed.error;
    if (photos.length === 100) return false;
  }
  if (await rpc<boolean>("account_media_pending", { p_actor: actor }))
    return false;
  const current = await db.auth.admin.getUserById(actor);
  if (current.error?.status === 404) {
    await rpc("finish_media_erasure", { p_actor: actor });
    return true;
  }
  if (current.error) throw current.error;
  const removed = await db.auth.admin.deleteUser(actor);
  if (removed.error) throw removed.error;
  await rpc("finish_media_erasure", { p_actor: actor });
  return true;
}
