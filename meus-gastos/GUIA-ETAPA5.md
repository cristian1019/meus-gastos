# Guia da Etapa 5 — renda, contas fixas, economia e exportar

Esta etapa é mais simples de aplicar que a anterior: **a função da IA não muda**. São só duas partes: SQL e app.

---

## Parte 1 — Rodar o SQL

1. **SQL Editor → New query**.
2. Cole **todo** o arquivo `sql/04_etapa5.sql` e clique em **Run**.

Desta vez o SQL é **idempotente**: pode rodar duas vezes (ou rodar de novo se der algum erro no meio) sem problema nenhum. Ele não usa tabela temporária, que foi o que deu erro na Etapa 4.

✅ **Confere:** em **Table Editor** aparecem as tabelas `configuracoes`, `entradas` e `gastos_recorrentes`, todas com RLS ligado.

> Como o app antigo continua funcionando depois deste SQL, aqui não tem pressa entre a Parte 1 e a Parte 2.

---

## Parte 2 — Publicar o app

1. Copie os arquivos do zip por cima da sua pasta `meus-gastos` (o zip não traz o `js/config.js`).
2. VS Code: **Controle do Código-Fonte** → mensagem `Etapa 5: renda, contas fixas, economia e exportar` → **Confirmar** → **Sincronizar**.
3. Espere cerca de 1 minuto. No iPhone, feche o app por completo e abra de novo (duas vezes, se ainda aparecer a versão antiga).

---

## Parte 3 — Configurar e testar

**Renda (⚙️ → Renda)**
1. Digite a sua renda fixa e o **dia do pagamento: 30**.
2. Antes de salvar, o app já mostra como fica o período: *"o mês de outubro vai de 30/09 a 29/10"*.
3. Toque em **Salvar renda**.

✅ A tela Início passa a mostrar **"Ainda pode gastar"**, com a conta linha por linha.

**Extras**
- Na tela Início, toque em **➕ Recebi um extra** (hora extra, freela…). Ele entra no período da data informada.

**Contas fixas (⚙️ → Contas fixas)**
- Para contas de **valor fixo** (internet, streaming): deixe marcado **"Lançar sozinha no dia"**.
- Para contas de **valor que muda** (luz, água): desmarque. No dia, ela aparece em **"Contas fixas do período"**, na tela Início, com o botão **Lançar**, para você confirmar o valor.
- Uma conta nova começa a contar **a partir do dia em que você a cadastrou**. Se a internet vence no dia 10 e você cadastrar no dia 23, o app entende que a deste mês já foi paga e só lança a do próximo.

**Metas de economia**
- Em **Metas → Nova meta**, escolha **💰 Economia**. A data é opcional. Sem data, você pode dizer quanto quer guardar por mês.
- O botão **Retirei** aparece quando há dinheiro guardado. O histórico mostra depósitos e retiradas, e dá para desfazer.

**Exportar (⚙️ → Exportar)**
- **Exportar mês** gera a planilha do período escolhido; **Exportar tudo**, de todos os gastos.
- No iPhone, abre a tela de compartilhar: **Salvar em Arquivos**, WhatsApp, e-mail…

---

## Bom saber

| Situação | O que acontece |
|---|---|
| Fiquei dias sem abrir o app | As contas automáticas que venceram nesse tempo entram assim que você abrir, cada uma com a data certa. O app não roda com o celular bloqueado. |
| Abri o app no iPhone e no computador | O banco impede que a mesma conta seja lançada duas vezes no mesmo mês. |
| Mudei o dia do pagamento | Nada é apagado. Os gastos têm data, então o app só reagrupa os períodos. |
| Salário cai dia 30 e uma conta vence dia 10 | Nas metas, marque **"Também guardar no mês do vencimento"**. O salário que cai em 30/11 já está na sua mão antes do dia 10/12. |
| O salário caiu num dia diferente (fim de semana) | A renda fixa vale para o período inteiro, não importa o dia exato em que o dinheiro caiu. |
