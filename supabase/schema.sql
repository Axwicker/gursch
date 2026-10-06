-- Gursch beta: felrapporter och serverfel. Körs en gång i Supabase → SQL Editor.
-- Bara servern (med secret-nyckeln) når tabellerna: RLS är på och det finns inga policies.

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  version     text,
  category    text,
  description text not null,
  reported_by text,
  room        text,
  phase       text,
  report      jsonb not null,          -- hela rapporten inkl. rundans logg (för npm run replay)
  pulled_at   timestamptz              -- satt när npm run reports:pull hämtat den
);

create table if not exists public.server_errors (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  version    text,
  room       text,
  phase      text,
  message    text,
  stack      text,
  pulled_at  timestamptz
);

create index if not exists reports_unpulled on public.reports (created_at) where pulled_at is null;
create index if not exists server_errors_unpulled on public.server_errors (created_at) where pulled_at is null;

alter table public.reports enable row level security;
alter table public.server_errors enable row level security;
revoke all on public.reports, public.server_errors from anon, authenticated;

-- Nya Supabase-projekt har public.rls_auto_enable(); stäng den för anon/authenticated:
-- revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
