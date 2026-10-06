alter table public.payouts add column created_at timestamptz not null default now();
alter table public.payouts drop constraint payouts_state_check;
alter table public.payouts add constraint payouts_state_check check(state in ('scheduled','paid','failed','reversed'));
create table public.bank_payouts(id text primary key,worker_id uuid not null references public.workers(id),amount_cents integer not null,currency text not null,status text not null check(status in ('pending','in_transit','paid','failed','canceled')),arrival_at timestamptz,failure_code text,updated_at timestamptz not null default now());
alter table public.bank_payouts enable row level security;
revoke all on public.bank_payouts from anon,authenticated;
grant select on public.bank_payouts to authenticated;
create policy own_bank_payouts on public.bank_payouts for select to authenticated using(worker_id=auth.uid());
create function public.record_bank_payout(p_account text,p_id text,p_amount integer,p_currency text,p_status text,p_arrival timestamptz,p_failure text default null) returns void language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
 select id into w from public.workers where stripe_account_id=p_account;
 if w is null then return; end if;
 insert into public.bank_payouts(id,worker_id,amount_cents,currency,status,arrival_at,failure_code) values(p_id,w,p_amount,p_currency,p_status,p_arrival,p_failure)
 on conflict(id) do update set status=excluded.status,arrival_at=excluded.arrival_at,failure_code=excluded.failure_code,updated_at=now();
end $$;
create table private.support_audit(id uuid primary key default gen_random_uuid(),job_id uuid not null,note text not null,action text not null,at timestamptz not null default now());
create function public.resolve_dispute(p_job uuid,p_resolution text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare j public.jobs; p public.payments;
begin
 select * into j from public.jobs where id=p_job for update;
 select * into p from public.payments where job_id=p_job for update;
 if j.status<>'disputed' or char_length(trim(p_note)) not between 10 and 4000 then raise exception 'An open support case and resolution note are required'; end if;
 if p_resolution='completed' and p.state='captured' then update public.jobs set status='completed' where id=j.id;
 elsif p_resolution='cancelled' and p.state in ('refunded','cancelled','failed') then update public.jobs set status='cancelled' where id=j.id;
 else raise exception 'Resolution does not match the payment state'; end if;
 insert into private.support_audit(job_id,note,action) values(j.id,trim(p_note),p_resolution);
end $$;
create function public.open_dispute(p_job uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin
 if char_length(trim(p_note)) not between 10 and 4000 then raise exception 'Document the support investigation'; end if;
 update public.jobs set status='disputed' where id=p_job and status in ('in_progress','awaiting_completion_confirmation','completed');
 if not found then raise exception 'This job cannot be disputed'; end if;
 insert into private.support_audit(job_id,note,action) values(p_job,trim(p_note),'open_dispute');
end $$;
create or replace function public.record_full_refund(p_intent text,p_event text,p_amount integer) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.apply_stripe_event(p_event,'charge.refunded',p_intent,p_amount,'refunded');
 update public.payouts set state='reversed' where payment_id in (select id from public.payments where stripe_intent_id=p_intent and state='refunded');
end $$;
revoke all on function public.record_bank_payout(text,text,integer,text,text,timestamptz,text),public.resolve_dispute(uuid,text,text),public.open_dispute(uuid,text) from public,anon,authenticated;
grant execute on function public.record_bank_payout(text,text,integer,text,text,timestamptz,text),public.resolve_dispute(uuid,text,text),public.open_dispute(uuid,text) to service_role;
notify pgrst,'reload schema';
create or replace function public.payment_plan(p_actor uuid,p_job uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if j.status='completed' and p.state='captured' then return jsonb_build_object('job',to_jsonb(j),'payment',to_jsonb(p),'operation',jsonb_build_object('operation_id',p.id),'destination',w.stripe_account_id,'fee_cents',p.fee_cents);end if;
  if j.status<>'awaiting_completion_confirmation' or j.payment_approved_at is null or p.state<>'authorized' or p.amount_cents<>j.offer_cents then raise exception 'Customer completion approval and an authorized payment are required'; end if;
 elsif p_action='cancel' then
  if j.status<>'cancelled' then raise exception 'Cancel the job first'; end if;
 else raise exception 'Unsupported payment action'; end if;
 insert into private.payment_operations(job_id,action) values(j.id,p_action) on conflict do nothing;
 select * into op from private.payment_operations where job_id=j.id and action=p_action;
 return jsonb_build_object('job',to_jsonb(j),'payment',to_jsonb(p),'operation',to_jsonb(op),'destination',w.stripe_account_id,'fee_cents',round(j.offer_cents*0.15));
end $$;
create or replace function public.marketplace_home(p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.require_actor(); result jsonb; r text;
begin
 select role into r from public.profiles where id=a;
 select jsonb_build_object(
 'profile',(select to_jsonb(p) from public.profiles p where id=a),
 'settings',(select to_jsonb(s) from public.account_settings s where id=a),
 'addresses',coalesce((select jsonb_agg(to_jsonb(ad) order by ad.created_at) from public.saved_addresses ad where owner_id=a),'[]'),
 'worker',case when r='worker' then (select to_jsonb(w)-'stripe_account_id' from public.workers w where id=a) else null end,
 'skills',coalesce((select jsonb_agg(s.skill) from public.worker_skills s where worker_id=a),'[]'),
 'jobs',coalesce((select jsonb_agg(private.job_json(j,a) order by j.created_at desc,j.id desc) from
 (select * from public.jobs where (customer_id=a or worker_id=a) and (p_before is null or (created_at,id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) order by created_at desc,id desc limit greatest(1,least(40,p_limit))) j),'[]'),
 'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'expires_at',o.expires_at,'score',o.score,'eta_seconds',o.eta_seconds,'distance_m',o.distance_m,'reasons',o.reasons,'job',private.job_json(j,a)) order by o.score desc,o.id) from public.job_offers o join public.jobs j on j.id=o.job_id where o.worker_id=a and o.state='pending' and o.expires_at>now() and j.status='offered'),'[]'),
 'bank_payouts',coalesce((select jsonb_agg(to_jsonb(bp)) from (select * from public.bank_payouts where worker_id=a order by updated_at desc limit 20) bp),'[]'),
 'payouts',coalesce((select jsonb_agg(to_jsonb(p)) from (select * from public.payouts where worker_id=a order by created_at desc,id desc limit 40) p),'[]')) into result;
 return result;
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
