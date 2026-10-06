create table private.payment_operations(job_id uuid references public.jobs(id),action text not null,operation_id uuid not null default gen_random_uuid(),state text not null default 'pending',provider_id text,provider_url text,expires_at timestamptz,updated_at timestamptz not null default now(),primary key(job_id,action));
create function public.payment_plan(p_actor uuid,p_job uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs; p public.payments; op private.payment_operations; w public.workers;
begin
 select * into j from public.jobs where id=p_job and customer_id=p_actor for update;
 if not found then raise exception 'Job not found' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_actor and deleted_at is null and role='customer') then raise exception 'Account unavailable'; end if;
 perform private.throttle(p_actor,'payment',10);
 select * into p from public.payments where job_id=j.id;
 select * into w from public.workers where id=j.worker_id;
 if p_action in ('authorize','checkout') then
  if j.status<>'matched' then raise exception 'A match is required'; end if;
  if j.scheduled_at>now()+interval '24 hours' then raise exception 'Authorize payment within 24 hours of the appointment'; end if;
  if w.stripe_account_id is null then raise exception 'Worker payouts are not configured'; end if;
  if p.id is not null and p.state in ('failed','cancelled','refunded') then raise exception 'Contact support to restart this payment'; end if;
  -- Do not create separate web/native authorizations for one job.
  if exists(select 1 from private.payment_operations where job_id=j.id and action in ('authorize','checkout') and action<>p_action and state<>'failed') then raise exception 'Continue payment on the device where you started it'; end if;
 elsif p_action='capture' then
  if j.status<>'awaiting_completion_confirmation' or j.payment_approved_at is null or p.state<>'authorized' or p.amount_cents<>j.offer_cents then raise exception 'Customer completion approval and an authorized payment are required'; end if;
 elsif p_action='cancel' then
  if j.status<>'cancelled' then raise exception 'Cancel the job first'; end if;
 else raise exception 'Unsupported payment action'; end if;
 insert into private.payment_operations(job_id,action) values(j.id,p_action) on conflict do nothing;
 select * into op from private.payment_operations where job_id=j.id and action=p_action;
 return jsonb_build_object('job',to_jsonb(j),'payment',to_jsonb(p),'operation',to_jsonb(op),'destination',w.stripe_account_id,'fee_cents',round(j.offer_cents*0.15));
end $$;
create function public.record_payment_operation(p_job uuid,p_action text,p_provider_id text,p_url text default null,p_expires timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.payment_operations set provider_id=p_provider_id,provider_url=p_url,expires_at=p_expires,updated_at=now() where job_id=p_job and action=p_action;
end $$;
create function public.record_payment(p_job uuid,p_intent text,p_amount integer,p_currency text,p_state text) returns void language plpgsql security definer set search_path='' as $$
declare j public.jobs;
begin
 select * into j from public.jobs where id=p_job for update;
 if not found or j.worker_id is null or j.offer_cents<>p_amount or p_currency<>'usd' or p_state not in ('pending','authorized') then raise exception 'Payment details do not match the agreement'; end if;
 insert into public.payments(job_id,stripe_intent_id,amount_cents,fee_cents,state) values(j.id,p_intent,p_amount,round(p_amount*0.15),p_state) on conflict(job_id) do nothing;
 if not exists(select 1 from public.payments where job_id=j.id and stripe_intent_id=p_intent and amount_cents=p_amount) then raise exception 'A different payment exists'; end if;
end $$;
create or replace function public.apply_stripe_event(p_event text,p_type text,p_intent text,p_amount integer,p_state text) returns void language plpgsql security definer set search_path='' as $$
declare p public.payments; j public.jobs;
begin
 if p_state not in ('authorized','captured','failed','cancelled','refunded') then raise exception 'Invalid payment state'; end if;
 select * into p from public.payments where stripe_intent_id=p_intent;
 if not found then raise exception 'Payment not yet recorded'; end if;
 -- All financial workflows lock job first, then payment: consistent lock order.
 select * into j from public.jobs where id=p.job_id for update;
 select * into p from public.payments where id=p.id for update;
 if p.amount_cents<>p_amount then raise exception 'Amount mismatch'; end if;
 insert into public.stripe_events(id,type) values(p_event,p_type) on conflict do nothing;
 if not found then return; end if;
 if p.state='refunded' or (p.state='captured' and p_state<>'refunded') or (p.state='cancelled' and p_state in ('failed','authorized')) or (p.state='authorized' and p_state='failed') then return; end if;
 if p_state='captured' and (j.status<>'awaiting_completion_confirmation' or j.payment_approved_at is null) then raise exception 'Capture needs explicit customer approval'; end if;
 update public.payments set state=p_state,updated_at=now() where id=p.id;
 if p_state='captured' then
  update public.jobs set status='completed' where id=j.id;
  insert into public.payouts(payment_id,worker_id,amount_cents,state) values(p.id,j.worker_id,p.amount_cents-p.fee_cents,'scheduled');
  update public.workers set completed_count=completed_count+1,available=false where id=j.worker_id;
  update private.outbox set state='done' where topic='capture_payment' and aggregate_id=j.id;
 elsif p_state='cancelled' then
  update private.outbox set state='done' where topic='cancel_payment' and aggregate_id=j.id;
 elsif p_state='refunded' then
  if j.status='completed' then update public.jobs set status='disputed' where id=j.id; end if;
 end if;
end $$;
create function public.claim_outbox(p_limit integer default 20) returns setof private.outbox language sql security definer set search_path='' as $$
 update private.outbox set state='processing',locked_at=now(),attempts=attempts+1
 where id in (select id from private.outbox where (state='pending' and available_at<=now() or state='processing' and locked_at<now()-interval '5 minutes') and attempts<12 order by available_at limit greatest(1,least(p_limit,50)) for update skip locked) returning *;
$$;
create function public.finish_outbox(p_id uuid,p_error text default null) returns void language sql security definer set search_path='' as $$
 update private.outbox set state=case when p_error is null then 'done' when attempts>=12 then 'failed' else 'pending' end,last_error=left(p_error,500),available_at=now()+make_interval(secs=>least(3600,power(2,attempts)::integer*10)) where id=p_id;
$$;
create function public.erase_account(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=p_actor and deleted_at is null for update;
 if not found then return; end if;
 if exists(select 1 from public.jobs where (customer_id=p_actor or worker_id=p_actor) and status not in ('completed','cancelled')) then raise exception 'Finish active jobs and support cases before deleting your account'; end if;
 update public.profiles set display_name='Deleted account',deleted_at=now() where id=p_actor;
 update public.workers set bio='',available=false,account_standing='suspended' where id=p_actor;
 delete from public.worker_locations where worker_id=p_actor;
 delete from public.saved_addresses where owner_id=p_actor;
 delete from public.account_settings where id=p_actor;
 delete from public.blocked_pairs where customer_id=p_actor or worker_id=p_actor;
 update public.job_private set street='Removed',unit=null,city='Removed',access_instructions=null,position=extensions.st_setsrid(extensions.st_makepoint(0,0),4326)::extensions.geography where job_id in (select id from public.jobs where customer_id=p_actor);
 update public.messages set body='Message removed' where sender_id=p_actor;
 update public.reviews set note=null where customer_id=p_actor;
 insert into private.outbox(topic,aggregate_id,payload) values('delete_account_media',p_actor,jsonb_build_object('actor',p_actor)) on conflict do nothing;
end $$;
create function public.health_snapshot() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('dispatch_waiting',(select count(*) from public.jobs where status in ('matching','offered')),'outbox_failed',(select count(*) from private.outbox where state='failed'),'outbox_oldest_seconds',(select coalesce(extract(epoch from now()-min(created_at)),0) from private.outbox where state='pending'),'unapproved_workers',(select count(*) from public.workers where account_standing='pending'),'db_time',now());
$$;
revoke all on function public.payment_plan(uuid,uuid,text),public.record_payment_operation(uuid,text,text,text,timestamptz),public.record_payment(uuid,text,integer,text,text),public.claim_outbox(integer),public.finish_outbox(uuid,text),public.erase_account(uuid),public.health_snapshot() from public,anon,authenticated;
grant execute on function public.payment_plan(uuid,uuid,text),public.record_payment_operation(uuid,text,text,text,timestamptz),public.record_payment(uuid,text,integer,text,text),public.claim_outbox(integer),public.finish_outbox(uuid,text),public.erase_account(uuid),public.health_snapshot() to service_role;
alter publication supabase_realtime add table public.counter_offers,public.payments;
notify pgrst,'reload schema';
