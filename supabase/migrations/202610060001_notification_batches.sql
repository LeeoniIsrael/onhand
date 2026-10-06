create function public.push_recipients_many(p_actors uuid[]) returns table(actor uuid,token text) language sql stable security definer set search_path='' as $$
 select t.actor,t.token from private.push_tokens t join public.account_settings s on s.id=t.actor join public.profiles p on p.id=t.actor where t.actor=any(p_actors[1:1000]) and s.notifications and p.deleted_at is null and t.updated_at>now()-interval '90 days';
$$;
create function public.queue_push_receipts(p_tickets jsonb) returns void language plpgsql security definer set search_path='' as $$
declare ticket jsonb;
begin
 if jsonb_array_length(p_tickets)>1000 then raise exception 'Receipt batch too large'; end if;
 for ticket in select value from jsonb_array_elements(p_tickets) loop
  insert into private.outbox(topic,aggregate_id,payload,available_at) values('push_receipt',gen_random_uuid(),ticket,now()+interval '15 minutes');
 end loop;
end $$;
create function public.complete_outbox_batch(p_ids uuid[],p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare event uuid;
begin foreach event in array p_ids[1:1000] loop perform public.finish_outbox(event,p_error);end loop; end $$;
create or replace function public.register_push_token(p_token text) returns void language plpgsql security definer set search_path='' as $$
declare a uuid:=private.require_actor();
begin
 perform private.throttle(a,'push_token',10);
 if p_token !~ '^(ExpoPushToken|ExponentPushToken)\[[a-zA-Z0-9_-]{10,200}\]$' then raise exception 'Invalid device token'; end if;
 if (select count(*) from private.push_tokens where actor=a)>=8 and not exists(select 1 from private.push_tokens where token=p_token and actor=a) then raise exception 'Remove an old device before adding another'; end if;
 insert into private.push_tokens values(p_token,a,now()) on conflict(token) do update set actor=a,updated_at=now();
end $$;
create or replace function public.claim_outbox(p_limit integer default 500) returns setof private.outbox language sql security definer set search_path='' as $$
 update private.outbox set state='processing',locked_at=now(),attempts=attempts+1
 where id in (select id from private.outbox where (state='pending' and available_at<=now() or state='processing' and locked_at<now()-interval '2 minutes') and attempts<12
 order by case when topic in ('capture_payment','cancel_payment') then 0 when topic in ('offer_notification','job_matched') then 1 else 2 end,available_at
 limit greatest(1,least(p_limit,1000)) for update skip locked) returning *;
$$;
revoke all on function public.push_recipients_many(uuid[]),public.queue_push_receipts(jsonb),public.complete_outbox_batch(uuid[],text) from public,anon,authenticated;
grant execute on function public.push_recipients_many(uuid[]),public.queue_push_receipts(jsonb),public.complete_outbox_batch(uuid[],text) to service_role;
-- More time for a push-only worker to see a new urgent offer during a burst.
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
 ttl:=case when j.urgency='now' then interval '5 minutes' else interval '10 minutes' end;
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

revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
