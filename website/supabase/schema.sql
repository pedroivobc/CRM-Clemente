-- Clemente Assessoria — Supabase Schema
-- Run this in the Supabase SQL Editor

-- ============================================================
-- Table: simulation_leads
-- Stores every financing simulation submitted via the website
-- ============================================================
create table if not exists public.simulation_leads (
  id              uuid default gen_random_uuid() primary key,
  created_at      timestamptz default now() not null,

  -- Lead info
  name            text not null,
  phone           text not null,
  email           text not null,
  city            text not null,

  -- Simulation inputs
  property_value  numeric(14,2) not null,
  down_payment    numeric(14,2) not null,
  income          numeric(14,2) not null,
  term            integer not null,          -- months
  has_fgts        boolean default false,
  first_property  boolean default false,
  bank            text,

  -- Simulation outputs
  financed_value        numeric(14,2),
  estimated_installment numeric(14,2),
  program               text,               -- 'MCMV' | 'SBPE' | 'INDEFINIDO'

  -- CRM status
  status          text default 'novo' check (status in ('novo', 'em_contato', 'em_analise', 'aprovado', 'cancelado')),
  notes           text
);

-- ============================================================
-- Table: contact_leads
-- Stores contact form submissions
-- ============================================================
create table if not exists public.contact_leads (
  id         uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,

  name       text not null,
  email      text not null,
  phone      text,
  subject    text,
  message    text not null,

  -- CRM
  status     text default 'novo' check (status in ('novo', 'em_atendimento', 'resolvido')),
  notes      text
);

-- ============================================================
-- Table: blog_posts
-- Content management for the blog
-- ============================================================
create table if not exists public.blog_posts (
  id           uuid default gen_random_uuid() primary key,
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null,
  published_at timestamptz,

  title        text not null,
  slug         text not null unique,
  excerpt      text,
  content      text,
  cover_url    text,
  author       text default 'Clemente Assessoria',
  tags         text[] default '{}',

  published    boolean default false
);

-- Update trigger for updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger blog_posts_updated_at
  before update on public.blog_posts
  for each row execute function public.handle_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

-- simulation_leads: only service role can read/write
alter table public.simulation_leads enable row level security;
create policy "Service role full access" on public.simulation_leads
  for all using (auth.role() = 'service_role');

-- Allow insert from anon (via API route which uses service key)
-- The API uses the service key, so RLS won't block it.

-- contact_leads: same pattern
alter table public.contact_leads enable row level security;
create policy "Service role full access" on public.contact_leads
  for all using (auth.role() = 'service_role');

-- blog_posts: public read for published posts
alter table public.blog_posts enable row level security;
create policy "Public can read published posts" on public.blog_posts
  for select using (published = true);
create policy "Service role full access" on public.blog_posts
  for all using (auth.role() = 'service_role');

-- ============================================================
-- Indexes for common queries
-- ============================================================
create index if not exists simulation_leads_email_idx on public.simulation_leads(email);
create index if not exists simulation_leads_status_idx on public.simulation_leads(status);
create index if not exists simulation_leads_created_at_idx on public.simulation_leads(created_at desc);

create index if not exists contact_leads_status_idx on public.contact_leads(status);
create index if not exists contact_leads_created_at_idx on public.contact_leads(created_at desc);

create index if not exists blog_posts_slug_idx on public.blog_posts(slug);
create index if not exists blog_posts_published_at_idx on public.blog_posts(published_at desc);
