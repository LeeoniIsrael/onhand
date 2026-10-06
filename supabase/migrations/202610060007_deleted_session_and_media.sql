-- Deleting Auth does not instantly invalidate an already issued JWT. Restrictive
-- policies reject deleted profiles even when that token has not expired.
create function public.is_active_actor() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and deleted_at is null);
$$;
revoke all on function public.is_active_actor() from public,anon;
grant execute on function public.is_active_actor() to authenticated;
do $$ declare t record; begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity loop
  execute format('create policy active_account on public.%I as restrictive for all to authenticated using(public.is_active_actor()) with check(public.is_active_actor())',t.relname);
 end loop;
end $$;
-- Storage-owned tables cannot be altered by the ordinary project role. Their
-- existing policies call these application-owned predicates.
create or replace function public.is_job_participant(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_active_actor() and exists(select 1 from public.jobs where id=p_job and (customer_id=auth.uid() or worker_id=auth.uid()));
$$;
create or replace function public.can_read_job_private(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_active_actor() and exists(select 1 from public.jobs where id=p_job and (customer_id=auth.uid() or worker_id=auth.uid() and status<>'cancelled'));
$$;
create function public.account_media_batch(p_actor uuid) returns table(name text) language sql stable security definer set search_path='' as $$
 select o.name from storage.objects o join public.profiles p on p.id=p_actor and p.deleted_at is not null where o.bucket_id='job-photos' and o.owner_id=p_actor::text order by o.name limit 100;
$$;
revoke all on function public.account_media_batch(uuid) from public,anon,authenticated;
grant execute on function public.account_media_batch(uuid) to service_role;
notify pgrst,'reload schema';
