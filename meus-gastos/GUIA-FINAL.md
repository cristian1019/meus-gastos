# Guia final — limpeza, ajustes e portfólio

Este pacote resolve o que apareceu na revisão do GitHub, da Vercel e do Supabase. São 4 partes; faça na ordem.

O zip tem a **mesma estrutura do seu repositório** (a pasta `meus-gastos-etapa2`):

```
README.md                    → vai para a RAIZ (ao lado da pasta meus-gastos)
docs/                        → vai para a RAIZ (prints do README)
meus-gastos/
├── .vercelignore            → novo
├── GUIA-FINAL.md            → este guia
├── css/style.css            → com a correção de layout
└── sql/05_ajustes.sql       → novo
```

---

## Parte 1 — Apagar a cópia duplicada (no VS Code)

Abra a pasta **`meus-gastos-etapa2`** no VS Code. No Explorador, entre em `meus-gastos/css/`. Ela deve ficar **só com o `style.css`**.

**Apague** (botão direito → Excluir), dentro de `meus-gastos/css/`:

| Pastas | Arquivos |
|---|---|
| `css` | `index.html` |
| `icones` | `manifest.webmanifest` |
| `js` | `sw.js` |
| `sql` | `.gitignore` |
| `supabase` | `README.md` |
| | `GUIA-ETAPA2.md`, `GUIA-ETAPA3.md`, `GUIA-ETAPA4.md` |

⚠️ **Cuidado:** apague só o que está **dentro de `meus-gastos/css/`**. As pastas `meus-gastos/js`, `meus-gastos/sql` etc. (fora da `css`) são o app de verdade e ficam.

✅ **Confere:** `meus-gastos/css/` tem um arquivo só: `style.css`.

---

## Parte 2 — Copiar os arquivos novos

1. Descompacte o zip.
2. Copie **tudo** de dentro dele para a pasta `meus-gastos-etapa2`, substituindo quando o Windows perguntar.
   - O `README.md` e a pasta `docs` ficam na **raiz** (ao lado da pasta `meus-gastos`).
   - O `style.css` novo substitui o de `meus-gastos/css/` e já tem a correção do quadrinho.
3. Abra o `README.md` da raiz e confira o texto, principalmente o rodapé com o seu nome. Edite à vontade: o portfólio é seu.

---

## Parte 3 — Enviar e conferir

1. VS Code: **Controle do Código-Fonte** → mensagem `Limpeza, ajustes finais e README` → **Confirmar** → **Sincronizar**.
2. Espere cerca de 1 minuto e abra o app no iPhone (feche e abra duas vezes).

✅ **Confere:**
- Na tela Início, os quadrinhos **"Gasto no mês"** e **"Guardar este mês"** estão alinhados.
- Ao rolar a tela, nada aparece por baixo do relógio e da bateria.
- No GitHub, a página do repositório mostra o README com os prints.
- `meus-gastos-etapa2.vercel.app/css/index.html` e `meus-gastos-etapa2.vercel.app/README.md` dão **erro 404** (não estão mais publicados).

---

## Parte 4 — Supabase

**SQL dos índices**
1. **SQL Editor → New query**, cole `meus-gastos/sql/05_ajustes.sql` e clique em **Run** (pode rodar mais de uma vez).
2. Em **Advisors** (verificador), os avisos de "Unindexed foreign keys" e "Unused Index" devem sumir. Os de índice podem levar alguns minutos para atualizar.

**Login** (estas configurações eu não consigo ver daqui; confira você)
1. **Authentication → URL Configuration:** o *Site URL* deve ser `https://meus-gastos-etapa2.vercel.app`.
2. **Authentication → Sign In / Providers** (ou parecido): **"Allow new users to sign up"** deve estar **desligado**.
3. Se aparecer a opção **"Leaked password protection"** (proteção contra senhas vazadas), ligue. Se ela não aparecer ou pedir plano pago, pode ignorar.

**Avisos que podem continuar (e estão certos):**
- *"Signed-In Users Can Execute SECURITY DEFINER Function"* sobre `registrar_uso_ia`: é de propósito. É assim que o limite diário da IA funciona sem que ninguém consiga zerar o próprio contador.

---

## Opcional — nome do repositório

`meus-gastos-etapa2` não diz muito para quem visita seu GitHub. Dá para renomear em **GitHub → Settings → Repository name** (por exemplo, `meus-gastos`).

Antes, saiba de duas coisas:
- A Vercel costuma acompanhar a troca de nome sozinha. Depois de renomear, faça um commit qualquer e confira se o deploy aparece na Vercel.
- O **endereço do app não muda**: ele vem do nome do projeto na **Vercel**, não do GitHub.
- No VS Code, o Git avisa se precisar atualizar o endereço do repositório; o GitHub redireciona o nome antigo por um tempo.
