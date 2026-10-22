/* =========================================================
   auth.js — login, cadastro e saída.

   O Supabase Auth guarda a sessão no navegador sozinho: depois
   de entrar uma vez, a pessoa continua logada ao reabrir o app.
   ========================================================= */

const auth = {
  form: document.getElementById('form-login'),
  email: document.getElementById('login-email'),
  senha: document.getElementById('login-senha'),
  mensagem: document.getElementById('login-mensagem'),
  botaoEntrar: document.getElementById('botao-entrar'),
  botaoCriar: document.getElementById('botao-criar-conta'),
};

/* As mensagens do Supabase vêm em inglês. Traduzimos as comuns. */
function traduzirErroAuth(erro) {
  const msg = (erro && erro.message) || '';
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).';
  if (/already registered/i.test(msg)) return 'Esse e-mail já tem conta. Use "Entrar".';
  if (/password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/signups not allowed/i.test(msg)) return 'Novos cadastros estão desativados.';
  if (/rate limit/i.test(msg)) return 'Muitas tentativas. Espere alguns minutos.';
  if (/failed to fetch|network/i.test(msg)) return 'Sem conexão com a internet.';
  return 'Algo deu errado: ' + msg;
}

function mensagemLogin(texto, tipo = 'erro') {
  auth.mensagem.textContent = texto;
  auth.mensagem.className = 'mensagem ' + tipo;
}

function bloquearBotoesLogin(bloquear) {
  auth.botaoEntrar.disabled = bloquear;
  auth.botaoCriar.disabled = bloquear;
}

function lerCredenciais() {
  const email = auth.email.value.trim();
  const senha = auth.senha.value;
  if (!email || !senha) {
    mensagemLogin('Preencha e-mail e senha.');
    return null;
  }
  return { email, password: senha };
}

async function entrar(evento) {
  evento.preventDefault();
  const credenciais = lerCredenciais();
  if (!credenciais) return;

  bloquearBotoesLogin(true);
  mensagemLogin('Entrando...', 'info');
  const { error } = await db.auth.signInWithPassword(credenciais);
  bloquearBotoesLogin(false);

  if (error) return mensagemLogin(traduzirErroAuth(error));
  // Deu certo: o onAuthStateChange (no app.js) troca de tela.
  mensagemLogin('');
  auth.senha.value = '';
}

async function criarConta() {
  const credenciais = lerCredenciais();
  if (!credenciais) return;

  bloquearBotoesLogin(true);
  mensagemLogin('Criando conta...', 'info');
  const { data, error } = await db.auth.signUp({
    ...credenciais,
    // Para onde o link do e-mail de confirmação leva
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  bloquearBotoesLogin(false);

  if (error) return mensagemLogin(traduzirErroAuth(error));

  if (!data.session) {
    // Confirmação de e-mail ligada (padrão do Supabase)
    mensagemLogin('Conta criada! Abra o link que enviamos para ' + credenciais.email + ' e depois entre aqui.', 'sucesso');
  }
}

async function sair() {
  await db.auth.signOut();
}

function iniciarAuth() {
  auth.form.addEventListener('submit', entrar);
  auth.botaoCriar.addEventListener('click', criarConta);
  document.getElementById('botao-sair').addEventListener('click', sair);
}
