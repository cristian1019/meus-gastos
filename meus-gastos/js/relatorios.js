/* =========================================================
   relatorios.js — tela Relatórios.

   - Pizza (rosca): para onde foi o dinheiro no mês, por categoria
   - Barras: total dos últimos 6 meses
   - Dicas da IA: o app CALCULA um resumo com os números e manda
     para a IA, que só ESCREVE o texto (regra do projeto)

   Gráficos com Chart.js (chartjs.org). A biblioteca desenha num
   <canvas>; nós só passamos os dados e as cores.
   ========================================================= */

const relEl = {
  mes: document.getElementById('relatorio-mes'),
  semGrafico: document.getElementById('relatorio-sem-grafico'),
  total: document.getElementById('relatorio-total'),
  canvasPizza: document.getElementById('grafico-pizza'),
  canvasBarras: document.getElementById('grafico-barras'),
  legenda: document.getElementById('relatorio-legenda'),
  vazio: document.getElementById('relatorio-vazio'),
  comparacao: document.getElementById('relatorio-comparacao'),

  dicasConteudo: document.getElementById('dicas-conteudo'),
  dicasResumo: document.getElementById('dicas-resumo'),
  dicasLista: document.getElementById('dicas-lista'),
  dicasAviso: document.getElementById('dicas-aviso'),
  dicasStatus: document.getElementById('dicas-status'),
  botaoDicas: document.getElementById('botao-dicas'),
};

const MESES_NO_GRAFICO = 6;

// Guardamos os gráficos para destruí-los antes de desenhar de novo
// (o Chart.js não deixa criar dois gráficos no mesmo <canvas>).
let graficoPizza = null;
let graficoBarras = null;

// "R$ 1,2 mil" — formato curto para os números do eixo
const formatadorCompacto = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1,
});

function iniciarRelatorios() {
  relEl.mes.value = periodo(hojeISO());
  relEl.mes.addEventListener('change', desenharRelatorios);
  relEl.botaoDicas.addEventListener('click', aoGerarDicas);
  // Trocou entre claro/escuro com a tela aberta? Redesenha com as cores novas
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (document.getElementById('tela-relatorios').classList.contains('ativa')) desenharRelatorios();
  });
}

/** Lê as cores do tema atual direto das variáveis do CSS. */
function coresDoTema() {
  const css = getComputedStyle(document.documentElement);
  const ler = (nome) => css.getPropertyValue(nome).trim();
  return {
    texto: ler('--cor-texto-suave'),
    borda: ler('--cor-borda'),
    cartao: ler('--cor-cartao'),
    principal: ler('--cor-principal'),
  };
}

function desenharRelatorios() {
  const mes = relEl.mes.value || periodo(hojeISO());
  const orc = calcularOrcamento(estado.gastos, estado.categorias, mes);

  // Fatias: só categorias com gasto, da maior para a menor
  const fatias = orc.linhas.filter((l) => l.gasto > 0).sort((a, b) => b.gasto - a.gasto);
  relEl.total.textContent = formatarCentavos(orc.totalMes);
  document.getElementById('relatorio-intervalo').textContent = `Período: ${textoDoIntervalo(mes)}`;
  relEl.vazio.hidden = fatias.length > 0;

  desenharLegenda(fatias, orc.totalMes);

  const meses = ultimosMeses(mes, MESES_NO_GRAFICO);
  const totais = meses.map((m) =>
    somarValores(estado.gastos.filter((g) => periodo(g.data) === m)));
  desenharComparacao(mes, totais);

  if (!window.Chart) {
    // Sem internet na hora de abrir o app, a biblioteca não carrega
    relEl.semGrafico.hidden = false;
  } else {
    relEl.semGrafico.hidden = true;
    const cores = coresDoTema();
    Chart.defaults.color = cores.texto;
    Chart.defaults.borderColor = cores.borda;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    desenharPizza(fatias, cores);
    desenharBarras(meses, totais, cores);
  }

  mostrarDicasGuardadas(mes);
}

// ---------- Pizza ----------
function desenharPizza(fatias, cores) {
  if (graficoPizza) graficoPizza.destroy();
  relEl.canvasPizza.parentElement.hidden = fatias.length === 0;
  if (fatias.length === 0) return;

  graficoPizza = new Chart(relEl.canvasPizza, {
    type: 'doughnut',
    data: {
      labels: fatias.map((l) => l.categoria.nome),
      datasets: [{
        data: fatias.map((l) => l.gasto), // em centavos; o tooltip formata
        backgroundColor: fatias.map((l) => l.categoria.cor),
        borderColor: cores.cartao,            // "espaço" entre as fatias
        borderWidth: 2,
      }],
    },
    options: {
      maintainAspectRatio: false, // a altura vem do CSS
      cutout: '62%',
      plugins: {
        legend: { display: false }, // usamos a nossa legenda (lista)
        tooltip: {
          callbacks: { label: (ctx) => ` ${ctx.label}: ${formatarCentavos(ctx.raw)}` },
        },
      },
    },
  });
}

/* Legenda como lista HTML: mostra valores e porcentagens exatos e
   funciona com leitor de tela (o desenho do <canvas> não). */
function desenharLegenda(fatias, total) {
  relEl.legenda.replaceChildren();
  fatias.forEach((l) => {
    const li = document.createElement('li');
    const bolinha = document.createElement('span');
    bolinha.className = 'bolinha';
    bolinha.style.background = l.categoria.cor;
    const nome = document.createElement('span');
    nome.className = 'legenda-nome';
    nome.textContent = `${l.categoria.icone} ${l.categoria.nome}`;
    const valor = document.createElement('span');
    valor.className = 'legenda-valor';
    valor.textContent = `${formatarCentavos(l.gasto)} · ${formatarPorcentagem(l.gasto / total)}`;
    li.append(bolinha, nome, valor);
    relEl.legenda.append(li);
  });
}

// ---------- Barras ----------
function desenharBarras(meses, totais, cores) {
  if (graficoBarras) graficoBarras.destroy();
  const ultimo = meses.length - 1;

  graficoBarras = new Chart(relEl.canvasBarras, {
    type: 'bar',
    data: {
      labels: meses.map((m) => nomeDoMes(m, true)),
      datasets: [{
        data: totais,
        // O mês escolhido em destaque; os outros mais claros ("59" = 35% de opacidade)
        backgroundColor: meses.map((_, i) => (i === ultimo ? cores.principal : cores.principal + '59')),
        borderRadius: 6,
        maxBarThickness: 40,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${formatarCentavos(ctx.raw)}` } },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { callback: (valor) => formatadorCompacto.format(valor / 100), maxTicksLimit: 5 },
        },
      },
    },
  });
}

/** Frase comparando com o mês anterior (a conta é do código). */
function desenharComparacao(mes, totais) {
  const atual = totais[totais.length - 1];
  const anterior = totais[totais.length - 2];
  const nomeAnterior = nomeDoMes(somarMeses(mes, -1));
  if (anterior === 0) {
    relEl.comparacao.textContent = `Sem gastos registrados em ${nomeAnterior} para comparar.`;
    return;
  }
  const diferenca = atual - anterior;
  const proporcao = Math.abs(diferenca) / anterior;
  relEl.comparacao.textContent = diferenca === 0
    ? `Igual a ${nomeAnterior} (${formatarCentavos(anterior)}).`
    : `${formatarPorcentagem(proporcao)} ${diferenca > 0 ? 'a mais' : 'a menos'} que ${nomeAnterior} (${formatarCentavos(anterior)}).`;
}

/* =========================================================
   DICAS DA IA
   ========================================================= */

/** Resumo do mês com TODOS os números prontos e já formatados.
    A IA recebe isto e só escreve; não precisa calcular nada. */
function montarResumoParaIA(mes) {
  const orc = calcularOrcamento(estado.gastos, estado.categorias, mes);
  const mesAnterior = somarMeses(mes, -1);
  const orcAnterior = calcularOrcamento(estado.gastos, estado.categorias, mesAnterior);
  const gastoAnterior = Object.fromEntries(orcAnterior.linhas.map((l) => [l.categoria.id, l.gasto]));

  const hoje = hojeISO();
  const emAndamento = periodo(hoje) === mes;
  const entradasDoMes = estado.entradas.filter((e) => periodo(e.data) === mes);
  const rendaFixa = estado.config.renda_fixa || 0;
  const extras = somarValores(entradasDoMes);

  const variacao = orcAnterior.totalMes > 0
    ? Math.round(((orc.totalMes - orcAnterior.totalMes) / orcAnterior.totalMes) * 100)
    : null;

  const resumo = {
    mes: `${nomeDoMes(mes)} (${textoDoIntervalo(mes)}, o mês começa no dia do salário)`,
    situacao: emAndamento
      ? `período em andamento, hoje é ${formatarData(hoje)}`
      : 'período encerrado',
    renda: rendaFixa + extras > 0 ? {
      renda_fixa: formatarCentavos(rendaFixa),
      extras: formatarCentavos(extras),
      renda_total: formatarCentavos(rendaFixa + extras),
      [rendaFixa + extras - orc.totalMes >= 0 ? 'sobra_apos_gastos' : 'gastos_passaram_da_renda_em']:
        formatarCentavos(Math.abs(rendaFixa + extras - orc.totalMes)),
    } : 'renda não informada',
    total_gasto: formatarCentavos(orc.totalMes),
    total_mes_anterior: formatarCentavos(orcAnterior.totalMes),
    variacao_em_relacao_ao_mes_anterior: variacao === null ? 'sem dados do mês anterior' : `${variacao > 0 ? '+' : ''}${variacao}%`,
    orcamento: orc.orcamento > 0 ? {
      limite_total: formatarCentavos(orc.orcamento),
      gasto_nas_categorias_com_limite: formatarCentavos(orc.gastoNoOrcamento),
      percentual_usado: formatarPorcentagem(orc.proporcao),
      [orc.restante >= 0 ? 'restante' : 'passou_do_orcamento']: formatarCentavos(Math.abs(orc.restante)),
    } : 'nenhuma categoria tem limite definido',
    categorias: orc.linhas
      .filter((l) => l.gasto > 0 || l.limite)
      .sort((a, b) => b.gasto - a.gasto)
      .slice(0, 12)
      .map((l) => ({
        nome: l.categoria.nome,
        gasto: formatarCentavos(l.gasto),
        percentual_do_total: orc.totalMes ? formatarPorcentagem(l.gasto / orc.totalMes) : '0%',
        mes_anterior: formatarCentavos(gastoAnterior[l.categoria.id] || 0),
        limite: l.limite ? formatarCentavos(l.limite) : 'sem limite',
        ...(l.limite ? { percentual_do_limite: formatarPorcentagem(l.proporcao) } : {}),
      })),
    maiores_gastos: estado.gastos
      .filter((g) => periodo(g.data) === mes)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 3)
      .map((g) => ({ descricao: g.descricao, valor: formatarCentavos(g.valor), categoria: buscarCategoria(g.categoria_id).nome })),
    metas_ativas: estado.programados.slice(0, 8).map((meta) => {
      const calc = calcularMeta(meta);
      return {
        descricao: meta.descricao,
        tipo: meta.tipo === 'economia' ? 'economia (reserva)' : 'conta a pagar',
        // Economia pode não ter prazo
        vence: meta.data_vencimento ? formatarData(meta.data_vencimento) : 'sem prazo',
        falta_guardar: formatarCentavos(calc.restante),
        guardar_este_mes: formatarCentavos(calc.faltaEsteMes),
        ...(calc.atrasada ? { atrasada: 'sim' } : {}),
      };
    }),
  };
  return resumo;
}

/* As dicas ficam guardadas NESTE aparelho (localStorage) por mês:
   reabrir a tela não gasta outro uso da IA. Se os gastos mudarem,
   avisamos que dá para gerar de novo. try/catch: em aba anônima o
   navegador pode bloquear o localStorage. */
/* "Assinatura" do resumo para saber se os dados mudaram. Tiramos o
   "dia X de 31", que muda todo dia mesmo sem gasto novo. */
function assinaturaDoResumo(resumo) {
  const { situacao, ...resto } = resumo;
  return JSON.stringify(resto);
}

function chaveDicas(mes) {
  return `meus-gastos:dicas:${estado.usuarioId}:${mes}`;
}

function lerDicasGuardadas(mes) {
  try {
    return JSON.parse(localStorage.getItem(chaveDicas(mes)) || 'null');
  } catch {
    return null;
  }
}

function guardarDicas(mes, assinatura, dicas) {
  try {
    localStorage.setItem(chaveDicas(mes), JSON.stringify({ assinatura, dicas, em: new Date().toISOString() }));
  } catch { /* sem espaço ou bloqueado: só não guarda */ }
}

function mostrarDicasGuardadas(mes) {
  const guardadas = lerDicasGuardadas(mes);
  relEl.dicasStatus.textContent = '';
  if (!guardadas) {
    relEl.dicasConteudo.hidden = true;
    relEl.botaoDicas.textContent = 'Gerar dicas deste mês';
    return;
  }
  exibirDicas(guardadas.dicas);
  const mudou = guardadas.assinatura !== assinaturaDoResumo(montarResumoParaIA(mes));
  const quando = new Date(guardadas.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  relEl.dicasAviso.textContent = mudou
    ? `Geradas em ${quando}. Seus gastos mudaram desde então.`
    : `Geradas em ${quando}.`;
  relEl.botaoDicas.textContent = 'Gerar de novo';
}

function exibirDicas(dicas) {
  relEl.dicasConteudo.hidden = false;
  relEl.dicasResumo.textContent = dicas.resumo; // textContent: texto da IA nunca vira HTML
  relEl.dicasLista.replaceChildren();
  dicas.dicas.forEach((texto) => {
    const li = document.createElement('li');
    li.textContent = texto;
    relEl.dicasLista.append(li);
  });
}

async function aoGerarDicas() {
  const mes = relEl.mes.value || periodo(hojeISO());
  const doMes = estado.gastos.filter((g) => periodo(g.data) === mes);
  if (doMes.length === 0) {
    relEl.dicasStatus.className = 'mensagem erro';
    relEl.dicasStatus.textContent = 'Sem gastos neste mês: não há o que analisar.';
    return;
  }

  const resumo = montarResumoParaIA(mes);
  relEl.botaoDicas.disabled = true;
  relEl.dicasStatus.className = 'mensagem info';
  relEl.dicasStatus.textContent = 'Escrevendo as dicas…';
  try {
    const { dicas, usos_restantes } = await gerarDicasComIA(resumo);
    guardarDicas(mes, assinaturaDoResumo(resumo), dicas);
    mostrarDicasGuardadas(mes);
    relEl.dicasStatus.className = 'mensagem sucesso';
    relEl.dicasStatus.textContent = `Pronto! (${usos_restantes} uso${usos_restantes === 1 ? '' : 's'} da IA hoje)`;
  } catch (erro) {
    relEl.dicasStatus.className = 'mensagem erro';
    relEl.dicasStatus.textContent = textoDoErro(erro);
  } finally {
    relEl.botaoDicas.disabled = false;
  }
}
