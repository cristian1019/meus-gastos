/* =========================================================
   exportar.js — gera uma planilha CSV com gastos e extras.

   O arquivo é montado no próprio aparelho, sem servidor.
   Cuidados para abrir certinho no Excel em português:
   - separador ";" (o Excel brasileiro usa a vírgula nos centavos);
   - valores como 1234,56 (sem ponto de milhar: vira número de verdade);
   - "﻿" no início (BOM): avisa que o texto é UTF-8, senão
     "Alimentação" aparece como "AlimentaÃ§Ã£o";
   - proteção contra "injeção de fórmula": um texto que começa com
     = + - @ seria executado como fórmula pelo Excel. Colocamos um '
     na frente para ele virar texto comum.
   ========================================================= */

const expEl = {
  mes: document.getElementById('exportar-mes'),
  intervalo: document.getElementById('exportar-intervalo'),
  botaoMes: document.getElementById('botao-exportar-mes'),
  botaoTudo: document.getElementById('botao-exportar-tudo'),
  status: document.getElementById('exportar-status'),
};

function iniciarExportar() {
  expEl.mes.value = periodo(hojeISO());
  mostrarIntervaloExportar();
  expEl.mes.addEventListener('change', mostrarIntervaloExportar);
  expEl.botaoMes.addEventListener('click', () => exportar(expEl.mes.value));
  expEl.botaoTudo.addEventListener('click', () => exportar(null));
}

function mostrarIntervaloExportar() {
  expEl.intervalo.textContent = expEl.mes.value ? `Período: ${textoDoIntervalo(expEl.mes.value)}` : '';
}

/** Um valor de célula pronto para o CSV. */
function celulaCSV(valor) {
  let texto = String(valor ?? '');
  if (/^[=+\-@\t\r]/.test(texto)) texto = "'" + texto; // injeção de fórmula
  // Com ; aspas ou quebra de linha, a célula vai entre aspas (e aspas viram "")
  if (/[;"\r\n]/.test(texto)) texto = '"' + texto.replace(/"/g, '""') + '"';
  return texto;
}

/** Centavos → "1234,56" (sem "R$" e sem ponto de milhar). */
function valorCSV(centavos) {
  return (centavos / 100).toFixed(2).replace('.', ',');
}

function montarCSV(gastos, entradas) {
  const linhas = [
    ...gastos.map((g) => ({
      data: g.data,
      colunas: [
        formatarData(g.data), 'Gasto', g.descricao, buscarCategoria(g.categoria_id).nome,
        valorCSV(g.valor), NOMES_PAGAMENTO[g.forma_pagamento] || g.forma_pagamento,
        g.competencia ? 'Sim' : '',
      ],
    })),
    ...entradas.map((e) => ({
      data: e.data,
      colunas: [formatarData(e.data), 'Entrada extra', e.descricao, '', valorCSV(e.valor), '', ''],
    })),
  ].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)); // mais antigo primeiro

  const cabecalho = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor (R$)', 'Pagamento', 'Conta fixa'];
  const texto = [cabecalho, ...linhas.map((l) => l.colunas)]
    .map((colunas) => colunas.map(celulaCSV).join(';'))
    .join('\r\n');
  return '﻿' + texto;
}

async function exportar(chave) {
  const gastos = chave ? estado.gastos.filter((g) => periodo(g.data) === chave) : estado.gastos;
  const entradas = chave ? estado.entradas.filter((e) => periodo(e.data) === chave) : estado.entradas;
  if (gastos.length + entradas.length === 0) {
    expEl.status.className = 'mensagem erro';
    expEl.status.textContent = 'Nada para exportar nesse período.';
    return;
  }

  const nome = chave ? `meus-gastos-${chave}.csv` : `meus-gastos-tudo-${hojeISO()}.csv`;
  const arquivo = new File([montarCSV(gastos, entradas)], nome, { type: 'text/csv;charset=utf-8' });

  try {
    // iPhone: abre a tela de compartilhar (salvar em Arquivos, WhatsApp, e-mail…)
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: nome });
    } else {
      // Computador: download comum
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    expEl.status.className = 'mensagem sucesso';
    expEl.status.textContent = `${gastos.length} gasto(s) e ${entradas.length} extra(s) exportados.`;
  } catch (e) {
    // Fechar a tela de compartilhar sem escolher nada não é erro
    if (e.name === 'AbortError') return;
    expEl.status.className = 'mensagem erro';
    expEl.status.textContent = 'Não consegui gerar o arquivo. Tente de novo.';
    console.error(e);
  }
}
