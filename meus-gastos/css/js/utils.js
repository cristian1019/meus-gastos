/* =========================================================
   utils.js — funções pequenas e "puras" que o app todo usa.
   "Pura" = recebe algo, devolve algo, não mexe na tela nem
   no armazenamento. Isso facilita testar e reaproveitar.
   ========================================================= */

/* Categorias criadas automaticamente no primeiro acesso.
   Desde a Etapa 4 elas moram na tabela "categorias" do banco, e você
   pode editar, criar e excluir na tela Configurações.
   "chave" só serve para converter os gastos antigos (Etapa 1), que
   guardavam a categoria como texto. */
const CATEGORIAS_PADRAO = [
  { chave: 'alimentacao', nome: 'Alimentação', icone: '🍽️', cor: '#f97316', ordem: 1 },
  { chave: 'mercado',     nome: 'Mercado',     icone: '🛒', cor: '#22c55e', ordem: 2 },
  { chave: 'transporte',  nome: 'Transporte',  icone: '⛽', cor: '#3b82f6', ordem: 3 },
  { chave: 'moradia',     nome: 'Moradia',     icone: '🏠', cor: '#a855f7', ordem: 4 },
  { chave: 'saude',       nome: 'Saúde',       icone: '💊', cor: '#ef4444', ordem: 5 },
  { chave: 'educacao',    nome: 'Educação',    icone: '🎓', cor: '#eab308', ordem: 6 },
  { chave: 'lazer',       nome: 'Lazer',       icone: '🎮', cor: '#ec4899', ordem: 7 },
  { chave: 'contas',      nome: 'Contas',      icone: '🧾', cor: '#14b8a6', ordem: 8 },
  { chave: 'outros',      nome: 'Outros',      icone: '📦', cor: '#64748b', ordem: 9 },
];

/* Orçamento: a partir de quanto do limite a categoria vira alerta */
const ALERTA_ATENCAO = 0.8; // 80% → amarelo
const ALERTA_ESTOUROU = 1;  // 100% → vermelho

const NOMES_PAGAMENTO = {
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
  dinheiro: 'Dinheiro',
  vale_refeicao: 'Vale-refeição',
};

/* ---------------------------------------------------------
   DINHEIRO EM CENTAVOS
   Em JavaScript, 0.1 + 0.2 dá 0.30000000000000004.
   Para não acumular esses erros nas somas, guardamos todo
   valor como número INTEIRO de centavos: R$ 12,50 vira 1250.
   Só convertemos para "R$ 12,50" na hora de mostrar.
   --------------------------------------------------------- */

/**
 * Converte o que a pessoa digitou em centavos.
 * Aceita "12,50", "12.50", "1.500,00", "R$ 150".
 * Devolve null se não for um valor válido e positivo.
 */
function textoParaCentavos(texto) {
  if (typeof texto !== 'string') return null;

  let limpo = texto.replace(/[R$\s]/g, '');
  if (limpo === '') return null;

  if (limpo.includes(',')) {
    // Formato brasileiro: ponto é separador de milhar, vírgula é decimal
    limpo = limpo.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    // "1.500" sem vírgula: os pontos são de milhar
    limpo = limpo.replace(/\./g, '');
  }

  // Aceita só números com até 2 casas decimais
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;

  const centavos = Math.round(parseFloat(limpo) * 100);
  return centavos > 0 ? centavos : null;
}

/** 1250 → "R$ 12,50" */
const formatadorReal = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
function formatarCentavos(centavos) {
  return formatadorReal.format(centavos / 100);
}

/** 1250 → "12,50" (para colocar de volta no campo ao editar) */
function centavosParaTexto(centavos) {
  return (centavos / 100).toFixed(2).replace('.', ',');
}

/* ---------------------------------------------------------
   DATAS
   Guardamos datas como texto "AAAA-MM-DD" (o mesmo formato
   do <input type="date"> e do tipo DATE do banco).
   Cuidado: new Date().toISOString() usa o fuso UTC, então
   às 22h no Brasil ele já diria que é "amanhã". Por isso
   montamos a data com os números do fuso local.
   --------------------------------------------------------- */
function hojeISO() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** "2026-10-22" → "2026-10" */
function mesDaData(dataISO) {
  return dataISO.slice(0, 7);
}

/** "2026-10-22" → "22/10/2026" */
function formatarData(dataISO) {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Gera um id único. O Supabase também aceita esse formato (uuid). */
function gerarId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  // Plano B para navegadores antigos
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}


/** Soma o campo "valor" (em centavos) de uma lista. */
function somarValores(lista) {
  return lista.reduce((total, item) => total + item.valor, 0);
}

/* =========================================================
   GASTOS PROGRAMADOS — o cálculo de quanto guardar por mês.
   Fica aqui (e não no banco nem na IA) porque é regra do app:
   "contas e somas são feitas no código".
   ========================================================= */

/**
 * Quantos meses de "guardar" existem de hoje até o vencimento.
 * O mês atual SEMPRE conta (ainda dá para guardar este mês).
 *
 * Ex.: hoje 22/10, vence em 10/12:
 *   sem incluir dezembro → outubro e novembro = 2 meses
 *   incluindo dezembro   → outubro, novembro e dezembro = 3 meses
 */
function mesesParaGuardar(hoje, vencimento, incluirMesVencimento) {
  const [anoH, mesH] = hoje.split('-').map(Number);
  const [anoV, mesV] = vencimento.split('-').map(Number);
  const mesesAteVencimento = (anoV - anoH) * 12 + (mesV - mesH);
  return mesesAteVencimento + (incluirMesVencimento ? 1 : 0);
}

/**
 * Calcula tudo o que a tela de metas precisa mostrar.
 *
 * Detalhe importante: o valor mensal é calculado com o que estava
 * guardado ANTES deste mês. Senão, ao guardar R$ 750 em outubro,
 * a conta refaria "falta 750 ÷ 2 meses" e diria para guardar mais
 * R$ 375 em outubro, que já está pago.
 */
function calcularMeta(meta, hoje = hojeISO()) {
  const depositos = meta.depositos_meta || [];
  const mesAtual = mesDaData(hoje);

  const guardado = meta.valor_guardado;
  const restante = Math.max(0, meta.valor_total - guardado);
  const guardadoEsteMes = somarValores(
    depositos.filter((d) => mesDaData(d.data) === mesAtual)
  );
  const guardadoAntesDoMes = guardado - guardadoEsteMes;

  const meses = mesesParaGuardar(hoje, meta.data_vencimento, meta.incluir_mes_vencimento);
  const atrasada = meta.data_vencimento < hoje && restante > 0;

  // Se não sobrou nenhum mês (vence agora ou já venceu), tudo precisa sair já.
  const mesesDivisao = Math.max(1, meses);
  const faltavaNoInicioDoMes = Math.max(0, meta.valor_total - guardadoAntesDoMes);
  // Math.ceil arredonda o centavo para CIMA, para a soma das parcelas
  // nunca ficar abaixo do total.
  const valorMensal = Math.ceil(faltavaNoInicioDoMes / mesesDivisao);
  const faltaEsteMes = Math.min(restante, Math.max(0, valorMensal - guardadoEsteMes));

  return {
    guardado,
    restante,
    concluida: restante === 0,
    progresso: Math.min(1, guardado / meta.valor_total), // 0 a 1
    meses: Math.max(0, meses),
    valorMensal,
    guardadoEsteMes,
    faltaEsteMes,
    atrasada,
  };
}

/* =========================================================
   MESES — sempre no formato "AAAA-MM"
   ========================================================= */

/** "2026-10" + 2 → "2026-12";  "2026-01" + (-1) → "2025-12" */
function somarMeses(mes, quantidade) {
  const [ano, m] = mes.split('-').map(Number);
  const total = ano * 12 + (m - 1) + quantidade; // conta tudo em meses
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  return `${novoAno}-${String(novoMes).padStart(2, '0')}`;
}

/** Os últimos N meses terminando em "mes", do mais antigo ao mais novo. */
function ultimosMeses(mes, n) {
  return Array.from({ length: n }, (_, i) => somarMeses(mes, i - (n - 1)));
}

const NOMES_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-10" → "outubro de 2026"  |  curto: "out/26" */
function nomeDoMes(mes, curto = false) {
  const [ano, m] = mes.split('-').map(Number);
  const nome = NOMES_MESES[m - 1];
  return curto ? `${nome.slice(0, 3)}/${String(ano).slice(2)}` : `${nome} de ${ano}`;
}

/** Porcentagem inteira para mostrar: 0.856 → "86%" */
function formatarPorcentagem(proporcao) {
  // Algo entre 0 e 0,5% arredondaria para "0%", o que parece "nada"
  if (proporcao > 0 && proporcao < 0.005) return '<1%';
  return Math.round(proporcao * 100) + '%';
}

/* =========================================================
   ORÇAMENTO — quanto já foi gasto do limite de cada categoria.

   Regras:
   - Só categorias COM limite entram no orçamento.
   - Orçamento do mês = soma dos limites.
   - Restante = orçamento − gastos (do mês) nessas categorias.
     Pode ficar negativo: significa que passou do orçamento.
   - Gastos em categorias sem limite aparecem à parte
     ("fora do orçamento"), para não esconder nada.
   ========================================================= */
function nivelDoLimite(proporcao) {
  if (proporcao >= ALERTA_ESTOUROU) return 'estourou';
  if (proporcao >= ALERTA_ATENCAO) return 'atencao';
  return 'ok';
}

function calcularOrcamento(gastos, categorias, mes) {
  const doMes = gastos.filter((g) => mesDaData(g.data) === mes);

  // Soma por categoria numa passada só: { idDaCategoria: centavos }
  const porCategoria = {};
  doMes.forEach((g) => {
    porCategoria[g.categoria_id] = (porCategoria[g.categoria_id] || 0) + g.valor;
  });

  const linhas = categorias.map((cat) => {
    const gasto = porCategoria[cat.id] || 0;
    const limite = cat.limite_mensal;
    const proporcao = limite ? gasto / limite : null;
    return {
      categoria: cat,
      gasto,
      limite,
      proporcao,
      nivel: limite ? nivelDoLimite(proporcao) : null,
    };
  });

  const comLimite = linhas.filter((l) => l.limite);
  const orcamento = comLimite.reduce((t, l) => t + l.limite, 0);
  const gastoNoOrcamento = comLimite.reduce((t, l) => t + l.gasto, 0);
  const totalMes = somarValores(doMes);

  return {
    linhas,
    totalMes,
    orcamento,                                  // 0 = nenhum limite definido
    gastoNoOrcamento,
    restante: orcamento - gastoNoOrcamento,
    foraDoOrcamento: totalMes - gastoNoOrcamento,
    proporcao: orcamento ? gastoNoOrcamento / orcamento : null,
    alertas: comLimite
      .filter((l) => l.nivel !== 'ok')
      .sort((a, b) => b.proporcao - a.proporcao),
  };
}
