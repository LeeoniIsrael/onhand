-- Additive upgrade: existing financial/job rows remain intact.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.rate_limits (actor uuid not null, action text not null, bucket timestamptz not null, hits integer not null, primary key(actor,action,bucket));
create table private.mutations (actor uuid not null, key uuid not null, action text not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(), primary key(actor,key));
create table private.outbox (id uuid primary key default gen_random_uuid(), topic text not null, aggregate_id uuid not null, payload jsonb not null default '{}', state text not null default 'pending' check(state in ('pending','processing','done','failed')), attempts integer not null default 0, available_at timestamptz not null default now(), locked_at timestamptz, last_error text, created_at timestamptz not null default now(), unique(topic,aggregate_id));
create index outbox_ready on private.outbox(available_at) where state in ('pending','processing');
create table public.account_settings (id uuid primary key references public.profiles(id), notifications boolean not null default true, reduced_motion boolean not null default false);
create table public.saved_addresses (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id), label text not null default 'Home', street text not null, unit text not null default '', city text not null, zone text not null, instructions text not null default '', latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180), created_at timestamptz not null default now());
alter table public.profiles add column deleted_at timestamptz;
-- Keep pseudonymous transaction records when an auth account is deleted.
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.jobs add column updated_at timestamptz not null default now();
alter table public.jobs add column payment_approved_at timestamptz;
alter table public.jobs add column approval_version integer;
alter table public.workers add column completed_count integer not null default 0;
alter table public.job_offers add column score numeric not null default 0;
alter table public.job_offers add column eta_seconds integer not null default 0;
alter table public.job_offers add column distance_m integer not null default 0;
alter table public.job_offers add column reasons jsonb not null default '{}';
alter table public.payments add column currency text not null default 'usd';
alter table public.payments add column updated_at timestamptz not null default now();
alter table public.payments drop constraint payments_state_check;
alter table public.payments add constraint payments_state_check check(state in ('pending','authorized','captured','failed','refunded','cancelled'));
alter table public.counter_offers add constraint counter_amount_bound check(amount_cents between 1000 and 1000000);
alter table public.reviews add constraint review_note_bound check(char_length(note)<=2000 and cardinality(tags)<=8);
alter table public.safety_reports add constraint report_body_bound check(char_length(body) between 10 and 4000);
create unique index one_active_job_per_worker on public.jobs(worker_id) where worker_id is not null and status in ('matched','worker_en_route','worker_arrived','in_progress','awaiting_completion_confirmation');
create index jobs_worker_time on public.jobs(worker_id,created_at desc,id desc);
create index jobs_customer_cursor on public.jobs(customer_id,created_at desc,id desc);
create index pending_offer_job on public.job_offers(job_id,expires_at) where state='pending';
create index licenses_eligibility on public.licenses(worker_id,skill,jurisdiction,expires_at) where verified;
create index blocked_worker on public.blocked_pairs(worker_id,customer_id);
create index messages_cursor on public.messages(job_id,created_at desc,id desc);

-- Explicit grants: table-wide owner policies cannot confer protected-column writes.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles,public.workers,public.jobs,public.job_private,public.job_photos,public.job_offers,public.counter_offers,public.matches,public.messages,public.reviews,public.payments,public.payouts,public.worker_metrics,public.blocked_pairs,public.safety_reports,public.account_settings,public.saved_addresses to authenticated;
drop policy profile_insert on public.profiles;
drop policy profile_name on public.profiles;
drop policy own_location on public.worker_locations;
drop policy skill_read on public.worker_skills;
drop policy license_read on public.licenses;
drop policy review_read on public.reviews;
create policy review_participants on public.reviews for select to authenticated using(public.is_job_participant(job_id));
alter table public.account_settings enable row level security;
alter table public.saved_addresses enable row level security;
create policy own_settings on public.account_settings for select to authenticated using(id=auth.uid());
create policy own_addresses on public.saved_addresses for select to authenticated using(owner_id=auth.uid());

create function private.require_actor(p_role text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); r text;
begin
 select role into r from public.profiles where id=a and deleted_at is null;
 if a is null or r is null then raise exception 'Sign in to continue' using errcode='42501'; end if;
 if p_role is not null and r<>p_role then raise exception 'This action is unavailable for your account' using errcode='42501'; end if;
 return a;
end $$;
create function private.throttle(p_actor uuid,p_action text,p_limit integer) returns void language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into private.rate_limits values(p_actor,p_action,date_trunc('minute',now()),1)
 on conflict(actor,action,bucket) do update set hits=private.rate_limits.hits+1 returning hits into n;
 if n>p_limit then raise exception 'Too many requests. Try again in a minute.' using errcode='P0001'; end if;
end $$;
create function private.signup() returns trigger language plpgsql security definer set search_path='' as $$
declare r text:=coalesce(new.raw_user_meta_data->>'role','customer'); n text:=trim(coalesce(new.raw_user_meta_data->>'display_name',''));
begin
 if r not in ('customer','worker') or char_length(n) not between 1 and 120 then raise exception 'Choose an account type and a name'; end if;
 insert into public.profiles(id,display_name,role) values(new.id,n,r);
 insert into public.account_settings(id) values(new.id);
 if r='worker' then
  insert into public.workers(id) values(new.id);
  insert into public.worker_metrics(worker_id) values(new.id);
 end if;
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.signup();
create function private.guard_profile() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id<>old.id or new.role<>old.role then raise exception 'Account roles are permanent'; end if;
 return new;
end $$;
create trigger immutable_profile before update on public.profiles for each row execute function private.guard_profile();
create function private.touch_job() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); if new.version=old.version then new.version=old.version+1; end if; return new; end $$;
create trigger job_touch before update on public.jobs for each row execute function private.touch_job();

create function private.skill_category(p_skill text) returns text language sql immutable set search_path='' as $$
 select case p_skill when 'plumbing.leak' then 'Plumbing' when 'plumbing.drain' then 'Plumbing' when 'electrical.fixture' then 'Electrical' when 'assembly.furniture' then 'Assembly' when 'mounting.tv' then 'Mounting' when 'appliances.repair' then 'Appliances' when 'painting.interior' then 'Painting' when 'hvac.service' then 'HVAC' when 'carpentry.repair' then 'Carpentry' when 'general.repair' then 'General repair' when 'moving.help' then 'Moving' when 'outdoor.help' then 'Outdoor' when 'other.help' then 'Other' end;
$$;

-- Eligibility is rechecked at both dispatch and acceptance. Credential flags are server-only.
create function private.candidates(p_job uuid) returns table(worker_id uuid,score numeric,eta_seconds integer,distance_m integer,reasons jsonb) language sql stable security definer set search_path='' as $$
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
 where j.id=p_job and w.available and w.account_standing='good' and w.identity_verified
 and s.confidence>=0.5 and l.updated_at>now()-interval '15 minutes'
 and w.minimum_pay_cents<=j.offer_cents and extensions.st_dwithin(l.position,a.position,w.service_radius_m)
 and not exists(select 1 from public.blocked_pairs b where b.customer_id=j.customer_id and b.worker_id=w.id)
 and not exists(select 1 from public.jobs busy where busy.worker_id=w.id and busy.status in ('matched','worker_en_route','worker_arrived','in_progress','awaiting_completion_confirmation'))
 and (not j.requires_license or exists(select 1 from public.licenses lic where lic.worker_id=w.id and lic.skill=j.skill and lic.jurisdiction=j.approximate_zone and lic.verified and lic.expires_at>coalesce(j.scheduled_at,now())+make_interval(mins=>j.duration_minutes)))
 ) select id,
 round(least(1, greatest(0,0.34*(rating/5)+0.24*reliability+0.18*confidence+0.14*exp(-distance/8000)+0.06*least(1,offer_cents::numeric/(minimum_pay_cents*1.5))+case when reviews<5 then 0.04 else 0 end))::numeric,6),
 greatest(180,ceil(distance/6.7*1.35)::integer),round(distance)::integer,
 jsonb_build_object('quality',round((rating/5)::numeric,3),'reliability',reliability,'skill',confidence,'newcomer',reviews<5)
 from eligible;
$$;
create function private.dispatch(p_job uuid) returns integer language plpgsql security definer set search_path='' as $$
declare j public.jobs; wave integer; sent integer; ttl interval;
begin
 select * into j from public.jobs where id=p_job for update;
 if not found or j.status not in ('matching','offered') then return 0; end if;
 if j.urgency='scheduled' and j.scheduled_at>now()+interval '24 hours' then return 0; end if;
 update public.job_offers set state='expired' where job_id=p_job and state='pending' and expires_at<=now();
 if exists(select 1 from public.job_offers where job_id=p_job and state='pending') then return 0; end if;
 select coalesce(max(o.wave),0)+1 into wave from public.job_offers o where o.job_id=p_job;
 if wave>4 then return 0; end if;
 ttl:=case when j.urgency='now' then interval '90 seconds' else interval '10 minutes' end;
 insert into public.job_offers(job_id,worker_id,wave,expires_at,score,eta_seconds,distance_m,reasons)
 select p_job,c.worker_id,wave,now()+ttl,c.score,c.eta_seconds,c.distance_m,c.reasons from private.candidates(p_job) c
 where not exists(select 1 from public.job_offers o where o.job_id=p_job and o.worker_id=c.worker_id)
 order by c.score desc,c.worker_id limit least(12,3*wave) on conflict(job_id,worker_id) do nothing;
 get diagnostics sent=row_count;
 if sent>0 and j.status='matching' then update public.jobs set status='offered' where id=p_job; end if;
 return sent;
end $$;

create function private.accept(p_offer uuid,p_actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.job_offers; j public.jobs; c record;
begin
 select * into o from public.job_offers where id=p_offer and worker_id=p_actor;
 if not found then raise exception 'Offer not found' using errcode='42501'; end if;
 select * into j from public.jobs where id=o.job_id for update;
 perform 1 from public.workers where id=p_actor for update;
 select * into o from public.job_offers where id=p_offer for update;
 if o.state<>'pending' or o.expires_at<=now() or j.status<>'offered' or j.worker_id is not null then raise exception 'This offer has closed'; end if;
 select * into c from private.candidates(j.id) where worker_id=p_actor;
 if not found then raise exception 'This job no longer meets your availability or qualifications'; end if;
 update public.jobs set worker_id=p_actor,status='matched' where id=j.id;
 update public.job_offers set state=case when id=p_offer then 'accepted' else 'expired' end where job_id=j.id and state='pending';
 insert into public.matches(job_id,worker_id,score,route_eta_seconds) values(j.id,p_actor,c.score,c.eta_seconds);
 update public.workers set available=false where id=p_actor;
 insert into private.outbox(topic,aggregate_id,payload) values('job_matched',j.id,jsonb_build_object('customer_id',j.customer_id,'worker_id',p_actor)) on conflict do nothing;
 return j.id;
end $$;
-- Retire the earlier service helper's unvalidated caller ETA.
create or replace function public.accept_offer(p_offer uuid,p_worker uuid,p_eta integer) returns uuid language sql security definer set search_path='' as $$ select private.accept(p_offer,p_worker); $$;

-- The only client write entry point. Each response is committed with its idempotency key.
create function public.marketplace_action(p_action text,p_payload jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.require_actor(); cached private.mutations; result jsonb:='{}'; j public.jobs; jobid uuid; offerid uuid; r text; v text; n integer; x double precision; y double precision; addr public.saved_addresses; co public.counter_offers;
begin
 if p_key is null or p_payload is null or octet_length(p_payload::text)>16000 then raise exception 'Invalid request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_key::text,0));
 select * into cached from private.mutations where actor=a and key=p_key;
 if found then
  if cached.action<>p_action or cached.payload<>p_payload then raise exception 'Request key was already used for different data'; end if;
  return cached.result;
 end if;
 perform private.throttle(a,p_action,case when p_action='create_job' then 5 when p_action='send_message' then 60 else 30 end);
 select role into r from public.profiles where id=a;
 if p_action='profile' then
  v:=trim(p_payload->>'name'); if char_length(v) not between 1 and 120 then raise exception 'Enter your name'; end if;
  update public.profiles set display_name=v where id=a;
 elsif p_action='settings' then
  insert into public.account_settings(id,notifications,reduced_motion) values(a,coalesce((p_payload->>'notifications')::boolean,true),coalesce((p_payload->>'reduced_motion')::boolean,false))
  on conflict(id) do update set notifications=excluded.notifications,reduced_motion=excluded.reduced_motion;
 elsif p_action='save_address' then
  perform private.require_actor('customer');
  x:=(p_payload->>'longitude')::double precision; y:=(p_payload->>'latitude')::double precision;
  if x is null or y is null or x not between -180 and 180 or y not between -90 and 90 then raise exception 'Confirm a valid location'; end if;
  if char_length(trim(p_payload->>'street')) not between 3 and 200 or char_length(trim(p_payload->>'city')) not between 2 and 120 or char_length(trim(p_payload->>'zone')) not between 2 and 120 then raise exception 'Enter a complete address'; end if;
  if (select count(*) from public.saved_addresses where owner_id=a)>=10 and p_payload->>'id' is null then raise exception 'You can save up to ten addresses'; end if;
  insert into public.saved_addresses(id,owner_id,label,street,unit,city,zone,instructions,latitude,longitude)
  values(coalesce((p_payload->>'id')::uuid,gen_random_uuid()),a,left(coalesce(p_payload->>'label','Home'),60),trim(p_payload->>'street'),left(coalesce(p_payload->>'unit',''),60),trim(p_payload->>'city'),trim(p_payload->>'zone'),left(coalesce(p_payload->>'instructions',''),1000),y,x)
  on conflict(id) do update set label=excluded.label,street=excluded.street,unit=excluded.unit,city=excluded.city,zone=excluded.zone,instructions=excluded.instructions,latitude=y,longitude=x where public.saved_addresses.owner_id=a
  returning * into addr;
  if not found then raise exception 'Address not found' using errcode='42501'; end if;
  result:=to_jsonb(addr);
 elsif p_action='delete_address' then
  delete from public.saved_addresses where id=(p_payload->>'id')::uuid and owner_id=a;
 elsif p_action='worker_setup' then
  perform private.require_actor('worker');
  if jsonb_array_length(p_payload->'skills') not between 1 and 13 then raise exception 'Choose at least one skill'; end if;
  update public.workers set bio=left(coalesce(p_payload->>'bio',''),1000),minimum_pay_cents=(p_payload->>'minimum_pay_cents')::integer,service_radius_m=(p_payload->>'service_radius_m')::integer where id=a;
  delete from public.worker_skills where worker_id=a and not verified and skill not in (select jsonb_array_elements_text(p_payload->'skills'));
  for v in select jsonb_array_elements_text(p_payload->'skills') loop
   if private.skill_category(v) is null then raise exception 'Choose a listed skill'; end if;
   insert into public.worker_skills(worker_id,skill,confidence) values(a,v,0.6) on conflict do nothing;
  end loop;
 elsif p_action='availability' then
  perform private.require_actor('worker');
  if (p_payload->>'available')::boolean then
   if not exists(select 1 from public.workers where id=a and account_standing='good' and identity_verified) then raise exception 'Your identity and credentials need approval before you can take work'; end if;
   x:=(p_payload->>'longitude')::double precision; y:=(p_payload->>'latitude')::double precision;
   if x is null or y is null or x not between -180 and 180 or y not between -90 and 90 then raise exception 'Enable location to receive nearby work'; end if;
   insert into public.worker_locations(worker_id,position) values(a,extensions.st_setsrid(extensions.st_makepoint(x,y),4326)::extensions.geography)
   on conflict(worker_id) do update set position=excluded.position,updated_at=now();
  end if;
  update public.workers set available=coalesce((p_payload->>'available')::boolean,false) where id=a;
 elsif p_action='create_job' then
  perform private.require_actor('customer');
  if (select count(*) from public.jobs where customer_id=a and status not in ('completed','cancelled','disputed'))>=5 then raise exception 'Finish or cancel a request before posting another'; end if;
  select * into addr from public.saved_addresses where id=(p_payload->>'address_id')::uuid and owner_id=a;
  if not found then raise exception 'Choose your saved address'; end if;
  v:=p_payload->>'skill';
  if private.skill_category(v) is null or char_length(trim(p_payload->>'title')) not between 5 and 120 or char_length(trim(p_payload->>'description')) not between 10 and 4000 then raise exception 'Add a clear title, description and category'; end if;
  if p_payload->>'urgency'='scheduled' and ((p_payload->>'scheduled_at')::timestamptz<=now() or (p_payload->>'scheduled_at')::timestamptz>now()+interval '90 days') then raise exception 'Choose a future appointment within 90 days'; end if;
  insert into public.jobs(customer_id,title,description,skill,category,status,approximate_zone,offer_cents,duration_minutes,urgency,scheduled_at,requires_license)
  values(a,trim(p_payload->>'title'),trim(p_payload->>'description'),v,private.skill_category(v),'matching',addr.zone,(p_payload->>'offer_cents')::integer,(p_payload->>'duration_minutes')::integer,p_payload->>'urgency',(p_payload->>'scheduled_at')::timestamptz,v in ('electrical.fixture','hvac.service','plumbing.leak','plumbing.drain')) returning id into jobid;
  insert into public.job_private values(jobid,addr.street,addr.unit,addr.city,addr.instructions,extensions.st_setsrid(extensions.st_makepoint(addr.longitude,addr.latitude),4326)::extensions.geography);
  perform private.dispatch(jobid);
  result:=jsonb_build_object('id',jobid);
 elsif p_action='accept_offer' then
  perform private.require_actor('worker');
  jobid:=private.accept((p_payload->>'offer_id')::uuid,a); result:=jsonb_build_object('id',jobid);
 elsif p_action='decline_offer' then
  perform private.require_actor('worker');
  update public.job_offers set state='declined' where id=(p_payload->>'offer_id')::uuid and worker_id=a and state='pending';
 elsif p_action='counter_offer' then
  perform private.require_actor('worker');
  select * into co from public.counter_offers where job_id=(p_payload->>'job_id')::uuid and worker_id=a and state='pending';
  if found then raise exception 'You already sent a price proposal'; end if;
  if not exists(select 1 from public.job_offers where job_id=(p_payload->>'job_id')::uuid and worker_id=a and state='pending' and expires_at>now()) then raise exception 'Offer closed'; end if;
  v:=trim(p_payload->>'reason'); if char_length(v) not between 5 and 500 then raise exception 'Explain the price change'; end if;
  insert into public.counter_offers(job_id,worker_id,amount_cents,reason) values((p_payload->>'job_id')::uuid,a,(p_payload->>'amount_cents')::integer,v);
 elsif p_action='respond_counter' then
  perform private.require_actor('customer');
  select * into co from public.counter_offers where id=(p_payload->>'counter_id')::uuid;
  select * into j from public.jobs where id=co.job_id and customer_id=a for update;
  if not found or co.state<>'pending' or j.status<>'offered' then raise exception 'Price proposal closed'; end if;
  select id into offerid from public.job_offers where job_id=j.id and worker_id=co.worker_id and state='pending' and expires_at>now();
  if offerid is null then raise exception 'Worker offer expired'; end if;
  if (p_payload->>'accept')::boolean then
   update public.jobs set offer_cents=co.amount_cents where id=j.id;
   jobid:=private.accept(offerid,co.worker_id);
   update public.counter_offers set state='accepted',approved_at=now() where id=co.id;
   result:=jsonb_build_object('id',jobid);
  else update public.counter_offers set state='declined' where id=co.id; end if;
 elsif p_action in ('advance','cancel','approve_completion','send_message','review','report','block','register_photo','redispatch') then
  jobid:=(p_payload->>'job_id')::uuid;
  select * into j from public.jobs where id=jobid and (customer_id=a or worker_id=a) for update;
  if not found then raise exception 'Job not found' using errcode='42501'; end if;
  if p_action='advance' then
   if j.worker_id<>a or r<>'worker' then raise exception 'Only the assigned worker can update progress' using errcode='42501'; end if;
   v:=p_payload->>'status';
   if v not in ('worker_en_route','worker_arrived','in_progress','awaiting_completion_confirmation') then raise exception 'Invalid progress update'; end if;
   if v='worker_en_route' and not exists(select 1 from public.payments where job_id=j.id and state='authorized') then raise exception 'The customer needs to authorize payment before you leave'; end if;
   update public.jobs set status=v::public.job_status where id=j.id;
  elsif p_action='cancel' then
   if j.status not in ('matching','offered','matched','worker_en_route','worker_arrived') then raise exception 'This job needs a support review to cancel'; end if;
   update public.jobs set status='cancelled' where id=j.id;
   update public.job_offers set state='expired' where job_id=j.id and state='pending';
   update public.counter_offers set state='declined' where job_id=j.id and state='pending';
   if j.worker_id is not null then update public.workers set available=false where id=j.worker_id; end if;
   insert into private.outbox(topic,aggregate_id) values('cancel_payment',j.id) on conflict do nothing;
  elsif p_action='approve_completion' then
   if j.customer_id<>a or j.status<>'awaiting_completion_confirmation' then raise exception 'This work is not ready for your approval'; end if;
   if not exists(select 1 from public.payments where job_id=j.id and state='authorized' and amount_cents=j.offer_cents) then raise exception 'Authorize the agreed amount first'; end if;
   -- Tips require a distinct confirmed charge; never invent a transfer without collected funds.
   update public.jobs set payment_approved_at=now(),approval_version=version where id=j.id;
   insert into private.outbox(topic,aggregate_id) values('capture_payment',j.id) on conflict do nothing;
  elsif p_action='send_message' then
   if j.worker_id is null or j.status in ('cancelled','completed') then raise exception 'Chat is available during an assigned job'; end if;
   v:=trim(p_payload->>'body'); if char_length(v) not between 1 and 4000 then raise exception 'Enter a message of up to 4,000 characters'; end if;
   insert into public.messages(job_id,sender_id,body) values(j.id,a,v) returning id into jobid; result:=jsonb_build_object('id',jobid);
  elsif p_action='review' then
   if j.customer_id<>a or j.status<>'completed' then raise exception 'Review a completed job'; end if;
   insert into public.reviews(job_id,customer_id,worker_id,overall,quality,communication,punctuality,note)
   values(j.id,a,j.worker_id,(p_payload->>'overall')::integer,(p_payload->>'quality')::integer,(p_payload->>'communication')::integer,(p_payload->>'punctuality')::integer,left(coalesce(p_payload->>'note',''),2000));
   insert into public.worker_metrics(worker_id,review_count,rating)
   select j.worker_id,count(*),avg(overall) from public.reviews where worker_id=j.worker_id
   on conflict(worker_id) do update set review_count=excluded.review_count,rating=excluded.rating,updated_at=now();
  elsif p_action='report' then
   insert into public.safety_reports(reporter_id,job_id,body) values(a,j.id,trim(p_payload->>'body'));
  elsif p_action='block' then
   if j.customer_id<>a or j.worker_id is null then raise exception 'Only a customer can block an assigned worker'; end if;
   insert into public.blocked_pairs values(a,j.worker_id) on conflict do nothing;
  elsif p_action='register_photo' then
   v:=p_payload->>'path';
   if v !~ ('^'||j.id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') or not exists(select 1 from storage.objects where bucket_id='job-photos' and name=v and owner_id=a::text) then raise exception 'Upload your image before attaching it'; end if;
   if (select count(*) from public.job_photos where job_id=j.id)>=12 then raise exception 'A job can have up to twelve photos'; end if;
   insert into public.job_photos(job_id,owner_id,storage_path,kind) values(j.id,a,v,p_payload->>'kind');
  elsif p_action='redispatch' then
   if j.customer_id<>a then raise exception 'Only the customer can request more matches'; end if;
   n:=private.dispatch(j.id); result:=jsonb_build_object('sent',n);
  end if;
 else raise exception 'Unsupported action';
 end if;
 insert into private.mutations(actor,key,action,payload,result) values(a,p_key,p_action,p_payload,result);
 return result;
end $$;
revoke all on function public.marketplace_action(text,jsonb,uuid) from public,anon;
grant execute on function public.marketplace_action(text,jsonb,uuid) to authenticated;

-- Redacted, bounded projections; the worker's exact position and credentials never leave the DB.
create function private.job_json(p_job public.jobs,p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p_job)||jsonb_build_object('address',case when p_job.customer_id=p_actor or p_job.worker_id=p_actor then
 (select jsonb_build_object('street',a.street,'unit',a.unit,'city',a.city,'instructions',a.access_instructions,'latitude',extensions.st_y(a.position::extensions.geometry),'longitude',extensions.st_x(a.position::extensions.geometry)) from public.job_private a where a.job_id=p_job.id) else null end,
 'worker', (select jsonb_build_object('id',w.id,'name',p.display_name,'bio',w.bio,'identity_verified',w.identity_verified,'insured',w.insured,'reviews',coalesce(m.review_count,0),'rating',coalesce(m.rating,0),'completed',w.completed_count) from public.workers w join public.profiles p on p.id=w.id left join public.worker_metrics m on m.worker_id=w.id where w.id=p_job.worker_id),
 'customer_name',(select display_name from public.profiles where id=p_job.customer_id),
 'eta_seconds',(select route_eta_seconds from public.matches where job_id=p_job.id));
$$;
create function public.marketplace_home(p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
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
 'payouts',coalesce((select jsonb_agg(to_jsonb(p)) from (select * from public.payouts where worker_id=a order by id desc limit 40) p),'[]')) into result;
 return result;
end $$;
create function public.marketplace_job(p_job uuid,p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.require_actor(); j public.jobs;
begin
 select * into j from public.jobs where id=p_job and (customer_id=a or worker_id=a);
 if not found then raise exception 'Job not found' using errcode='42501'; end if;
 return jsonb_build_object('job',private.job_json(j,a),
 'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from (select * from public.messages where job_id=p_job and (p_before is null or (created_at,id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) order by created_at desc,id desc limit 50) m),'[]'),
 'photos',coalesce((select jsonb_agg(to_jsonb(p)) from public.job_photos p where job_id=p_job),'[]'),
 'payment',(select to_jsonb(p)-'stripe_intent_id' from public.payments p where job_id=p_job),
 'review',(select to_jsonb(r) from public.reviews r where job_id=p_job),
 'counters',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('worker_name',(select display_name from public.profiles where id=c.worker_id))) from public.counter_offers c where job_id=p_job and state='pending'),'[]'),
 'matching',jsonb_build_object('eligible',(select count(*) from private.candidates(p_job)),'sent',(select count(*) from public.job_offers where job_id=p_job),'pending',(select count(*) from public.job_offers where job_id=p_job and state='pending' and expires_at>now())));
end $$;
revoke all on function public.marketplace_home(timestamptz,uuid,integer),public.marketplace_job(uuid,timestamptz,uuid) from public,anon;
grant execute on function public.marketplace_home(timestamptz,uuid,integer),public.marketplace_job(uuid,timestamptz,uuid) to authenticated;

-- Background maintenance is bounded, SKIP LOCKED and callable only by the server/scheduler.
create function public.dispatch_tick() returns integer language plpgsql security definer set search_path='' as $$
declare j record; n integer:=0;
begin
 for j in select id from public.jobs where status in ('matching','offered') and created_at>now()-interval '7 days' and (scheduled_at is null or scheduled_at<=now()+interval '24 hours') order by updated_at limit 100 for update skip locked loop
  n:=n+private.dispatch(j.id);
 end loop;
 delete from private.rate_limits where bucket<now()-interval '1 day';
 delete from private.mutations where created_at<now()-interval '30 days';
 update public.workers set available=false where available and not exists(select 1 from public.worker_locations l where l.worker_id=id and l.updated_at>now()-interval '15 minutes');
 return n;
end $$;
revoke all on function public.dispatch_tick() from public,anon,authenticated;
grant execute on function public.dispatch_tick() to service_role;

-- Storage object paths are validated as strings, never cast from attacker input.
drop policy job_photo_object_read on storage.objects;
drop policy job_photo_object_insert on storage.objects;
create policy job_photo_object_read on storage.objects for select to authenticated using(bucket_id='job-photos' and exists(select 1 from public.jobs j where j.id::text=(storage.foldername(name))[1] and public.is_job_participant(j.id)));
create policy job_photo_object_insert on storage.objects for insert to authenticated with check(bucket_id='job-photos' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$' and exists(select 1 from public.jobs j where j.id::text=(storage.foldername(name))[1] and public.is_job_participant(j.id) and j.status not in ('completed','cancelled')));
update storage.buckets set file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='job-photos';

-- No implicit PUBLIC execute privilege for internal SECURITY DEFINER functions.
revoke all on all functions in schema private from public,anon,authenticated;
alter default privileges in schema private revoke execute on functions from public;
notify pgrst,'reload schema';
