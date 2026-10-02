-- Deduplication and state changes commit together, so a retry cannot lose an event.
create function public.apply_stripe_event(p_event text,p_type text,p_intent text,p_amount integer,p_state text) returns void language plpgsql security definer set search_path='' as $$
declare p public.payments; j public.jobs;
begin
  if p_state not in ('authorized','captured','failed') then raise exception 'Invalid payment state'; end if;
  insert into public.stripe_events(id,type) values(p_event,p_type) on conflict do nothing;
  if not found then return; end if;
  select * into p from public.payments where stripe_intent_id=p_intent for update;
  if not found then raise exception 'Payment not yet recorded'; end if;
  if p.amount_cents<>p_amount then raise exception 'Amount mismatch'; end if;
  if p.state in ('captured','refunded') then return; end if;
  update public.payments set state=p_state where id=p.id;
  if p_state='captured' then
    select * into j from public.jobs where id=p.job_id for update;
    if j.status='awaiting_completion_confirmation' then
      update public.jobs set status='completed' where id=j.id;
      insert into public.payouts(payment_id,worker_id,amount_cents,state) values(p.id,j.worker_id,p.amount_cents-p.fee_cents+p.tip_cents,'scheduled');
      update public.workers set available=true where id=j.worker_id;
    end if;
  end if;
end $$;
revoke all on function public.apply_stripe_event(text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.apply_stripe_event(text,text,text,integer,text) to service_role;
