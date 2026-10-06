-- Metre precision and invertible scores can reveal job coordinates before a match.
-- Realtime retains only the columns needed to signal updates for owned offers.
revoke select on public.job_offers from authenticated;
grant select(id,job_id,worker_id,state,wave,expires_at,created_at,slot) on public.job_offers to authenticated;
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
 'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'expires_at',o.expires_at,'eta_seconds',greatest(1,ceil(o.eta_seconds/300.0)::integer)*300,'distance_m',greatest(1,ceil(o.distance_m/1000.0)::integer)*1000,'job',private.job_json(j,a)) order by o.score desc,o.id) from public.job_offers o join public.jobs j on j.id=o.job_id where o.worker_id=a and o.state='pending' and o.expires_at>now() and j.status='offered'),'[]'),
 'bank_payouts',coalesce((select jsonb_agg(to_jsonb(bp)) from (select * from public.bank_payouts where worker_id=a order by updated_at desc limit 20) bp),'[]'),
 'payouts',coalesce((select jsonb_agg(to_jsonb(p)) from (select * from public.payouts where worker_id=a order by created_at desc,id desc limit 40) p),'[]')) into result;
 return result;
end $$;


create or replace function private.redact_deleted_job_details() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.deleted_at is null and new.deleted_at is not null then
  update public.jobs set title='Removed job',description='Job details removed' where customer_id=new.id;
  delete from private.mutations where actor=new.id;
  delete from private.rate_limits where actor=new.id;
 end if;
 return new;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
