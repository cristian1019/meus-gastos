-- =====================================================================
-- MEUS GASTOS — Etapa 5: renda, contas fixas, economia e retiradas
--
-- Como usar: SQL Editor do Supabase → cole TUDO → Run.
--
-- Lição da Etapa 4: o editor do Supabase nem sempre roda o arquivo
-- como um bloco só. Por isso este SQL é IDEMPOTENTE: pode rodar duas
-- (ou dez) vezes sem erro e sem duplicar nada. As técnicas:
--   create table IF NOT EXISTS, add column IF NOT EXISTS,
--   drop ... IF EXISTS antes de criar de novo, create OR REPLACE.
-- E nada de tabela temporária.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) CONFIGURAÇÕES: renda fixa e dia do pagamento (uma linha por pessoa)
--    O dia define o "mês" do app: com dia 30, o período vai de 30 a 29.
-- ---------------------------------------------------------------------
create table if not exists public.configuracoes (
  user_id        uuid primary key default auth.uid()
                 references auth.users (id) on delete cascade,
  renda_fixa     integer check (renda_fixa is null or renda_fixa > 0), -- centavos
  dia_pagamento  smallint not null default 1 check (dia_pagamento between 1 and 31),
  atualizado_em  timestamptz not null default now()
);

alter table public.configuracoes enable row level security;

drop policy if exists "configuracoes: ver a minha" on public.configuracoes;
create policy "configuracoes: ver a minha"
  on public.configuracoes for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "configuracoes: criar a minha" on public.configuracoes;
create policy "configuracoes: criar a minha"
  on public.configuracoes for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "configuracoes: editar a minha" on public.configuracoes;
create policy "configuracoes: editar a minha"
  on public.configuracoes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- 2) ENTRADAS: os extras ("Recebi"), como hora extra e freela
-- ---------------------------------------------------------------------
create table if not exists public.entradas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  valor      integer not null check (valor > 0),
  descricao  text not null check (char_length(descricao) between 1 and 80),
  data       date not null,
  criado_em  timestamptz not null default now()
);

create index if not exists entradas_user_data_idx on public.entradas (user_id, data desc);

alter table public.entradas enable row level security;

drop policy if exists "entradas: ver as minhas" on public.entradas;
create policy "entradas: ver as minhas"
  on public.entradas for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "entradas: criar as minhas" on public.entradas;
create policy "entradas: criar as minhas"
  on public.entradas for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "entradas: editar as minhas" on public.entradas;
create policy "entradas: editar as minhas"
  on public.entradas for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "entradas: excluir as minhas" on public.entradas;
create policy "entradas: excluir as minhas"
  on public.entradas for delete to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- 3) CONTAS FIXAS (gastos recorrentes)
--    automatico = true  → o app lança sozinho no dia
--    automatico = false → o app mostra um lembrete para você confirmar
-- ---------------------------------------------------------------------
create table if not exists public.gastos_recorrentes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid()
                   references auth.users (id) on delete cascade,
  descricao        text not null check (char_length(descricao) between 1 and 80),
  valor            integer not null check (valor > 0),
  categoria_id     uuid,
  forma_pagamento  text not null default 'pix',
  dia_do_mes       smallint not null check (dia_do_mes between 1 and 31),
  automatico       boolean not null default true,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  unique (id, user_id)  -- para a ligação composta vinda de "gastos"
);

-- Categoria precisa ser do mesmo dono (mesma ideia da Etapa 4)
alter table public.gastos_recorrentes drop constraint if exists gastos_recorrentes_categoria_fk;
alter table public.gastos_recorrentes
  add constraint gastos_recorrentes_categoria_fk
  foreign key (categoria_id, user_id) references public.categorias (id, user_id)
  on delete set null (categoria_id);

create index if not exists gastos_recorrentes_user_idx on public.gastos_recorrentes (user_id);
create index if not exists gastos_recorrentes_categoria_idx on public.gastos_recorrentes (categoria_id);

alter table public.gastos_recorrentes enable row level security;

drop policy if exists "recorrentes: ver as minhas" on public.gastos_recorrentes;
create policy "recorrentes: ver as minhas"
  on public.gastos_recorrentes for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "recorrentes: criar as minhas" on public.gastos_recorrentes;
create policy "recorrentes: criar as minhas"
  on public.gastos_recorrentes for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "recorrentes: editar as minhas" on public.gastos_recorrentes;
create policy "recorrentes: editar as minhas"
  on public.gastos_recorrentes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "recorrentes: excluir as minhas" on public.gastos_recorrentes;
create policy "recorrentes: excluir as minhas"
  on public.gastos_recorrentes for delete to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- 4) GASTOS: de qual conta fixa e de qual mês vieram
--
--    competencia = "2026-11" (mês da conta). A regra UNIQUE abaixo
--    impede lançar a mesma conta duas vezes no mesmo mês, mesmo com
--    dois aparelhos abertos ao mesmo tempo. Gastos comuns têm os dois
--    campos vazios (null), e nulls não contam como repetidos.
-- ---------------------------------------------------------------------
alter table public.gastos add column if not exists recorrente_id uuid;
alter table public.gastos add column if not exists competencia text;

alter table public.gastos drop constraint if exists gastos_competencia_check;
alter table public.gastos
  add constraint gastos_competencia_check check (competencia is null or competencia ~ '^\d{4}-\d{2}$');

alter table public.gastos drop constraint if exists gastos_recorrente_competencia_key;
alter table public.gastos
  add constraint gastos_recorrente_competencia_key unique (recorrente_id, competencia);

-- Excluir a conta fixa NÃO apaga os gastos já lançados: só desliga a ligação
alter table public.gastos drop constraint if exists gastos_recorrente_fk;
alter table public.gastos
  add constraint gastos_recorrente_fk
  foreign key (recorrente_id, user_id) references public.gastos_recorrentes (id, user_id)
  on delete set null (recorrente_id);


-- ---------------------------------------------------------------------
-- 5) METAS DE ECONOMIA
--    tipo 'conta'    → como sempre: tem vencimento e termina com "Paguei"
--    tipo 'economia' → reserva, viagem: data opcional, aceita retiradas
-- ---------------------------------------------------------------------
alter table public.gastos_programados add column if not exists tipo text not null default 'conta';
alter table public.gastos_programados add column if not exists valor_mensal integer;

alter table public.gastos_programados drop constraint if exists gastos_programados_tipo_check;
alter table public.gastos_programados
  add constraint gastos_programados_tipo_check check (tipo in ('conta', 'economia'));

alter table public.gastos_programados drop constraint if exists gastos_programados_valor_mensal_check;
alter table public.gastos_programados
  add constraint gastos_programados_valor_mensal_check check (valor_mensal is null or valor_mensal > 0);

-- Vencimento vira opcional, mas SÓ para economia
alter table public.gastos_programados alter column data_vencimento drop not null;
alter table public.gastos_programados drop constraint if exists gastos_programados_vencimento_check;
alter table public.gastos_programados
  add constraint gastos_programados_vencimento_check check (tipo = 'economia' or data_vencimento is not null);

-- Retiradas: um depósito NEGATIVO. Antes era "valor > 0"; agora "≠ 0".
-- Não dá para retirar mais do que tem: o gatilho recalcula o
-- valor_guardado, e a regra "valor_guardado >= 0" (Etapa 2) recusa
-- o saldo negativo, desfazendo a retirada inteira.
alter table public.depositos_meta drop constraint if exists depositos_meta_valor_check;
alter table public.depositos_meta
  add constraint depositos_meta_valor_check check (valor <> 0);


-- ---------------------------------------------------------------------
-- 6) "Paguei" só vale para contas (economia não vira gasto)
--    Mesma função da Etapa 4, com "and tipo = 'conta'".
-- ---------------------------------------------------------------------
create or replace function public.pagar_gasto_programado(
  p_meta_id          uuid,
  p_valor            integer,
  p_data             date,
  p_forma_pagamento  text,
  p_categoria_id     uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  meta      public.gastos_programados%rowtype;
  gasto_id  uuid;
begin
  select * into meta
    from public.gastos_programados
   where id = p_meta_id and status = 'ativo' and tipo = 'conta'
   for update;

  if not found then
    raise exception 'Meta não encontrada ou já paga.';
  end if;

  insert into public.gastos (valor, descricao, categoria_id, data, forma_pagamento)
  values (p_valor, meta.descricao, p_categoria_id, p_data, p_forma_pagamento)
  returning id into gasto_id;

  update public.gastos_programados set status = 'pago' where id = meta.id;

  if meta.recorrencia in ('mensal', 'anual') then
    insert into public.gastos_programados
      (descricao, valor_total, data_vencimento, incluir_mes_vencimento, recorrencia, categoria_id)
    values (
      meta.descricao,
      meta.valor_total,
      (meta.data_vencimento + case meta.recorrencia
                                 when 'mensal' then interval '1 month'
                                 else interval '1 year' end)::date,
      meta.incluir_mes_vencimento,
      meta.recorrencia,
      meta.categoria_id
    );
  end if;

  return gasto_id;
end;
$$;

revoke execute on function public.pagar_gasto_programado(uuid, integer, date, text, uuid) from public, anon;
grant  execute on function public.pagar_gasto_programado(uuid, integer, date, text, uuid) to authenticated;

commit;
