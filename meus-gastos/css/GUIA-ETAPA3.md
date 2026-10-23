# Guia da Etapa 3 — ligar a IA

Siga na ordem. Cada parte termina com um **✅ Confere**.

> Como na Etapa 2: se um botão não tiver exatamente o nome daqui, procure algo parecido no mesmo lugar. Os painéis mudam com frequência.

---

## Parte 1 — Pegar a chave do Gemini

1. Entre em **aistudio.google.com** com sua conta Google.
2. Procure **Get API key** (ou "Chaves de API") → **Create API key**.
3. Copie a chave e guarde num lugar seguro por alguns minutos (você vai colar no Supabase na Parte 3).

> 🔒 **Essa chave é SECRETA.** Ela nunca vai para o `config.js`, para o GitHub nem para o app. Só para o Supabase. Se vazar, apague no AI Studio e crie outra.

> ⚠️ **Privacidade no plano grátis:** o Google pode usar o que você envia (textos e fotos) para melhorar os produtos dele. Para um app de estudo isso é aceitável, mas evite fotografar cupons com **CPF na nota** ou dados de cartão. Se um dia quiser evitar isso, é só ativar o faturamento no Google: no plano pago os dados não são usados, e o custo para uso pessoal fica em centavos por mês.

---

## Parte 2 — Criar o limite diário no banco

1. No Supabase, abra **SQL Editor** → **New query**.
2. Cole **todo** o arquivo `sql/02_limite_ia.sql` e clique em **Run**.

✅ **Confere:** em **Table Editor** aparece a tabela nova `uso_ia`, com RLS ligado.

---

## Parte 3 — Guardar a chave no Supabase (como "segredo")

1. No Supabase, abra **Edge Functions** → **Secrets** (ou "Manage secrets").
2. Adicione:
   - **Name / Key:** `GEMINI_API_KEY` (exatamente assim, em maiúsculas)
   - **Value:** a chave que você copiou na Parte 1
3. Clique em **Save**.

---

## Parte 4 — Criar a Edge Function

1. Em **Edge Functions**, clique em **Deploy a new function** → **Via Editor**.
2. Nome da função: **`ler-gasto`** (exatamente assim; o app chama por esse nome).
3. Apague o código de exemplo do editor.
4. Abra no VS Code o arquivo `supabase/functions/ler-gasto/index.ts`, copie **tudo** e cole no editor do Supabase.
5. Clique em **Deploy** e espere terminar.
6. Nos detalhes/configurações da função, confira que **Verify JWT** (ou "Enforce JWT verification") está **ligado**. É o padrão.

✅ **Confere:** a função `ler-gasto` aparece na lista de Edge Functions com status ativo.

---

## Parte 5 — Publicar o app novo

O app mudou (`index.html`, `css`, `js/ia.js` e outros), então precisa ir para o GitHub:

1. Copie os arquivos do zip novo por cima da sua pasta `meus-gastos`. O zip **não traz** o `js/config.js`, de propósito: o seu, com a chave do seu Supabase, continua intacto.
2. No VS Code, abra **Controle do Código-Fonte**, escreva a mensagem `Etapa 3: IA`, clique em **Commit** e depois em **Sincronizar** (ou **Push**).
3. A Vercel publica sozinha em menos de um minuto.
4. No iPhone, **feche o app** (deslize para cima) e abra de novo, para pegar a versão nova.

---

## Parte 6 — Testar

1. Na tela **Novo**, digite `posto 150 no débito` e toque em **✨ Preencher**.
2. Confira os campos preenchidos e toque em **Adicionar gasto**.
3. Agora toque em **📷 Foto do cupom** e fotografe um cupom de verdade.

✅ **Confere:** em **Table Editor → uso_ia**, aparece uma linha com a data de hoje e a quantidade de usos.

---

## Se der problema

| Mensagem no app | O que fazer |
|---|---|
| "A IA ainda não foi configurada no servidor." | O segredo `GEMINI_API_KEY` não existe ou está com outro nome (Parte 3). |
| "Sessão expirada. Entre de novo." | Toque em **Sair** e entre de novo. |
| "A cota grátis do Gemini acabou por agora." | O limite do Google (não o nosso) acabou. Espere algumas horas. |
| "A IA não conseguiu responder." | Veja o motivo em **Edge Functions → ler-gasto → Logs**. Se o log falar em modelo não encontrado (*model not found*), o Google aposentou o modelo: troque o valor de `MODELO` no início do `index.ts` por um modelo atual e faça o Deploy de novo. |
| Nada acontece / erro genérico | Confira se o nome da função é exatamente `ler-gasto`. |

Os **Logs** da função mostram as mensagens de erro que o código grava (`console.error`): é o primeiro lugar para olhar.
