-- =====================================================================
-- MEUS GASTOS — Etapa 4: categorias no banco, orçamento e metas completas
--
-- Como usar: SQL Editor do Supabase → cole TUDO → Run. Uma vez só.
-- Rode e, logo em seguida, publique o app novo (o app antigo para de
-- conseguir salvar gastos depois deste SQL, porque a coluna mudou).
--
-- O que este arquivo faz:
--   1. Cria a tabela "categorias" (nome, ícone, cor, limite mensal)
--   2. Cria as categorias padrão para quem já tem conta
--   3. Troca gastos.categoria (texto) por gastos.categoria_id (ligação)
--   4. Metas ganham categoria (para virar gasto ao clicar "Paguei")
--   5. Função pagar_gasto_programado(): o "Paguei", numa transação só
--
-- "begin" ... "commit": se QUALQUER linha der erro, nada é aplicado.
-- O banco nunca fica pela metade.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1) CATEGORIAS
-- ---------------------------------------------------------------------
create table public.categorias (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid()
                 references auth.users (id) on delete cascade,
  nome           text not null check (char_length(trim(nome)) between 1 and 30),
  icone          text not null default '📦' check (char_length(icone) between 1 and 8),
  -- Cor no formato #rrggbb (usada nos gráficos)
  cor            text not null default '#64748b' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  -- Limite do mês em CENTAVOS. null = sem limite (fora do orçamento)
  limite_mensal  integer check (limite_mensal is null or limite_mensal > 0),
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now(),
  -- Não pode haver duas categorias com o mesmo nome para a mesma pessoa
  unique (user_id, nome),
  -- Necessário para a chave estrangeira composta (categoria + dono) lá embaixo
  unique (id, user_id)
);

alter table public.categorias enable row level security;

create policy "categorias: ver as minhas"
  on public.categorias for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "categorias: criar as minhas"
  on public.categorias for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "categorias: editar as minhas"
  on public.categorias for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "categorias: excluir as minhas"
  on public.categorias for delete to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- 2) CATEGORIAS PADRÃO para quem JÁ tem conta.
--    (Contas novas ganham as mesmas pelo próprio app, no 1º acesso.)
--    "chave" é só uma coluna temporária para ligar os gastos antigos.
-- ---------------------------------------------------------------------
create temporary table padrao (chave text, nome text, icone text, cor text, ordem int)
on commit drop;

insert into padrao values
  ('alimentacao', 'Alimentação', '🍽️', '#f97316', 1),
  ('mercado',     'Mercado',     '🛒', '#22c55e', 2),
  ('transporte',  'Transporte',  '⛽', '#3b82f6', 3),
  ('moradia',     'Moradia',     '🏠', '#a855f7', 4),
  ('saude',       'Saúde',       '💊', '#ef4444', 5),
  ('educacao',    'Educação',    '🎓', '#eab308', 6),
  ('lazer',       'Lazer',       '🎮', '#ec4899', 7),
  ('contas',      'Contas',      '🧾', '#14b8a6', 8),
  ('outros',      'Outros',      '📦', '#64748b', 9);

insert into public.categorias (user_id, nome, icone, cor, ordem)
select u.id, p.nome, p.icone, p.cor, p.ordem
  from auth.users u
 cross join padrao p
on conflict (user_id, nome) do nothing;


-- ---------------------------------------------------------------------
-- 3) GASTOS: de "categoria" (texto) para "categoria_id" (ligação)
--
-- Por quê? Com o texto, renomear "Mercado" para "Supermercado" exigiria
-- reescrever todos os gastos. Com a ligação (chave estrangeira), o gasto
-- aponta para a categoria; renomear muda em um lugar só.
--
-- A ligação é COMPOSTA: (categoria_id, user_id) → categorias (id, user_id).
-- Uma ligação simples só conferiria se a categoria EXISTE; a composta
-- confere também se ela é DO MESMO DONO do gasto. Sem isso, alguém que
-- descobrisse o id de uma categoria sua poderia usá-la nos gastos dele.
--
-- "on delete restrict": o banco NÃO deixa apagar uma categoria que ainda
-- tem gastos. O app move os gastos para "Outros" antes de excluir.
-- ---------------------------------------------------------------------
alter table public.gastos add column categoria_id uuid;

-- Liga cada gasto antigo à categoria nova do mesmo dono
update public.gastos g
   set categoria_id = c.id
  from padrao p
  join public.categorias c on c.nome = p.nome
 where p.chave = g.categoria
   and c.user_id = g.user_id;

-- Rede de segurança: o que não casou vai para "Outros"
update public.gastos g
   set categoria_id = c.id
  from public.categorias c
 where g.categoria_id is null
   and c.user_id = g.user_id
   and c.nome = 'Outros';

alter table public.gastos alter column categoria_id set not null;
alter table public.gastos drop column categoria;

alter table public.gastos
  add constraint gastos_categoria_fk
  foreign key (categoria_id, user_id)
  references public.categorias (id, user_id)
  on delete restrict;

create index gastos_categoria_idx on public.gastos (categoria_id);


-- ---------------------------------------------------------------------
-- 4) METAS ganham categoria (opcional). Ao clicar "Paguei", o gasto
--    real nasce nesta categoria.
--    Mesma ligação composta dos gastos (categoria precisa ser sua).
--    "on delete set null (categoria_id)": se a categoria for apagada, a
--    meta continua, só fica sem categoria. O "(categoria_id)" diz para
--    apagar SÓ essa coluna, e não o user_id junto.
-- ---------------------------------------------------------------------
alter table public.gastos_programados
  add column categoria_id uuid,
  add constraint gastos_programados_categoria_fk
    foreign key (categoria_id, user_id)
    references public.categorias (id, user_id)
    on delete set null (categoria_id);

create index gastos_programados_categoria_idx on public.gastos_programados (categoria_id);


-- ---------------------------------------------------------------------
-- 5) PAGUEI: tudo junto ou nada.
--
-- Pagar uma meta são 3 passos:
--   a) lançar o gasto real
--   b) marcar a meta como paga
--   c) se for recorrente, criar a meta do próximo mês/ano
-- Se o app fizesse 3 pedidos separados e a internet caísse no meio,
-- poderia sobrar um gasto lançado com a meta ainda "ativa" (e você
-- pagaria duas vezes). Numa função do banco, os 3 passos são uma
-- TRANSAÇÃO: ou todos acontecem, ou nenhum.
--
-- "security invoker": a função roda COMO o usuário, então o RLS vale
-- normalmente. Ela não ganha nenhum poder extra.
-- ---------------------------------------------------------------------
create or replace function public.pagar_gasto_programado(
  p_meta_id          uuid,
  p_valor            integer,
  p_data             date,
  p_forma_pagamento  text,
  p_categoria_id     uuid
)
returns uuid   -- id do gasto criado
language plpgsql
security invoker
set search_path = ''
as $$
declare
  meta      public.gastos_programados%rowtype;
  gasto_id  uuid;
begin
  -- "for update" trava a linha: dois cliques rápidos em "Paguei"
  -- não conseguem pagar a mesma meta duas vezes.
  select * into meta
    from public.gastos_programados
   where id = p_meta_id and status = 'ativo'
   for update;

  if not found then
    raise exception 'Meta não encontrada ou já paga.';
  end if;

  -- a) gasto real (o RLS de "gastos" confere o dono)
  insert into public.gastos (valor, descricao, categoria_id, data, forma_pagamento)
  values (p_valor, meta.descricao, p_categoria_id, p_data, p_forma_pagamento)
  returning id into gasto_id;

  -- b) meta paga
  update public.gastos_programados set status = 'pago' where id = meta.id;

  -- c) próxima ocorrência, se for recorrente
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


-- Depósitos ganham "desfazer" no app: a policy de delete já existe
-- desde a Etapa 2, e o gatilho recalcula o valor guardado sozinho.

commit;
