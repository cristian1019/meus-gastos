/* =========================================================
   metas.js — tela de Gastos Programados (completa).

   - Criar e editar meta (janela), com categoria e recorrência
   - "Guardei": registra um depósito
   - Histórico de depósitos, com "Desfazer"
   - "Paguei": vira um gasto de verdade (função do banco, numa
     transação) e, se a meta repete, a próxima é criada sozinha
   ========================================================= */

const metasEl = {
  lista: document.getElementById('lista-metas'),
  vazia: document.getElementById('metas-vazia'),
  totalMes: document.getElementById('total-guardar-mes'),
  molde: document.getElementById('molde-meta'),
  botaoNova: document.getElementById('botao-nova-meta'),

  // janela criar/editar
  dialogo: document.getElementById('dialogo-meta'),
  form: document.getElementById('form-meta'),
  titulo: document.getElementById('dialogo-meta-titulo'),
  descricao: document.getElementById('meta-descricao'),
  valor: document.getElementById('meta-valor'),
  vencimento: document.getElementById('meta-vencimento'),
  categoria: document.getElementById('meta-categoria'),
  recorrencia: document.getElementById('meta-recorrencia'),
  incluirMes: document.getElementById('meta-incluir-mes'),
  erro: document.getElementById('erro-meta'),
  salvar: document.getElementById('meta-salvar'),

  // janela "Paguei"
  dialogoPagar: document.getElementById('dialogo-pagar'),
  formPagar: document.getElementById('form-pagar'),
  pagarInfo: document.getElementById('pagar-info'),
  pagarValor: document.getElementById('pagar-valor'),
  pagarData: document.getElementById('pagar-data'),
  pagarCategoria: document.getElementById('pagar-categoria'),
  pagarForma: document.getElementById('pagar-forma'),
  pagarProxima: document.getElementById('pagar-proxima'),
  pagarErro: document.getElementById('erro-pagar'),
  pagarSalvar: document.getElementById('pagar-salvar'),
};

const NOMES_RECORRENCIA = { mensal: 'Todo mês', anual: 'Todo ano' };

let metaEmEdicao = null; // null = criando
let metaPagando = null;

function iniciarMetas() {
  metasEl.botaoNova.addEventListener('click', () => abrirDialogoMeta(null));
  metasEl.form.addEventListener('submit', aoSalvarMeta);
  metasEl.formPagar.addEventListener('submit', aoConfirmarPagamento);
  metasEl.lista.addEventListener('click', aoClicarNaMeta);
}

/** Soma do que falta guardar este mês em todas as metas (Início usa). */
function totalGuardarEsteMes() {
  return estado.programados.reduce((t, meta) => t + calcularMeta(meta).faltaEsteMes, 0);
}

// ---------- Criar / editar ----------
function abrirDialogoMeta(meta) {
  metaEmEdicao = meta;
  metasEl.titulo.textContent = meta ? 'Editar meta' : 'Nova meta';
  metasEl.salvar.textContent = meta ? 'Salvar' : 'Criar meta';
  metasEl.descricao.value = meta ? meta.descricao : '';
  metasEl.valor.value = meta ? centavosParaTexto(meta.valor_total) : '';
  metasEl.vencimento.value = meta ? meta.data_vencimento : '';
  metasEl.categoria.value = meta && meta.categoria_id ? meta.categoria_id : '';
  metasEl.recorrencia.value = meta ? meta.recorrencia : 'nenhuma';
  metasEl.incluirMes.checked = meta ? meta.incluir_mes_vencimento : false;
  metasEl.erro.textContent = '';
  metasEl.dialogo.showModal();
}

async function aoSalvarMeta(evento) {
  evento.preventDefault();
  const descricao = metasEl.descricao.value.trim();
  const valorTotal = textoParaCentavos(metasEl.valor.value);
  const vencimento = metasEl.vencimento.value;
  const erro = (texto, campo) => { metasEl.erro.textContent = texto; campo.focus(); };

  if (!descricao) return erro('Diga o que vai pagar.', metasEl.descricao);
  if (valorTotal === null) return erro('Digite um valor válido, ex.: 1500,00', metasEl.valor);
  if (!vencimento) return erro('Escolha a data de vencimento.', metasEl.vencimento);
  // Ao CRIAR, vencimento no passado não faz sentido. Ao EDITAR, uma
  // meta atrasada pode continuar com a data original.
  if (!metaEmEdicao && vencimento < hojeISO()) return erro('A data de vencimento já passou.', metasEl.vencimento);

  const meta = {
    descricao,
    valor_total: valorTotal,
    data_vencimento: vencimento,
    incluir_mes_vencimento: metasEl.incluirMes.checked,
    recorrencia: metasEl.recorrencia.value,
    categoria_id: metasEl.categoria.value || null,
  };
  if (metaEmEdicao) meta.id = metaEmEdicao.id;

  metasEl.salvar.disabled = true;
  metasEl.erro.textContent = '';
  try {
    await salvarProgramado(meta);
    metasEl.dialogo.close();
    await carregarDados();
    mostrarAviso(`Meta "${descricao}" ${metaEmEdicao ? 'atualizada' : 'criada'}.`, 'sucesso');
  } catch (e) {
    metasEl.erro.textContent = textoDoErro(e);
  } finally {
    metasEl.salvar.disabled = false;
  }
}

// ---------- Paguei ----------
function abrirDialogoPagar(meta) {
  metaPagando = meta;
  const calc = calcularMeta(meta);
  metasEl.pagarInfo.textContent =
    `${meta.descricao}: ${formatarCentavos(meta.valor_total)}. Você já guardou ${formatarCentavos(calc.guardado)}.`;
  metasEl.pagarValor.value = centavosParaTexto(meta.valor_total);
  metasEl.pagarData.value = hojeISO();
  // Categoria da meta; se não tiver, sugere "Contas" (ou a primeira)
  const sugerida = meta.categoria_id
    || (estado.categorias.find((c) => c.nome === 'Contas') || estado.categorias[0] || {}).id;
  if (sugerida) metasEl.pagarCategoria.value = sugerida;
  metasEl.pagarForma.value = 'pix';
  metasEl.pagarProxima.textContent = meta.recorrencia !== 'nenhuma'
    ? `🔁 A próxima (${formatarData(proximoVencimento(meta))}) será criada automaticamente.`
    : '';
  metasEl.pagarErro.textContent = '';
  metasEl.dialogoPagar.showModal();
}

/* Só para mostrar na janela. Quem cria a próxima meta de verdade é a
   função do banco, que usa a mesma regra (31/01 + 1 mês = 28/02). */
function proximoVencimento(meta) {
  const [ano, mes, dia] = meta.data_vencimento.split('-').map(Number);
  const meses = meta.recorrencia === 'anual' ? 12 : 1;
  const alvo = somarMeses(`${ano}-${String(mes).padStart(2, '0')}`, meses);
  const [anoA, mesA] = alvo.split('-').map(Number);
  const ultimoDia = new Date(anoA, mesA, 0).getDate(); // dia 0 do mês seguinte = último dia deste
  return `${alvo}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
}

async function aoConfirmarPagamento(evento) {
  evento.preventDefault();
  const meta = metaPagando;
  const valor = textoParaCentavos(metasEl.pagarValor.value);
  const erro = (texto, campo) => { metasEl.pagarErro.textContent = texto; if (campo) campo.focus(); };

  if (valor === null) return erro('Digite o valor pago, ex.: 1500,00', metasEl.pagarValor);
  if (!metasEl.pagarData.value) return erro('Escolha a data do pagamento.', metasEl.pagarData);
  if (!metasEl.pagarCategoria.value) return erro('Escolha a categoria do gasto.', metasEl.pagarCategoria);

  metasEl.pagarSalvar.disabled = true;
  try {
    await pagarProgramado(meta.id, {
      valor,
      data: metasEl.pagarData.value,
      forma_pagamento: metasEl.pagarForma.value,
      categoria_id: metasEl.pagarCategoria.value,
    });
    metasEl.dialogoPagar.close();
    await carregarDados();
    const extra = meta.recorrencia !== 'nenhuma' ? ' A próxima já está nas metas.' : '';
    mostrarAviso(`✅ "${meta.descricao}" paga e lançada nos gastos.${extra}`, 'sucesso');
  } catch (e) {
    erro(textoDoErro(e));
  } finally {
    metasEl.pagarSalvar.disabled = false;
  }
}

// ---------- Cliques nos cartões ----------
async function aoClicarNaMeta(evento) {
  const botao = evento.target.closest('button');
  if (!botao) return;
  const meta = estado.programados.find((m) => m.id === botao.closest('.meta').dataset.id);
  if (!meta) return;

  if (botao.classList.contains('acao-guardei')) return aoGuardar(meta, botao);
  if (botao.classList.contains('acao-paguei')) return abrirDialogoPagar(meta);
  if (botao.classList.contains('acao-editar-meta')) return abrirDialogoMeta(meta);
  if (botao.classList.contains('acao-desfazer')) return aoDesfazerDeposito(meta, botao);

  if (botao.classList.contains('acao-excluir-meta')) {
    if (!confirm(`Excluir a meta "${meta.descricao}" e todos os depósitos dela?`)) return;
    try {
      await excluirProgramado(meta.id);
      await carregarDados();
    } catch (e) {
      mostrarAviso(textoDoErro(e));
    }
  }
}

async function aoGuardar(meta, botao) {
  const calc = calcularMeta(meta);
  // Sugere o que falta no mês (ou o restante, se o mês já foi)
  const sugestao = calc.faltaEsteMes || calc.restante;
  const resposta = prompt(`Quanto você guardou para "${meta.descricao}"?`, centavosParaTexto(sugestao));
  if (resposta === null) return; // tocou em Cancelar

  const valor = textoParaCentavos(resposta);
  if (valor === null) return mostrarAviso('Valor inválido. Use o formato 150,00.');

  botao.disabled = true;
  try {
    await registrarDeposito(meta.id, valor);
    await carregarDados();
    mostrarAviso(`Guardado ${formatarCentavos(valor)} em "${meta.descricao}".`, 'sucesso');
  } catch (e) {
    botao.disabled = false;
    mostrarAviso(textoDoErro(e));
  }
}

async function aoDesfazerDeposito(meta, botao) {
  const deposito = meta.depositos_meta.find((d) => d.id === botao.dataset.deposito);
  if (!deposito) return;
  if (!confirm(`Desfazer o depósito de ${formatarCentavos(deposito.valor)} (${formatarData(deposito.data)})?`)) return;
  botao.disabled = true;
  try {
    await excluirDeposito(deposito.id);
    await carregarDados();
    mostrarAviso('Depósito desfeito.', 'sucesso');
  } catch (e) {
    botao.disabled = false;
    mostrarAviso(textoDoErro(e));
  }
}

// ---------- Desenhar ----------
/* O <details> do histórico fecha quando a lista é redesenhada.
   Guardamos quais estavam abertos para reabrir depois. */
function desenharMetas() {
  const abertos = new Set(
    [...metasEl.lista.querySelectorAll('.meta-depositos[open]')].map((d) => d.closest('.meta').dataset.id)
  );
  const metas = estado.programados;
  metasEl.lista.replaceChildren();
  metasEl.vazia.hidden = metas.length > 0;

  metas.forEach((meta) => {
    const calc = calcularMeta(meta);
    const item = metasEl.molde.content.firstElementChild.cloneNode(true);
    item.dataset.id = meta.id;

    item.querySelector('.meta-descricao').textContent = meta.descricao;
    item.querySelector('.meta-vencimento').textContent = 'vence ' + formatarData(meta.data_vencimento);

    // Etiquetas: categoria e recorrência
    const etiquetas = [];
    if (meta.categoria_id) {
      const cat = buscarCategoria(meta.categoria_id);
      etiquetas.push(`${cat.icone} ${cat.nome}`);
    }
    if (NOMES_RECORRENCIA[meta.recorrencia]) etiquetas.push('🔁 ' + NOMES_RECORRENCIA[meta.recorrencia]);
    const elEtiquetas = item.querySelector('.meta-etiquetas');
    elEtiquetas.textContent = etiquetas.join('  ·  ');
    elEtiquetas.hidden = etiquetas.length === 0;

    const porcentagem = Math.round(calc.progresso * 100);
    const barra = item.querySelector('.barra');
    barra.setAttribute('aria-valuenow', porcentagem);
    barra.querySelector('.barra-preenchida').style.width = porcentagem + '%';

    item.querySelector('.meta-valores').textContent =
      `${formatarCentavos(calc.guardado)} de ${formatarCentavos(meta.valor_total)} (${porcentagem}%)`;
    item.querySelector('.meta-plano').textContent = textoDoPlano(calc);

    if (calc.atrasada) {
      const alerta = item.querySelector('.meta-alerta');
      alerta.hidden = false;
      alerta.textContent = `⚠️ Venceu e ainda faltam ${formatarCentavos(calc.restante)}.`;
      item.classList.add('atrasada');
    }
    if (calc.concluida) {
      item.classList.add('concluida');
      item.querySelector('.acao-guardei').hidden = true;
      // Com a meta completa, "Paguei" vira o botão principal
      item.querySelector('.acao-paguei').className = 'acao-paguei botao-principal';
    }

    desenharDepositos(item, meta, abertos.has(meta.id));
    metasEl.lista.append(item);
  });

  metasEl.totalMes.textContent = formatarCentavos(totalGuardarEsteMes());
}

function desenharDepositos(item, meta, aberto) {
  const caixa = item.querySelector('.meta-depositos');
  const depositos = meta.depositos_meta;
  if (depositos.length === 0) {
    caixa.hidden = true;
    return;
  }
  caixa.open = aberto;
  caixa.querySelector('summary').textContent = `Depósitos (${depositos.length})`;
  const ul = caixa.querySelector('.lista-depositos');
  depositos.forEach((d) => {
    const li = document.createElement('li');
    const texto = document.createElement('span');
    texto.textContent = `${formatarData(d.data)} · ${formatarCentavos(d.valor)}`;
    const desfazer = document.createElement('button');
    desfazer.type = 'button';
    desfazer.className = 'link link-perigo acao-desfazer';
    desfazer.dataset.deposito = d.id;
    desfazer.textContent = 'Desfazer';
    li.append(texto, desfazer);
    ul.append(li);
  });
}

/** A frase de orientação de cada meta. */
function textoDoPlano(calc) {
  if (calc.concluida) return '✅ Meta completa! Quando pagar, toque em "Paguei".';
  if (calc.atrasada) return '';
  if (calc.meses <= 1) {
    return calc.faltaEsteMes > 0
      ? `Guarde ${formatarCentavos(calc.faltaEsteMes)} ainda este mês.`
      : '✅ Parte deste mês já guardada.';
  }
  const plano = `${formatarCentavos(calc.valorMensal)} por mês durante ${calc.meses} meses.`;
  return calc.faltaEsteMes > 0
    ? `${plano} Este mês faltam ${formatarCentavos(calc.faltaEsteMes)}.`
    : `${plano} ✅ Este mês já está guardado.`;
}
