# Como atualizar o Insights (passo a passo)

Os artigos do FrameOn Insights sao **paginas estaticas reais** (o texto fica no HTML,
visivel para Google e para IAs como ChatGPT/Claude/Perplexity). Eles NAO usam mais o
embed do Soro. Para mexer no blog, siga este guia.

> Voce so precisa fazer isso quando **publicar um artigo novo** ou **editar um existente**.
> Nada disso roda sozinho.

---

## O que e cada coisa

- `articles.json`        -> a LISTA dos artigos (titulo, slug, data, resumo, imagem).
- `bodies/<slug>.html`   -> o TEXTO de cada artigo, em HTML.
- `../build-insights.js` -> o programa que monta as paginas. Voce so RODA ele.
- `../insights/`         -> o resultado pronto (o que vai pro site). Nao edite na mao.

`slug` = o "apelido" do artigo na URL. Ex.: o artigo em
`frameonlab.ai/insights/memoria-organizacional-nas-empresas/` tem slug
`memoria-organizacional-nas-empresas`.

---

## A) Editar um artigo que JA existe

1. No Soro, abra o artigo e clique em **Copy as HTML**.
2. Abra o arquivo `bodies/<slug>.html` correspondente, apague tudo e cole o novo HTML.
   (Se quiser, ajuste o resumo/titulo no `articles.json`.)
3. Rode o gerador (veja "Rodar" abaixo).
4. Publique (veja "Publicar" abaixo).

## B) Publicar um artigo NOVO

1. No Soro: **Copy as HTML** do artigo novo.
2. Crie o arquivo `bodies/<slug>-do-artigo.html` e cole o HTML ali.
3. Abra `articles.json` e adicione um bloco no TOPO da lista, no mesmo formato dos outros:

   ```json
   {
     "id": "(pode deixar vazio ou um identificador qualquer)",
     "title": "Titulo do artigo",
     "slug": "slug-do-artigo",
     "excerpt": "Resumo de 1-2 linhas (vira a meta description).",
     "dateDisplay": "10 de junho de 2026",
     "isoDate": "2026-06-10T12:00:00.000+00:00",
     "dateModified": "2026-06-10T12:00:00.000+00:00",
     "image": "https://.../imagem-de-capa.webp",
     "author": "FrameOn Lab"
   }
   ```
   - `slug` tem que ser IGUAL ao nome do arquivo em `bodies/` (sem o `.html`).
   - `isoDate` controla a ordem (mais novo primeiro).
4. Rode o gerador e publique.

---

## Rodar o gerador

Abra um terminal NA PASTA DO SITE (a pasta que contem `build-insights.js`) e rode:

```
node build-insights.js
```

Ele cria/atualiza as paginas em `insights/`, reescreve o indice `insights/index.html`
e o `sitemap.xml`. Se faltar o `bodies/<slug>.html` de algum artigo, ele AVISA e PULA
aquele artigo (nao quebra).

## Publicar (colocar no ar)

O site e publicado pelo GitHub (repo **mestrerenatoferreira/frameon-website** -> GitHub Pages).
Logado como **mestrerenatoferreira** em github.com:

1. Abra o repo -> **Add file** -> **Upload files**.
2. Arraste a PASTA `insights` (inteira, descompactada) e o arquivo `sitemap.xml`.
   - Opcional: tambem `build-insights.js` e a pasta `_insights-build` (para ficar versionado).
   - NUNCA suba um arquivo `.zip` -> o GitHub nao descompacta; subiria so o zip parado.
3. **Commit changes** direto no `main`.
4. Em ~1-2 min o site republica. Confira em `https://frameonlab.ai/insights/`.

## Conferir se foi ao ar

Abra um artigo, ex.: `https://frameonlab.ai/insights/<slug>/`, e tecle **Ctrl+U**
(ver codigo-fonte). O texto do artigo TEM que aparecer no HTML. Se aparecer, esta certo.

---

## Erros comuns

- **Subi o .zip e nao mudou nada** -> certo: o GitHub nao descompacta. Suba a pasta `insights` descompactada.
- **Artigo nao apareceu** -> o `slug` do `articles.json` nao bate com o nome do arquivo em `bodies/`.
- **`node` nao encontrado** -> instale o Node.js (https://nodejs.org) e rode de novo.
- **`git push` deu 403** -> a conta do terminal nao tem acesso de escrita; use o UPLOAD WEB acima.
