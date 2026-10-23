/* =========================================================
   inicio.js — tela Início: o resumo do período atual.

   Nada aqui busca dados: tudo é calculado a partir do "estado"
   pelas funções de utils.js (periodo, calcularSaldo,
   calcularOrcamento, calcularMeta).
   ========================================================= */

const inicioEl = {
  mes: document.getElementById('inicio-mes'),
  intervalo: document.getElementById('inicio-intervalo'),

  caixaSaldo: document.getElementById('inicio-saldo'),
  semRenda: document.getElementById('inicio-sem-renda'),
  livre: document.getElementById('saldo-livre'),
  barraSaldo: document.getElementById('saldo-barra'),
  contaSaldo: document.getElementById('saldo-conta'),

  caixaOrcamento: document.getElementById('inicio-orcamento'),
  semOrcamento: document.getElementById('inicio-sem-orcamento'),
  restante: document.getElementById('orcamento-restante'),
  barra: document.getElementById('orcamento-barra'),
  detalhe: document.getElementById('orcamento-detalhe'),
  total: document.getElementById('inicio-total'),
  guardar: document.getElementById('inicio-guardar'),
  caixaAlertas: document.getElementById('inicio-alertas'),
  alertas: document.getElementById('lista-alertas'),
  categorias: document.getElementById('inicio-categorias'),
  categoriasVazio: document.getElementById('inicio-categorias-vazio'),
  ultimos: document.getElementById('inicio-ultimos'),
  ultimosVazio: document.getElementById('inicio-ultimos-vazio'),
};

const QUANTIDADE_ULTIMOS = 5;

function desenharInicio() {
  const chave = periodo(hojeISO());
  const orc = calcularOrcamento(estado.gastos, estado.categorias, chave);
  const pendentes = contasPendentesDoPeriodo(chave);
  const guardar = totalGuardarEsteMes();

  inicioEl.mes.textContent = nomeDoMes(chave);
  inicioEl.intervalo.textContent = textoDoIntervalo(chave);
  inicioEl.total.textContent = formatarCentavos(orc.totalMes);
  inicioEl.guardar.textContent = formatarCentavos(guardar);

  desenharSaldo(chave, orc.totalMes, pendentes, guardar);
  desenharContasPendentes(pendentes);
  desenharOrcamento(orc);
  desenharAlertas(orc);
  desenharPorCategoria(orc);

  desenharGastos(inicioEl.ultimos, estado.gastos.slice(0, QUANTIDADE_ULTIMOS));
  inicioEl.ultimosVazio.hidden = estado.gastos.length > 0;
}

// ---------- "Ainda pode gastar" ----------
function desenharSaldo(chave, gastosDoPeriodo, pendentes, guardar) {
  const extras = somarValores(estado.entradas.filter((e) => periodo(e.data) === chave));
  const temRenda = Boolean(estado.config.renda_fixa) || extras > 0;
  inicioEl.caixaSaldo.hidden = !temRenda;
  inicioEl.semRenda.hidden = temRenda;
  desenharExtras(chave);
  if (!temRenda) return;

  const saldo = calcularSaldo({
    rendaFixa: estado.config.renda_fixa,
    extras,
    gastos: gastosDoPeriodo,
    contasACair: pendentes.reduce((t, p) => t + p.rec.valor, 0),
    guardarMetas: guardar,
  });

  inicioEl.caixaSaldo.dataset.nivel = nivelDoLimite(saldo.proporcao);
  inicioEl.livre.textContent = saldo.livre >= 0
    ? formatarCentavos(saldo.livre)
    : `Passou ${formatarCentavos(-saldo.livre)}`;

  const porcentagem = Math.min(100, Math.round(saldo.proporcao * 100));
  inicioEl.barraSaldo.setAttribute('aria-valuenow', porcentagem);
  inicioEl.barraSaldo.querySelector('.barra-preenchida').style.width = porcentagem + '%';

  // A conta, linha por linha, para ficar claro de onde veio o número
  const linhas = [['Renda fixa', saldo.rendaFixa, '']];
  if (saldo.extras) linhas.push(['Extras', saldo.extras, '+']);
  linhas.push(['Gastos do período', saldo.gastos, '−']);
  if (saldo.contasACair) linhas.push(['Contas fixas a cair', saldo.contasACair, '−']);
  if (saldo.guardarMetas) linhas.push(['Guardar para metas', saldo.guardarMetas, '−']);

  inicioEl.contaSaldo.replaceChildren();
  linhas.forEach(([rotulo, valor, sinal]) => {
    const li = document.createElement('li');
    const nome = document.createElement('span');
    nome.textContent = rotulo;
    const numero = document.createElement('span');
    numero.textContent = `${sinal} ${formatarCentavos(valor)}`.trim();
    li.append(nome, numero);
    inicioEl.contaSaldo.append(li);
  });
}

// ---------- Cartão dos limites das categorias ----------
function desenharOrcamento(orc) {
  const temOrcamento = orc.orcamento > 0;
  inicioEl.caixaOrcamento.hidden = !temOrcamento;
  inicioEl.semOrcamento.hidden = temOrcamento;
  if (!temOrcamento) return;

  const nivel = nivelDoLimite(orc.proporcao);
  inicioEl.caixaOrcamento.dataset.nivel = nivel; // o CSS pinta conforme o nível

  inicioEl.restante.textContent = orc.restante >= 0
    ? `Restam ${formatarCentavos(orc.restante)}`
    : `Passou ${formatarCentavos(-orc.restante)}`;

  const porcentagem = Math.round(orc.proporcao * 100);
  inicioEl.barra.setAttribute('aria-valuenow', Math.min(100, porcentagem));
  inicioEl.barra.querySelector('.barra-preenchida').style.width = Math.min(100, porcentagem) + '%';

  let detalhe = `${formatarCentavos(orc.gastoNoOrcamento)} de ${formatarCentavos(orc.orcamento)} (${porcentagem}%)`;
  if (orc.foraDoOrcamento > 0) {
    detalhe += ` · mais ${formatarCentavos(orc.foraDoOrcamento)} em categorias sem limite`;
  }
  inicioEl.detalhe.textContent = detalhe;
}

// ---------- Alertas (categorias perto ou acima do limite) ----------
function desenharAlertas(orc) {
  inicioEl.alertas.replaceChildren();
  inicioEl.caixaAlertas.hidden = orc.alertas.length === 0;

  orc.alertas.forEach((linha) => {
    const li = document.createElement('li');
    li.dataset.nivel = linha.nivel;
    const cat = linha.categoria;
    li.textContent = linha.nivel === 'estourou'
      ? `🔴 ${cat.icone} ${cat.nome}: passou ${formatarCentavos(linha.gasto - linha.limite)} do limite`
      : `⚠️ ${cat.icone} ${cat.nome}: ${formatarPorcentagem(linha.proporcao)} do limite usado`;
    inicioEl.alertas.append(li);
  });
}

// ---------- Barras por categoria ----------
/* Mostra categorias com limite (mesmo sem gastos) e as sem limite
   que tiveram gastos. Ordem: quem gastou mais primeiro. */
function desenharPorCategoria(orc) {
  inicioEl.categorias.replaceChildren();
  const linhas = orc.linhas
    .filter((l) => l.limite || l.gasto > 0)
    .sort((a, b) => b.gasto - a.gasto);

  inicioEl.categoriasVazio.hidden = linhas.length > 0;

  linhas.forEach((linha) => {
    const cat = linha.categoria;
    const li = document.createElement('li');
    li.className = 'linha-categoria';
    if (linha.nivel) li.dataset.nivel = linha.nivel;

    const topo = document.createElement('div');
    topo.className = 'linha-categoria-topo';
    const nome = document.createElement('span');
    nome.textContent = `${cat.icone} ${cat.nome}`;
    const valores = document.createElement('span');
    valores.className = 'valores';
    valores.textContent = linha.limite
      ? `${formatarCentavos(linha.gasto)} / ${formatarCentavos(linha.limite)}`
      : formatarCentavos(linha.gasto);
    topo.append(nome, valores);
    li.append(topo);

    // Barra só para quem tem limite (sem limite não há "quanto falta")
    if (linha.limite) {
      const barra = document.createElement('div');
      barra.className = 'barra barra-fina';
      barra.setAttribute('role', 'progressbar');
      barra.setAttribute('aria-label', `${cat.nome}: ${formatarPorcentagem(linha.proporcao)} do limite`);
      barra.setAttribute('aria-valuemin', '0');
      barra.setAttribute('aria-valuemax', '100');
      barra.setAttribute('aria-valuenow', Math.min(100, Math.round(linha.proporcao * 100)));
      const preenchida = document.createElement('div');
      preenchida.className = 'barra-preenchida';
      preenchida.style.width = Math.min(100, linha.proporcao * 100) + '%';
      barra.append(preenchida);
      li.append(barra);
    }
    inicioEl.categorias.append(li);
  });
}
