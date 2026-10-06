-- Normal chunked cleanup is progress, not a failed retry. Large accounts can
-- finish erasure without exhausting the failure budget.
create index photo_erasure_owner on public.job_photos(owner_id);
create index message_erasure_sender on public.messages(sender_id);
create function public.continue_outbox(p_id uuid) returns void language sql security definer set search_path='' as $$
 update private.outbox set state='pending',locked_at=null,last_error=null,available_at=now()+interval '1 second',attempts=greatest(0,attempts-1) where id=p_id and state='processing';
$$;
revoke all on function public.continue_outbox(uuid) from public,anon,authenticated;
grant execute on function public.continue_outbox(uuid) to service_role;

create function private.redact_deleted_job_details() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.deleted_at is null and new.deleted_at is not null then
  update public.jobs set title='Removed job',description='Job details removed' where customer_id=new.id;
 end if;
 return new;
end $$;
create trigger account_job_details_erasure after update on public.profiles for each row execute function private.redact_deleted_job_details();
revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
