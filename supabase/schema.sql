-- Legacy Life Group: booking schema
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to re-run: it will not duplicate tables or seed rows.

create table if not exists agents (
  id     text primary key,            -- short id used by the website (aaron, anna, ...)
  name   text not null,
  email  text not null,               -- where this agent's booking alerts are sent
  active boolean not null default true
);

-- One row per weekday an agent takes appointments.
-- weekday: 0=Sunday ... 6=Saturday.  Hours are 24h, in the agency time zone.
-- start_hour=9, end_hour=17 means hourly slots at 9,10,11,12,13,14,15,16.
create table if not exists availability (
  agent_id   text not null references agents(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_hour smallint not null check (start_hour between 0 and 23),
  end_hour   smallint not null check (end_hour between 1 and 24),
  primary key (agent_id, weekday),
  check (end_hour > start_hour)
);

create table if not exists bookings (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  agent_id    text not null references agents(id),
  kind        text not null check (kind in ('interview','consult')),
  slot_start  timestamptz not null,
  name        text not null,
  phone       text not null,
  licensed    boolean,                -- interviews only
  dob         date,                   -- consultations only
  status      text not null default 'booked' check (status in ('booked','cancelled')),
  emailed     boolean not null default false
);

-- The double-booking guard: one active booking per agent per time.
-- To free a slot, set status = 'cancelled' (do not delete).
create unique index if not exists bookings_one_per_slot
  on bookings (agent_id, slot_start) where status = 'booked';

-- Lock everything down. With RLS on and NO policies, the public (anon) key
-- can read and write nothing. Only the booking function (service role) can.
alter table agents       enable row level security;
alter table availability enable row level security;
alter table bookings     enable row level security;

-- Starting agents. CHECK THESE EMAILS: alerts go to exactly these addresses.
insert into agents (id, name, email) values
  ('aaron',   'Aaron Lapp',     'aaron.lapp@legacylife.com'),
  ('anna',    'Anna Moss',      'anna.moss@legacylife.com'),
  ('tristan', 'Tristan Bowden', 'tristan.bowden@legacylife.com'),
  ('hannah',  'Hannah Johnson', 'hannah.johnson@legacylife.com'),
  ('logen',   'Logen Kelly',    'logen.kelly@legacylife.com')
on conflict (id) do nothing;

-- Default hours for everyone: Monday-Friday, 9am-5pm.
insert into availability (agent_id, weekday, start_hour, end_hour)
select a.id, d, 9, 17 from agents a, generate_series(1,5) as d
on conflict (agent_id, weekday) do nothing;
