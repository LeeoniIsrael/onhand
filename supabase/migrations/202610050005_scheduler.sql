create function public.queue_push_receipt(p_ticket text,p_token text) returns void language plpgsql security definer set search_path='' as $$
begin insert into private.outbox(topic,aggregate_id,payload,available_at) values('push_receipt',gen_random_uuid(),jsonb_build_object('ticket',p_ticket,'token',p_token),now()+interval '15 minutes'); end $$;
create function public.unregister_device(p_token text) returns void language plpgsql security definer set search_path='' as $$
begin delete from private.push_tokens where token=p_token and actor=private.require_actor(); end $$;
revoke all on function public.queue_push_receipt(text,text) from public,anon,authenticated;
grant execute on function public.queue_push_receipt(text,text) to service_role;
revoke all on function public.unregister_device(text) from public,anon;
grant execute on function public.unregister_device(text) to authenticated;
-- Production operators enable a free scheduler after deploying functions. Credentials stay in Vault.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create function public.configure_operations(p_url text,p_secret text) returns void language plpgsql security definer set search_path='' as $$
declare secret_id uuid; endpoint_id uuid;
begin
 if p_url !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/operations$' or char_length(p_secret)<32 then raise exception 'Use your hosted HTTPS operations endpoint and a strong server secret'; end if;
 select id into secret_id from vault.secrets where name='onhand_operations_secret';
 if secret_id is null then perform vault.create_secret(p_secret,'onhand_operations_secret');else perform vault.update_secret(secret_id,p_secret);end if;
 select id into endpoint_id from vault.secrets where name='onhand_operations_url';
 if endpoint_id is null then perform vault.create_secret(p_url,'onhand_operations_url');else perform vault.update_secret(endpoint_id,p_url);end if;
 perform cron.schedule('onhand-operations','* * * * *',$job$
 select net.http_post(url:=(select decrypted_secret from vault.decrypted_secrets where name='onhand_operations_url'),headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='onhand_operations_secret')),body:='{}'::jsonb,timeout_milliseconds:=50000);
 $job$);
end $$;
revoke all on function public.configure_operations(text,text) from public,anon,authenticated;
grant execute on function public.configure_operations(text,text) to service_role;
revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
