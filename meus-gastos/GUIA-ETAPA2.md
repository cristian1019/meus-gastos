# Guia da Etapa 2 — do computador para o iPhone

Siga na ordem. Cada parte termina com um **✅ Confere**: só passe para a próxima quando ele der certo.

> Os nomes dos menus do Supabase e da Vercel às vezes mudam um pouco. Se não achar um botão exatamente com o nome daqui, procure algo parecido no mesmo lugar.

---

## Parte 1 — Criar o banco no Supabase

1. Entre em **supabase.com** e crie a conta (dá para entrar com o GitHub).
2. Clique em **New project**:
   - **Name:** `meus-gastos`
   - **Database Password:** gere uma senha forte e **guarde** (no app Senhas do iPhone, por exemplo). Você quase não vai usar, mas não dá para recuperar.
   - **Region:** South America (São Paulo), a mais perto de você = app mais rápido.
3. Espere uns 2 minutos o projeto ficar pronto.
4. No menu da esquerda, abra **SQL Editor** → **New query**.
5. Abra o arquivo `sql/01_tabelas.sql` no VS Code, copie **tudo**, cole no editor e clique em **Run**.

✅ **Confere:** aparece "Success. No rows returned". Em **Table Editor** existem as tabelas `gastos`, `gastos_programados` e `depositos_meta`, sem o aviso vermelho "RLS disabled".

> Se der erro dizendo que algo "already exists", você rodou o SQL duas vezes. Não tem problema: as tabelas já estão lá.

---

## Parte 2 — Ligar o app ao seu projeto

1. No topo do painel do Supabase, clique em **Connect** (ou vá em **Settings → API Keys**).
2. Copie:
   - a **Project URL** (algo como `https://abcdxyz.supabase.co`)
   - a **Publishable key** (começa com `sb_publishable_`)
3. Cole os dois no arquivo `js/config.js`, no lugar dos textos de exemplo.

> ⚠️ **Nunca** use a **Secret key** (`sb_secret_`) nem a antiga `service_role`. Elas passam por cima do RLS.

---

## Parte 3 — Configurar o login

1. No Supabase, abra **Authentication → URL Configuration**.
2. Em **Site URL**, coloque por enquanto: `http://127.0.0.1:5500`
3. Em **Redirect URLs**, adicione: `http://127.0.0.1:5500/**`

Isso diz para onde o link do e-mail de confirmação deve levar.

---

## Parte 4 — Testar no computador

O login não funciona abrindo o `index.html` com dois cliques (endereço `file://`). Precisa de um servidor local:

1. No VS Code, instale a extensão **Live Server** (autor: Ritwick Dey).
2. Clique com o botão direito no `index.html` → **Open with Live Server**. Abre em `http://127.0.0.1:5500`.
3. Digite seu e-mail e uma senha (mín. 6 caracteres) e toque em **Criar conta**.
4. Abra o e-mail do Supabase e clique no link de confirmação.
5. Volte ao app e toque em **Entrar**.

✅ **Confere:** lance um gasto. No Supabase, em **Table Editor → gastos**, ele aparece com o seu `user_id`.

Se você tinha gastos da Etapa 1 no mesmo navegador, a tela **Lista** vai oferecer **Enviar para a nuvem**.

> O e-mail de confirmação grátis do Supabase tem limite de poucos envios por hora. Se não chegar, espere um pouco (e olhe o spam).

---

## Parte 5 — Colocar o código no GitHub

1. Crie a conta em **github.com**, se ainda não tiver.
2. No VS Code, abra a pasta `meus-gastos` (a que tem o `index.html` direto dentro dela).
3. Na barra da esquerda, clique em **Controle do Código-Fonte** (ícone de galhos).
4. Clique em **Publicar no GitHub** e escolha **repositório público** (é portfólio) ou privado.

> "E a chave no `config.js` vai ficar pública?" Sim, e está tudo bem: a chave publicável foi feita para isso. Quem protege os dados é o RLS, que você testou na Parte 4.

✅ **Confere:** os arquivos aparecem no seu repositório em github.com.

---

## Parte 6 — Publicar na Vercel

1. Entre em **vercel.com** com a conta do GitHub.
2. **Add New → Project** → escolha o repositório `meus-gastos` → **Import**.
3. **Framework Preset:** `Other`. Não precisa de comando de build: o app é HTML/CSS/JS puro.
4. Clique em **Deploy**.

Você ganha um endereço como `https://meus-gastos-abc.vercel.app`.

Agora volte ao Supabase em **Authentication → URL Configuration**:
- **Site URL:** troque para o endereço da Vercel
- **Redirect URLs:** adicione `https://SEU-ENDERECO.vercel.app/**` (mantenha o do `127.0.0.1` para continuar testando no computador)

✅ **Confere:** o endereço da Vercel abre no navegador e você consegue entrar.

> A partir de agora, todo **commit + push** no GitHub publica a versão nova sozinho em menos de um minuto.

---

## Parte 7 — Instalar no iPhone

1. Abra o endereço da Vercel no **Safari** (precisa ser o Safari).
2. Toque em **Compartilhar** (quadrado com seta para cima).
3. Role e toque em **Adicionar à Tela de Início** → **Adicionar**.
4. Abra pelo ícone novo e **entre de novo**: no iPhone, o app instalado guarda o login separado do Safari.

✅ **Confere:** o app abre em tela cheia, sem a barra do Safari, com o ícone "R$".

---

## Parte 8 — Fechar a porta (segurança)

Seu app está na internet: qualquer pessoa com o link poderia **criar uma conta**. Ela não veria seus dados (RLS), mas usaria a cota grátis do seu banco.

Depois de criar a **sua** conta:
1. No Supabase, vá em **Authentication** e procure a opção **Allow new users to sign up**.
2. **Desligue** e salve.

Se alguém tentar criar conta, o app mostra "Novos cadastros estão desativados".

---

## Bom saber

- **Projeto pausado:** no plano grátis, o Supabase pausa projetos que ficam cerca de uma semana sem uso. Basta reativar no painel; os dados não se perdem.
- **Mudei o código e o iPhone não atualizou:** feche o app totalmente (deslize para cima) e abra de novo.
