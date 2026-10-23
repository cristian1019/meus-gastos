/* =========================================================
   storage.js — a ÚNICA parte do app que sabe ONDE os dados
   ficam. Na Etapa 1 era o localStorage; agora é o Supabase.

   O que mudou para quem usa estas funções (o app.js):
   1. Elas ficaram ASSÍNCRONAS (async): o dado vai e volta pela
      internet, então é preciso esperar com "await".
   2. Em caso de erro elas LANÇAM uma exceção (throw). Quem
      chama usa try/catch e mostra uma mensagem na tela.

   Repare que não mandamos user_id em lugar nenhum: o banco
   preenche sozinho (default auth.uid()) e o RLS garante que
   cada pessoa só lê e altera o que é dela.
   ========================================================= */

// "supabase" (minúsculo) é a biblioteca carregada pelo <script> do CDN.
// "db" é o nosso cliente, já ligado ao seu projeto.
// Se a biblioteca não carregou (sem internet na 1ª abertura), db fica null
// e o app.js mostra um aviso em vez de quebrar.
const db = window.supabase
  ? supabase.createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA)
  : null;

/** Supabase devolve { data, error }. Esta função transforma o error em exceção. */
function verificar({ data, error }) {
  if (error) throw error;
  return data;
}

// Escolher as colunas (em vez de '*') evita trazer dados que não usamos.
const COLUNAS_GASTO = 'id, valor, descricao, categoria, data, forma_pagamento, criado_em';

/* ------------------------- GASTOS ------------------------- */

/** Todos os gastos do usuário, do mais recente para o mais antigo. */
async function listarGastos() {
  return verificar(
    await db
      .from('gastos')
      .select(COLUNAS_GASTO)
      .order('data', { ascending: false })
      .order('criado_em', { ascending: false })
  );
}

/** Cria (sem id) ou atualiza (com id). Devolve o gasto salvo. */
async function salvarGasto(gasto) {
  const campos = {
    valor: gasto.valor,
    descricao: gasto.descricao,
    categoria: gasto.categoria,
    data: gasto.data,
    forma_pagamento: gasto.forma_pagamento,
  };

  const consulta = gasto.id
    ? db.from('gastos').update(campos).eq('id', gasto.id)
    : db.from('gastos').insert(campos);

  // .select().single() pede para o banco devolver a linha salva
  return verificar(await consulta.select(COLUNAS_GASTO).single());
}

async function excluirGasto(id) {
  verificar(await db.from('gastos').delete().eq('id', id));
}

/* ------------- MIGRAÇÃO: dados da Etapa 1 ---------------- */
const CHAVE_ANTIGA = 'meus-gastos:v1';

/** Gastos que ficaram salvos só neste navegador (Etapa 1). */
function gastosDoAparelho() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_ANTIGA) || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/** Envia os gastos do aparelho para a nuvem, todos de uma vez. */
async function importarGastosDoAparelho() {
  const antigos = gastosDoAparelho();
  if (antigos.length === 0) return 0;

  // Não mandamos o id antigo: o banco gera um novo.
  const linhas = antigos.map((g) => ({
    valor: g.valor,
    descricao: g.descricao,
    categoria: g.categoria,
    data: g.data,
    forma_pagamento: g.forma_pagamento,
    criado_em: g.criado_em,
  }));
  verificar(await db.from('gastos').insert(linhas));

  // Renomeia em vez de apagar: se algo der errado, os dados ainda existem.
  localStorage.setItem(CHAVE_ANTIGA + ':importado', localStorage.getItem(CHAVE_ANTIGA));
  localStorage.removeItem(CHAVE_ANTIGA);
  return linhas.length;
}

/* -------------------- GASTOS PROGRAMADOS -------------------- */

/**
 * Metas ativas, já com os depósitos de cada uma.
 * 'depositos_meta(valor, data)' faz um "join": o Supabase usa a
 * chave estrangeira para trazer os depósitos dentro de cada meta.
 */
async function listarProgramados() {
  return verificar(
    await db
      .from('gastos_programados')
      .select('id, descricao, valor_total, data_vencimento, valor_guardado, incluir_mes_vencimento, status, depositos_meta(valor, data)')
      .eq('status', 'ativo')
      .order('data_vencimento', { ascending: true })
  );
}

async function criarProgramado(meta) {
  verificar(
    await db.from('gastos_programados').insert({
      descricao: meta.descricao,
      valor_total: meta.valor_total,
      data_vencimento: meta.data_vencimento,
      incluir_mes_vencimento: meta.incluir_mes_vencimento,
    })
  );
}

/**
 * Registra um "Guardei". O banco recalcula o valor_guardado
 * sozinho (gatilho no SQL). Mandamos a data local porque o
 * "current_date" do servidor usa o fuso UTC.
 */
async function registrarDeposito(metaId, valor) {
  verificar(
    await db.from('depositos_meta').insert({
      gasto_programado_id: metaId,
      valor,
      data: hojeISO(),
    })
  );
}

async function excluirProgramado(id) {
  // Os depósitos somem junto (on delete cascade no SQL)
  verificar(await db.from('gastos_programados').delete().eq('id', id));
}

/* --------------------------- IA --------------------------- */

/**
 * Manda um texto e/ou uma foto para a Edge Function "ler-gasto".
 * O Supabase envia o login (token) junto, sozinho.
 * Devolve { gasto, usos_restantes }. O gasto NÃO é salvo aqui:
 * o app só preenche o formulário para você conferir.
 */
async function interpretarComIA({ texto, imagem }) {
  const { data, error } = await db.functions.invoke('ler-gasto', {
    body: { texto, imagem },
  });

  if (error) {
    // Quando a função responde com erro (400, 429...), a mensagem
    // que escrevemos lá fica dentro de error.context (a resposta HTTP).
    let mensagem = null;
    try {
      if (error.context && typeof error.context.json === 'function') {
        mensagem = (await error.context.json()).erro;
      }
    } catch { /* resposta sem JSON: fica a mensagem genérica */ }

    const erroAmigavel = new Error(mensagem || error.message);
    erroAmigavel.mensagemUsuario = mensagem; // o app.js mostra esta, se houver
    throw erroAmigavel;
  }
  return data;
}
