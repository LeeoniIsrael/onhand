-- A verified worker cannot change the displayed identity without a fresh review.
create function private.recheck_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role='worker' and new.deleted_at is null and new.display_name<>old.display_name then
  update public.workers set identity_verified=false,available=false,account_standing='pending' where id=new.id;
  update public.job_offers set state='expired' where worker_id=new.id and state='pending';
 end if;
 return new;
end $$;
create trigger worker_identity_name_change after update on public.profiles for each row execute function private.recheck_identity();
revoke all on all functions in schema private from public,anon,authenticated;
