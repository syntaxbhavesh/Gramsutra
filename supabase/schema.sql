-- GramSutra 2.0 starter schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Farmer',
  village text not null default '',
  preferred_language text not null default 'English',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.farm_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  due_date date,
  category text not null default 'Other',
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','blocked')),
  created_at timestamptz not null default now(),
  check (requester_id <> recipient_id),
  unique(requester_id,recipient_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  listing_type text not null check (listing_type in ('produce','equipment','inputs')),
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description)<=2000),
  quantity text not null default '',
  price numeric(12,2) not null check (price>=0),
  village text not null default '',
  status text not null default 'active' check (status in ('active','paused','closed')),
  created_at timestamptz not null default now()
);
create table if not exists public.listing_inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 1500),
  created_at timestamptz not null default now(),
  check(sender_id<>owner_id)
);
create table if not exists public.farmer_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(name) between 3 and 70),
  description text not null default '',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id uuid not null references public.farmer_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(group_id,user_id)
);
create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.farmer_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check(char_length(body) between 1 and 1500),
  created_at timestamptz not null default now()
);

create or replace function public.gramsutra_connected(a uuid,b uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.connections c where c.status='accepted'
 and ((c.requester_id=a and c.recipient_id=b) or (c.requester_id=b and c.recipient_id=a)));
$$;
revoke all on function public.gramsutra_connected(uuid,uuid) from public;
grant execute on function public.gramsutra_connected(uuid,uuid) to authenticated;

create or replace function public.gramsutra_new_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,display_name)
 values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'Farmer'))
 on conflict(id) do nothing;
 return new;
end; $$;
drop trigger if exists gramsutra_auth_profile on auth.users;
create trigger gramsutra_auth_profile after insert on auth.users
for each row execute procedure public.gramsutra_new_profile();

alter table public.profiles enable row level security;
alter table public.farm_tasks enable row level security;
alter table public.connections enable row level security;
alter table public.messages enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.listing_inquiries enable row level security;
alter table public.farmer_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_posts enable row level security;

create policy "profiles signed-in read" on public.profiles for select to authenticated using(true);
create policy "profile own insert" on public.profiles for insert to authenticated with check(id=auth.uid());
create policy "profile own update" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "tasks own all" on public.farm_tasks for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "connection participants read" on public.connections for select to authenticated using(requester_id=auth.uid() or recipient_id=auth.uid());
create policy "connection requester insert" on public.connections for insert to authenticated with check(requester_id=auth.uid());
create policy "recipient responds" on public.connections for update to authenticated using(recipient_id=auth.uid() and status='pending') with check(recipient_id=auth.uid() and status in ('accepted','rejected'));
create policy "connected messages read" on public.messages for select to authenticated using((sender_id=auth.uid() or recipient_id=auth.uid()) and public.gramsutra_connected(sender_id,recipient_id));
create policy "connected messages send" on public.messages for insert to authenticated with check(sender_id=auth.uid() and public.gramsutra_connected(sender_id,recipient_id));
create policy "active listings read" on public.marketplace_listings for select to authenticated using(status='active' or owner_id=auth.uid());
create policy "owner creates listing" on public.marketplace_listings for insert to authenticated with check(owner_id=auth.uid());
create policy "owner updates listing" on public.marketplace_listings for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "owner deletes listing" on public.marketplace_listings for delete to authenticated using(owner_id=auth.uid());
create policy "inquiry parties read" on public.listing_inquiries for select to authenticated using(sender_id=auth.uid() or owner_id=auth.uid());
create policy "inquiry sender creates" on public.listing_inquiries for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from public.marketplace_listings l where l.id=listing_id and l.owner_id=owner_id and l.status='active'));
create policy "groups signed-in read" on public.farmer_groups for select to authenticated using(true);
create policy "group creator insert" on public.farmer_groups for insert to authenticated with check(created_by=auth.uid());
create policy "group membership read" on public.group_members for select to authenticated using(true);
create policy "join as self" on public.group_members for insert to authenticated with check(user_id=auth.uid());
create policy "leave as self" on public.group_members for delete to authenticated using(user_id=auth.uid());
create policy "members read posts" on public.group_posts for select to authenticated using(exists(select 1 from public.group_members m where m.group_id=group_posts.group_id and m.user_id=auth.uid()));
create policy "members create posts" on public.group_posts for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.group_members m where m.group_id=group_posts.group_id and m.user_id=auth.uid()));

create index if not exists gs_tasks_user_due on public.farm_tasks(user_id,due_date);
create index if not exists gs_listings_active on public.marketplace_listings(status,created_at desc);
create index if not exists gs_messages_pair on public.messages(sender_id,recipient_id,created_at);
-- Enable Realtime for public.messages in Supabase Dashboard if live messaging is activated.
