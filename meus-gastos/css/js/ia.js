/* =========================================================
   ia.js — caixa "Preencher com IA" da tela Novo gasto.

   Fluxo: você digita "posto 150" (ou tira foto do cupom) →
   a IA devolve os campos → o formulário é preenchido →
   VOCÊ confere e toca em "Adicionar gasto".
   A IA nunca salva nada sozinha.
   ========================================================= */

const iaEl = {
  caixa: document.getElementById('caixa-ia'),
  form: document.getElementById('form-ia'),
  texto: document.getElementById('ia-texto'),
  botaoTexto: document.getElementById('ia-botao-texto'),
  botaoFoto: document.getElementById('ia-botao-foto'),
  foto: document.getElementById('ia-foto'),
  status: document.getElementById('ia-status'),
};

let iaOcupada = false;

function iniciarIA() {
  iaEl.form.addEventListener('submit', aoPreencherComTexto);
  iaEl.foto.addEventListener('change', aoEscolherFoto);
}

function statusIA(texto, tipo = 'info') {
  iaEl.status.textContent = texto;
  iaEl.status.className = 'mensagem ' + tipo;
}

/** Trava os botões enquanto a IA trabalha (evita pedidos repetidos). */
function ocuparIA(ocupada) {
  iaOcupada = ocupada;
  iaEl.botaoTexto.disabled = ocupada;
  iaEl.texto.disabled = ocupada;
  iaEl.botaoFoto.classList.toggle('desativado', ocupada);
  iaEl.foto.disabled = ocupada;
}

async function aoPreencherComTexto(evento) {
  evento.preventDefault();
  const texto = iaEl.texto.value.trim();
  if (!texto) return statusIA('Escreva algo como "mercado 87,90".', 'erro');
  await pedirParaIA({ texto }, 'Pensando…');
}

async function aoEscolherFoto() {
  const arquivo = iaEl.foto.files[0];
  iaEl.foto.value = ''; // permite escolher a mesma foto de novo depois
  if (!arquivo) return;

  try {
    statusIA('Preparando a foto…');
    const imagem = await reduzirImagem(arquivo);
    await pedirParaIA({ imagem }, 'Lendo o cupom…');
  } catch (erro) {
    console.error(erro);
    statusIA('Não consegui abrir essa foto. Tente outra.', 'erro');
  }
}

async function pedirParaIA(pedido, mensagemEspera) {
  if (iaOcupada) return;
  ocuparIA(true);
  statusIA(mensagemEspera);

  try {
    const { gasto, usos_restantes } = await interpretarComIA(pedido);
    preencherFormulario(gasto);
    iaEl.texto.value = '';

    const restam = `(${usos_restantes} uso${usos_restantes === 1 ? '' : 's'} da IA hoje)`;
    if (gasto.valor === null) {
      statusIA(`Não achei o valor. Preenchi o resto: digite o valor e confira. ${restam}`, 'erro');
      el.valor.focus();
    } else {
      statusIA(`Pronto! Confira os campos e toque em "Adicionar gasto". ${restam}`, 'sucesso');
    }
  } catch (erro) {
    statusIA(textoDoErro(erro), 'erro');
  } finally {
    ocuparIA(false);
  }
}

/** Coloca a resposta da IA nos campos do formulário de sempre. */
function preencherFormulario(gasto) {
  if (gasto.valor !== null) el.valor.value = centavosParaTexto(gasto.valor);
  el.descricao.value = gasto.descricao;
  el.categoria.value = gasto.categoria_id;
  el.data.value = gasto.data;
  // Se a IA não soube a forma de pagamento, mantém a que estava
  if (gasto.forma_pagamento) el.pagamento.value = gasto.forma_pagamento;
  el.erro.textContent = '';

  // Destaque rápido nos campos preenchidos, para chamar atenção
  [el.valor, el.descricao, el.categoria, el.data, el.pagamento].forEach((campo) => {
    campo.classList.remove('preenchido-ia');
    void campo.offsetWidth; // "reinicia" a animação do CSS
    campo.classList.add('preenchido-ia');
  });
}

/* ---------------------------------------------------------
   reduzirImagem: uma foto do iPhone tem ~4000x3000 pixels e
   vários MB. Para ler um cupom, 1600 px no lado maior bastam.
   Reduzir antes de enviar deixa o envio rápido no 4G, gasta
   menos da cota da IA e cabe no limite da função.

   Truque: desenhamos a foto num <canvas> menor e exportamos
   como JPEG. Isso também converte o HEIC do iPhone para JPEG.
   --------------------------------------------------------- */
const LADO_MAXIMO = 1600;

function reduzirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
      const largura = Math.round(img.naturalWidth * escala);
      const altura = Math.round(img.naturalHeight * escala);

      const canvas = document.createElement('canvas');
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // fundo branco (PNG transparente ficaria preto)
      ctx.fillRect(0, 0, largura, altura);
      ctx.drawImage(img, 0, 0, largura, altura);

      // "data:image/jpeg;base64,AAAA..." → só a parte depois da vírgula
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve({ dados: dataUrl.split(',')[1], tipo: 'image/jpeg', largura, altura });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Imagem ilegível'));
    };

    img.src = url;
  });
}
