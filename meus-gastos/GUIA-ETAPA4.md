# Guia da Etapa 4 — orçamento, relatórios e metas completas

Siga na ordem. Cada parte termina com um **✅ Confere**.

> ⚠️ **Faça as Partes 2, 3 e 4 em sequência, sem parar no meio.** O SQL desta etapa muda a tabela de gastos (a categoria deixa de ser texto e vira uma ligação com a tabela nova). Entre a Parte 2 e a Parte 4, o app antigo **não consegue salvar gastos**. São só alguns minutos, mas não deixe para depois.

---

## Parte 1 — Cópia de segurança (1 minuto)

O SQL é seguro (se der qualquer erro, nada é aplicado), mas é bom hábito guardar uma cópia antes de mexer na estrutura do banco:

1. No Supabase, abra **Table Editor → gastos**.
2. Procure o botão de exportar (**Export → Export to CSV**, ou parecido) e salve o arquivo.

---

## Parte 2 — Rodar o SQL

1. **SQL Editor → New query**.
2. Cole **todo** o arquivo `sql/03_etapa4.sql` e clique em **Run**.

✅ **Confere:**
- Em **Table Editor** aparece a tabela `categorias`, com RLS ligado e 9 categorias por conta.
- Na tabela `gastos`, a coluna `categoria` sumiu e apareceu `categoria_id`. Seus gastos de antes continuam lá.

> Se aparecer um erro dizendo que algo "already exists", o SQL já foi aplicado antes. Nesse caso, siga para a Parte 3.

---

## Parte 3 — Atualizar a função da IA

A função agora usa as **suas** categorias (inclusive as que você criar) e também escreve as dicas do mês.

1. No Supabase, abra **Edge Functions → ler-gasto**.
2. Abra a aba do **código** (Code / Editor).
3. Apague todo o código e cole o conteúdo novo de `supabase/functions/ler-gasto/index.ts`.
4. Clique em **Deploy**.

O segredo `GEMINI_API_KEY` continua o mesmo: não precisa mexer.

---

## Parte 4 — Publicar o app

Igual à Etapa 3:

1. Copie os arquivos do zip por cima da sua pasta `meus-gastos` (a que fica dentro de `meus-gastos-etapa2`). O zip não traz o `js/config.js`, então o seu continua intacto.
2. No VS Code: **Controle do Código-Fonte** → mensagem `Etapa 4: orçamento, relatórios e metas` → **Confirmar** → **Sincronizar**.
3. Espere cerca de 1 minuto. No iPhone, feche o app por completo e abra de novo.

✅ **Confere:** o app abre na tela **Início**, e a barra de baixo tem 5 botões: Início, Novo, Lista, Relatórios e Metas.

> Se o iPhone ainda mostrar a versão antiga, feche e abra o app mais uma vez. Na primeira abertura, o service worker baixa os arquivos novos; na segunda, eles passam a ser usados.

---

## Parte 5 — Testar cada parte nova

**Configurações (⚙️ no topo)**
1. Toque em **Editar** em *Mercado* e coloque um limite (ex.: `500`).
2. Faça o mesmo em mais uma ou duas categorias.
3. Crie uma categoria nova, por exemplo 🐶 *Pets*. Para o ícone, use o teclado de emojis do iPhone.

**Início**
- O cartão **Orçamento do mês** mostra quanto ainda resta.
- Lance um gasto que faça uma categoria passar de 80% do limite: aparece um aviso amarelo, e a categoria vai para **Atenção**.

**Relatórios**
- A pizza mostra para onde foi o dinheiro, e as barras mostram os últimos 6 meses.
- Toque em **Gerar dicas deste mês**. Isso gasta 1 uso da IA. Se você reabrir a tela, as dicas continuam lá sem gastar outro uso.

**Metas**
- Toque em **Editar** numa meta e escolha a categoria e se ela se repete (todo mês ou todo ano).
- Toque em **Paguei**: confira os dados e confirme. A meta vira um gasto na Lista e, se for recorrente, a próxima aparece sozinha.
- Em **Depósitos (N)**, dá para **Desfazer** um "Guardei" lançado por engano.

---

## Se der problema

| O que acontece | O que fazer |
|---|---|
| Ao salvar um gasto: "Não foi possível concluir" | O app no celular ainda é o antigo. Feche e abra de novo (Parte 4). |
| Os gráficos não aparecem e surge o aviso "Não consegui carregar os gráficos" | A biblioteca de gráficos vem da internet. Abra o app com internet e entre de novo na tela. |
| A IA preenche tudo como "Outros" | A função ainda é a antiga. Refaça a Parte 3. |
| "Você ainda não tem categorias" (IA) | Abra o app uma vez: ele cria as categorias padrão sozinho. |
| Erro ao excluir categoria | O app move os gastos para "Outros" antes de excluir. Se você apagou ou renomeou a "Outros", crie uma com esse nome de novo. |
