# Meus Gastos

App de controle de gastos pessoais, instalável no iPhone como PWA. Projeto de estudo e portfólio.

**Etapa atual: 5 (completo).** Renda com extras e mês começando no dia do salário, "ainda pode gastar", contas fixas automáticas ou com confirmação, metas de economia com retiradas e exportação em CSV, além de tudo das etapas anteriores: IA por texto e foto, orçamento por categoria, relatórios e metas.

👉 Guias: **[Etapa 2 — colocar no ar](GUIA-ETAPA2.md)** · **[Etapa 3 — ligar a IA](GUIA-ETAPA3.md)** · **[Etapa 4 — orçamento e relatórios](GUIA-ETAPA4.md)** · **[Etapa 5 — renda e extras](GUIA-ETAPA5.md)**

## Estrutura

```
meus-gastos/
├── index.html            → telas: login, início, novo, lista, relatórios, metas, configurações
├── manifest.webmanifest  → "carteira de identidade" do app (nome, ícone, cor)
├── sw.js                 → service worker: faz o app abrir mesmo sem internet
├── css/style.css         → aparência (claro/escuro, pensado para iPhone)
├── icones/               → ícones do app em vários tamanhos
├── sql/
│   ├── 01_tabelas.sql    → tabelas e regras de segurança do banco
│   ├── 02_limite_ia.sql  → contador de usos da IA por dia
│   ├── 03_etapa4.sql     → categorias, migração dos gastos, função "Paguei"
│   └── 04_etapa5.sql     → renda, extras, contas fixas, economia (idempotente)
├── supabase/functions/ler-gasto/index.ts
│                         → servidor da IA (roda no Supabase, guarda a chave)
└── js/
    ├── config.js   → endereço e chave pública do SEU Supabase
    ├── utils.js       → dinheiro, datas, meses, orçamento e cálculo das metas
    ├── storage.js     → única parte que fala com o banco (e com a função da IA)
    ├── auth.js        → entrar, criar conta, sair
    ├── inicio.js      → tela Início (orçamento, alertas, últimos gastos)
    ├── metas.js       → gastos programados (criar, editar, guardar, pagar)
    ├── relatorios.js  → gráficos e dicas da IA
    ├── categorias.js  → Configurações: categorias e limites
    ├── renda.js       → renda, dia do pagamento e extras ("Recebi")
    ├── recorrentes.js → contas fixas (automáticas ou com confirmação)
    ├── exportar.js    → planilha CSV
    ├── ia.js          → caixa "Preencher" e foto do cupom
    └── app.js         → o "maestro": login, dados, navegação, lista
```

## Decisões da Etapa 1 (continuam valendo)

- **Dinheiro em centavos** (`1250` = R$ 12,50): inteiros somam sem erro de arredondamento.
- **`storage.js` isolado**: trocamos o localStorage pelo Supabase mexendo só nele.
- **`textContent`, nunca `innerHTML`** com texto digitado: evita XSS.
- **Datas como `"AAAA-MM-DD"`** no fuso local.
- **Delegação de eventos** na lista.

## Decisões da Etapa 2

### Segurança em camadas
1. **RLS** (no banco): cada linha tem `user_id`, e as *policies* só deixam o dono ler e alterar. Mesmo que alguém pegue a chave pública e escreva código próprio, o banco recusa.
2. **`user_id` com `default auth.uid()`**: o app nem envia o dono do registro; o banco preenche com quem está logado.
3. **Depósito só em meta própria**: a policy de `depositos_meta` confere se a meta pertence a você.
4. **Chave publicável no código, chave secreta nunca.**
5. **`check` no banco** (`valor > 0`, descrição de 1 a 80 letras): mesmo que o app tenha um bug, dado inválido não entra.

O SQL foi testado: um usuário não consegue ver, editar, apagar nem depositar nas metas de outro, e um visitante sem login não vê nada.

### Banco cuida da soma dos depósitos
`valor_guardado` é recalculado por um **gatilho** (*trigger*) sempre que um depósito entra ou sai. Se o app calculasse e enviasse, dois aparelhos ao mesmo tempo poderiam deixar o número errado.

### Cálculo das metas
`valor por mês = (total − guardado antes deste mês) ÷ meses restantes`

- O **mês atual conta** como mês para guardar.
- "Guardado **antes deste mês**": se você guardou a parcela de outubro, o app não manda guardar mais em outubro só porque o restante diminuiu.
- Arredonda o centavo **para cima**, para as parcelas nunca ficarem abaixo do total.

Exemplo (hoje 22/10, rematrícula de R$ 1.500 em 10/12):

| Opção | Meses | Por mês |
|---|---|---|
| Sem incluir dezembro | out, nov | R$ 750,00 |
| Incluindo dezembro | out, nov, dez | R$ 500,00 |

### `async`/`await` e o "estado"
Buscar na internet demora, então o app:
1. **carrega** os dados do banco para a variável `estado` (`carregarDados()`);
2. **desenha** a tela a partir do `estado` (`atualizarTela()`).

Trocar um filtro só redesenha, sem ir ao servidor. Salvar desliga o botão até terminar (evita lançamento duplicado com internet lenta).

### Service worker: "rede primeiro"
Com internet, sempre pega a versão nova do app. Sem internet, usa a última cópia. **Dados de gastos nunca vão para o cache**, só os arquivos do app.

### Migração da Etapa 1
Se houver gastos antigos no navegador, a tela Lista oferece **Enviar para a nuvem**. A cópia local é renomeada, não apagada, por segurança.

## Decisões da Etapa 3

### Por que um servidor (Edge Function) no meio?
Se o app chamasse o Gemini direto, a chave da API teria que estar no `config.js`, ou seja, pública no GitHub e no navegador. Qualquer um poderia usar sua cota. A Edge Function roda no Supabase, guarda a chave como **segredo** e só atende quem está logado.

```
iPhone ──(token de login)──▶ Edge Function ──(chave secreta)──▶ Gemini
                               │
                               ├─ confere o login
                               ├─ conta +1 no limite diário (banco)
                               └─ confere a resposta da IA
```

### A IA interpreta, o código decide
O Gemini devolve um JSON num **formato obrigatório** (JSON Schema). Mesmo assim, a função **confere tudo** antes de responder:
- valor negativo, zero ou absurdo → vira "sem valor";
- categoria fora da lista → `outros`;
- data inexistente (30/02) ou no futuro → hoje;
- forma de pagamento desconhecida → mantém a que estava no app.

E o valor em reais vira centavos **no código** (`Math.round(valor * 100)`), não na IA.

### Você sempre confirma
A IA só **preenche o formulário**. Nada é salvo até você tocar em "Adicionar gasto". Se ela errar, você corrige antes.

### Limite diário de 30 usos, contado pelo banco
- A tabela `uso_ia` guarda quantos pedidos cada pessoa fez em cada dia (horário de Brasília).
- Ninguém consegue zerar o próprio contador: não existe policy de insert/update. Só a função `registrar_uso_ia()` mexe nele, e ela só soma 1.
- O uso é contado **antes** de chamar a IA. Tentativas que dão erro também contam; senão, um erro repetido viraria um jeito de furar o limite.
- Pedidos mal formados (texto vazio, foto grande demais) são recusados **antes** de contar.

### Foto reduzida no próprio celular
A foto do iPhone (~4000×3000, vários MB) é redesenhada num `<canvas>` com no máximo 1600 px e salva como JPEG. No teste, uma imagem de 3000×4000 virou 1200×1600 com 19 KB. Isso deixa o envio rápido no 4G, gasta menos cota e ainda converte o HEIC do iPhone. A foto **não é guardada** em lugar nenhum.

### Modelo
`gemini-3.5-flash-lite`: um dos modelos que o Google recomenda para projetos novos, lê imagens e tem cota grátis. Para trocar, mude a constante `MODELO` no `index.ts`.

## Decisões da Etapa 4

### Categorias no banco, com ligação COMPOSTA
Antes, cada gasto guardava a categoria como texto (`"mercado"`). Agora existe a tabela `categorias`, e o gasto guarda o **id** dela (`categoria_id`). Renomear "Educação" para "Faculdade" muda em um lugar só, e o app inteiro acompanha.

Os testes encontraram uma falha na primeira versão: uma chave estrangeira simples só confere se a categoria **existe**, não **de quem** ela é. O usuário A conseguia ligar um gasto dele a uma categoria do usuário B. A solução foi uma chave estrangeira **composta**:

```sql
foreign key (categoria_id, user_id) references categorias (id, user_id)
```

Agora o banco exige que gasto e categoria tenham o **mesmo dono**. Lição: RLS protege as *linhas*, mas as *ligações* entre tabelas precisam de atenção própria.

- `on delete restrict` nos gastos: o banco não deixa apagar uma categoria com gastos. O app move os gastos para "Outros" antes.
- `on delete set null (categoria_id)` nas metas: a meta continua, só fica sem categoria. O `(categoria_id)` diz para limpar *só* essa coluna, e não o `user_id` junto (recurso do Postgres 15+).

### "Paguei" é uma transação no banco
Pagar uma meta são 3 passos: lançar o gasto, marcar a meta como paga e criar a próxima (se repetir). Se o app fizesse 3 pedidos e a internet caísse no meio, sobraria um gasto lançado com a meta ainda "ativa". A função `pagar_gasto_programado()` faz tudo numa **transação**: ou acontece tudo, ou nada.
- `for update` trava a meta durante o pagamento: dois toques rápidos em "Confirmar" não pagam duas vezes.
- `security invoker`: a função roda **como você**, então o RLS continua valendo.
- A próxima data usa a regra do Postgres: 31/01 + 1 mês = 28/02. O app mostra a mesma data antes de você confirmar (testado, inclusive em ano bissexto).

### Orçamento: regras (todas no código)
- Só categorias **com limite** entram. Orçamento do mês = soma dos limites.
- Restante = orçamento − gastos dessas categorias no mês. Pode ficar negativo ("Passou R$ X").
- Gastos em categorias **sem limite** aparecem à parte ("mais R$ X em categorias sem limite"), para não esconder nada.
- Alertas: **80%** do limite = atenção (amarelo); **100%** = passou (vermelho). Os números ficam em `ALERTA_ATENCAO` e `ALERTA_ESTOUROU`, no `utils.js`.
- O JavaScript só marca `data-nivel="atencao"`; quem escolhe a cor é o CSS.

### Dicas da IA: o código calcula, a IA escreve
O app monta um **resumo** com todos os números já prontos e formatados (`"R$ 420,00"`, `"84%"`) e manda para a Edge Function. A instrução para a IA diz: *use só esses números, copie como estão, nunca calcule*. A resposta passa por conferência (no máximo 4 dicas, tamanho limitado) e aparece na tela com `textContent`.

As dicas ficam guardadas **neste aparelho** (localStorage), por mês: reabrir a tela não gasta outro uso da IA. Se os gastos mudarem, o app avisa que dá para gerar de novo, mas não chama a IA sozinho.

### Gráficos com Chart.js 4.5.1 (versão fixa)
O endereço do script tem a versão exata. Assim, uma atualização da biblioteca nunca muda o app sem você saber. As cores vêm das próprias categorias e do tema (claro ou escuro), lidas das variáveis do CSS. A legenda é uma **lista HTML**, e não só o desenho: dá para ler os valores exatos, e leitores de tela conseguem ler.

### Janelas com `<dialog>`
Criar meta, pagar e editar categoria usam o `<dialog>` nativo do navegador: `showModal()` abre por cima, escurece o fundo e o gesto de voltar fecha. Sem biblioteca nenhuma.

## Decisões da Etapa 5

### O "mês" começa no dia do salário
Com salário no dia 30, o período **"novembro"** vai de **30/10 a 29/11**. As regras (em `periodo()`, no `utils.js`):
- **Mês sem aquele dia** (fevereiro e o dia 30): o período começa no **último dia** do mês. Assim nenhum dia fica de fora nem é contado duas vezes. Testei 3 anos inteiros, dia por dia, com o pagamento nos dias 1, 15, 16, 28, 30 e 31.
- **Nome do período:** o do mês com mais dias dentro dele. Pagamento até o dia 15 → nome do mês em que começa; depois do 15 → do mês seguinte (o salário de 30/10 sustenta novembro).
- O período usa a mesma chave de um mês (`"2026-11"`). Por isso filtros, gráficos e metas continuaram funcionando: bastou trocar `mesDaData()` por `periodo()`.

### "Ainda pode gastar"
```
  renda fixa + extras do período
− gastos do período
− contas fixas que ainda vão cair no período
− quanto guardar para as metas neste período
```
Tudo calculado no código (`calcularSaldo()`), e cada linha aparece na tela, para ficar claro de onde vem o número.

### Contas fixas: o banco impede duplicar
Cada gasto lançado por uma conta fixa guarda **de qual conta** (`recorrente_id`) e **de qual mês** (`competencia`). Uma regra `UNIQUE (recorrente_id, competencia)` no banco garante que a mesma conta nunca entra duas vezes no mesmo mês, mesmo com o app aberto no iPhone e no computador ao mesmo tempo. O app usa `upsert` com `ignoreDuplicates`: tenta lançar e, se já existir, o banco simplesmente ignora.

Limitação conhecida: um app web não roda com o celular bloqueado. As contas automáticas entram quando você **abre** o app, com a data certa de cada uma.

### Retirada = depósito negativo, com duas barreiras
"Retirei" grava um depósito com valor negativo. O app confere se há saldo, e o **banco confere de novo**: o gatilho recalcula o `valor_guardado`, e a regra `valor_guardado >= 0` (da Etapa 2) recusa o saldo negativo, desfazendo a retirada inteira. Os testes simulam o app "achando" que havia saldo, e o banco recusa mesmo assim.

### CSV para o Excel brasileiro
- Separador `;` e valores como `1234,56`, que é o que o Excel em português espera.
- `BOM` (`\uFEFF`) no início, para os acentos não virarem "Ã§".
- **Proteção contra injeção de fórmula:** uma descrição como `=SOMA(...)` seria executada pelo Excel. O app coloca um `'` na frente, e ela vira texto comum.
- No iPhone, o arquivo vai pela tela de compartilhar do sistema (Web Share API). No computador, é um download comum.

### SQL idempotente
Depois do susto na Etapa 4, o SQL desta etapa pode rodar quantas vezes for preciso: `if not exists`, `drop ... if exists` antes de criar e `create or replace`. Testei rodando duas vezes seguidas e também comando por comando, separados (como o editor do Supabase às vezes faz), e não houve nenhum erro.

### Bug que os testes pegaram
Uma meta de economia **sem prazo** travava o resumo enviado para as dicas da IA, que tentava formatar uma data inexistente. Os testes da tela encontraram o problema antes de ele chegar ao celular.

## Ideias para depois
- Notificações no iPhone (PWA instalado, iOS 16.4+) para lembrar contas a confirmar
- Migrar a interface para React, como estudo
