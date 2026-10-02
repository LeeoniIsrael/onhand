-- Server-authoritative marketplace foundation. Monetary values are integer cents.
create extension if not exists postgis with schema extensions;
create type public.job_status as enum ('draft','pricing','requested','matching','offered','matched','worker_en_route','worker_arrived','in_progress','awaiting_completion_confirmation','completed','cancelled','disputed');
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  role text not null check (role in ('customer','worker')), created_at timestamptz not null default now()
);
create table public.workers (
  id uuid primary key references public.profiles(id), bio text not null default '',
  available boolean not null default false, account_standing text not null default 'pending' check (account_standing in ('pending','good','suspended')),
  identity_verified boolean not null default false, background_check text not null default 'pending',
  insured boolean not null default false, minimum_pay_cents integer not null default 5000 check (minimum_pay_cents > 0),
  service_radius_m integer not null default 10000 check (service_radius_m between 1000 and 100000),
  stripe_account_id text, created_at timestamptz not null default now()
);
create table public.worker_locations (
  worker_id uuid primary key references public.workers(id) on delete cascade,
  position extensions.geography(Point,4326) not null, heading real, updated_at timestamptz not null default now()
);
create index worker_location_geo_idx on public.worker_locations using gist(position);
create table public.worker_skills (
  worker_id uuid references public.workers(id) on delete cascade, skill text not null,
  confidence numeric not null default 0 check (confidence between 0 and 1), verified boolean not null default false,
  completed integer not null default 0 check (completed >= 0), primary key(worker_id, skill)
);
create index worker_skill_idx on public.worker_skills(skill, confidence);
create table public.licenses (
  id uuid primary key default gen_random_uuid(), worker_id uuid not null references public.workers(id),
  skill text not null, jurisdiction text not null, verified boolean not null default false, expires_at timestamptz not null
);
create table public.jobs (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.profiles(id),
  worker_id uuid references public.workers(id), title text not null, description text not null default '',
  skill text not null, category text not null, status public.job_status not null default 'draft',
  approximate_zone text not null, offer_cents integer not null check (offer_cents between 1000 and 1000000),
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  urgency text not null check (urgency in ('now','today','scheduled')), scheduled_at timestamptz,
  requires_license boolean not null default false, version integer not null default 1,
  tip_cents integer not null default 0 check(tip_cents >= 0), created_at timestamptz not null default now(),
  check (urgency <> 'scheduled' or scheduled_at is not null)
);
-- Never put exact address or coordinates in jobs: an offer recipient can read that row.
create table public.job_private (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  street text not null, unit text, city text not null, access_instructions text,
  position extensions.geography(Point,4326) not null
);
create table public.job_photos (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id),
  owner_id uuid not null references public.profiles(id), storage_path text not null,
  kind text not null check (kind in ('before','after','video')), created_at timestamptz not null default now()
);
create table public.job_offers (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id),
  worker_id uuid not null references public.workers(id), wave integer not null check(wave > 0),
  state text not null default 'pending' check(state in ('pending','accepted','declined','expired')),
  expires_at timestamptz not null, created_at timestamptz not null default now(), unique(job_id,worker_id)
);
create table public.counter_offers (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id),
  worker_id uuid not null references public.workers(id), amount_cents integer not null check(amount_cents > 0),
  reason text not null, state text not null default 'pending' check(state in ('pending','accepted','declined')), approved_at timestamptz
);
create table public.matches (
  id uuid primary key default gen_random_uuid(), job_id uuid not null unique references public.jobs(id),
  worker_id uuid not null references public.workers(id), score numeric check(score between 0 and 1),
  route_eta_seconds integer not null check(route_eta_seconds >= 0), created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id),
  sender_id uuid not null references public.profiles(id), body text not null check(char_length(body) between 1 and 4000),
  photo_path text, created_at timestamptz not null default now()
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), job_id uuid unique not null references public.jobs(id),
  customer_id uuid not null references public.profiles(id), worker_id uuid not null references public.workers(id),
  overall integer not null check(overall between 1 and 5), quality integer not null check(quality between 1 and 5),
  communication integer not null check(communication between 1 and 5), punctuality integer not null check(punctuality between 1 and 5),
  tags text[] not null default '{}', note text, created_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), job_id uuid unique not null references public.jobs(id),
  stripe_intent_id text unique not null, amount_cents integer not null check(amount_cents > 0),
  fee_cents integer not null check(fee_cents >= 0), tip_cents integer not null default 0 check(tip_cents >= 0),
  state text not null check(state in ('pending','authorized','captured','failed','refunded')), created_at timestamptz not null default now()
);
create table public.payouts (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments(id),
  worker_id uuid not null references public.workers(id), amount_cents integer not null check(amount_cents >= 0),
  state text not null check(state in ('scheduled','paid','failed')), stripe_payout_id text unique
);
create table public.worker_metrics (
  worker_id uuid primary key references public.workers(id), review_count integer not null default 0,
  rating numeric not null default 0, completion_rate numeric not null default 0,
  cancellation_rate numeric not null default 0, response_rate numeric not null default 0,
  punctuality numeric not null default 0, complaints integer not null default 0,
  disputes integer not null default 0, repeat_rate numeric not null default 0,
  recent_performance numeric not null default 0, quality_score numeric not null default 0,
  window_start timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.blocked_pairs (customer_id uuid references public.profiles(id), worker_id uuid references public.workers(id), primary key(customer_id,worker_id));
create table public.safety_reports (id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id), job_id uuid references public.jobs(id), body text not null, created_at timestamptz not null default now());
create table public.stripe_events (id text primary key, type text not null, processed_at timestamptz not null default now());
create index jobs_customer_time_idx on public.jobs(customer_id,created_at desc);
create index jobs_worker_status_idx on public.jobs(worker_id,status);
create index jobs_dispatch_idx on public.jobs(status,skill,created_at) where status in ('requested','matching','offered');
create index offers_worker_state_idx on public.job_offers(worker_id,state,expires_at);
create index messages_job_time_idx on public.messages(job_id,created_at);
create index photos_job_idx on public.job_photos(job_id);

-- SECURITY DEFINER membership helpers prevent RLS recursion; no user-controlled SQL.
create function public.is_job_participant(p_job uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.jobs where id=p_job and (customer_id=auth.uid() or worker_id=auth.uid()));
$$;
create function public.is_job_customer(p_job uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.jobs where id=p_job and customer_id=auth.uid());
$$;
create function public.can_read_job(p_job uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_job_participant(p_job) or exists(select 1 from public.job_offers where job_id=p_job and worker_id=auth.uid() and state='pending' and expires_at>now());
$$;
revoke all on function public.is_job_participant(uuid), public.is_job_customer(uuid), public.can_read_job(uuid) from public;
grant execute on function public.is_job_participant(uuid), public.is_job_customer(uuid), public.can_read_job(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','workers','worker_locations','worker_skills','licenses','jobs','job_private','job_photos','job_offers','counter_offers','matches','messages','reviews','payments','payouts','worker_metrics','blocked_pairs','safety_reports','stripe_events'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;
create policy profile_owner on public.profiles for select to authenticated using(id=auth.uid());
create policy profile_insert on public.profiles for insert to authenticated with check(id=auth.uid());
create policy profile_name on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy worker_owner on public.workers for select to authenticated using(id=auth.uid());
create policy own_location on public.worker_locations for all to authenticated using(worker_id=auth.uid()) with check(worker_id=auth.uid());
create policy skill_read on public.worker_skills for select to authenticated using(true);
create policy license_read on public.licenses for select to authenticated using(true);
create policy job_read on public.jobs for select to authenticated using(public.can_read_job(id));
create policy private_read on public.job_private for select to authenticated using(public.is_job_participant(job_id));
create policy photo_read on public.job_photos for select to authenticated using(public.is_job_participant(job_id));
create policy photo_insert on public.job_photos for insert to authenticated with check(owner_id=auth.uid() and public.is_job_participant(job_id));
create policy offer_read on public.job_offers for select to authenticated using(worker_id=auth.uid() or public.is_job_customer(job_id));
create policy counter_read on public.counter_offers for select to authenticated using(worker_id=auth.uid() or public.is_job_customer(job_id));
create policy match_read on public.matches for select to authenticated using(public.is_job_participant(job_id));
create policy message_read on public.messages for select to authenticated using(public.is_job_participant(job_id));
create policy message_insert on public.messages for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from public.jobs where id=job_id and worker_id is not null and public.is_job_participant(id)));
create policy review_read on public.reviews for select to authenticated using(true);
create policy review_insert on public.reviews for insert to authenticated with check(customer_id=auth.uid() and exists(select 1 from public.jobs j where j.id=job_id and j.customer_id=auth.uid() and j.worker_id=reviews.worker_id and j.status='completed'));
create policy payment_read on public.payments for select to authenticated using(public.is_job_customer(job_id));
create policy payout_read on public.payouts for select to authenticated using(worker_id=auth.uid());
create policy metrics_owner on public.worker_metrics for select to authenticated using(worker_id=auth.uid());
create policy blocked_owner on public.blocked_pairs for all to authenticated using(customer_id=auth.uid()) with check(customer_id=auth.uid());
create policy report_read on public.safety_reports for select to authenticated using(reporter_id=auth.uid());
create policy report_insert on public.safety_reports for insert to authenticated with check(reporter_id=auth.uid() and (job_id is null or public.is_job_participant(job_id)));
-- Jobs, offers, metrics, credentials and financial rows have NO client write policies.
-- Use authenticated Edge Functions with authorization checks, then server-role transactions.

create function public.enforce_job_transition() returns trigger language plpgsql set search_path='' as $$
begin
  if new.status=old.status then return new; end if;
  if not ((old.status='draft' and new.status in ('pricing','cancelled')) or
    (old.status='pricing' and new.status in ('draft','requested','cancelled')) or
    (old.status='requested' and new.status in ('matching','cancelled')) or
    (old.status='matching' and new.status in ('offered','cancelled')) or
    (old.status='offered' and new.status in ('matched','matching','cancelled')) or
    (old.status='matched' and new.status in ('worker_en_route','cancelled')) or
    (old.status='worker_en_route' and new.status in ('worker_arrived','cancelled')) or
    (old.status='worker_arrived' and new.status in ('in_progress','cancelled')) or
    (old.status='in_progress' and new.status in ('awaiting_completion_confirmation','disputed')) or
    (old.status='awaiting_completion_confirmation' and new.status in ('completed','disputed')) or
    (old.status='completed' and new.status='disputed') or
    (old.status='disputed' and new.status in ('completed','cancelled'))) then
    raise exception 'Invalid job transition: % -> %',old.status,new.status;
  end if;
  new.version=old.version+1; return new;
end $$;
create trigger job_transition before update on public.jobs for each row execute function public.enforce_job_transition();

-- Atomic offer acceptance prevents double assignment of a job or a worker.
create function public.accept_offer(p_offer uuid, p_worker uuid, p_eta integer) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.job_offers; j public.jobs;
begin
  perform 1 from public.workers where id=p_worker and available and account_standing='good' for update;
  if not found then raise exception 'Worker unavailable'; end if;
  select * into o from public.job_offers where id=p_offer and worker_id=p_worker for update;
  if not found or o.state<>'pending' or o.expires_at<=now() then raise exception 'Offer closed'; end if;
  select * into j from public.jobs where id=o.job_id for update;
  if j.status<>'offered' or j.worker_id is not null then raise exception 'Job already assigned'; end if;
  if exists(select 1 from public.jobs where worker_id=p_worker and status in ('matched','worker_en_route','worker_arrived','in_progress','awaiting_completion_confirmation')) then raise exception 'Worker already assigned'; end if;
  update public.jobs set status='matched',worker_id=p_worker where id=j.id;
  update public.job_offers set state=case when id=p_offer then 'accepted' else 'expired' end where job_id=j.id and state='pending';
  insert into public.matches(job_id,worker_id,route_eta_seconds) values(j.id,p_worker,p_eta);
  update public.workers set available=false where id=p_worker;
  return j.id;
end $$;
revoke all on function public.accept_offer(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.accept_offer(uuid,uuid,integer) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('job-photos','job-photos',false,20971520,array['image/jpeg','image/png','image/webp','video/mp4']);
create policy job_photo_object_read on storage.objects for select to authenticated using(bucket_id='job-photos' and public.is_job_participant(((storage.foldername(name))[1])::uuid));
create policy job_photo_object_insert on storage.objects for insert to authenticated with check(bucket_id='job-photos' and public.is_job_participant(((storage.foldername(name))[1])::uuid));
alter publication supabase_realtime add table public.jobs, public.job_offers, public.messages, public.matches;
