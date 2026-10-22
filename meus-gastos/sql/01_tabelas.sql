-- =====================================================================
-- MEUS GASTOS — Etapa 2: tabelas, segurança (RLS) e regras do banco
--
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este
-- arquivo inteiro e clique em "Run". Pode rodar só uma vez.
--
-- Convenções:
--   * Dinheiro em CENTAVOS (integer), igual ao app: R$ 12,50 = 1250.
--   * Datas como "date" (AAAA-MM-DD), sem hora e sem fuso.
--   * Todo registro tem user_id, preenchido sozinho com o usuário logado.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) GASTOS
-- ---------------------------------------------------------------------
create table public.gastos (
  id              uuid primary key default gen_random_uuid(),
  -- default auth.uid(): o banco coloca o id de quem está logado.
  -- O app nem precisa (nem consegue) mandar outro user_id.
  user_id         uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  valor           integer not null check (valor > 0),
  descricao       text    not null check (char_length(descricao) between 1 and 80),
  categoria       text    not null,
  data            date    not null,
  forma_pagamento text    not null,
  foto_url        text,                       -- usado na Etapa 3 (cupom)
  criado_em       timestamptz not null default now()
);

-- Índice: deixa rápida a busca "gastos do usuário X, por data"
create index gastos_user_data_idx on public.gastos (user_id, data desc);


-- ---------------------------------------------------------------------
-- 2) GASTOS PROGRAMADOS (metas com data)
-- ---------------------------------------------------------------------
create table public.gastos_programados (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid()
                          references auth.users (id) on delete cascade,
  descricao               text    not null check (char_length(descricao) between 1 and 80),
  valor_total             integer not null check (valor_total > 0),
  data_vencimento         date    not null,
  -- Mantido pelo próprio banco (gatilho lá embaixo). Não edite na mão.
  valor_guardado          integer not null default 0 check (valor_guardado >= 0),
  incluir_mes_vencimento  boolean not null default false,
  recorrencia             text    not null default 'nenhuma'
                          check (recorrencia in ('nenhuma', 'mensal', 'anual')),
  status                  text    not null default 'ativo'
                          check (status in ('ativo', 'pago')),
  criado_em               timestamptz not null default now()
);

create index gastos_programados_user_idx on public.gastos_programados (user_id, data_vencimento);


-- ---------------------------------------------------------------------
-- 3) DEPÓSITOS NAS METAS (cada clique em "Guardei")
--    Obs.: adicionamos user_id aqui também (não estava no plano
--    original) porque deixa a regra de segurança simples e rápida.
-- ---------------------------------------------------------------------
create table public.depositos_meta (
  id                   uuid primary key default gen_random_uuid(),
  gasto_programado_id  uuid not null
                       references public.gastos_programados (id) on delete cascade,
  user_id              uuid not null default auth.uid()
                       references auth.users (id) on delete cascade,
  valor                integer not null check (valor > 0),
  data                 date    not null default current_date,
  criado_em            timestamptz not null default now()
);

create index depositos_meta_programado_idx on public.depositos_meta (gasto_programado_id);


-- =====================================================================
-- RLS (Row Level Security)
-- Com RLS ligado, o banco recusa TUDO por padrão. Cada "policy"
-- abaixo libera uma ação específica, só para as linhas do próprio dono.
-- (select auth.uid()) entre parênteses é uma dica de performance do
-- Supabase: o Postgres calcula uma vez por consulta, não por linha.
-- =====================================================================

alter table public.gastos             enable row level security;
alter table public.gastos_programados enable row level security;
alter table public.depositos_meta     enable row level security;

-- ---------- gastos ----------
create policy "gastos: ver os meus"
  on public.gastos for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "gastos: criar os meus"
  on public.gastos for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "gastos: editar os meus"
  on public.gastos for update to authenticated
  using ((select auth.uid()) = user_id)        -- qual linha posso mexer
  with check ((select auth.uid()) = user_id);  -- e ela continua sendo minha

create policy "gastos: excluir os meus"
  on public.gastos for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------- gastos_programados ----------
create policy "programados: ver os meus"
  on public.gastos_programados for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "programados: criar os meus"
  on public.gastos_programados for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "programados: editar os meus"
  on public.gastos_programados for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "programados: excluir os meus"
  on public.gastos_programados for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------- depositos_meta ----------
create policy "depositos: ver os meus"
  on public.depositos_meta for select to authenticated
  using ((select auth.uid()) = user_id);

-- Ao criar um depósito, confere também se a META é minha.
-- Sem isso, alguém poderia depositar na meta de outra pessoa
-- só sabendo o id dela.
create policy "depositos: criar nas minhas metas"
  on public.depositos_meta for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.gastos_programados gp
      where gp.id = gasto_programado_id
        and gp.user_id = (select auth.uid())
    )
  );

create policy "depositos: excluir os meus"
  on public.depositos_meta for delete to authenticated
  using ((select auth.uid()) = user_id);
-- (sem policy de update: depósito errado se exclui e lança de novo)


-- =====================================================================
-- GATILHO: valor_guardado = soma dos depósitos da meta
-- Sempre que um depósito entra ou sai, o banco recalcula a soma.
-- Assim o total nunca fica diferente dos depósitos, mesmo se o app
-- travar no meio ou você usar dois aparelhos ao mesmo tempo.
-- =====================================================================
create or replace function public.recalcular_valor_guardado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  meta_id uuid := coalesce(new.gasto_programado_id, old.gasto_programado_id);
begin
  update public.gastos_programados
     set valor_guardado = (
           select coalesce(sum(d.valor), 0)
             from public.depositos_meta d
            where d.gasto_programado_id = meta_id
         )
   where id = meta_id;
  return null;  -- gatilho "after": o valor de retorno é ignorado
end;
$$;

create trigger depositos_meta_recalcular
  after insert or delete on public.depositos_meta
  for each row execute function public.recalcular_valor_guardado();
