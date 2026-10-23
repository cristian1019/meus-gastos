/* =========================================================
   renda.js — renda fixa, dia do pagamento e extras ("Recebi").

   O dia do pagamento define o "mês" do app (ver periodo() em
   utils.js). A renda alimenta o cartão "Ainda pode gastar" da
   tela Início.
   ========================================================= */

const rendaEl = {
  form: document.getElementById('form-renda'),
  fixa: document.getElementById('renda-fixa'),
  dia: document.getElementById('renda-dia'),
  exemplo: document.getElementById('renda-exemplo'),
  erro: document.getElementById('erro-renda'),
  salvar: document.getElementById('renda-salvar'),
  avisoLimites: document.getElementById('renda-aviso-limites'),

  dialogo: document.getElementById('dialogo-entrada'),
  formEntrada: document.getElementById('form-entrada'),
  entradaDescricao: document.getElementById('entrada-descricao'),
  entradaValor: document.getElementById('entrada-valor'),
  entradaData: document.getElementById('entrada-data'),
  entradaErro: document.getElementById('erro-entrada'),
  entradaSalvar: document.getElementById('entrada-salvar'),

  caixaExtras: document.getElementById('saldo-extras'),
  listaExtras: document.getElementById('lista-extras'),
};

function iniciarRenda() {
  rendaEl.form.addEventListener('submit', aoSalvarRenda);
  rendaEl.dia.addEventListener('input', mostrarExemploDoPeriodo);
  document.querySelectorAll('.acao-recebi').forEach((b) => b.addEventListener('click', abrirDialogoEntrada));
  rendaEl.formEntrada.addEventListener('submit', aoSalvarEntrada);
  rendaEl.listaExtras.addEventListener('click', aoExcluirExtra);
}

// ---------- Configurações ----------
function desenharRendaConfig() {
  // Não sobrescreve enquanto a pessoa está digitando no formulário
  if (!rendaEl.form.contains(document.activeElement)) {
    const c = estado.config;
    rendaEl.fixa.value = c.renda_fixa ? centavosParaTexto(c.renda_fixa) : '';
    rendaEl.dia.value = c.dia_pagamento;
    mostrarExemploDoPeriodo();
  }
  desenharAvisoDeLimites();
}

/** "Com pagamento no dia 30, novembro vai de 30/10 a 29/11." */
function mostrarExemploDoPeriodo() {
  const dia = Number(rendaEl.dia.value);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    rendaEl.exemplo.textContent = 'Escolha um dia de 1 a 31.';
    return;
  }
  // Calcula o exemplo com o dia digitado e depois volta ao dia salvo
  const salvo = diaPagamento;
  definirDiaPagamento(dia);
  const chave = periodo(hojeISO());
  const texto = `Com pagamento no dia ${dia}, o mês de ${nomeDoMes(chave).split(' de ')[0]} vai de ${textoDoIntervalo(chave)}.`;
  definirDiaPagamento(salvo);
  rendaEl.exemplo.textContent = texto;
}

/** Compara a soma dos limites das categorias com a renda fixa. */
function desenharAvisoDeLimites() {
  const renda = estado.config.renda_fixa;
  const limites = estado.categorias.reduce((t, c) => t + (c.limite_mensal || 0), 0);
  const aviso = rendaEl.avisoLimites;
  if (!renda || !limites) {
    aviso.textContent = '';
  } else if (limites > renda) {
    aviso.className = 'mensagem alerta';
    aviso.textContent = `⚠️ A soma dos limites das categorias (${formatarCentavos(limites)}) passa da sua renda fixa (${formatarCentavos(renda)}).`;
  } else {
    aviso.className = 'mensagem info';
    aviso.textContent = `Dos ${formatarCentavos(renda)} da renda fixa, ${formatarCentavos(renda - limites)} ainda não estão em nenhum limite de categoria.`;
  }
}

async function aoSalvarRenda(evento) {
  evento.preventDefault();
  const erro = (texto, campo) => { rendaEl.erro.textContent = texto; if (campo) campo.focus(); };
  const textoRenda = rendaEl.fixa.value.trim();
  const renda = textoRenda === '' ? null : textoParaCentavos(textoRenda);
  const dia = Number(rendaEl.dia.value);

  if (textoRenda !== '' && renda === null) return erro('Renda inválida. Ex.: 2500,00 (ou deixe vazio).', rendaEl.fixa);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return erro('O dia do pagamento vai de 1 a 31.', rendaEl.dia);

  rendaEl.salvar.disabled = true;
  rendaEl.erro.textContent = '';
  try {
    const mudouDia = dia !== estado.config.dia_pagamento;
    await salvarConfiguracoes({ renda_fixa: renda, dia_pagamento: dia });
    rendaEl.salvar.focus(); // tira o foco dos campos para a tela poder atualizar
    if (mudouDia) ajustarFiltrosAoCarregar = true; // filtros vão para o período novo
    await carregarDados();
    mostrarAviso(mudouDia
      ? `Renda salva. Seu mês agora vai de ${textoDoIntervalo(periodo(hojeISO()))}.`
      : 'Renda salva.', 'sucesso');
  } catch (e) {
    erro(textoDoErro(e));
  } finally {
    rendaEl.salvar.disabled = false;
  }
}

// ---------- Recebi um extra ----------
function abrirDialogoEntrada() {
  rendaEl.formEntrada.reset();
  rendaEl.entradaData.value = hojeISO();
  rendaEl.entradaErro.textContent = '';
  rendaEl.dialogo.showModal();
}

async function aoSalvarEntrada(evento) {
  evento.preventDefault();
  const erro = (texto, campo) => { rendaEl.entradaErro.textContent = texto; campo.focus(); };
  const descricao = rendaEl.entradaDescricao.value.trim();
  const valor = textoParaCentavos(rendaEl.entradaValor.value);
  const data = rendaEl.entradaData.value;

  if (!descricao) return erro('Diga de onde veio (ex.: Hora extra).', rendaEl.entradaDescricao);
  if (valor === null) return erro('Digite um valor válido, ex.: 350,00', rendaEl.entradaValor);
  if (!data) return erro('Escolha a data.', rendaEl.entradaData);

  rendaEl.entradaSalvar.disabled = true;
  try {
    await salvarEntrada({ descricao, valor, data });
    rendaEl.dialogo.close();
    await carregarDados();
    mostrarAviso(`Extra de ${formatarCentavos(valor)} registrado.`, 'sucesso');
  } catch (e) {
    rendaEl.entradaErro.textContent = textoDoErro(e);
  } finally {
    rendaEl.entradaSalvar.disabled = false;
  }
}

/** Lista de extras do período (dentro do cartão "Ainda pode gastar"). */
function desenharExtras(chave) {
  const extras = estado.entradas.filter((e) => periodo(e.data) === chave);
  const aberto = rendaEl.caixaExtras.open;
  rendaEl.caixaExtras.hidden = extras.length === 0;
  rendaEl.caixaExtras.open = aberto;
  rendaEl.caixaExtras.querySelector('summary').textContent = `Extras do período (${extras.length})`;
  rendaEl.listaExtras.replaceChildren();
  extras.forEach((e) => {
    const li = document.createElement('li');
    const texto = document.createElement('span');
    texto.textContent = `${formatarData(e.data)} · ${e.descricao} · ${formatarCentavos(e.valor)}`;
    const excluir = document.createElement('button');
    excluir.type = 'button';
    excluir.className = 'link link-perigo';
    excluir.dataset.entrada = e.id;
    excluir.textContent = 'Excluir';
    li.append(texto, excluir);
    rendaEl.listaExtras.append(li);
  });
}

async function aoExcluirExtra(evento) {
  const botao = evento.target.closest('[data-entrada]');
  if (!botao) return;
  const entrada = estado.entradas.find((e) => e.id === botao.dataset.entrada);
  if (!entrada || !confirm(`Excluir o extra "${entrada.descricao}" (${formatarCentavos(entrada.valor)})?`)) return;
  botao.disabled = true;
  try {
    await excluirEntrada(entrada.id);
    await carregarDados();
  } catch (e) {
    botao.disabled = false;
    mostrarAviso(textoDoErro(e));
  }
}
