/* =========================================================
   app.js — o "maestro": liga telas, dados e login.

   Mudança principal da Etapa 2: os dados agora vêm da internet.
   Então separamos em dois passos:
     1. carregarDados()  → busca no Supabase e guarda em "estado"
     2. atualizarTela()  → desenha a tela a partir do "estado"
   Desenhar é instantâneo; buscar demora. Assim, mudar um filtro
   não precisa ir ao servidor de novo.
   ========================================================= */

// Os dados em memória. Sempre um reflexo do que está no banco.
const estado = {
  gastos: [],
  programados: [],
  usuarioId: null,
};

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
  console.error(erro);
  return 'Não foi possível concluir. Tente de novo.';
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

  preencherCategorias();
  el.data.value = hojeISO();
  el.filtroMes.value = mesDaData(hojeISO());

  el.form.addEventListener('submit', aoEnviarFormulario);
  el.botaoCancelar.addEventListener('click', sairDaEdicao);
  el.filtroMes.addEventListener('change', atualizarTela);
  el.filtroCategoria.addEventListener('change', atualizarTela);
  el.lista.addEventListener('click', aoClicarNaLista);
  el.botaoImportar.addEventListener('click', aoImportar);
  document.querySelectorAll('.navegacao button').forEach((botao) => {
    botao.addEventListener('click', () => mostrarTela(botao.dataset.tela));
  });

  iniciarAuth();
  iniciarMetas();
  iniciarIA();

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

  if (!sessao) {
    // Saiu: limpa tudo da memória para o próximo usuário não ver nada
    estado.gastos = [];
    estado.programados = [];
    sairDaEdicao();
    atualizarTela();
    document.body.className = 'deslogado';
    return;
  }

  document.body.className = 'logado';
  mostrarTela('tela-novo');
  await carregarDados();
}

function preencherCategorias() {
  CATEGORIAS_PADRAO.forEach((cat) => {
    el.categoria.append(new Option(`${cat.icone} ${cat.nome}`, cat.id));
    el.filtroCategoria.append(new Option(`${cat.icone} ${cat.nome}`, cat.id));
  });
}

// ---------- Carregar do banco ----------
async function carregarDados() {
  try {
    // Promise.all: busca as duas listas AO MESMO TEMPO (mais rápido)
    const [gastos, programados] = await Promise.all([listarGastos(), listarProgramados()]);
    estado.gastos = gastos;
    estado.programados = programados;
  } catch (erro) {
    mostrarAviso(textoDoErro(erro));
  }
  atualizarTela();
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
}

// ---------- Formulário de gasto ----------
async function aoEnviarFormulario(evento) {
  evento.preventDefault();

  const centavos = textoParaCentavos(el.valor.value);
  const descricao = el.descricao.value.trim();

  if (centavos === null) return mostrarErro('Digite um valor válido, ex.: 12,50', el.valor);
  if (descricao === '') return mostrarErro('Escreva uma descrição.', el.descricao);
  if (!el.data.value) return mostrarErro('Escolha a data.', el.data);

  const gasto = {
    valor: centavos,
    descricao,
    categoria: el.categoria.value,
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
    el.filtroMes.value = mesDaData(salvo.data);
    await carregarDados();
    if (estavaEditando) {
      mostrarTela('tela-lista');
    } else {
      mostrarAviso(`Salvo: ${salvo.descricao} (${formatarCentavos(salvo.valor)})`, 'sucesso');
      el.valor.focus();
    }
  } catch (erro) {
    mostrarErro(textoDoErro(erro));
  } finally {
    el.botaoSalvar.disabled = false; // "finally" roda com ou sem erro
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
  el.categoria.value = gasto.categoria;
  el.data.value = gasto.data;
  el.pagamento.value = gasto.forma_pagamento;

  el.tituloNovo.textContent = 'Editar gasto';
  el.botaoSalvar.textContent = 'Salvar alterações';
  el.botaoCancelar.hidden = false;
  iaEl.caixa.hidden = true; // a IA é para gastos novos, não para edição
  el.erro.textContent = '';
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
    const quantos = await importarGastosDoAparelho();
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
  const mesAtual = mesDaData(hojeISO());
  el.totalMes.textContent = formatarCentavos(
    somarValores(estado.gastos.filter((g) => mesDaData(g.data) === mesAtual))
  );

  const mes = el.filtroMes.value;
  const categoria = el.filtroCategoria.value;
  const filtrados = estado.gastos.filter((g) =>
    (!mes || mesDaData(g.data) === mes) &&
    (!categoria || g.categoria === categoria)
  );
  el.totalFiltrado.textContent = formatarCentavos(somarValores(filtrados));
  desenharLista(filtrados);

  const doAparelho = gastosDoAparelho().length;
  el.caixaImportar.hidden = doAparelho === 0 || !estado.usuarioId;
  el.textoImportar.textContent =
    `Encontrei ${doAparelho} gasto(s) salvos só neste aparelho (da versão antiga). Quer enviá-los para a sua conta?`;

  desenharMetas();
}

function desenharLista(gastos) {
  el.lista.replaceChildren();
  el.listaVazia.hidden = gastos.length > 0;

  gastos.forEach((gasto) => {
    const item = el.molde.content.firstElementChild.cloneNode(true);
    const cat = buscarCategoria(gasto.categoria);

    item.dataset.id = gasto.id;
    item.querySelector('.item-icone').textContent = cat.icone;
    item.querySelector('.item-descricao').textContent = gasto.descricao;
    item.querySelector('.item-detalhes').textContent =
      `${cat.nome} · ${formatarData(gasto.data)} · ${NOMES_PAGAMENTO[gasto.forma_pagamento] || ''}`;
    item.querySelector('.item-valor').textContent = formatarCentavos(gasto.valor);
    el.lista.append(item);
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
