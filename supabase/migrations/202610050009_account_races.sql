-- Serialize commands per account, not globally. Deletion cannot race a new job or message.
create or replace function private.require_actor(p_role text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); r text;
begin
 if a is null then raise exception 'Sign in to continue' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text,0));
 select role into r from public.profiles where id=a and deleted_at is null;
 if r is null then raise exception 'Sign in to continue' using errcode='42501'; end if;
 if p_role is not null and r<>p_role then raise exception 'This action is unavailable for your account' using errcode='42501'; end if;
 return a;
end $$;
create or replace function public.erase_account(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 perform 1 from public.profiles where id=p_actor and deleted_at is null for update;
 if not found then return; end if;
 if exists(select 1 from public.jobs where (customer_id=p_actor or worker_id=p_actor) and status not in ('completed','cancelled')) then raise exception 'Finish active jobs and support cases before deleting your account'; end if;
 update public.profiles set display_name='Deleted account',deleted_at=now() where id=p_actor;
 update public.workers set bio='',available=false,identity_verified=false,payouts_ready=false,account_standing='suspended' where id=p_actor;
 delete from public.worker_locations where worker_id=p_actor;
 delete from public.saved_addresses where owner_id=p_actor;
 delete from public.account_settings where id=p_actor;
 delete from public.blocked_pairs where customer_id=p_actor or worker_id=p_actor;
 update public.job_private set street='Removed',unit=null,city='Removed',access_instructions=null,position=extensions.st_setsrid(extensions.st_makepoint(0,0),4326)::extensions.geography where job_id in (select id from public.jobs where customer_id=p_actor);
 update public.messages set body='Message removed' where sender_id=p_actor;
 update public.reviews set note=null where customer_id=p_actor;
 insert into private.outbox(topic,aggregate_id,payload) values('delete_account_media',p_actor,jsonb_build_object('actor',p_actor)) on conflict do nothing;
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
