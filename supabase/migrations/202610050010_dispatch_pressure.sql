-- Three expiring offer slots per worker. Concurrent dispatchers cannot swamp one inbox.
alter table public.job_offers add column slot smallint check(slot between 1 and 3);
with pending as(select id,row_number() over(partition by worker_id order by created_at desc,id) as n from public.job_offers where state='pending')
update public.job_offers o set state=case when p.n>3 or o.expires_at<=now() then 'expired' else 'pending' end,slot=case when p.n<=3 and o.expires_at>now() then p.n::smallint else null end from pending p where o.id=p.id;
alter table public.job_offers add constraint pending_slot_required check(state<>'pending' or slot is not null);
create unique index worker_offer_slot on public.job_offers(worker_id,slot) where state='pending';
create index offer_pressure on public.job_offers(worker_id,expires_at) where state='pending';
create or replace function private.dispatch(p_job uuid) returns integer language plpgsql security definer set search_path='' as $$
declare j public.jobs; wave integer; sent integer:=0; ttl interval; c record; available_slot integer; batch_size integer;
begin
 select * into j from public.jobs where id=p_job for update;
 if not found or j.status not in ('matching','offered') then return 0; end if;
 if j.urgency='scheduled' and j.scheduled_at>now()+interval '24 hours' then return 0; end if;
 update public.job_offers set state='expired' where job_id=p_job and state='pending' and expires_at<=now();
 if exists(select 1 from public.job_offers where job_id=p_job and state='pending') then return 0; end if;
 select coalesce(max(o.wave),0)+1 into wave from public.job_offers o where o.job_id=p_job;
 if wave>4 then return 0; end if;
 ttl:=case when j.urgency='now' then interval '90 seconds' else interval '10 minutes' end;
 batch_size:=least(12,3*wave);
 for c in select candidate.* from private.candidates(p_job) candidate join public.workers locked_worker on locked_worker.id=candidate.worker_id
 where not exists(select 1 from public.job_offers o where o.job_id=p_job and o.worker_id=candidate.worker_id)
 order by candidate.score desc,md5(p_job::text||candidate.worker_id::text) limit batch_size*3 for update of locked_worker skip locked loop
  update public.job_offers set state='expired' where worker_id=c.worker_id and state='pending' and expires_at<=now();
  select slots.slot_number into available_slot from generate_series(1,3) slots(slot_number) where not exists(select 1 from public.job_offers o where o.worker_id=c.worker_id and o.state='pending' and o.slot=slots.slot_number) order by slots.slot_number limit 1;
  if available_slot is null or not exists(select 1 from private.ranked_candidates(p_job) where worker_id=c.worker_id) then continue; end if;
  insert into public.job_offers(job_id,worker_id,wave,expires_at,score,eta_seconds,distance_m,reasons,slot) values(p_job,c.worker_id,wave,now()+ttl,c.score,c.eta_seconds,c.distance_m,c.reasons,available_slot) on conflict do nothing;
  if found then sent:=sent+1; end if;
  exit when sent>=batch_size;
 end loop;
 if sent>0 and j.status='matching' then update public.jobs set status='offered' where id=p_job; end if;
 return sent;
end $$;
create or replace function private.ranked_candidates(p_job uuid) returns table(worker_id uuid,score numeric,eta_seconds integer,distance_m integer,reasons jsonb) language sql stable as $$
 with eligible as (
 select w.id, w.minimum_pay_cents, w.completed_count, j.offer_cents,
  extensions.st_distance(l.position,a.position) as distance,
  coalesce(m.review_count,0) as reviews,
  (coalesce(m.rating,0)*coalesce(m.review_count,0)+4.5*12)/(coalesce(m.review_count,0)+12) as rating,
  coalesce(nullif(m.completion_rate,0),0.9) as reliability,
  s.confidence,pressure.pending
 from public.jobs j join public.job_private a on a.job_id=j.id
 join public.worker_skills s on s.skill=j.skill
 join public.workers w on w.id=s.worker_id
 join public.profiles p on p.id=w.id and p.deleted_at is null
 join public.worker_locations l on l.worker_id=w.id
 left join public.worker_metrics m on m.worker_id=w.id
 left join lateral (select count(*)::integer as pending from (select id from public.job_offers o where o.worker_id=w.id and o.state='pending' and o.expires_at>now() and o.job_id<>p_job limit 3) pending_ids) pressure on true
 where pressure.pending<3 and j.id=p_job and j.status in ('matching','offered') and w.payouts_ready and w.available and w.account_standing='good' and w.identity_verified
 and s.confidence>=0.5 and l.updated_at>now()-interval '15 minutes'
 and extensions.st_dwithin(l.position,a.position,100000) and w.minimum_pay_cents<=j.offer_cents and extensions.st_dwithin(l.position,a.position,w.service_radius_m)
 and not exists(select 1 from public.blocked_pairs b where b.customer_id=j.customer_id and b.worker_id=w.id)
 and not exists(select 1 from public.jobs busy where busy.worker_id=w.id and busy.status in ('matched','worker_en_route','worker_arrived','in_progress','awaiting_completion_confirmation'))
 and (not j.requires_license or exists(select 1 from public.licenses lic where lic.worker_id=w.id and lic.skill=j.skill and lic.jurisdiction=j.approximate_zone and lic.verified and lic.expires_at>coalesce(j.scheduled_at,now())+make_interval(mins=>j.duration_minutes)))
 ) select id,
 round(least(1, greatest(0,0.34*(rating/5)+0.24*reliability+0.18*confidence+0.14*exp(-distance/8000)+0.06*least(1,offer_cents::numeric/(minimum_pay_cents*1.5))+case when reviews<5 then 0.04 else 0 end -0.04*pending))::numeric,6),
 greatest(180,ceil(distance/6.7*1.35)::integer),round(distance)::integer,
 jsonb_build_object('quality',round((rating/5)::numeric,3),'reliability',reliability,'skill',confidence,'newcomer',reviews<5,'pending_offers',pending)
 from eligible;
$$;

create or replace function private.candidates(p_job uuid) returns table(worker_id uuid,score numeric,eta_seconds integer,distance_m integer,reasons jsonb) language sql stable security definer set search_path='' as $$ select * from private.ranked_candidates(p_job); $$;
create or replace function private.accept(p_offer uuid,p_actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.job_offers; j public.jobs; c record;
begin
 select * into o from public.job_offers where id=p_offer and worker_id=p_actor;
 if not found then raise exception 'Offer not found' using errcode='42501'; end if;
 select * into j from public.jobs where id=o.job_id for update;
 perform 1 from public.workers where id=p_actor for update;
 select * into o from public.job_offers where id=p_offer for update;
 if o.state<>'pending' or o.expires_at<=now() or j.status<>'offered' or j.worker_id is not null then raise exception 'This offer has closed'; end if;
 select * into c from private.ranked_candidates(j.id) where worker_id=p_actor;
 if not found then raise exception 'This job no longer meets your availability or qualifications'; end if;
 update public.jobs set worker_id=p_actor,status='matched' where id=j.id;
 update public.job_offers set state=case when id=p_offer then 'accepted' else 'expired' end where (job_id=j.id or worker_id=p_actor) and state='pending';
 insert into public.matches(job_id,worker_id,score,route_eta_seconds) values(j.id,p_actor,c.score,c.eta_seconds);
 update public.workers set available=false where id=p_actor;
 insert into private.outbox(topic,aggregate_id,payload) values('job_matched',j.id,jsonb_build_object('customer_id',j.customer_id,'worker_id',p_actor)) on conflict do nothing;
 return j.id;
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
