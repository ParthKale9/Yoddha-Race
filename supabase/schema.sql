-- =====================================================================
-- Yoddha Race — Athletes Fitness Club
-- Run this whole file once in the Supabase SQL editor.
--
-- Race model: athletes race in waves. Each athlete has one dedicated
-- volunteer who follows them through all 7 stations. When the whistle
-- blows for a wave, the admin starts that wave's clock. The assigned
-- volunteer taps "arrived" / "left" at each station (this drives both
-- the station-wise leaderboard and the overall time) and taps "finish"
-- at the end, which stops the athlete's overall clock.
-- =====================================================================

create extension if not exists pgcrypto;

create type gender_t as enum ('male', 'female');
create type role_t   as enum ('admin', 'volunteer');
create type metric_t as enum ('reps', 'time');

-- ---------- Tables ----------------------------------------------------

create table heats (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  starts_at  timestamptz,       -- scheduled slot, shown at registration
  started_at timestamptz,       -- set the moment the whistle actually blows
  capacity   int  not null check (capacity > 0)
);

create table stations (
  id          serial primary key,
  name        text not null,
  position    int  not null unique,   -- order in the race (1–7)
  metric      metric_t not null default 'time',
  target_reps int,                    -- fixed rep count for this station, if any
  spec_male   text,                   -- what men do here, e.g. '50 m, 150 kg'
  spec_female text                    -- what women do here
);

create table athletes (
  id              uuid primary key default gen_random_uuid(),
  bib_no          int generated always as identity (start with 101) unique,
  name            text     not null,
  gender          gender_t not null,
  age             int      not null check (age between 10 and 90),
  phone           text     not null,
  email           text     not null,
  emergency_name  text     not null,
  emergency_phone text     not null,
  waiver_accepted boolean  not null check (waiver_accepted),
  heat_id         uuid references heats(id),
  created_at      timestamptz not null default now()
);

create table profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role      role_t not null default 'volunteer'
);

-- Which volunteer is following which athlete. One row per athlete;
-- the admin sets this up before each wave starts (or reassigns it).
create table assignments (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null unique references athletes(id),
  volunteer_id uuid not null references auth.users(id),
  created_at   timestamptz not null default now()
);

create table station_logs (
  id             uuid primary key default gen_random_uuid(),
  athlete_id     uuid not null references athletes(id),
  station_id     int  not null references stations(id),
  checked_in_at  timestamptz not null default now(),
  checked_out_at timestamptz,
  reps           int check (reps >= 0),
  recorded_by    uuid references auth.users(id),
  voided         boolean not null default false,
  void_reason    text,
  created_at     timestamptz not null default now()
);
-- one live record per athlete per station
create unique index one_log_per_station on station_logs (athlete_id, station_id) where not voided;

-- the finish line: one row per athlete once their volunteer ends the clock
create table race_results (
  athlete_id  uuid primary key references athletes(id),
  finished_at timestamptz not null,
  recorded_by uuid references auth.users(id)
);

create table penalties (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id),
  station_id int  references stations(id),
  reason     text not null,
  seconds    int  not null check (seconds >= 0),
  added_by   uuid references auth.users(id),
  voided     boolean not null default false,
  created_at timestamptz not null default now()
);

create table audit_log (
  id         bigserial primary key,
  actor      uuid,
  action     text not null,
  table_name text not null,
  row_id     text,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Helpers ---------------------------------------------------

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- true if the signed-in volunteer is the one following this athlete
create or replace function is_assigned(p_athlete uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assignments where athlete_id = p_athlete and volunteer_id = auth.uid());
$$;

-- new sign-ups get a volunteer profile automatically
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- audit trail for race data
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor, action, table_name, row_id, old_data, new_data)
  values (auth.uid(), tg_op, tg_table_name,
          coalesce(new.id, old.id)::text,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_station_logs after insert or update or delete on station_logs
  for each row execute function audit_row();
create trigger audit_penalties after insert or update or delete on penalties
  for each row execute function audit_row();
create trigger audit_race_results after insert or update or delete on race_results
  for each row execute function audit_row();

-- ---------- Registration (public) ------------------------------------
-- Locks the heat row so two people cannot take the last spot together.

create or replace function register_athlete(
  p_name text, p_gender gender_t, p_age int, p_phone text, p_email text,
  p_emergency_name text, p_emergency_phone text,
  p_waiver boolean, p_heat_id uuid default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_capacity int;
  v_taken    int;
  v_bib      int;
begin
  if not p_waiver then
    raise exception 'You must accept the waiver to register';
  end if;

  -- Athletes no longer pick a heat/wave at registration; the admin
  -- assigns one later. If a heat IS passed (e.g. a future admin tool),
  -- still enforce its capacity.
  if p_heat_id is not null then
    select capacity into v_capacity from heats where id = p_heat_id for update;
    if v_capacity is null then
      raise exception 'Selected heat does not exist';
    end if;
    select count(*) into v_taken from athletes where heat_id = p_heat_id;
    if v_taken >= v_capacity then
      raise exception 'This heat is full. Please choose another slot';
    end if;
  end if;

  insert into athletes (name, gender, age, phone, email, emergency_name,
                        emergency_phone, waiver_accepted, heat_id)
  values (trim(p_name), p_gender, p_age, trim(p_phone), lower(trim(p_email)),
          trim(p_emergency_name), trim(p_emergency_phone), true, p_heat_id)
  returning bib_no into v_bib;

  return v_bib;
end $$;

-- ---------- Admin: waves & assignments --------------------------------

-- Blow the whistle: starts the clock for every athlete in this wave.
create or replace function start_wave(p_heat_id uuid) returns heats
language plpgsql security definer set search_path = public as $$
declare v_row heats;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update heats set started_at = now() where id = p_heat_id returning * into v_row;
  if v_row.id is null then raise exception 'Heat not found'; end if;
  return v_row;
end $$;

-- Assign (or reassign) the volunteer who will follow this athlete.
create or replace function assign_volunteer(p_bib int, p_volunteer uuid) returns assignments
language plpgsql security definer set search_path = public as $$
declare v_athlete uuid; v_row assignments;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  select id into v_athlete from athletes where bib_no = p_bib;
  if v_athlete is null then raise exception 'No athlete with bib %', p_bib; end if;
  insert into assignments (athlete_id, volunteer_id) values (v_athlete, p_volunteer)
  on conflict (athlete_id) do update set volunteer_id = excluded.volunteer_id, created_at = now()
  returning * into v_row;
  return v_row;
end $$;

create or replace function unassign_volunteer(p_bib int) returns void
language plpgsql security definer set search_path = public as $$
declare v_athlete uuid;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  select id into v_athlete from athletes where bib_no = p_bib;
  delete from assignments where athlete_id = v_athlete;
end $$;

-- ---------- Volunteer actions ------------------------------------------
-- A volunteer may only act on the one athlete assigned to them.
-- Admins may act on anyone (for corrections, testing or backup entry).

create or replace function check_in(p_bib int, p_station int)
returns station_logs
language plpgsql security definer set search_path = public as $$
declare
  v_athlete uuid;
  v_row     station_logs;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  select id into v_athlete from athletes where bib_no = p_bib;
  if v_athlete is null then raise exception 'No athlete with bib %', p_bib; end if;
  if not (is_admin() or is_assigned(v_athlete)) then
    raise exception 'You are not the assigned volunteer for this athlete';
  end if;

  insert into station_logs (athlete_id, station_id, recorded_by)
  values (v_athlete, p_station, auth.uid())
  returning * into v_row;
  return v_row;
exception when unique_violation then
  raise exception 'Bib % is already logged at this station', p_bib;
end $$;

create or replace function check_out(p_log_id uuid, p_reps int default null)
returns station_logs
language plpgsql security definer set search_path = public as $$
declare v_athlete uuid; v_row station_logs;
begin
  select athlete_id into v_athlete from station_logs where id = p_log_id;
  if v_athlete is null then raise exception 'Entry not found'; end if;
  if not (is_admin() or is_assigned(v_athlete)) then
    raise exception 'You are not the assigned volunteer for this athlete';
  end if;

  update station_logs
     set checked_out_at = now(), reps = p_reps
   where id = p_log_id and checked_out_at is null and not voided
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Could not check out: record not found or already closed';
  end if;
  return v_row;
end $$;

-- volunteers can undo their own entry for 10 minutes; admins any time
create or replace function undo_log(p_log_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update station_logs
     set voided = true, void_reason = 'Undone by ' || coalesce(auth.uid()::text, 'unknown')
   where id = p_log_id
     and not voided
     and (is_admin()
          or (recorded_by = auth.uid() and created_at > now() - interval '10 minutes'));
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Cannot undo: entry is too old or was not recorded by you';
  end if;
end $$;

create or replace function add_penalty(
  p_bib int, p_reason text, p_seconds int, p_station int default null
) returns penalties
language plpgsql security definer set search_path = public as $$
declare
  v_athlete uuid;
  v_row     penalties;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  select id into v_athlete from athletes where bib_no = p_bib;
  if v_athlete is null then raise exception 'No athlete with bib %', p_bib; end if;
  if not (is_admin() or is_assigned(v_athlete)) then
    raise exception 'You are not the assigned volunteer for this athlete';
  end if;
  insert into penalties (athlete_id, station_id, reason, seconds, added_by)
  values (v_athlete, p_station, p_reason, p_seconds, auth.uid())
  returning * into v_row;
  return v_row;
end $$;

create or replace function void_penalty(p_penalty_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update penalties set voided = true where id = p_penalty_id;
end $$;

-- Stop the athlete's overall clock. Requires their wave to have started.
create or replace function finish_athlete(p_bib int) returns race_results
language plpgsql security definer set search_path = public as $$
declare
  v_athlete uuid;
  v_started timestamptz;
  v_row     race_results;
begin
  if auth.uid() is null then raise exception 'Please sign in'; end if;
  select id into v_athlete from athletes where bib_no = p_bib;
  if v_athlete is null then raise exception 'No athlete with bib %', p_bib; end if;
  if not (is_admin() or is_assigned(v_athlete)) then
    raise exception 'You are not the assigned volunteer for this athlete';
  end if;

  select h.started_at into v_started from athletes a join heats h on h.id = a.heat_id where a.id = v_athlete;
  if v_started is null then
    raise exception 'This athlete''s wave has not started yet';
  end if;

  insert into race_results (athlete_id, finished_at, recorded_by)
  values (v_athlete, now(), auth.uid())
  on conflict (athlete_id) do update
    set finished_at = excluded.finished_at, recorded_by = excluded.recorded_by
    where is_admin()
  returning * into v_row;

  if v_row.athlete_id is null then
    raise exception 'This athlete already has a finish time. Ask an admin to correct it';
  end if;
  return v_row;
end $$;

-- ---------- Public views (leaderboards) -------------------------------
-- Views run with owner rights, so they expose only these safe columns
-- (no phone/email) even though the athletes table itself is private.

create view heat_availability as
select h.id, h.name, h.starts_at, h.started_at, h.capacity,
       count(a.id)::int as taken,
       (h.capacity - count(a.id))::int as spots_left
from heats h left join athletes a on a.heat_id = h.id
group by h.id;

create view leaderboard as
with progress as (
  select a.id as athlete_id, a.bib_no, a.name, a.gender, a.heat_id,
         count(l.id) filter (where l.checked_out_at is not null)::int as stations_done
  from athletes a
  left join station_logs l on l.athlete_id = a.id and not l.voided
  group by a.id
),
pen as (
  select athlete_id, sum(seconds)::int as secs
  from penalties where not voided group by athlete_id
),
calc as (
  select p.*, h.started_at, rr.finished_at,
         coalesce(pen.secs, 0) as penalty_seconds,
         (rr.finished_at is not null) as finished
  from progress p
  join heats h on h.id = p.heat_id
  left join race_results rr on rr.athlete_id = p.athlete_id
  left join pen on pen.athlete_id = p.athlete_id
),
timed as (
  select calc.*,
         case when finished
              then extract(epoch from (finished_at - started_at))::int + penalty_seconds
         end as total_seconds
  from calc
)
select timed.*,
       case when finished then rank() over (partition by finished, gender order by total_seconds) end as rank_gender,
       case when finished then rank() over (partition by finished order by total_seconds) end as rank_overall
from timed;

create view station_leaderboard as
with r as (
  select a.bib_no, a.name, a.gender,
         s.id as station_id, s.name as station_name, s.position, s.metric,
         l.reps,
         extract(epoch from (l.checked_out_at - l.checked_in_at))::int as duration_seconds,
         coalesce((select sum(p.seconds) from penalties p
                   where p.athlete_id = l.athlete_id and p.station_id = l.station_id
                     and not p.voided), 0)::int as penalty_seconds
  from station_logs l
  join athletes a on a.id = l.athlete_id
  join stations s on s.id = l.station_id
  where not l.voided and l.checked_out_at is not null
)
select r.*,
       rank() over (partition by station_id, gender
                    order by duration_seconds + penalty_seconds) as rank_gender
from r;

-- the 700 m runs: time from leaving one station to checking in at the next
create view run_splits as
with x as (
  select a.bib_no, s.position, l.checked_in_at,
         lag(l.checked_out_at) over (partition by l.athlete_id order by s.position) as prev_out,
         lag(s.position)       over (partition by l.athlete_id order by s.position) as prev_pos
  from station_logs l
  join athletes a on a.id = l.athlete_id
  join stations s on s.id = l.station_id
  where not l.voided
)
select bib_no, prev_pos as from_position, position as to_position,
       extract(epoch from (checked_in_at - prev_out))::int as run_seconds
from x where prev_out is not null;

-- who is where right now, for the admin's live race-control view
create view live_race with (security_invoker = true) as
select l.id as log_id, a.bib_no, a.name, a.gender, s.position as station_position,
       s.name as station_name, l.checked_in_at
from station_logs l
join athletes a on a.id = l.athlete_id
join stations s on s.id = l.station_id
where not l.voided and l.checked_out_at is null;

-- ---------- Row-level security ----------------------------------------

alter table heats         enable row level security;
alter table stations      enable row level security;
alter table athletes      enable row level security;
alter table profiles      enable row level security;
alter table assignments   enable row level security;
alter table station_logs  enable row level security;
alter table penalties     enable row level security;
alter table race_results  enable row level security;
alter table audit_log     enable row level security;

create policy heats_read     on heats    for select using (true);
create policy heats_admin    on heats    for all    using (is_admin()) with check (is_admin());
create policy stations_read  on stations for select using (true);
create policy stations_admin on stations for all    using (is_admin()) with check (is_admin());

-- athletes: signed-in staff can read; only admins can change (registration goes through register_athlete)
create policy athletes_staff_read on athletes for select to authenticated using (true);
create policy athletes_admin      on athletes for update to authenticated using (is_admin()) with check (is_admin());
create policy athletes_admin_del  on athletes for delete to authenticated using (is_admin());

create policy profiles_self  on profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy profiles_admin on profiles for update to authenticated using (is_admin()) with check (is_admin());

create policy assign_self_read on assignments for select to authenticated using (volunteer_id = auth.uid() or is_admin());
create policy assign_admin     on assignments for all    to authenticated using (is_admin()) with check (is_admin());

create policy logs_staff_read on station_logs for select to authenticated using (true);
create policy logs_admin      on station_logs for all    to authenticated using (is_admin()) with check (is_admin());
create policy pen_staff_read  on penalties    for select to authenticated using (true);
create policy pen_admin       on penalties    for all    to authenticated using (is_admin()) with check (is_admin());
create policy results_staff_read on race_results for select to authenticated using (true);
create policy results_admin      on race_results for all    to authenticated using (is_admin()) with check (is_admin());
create policy audit_admin     on audit_log    for select to authenticated using (is_admin());

-- public access: only the safe views and the registration function
grant select on heat_availability, leaderboard, station_leaderboard, run_splits to anon, authenticated;
grant select on live_race to authenticated;
grant execute on function register_athlete(text, gender_t, int, text, text, text, text, boolean, uuid) to anon, authenticated;
revoke execute on function check_in(int, int), check_out(uuid, int), undo_log(uuid),
                          add_penalty(int, text, int, int), void_penalty(uuid), finish_athlete(int),
                          start_wave(uuid), assign_volunteer(int, uuid), unassign_volunteer(int) from public, anon;
grant execute on function check_in(int, int), check_out(uuid, int), undo_log(uuid),
                          add_penalty(int, text, int, int), void_penalty(uuid), finish_athlete(int),
                          start_wave(uuid), assign_volunteer(int, uuid), unassign_volunteer(int) to authenticated;

-- ---------- Race data (stations are real; heats/waves are samples) ----

insert into stations (name, position, metric, spec_male, spec_female) values
  ('Rowing',           1, 'time', '1 km, resistance 7',       '1 km, resistance 6'),
  ('Sled Push',        2, 'time', '50 m, 150 kg',             '50 m, 100 kg'),
  ('Sled Pull',        3, 'time', '50 m, 100 kg',             '50 m, 70 kg'),
  ('Kettlebell Carry', 4, 'time', '200 m, 2 x 24 kg',         '200 m, 2 x 16 kg'),
  ('Box Jumps',        5, 'time', '30 reps',                  '30 reps'),
  ('Lunge Walk',       6, 'time', '100 m, 20 kg bag',         '100 m, 10 kg bag'),
  ('Wall Balls',       7, 'time', '75 reps, 6 kg ball',       '50 reps, 4 kg ball');

insert into heats (name, starts_at, capacity) values
  ('Wave 1', null, 10),
  ('Wave 2', null, 10),
  ('Wave 3', null, 10);

-- After signing up your own account, make yourself admin:
--   update profiles set role = 'admin' where id = (select id from auth.users where email = 'YOUR_EMAIL');
