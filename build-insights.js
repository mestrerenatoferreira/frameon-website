/* ============================================================================
 * FrameOn - Gerador estatico do Insights (zero dependencias)
 * ----------------------------------------------------------------------------
 * OBJETIVO:
 *   Substituir o embed do Soro (que injeta artigos via JavaScript e fica
 *   invisivel para crawlers de IA) por PAGINAS REAIS renderizadas no build.
 *   O texto completo de cada artigo passa a existir no HTML inicial.
 *
 * O QUE FAZ:
 *   1. Le insights/index.html e reaproveita o "mobiliario" do site (CSS, nav,
 *      menu mobile, modal, rodape, scripts e Google Analytics), para que as
 *      paginas do Insights fiquem identicas ao resto do FrameOn.
 *   2. Le os metadados em _insights-build/articles.json e o corpo de cada
 *      artigo em _insights-build/bodies/<slug>.html (export "Copy as HTML" do
 *      Soro, ou identico via API do embed).
 *   3. Gera insights/<slug>/index.html (URL limpa /insights/<slug>/) com:
 *      <title>/meta description proprios, canonical, H1, hierarquia de headings
 *      e JSON-LD Article (headline, datePublished, dateModified, author, image).
 *   4. Reescreve insights/index.html como INDICE estatico (cards) - SEM o embed.
 *   5. Atualiza sitemap.xml com uma <url> por artigo.
 *
 * COMO USAR:
 *   - Para atualizar um artigo: no Soro clique "Copy as HTML" e cole em
 *     _insights-build/bodies/<slug>.html (o <slug> tem que bater com articles.json).
 *   - Rode:  node build-insights.js
 *   - Confira insights/index.html e as paginas, depois commit/push.
 *
 *   Artigos sem arquivo de corpo correspondente sao PULADOS (com aviso).
 * ========================================================================== */

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC_PAGE = path.join(ROOT, 'insights', 'index.html');
const BUILD_DIR = path.join(ROOT, '_insights-build');
const BODIES_DIR = path.join(BUILD_DIR, 'bodies');
const ARTICLES_JSON = path.join(BUILD_DIR, 'articles.json');
const INSIGHTS_DIR = path.join(ROOT, 'insights');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const SITE = 'https://frameonlab.ai';
const NL = String.fromCharCode(10);

function die(msg) { console.error('ERRO: ' + msg); process.exit(1); }
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* -------------------------------------------------------------------------- */
/* 1. Extrair o "mobiliario" do insights/index.html (profundidade 1)          */
/* -------------------------------------------------------------------------- */
function extractChrome() {
  if (!fs.existsSync(SRC_PAGE)) die('insights/index.html nao encontrado em ' + SRC_PAGE);
  const html = fs.readFileSync(SRC_PAGE, 'utf8');

  // CSS principal = PRIMEIRO bloco <style>..</style> (ignora o <style> final do Soro)
  const styleStart = html.indexOf('<style>');
  const styleEnd = html.indexOf('</style>', styleStart);
  if (styleStart === -1 || styleEnd === -1) die('bloco <style> principal nao encontrado.');
  // remove regras orfas do embed antigo (#soro-blog ...) - nao ha mais esse elemento
  const css = html.slice(styleStart + 7, styleEnd).replace(/#soro-blog[^{]*\{[^}]*\}/g, '');

  // Google Analytics (gtag) do <head>: do <script async ...gtag/js...> ate o 2o </script>
  let gtag = '';
  const gStart = html.indexOf('<script async src="https://www.googletagmanager.com/gtag/js');
  if (gStart !== -1) {
    const firstEnd = html.indexOf('</script>', gStart);
    const secondEnd = html.indexOf('</script>', firstEnd + 1);
    if (secondEnd !== -1) gtag = html.slice(gStart, secondEnd + 9);
  }

  // header = <nav id="main-nav"> ... ate o inicio do <main (captura nav + menu mobile + modal)
  const navStart = html.indexOf('<nav id="main-nav">');
  const mainStart = html.indexOf('<main', navStart);
  if (navStart === -1 || mainStart === -1) die('nav/main nao encontrados.');
  const header = html.slice(navStart, mainStart);

  // footer
  const footerStart = html.indexOf('<footer');
  const footerEnd = html.indexOf('</footer>');
  if (footerStart === -1 || footerEnd === -1) die('footer nao encontrado.');
  const footer = html.slice(footerStart, footerEnd + 9);

  // script de comportamento = primeiro <script> inline (sem src) DEPOIS do footer
  let behavior = '';
  const reScript = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = reScript.exec(html)) !== null) {
    if (m.index > footerEnd && !/\bsrc=/.test(m[1])) { behavior = m[0]; break; }
  }

  return { css: css, gtag: gtag, header: header, footer: footer, behavior: behavior };
}

// Profundidade 1 (insights/) -> profundidade 2 (insights/<slug>/): soma um "../"
function toDepth2(chromeHtml) {
  return chromeHtml
    .replace(/(href|src)="\.\.\//g, '$1="../../')       // ../X -> ../../X (home, empresa, i18n.js...)
    .replace(/href="index\.html"/g, 'href="../index.html"'); // link "Insights" (self) -> volta um nivel
}

/* -------------------------------------------------------------------------- */
/* 2. CSS extra (cards do indice + corpo do artigo)                           */
/* -------------------------------------------------------------------------- */
const BLOG_CSS = [
  '.blog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:28px;margin-top:8px}',
  '.post-card{display:flex;flex-direction:column;background:var(--bg-card);border:1px solid var(--border-mid);border-radius:6px;overflow:hidden;transition:transform .25s ease,border-color .25s ease}',
  '.post-card:hover{transform:translateY(-4px);border-color:var(--cyan)}',
  '.post-card a.card-link{display:flex;flex-direction:column;height:100%;text-decoration:none;color:inherit}',
  '.post-card .cover{aspect-ratio:16/9;background:var(--grad-main);background-size:cover;background-position:center}',
  '.post-card .card-body{padding:24px;display:flex;flex-direction:column;gap:12px;flex:1}',
  '.post-card .card-date{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan)}',
  '.post-card h2{font-size:20px;font-weight:600;color:var(--white-tech);line-height:1.3;letter-spacing:-.01em}',
  '.post-card p{color:var(--white-muted);font-size:14.5px;flex:1}',
  '.post-card .read-more{color:var(--teal);font-size:13px;font-weight:600}',
  '.article-wrap{max-width:760px;margin:0 auto;padding:140px 24px 100px}',
  '.article-head{margin-bottom:40px;border-bottom:1px solid var(--border-mid);padding-bottom:32px}',
  '.article-head .article-date{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan);margin-bottom:16px}',
  '.article-head h1{font-size:clamp(30px,4vw,46px);line-height:1.15;margin-bottom:16px}',
  '.article-head .article-desc{color:var(--white-dim);font-size:19px;line-height:1.6}',
  '.article-head .article-author{color:var(--white-muted);font-size:14px;margin-top:14px}',
  '.article-cover{width:100%;border-radius:8px;margin-bottom:40px;display:block}',
  '.article-body{color:var(--white-dim);font-size:17px;line-height:1.8}',
  '.article-body h2{font-size:28px;margin:48px 0 18px;color:var(--white-tech);letter-spacing:-.02em;line-height:1.25}',
  '.article-body h3{font-size:22px;margin:36px 0 14px;color:var(--white-tech)}',
  '.article-body h4{font-size:18px;margin:28px 0 12px;color:var(--white-tech)}',
  '.article-body p{margin-bottom:22px}',
  '.article-body ul,.article-body ol{margin:0 0 22px 24px}',
  '.article-body li{margin-bottom:10px}',
  '.article-body a{color:var(--cyan);text-decoration:underline;text-underline-offset:3px}',
  '.article-body img{max-width:100%;height:auto;border-radius:8px;margin:24px 0}',
  '.article-body blockquote{border-left:3px solid var(--cyan);padding:8px 20px;margin:24px 0;color:var(--white-tech);background:rgba(0,174,239,.05)}',
  '.article-body strong{color:var(--white-tech)}',
  '.article-body hr{border:none;border-top:1px solid var(--border-mid);margin:40px 0}',
  '.article-foot{margin-top:56px;padding-top:32px;border-top:1px solid var(--border-mid)}',
  '.back-to-blog{display:inline-flex;align-items:center;gap:8px;color:var(--white-muted);font-size:14px;text-decoration:none;margin-bottom:32px}',
  '.back-to-blog:hover{color:var(--cyan)}'
].join(NL);

const FONT_LINKS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com"/>',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>',
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>'
].join(NL);

/* -------------------------------------------------------------------------- */
/* 3. Shell da pagina                                                         */
/* -------------------------------------------------------------------------- */
function pageShell(o) {
  return [
    '<!DOCTYPE html>',
    '<html lang="pt-BR">',
    '<head>',
    o.gtag,
    '<meta charset="UTF-8"/>',
    '<meta name="viewport" content="width=device-width,initial-scale=1.0"/>',
    '<title>' + escapeHtml(o.title) + '</title>',
    '<meta name="description" content="' + escapeHtml(o.description || '') + '"/>',
    '<link rel="canonical" href="' + o.canonical + '"/>',
    o.head || '',
    FONT_LINKS,
    '<style>' + o.css + NL + BLOG_CSS + '</style>',
    '</head>',
    '<body>',
    o.header,
    o.bodyInner,
    o.footer,
    o.behavior,
    '<script src="' + o.i18n + '"></script>',
    '</body>',
    '</html>'
  ].join(NL);
}

// remove um <h1>...</h1> inicial do corpo (o titulo ja vai no <header> da pagina)
function stripLeadingH1(body) {
  return body.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '');
}

// corrige links internos herdados do embed do Soro:
//  - /insights/?post=<slug>  (deep-link da SPA, que deixou de existir) -> /insights/<slug>/
//  - /empresa, /plataforma... (sem .html, que dao 404 no GitHub Pages)  -> .html
function sanitizeBodyLinks(body) {
  return body
    .replace(/https?:\/\/frameonlab\.ai\/insights\/\?post=([a-z0-9-]+)\/?/gi, SITE + '/insights/$1/')
    .replace(/(href=")https?:\/\/frameonlab\.ai\/(empresa|plataforma|privacidade|termos)(")/gi, '$1' + SITE + '/$2.html$3');
}

/* -------------------------------------------------------------------------- */
/* 4. Build                                                                   */
/* -------------------------------------------------------------------------- */
function build() {
  const chrome = extractChrome();
  const headerD1 = chrome.header, footerD1 = chrome.footer;        // indice (profundidade 1)
  const headerD2 = toDepth2(chrome.header), footerD2 = toDepth2(chrome.footer); // artigo (profundidade 2)

  if (!fs.existsSync(ARTICLES_JSON)) die('_insights-build/articles.json nao encontrado.');
  const articles = JSON.parse(fs.readFileSync(ARTICLES_JSON, 'utf8'));

  const built = [];
  const skipped = [];

  articles.forEach(function (a) {
    const bodyFile = path.join(BODIES_DIR, a.slug + '.html');
    if (!fs.existsSync(bodyFile)) { skipped.push(a.slug); return; }

    let body = fs.readFileSync(bodyFile, 'utf8').trim();
    body = stripLeadingH1(body);
    body = sanitizeBodyLinks(body);
    const canonical = SITE + '/insights/' + a.slug + '/';
    const dateMod = a.dateModified || a.isoDate;

    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': a.title,
      'description': a.excerpt || '',
      'image': a.image ? [a.image] : undefined,
      'datePublished': a.isoDate,
      'dateModified': dateMod,
      'author': { '@type': 'Organization', 'name': a.author || 'FrameOn Lab', 'url': SITE },
      'publisher': {
        '@type': 'Organization',
        'name': 'FrameOn',
        'url': SITE,
        'logo': { '@type': 'ImageObject', 'url': SITE + '/insights/' }
      },
      'mainEntityOfPage': { '@type': 'WebPage', '@id': canonical },
      'inLanguage': 'pt-BR'
    };

    const head = [
      '<meta property="og:type" content="article"/>',
      '<meta property="og:title" content="' + escapeHtml(a.title) + '"/>',
      '<meta property="og:description" content="' + escapeHtml(a.excerpt || '') + '"/>',
      '<meta property="og:url" content="' + canonical + '"/>',
      a.image ? '<meta property="og:image" content="' + escapeHtml(a.image) + '"/>' : '',
      '<meta name="twitter:card" content="summary_large_image"/>',
      '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>'
    ].filter(Boolean).join(NL);

    const inner = [
      '<main class="article-wrap">',
      '  <a href="../" class="back-to-blog">&larr; Insights</a>',
      '  <article>',
      '  <header class="article-head">',
      '    <div class="article-date">' + escapeHtml(a.dateDisplay || '') + '</div>',
      '    <h1>' + escapeHtml(a.title) + '</h1>',
      a.excerpt ? '    <p class="article-desc">' + escapeHtml(a.excerpt) + '</p>' : '',
      '    <div class="article-author">Por ' + escapeHtml(a.author || 'FrameOn Lab') + '</div>',
      '  </header>',
      a.image ? '  <img class="article-cover" src="' + escapeHtml(a.image) + '" alt="' + escapeHtml(a.title) + '"/>' : '',
      '  <div class="article-body">',
      body,
      '  </div>',
      '  <footer class="article-foot"><a href="../" class="back-to-blog">&larr; Voltar para Insights</a></footer>',
      '  </article>',
      '</main>'
    ].filter(Boolean).join(NL);

    const page = pageShell({
      title: a.title + ' — FrameOn',
      description: a.excerpt || '',
      canonical: canonical,
      head: head,
      css: chrome.css,
      gtag: chrome.gtag,
      header: headerD2,
      footer: footerD2,
      behavior: chrome.behavior,
      i18n: '../../i18n.js',
      bodyInner: inner
    });

    const outDir = path.join(INSIGHTS_DIR, a.slug);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), page, 'utf8');
    built.push(a);
    console.log('  OK artigo: insights/' + a.slug + '/');
  });

  // ordena por data desc (isoDate)
  built.sort(function (x, y) { return (y.isoDate || '').localeCompare(x.isoDate || ''); });

  // ---- indice insights/index.html ----
  const cards = built.map(function (a) {
    return [
      '    <article class="post-card">',
      '      <a class="card-link" href="' + a.slug + '/">',
      a.image ? '        <div class="cover" style="background-image:url(' + JSON.stringify(a.image) + ')"></div>' : '',
      '        <div class="card-body">',
      '          <span class="card-date">' + escapeHtml(a.dateDisplay || '') + '</span>',
      '          <h2>' + escapeHtml(a.title) + '</h2>',
      '          <p>' + escapeHtml(a.excerpt || '') + '</p>',
      '          <span class="read-more">Ler artigo &rarr;</span>',
      '        </div>',
      '      </a>',
      '    </article>'
    ].filter(Boolean).join(NL);
  }).join(NL);

  const idxInner = [
    '<main class="blog-wrap">',
    '  <div class="blog-hero">',
    '    <span class="tag">Insights</span>',
    '    <h1 class="grad-text">Inteligência organizacional na prática</h1>',
    '    <p>Artigos, análises e perspectivas do FrameOn Lab.</p>',
    '  </div>',
    '  <div class="blog-grid">',
    built.length ? cards : '    <p style="color:var(--white-muted);text-align:center;grid-column:1/-1">Em breve, novos artigos.</p>',
    '  </div>',
    '</main>'
  ].join(NL);

  const idxLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    'name': 'Insights — FrameOn',
    'url': SITE + '/insights/',
    'inLanguage': 'pt-BR',
    'blogPost': built.map(function (a) {
      return {
        '@type': 'BlogPosting',
        'headline': a.title,
        'url': SITE + '/insights/' + a.slug + '/',
        'datePublished': a.isoDate,
        'image': a.image || undefined
      };
    })
  };

  const indexPage = pageShell({
    title: 'Insights — FrameOn',
    description: 'Artigos e análises do FrameOn Lab sobre inteligência organizacional, memória organizacional, governança estratégica e gestão de iniciativas.',
    canonical: SITE + '/insights/',
    head: '<script type="application/ld+json">' + JSON.stringify(idxLd) + '</script>',
    css: chrome.css,
    gtag: chrome.gtag,
    header: headerD1,
    footer: footerD1,
    behavior: chrome.behavior,
    i18n: '../i18n.js',
    bodyInner: idxInner
  });
  fs.writeFileSync(SRC_PAGE, indexPage, 'utf8');
  console.log('  OK indice: insights/index.html (embed do Soro removido)');

  // ---- sitemap.xml ----
  writeSitemap(built);

  console.log(NL + 'Concluido: ' + built.length + ' artigo(s) gerado(s).');
  if (skipped.length) {
    console.log('Pulados (faltando _insights-build/bodies/<slug>.html):');
    skipped.forEach(function (s) { console.log('  - ' + s); });
  }
}

function writeSitemap(built) {
  const urls = [];
  urls.push(url(SITE + '/', '2026-06-09', 'weekly', '1.0'));
  urls.push(url(SITE + '/insights/', '2026-06-09', 'weekly', '0.8'));
  built.forEach(function (a) {
    const d = (a.dateModified || a.isoDate || '').slice(0, 10);
    urls.push(url(SITE + '/insights/' + a.slug + '/', d, 'monthly', '0.7'));
  });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>' + NL +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + NL +
    urls.join(NL) + NL + '</urlset>' + NL;
  fs.writeFileSync(SITEMAP, xml, 'utf8');
  console.log('  OK sitemap.xml (' + (built.length + 2) + ' URLs)');

  function url(loc, lastmod, freq, prio) {
    return '  <url>' + NL +
      '    <loc>' + loc + '</loc>' + NL +
      '    <lastmod>' + lastmod + '</lastmod>' + NL +
      '    <changefreq>' + freq + '</changefreq>' + NL +
      '    <priority>' + prio + '</priority>' + NL +
      '  </url>';
  }
}

build();
