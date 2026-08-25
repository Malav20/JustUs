-- Supabase Schema for JustUs Watch Party

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Table: Rooms
create table if not exists public.rooms (
    id text primary key, -- e.g. short nanoid or custom room code
    host_id text not null,
    service text not null check (service in ('netflix', 'prime', 'generic')),
    video_url text not null,
    title text,
    playback_time double precision default 0.0,
    is_playing boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Table: Room Participants
create table if not exists public.room_participants (
    id uuid default uuid_generate_v4() primary key,
    room_id text references public.rooms(id) on delete cascade not null,
    user_id text not null,
    user_name text not null,
    is_host boolean default false,
    joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
    last_seen_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(room_id, user_id)
);

-- Table: Chat Messages (Persistent chat history tied to rooms)
create table if not exists public.chat_messages (
    id uuid default uuid_generate_v4() primary key,
    room_id text references public.rooms(id) on delete cascade not null,
    sender text not null,
    message text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for fast room chat history lookups
create index if not exists idx_chat_messages_room_id on public.chat_messages(room_id, created_at);

-- Enable Row Level Security (RLS)
alter table public.rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.chat_messages enable row level security;

-- Policies for public room access (Watch party model)
create policy "Allow public read on rooms" on public.rooms
    for select using (true);

create policy "Allow public insert on rooms" on public.rooms
    for insert with check (true);

create policy "Allow public update on rooms" on public.rooms
    for update using (true);

create policy "Allow public delete on rooms" on public.rooms
    for delete using (true);

create policy "Allow public read on participants" on public.room_participants
    for select using (true);

create policy "Allow public insert on participants" on public.room_participants
    for insert with check (true);

create policy "Allow public update/delete on participants" on public.room_participants
    for all using (true);

-- Policies for chat messages
create policy "Allow public read on chat_messages" on public.chat_messages
    for select using (true);

create policy "Allow public insert on chat_messages" on public.chat_messages
    for insert with check (true);

create policy "Allow public delete on chat_messages" on public.chat_messages
    for delete using (true);

-- Enable Supabase Realtime for rooms, participants, and chat
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_participants;
alter publication supabase_realtime add table public.chat_messages;
