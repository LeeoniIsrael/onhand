-- Human review decisions are server-only and leave an audit record.
create table private.worker_reviews(id bigint generated always as identity primary key,worker_id uuid not null references public.workers(id),operator text not null,note text not null,decision jsonb not null,at timestamptz not null default now());
create index worker_review_history on private.worker_reviews(worker_id,at desc);
create function public.review_worker(p_worker uuid,p_approved boolean,p_insured boolean,p_operator text,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_worker::text,0));
 if char_length(trim(p_operator)) not between 2 and 120 or char_length(trim(p_note)) not between 10 and 2000 or p_approved is null or p_insured is null then raise exception 'Operator and review evidence are required'; end if;
 perform 1 from public.workers w join public.profiles p on p.id=w.id where w.id=p_worker and p.deleted_at is null for update of w;
 if not found then raise exception 'Worker unavailable'; end if;
 update public.workers set identity_verified=p_approved,insured=p_insured,available=false,account_standing=case when p_approved then 'good' else 'suspended' end where id=p_worker;
 update public.job_offers set state='expired' where worker_id=p_worker and state='pending';
 insert into private.worker_reviews(worker_id,operator,note,decision) values(p_worker,trim(p_operator),trim(p_note),jsonb_build_object('identity_approved',p_approved,'insured',p_insured));
end $$;
create function public.review_license(p_worker uuid,p_skill text,p_zone text,p_expires timestamptz,p_operator text,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare credential uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_worker::text,0));
 if p_skill not in ('electrical.fixture','hvac.service','plumbing.leak','plumbing.drain') or char_length(trim(p_zone)) not between 2 and 120 or p_expires<=now() or p_expires is null or char_length(trim(p_operator)) not between 2 and 120 or char_length(trim(p_note)) not between 10 and 2000 then raise exception 'Valid credential, operator and review evidence are required'; end if;
 perform 1 from public.workers w join public.profiles p on p.id=w.id where w.id=p_worker and p.deleted_at is null for update of w;
 if not found then raise exception 'Worker unavailable'; end if;
 insert into public.licenses(worker_id,skill,jurisdiction,verified,expires_at) values(p_worker,p_skill,upper(trim(p_zone)),true,p_expires) returning id into credential;
 insert into private.worker_reviews(worker_id,operator,note,decision) values(p_worker,trim(p_operator),trim(p_note),jsonb_build_object('license_id',credential,'skill',p_skill,'zone',upper(trim(p_zone)),'expires',p_expires));
 return credential;
end $$;
revoke all on function public.review_worker(uuid,boolean,boolean,text,text),public.review_license(uuid,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.review_worker(uuid,boolean,boolean,text,text),public.review_license(uuid,text,text,timestamptz,text,text) to service_role;

-- A late appointment still requires credentials valid now and through the work.
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
 and (not j.requires_license or exists(select 1 from public.licenses lic where lic.worker_id=w.id and lic.skill=j.skill and lic.jurisdiction=j.approximate_zone and lic.verified and lic.expires_at>greatest(coalesce(j.scheduled_at,now()),now())+make_interval(mins=>j.duration_minutes)))
 ) select id,
 round(least(1, greatest(0,0.34*(rating/5)+0.24*reliability+0.18*confidence+0.14*exp(-distance/8000)+0.06*least(1,offer_cents::numeric/(minimum_pay_cents*1.5))+case when reviews<5 then 0.04 else 0 end -0.04*pending))::numeric,6),
 greatest(180,ceil(distance/6.7*1.35)::integer),round(distance)::integer,
 jsonb_build_object('quality',round((rating/5)::numeric,3),'reliability',reliability,'skill',confidence,'newcomer',reviews<5,'pending_offers',pending)
 from eligible;
$$;


revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
