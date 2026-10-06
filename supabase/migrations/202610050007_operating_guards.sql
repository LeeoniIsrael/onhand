-- Coalesce message notifications per conversation and recipient rather than queuing every keystroke/message.
create or replace function private.notify_message() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; notification uuid;
begin
 select case when customer_id=new.sender_id then worker_id else customer_id end into recipient from public.jobs where id=new.job_id;
 if recipient is not null then
  notification:=md5(new.job_id::text||recipient::text)::uuid;
  insert into private.outbox(topic,aggregate_id,payload,available_at) values('message_notification',notification,jsonb_build_object('actor',recipient,'job_id',new.job_id),now()+interval '5 seconds')
  on conflict(topic,aggregate_id) do update set payload=excluded.payload,state='pending',attempts=0,available_at=greatest(private.outbox.available_at,now()+interval '5 seconds');
 end if;
 return new;
end $$;
create or replace function public.claim_outbox(p_limit integer default 50) returns setof private.outbox language sql security definer set search_path='' as $$
 update private.outbox set state='processing',locked_at=now(),attempts=attempts+1
 where id in (select id from private.outbox where (state='pending' and available_at<=now() or state='processing' and locked_at<now()-interval '2 minutes') and attempts<12
 order by case when topic in ('capture_payment','cancel_payment') then 0 when topic in ('offer_notification','job_matched') then 1 else 2 end,available_at
 limit greatest(1,least(p_limit,200)) for update skip locked) returning *;
$$;
create function private.guard_work() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('worker_en_route','in_progress') and old.status<>new.status then
  if not exists(select 1 from public.workers where id=new.worker_id and account_standing='good' and identity_verified and payouts_ready) then raise exception 'Worker verification or payouts need review'; end if;
  if new.requires_license and not exists(select 1 from public.licenses where worker_id=new.worker_id and skill=new.skill and jurisdiction=new.approximate_zone and verified and expires_at>greatest(coalesce(new.scheduled_at,now()),now())+make_interval(mins=>new.duration_minutes)) then raise exception 'Worker credentials need to be renewed before work starts'; end if;
 end if;
 return new;
end $$;
create trigger credential_guard before update on public.jobs for each row execute function private.guard_work();
-- Prevent captures against a stale completion approval snapshot.
create function private.guard_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare j public.jobs;
begin
 if new.state='captured' and old.state<>'captured' then
  select * into j from public.jobs where id=new.job_id;
  if j.payment_approved_at is null or j.approval_version<>j.version or j.offer_cents<>new.amount_cents then raise exception 'The approved agreement changed. Refresh and approve it again.'; end if;
 end if;
 return new;
end $$;
create trigger capture_guard before update on public.payments for each row execute function private.guard_capture();
-- Delete neither financial rows nor unresolved support evidence in routine maintenance.
create function public.cleanup_operations() returns void language sql security definer set search_path='' as $$
 delete from private.outbox where state='done' and created_at<now()-interval '30 days';
 delete from public.stripe_events where processed_at<now()-interval '180 days';
$$;
revoke all on function public.cleanup_operations() from public,anon,authenticated;
grant execute on function public.cleanup_operations() to service_role;
revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
