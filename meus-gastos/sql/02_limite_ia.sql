-- =====================================================================
-- MEUS GASTOS — Etapa 3: limite diário de uso da IA
--
-- Como usar: SQL Editor do Supabase → cole tudo → Run. Uma vez só.
--
-- Por que existe: cada pedido à IA gasta cota (e, no futuro, dinheiro).
-- Um bug que chame a IA sem parar, ou alguém com sua senha, não pode
-- passar de 30 pedidos por dia. Quem conta é o BANCO, não o app,
-- porque o app roda no celular e pode ser alterado.
-- =====================================================================

-- Uma linha por pessoa por dia: (user_id, dia) → quantidade de pedidos
create table public.uso_ia (
  user_id     uuid not null references auth.users (id) on delete cascade,
  dia         date not null,
  quantidade  integer not null default 0 check (quantidade >= 0),
  primary key (user_id, dia)
);

alter table public.uso_ia enable row level security;

-- A pessoa pode VER o próprio contador...
create policy "uso_ia: ver o meu"
  on public.uso_ia for select to authenticated
  using ((select auth.uid()) = user_id);
-- ...mas NÃO existe policy de insert/update/delete. Ou seja, ninguém
-- consegue zerar o próprio contador pelo app. Só a função abaixo mexe.


-- ---------------------------------------------------------------------
-- registrar_uso_ia(): soma +1 no contador de hoje e devolve o total.
--
-- "security definer" = a função roda com permissão de quem a criou
-- (o dono do banco), por isso consegue gravar na tabela mesmo sem
-- policy de insert. Ela é segura porque só mexe na linha de quem
-- está logado (auth.uid()) e só soma 1: não aceita nenhum parâmetro.
--
-- "insert ... on conflict do update" é ATÔMICO: dois pedidos ao mesmo
-- tempo não conseguem "furar" a contagem.
-- ---------------------------------------------------------------------
create or replace function public.registrar_uso_ia()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  -- "Hoje" no horário de Brasília (o servidor usa UTC)
  hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  total integer;
begin
  if uid is null then
    raise exception 'login obrigatório';
  end if;

  insert into public.uso_ia (user_id, dia, quantidade)
  values (uid, hoje, 1)
  on conflict (user_id, dia)
  do update set quantidade = public.uso_ia.quantidade + 1
  returning quantidade into total;

  return total;
end;
$$;

-- Só usuários logados podem chamar a função
revoke execute on function public.registrar_uso_ia() from public, anon;
grant  execute on function public.registrar_uso_ia() to authenticated;


-- Bônus (aviso do verificador do Supabase na Etapa 2): índice na
-- chave estrangeira user_id de depositos_meta.
create index if not exists depositos_meta_user_idx on public.depositos_meta (user_id);
