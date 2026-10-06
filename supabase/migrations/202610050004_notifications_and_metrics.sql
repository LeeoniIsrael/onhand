create table private.push_tokens(token text primary key,actor uuid not null,updated_at timestamptz not null default now());
create index push_actor on private.push_tokens(actor);
create function public.register_push_token(p_token text) returns void language plpgsql security definer set search_path='' as $$
declare a uuid:=private.require_actor();
begin
 perform private.throttle(a,'push_token',10);
 if p_token !~ '^(ExpoPushToken|ExponentPushToken)\[[a-zA-Z0-9_-]{10,200}\]$' then raise exception 'Invalid device token'; end if;
 insert into private.push_tokens values(p_token,a,now()) on conflict(token) do update set actor=a,updated_at=now();
end $$;
create function public.push_recipients(p_actor uuid) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(t.token),'[]') from private.push_tokens t join public.account_settings s on s.id=t.actor join public.profiles p on p.id=t.actor where t.actor=p_actor and s.notifications and p.deleted_at is null and t.updated_at>now()-interval '90 days';
$$;
create function public.remove_push_token(p_token text) returns void language sql security definer set search_path='' as $$ delete from private.push_tokens where token=p_token; $$;
create function private.notify_offer() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into private.outbox(topic,aggregate_id,payload) values('offer_notification',new.id,jsonb_build_object('actor',new.worker_id,'job_id',new.job_id)) on conflict do nothing; return new; end $$;
create trigger offer_notification after insert on public.job_offers for each row execute function private.notify_offer();
create function private.notify_message() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 select case when customer_id=new.sender_id then worker_id else customer_id end into recipient from public.jobs where id=new.job_id;
 if recipient is not null then insert into private.outbox(topic,aggregate_id,payload) values('message_notification',new.id,jsonb_build_object('actor',recipient,'job_id',new.job_id)) on conflict do nothing; end if;
 return new;
end $$;
create trigger message_notification after insert on public.messages for each row execute function private.notify_message();
create table private.job_events(id bigint generated always as identity primary key,job_id uuid not null references public.jobs(id),worker_id uuid,actor uuid,status public.job_status not null,at timestamptz not null default now());
create index job_event_worker on private.job_events(worker_id,at desc);
create function private.job_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' or old.status<>new.status then
  insert into private.job_events(job_id,worker_id,actor,status) values(new.id,new.worker_id,auth.uid(),new.status);
 end if;
 return new;
end $$;
create trigger job_event after insert or update on public.jobs for each row execute function private.job_event();
create function private.refresh_metrics(p_worker uuid) returns void language plpgsql security definer set search_path='' as $$
declare completed integer; failed integer; responses numeric; avg_rating numeric; reviews integer;
begin
 select count(*) filter(where status='completed'),count(*) filter(where status='cancelled' and actor=p_worker) into completed,failed from private.job_events where worker_id=p_worker and at>now()-interval '180 days';
 select avg(overall),count(*) into avg_rating,reviews from public.reviews where worker_id=p_worker;
 select case when count(*)=0 then 0.8 else count(*) filter(where state in ('accepted','declined'))::numeric/count(*) end into responses from public.job_offers where worker_id=p_worker and created_at>now()-interval '30 days' and (state<>'pending' or expires_at<now());
 insert into public.worker_metrics(worker_id,review_count,rating,completion_rate,cancellation_rate,response_rate)
 values(p_worker,reviews,coalesce(avg_rating,0),(completed+9)::numeric/(completed+failed+10),failed::numeric/greatest(1,completed+failed),responses)
 on conflict(worker_id) do update set review_count=excluded.review_count,rating=excluded.rating,completion_rate=excluded.completion_rate,cancellation_rate=excluded.cancellation_rate,response_rate=excluded.response_rate,updated_at=now();
end $$;
create or replace function public.dispatch_tick() returns integer language plpgsql security definer set search_path='' as $$
declare j record; w record; n integer:=0;
begin
 for j in select id from public.jobs where status in ('matching','offered') and (scheduled_at is null or scheduled_at<=now()+interval '24 hours') order by updated_at limit 100 for update skip locked loop
  n:=n+private.dispatch(j.id);
  -- Rotate checked jobs so a large queue cannot starve later rows.
  update public.jobs set updated_at=now() where id=j.id;
 end loop;
 for w in select w.id from public.workers w left join public.worker_metrics m on m.worker_id=w.id where w.account_standing='good' order by m.updated_at nulls first,w.id limit 100 loop perform private.refresh_metrics(w.id); end loop;
 delete from private.rate_limits where bucket<now()-interval '1 day';
 delete from private.mutations where created_at<now()-interval '30 days';
 delete from private.push_tokens where updated_at<now()-interval '90 days';
 update public.workers set available=false where available and not exists(select 1 from public.worker_locations l where l.worker_id=id and l.updated_at>now()-interval '15 minutes');
 return n;
end $$;
alter table public.payments add column reconciled_at timestamptz;
alter table private.payment_operations add column reconciled_at timestamptz;
create or replace function public.reconciliation_batch() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('payments',coalesce((select jsonb_agg(stripe_intent_id) from (select stripe_intent_id from public.payments where state in ('pending','authorized') order by reconciled_at nulls first limit 30) p),'[]'),'checkouts',coalesce((select jsonb_agg(provider_id) from (select provider_id from private.payment_operations where action='checkout' and provider_id is not null and state='pending' order by reconciled_at nulls first limit 20) c),'[]'));
$$;
create function public.mark_reconciled(p_provider text) returns void language sql security definer set search_path='' as $$
 update public.payments set reconciled_at=now() where stripe_intent_id=p_provider;
 update private.payment_operations set reconciled_at=now() where provider_id=p_provider;
$$;
revoke all on function public.register_push_token(text) from public,anon;
grant execute on function public.register_push_token(text) to authenticated;
revoke all on function public.push_recipients(uuid),public.remove_push_token(text),public.mark_reconciled(text) from public,anon,authenticated;
grant execute on function public.push_recipients(uuid),public.remove_push_token(text),public.mark_reconciled(text) to service_role;
revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
