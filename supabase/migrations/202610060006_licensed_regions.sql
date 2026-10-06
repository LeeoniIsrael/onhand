-- A customer-entered state is not proof of licensing jurisdiction. Regulated
-- work must also lie inside an operator-reviewed service polygon.
create table private.service_regions(zone text primary key,boundary extensions.geometry(MultiPolygon,4326) not null,operator text not null,note text not null,updated_at timestamptz not null default now());
create index service_region_boundary on private.service_regions using gist(boundary);
create table private.region_reviews(id bigint generated always as identity primary key,zone text not null,operator text not null,note text not null,at timestamptz not null default now());
create function public.configure_service_region(p_zone text,p_geometry jsonb,p_operator text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare boundary extensions.geometry;
begin
 if p_zone is null or char_length(trim(p_zone)) not between 2 and 120 or p_operator is null or char_length(trim(p_operator)) not between 2 and 120 or p_note is null or char_length(trim(p_note)) not between 10 and 2000 or octet_length(p_geometry::text)>2000000 then raise exception 'Region, operator and review evidence are required'; end if;
 boundary:=extensions.st_force2d(extensions.st_geomfromgeojson(p_geometry));
 if boundary is null or extensions.st_srid(boundary)<>4326 or extensions.st_geometrytype(boundary) not in ('ST_Polygon','ST_MultiPolygon') or not extensions.st_isvalid(boundary) or extensions.st_isempty(boundary) then raise exception 'Use a valid WGS84 Polygon or MultiPolygon geometry'; end if;
 if not extensions.st_coveredby(boundary,extensions.st_makeenvelope(-180,-90,180,90,4326)) then raise exception 'Region coordinates are out of range'; end if;
 insert into private.service_regions(zone,boundary,operator,note) values(upper(trim(p_zone)),extensions.st_multi(boundary),trim(p_operator),trim(p_note)) on conflict(zone) do update set boundary=excluded.boundary,operator=excluded.operator,note=excluded.note,updated_at=now();
 insert into private.region_reviews(zone,operator,note) values(upper(trim(p_zone)),trim(p_operator),trim(p_note));
end $$;
revoke all on function public.configure_service_region(text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.configure_service_region(text,jsonb,text,text) to service_role;

create function public.licensed_address_available(p_address uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_actor('customer');
begin
 return exists(select 1 from public.saved_addresses a join private.service_regions r on r.zone=a.zone where a.id=p_address and a.owner_id=actor and extensions.st_covers(r.boundary,extensions.st_setsrid(extensions.st_makepoint(a.longitude,a.latitude),4326)));
end $$;
revoke all on function public.licensed_address_available(uuid) from public,anon;
grant execute on function public.licensed_address_available(uuid) to authenticated;

create function private.guard_licensed_region() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.jobs j where j.id=new.id and j.requires_license and j.status not in ('completed','cancelled','disputed')) and not exists(select 1 from public.jobs j join public.job_private a on a.job_id=j.id join private.service_regions r on r.zone=j.approximate_zone where j.id=new.id and extensions.st_covers(r.boundary,a.position::extensions.geometry)) then raise exception 'Licensed work is not available at this address'; end if;
 return new;
end $$;
create constraint trigger licensed_job_region after insert or update on public.jobs deferrable initially deferred for each row execute function private.guard_licensed_region();
revoke all on all functions in schema private from public,anon,authenticated;
notify pgrst,'reload schema';
