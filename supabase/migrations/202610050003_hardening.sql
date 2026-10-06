alter table public.workers add column payouts_ready boolean not null default false;
alter table public.workers add constraint minimum_pay_bound check(minimum_pay_cents<=1000000);
-- Prevent any change to the agreed price after assignment, including privileged accidental writes.
create function private.guard_agreement() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status not in ('draft','pricing','requested','matching','offered') and (new.offer_cents<>old.offer_cents or new.worker_id is distinct from old.worker_id or new.customer_id<>old.customer_id) then raise exception 'The assigned agreement is locked'; end if;
 return new;
end $$;
create trigger agreement_guard before update on public.jobs for each row execute function private.guard_agreement();
-- No client can mark credential or payout flags as verified.
create function public.update_payout_readiness(p_worker uuid,p_account text,p_ready boolean) returns void language sql security definer set search_path='' as $$
 update public.workers set payouts_ready=p_ready where id=p_worker and stripe_account_id=p_account;
$$;
create function public.record_full_refund(p_intent text,p_event text,p_amount integer) returns void language plpgsql security definer set search_path='' as $$
begin perform public.apply_stripe_event(p_event,'charge.refunded',p_intent,p_amount,'refunded'); end $$;
create function public.refund_plan(p_job uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs; p public.payments;
begin
 select * into j from public.jobs where id=p_job for update;
 select * into p from public.payments where job_id=p_job for update;
 if j.status<>'disputed' or p.state<>'captured' then raise exception 'A captured payment and support case are required'; end if;
 return jsonb_build_object('payment',to_jsonb(p));
end $$;
-- Automated reconciliation is bounded; inspect provider status rather than trusting event order.
create function public.reconciliation_batch() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('payments',coalesce((select jsonb_agg(stripe_intent_id) from (select stripe_intent_id from public.payments where state in ('pending','authorized') order by updated_at limit 30) p),'[]'),'checkouts',coalesce((select jsonb_agg(provider_id) from (select provider_id from private.payment_operations where action='checkout' and provider_id is not null and state='pending' order by updated_at limit 20) c),'[]'));
$$;
create function public.finish_checkout(p_provider text) returns void language sql security definer set search_path='' as $$ update private.payment_operations set state='done' where provider_id=p_provider; $$;
create function public.account_deletion_ready(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.payments p join public.jobs j on j.id=p.job_id where j.customer_id=p_actor and p.state in ('pending','authorized')) then raise exception 'Finish payment processing before deleting your account'; end if;
end $$;
revoke all on function public.update_payout_readiness(uuid,text,boolean),public.record_full_refund(text,text,integer),public.refund_plan(uuid),public.reconciliation_batch(),public.finish_checkout(text),public.account_deletion_ready(uuid) from public,anon,authenticated;
grant execute on function public.update_payout_readiness(uuid,text,boolean),public.record_full_refund(text,text,integer),public.refund_plan(uuid),public.reconciliation_batch(),public.finish_checkout(text),public.account_deletion_ready(uuid) to service_role;
-- Prevent self-asserted verification in signup metadata and authenticated table writes (inherited from checkpoint 1).
revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
create or replace function private.candidates(p_job uuid) returns table(worker_id uuid,score numeric,eta_seconds integer,distance_m integer,reasons jsonb) language sql stable security definer set search_path='' as $$
 with eligible as (
 select w.id, w.minimum_pay_cents, w.completed_count, j.offer_cents,
  extensions.st_distance(l.position,a.position) as distance,
  coalesce(m.review_count,0) as reviews,
  (coalesce(m.rating,0)*coalesce(m.review_count,0)+4.5*12)/(coalesce(m.review_count,0)+12) as rating,
  coalesce(nullif(m.completion_rate,0),0.9) as reliability,
  s.confidence
 from public.jobs j join public.job_private a on a.job_id=j.id
 join public.worker_skills s on s.skill=j.skill
 join public.workers w on w.id=s.worker_id
 join public.profiles p on p.id=w.id and p.deleted_at is null
 join public.worker_locations l on l.worker_id=w.id
 left join public.worker_metrics m on m.worker_id=w.id
 where j.id=p_job and j.status in ('matching','offered') and w.payouts_ready and w.available and w.account_standing='good' and w.identity_verified
 and s.confidence>=0.5 and l.updated_at>now()-interval '15 minutes'
 and extensions.st_dwithin(l.position,a.position,100000) and w.minimum_pay_cents<=j.offer_cents and extensions.st_dwithin(l.position,a.position,w.service_radius_m)
 and not exists(select 1 from public.blocked_pairs b where b.customer_id=j.customer_id and b.worker_id=w.id)
 and not exists(select 1 from public.jobs busy where busy.worker_id=w.id and busy.status in ('matched','worker_en_route','worker_arrived','in_progress','awaiting_completion_confirmation'))
 and (not j.requires_license or exists(select 1 from public.licenses lic where lic.worker_id=w.id and lic.skill=j.skill and lic.jurisdiction=j.approximate_zone and lic.verified and lic.expires_at>coalesce(j.scheduled_at,now())+make_interval(mins=>j.duration_minutes)))
 ) select id,
 round(least(1, greatest(0,0.34*(rating/5)+0.24*reliability+0.18*confidence+0.14*exp(-distance/8000)+0.06*least(1,offer_cents::numeric/(minimum_pay_cents*1.5))+case when reviews<5 then 0.04 else 0 end))::numeric,6),
 greatest(180,ceil(distance/6.7*1.35)::integer),round(distance)::integer,
 jsonb_build_object('quality',round((rating/5)::numeric,3),'reliability',reliability,'skill',confidence,'newcomer',reviews<5)
 from eligible;
$$;

revoke all on all functions in schema private from public,anon,authenticated;
