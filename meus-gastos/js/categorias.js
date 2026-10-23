/* =========================================================
   categorias.js — tela Configurações: categorias e limites.

   Cada categoria tem nome, ícone (um emoji), cor (usada nos
   gráficos) e, se você quiser, um LIMITE por mês. As categorias
   com limite formam o orçamento da tela Início.
   ========================================================= */

const catEl = {
  lista: document.getElementById('lista-config-categorias'),
  molde: document.getElementById('molde-categoria'),
  totalOrcamento: document.getElementById('config-total-orcamento'),
  botaoNova: document.getElementById('botao-nova-categoria'),
  email: document.getElementById('config-email'),

  dialogo: document.getElementById('dialogo-categoria'),
  form: document.getElementById('form-categoria'),
  titulo: document.getElementById('dialogo-categoria-titulo'),
  nome: document.getElementById('categoria-nome'),
  icone: document.getElementById('categoria-icone'),
  cor: document.getElementById('categoria-cor'),
  limite: document.getElementById('categoria-limite'),
  erro: document.getElementById('erro-categoria'),
  salvar: document.getElementById('categoria-salvar'),
  excluir: document.getElementById('categoria-excluir'),
};

let categoriaEmEdicao = null; // null = criando uma nova

function iniciarCategorias() {
  catEl.botaoNova.addEventListener('click', () => abrirDialogoCategoria(null));
  catEl.lista.addEventListener('click', (evento) => {
    const botao = evento.target.closest('.acao-editar-categoria');
    if (!botao) return;
    const cat = estado.categorias.find((c) => c.id === botao.closest('.item').dataset.id);
    if (cat) abrirDialogoCategoria(cat);
  });
  catEl.form.addEventListener('submit', aoSalvarCategoria);
  catEl.excluir.addEventListener('click', aoExcluirCategoria);
}

// ---------- Desenhar a lista ----------
function desenharCategorias() {
  catEl.lista.replaceChildren();
  catEl.email.textContent = estado.email;

  estado.categorias.forEach((cat) => {
    const item = catEl.molde.content.firstElementChild.cloneNode(true);
    item.dataset.id = cat.id;
    const icone = item.querySelector('.item-icone');
    icone.textContent = cat.icone;
    // A borda colorida mostra a cor da categoria (a mesma dos gráficos)
    icone.style.borderColor = cat.cor;
    item.querySelector('.item-descricao').textContent = cat.nome;
    item.querySelector('.item-detalhes').textContent = cat.limite_mensal
      ? `Limite: ${formatarCentavos(cat.limite_mensal)} por mês`
      : 'Sem limite';
    catEl.lista.append(item);
  });

  const total = estado.categorias.reduce((t, c) => t + (c.limite_mensal || 0), 0);
  catEl.totalOrcamento.textContent = total
    ? `Orçamento total do mês (soma dos limites): ${formatarCentavos(total)}`
    : 'Nenhuma categoria tem limite ainda. Toque em "Editar" para definir.';
}

// ---------- Janela de criar/editar ----------
function abrirDialogoCategoria(cat) {
  categoriaEmEdicao = cat;
  catEl.titulo.textContent = cat ? 'Editar categoria' : 'Nova categoria';
  catEl.nome.value = cat ? cat.nome : '';
  catEl.icone.value = cat ? cat.icone : '';
  catEl.cor.value = cat ? cat.cor : '#64748b';
  catEl.limite.value = cat && cat.limite_mensal ? centavosParaTexto(cat.limite_mensal) : '';
  catEl.erro.textContent = '';
  catEl.excluir.hidden = !cat;
  catEl.dialogo.showModal();
  if (!cat) catEl.nome.focus();
}

async function aoSalvarCategoria(evento) {
  evento.preventDefault();
  const erro = (texto, campo) => { catEl.erro.textContent = texto; if (campo) campo.focus(); };

  const nome = catEl.nome.value.trim().replace(/\s+/g, ' ');
  const icone = catEl.icone.value.trim() || '📦';
  const textoLimite = catEl.limite.value.trim();
  const limite = textoLimite === '' ? null : textoParaCentavos(textoLimite);

  if (!nome) return erro('Dê um nome à categoria.', catEl.nome);
  // Nome repetido? Comparamos sem diferenciar maiúsculas ("mercado" = "Mercado")
  const repetida = estado.categorias.some((c) =>
    c.nome.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR') &&
    (!categoriaEmEdicao || c.id !== categoriaEmEdicao.id));
  if (repetida) return erro('Já existe uma categoria com esse nome.', catEl.nome);
  if (textoLimite !== '' && limite === null) return erro('Limite inválido. Ex.: 500,00 (ou deixe vazio).', catEl.limite);

  const dados = { nome, icone, cor: catEl.cor.value, limite_mensal: limite };
  if (categoriaEmEdicao) {
    dados.id = categoriaEmEdicao.id;
  } else {
    // Nova categoria vai para o fim da lista
    dados.ordem = Math.max(0, ...estado.categorias.map((c) => c.ordem)) + 1;
  }

  catEl.salvar.disabled = true;
  try {
    await salvarCategoria(dados);
    catEl.dialogo.close();
    await carregarDados();
    mostrarAviso(`Categoria "${nome}" salva.`, 'sucesso');
  } catch (e) {
    erro(textoDoErro(e));
  } finally {
    catEl.salvar.disabled = false;
  }
}

/* Excluir: o banco NÃO deixa apagar categoria com gastos (on delete
   restrict). Então, antes, movemos os gastos dela para "Outros". */
async function aoExcluirCategoria() {
  const cat = categoriaEmEdicao;
  if (!cat) return;
  const erro = (texto) => { catEl.erro.textContent = texto; };

  if (estado.categorias.length === 1) return erro('Você precisa ter pelo menos uma categoria.');

  const quantos = estado.gastos.filter((g) => g.categoria_id === cat.id).length;
  const outros = estado.categorias.find((c) => c.nome === 'Outros' && c.id !== cat.id);

  let pergunta = `Excluir a categoria "${cat.nome}"?`;
  if (quantos > 0) {
    if (!outros) {
      return erro(`"${cat.nome}" tem ${quantos} gasto(s). Mude a categoria deles antes de excluir (ou crie uma categoria "Outros" para recebê-los).`);
    }
    pergunta += `\n\nOs ${quantos} gasto(s) dela vão para "Outros".`;
  }
  const metas = estado.programados.filter((m) => m.categoria_id === cat.id).length;
  if (metas > 0) pergunta += `\n${metas} meta(s) ficarão sem categoria.`;
  if (!confirm(pergunta)) return;

  catEl.excluir.disabled = true;
  try {
    if (quantos > 0) await moverGastosDeCategoria(cat.id, outros.id);
    await excluirCategoria(cat.id);
    catEl.dialogo.close();
    await carregarDados();
    mostrarAviso(`Categoria "${cat.nome}" excluída.`, 'sucesso');
  } catch (e) {
    erro(textoDoErro(e));
  } finally {
    catEl.excluir.disabled = false;
  }
}
