/* =========================================================
   recorrentes.js — contas fixas (internet, streaming, luz…).

   Duas formas, escolhidas por conta:
   - automática (valor fixo): o app lança sozinho quando o dia chega
     e você abre o app;
   - com confirmação (valor muda): aparece em "Contas fixas do
     período", na tela Início, e você confirma o valor.

   Quem garante que nada é lançado duas vezes é o BANCO: a regra
   UNIQUE (recorrente_id, competencia). O app só tenta; se outro
   aparelho já lançou, o banco ignora.

   Limitação: um app web não roda com o celular bloqueado. A conta
   automática entra na próxima vez que você ABRIR o app.
   ========================================================= */

const recEl = {
  lista: document.getElementById('lista-config-recorrentes'),
  botaoNova: document.getElementById('botao-nova-recorrente'),
  dialogo: document.getElementById('dialogo-recorrente'),
  form: document.getElementById('form-recorrente'),
  titulo: document.getElementById('dialogo-recorrente-titulo'),
  descricao: document.getElementById('recorrente-descricao'),
  valor: document.getElementById('recorrente-valor'),
  dia: document.getElementById('recorrente-dia'),
  categoria: document.getElementById('recorrente-categoria'),
  forma: document.getElementById('recorrente-forma'),
  automatico: document.getElementById('recorrente-automatico'),
  ativo: document.getElementById('recorrente-ativo'),
  ativoCaixa: document.getElementById('recorrente-ativo-caixa'),
  erro: document.getElementById('erro-recorrente'),
  salvar: document.getElementById('recorrente-salvar'),
  excluir: document.getElementById('recorrente-excluir'),

  pendentes: document.getElementById('lista-contas-pendentes'),
  caixaPendentes: document.getElementById('inicio-contas'),
  dialogoLancar: document.getElementById('dialogo-lancar'),
  formLancar: document.getElementById('form-lancar'),
  lancarInfo: document.getElementById('lancar-info'),
  lancarValor: document.getElementById('lancar-valor'),
  lancarData: document.getElementById('lancar-data'),
  lancarErro: document.getElementById('erro-lancar'),
  lancarSalvar: document.getElementById('lancar-salvar'),
};

let recorrenteEmEdicao = null;
let ocorrenciaLancando = null; // { rec, data, competencia }
let lancandoAutomaticas = false;

function iniciarRecorrentes() {
  recEl.botaoNova.addEventListener('click', () => abrirDialogoRecorrente(null));
  recEl.lista.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-recorrente]');
    if (!botao) return;
    const rec = estado.recorrentes.find((r) => r.id === botao.dataset.recorrente);
    if (rec) abrirDialogoRecorrente(rec);
  });
  recEl.form.addEventListener('submit', aoSalvarRecorrente);
  recEl.excluir.addEventListener('click', aoExcluirRecorrente);
  recEl.pendentes.addEventListener('click', aoClicarPendente);
  recEl.formLancar.addEventListener('submit', aoConfirmarLancamento);
}

// ---------- Cálculos ----------

/** Categoria para lançar: a da conta, ou "Outros" se ela foi apagada. */
function categoriaDaConta(rec) {
  if (rec.categoria_id && estado.categorias.some((c) => c.id === rec.categoria_id)) return rec.categoria_id;
  return (estado.categorias.find((c) => c.nome === 'Outros') || estado.categorias[0] || {}).id;
}

/** Contas já lançadas, no formato "idDaConta|AAAA-MM" (para achar rápido). */
function contasJaLancadas() {
  return new Set(estado.gastos.filter((g) => g.recorrente_id).map((g) => `${g.recorrente_id}|${g.competencia}`));
}

/**
 * Ocorrências de contas ativas num intervalo que ainda NÃO foram
 * lançadas. Datas antes de a conta ser cadastrada não contam (o app
 * supõe que essas você já pagou antes de usar o app).
 */
function ocorrenciasPendentes(inicio, fim, filtro = () => true) {
  const lancadas = contasJaLancadas();
  const lista = [];
  estado.recorrentes.filter((r) => r.ativo && filtro(r)).forEach((rec) => {
    const desde = dataLocal(rec.criado_em);
    ocorrenciasNoIntervalo(rec, inicio, fim).forEach((o) => {
      if (o.data >= desde && !lancadas.has(`${rec.id}|${o.competencia}`)) lista.push({ rec, ...o });
    });
  });
  return lista.sort((a, b) => (a.data < b.data ? -1 : 1));
}

/** Contas do período que ainda não entraram (para o Início e o saldo). */
function contasPendentesDoPeriodo(chave) {
  const { inicio, fim } = intervaloDoPeriodo(chave);
  return ocorrenciasPendentes(inicio, fim);
}

/**
 * Lança as automáticas que já venceram. Olha do começo do período
 * ANTERIOR até hoje: se você ficou um tempo sem abrir o app, as
 * contas desse tempo também entram (com a data certa de cada uma).
 */
async function lancarContasAutomaticas() {
  if (lancandoAutomaticas) return [];
  const hoje = hojeISO();
  const inicio = intervaloDoPeriodo(somarMeses(periodo(hoje), -1)).inicio;
  const devidas = ocorrenciasPendentes(inicio, hoje, (r) => r.automatico);
  if (devidas.length === 0) return [];

  lancandoAutomaticas = true;
  try {
    return await lancarContasFixas(devidas.map(({ rec, data, competencia }) => ({
      valor: rec.valor,
      descricao: rec.descricao,
      categoria_id: categoriaDaConta(rec),
      data,
      forma_pagamento: rec.forma_pagamento,
      recorrente_id: rec.id,
      competencia,
    })));
  } finally {
    lancandoAutomaticas = false;
  }
}

// ---------- Início: "Contas fixas do período" ----------
function desenharContasPendentes(pendentes) {
  recEl.pendentes.replaceChildren();
  recEl.caixaPendentes.hidden = pendentes.length === 0;
  const hoje = hojeISO();

  pendentes.forEach((p) => {
    const cat = buscarCategoria(categoriaDaConta(p.rec));
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'conta-info';
    const nome = document.createElement('span');
    nome.className = 'conta-nome';
    nome.textContent = `${cat.icone} ${p.rec.descricao}`;
    const detalhe = document.createElement('span');
    detalhe.className = 'conta-detalhe';
    const atrasada = p.data < hoje;
    detalhe.textContent = `${formatarCentavos(p.rec.valor)} · ${atrasada ? 'venceu' : 'vence'} ${formatarData(p.data)}`;
    if (atrasada) li.dataset.nivel = 'atencao';
    info.append(nome, detalhe);
    li.append(info);

    if (p.rec.automatico && p.data > hoje) {
      const auto = document.createElement('span');
      auto.className = 'conta-auto';
      auto.textContent = 'entra sozinha';
      li.append(auto);
    } else {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'link';
      botao.textContent = 'Lançar';
      botao.dataset.rec = p.rec.id;
      botao.dataset.data = p.data;
      botao.dataset.competencia = p.competencia;
      li.append(botao);
    }
    recEl.pendentes.append(li);
  });
}

function aoClicarPendente(evento) {
  const botao = evento.target.closest('[data-rec]');
  if (!botao) return;
  const rec = estado.recorrentes.find((r) => r.id === botao.dataset.rec);
  if (!rec) return;
  ocorrenciaLancando = { rec, data: botao.dataset.data, competencia: botao.dataset.competencia };
  recEl.lancarInfo.textContent =
    `${rec.descricao}, conta de ${nomeDoMes(botao.dataset.competencia)}. Confira o valor desta vez.`;
  recEl.lancarValor.value = centavosParaTexto(rec.valor);
  // Data: a do vencimento; se ainda não chegou, hoje (pagou adiantado)
  recEl.lancarData.value = botao.dataset.data <= hojeISO() ? botao.dataset.data : hojeISO();
  recEl.lancarErro.textContent = '';
  recEl.dialogoLancar.showModal();
}

async function aoConfirmarLancamento(evento) {
  evento.preventDefault();
  const { rec, competencia } = ocorrenciaLancando;
  const valor = textoParaCentavos(recEl.lancarValor.value);
  if (valor === null) {
    recEl.lancarErro.textContent = 'Digite um valor válido, ex.: 127,40';
    return recEl.lancarValor.focus();
  }
  if (!recEl.lancarData.value) {
    recEl.lancarErro.textContent = 'Escolha a data.';
    return recEl.lancarData.focus();
  }

  recEl.lancarSalvar.disabled = true;
  try {
    const salvo = await salvarGasto({
      valor,
      descricao: rec.descricao,
      categoria_id: categoriaDaConta(rec),
      data: recEl.lancarData.value,
      forma_pagamento: rec.forma_pagamento,
      recorrente_id: rec.id,
      competencia,
    });
    recEl.dialogoLancar.close();
    await carregarDados();
    avisarSalvo(salvo);
  } catch (e) {
    recEl.lancarErro.textContent = textoDoErro(e);
  } finally {
    recEl.lancarSalvar.disabled = false;
  }
}

// ---------- Configurações: lista e janela ----------
function desenharRecorrentesConfig() {
  recEl.lista.replaceChildren();
  estado.recorrentes.forEach((rec) => {
    const cat = buscarCategoria(categoriaDaConta(rec));
    const li = document.createElement('li');
    li.className = 'item item-categoria' + (rec.ativo ? '' : ' pausada');
    const icone = document.createElement('span');
    icone.className = 'item-icone';
    icone.textContent = cat.icone;
    const info = document.createElement('div');
    info.className = 'item-info';
    const nome = document.createElement('span');
    nome.className = 'item-descricao';
    nome.textContent = rec.descricao;
    const det = document.createElement('span');
    det.className = 'item-detalhes';
    det.textContent = `${formatarCentavos(rec.valor)} · dia ${rec.dia_do_mes} · ` +
      (rec.ativo ? (rec.automatico ? 'lança sozinha' : 'pede confirmação') : 'pausada');
    info.append(nome, det);
    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'link';
    editar.dataset.recorrente = rec.id;
    editar.textContent = 'Editar';
    li.append(icone, info, editar);
    recEl.lista.append(li);
  });
}

function abrirDialogoRecorrente(rec) {
  recorrenteEmEdicao = rec;
  recEl.titulo.textContent = rec ? 'Editar conta fixa' : 'Nova conta fixa';
  recEl.descricao.value = rec ? rec.descricao : '';
  recEl.valor.value = rec ? centavosParaTexto(rec.valor) : '';
  recEl.dia.value = rec ? rec.dia_do_mes : '';
  recEl.categoria.value = rec ? categoriaDaConta(rec)
    : (estado.categorias.find((c) => c.nome === 'Contas') || estado.categorias[0] || {}).id;
  recEl.forma.value = rec ? rec.forma_pagamento : 'pix';
  recEl.automatico.checked = rec ? rec.automatico : true;
  recEl.ativo.checked = rec ? rec.ativo : true;
  recEl.ativoCaixa.hidden = !rec; // pausar só faz sentido numa conta que já existe
  recEl.excluir.hidden = !rec;
  recEl.erro.textContent = '';
  recEl.dialogo.showModal();
}

async function aoSalvarRecorrente(evento) {
  evento.preventDefault();
  const erro = (texto, campo) => { recEl.erro.textContent = texto; campo.focus(); };
  const descricao = recEl.descricao.value.trim();
  const valor = textoParaCentavos(recEl.valor.value);
  const dia = Number(recEl.dia.value);

  if (!descricao) return erro('Dê um nome à conta (ex.: Internet).', recEl.descricao);
  if (valor === null) return erro('Digite um valor válido. Se ele muda, use o valor de costume.', recEl.valor);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return erro('O dia vai de 1 a 31.', recEl.dia);

  const dados = {
    descricao,
    valor,
    dia_do_mes: dia,
    categoria_id: recEl.categoria.value || null,
    forma_pagamento: recEl.forma.value,
    automatico: recEl.automatico.checked,
    ativo: recorrenteEmEdicao ? recEl.ativo.checked : true,
  };
  if (recorrenteEmEdicao) dados.id = recorrenteEmEdicao.id;

  recEl.salvar.disabled = true;
  try {
    await salvarRecorrente(dados);
    recEl.dialogo.close();
    await carregarDados();
    mostrarAviso(`Conta fixa "${descricao}" salva.`, 'sucesso');
  } catch (e) {
    recEl.erro.textContent = textoDoErro(e);
  } finally {
    recEl.salvar.disabled = false;
  }
}

async function aoExcluirRecorrente() {
  const rec = recorrenteEmEdicao;
  if (!rec || !confirm(`Excluir a conta fixa "${rec.descricao}"?\n\nOs gastos que ela já lançou continuam na Lista.`)) return;
  recEl.excluir.disabled = true;
  try {
    await excluirRecorrente(rec.id);
    recEl.dialogo.close();
    await carregarDados();
    mostrarAviso(`Conta fixa "${rec.descricao}" excluída.`, 'sucesso');
  } catch (e) {
    recEl.erro.textContent = textoDoErro(e);
  } finally {
    recEl.excluir.disabled = false;
  }
}
