-- Fat-Loss Planner v2 — run once in Supabase SQL editor (project etfhuwopqjderqutlyhk)
create table if not exists public.flp_data(user_id uuid primary key references auth.users on delete cascade, data jsonb not null, updated_at timestamptz not null default now());
alter table public.flp_data enable row level security;
drop policy if exists flp_data_own on public.flp_data;
create policy flp_data_own on public.flp_data for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- trial clock: insert-only (no update/delete policy) so reinstalling or editing can't reset it
create table if not exists public.flp_entitlements(user_id uuid primary key references auth.users on delete cascade, trial_started_at timestamptz not null, created_at timestamptz not null default now());
alter table public.flp_entitlements enable row level security;
drop policy if exists flp_ent_read on public.flp_entitlements; drop policy if exists flp_ent_ins on public.flp_entitlements;
create policy flp_ent_read on public.flp_entitlements for select using (auth.uid()=user_id);
create policy flp_ent_ins on public.flp_entitlements for insert with check (auth.uid()=user_id and trial_started_at<=now()+interval '1 hour');

-- Coach / Doctor sharing: ONLY workouts + diet. Owner writes; coach reads/suggests via secret link token.
create table if not exists public.flp_shares(token text primary key, user_id uuid not null references auth.users on delete cascade, coach_name text, snapshot jsonb not null, coach_targets jsonb, coach_note text, coach_updated_at timestamptz, updated_at timestamptz not null default now(), revoked boolean not null default false);
alter table public.flp_shares enable row level security;
drop policy if exists flp_shares_own on public.flp_shares;
create policy flp_shares_own on public.flp_shares for all using (auth.uid()=user_id) with check (auth.uid()=user_id and length(token)>=32);
create or replace function public.flp_share_get(p_token text) returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object('snapshot',snapshot,'coach_targets',coach_targets,'coach_note',coach_note,'updated_at',updated_at) from flp_shares where token=p_token and not revoked $$;
create or replace function public.flp_share_suggest(p_token text, p_targets jsonb, p_note text) returns boolean language plpgsql security definer set search_path=public as $$
begin update flp_shares set coach_targets=jsonb_build_object('kcal',(p_targets->>'kcal')::int,'p',(p_targets->>'p')::int,'c',(p_targets->>'c')::int,'f',(p_targets->>'f')::int,'fib',(p_targets->>'fib')::int), coach_note=left(p_note,2000), coach_updated_at=now() where token=p_token and not revoked; return found; end $$;
grant execute on function public.flp_share_get(text), public.flp_share_suggest(text,jsonb,text) to anon, authenticated;

-- account deletion (App Store guideline 5.1.1(v))
create or replace function public.flp_delete_me() returns void language plpgsql security definer set search_path=public as $$
begin delete from flp_shares where user_id=auth.uid(); delete from flp_data where user_id=auth.uid(); end $$;
grant execute on function public.flp_delete_me() to authenticated;
