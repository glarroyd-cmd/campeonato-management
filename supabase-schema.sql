-- =========================================================
-- Schema do Copa 2026 Online
-- Cole este SQL inteiro no SQL Editor do Supabase e rode.
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists tournaments (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  state       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tournaments_code_idx on tournaments (code);

-- Trigger pra atualizar updated_at automaticamente
create or replace function bump_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_bump_updated_at on tournaments;
create trigger trg_bump_updated_at
  before update on tournaments
  for each row execute function bump_updated_at();

-- RLS: aberto pra leitura/escrita por qualquer um.
-- Justificativa: o "controle de acesso" é o código aleatório de 6 chars do torneio
-- (suficiente pra uso entre amigos, sem PII sensível). Se quiser endurecer,
-- pode habilitar Auth e trocar policies depois.
alter table tournaments enable row level security;

drop policy if exists "anyone reads" on tournaments;
create policy "anyone reads"   on tournaments for select using (true);

drop policy if exists "anyone inserts" on tournaments;
create policy "anyone inserts" on tournaments for insert with check (true);

drop policy if exists "anyone updates" on tournaments;
create policy "anyone updates" on tournaments for update using (true) with check (true);

-- Habilita Realtime nesta tabela (pra os dois jogadores verem em tempo real)
alter publication supabase_realtime add table tournaments;
