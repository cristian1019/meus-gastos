/* =========================================================
   metas.js — tela de Gastos Programados (versão básica).

   O que já tem: criar meta, ver quanto guardar por mês, botão
   "Guardei", barra de progresso, aviso de atraso e excluir.
   Na Etapa 4 entram: recorrência, botão "Paguei" (que vira um
   gasto de verdade) e o resumo na tela Início.
   ========================================================= */

const metasEl = {
  form: document.getElementById('form-meta'),
  caixa: document.getElementById('caixa-nova-meta'),
  descricao: document.getElementById('meta-descricao'),
  valor: document.getElementById('meta-valor'),
  vencimento: document.getElementById('meta-vencimento'),
  incluirMes: document.getElementById('meta-incluir-mes'),
  erro: document.getElementById('erro-meta'),
  lista: document.getElementById('lista-metas'),
  vazia: document.getElementById('metas-vazia'),
  totalMes: document.getElementById('total-guardar-mes'),
  molde: document.getElementById('molde-meta'),
};

function iniciarMetas() {
  metasEl.form.addEventListener('submit', aoCriarMeta);
  metasEl.lista.addEventListener('click', aoClicarNaMeta);
}

async function aoCriarMeta(evento) {
  evento.preventDefault();
  const descricao = metasEl.descricao.value.trim();
  const valorTotal = textoParaCentavos(metasEl.valor.value);
  const vencimento = metasEl.vencimento.value;
  const erro = (texto, campo) => { metasEl.erro.textContent = texto; campo.focus(); };

  if (!descricao) return erro('Diga o que vai pagar.', metasEl.descricao);
  if (valorTotal === null) return erro('Digite um valor válido, ex.: 1500,00', metasEl.valor);
  if (!vencimento) return erro('Escolha a data de vencimento.', metasEl.vencimento);
  if (vencimento < hojeISO()) return erro('A data de vencimento já passou.', metasEl.vencimento);

  const botao = metasEl.form.querySelector('button[type="submit"]');
  botao.disabled = true;
  metasEl.erro.textContent = '';
  try {
    await criarProgramado({
      descricao,
      valor_total: valorTotal,
      data_vencimento: vencimento,
      incluir_mes_vencimento: metasEl.incluirMes.checked,
    });
    metasEl.form.reset();
    metasEl.caixa.open = false;
    await carregarDados();
    mostrarAviso(`Meta "${descricao}" criada.`, 'sucesso');
  } catch (e) {
    metasEl.erro.textContent = textoDoErro(e);
  } finally {
    botao.disabled = false;
  }
}

async function aoClicarNaMeta(evento) {
  const botao = evento.target.closest('button');
  if (!botao) return;
  const meta = estado.programados.find((m) => m.id === botao.closest('.meta').dataset.id);
  if (!meta) return;

  if (botao.classList.contains('acao-guardei')) {
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

function desenharMetas() {
  const metas = estado.programados;
  metasEl.lista.replaceChildren();
  metasEl.vazia.hidden = metas.length > 0;

  let totalGuardarMes = 0;

  metas.forEach((meta) => {
    const calc = calcularMeta(meta);
    totalGuardarMes += calc.faltaEsteMes;

    const item = metasEl.molde.content.firstElementChild.cloneNode(true);
    item.dataset.id = meta.id;

    item.querySelector('.meta-descricao').textContent = meta.descricao;
    item.querySelector('.meta-vencimento').textContent = 'vence ' + formatarData(meta.data_vencimento);

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
    }

    metasEl.lista.append(item);
  });

  metasEl.totalMes.textContent = formatarCentavos(totalGuardarMes);
}

/** A frase de orientação de cada meta. */
function textoDoPlano(calc) {
  if (calc.concluida) return '✅ Meta completa! Dinheiro garantido.';
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
