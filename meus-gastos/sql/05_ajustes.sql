-- =====================================================================
-- MEUS GASTOS — ajustes finais (avisos do verificador do Supabase)
--
-- Como usar: SQL Editor → cole tudo → Run. Pode rodar mais de uma vez.
--
-- 1) ÍNDICES PARA AS LIGAÇÕES COMPOSTAS
--    As ligações das Etapas 4 e 5 usam DUAS colunas, por exemplo
--    (categoria_id, user_id). O verificador recomenda um índice com
--    essas mesmas duas colunas: quando uma categoria é apagada ou
--    alterada, o banco acha os gastos ligados a ela sem ler a tabela
--    inteira. Os índices antigos, de uma coluna só, nunca foram usados
--    e saem: um índice composto que começa por categoria_id também
--    serve para buscas só por categoria_id.
-- =====================================================================

drop index if exists public.gastos_categoria_idx;
create index if not exists gastos_categoria_user_idx
  on public.gastos (categoria_id, user_id);

create index if not exists gastos_recorrente_user_idx
  on public.gastos (recorrente_id, user_id);

drop index if exists public.gastos_programados_categoria_idx;
create index if not exists gastos_programados_categoria_user_idx
  on public.gastos_programados (categoria_id, user_id);

drop index if exists public.gastos_recorrentes_categoria_idx;
create index if not exists gastos_recorrentes_categoria_user_idx
  on public.gastos_recorrentes (categoria_id, user_id);


-- =====================================================================
-- 2) FUNÇÃO DE GATILHO: ninguém precisa chamá-la diretamente
--    recalcular_valor_guardado() só roda sozinha, quando um depósito
--    entra ou sai. Por padrão o Postgres deixa "todo mundo" executar
--    funções novas; aqui fechamos essa porta por arrumação.
--    O gatilho continua funcionando: a permissão é conferida quando o
--    gatilho é CRIADO, não a cada vez que ele dispara.
-- =====================================================================
revoke execute on function public.recalcular_valor_guardado() from public, anon, authenticated;
