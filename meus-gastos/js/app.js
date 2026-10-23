/* =========================================================
   app.js — o "maestro": liga telas, dados e login.

   Os dados vêm da internet, então separamos em dois passos:
     1. carregarDados()  → busca no Supabase e guarda em "estado"
     2. atualizarTela()  → desenha as telas a partir do "estado"
   Desenhar é instantâneo; buscar demora. Assim, mudar um filtro
   não precisa ir ao servidor de novo.

   Cada tela tem seu arquivo (inicio.js, metas.js, relatorios.js,
   categorias.js, ia.js). Este aqui cuida do que é comum a todas:
   login, carregar dados, navegação, formulário e lista de gastos.
   ========================================================= */

// Os dados em memória. Sempre um reflexo do que está no banco.
const estado = {
  categorias: [],
  gastos: [],
  programados: [],
  entradas: [],      // extras ("Recebi")
  recorrentes: [],   // contas fixas
  config: { renda_fixa: null, dia_pagamento: 1 },
  usuarioId: null,
  email: '',
};

// Depois do login, os filtros de mês só podem ser ajustados quando
// soubermos o dia do pagamento (que vem do banco). Esta "bandeira" avisa.
let ajustarFiltrosAoCarregar = false;

// ---------- Referências aos elementos ----------
const el = {
  form: document.getElementById('form-gasto'),
  valor: document.getElementById('campo-valor'),
  descricao: document.getElementById('campo-descricao'),
  categoria: document.getElementById('campo-categoria'),
  data: document.getElementById('campo-data'),
  pagamento: document.getElementById('campo-pagamento'),
  erro: document.getElementById('erro-form'),
  tituloNovo: document.getElementById('titulo-novo'),
  botaoSalvar: document.getElementById('botao-salvar'),
  botaoCancelar: document.getElementById('botao-cancelar'),

  filtroMes: document.getElementById('filtro-mes'),
  filtroCategoria: document.getElementById('filtro-categoria'),
  lista: document.getElementById('lista-gastos'),
  listaVazia: document.getElementById('lista-vazia'),
  totalFiltrado: document.getElementById('total-filtrado'),
  totalMes: document.getElementById('total-mes'),
  molde: document.getElementById('molde-gasto'),

  caixaImportar: document.getElementById('caixa-importar'),
  textoImportar: document.getElementById('texto-importar'),
  botaoImportar: document.getElementById('botao-importar'),
  aviso: document.getElementById('aviso'),
};

let idEmEdicao = null;
let timerAviso = null;

// ---------- Avisos ----------
function mostrarAviso(texto, tipo = 'erro') {
  el.aviso.textContent = texto;
  el.aviso.className = 'aviso ' + tipo;
  el.aviso.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => (el.aviso.hidden = true), 5000);
}

/** Mensagem amigável para erros de banco/rede. */
function textoDoErro(erro) {
  // Mensagens que a Edge Function já escreveu em português
  if (erro && erro.mensagemUsuario) return erro.mensagemUsuario;
  const msg = (erro && erro.message) || '';
  if (/failed to fetch|network|load failed/i.test(msg)) return 'Sem conexão. Verifique a internet e tente de novo.';
  if (/jwt|session/i.test(msg)) return 'Sua sessão expirou. Entre de novo.';
  if (/já paga|não encontrada/i.test(msg)) return 'Essa meta já foi paga ou não existe mais.';
  if (/recorrente_competencia/i.test(msg)) return 'Essa conta fixa já foi lançada neste mês.';
  if (/valor_guardado_check/i.test(msg)) return 'Não dá para retirar mais do que está guardado.';
  console.error(erro);
  return 'Não foi possível concluir. Tente de novo.';
}

/** A categoria de um id (ou uma "genérica", se não existir mais). */
function buscarCategoria(id) {
  return estado.categorias.find((c) => c.id === id)
    || { id, nome: 'Sem categoria', icone: '❔', cor: '#64748b', limite_mensal: null };
}

// ---------- Inicialização ----------
function iniciar() {
  if (!db) {
    document.body.className = 'deslogado';
    mensagemLogin('Não consegui carregar o app. Verifique a internet e recarregue a página.');
    return;
  }
  if (SUPABASE_URL.includes('SEU-PROJETO')) {
    document.body.className = 'deslogado';
    mensagemLogin('Falta configurar o arquivo js/config.js com os dados do seu Supabase.');
    return;
  }

  el.data.value = hojeISO();
  el.filtroMes.value = periodo(hojeISO());

  el.form.addEventListener('submit', aoEnviarFormulario);
  el.botaoCancelar.addEventListener('click', sairDaEdicao);
  el.filtroMes.addEventListener('change', atualizarTela);
  el.filtroCategoria.addEventListener('change', atualizarTela);
  el.lista.addEventListener('click', aoClicarNaLista);
  el.botaoImportar.addEventListener('click', aoImportar);

  // Barra de baixo + qualquer botão com data-ir="id-da-tela"
  document.querySelectorAll('.navegacao button').forEach((botao) => {
    botao.addEventListener('click', () => mostrarTela(botao.dataset.tela));
  });
  document.querySelectorAll('[data-ir]').forEach((botao) => {
    botao.addEventListener('click', () => mostrarTela(botao.dataset.ir));
  });
  document.getElementById('botao-config').addEventListener('click', () => mostrarTela('tela-config'));

  // Botões "Cancelar" das janelas (<dialog>)
  document.querySelectorAll('dialog [data-fechar]').forEach((botao) => {
    botao.addEventListener('click', () => botao.closest('dialog').close());
  });

  iniciarAuth();
  iniciarMetas();
  iniciarIA();
  iniciarRelatorios();
  iniciarCategorias();
  iniciarRenda();
  iniciarRecorrentes();
  iniciarExportar();

  /* O Supabase avisa sempre que o login muda: ao abrir o app
     (INITIAL_SESSION), ao entrar (SIGNED_IN) e ao sair (SIGNED_OUT).
     Os comandos ficam dentro de setTimeout porque a documentação do
     Supabase recomenda não chamar o banco direto dentro deste aviso. */
  db.auth.onAuthStateChange((_evento, sessao) => {
    setTimeout(() => aoMudarLogin(sessao), 0);
  });

  registrarServiceWorker();
}

async function aoMudarLogin(sessao) {
  const novoUsuario = sessao ? sessao.user.id : null;
  // O token é renovado de tempos em tempos (mesmo usuário): não recarrega nada
  if (novoUsuario === estado.usuarioId && document.body.className !== 'carregando') return;
  estado.usuarioId = novoUsuario;
  estado.email = sessao ? sessao.user.email : '';

  if (!sessao) {
    // Saiu: limpa tudo da memória para o próximo usuário não ver nada
    estado.categorias = [];
    estado.gastos = [];
    estado.programados = [];
    estado.entradas = [];
    estado.recorrentes = [];
    estado.config = { renda_fixa: null, dia_pagamento: 1 };
    definirDiaPagamento(1);
    sairDaEdicao();
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    atualizarTela();
    document.body.className = 'deslogado';
    return;
  }

  document.body.className = 'logado';
  mostrarTela('tela-inicio');
  ajustarFiltrosAoCarregar = true;
  await carregarDados();
}

/** Coloca os filtros de mês (Lista e Relatórios) no período atual. */
function filtrosNoPeriodoAtual() {
  el.filtroMes.value = periodo(hojeISO());
  relEl.mes.value = periodo(hojeISO());
  expEl.mes.value = periodo(hojeISO());
  mostrarIntervaloExportar();
}

// ---------- Carregar do banco ----------
async function carregarDados() {
  try {
    // Promise.all: busca tudo AO MESMO TEMPO (mais rápido)
    let [categorias, gastos, programados, config, entradas, recorrentes] = await Promise.all([
      listarCategorias(), listarGastos(), listarProgramados(),
      lerConfiguracoes(), listarEntradas(), listarRecorrentes(),
    ]);

    // Conta nova (sem categorias ainda): cria as padrão e busca de novo
    if (categorias.length === 0) {
      await criarCategoriasPadrao();
      categorias = await listarCategorias();
    }

    estado.categorias = categorias;
    estado.gastos = gastos;
    estado.programados = programados;
    estado.entradas = entradas;
    estado.recorrentes = recorrentes;
    estado.config = config || { renda_fixa: null, dia_pagamento: 1 };
    definirDiaPagamento(estado.config.dia_pagamento);
    if (ajustarFiltrosAoCarregar) {
      filtrosNoPeriodoAtual();
      ajustarFiltrosAoCarregar = false;
    }

    // Contas fixas automáticas que já venceram e ainda não entraram
    const lancadas = await lancarContasAutomaticas();
    if (lancadas.length > 0) {
      estado.gastos = await listarGastos();
      mostrarAviso(`🔁 Lançadas sozinhas: ${lancadas.map((g) => g.descricao).join(', ')}.`, 'sucesso');
    }
  } catch (erro) {
    mostrarAviso(textoDoErro(erro));
  }
  atualizarSelectsDeCategoria();
  atualizarTela();
}

/* Os <select> de categoria (novo gasto, filtro, meta, pagamento) são
   montados a partir do banco. Guardamos o valor escolhido antes de
   remontar, para não "pular" a escolha de quem está preenchendo. */
function atualizarSelectsDeCategoria() {
  const montar = (select, primeira) => {
    const escolhido = select.value;
    select.replaceChildren();
    if (primeira) select.append(new Option(primeira.texto, primeira.valor));
    estado.categorias.forEach((cat) => {
      select.append(new Option(`${cat.icone} ${cat.nome}`, cat.id));
    });
    if ([...select.options].some((o) => o.value === escolhido)) select.value = escolhido;
  };
  montar(el.categoria);
  montar(el.filtroCategoria, { texto: 'Todas', valor: '' });
  montar(document.getElementById('meta-categoria'), { texto: 'Sem categoria', valor: '' });
  montar(document.getElementById('pagar-categoria'));
  montar(document.getElementById('recorrente-categoria'));
}

// ---------- Navegação ----------
function mostrarTela(idTela) {
  document.querySelectorAll('.tela').forEach((tela) => {
    tela.classList.toggle('ativa', tela.id === idTela);
  });
  document.querySelectorAll('.navegacao button').forEach((botao) => {
    botao.classList.toggle('ativo', botao.dataset.tela === idTela);
  });
  window.scrollTo(0, 0);
  // Gráficos só são desenhados com a tela visível (o Chart.js precisa
  // saber o tamanho do espaço disponível)
  if (idTela === 'tela-relatorios') desenharRelatorios();
}

// ---------- Formulário de gasto ----------
async function aoEnviarFormulario(evento) {
  evento.preventDefault();

  const centavos = textoParaCentavos(el.valor.value);
  const descricao = el.descricao.value.trim();

  if (centavos === null) return mostrarErro('Digite um valor válido, ex.: 12,50', el.valor);
  if (descricao === '') return mostrarErro('Escreva uma descrição.', el.descricao);
  if (!el.categoria.value) return mostrarErro('Escolha uma categoria.', el.categoria);
  if (!el.data.value) return mostrarErro('Escolha a data.', el.data);

  const gasto = {
    valor: centavos,
    descricao,
    categoria_id: el.categoria.value,
    data: el.data.value,
    forma_pagamento: el.pagamento.value,
  };
  if (idEmEdicao) gasto.id = idEmEdicao;

  // Desliga o botão enquanto salva: evita salvar duas vezes
  // se a pessoa tocar de novo com a internet lenta.
  el.botaoSalvar.disabled = true;
  el.erro.textContent = '';
  try {
    const salvo = await salvarGasto(gasto);
    const estavaEditando = Boolean(idEmEdicao);
    sairDaEdicao();
    el.filtroMes.value = periodo(salvo.data);
    await carregarDados();
    if (estavaEditando) {
      mostrarTela('tela-lista');
    } else {
      el.valor.focus();
    }
    avisarSalvo(salvo);
  } catch (erro) {
    mostrarErro(textoDoErro(erro));
  } finally {
    el.botaoSalvar.disabled = false; // "finally" roda com ou sem erro
  }
}

/** Depois de salvar: confere se a categoria chegou perto do limite. */
function avisarSalvo(gasto) {
  const cat = buscarCategoria(gasto.categoria_id);
  const base = `Salvo: ${gasto.descricao} (${formatarCentavos(gasto.valor)}).`;
  if (!cat.limite_mensal) return mostrarAviso(base, 'sucesso');

  const orc = calcularOrcamento(estado.gastos, estado.categorias, periodo(gasto.data));
  const linha = orc.linhas.find((l) => l.categoria.id === cat.id);
  if (linha.nivel === 'estourou') {
    mostrarAviso(`${base} 🔴 ${cat.nome} passou do limite: ${formatarCentavos(linha.gasto)} de ${formatarCentavos(linha.limite)}.`, 'erro');
  } else if (linha.nivel === 'atencao') {
    mostrarAviso(`${base} ⚠️ ${cat.nome} já usou ${formatarPorcentagem(linha.proporcao)} do limite do mês.`, 'alerta');
  } else {
    mostrarAviso(base, 'sucesso');
  }
}

function mostrarErro(mensagem, campo) {
  el.erro.textContent = mensagem;
  if (campo) campo.focus();
}

function entrarNaEdicao(gasto) {
  idEmEdicao = gasto.id;
  el.valor.value = centavosParaTexto(gasto.valor);
  el.descricao.value = gasto.descricao;
  el.categoria.value = gasto.categoria_id;
  el.data.value = gasto.data;
  el.pagamento.value = gasto.forma_pagamento;

  el.tituloNovo.textContent = 'Editar gasto';
  el.botaoSalvar.textContent = 'Salvar alterações';
  el.botaoCancelar.hidden = false;
  el.erro.textContent = '';
  iaEl.caixa.hidden = true; // a IA é para gastos novos, não para edição
  mostrarTela('tela-novo');
}

function sairDaEdicao() {
  idEmEdicao = null;
  el.form.reset();
  el.data.value = hojeISO();
  el.erro.textContent = '';
  el.tituloNovo.textContent = 'Novo gasto';
  el.botaoSalvar.textContent = 'Adicionar gasto';
  el.botaoCancelar.hidden = true;
  iaEl.caixa.hidden = false;
  statusIA('');
}

// ---------- Lista ----------
async function aoClicarNaLista(evento) {
  const botao = evento.target.closest('button');
  if (!botao) return;

  const id = botao.closest('.item').dataset.id;
  const gasto = estado.gastos.find((g) => g.id === id);
  if (!gasto) return;

  if (botao.classList.contains('acao-editar')) {
    entrarNaEdicao(gasto);
  } else if (botao.classList.contains('acao-excluir')) {
    if (!confirm(`Excluir "${gasto.descricao}" (${formatarCentavos(gasto.valor)})?`)) return;
    botao.disabled = true;
    try {
      await excluirGasto(id);
      if (idEmEdicao === id) sairDaEdicao();
      await carregarDados();
    } catch (erro) {
      botao.disabled = false;
      mostrarAviso(textoDoErro(erro));
    }
  }
}

// ---------- Importar dados da Etapa 1 ----------
async function aoImportar() {
  el.botaoImportar.disabled = true;
  try {
    const quantos = await importarGastosDoAparelho(estado.categorias);
    await carregarDados();
    mostrarAviso(`${quantos} gasto(s) enviados para a nuvem.`, 'sucesso');
  } catch (erro) {
    mostrarAviso(textoDoErro(erro));
  } finally {
    el.botaoImportar.disabled = false;
  }
}

// ---------- Desenhar ----------
function atualizarTela() {
  const mesAtual = periodo(hojeISO());
  el.totalMes.textContent = formatarCentavos(
    somarValores(estado.gastos.filter((g) => periodo(g.data) === mesAtual))
  );

  const mes = el.filtroMes.value;
  const categoria = el.filtroCategoria.value;
  document.getElementById('filtro-intervalo').textContent = mes ? `Período: ${textoDoIntervalo(mes)}` : '';
  const filtrados = estado.gastos.filter((g) =>
    (!mes || periodo(g.data) === mes) &&
    (!categoria || g.categoria_id === categoria)
  );
  el.totalFiltrado.textContent = formatarCentavos(somarValores(filtrados));
  desenharGastos(el.lista, filtrados);
  el.listaVazia.hidden = filtrados.length > 0;

  const doAparelho = gastosDoAparelho().length;
  el.caixaImportar.hidden = doAparelho === 0 || !estado.usuarioId;
  el.textoImportar.textContent =
    `Encontrei ${doAparelho} gasto(s) salvos só neste aparelho (da versão antiga). Quer enviá-los para a sua conta?`;

  desenharInicio();
  desenharMetas();
  desenharCategorias();
  desenharRendaConfig();
  desenharRecorrentesConfig();
  // Relatórios: só se a tela estiver aberta (ver mostrarTela)
  if (document.getElementById('tela-relatorios').classList.contains('ativa')) desenharRelatorios();
}

/** Desenha uma lista de gastos em qualquer <ul> (Lista e Início usam). */
function desenharGastos(ul, gastos) {
  ul.replaceChildren();
  gastos.forEach((gasto) => {
    const item = el.molde.content.firstElementChild.cloneNode(true);
    const cat = buscarCategoria(gasto.categoria_id);

    item.dataset.id = gasto.id;
    item.querySelector('.item-icone').textContent = cat.icone;
    item.querySelector('.item-descricao').textContent = gasto.descricao;
    item.querySelector('.item-detalhes').textContent =
      `${cat.nome} · ${formatarData(gasto.data)} · ${NOMES_PAGAMENTO[gasto.forma_pagamento] || ''}` +
      (gasto.competencia ? ' · 🔁 conta fixa' : '');
    item.querySelector('.item-valor').textContent = formatarCentavos(gasto.valor);
    ul.append(item);
  });
}

// ---------- Service worker (PWA) ----------
function registrarServiceWorker() {
  // Só funciona em https:// ou localhost (não em file://)
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch((erro) => {
      console.warn('Service worker não registrado:', erro);
    });
  }
}

iniciar();
