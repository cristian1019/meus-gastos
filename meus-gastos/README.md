# Meus Gastos

App de controle de gastos pessoais, instalável no iPhone como PWA. Projeto de estudo e portfólio.

**Etapa atual: 2 (nuvem).** Login, gastos salvos no Supabase, gastos programados básicos, instalável no iPhone.

👉 Para colocar no ar, siga o **[GUIA-ETAPA2.md](GUIA-ETAPA2.md)**.

## Estrutura

```
meus-gastos/
├── index.html            → telas: login, novo gasto, lista, metas
├── manifest.webmanifest  → "carteira de identidade" do app (nome, ícone, cor)
├── sw.js                 → service worker: faz o app abrir mesmo sem internet
├── css/style.css         → aparência (claro/escuro, pensado para iPhone)
├── icones/               → ícones do app em vários tamanhos
├── sql/01_tabelas.sql    → tabelas e regras de segurança do banco
└── js/
    ├── config.js   → endereço e chave pública do SEU Supabase
    ├── utils.js    → dinheiro, datas, categorias e o cálculo das metas
    ├── storage.js  → única parte que fala com o banco
    ├── auth.js     → entrar, criar conta, sair
    ├── metas.js    → tela de gastos programados
    └── app.js      → o "maestro": liga tudo
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

## Próxima etapa (3): IA
- Digitar "posto 150" e a IA preencher categoria e valor
- Foto do cupom
- Chave da IA numa Supabase Edge Function (nunca no app)
