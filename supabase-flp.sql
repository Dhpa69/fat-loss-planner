-- Fat-Loss Planner v2 — run once in the Supabase SQL editor (project etfhuwopqjderqutlyhk). Safe to re-run.
-- Coaching is a wellness/coaching tool, NOT a medical record. Shared scope = diet + workouts ONLY.
create extension if not exists pgcrypto;

-- ===== personal cloud sync (owner only) =====
create table if not exists public.flp_data(user_id uuid primary key references auth.users on delete cascade, data jsonb not null, updated_at timestamptz not null default now());
alter table public.flp_data enable row level security;
drop policy if exists flp_data_own on public.flp_data;
create policy flp_data_own on public.flp_data for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- ===== trial clock: insert-only, so it can't be reset =====
create table if not exists public.flp_entitlements(user_id uuid primary key references auth.users on delete cascade, trial_started_at timestamptz not null, created_at timestamptz not null default now());
alter table public.flp_entitlements enable row level security;
drop policy if exists flp_ent_read on public.flp_entitlements; drop policy if exists flp_ent_ins on public.flp_entitlements;
create policy flp_ent_read on public.flp_entitlements for select using (auth.uid()=user_id);
create policy flp_ent_ins on public.flp_entitlements for insert with check (auth.uid()=user_id and trial_started_at<=now()+interval '1 hour');
-- survives account deletion: only a salted hash of the sign-in email (no personal data). No client access at all.
create table if not exists public.flp_trial_hashes(hash text primary key, trial_started_at timestamptz not null, created_at timestamptz not null default now());
alter table public.flp_trial_hashes enable row level security;
create or replace function public.flp_email_hash(p_email text) returns text language sql immutable as $$ select encode(digest('flp-trial-v1:'||lower(trim(coalesce(p_email,''))),'sha256'),'hex') $$;
-- called after sign-in: if this email already used a trial (even on a deleted account), restore that start date
create or replace function public.flp_trial_check() returns timestamptz language plpgsql security definer set search_path=public as $$
declare t timestamptz; e text := (select email from auth.users where id=auth.uid());
begin
  if auth.uid() is null then return null; end if;
  select trial_started_at into t from flp_trial_hashes where hash=flp_email_hash(e) and e is not null;
  if t is not null then insert into flp_entitlements(user_id,trial_started_at) values(auth.uid(),t) on conflict(user_id) do update set trial_started_at=least(flp_entitlements.trial_started_at,excluded.trial_started_at); end if;
  return coalesce(t,(select trial_started_at from flp_entitlements where user_id=auth.uid()));
end $$;

-- ===== coaching (two-sided) =====
create table if not exists public.flp_profiles(user_id uuid primary key references auth.users on delete cascade, role text not null check (role in ('patient','coach')), display_name text not null default '' check (length(display_name)<=60), updated_at timestamptz not null default now());
create table if not exists public.flp_invites(code text primary key, patient_id uuid not null references auth.users on delete cascade, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '48 hours', used_by uuid references auth.users on delete set null);
create table if not exists public.flp_links(id uuid primary key default gen_random_uuid(), patient_id uuid not null references auth.users on delete cascade, coach_id uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','revoked','declined','left')), created_at timestamptz not null default now(), consented_at timestamptz, ended_at timestamptz, unique(patient_id,coach_id));
create table if not exists public.flp_patient_share(patient_id uuid primary key references auth.users on delete cascade, data jsonb not null default '{}', summary jsonb not null default '{}', updated_at timestamptz not null default now());
create table if not exists public.flp_coach_items(id uuid primary key default gen_random_uuid(), patient_id uuid not null references auth.users on delete cascade, coach_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('note','targets','workout')), body jsonb not null, status text not null default 'pending' check (status in ('pending','accepted','declined','info')), created_at timestamptz not null default now(), responded_at timestamptz);
create table if not exists public.flp_access_log(id bigserial primary key, patient_id uuid not null references auth.users on delete cascade, actor_id uuid references auth.users on delete set null, actor_name text, action text not null, at timestamptz not null default now());
create index if not exists flp_items_p on public.flp_coach_items(patient_id,created_at desc);
create index if not exists flp_log_p on public.flp_access_log(patient_id,at desc);

-- Strict RLS: direct table access is limited to your OWN rows. Every coach read/write goes through the
-- security-definer functions below, which check for an ACTIVE, patient-consented link and write the audit log.
alter table public.flp_profiles enable row level security; alter table public.flp_invites enable row level security; alter table public.flp_links enable row level security;
alter table public.flp_patient_share enable row level security; alter table public.flp_coach_items enable row level security; alter table public.flp_access_log enable row level security;
drop policy if exists flp_prof_own on public.flp_profiles; create policy flp_prof_own on public.flp_profiles for select using (auth.uid()=user_id);
drop policy if exists flp_share_own on public.flp_patient_share; create policy flp_share_own on public.flp_patient_share for select using (auth.uid()=patient_id);
drop policy if exists flp_links_mine on public.flp_links; create policy flp_links_mine on public.flp_links for select using (auth.uid() in (patient_id,coach_id));
drop policy if exists flp_items_mine on public.flp_coach_items; create policy flp_items_mine on public.flp_coach_items for select using (auth.uid()=patient_id or (auth.uid()=coach_id and exists(select 1 from flp_links l where l.patient_id=flp_coach_items.patient_id and l.coach_id=auth.uid() and l.status='active')));
drop policy if exists flp_log_own on public.flp_access_log; create policy flp_log_own on public.flp_access_log for select using (auth.uid()=patient_id);
-- (no insert/update/delete policies on coaching tables: only the functions below can change them)

create or replace function public.flp_name(u uuid) returns text language sql stable security definer set search_path=public as $$ select coalesce(nullif(display_name,''),'(no name)') from flp_profiles where user_id=u $$;
create or replace function public.flp_is_linked(p uuid, c uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from flp_links where patient_id=p and coach_id=c and status='active') $$;
create or replace function public.flp_log(p uuid, a text) returns void language sql security definer set search_path=public as $$ insert into flp_access_log(patient_id,actor_id,actor_name,action) values(p,auth.uid(),flp_name(auth.uid()),a) $$;

create or replace function public.flp_set_role(p_role text, p_name text) returns jsonb language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into flp_profiles(user_id,role,display_name) values(auth.uid(),p_role,left(coalesce(p_name,''),60))
  on conflict(user_id) do update set role=excluded.role,display_name=excluded.display_name,updated_at=now();
  return jsonb_build_object('role',p_role,'name',left(coalesce(p_name,''),60)); end $$;
create or replace function public.flp_my_profile() returns jsonb language sql stable security definer set search_path=public as $$ select jsonb_build_object('role',role,'name',display_name) from flp_profiles where user_id=auth.uid() $$;

-- patient: create a one-time invite code (8 chars, 48 h)
create or replace function public.flp_create_invite() returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from flp_invites where patient_id=auth.uid() and used_by is null;
  c := substr(translate(upper(encode(gen_random_bytes(9),'base64')),'+/=01OI','XYZABCD'),1,8);
  insert into flp_invites(code,patient_id) values(c,auth.uid()); perform flp_log(auth.uid(),'invite created'); return c; end $$;
-- coach: redeem a code -> PENDING link; nothing is shared until the patient approves
create or replace function public.flp_redeem_invite(p_code text) returns jsonb language plpgsql security definer set search_path=public as $$
declare i flp_invites; lid uuid;
begin if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce((select role from flp_profiles where user_id=auth.uid()),'')<>'coach' then raise exception 'Choose the Coach / Doctor role first'; end if;
  select * into i from flp_invites where code=upper(trim(p_code)) and used_by is null and expires_at>now() for update;
  if i.code is null then raise exception 'Invite code not found or expired'; end if;
  if i.patient_id=auth.uid() then raise exception 'You cannot link to yourself'; end if;
  update flp_invites set used_by=auth.uid() where code=i.code;
  insert into flp_links(patient_id,coach_id,status) values(i.patient_id,auth.uid(),'pending')
    on conflict(patient_id,coach_id) do update set status='pending',consented_at=null,ended_at=null,created_at=now() returning id into lid;
  perform flp_log(i.patient_id,'requested access');
  return jsonb_build_object('link_id',lid,'patient_name',flp_name(i.patient_id),'status','pending'); end $$;
-- patient: approve / decline / revoke.  coach: leave
create or replace function public.flp_set_link(p_link uuid, p_action text) returns text language plpgsql security definer set search_path=public as $$
declare l flp_links;
begin select * into l from flp_links where id=p_link for update; if l.id is null then raise exception 'link not found'; end if;
  if auth.uid()=l.patient_id and p_action='approve' and l.status='pending' then update flp_links set status='active',consented_at=now() where id=l.id; perform flp_log(l.patient_id,'consent given to '||flp_name(l.coach_id));
  elsif auth.uid()=l.patient_id and p_action='decline' and l.status='pending' then update flp_links set status='declined',ended_at=now() where id=l.id; perform flp_log(l.patient_id,'request declined: '||flp_name(l.coach_id));
  elsif auth.uid()=l.patient_id and p_action='revoke' then update flp_links set status='revoked',ended_at=now() where id=l.id; perform flp_log(l.patient_id,'access revoked from '||flp_name(l.coach_id));
  elsif auth.uid()=l.coach_id and p_action='leave' then update flp_links set status='left',ended_at=now() where id=l.id; perform flp_log(l.patient_id,'coach stopped coaching');
  else raise exception 'not allowed'; end if; return p_action; end $$;
create or replace function public.flp_patient_links() returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'coach_name',flp_name(coach_id),'status',status,'created_at',created_at,'consented_at',consented_at) order by created_at desc),'[]') from flp_links where patient_id=auth.uid() and status in ('pending','active') $$;
-- patient: publish diet + workouts snapshot (server strips anything outside scope)
create or replace function public.flp_publish(p_data jsonb, p_summary jsonb) returns void language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into flp_patient_share(patient_id,data,summary,updated_at) values(auth.uid(),
    jsonb_strip_nulls(jsonb_build_object('targets',p_data->'targets','food',p_data->'food','meals',p_data->'meals','workouts',jsonb_build_object('sel',p_data#>'{workouts,sel}','custom',p_data#>'{workouts,custom}','tpl',p_data#>'{workouts,tpl}','extra',p_data#>'{workouts,extra}','log',p_data#>'{workouts,log}'),'at',p_data->'at')),
    jsonb_build_object('last_log',p_summary->'last_log','streak',p_summary->'streak','food_days_7',p_summary->'food_days_7','avg_kcal_7',p_summary->'avg_kcal_7','kcal_target',p_summary->'kcal_target','workouts_7',p_summary->'workouts_7','protein_hit_7',p_summary->'protein_hit_7'),now())
  on conflict(patient_id) do update set data=excluded.data,summary=excluded.summary,updated_at=now(); end $$;
-- coach: list of linked patients (active + pending)
create or replace function public.flp_coach_patients() returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('link_id',l.id,'patient_id',l.patient_id,'name',flp_name(l.patient_id),'status',l.status,'since',l.consented_at,
     'summary',case when l.status='active' then s.summary end,'updated_at',case when l.status='active' then s.updated_at end) order by l.status, flp_name(l.patient_id)),'[]')
  from flp_links l left join flp_patient_share s on s.patient_id=l.patient_id where l.coach_id=auth.uid() and l.status in ('pending','active') $$;
-- coach: one patient's dashboard (logged)
create or replace function public.flp_coach_patient(p_patient uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb;
begin if not flp_is_linked(p_patient,auth.uid()) then raise exception 'no active consent'; end if;
  perform flp_log(p_patient,'viewed diet & workouts');
  select jsonb_build_object('name',flp_name(p_patient),'data',s.data,'summary',s.summary,'updated_at',s.updated_at,
    'items',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'status',status,'created_at',created_at,'responded_at',responded_at) order by created_at desc),'[]') from (select * from flp_coach_items where patient_id=p_patient and coach_id=auth.uid() order by created_at desc limit 50) x))
  into r from (select 1) one left join flp_patient_share s on s.patient_id=p_patient; return r; end $$;
-- coach: send note / calorie+macro targets / workout target
create or replace function public.flp_coach_send(p_patient uuid, p_kind text, p_body jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid; b jsonb;
begin if not flp_is_linked(p_patient,auth.uid()) then raise exception 'no active consent'; end if;
  if p_kind='targets' then b:=jsonb_strip_nulls(jsonb_build_object('kcal',(p_body->>'kcal')::int,'p',(p_body->>'p')::int,'c',(p_body->>'c')::int,'f',(p_body->>'f')::int,'fib',(p_body->>'fib')::int,'note',left(p_body->>'note',1000)));
  elsif p_kind='workout' then b:=jsonb_strip_nulls(jsonb_build_object('per_week',(p_body->>'per_week')::int,'minutes',(p_body->>'minutes')::int,'note',left(p_body->>'note',1000)));
  elsif p_kind='note' then b:=jsonb_build_object('text',left(p_body->>'text',2000));
  else raise exception 'bad kind'; end if;
  insert into flp_coach_items(patient_id,coach_id,kind,body,status) values(p_patient,auth.uid(),p_kind,b,case when p_kind='note' then 'info' else 'pending' end) returning flp_coach_items.id into id;
  perform flp_log(p_patient,'sent '||p_kind); return id; end $$;
-- patient: inbox + respond
create or replace function public.flp_my_items() returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'body',body,'status',status,'created_at',created_at,'coach_name',flp_name(coach_id)) order by created_at desc),'[]')
  from (select * from flp_coach_items where patient_id=auth.uid() order by created_at desc limit 50) x $$;
create or replace function public.flp_respond(p_item uuid, p_status text) returns text language plpgsql security definer set search_path=public as $$
begin if p_status not in ('accepted','declined') then raise exception 'bad status'; end if;
  update flp_coach_items set status=p_status,responded_at=now() where id=p_item and patient_id=auth.uid() and status='pending';
  if not found then raise exception 'not found'; end if; perform flp_log(auth.uid(),'target '||p_status); return p_status; end $$;
create or replace function public.flp_access_log_mine() returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('who',coalesce(actor_name,'(deleted)'),'action',action,'at',at) order by at desc),'[]') from (select * from flp_access_log where patient_id=auth.uid() order by at desc limit 40) x $$;

-- data-only deletion (the Edge Function "flp-delete-account" deletes the sign-in too)
create or replace function public.flp_delete_me() returns void language plpgsql security definer set search_path=public as $$
declare e text := (select email from auth.users where id=auth.uid()); t timestamptz := (select trial_started_at from flp_entitlements where user_id=auth.uid());
begin if t is not null and e is not null then insert into flp_trial_hashes(hash,trial_started_at) values(flp_email_hash(e),t) on conflict(hash) do update set trial_started_at=least(flp_trial_hashes.trial_started_at,excluded.trial_started_at); end if;
  delete from flp_links where patient_id=auth.uid() or coach_id=auth.uid(); delete from flp_coach_items where patient_id=auth.uid() or coach_id=auth.uid();
  delete from flp_patient_share where patient_id=auth.uid(); delete from flp_invites where patient_id=auth.uid(); delete from flp_access_log where patient_id=auth.uid();
  delete from flp_profiles where user_id=auth.uid(); delete from flp_data where user_id=auth.uid(); end $$;

-- Old read-only share links from the first draft are replaced by the two-sided coaching above.
drop function if exists public.flp_share_get(text); drop function if exists public.flp_share_suggest(text,jsonb,text); drop table if exists public.flp_shares;

revoke all on function public.flp_email_hash(text), public.flp_name(uuid), public.flp_is_linked(uuid,uuid), public.flp_log(uuid,text) from public, anon, authenticated;
grant execute on function public.flp_trial_check(), public.flp_set_role(text,text), public.flp_my_profile(), public.flp_create_invite(), public.flp_redeem_invite(text), public.flp_set_link(uuid,text),
  public.flp_patient_links(), public.flp_publish(jsonb,jsonb), public.flp_coach_patients(), public.flp_coach_patient(uuid), public.flp_coach_send(uuid,text,jsonb), public.flp_my_items(), public.flp_respond(uuid,text),
  public.flp_access_log_mine(), public.flp_delete_me() to authenticated;
revoke execute on function public.flp_trial_check(), public.flp_set_role(text,text), public.flp_my_profile(), public.flp_create_invite(), public.flp_redeem_invite(text), public.flp_set_link(uuid,text),
  public.flp_patient_links(), public.flp_publish(jsonb,jsonb), public.flp_coach_patients(), public.flp_coach_patient(uuid), public.flp_coach_send(uuid,text,jsonb), public.flp_my_items(), public.flp_respond(uuid,text),
  public.flp_access_log_mine(), public.flp_delete_me() from anon, public;
