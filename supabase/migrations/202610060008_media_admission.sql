-- Uploads go through a bounded authenticated server endpoint. Public Storage
-- credentials cannot bypass per-job/day reservations with direct or signed uploads.
create table private.media_uploads(actor uuid not null references public.profiles(id),key uuid not null,job_id uuid not null references public.jobs(id),path text not null unique,mime text not null,bytes integer not null,hash text not null,state text not null default 'pending',created_at timestamptz not null default now(),primary key(actor,key));
create index media_daily_actor on private.media_uploads(actor,created_at);
create index media_job_slots on private.media_uploads(job_id);
create function public.reserve_media(p_actor uuid,p_job uuid,p_key uuid,p_mime text,p_bytes integer,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs; previous private.media_uploads; path text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 if not exists(select 1 from public.profiles where id=p_actor and deleted_at is null) then raise exception 'Account unavailable'; end if;
 select * into previous from private.media_uploads where actor=p_actor and key=p_key;
 if found then
  if previous.job_id<>p_job or previous.mime<>p_mime or previous.bytes<>p_bytes or previous.hash<>p_hash then raise exception 'Upload retry does not match the original image'; end if;
  return jsonb_build_object('path',previous.path,'state',previous.state);
 end if;
 select * into j from public.jobs where id=p_job and (customer_id=p_actor or worker_id=p_actor) for update;
 if not found or j.status in ('completed','cancelled','disputed') then raise exception 'An active assigned or owned job is required'; end if;
 if p_mime not in ('image/jpeg','image/png','image/webp') or p_bytes not between 1 and 8388608 or p_hash !~ '^[0-9a-f]{64}$' or p_key is null then raise exception 'Invalid image upload'; end if;
 if (select count(*) from private.media_uploads where actor=p_actor and created_at>=date_trunc('day',now()))>=100 then raise exception 'Daily photo upload limit reached'; end if;
 if (select count(*) from private.media_uploads where job_id=p_job)>=24 then raise exception 'This job has reached its photo upload limit'; end if;
 path:=p_job::text||'/'||p_key::text||case p_mime when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end;
 if exists(select 1 from storage.objects where bucket_id='job-photos' and name=path) then raise exception 'Choose a new photo identifier'; end if;
 insert into private.media_uploads(actor,key,job_id,path,mime,bytes,hash) values(p_actor,p_key,p_job,path,p_mime,p_bytes,p_hash);
 return jsonb_build_object('path',path,'state','pending');
end $$;
create function public.confirm_media(p_actor uuid,p_key uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 update private.media_uploads set state='uploaded' where actor=p_actor and key=p_key;
 return exists(select 1 from public.profiles where id=p_actor and deleted_at is null);
end $$;
create or replace function public.account_media_batch(p_actor uuid) returns table(name text) language sql stable security definer set search_path='' as $$
 select o.name from storage.objects o join public.profiles p on p.id=p_actor and p.deleted_at is not null where o.bucket_id='job-photos' and (o.owner_id=p_actor::text or exists(select 1 from private.media_uploads u where u.actor=p_actor and u.path=o.name)) order by o.name limit 100;
$$;
create function public.account_media_pending(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.media_uploads where actor=p_actor and state='pending' and created_at>now()-interval '10 minutes');
$$;
create function public.finish_media_erasure(p_actor uuid) returns void language sql security definer set search_path='' as $$
 delete from private.media_uploads where actor=p_actor and exists(select 1 from public.profiles where id=p_actor and deleted_at is not null);
$$;
revoke all on function public.finish_media_erasure(uuid) from public,anon,authenticated;
grant execute on function public.finish_media_erasure(uuid) to service_role;
revoke all on function public.reserve_media(uuid,uuid,uuid,text,integer,text),public.confirm_media(uuid,uuid),public.account_media_pending(uuid) from public,anon,authenticated;
grant execute on function public.reserve_media(uuid,uuid,uuid,text,integer,text),public.confirm_media(uuid,uuid),public.account_media_pending(uuid) to service_role;
create or replace function public.is_job_participant(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(storage.operation(),'') !~* '(upload|copy|move|multipart)' and public.is_active_actor() and exists(select 1 from public.jobs where id=p_job and (customer_id=auth.uid() or worker_id=auth.uid()));
$$;
create or replace function public.update_payout_readiness(p_worker uuid,p_account text,p_ready boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.workers set payouts_ready=p_ready,available=available and p_ready where id=p_worker and stripe_account_id=p_account;
 if found and not p_ready then update public.job_offers set state='expired' where worker_id=p_worker and state='pending'; end if;
end $$;

create or replace function public.marketplace_action(p_action text,p_payload jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
   if not exists(select 1 from public.workers where id=a and account_standing='good' and identity_verified and payouts_ready) then raise exception 'Complete identity approval and payout setup before taking work'; end if;
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
   update public.jobs set payment_approved_at=now(),approval_version=version+1 where id=j.id;
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
   if v !~ ('^'||j.id::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') or not exists(select 1 from storage.objects o join private.media_uploads u on u.path=o.name and u.actor=a and u.state='uploaded' where o.bucket_id='job-photos' and o.name=v) then raise exception 'Upload your image before attaching it'; end if;
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



revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
