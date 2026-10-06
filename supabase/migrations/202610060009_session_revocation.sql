-- Access JWTs can remain cryptographically valid after logout. Require their
-- actual Auth session to exist, as well as an active application profile.
create function public.valid_actor_session(p_actor uuid,p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join public.profiles p on p.id=s.user_id where s.id=p_session and s.user_id=p_actor and p.deleted_at is null and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function public.valid_actor_session(uuid,uuid) from public,anon,authenticated;
grant execute on function public.valid_actor_session(uuid,uuid) to service_role;
create or replace function public.is_active_actor() returns boolean language sql stable security definer set search_path='' as $$
 select public.valid_actor_session(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
$$;
create or replace function private.require_actor(p_role text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); r text;
begin
 if a is null or not public.is_active_actor() then raise exception 'Sign in to continue' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text,0));
 select role into r from public.profiles where id=a and deleted_at is null;
 if r is null then raise exception 'Sign in to continue' using errcode='42501'; end if;
 if p_role is not null and r<>p_role then raise exception 'This action is unavailable for your account' using errcode='42501'; end if;
 return a;
end $$;
create index review_rating_aggregation on public.reviews(worker_id) include(overall);
create index job_worker_history on public.jobs(worker_id,created_at desc,id desc);
create index job_customer_history on public.jobs(customer_id,created_at desc,id desc);
create index message_history_cursor on public.messages(job_id,created_at desc,id desc);
revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
