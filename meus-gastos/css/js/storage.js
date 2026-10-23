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
const COLUNAS_GASTO = 'id, valor, descricao, categoria_id, data, forma_pagamento, criado_em';

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
    categoria_id: gasto.categoria_id,
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

/** Passa todos os gastos de uma categoria para outra (antes de excluir). */
async function moverGastosDeCategoria(deId, paraId) {
  verificar(await db.from('gastos').update({ categoria_id: paraId }).eq('categoria_id', deId));
}

/* ----------------------- CATEGORIAS ----------------------- */
const COLUNAS_CATEGORIA = 'id, nome, icone, cor, limite_mensal, ordem';

async function listarCategorias() {
  return verificar(
    await db
      .from('categorias')
      .select(COLUNAS_CATEGORIA)
      .order('ordem', { ascending: true })
      .order('nome', { ascending: true })
  );
}

/**
 * Primeiro acesso de uma conta nova: cria as categorias padrão.
 * "upsert" com ignoreDuplicates = "insira, e se já existir uma com
 * o mesmo nome, deixe quieto". Assim, se dois aparelhos abrirem o
 * app ao mesmo tempo, não aparecem categorias repetidas.
 */
async function criarCategoriasPadrao() {
  const linhas = CATEGORIAS_PADRAO.map(({ nome, icone, cor, ordem }) => ({ nome, icone, cor, ordem }));
  verificar(
    await db.from('categorias').upsert(linhas, { onConflict: 'user_id,nome', ignoreDuplicates: true })
  );
}

/** Cria (sem id) ou atualiza (com id) uma categoria. */
async function salvarCategoria(cat) {
  const campos = {
    nome: cat.nome,
    icone: cat.icone,
    cor: cat.cor,
    limite_mensal: cat.limite_mensal,
  };
  if (!cat.id) campos.ordem = cat.ordem;

  const consulta = cat.id
    ? db.from('categorias').update(campos).eq('id', cat.id)
    : db.from('categorias').insert(campos);
  return verificar(await consulta.select(COLUNAS_CATEGORIA).single());
}

async function excluirCategoria(id) {
  verificar(await db.from('categorias').delete().eq('id', id));
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

/**
 * Envia os gastos do aparelho para a nuvem, todos de uma vez.
 * Os gastos antigos guardavam a categoria como texto ("mercado");
 * aqui convertemos para o id da categoria de mesmo nome no banco.
 */
async function importarGastosDoAparelho(categorias) {
  const antigos = gastosDoAparelho();
  if (antigos.length === 0) return 0;

  const idPorNome = Object.fromEntries(categorias.map((c) => [c.nome, c.id]));
  const reserva = idPorNome['Outros'] || categorias[0].id;
  const idDaChave = (chave) => {
    const padrao = CATEGORIAS_PADRAO.find((c) => c.chave === chave);
    return (padrao && idPorNome[padrao.nome]) || reserva;
  };

  // Não mandamos o id antigo: o banco gera um novo.
  const linhas = antigos.map((g) => ({
    valor: g.valor,
    descricao: g.descricao,
    categoria_id: idDaChave(g.categoria),
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
 * 'depositos_meta(id, valor, data)' faz um "join": o Supabase usa a
 * chave estrangeira para trazer os depósitos dentro de cada meta.
 */
async function listarProgramados() {
  const metas = verificar(
    await db
      .from('gastos_programados')
      .select('id, descricao, valor_total, data_vencimento, valor_guardado, incluir_mes_vencimento, recorrencia, categoria_id, status, depositos_meta(id, valor, data, criado_em)')
      .eq('status', 'ativo')
      .order('data_vencimento', { ascending: true })
  );
  // Depósitos do mais novo para o mais antigo (para o histórico)
  metas.forEach((m) => m.depositos_meta.sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1)));
  return metas;
}

/** Cria (sem id) ou edita (com id) uma meta. */
async function salvarProgramado(meta) {
  const campos = {
    descricao: meta.descricao,
    valor_total: meta.valor_total,
    data_vencimento: meta.data_vencimento,
    incluir_mes_vencimento: meta.incluir_mes_vencimento,
    recorrencia: meta.recorrencia,
    categoria_id: meta.categoria_id,
  };
  const consulta = meta.id
    ? db.from('gastos_programados').update(campos).eq('id', meta.id)
    : db.from('gastos_programados').insert(campos);
  verificar(await consulta);
}

/**
 * "Paguei": chama a função do banco que, numa transação só, lança o
 * gasto real, marca a meta como paga e cria a próxima (se recorrente).
 * .rpc() = "remote procedure call", chamar uma função do banco.
 */
async function pagarProgramado(metaId, pagamento) {
  return verificar(
    await db.rpc('pagar_gasto_programado', {
      p_meta_id: metaId,
      p_valor: pagamento.valor,
      p_data: pagamento.data,
      p_forma_pagamento: pagamento.forma_pagamento,
      p_categoria_id: pagamento.categoria_id,
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

/** Desfaz um "Guardei". O gatilho do banco recalcula o total guardado. */
async function excluirDeposito(id) {
  verificar(await db.from('depositos_meta').delete().eq('id', id));
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
  return chamarFuncaoIA({ texto, imagem });
}

/**
 * Pede à IA um texto de dicas sobre o mês. O "resumo" já vem com
 * todos os números calculados pelo app: a IA só escreve.
 * Devolve { dicas: { resumo, dicas: [...] }, usos_restantes }.
 */
async function gerarDicasComIA(resumo) {
  return chamarFuncaoIA({ tipo: 'dicas', resumo });
}

/** Chamada comum às duas funções acima (mesma Edge Function). */
async function chamarFuncaoIA(corpo) {
  const { data, error } = await db.functions.invoke('ler-gasto', { body: corpo });

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
