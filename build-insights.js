/* ============================================================================
 * FrameOn - Gerador estatico do Insights (zero dependencias) - MULTI-IDIOMA
 * ----------------------------------------------------------------------------
 * Substitui o embed do Soro por PAGINAS REAIS renderizadas no build, com o
 * texto completo no HTML inicial (visivel para crawlers de IA / busca).
 *
 * IDIOMAS:
 *   - pt (padrao) -> /insights/<slug>/        (e indice /insights/)
 *   - en          -> /en/insights/<slug>/     (e indice /en/insights/)
 *   - es          -> /es/insights/<slug>/     (e indice /es/insights/)
 *   Cada pagina recebe <html lang>, canonical proprio, hreflang para as outras
 *   versoes e JSON-LD Article com inLanguage.
 *
 * FONTES (em _insights-build/):
 *   - articles.json                      -> metadados PT (base).
 *   - bodies/<slug>.html                 -> corpo PT (Copy as HTML do Soro).
 *   - i18n/<lang>/articles.json          -> overrides de title/excerpt/dateDisplay.
 *   - i18n/<lang>/bodies/<slug>.html     -> corpo traduzido.
 *   Um artigo so e gerado num idioma se existir o arquivo de corpo daquele idioma.
 *
 * USO:  node build-insights.js
 * ========================================================================== */

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC_PAGE = path.join(ROOT, 'insights', 'index.html');
const BUILD_DIR = path.join(ROOT, '_insights-build');
const BODIES_DIR = path.join(BUILD_DIR, 'bodies');
const ARTICLES_JSON = path.join(BUILD_DIR, 'articles.json');
const I18N_DIR = path.join(BUILD_DIR, 'i18n');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const SITE = 'https://frameonlab.ai';
const NL = String.fromCharCode(10);

const LANGS = [
  {
    code: 'pt', htmlLang: 'pt-BR', hreflang: 'pt-BR', outBase: 'insights', isDefault: true,
    heroTitle: 'Inteligência organizacional na prática',
    heroSub: 'Artigos, análises e perspectivas do FrameOn Lab.',
    backFull: 'Voltar para Insights', by: 'Por',
    indexTitle: 'Insights — FrameOn',
    indexDesc: 'Artigos e análises do FrameOn Lab sobre inteligência organizacional, memória organizacional, governança estratégica e gestão de iniciativas.',
    emptyMsg: 'Em breve, novos artigos.', readMore: 'Ler artigo'
  },
  {
    code: 'en', htmlLang: 'en', hreflang: 'en', outBase: 'en/insights',
    heroTitle: 'Organizational intelligence in practice',
    heroSub: 'Articles, analysis and perspectives from FrameOn Lab.',
    backFull: 'Back to Insights', by: 'By',
    indexTitle: 'Insights — FrameOn',
    indexDesc: 'Articles and analysis from FrameOn Lab on organizational intelligence, organizational memory, strategic governance and initiative management.',
    emptyMsg: 'New articles coming soon.', readMore: 'Read article'
  },
  {
    code: 'es', htmlLang: 'es', hreflang: 'es', outBase: 'es/insights',
    heroTitle: 'Inteligencia organizacional en la práctica',
    heroSub: 'Artículos, análisis y perspectivas de FrameOn Lab.',
    backFull: 'Volver a Insights', by: 'Por',
    indexTitle: 'Insights — FrameOn',
    indexDesc: 'Artículos y análisis de FrameOn Lab sobre inteligencia organizacional, memoria organizacional, gobernanza estratégica y gestión de iniciativas.',
    emptyMsg: 'Pronto, nuevos artículos.', readMore: 'Leer artículo'
  }
];

function die(msg) { console.error('ERRO: ' + msg); process.exit(1); }
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* -------------------------------------------------------------------------- */
/* 1. "Mobiliario" (extraido de insights/index.html, profundidade 1)          */
/* -------------------------------------------------------------------------- */
function extractChrome() {
  if (!fs.existsSync(SRC_PAGE)) die('insights/index.html nao encontrado em ' + SRC_PAGE);
  const html = fs.readFileSync(SRC_PAGE, 'utf8');

  const styleStart = html.indexOf('<style>');
  const styleEnd = html.indexOf('</style>', styleStart);
  if (styleStart === -1 || styleEnd === -1) die('bloco <style> principal nao encontrado.');
  const css = html.slice(styleStart + 7, styleEnd).replace(/#soro-blog[^{]*\{[^}]*\}/g, '');

  let gtag = '';
  const gStart = html.indexOf('<script async src="https://www.googletagmanager.com/gtag/js');
  if (gStart !== -1) {
    const firstEnd = html.indexOf('</script>', gStart);
    const secondEnd = html.indexOf('</script>', firstEnd + 1);
    if (secondEnd !== -1) gtag = html.slice(gStart, secondEnd + 9);
  }

  const navStart = html.indexOf('<nav id="main-nav">');
  const mainStart = html.indexOf('<main', navStart);
  if (navStart === -1 || mainStart === -1) die('nav/main nao encontrados.');
  const header = html.slice(navStart, mainStart);

  const footerStart = html.indexOf('<footer');
  const footerEnd = html.indexOf('</footer>');
  if (footerStart === -1 || footerEnd === -1) die('footer nao encontrado.');
  const footer = html.slice(footerStart, footerEnd + 9);

  let behavior = '';
  const reScript = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = reScript.exec(html)) !== null) {
    if (m.index > footerEnd && !/\bsrc=/.test(m[1])) { behavior = m[0]; break; }
  }

  return { css: css, gtag: gtag, header: header, footer: footer, behavior: behavior };
}

// Re-aponta os caminhos do chrome (que vem em profundidade 1) para a profundidade
// real da pagina. depth = niveis ate a raiz. isIndex = true nas paginas de indice.
function retarget(chromeHtml, depth, isIndex) {
  const rootPrefix = '../'.repeat(depth);
  let out = chromeHtml.replace(/(href|src)="\.\.\//g, '$1="' + rootPrefix);
  if (!isIndex) out = out.replace(/href="index\.html"/g, 'href="../index.html"');
  return out;
}

/* -------------------------------------------------------------------------- */
/* 2. CSS extra (cards + corpo do artigo)                                      */
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
/* 3. Shell                                                                    */
/* -------------------------------------------------------------------------- */
function pageShell(o) {
  // dica de idioma p/ o i18n.js (so em paginas nao-PT): se o usuario ainda nao
  // escolheu idioma, abre na lingua da pagina. Crawlers ignoram (e ok: o conteudo
  // estatico ja esta no idioma certo).
  const langHint = (o.htmlLang === 'pt-BR') ? '' :
    '<script>try{if(!localStorage.getItem("fo_lang"))localStorage.setItem("fo_lang","' + o.htmlLang + '")}catch(e){}</script>';
  return [
    '<!DOCTYPE html>',
    '<html lang="' + o.htmlLang + '">',
    '<head>',
    o.gtag,
    '<meta charset="UTF-8"/>',
    '<meta name="viewport" content="width=device-width,initial-scale=1.0"/>',
    '<title>' + escapeHtml(o.title) + '</title>',
    '<meta name="description" content="' + escapeHtml(o.description || '') + '"/>',
    '<link rel="canonical" href="' + o.canonical + '"/>',
    o.alternates || '',
    o.head || '',
    FONT_LINKS,
    langHint,
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
  ].filter(function (x) { return x !== ''; }).join(NL);
}

function stripLeadingH1(body) {
  return body.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '');
}

// corrige links internos herdados do embed do Soro
function sanitizeBodyLinks(body) {
  return body
    .replace(/https?:\/\/frameonlab\.ai\/insights\/\?post=([a-z0-9-]+)\/?/gi, SITE + '/insights/$1/')
    .replace(/(href=")https?:\/\/frameonlab\.ai\/(empresa|plataforma|privacidade|termos)(")/gi, '$1' + SITE + '/$2.html$3');
}

/* -------------------------------------------------------------------------- */
/* 4. Carregar metadados/corpos por idioma                                     */
/* -------------------------------------------------------------------------- */
function readJsonIf(p) { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }

function loadLangMeta(baseArticles, langCode) {
  if (langCode === 'pt') return baseArticles.map(function (a) { return Object.assign({}, a); });
  const ov = readJsonIf(path.join(I18N_DIR, langCode, 'articles.json')) || [];
  const bySlug = {};
  ov.forEach(function (o) { bySlug[o.slug] = o; });
  return baseArticles.map(function (a) { return Object.assign({}, a, bySlug[a.slug] || {}); });
}

function bodyPathFor(slug, langCode) {
  return langCode === 'pt'
    ? path.join(BODIES_DIR, slug + '.html')
    : path.join(I18N_DIR, langCode, 'bodies', slug + '.html');
}

// quais idiomas tem corpo para um dado slug (para hreflang)
function langsForSlug(slug) {
  return LANGS.filter(function (L) { return fs.existsSync(bodyPathFor(slug, L.code)); });
}

function urlFor(slug, langCode) {
  const base = LANGS.find(function (L) { return L.code === langCode; }).outBase;
  return SITE + '/' + base + '/' + slug + '/';
}

function alternatesFor(slug, selfLangCode) {
  const present = langsForSlug(slug);
  if (present.length < 2) return '';
  const links = present.map(function (L) {
    return '<link rel="alternate" hreflang="' + L.hreflang + '" href="' + urlFor(slug, L.code) + '"/>';
  });
  const def = present.find(function (L) { return L.isDefault; }) || present[0];
  links.push('<link rel="alternate" hreflang="x-default" href="' + urlFor(slug, def.code) + '"/>');
  return links.join(NL);
}

/* -------------------------------------------------------------------------- */
/* 5. Build                                                                    */
/* -------------------------------------------------------------------------- */
function build() {
  const chrome = extractChrome();
  if (!fs.existsSync(ARTICLES_JSON)) die('_insights-build/articles.json nao encontrado.');
  const baseArticles = JSON.parse(fs.readFileSync(ARTICLES_JSON, 'utf8'));

  const sitemapEntries = []; // {loc, lastmod, slug|null, isIndex}
  const summary = [];

  LANGS.forEach(function (L) {
    const depthIndex = L.isDefault ? 1 : 2;
    const depthArticle = L.isDefault ? 2 : 3;
    const headerIdx = retarget(chrome.header, depthIndex, true);
    const footerIdx = retarget(chrome.footer, depthIndex, true);
    const headerArt = retarget(chrome.header, depthArticle, false);
    const footerArt = retarget(chrome.footer, depthArticle, false);
    const i18nIdx = '../'.repeat(depthIndex) + 'i18n.js';
    const i18nArt = '../'.repeat(depthArticle) + 'i18n.js';
    const outDirBase = path.join(ROOT, L.outBase.replace('/', path.sep));

    const meta = loadLangMeta(baseArticles, L.code);
    const built = [];

    meta.forEach(function (a) {
      const bf = bodyPathFor(a.slug, L.code);
      if (!fs.existsSync(bf)) return; // sem traducao -> pula nesse idioma
      let body = fs.readFileSync(bf, 'utf8').trim();
      body = stripLeadingH1(body);
      body = sanitizeBodyLinks(body);

      const canonical = urlFor(a.slug, L.code);
      const dateMod = a.dateModified || a.isoDate;
      const alternates = alternatesFor(a.slug, L.code);

      const ld = {
        '@context': 'https://schema.org', '@type': 'Article',
        'headline': a.title, 'description': a.excerpt || '',
        'image': a.image ? [a.image] : undefined,
        'datePublished': a.isoDate, 'dateModified': dateMod,
        'author': { '@type': 'Organization', 'name': a.author || 'FrameOn Lab', 'url': SITE },
        'publisher': { '@type': 'Organization', 'name': 'FrameOn', 'url': SITE, 'logo': { '@type': 'ImageObject', 'url': SITE + '/insights/' } },
        'mainEntityOfPage': { '@type': 'WebPage', '@id': canonical },
        'inLanguage': L.htmlLang
      };
      const head = [
        '<meta property="og:type" content="article"/>',
        '<meta property="og:title" content="' + escapeHtml(a.title) + '"/>',
        '<meta property="og:description" content="' + escapeHtml(a.excerpt || '') + '"/>',
        '<meta property="og:url" content="' + canonical + '"/>',
        '<meta property="og:locale" content="' + (L.code === 'pt' ? 'pt_BR' : L.code === 'es' ? 'es_ES' : 'en_US') + '"/>',
        a.image ? '<meta property="og:image" content="' + escapeHtml(a.image) + '"/>' : '',
        '<meta name="twitter:card" content="summary_large_image"/>',
        '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>'
      ].filter(Boolean).join(NL);

      const inner = [
        '<main class="article-wrap">',
        '  <a href="../" class="back-to-blog">&larr; ' + escapeHtml(L.backFull.indexOf('Insights') !== -1 ? 'Insights' : 'Insights') + '</a>',
        '  <article>',
        '  <header class="article-head">',
        '    <div class="article-date">' + escapeHtml(a.dateDisplay || '') + '</div>',
        '    <h1>' + escapeHtml(a.title) + '</h1>',
        a.excerpt ? '    <p class="article-desc">' + escapeHtml(a.excerpt) + '</p>' : '',
        '    <div class="article-author">' + escapeHtml(L.by) + ' ' + escapeHtml(a.author || 'FrameOn Lab') + '</div>',
        '  </header>',
        a.image ? '  <img class="article-cover" src="' + escapeHtml(a.image) + '" alt="' + escapeHtml(a.title) + '"/>' : '',
        '  <div class="article-body">',
        body,
        '  </div>',
        '  <footer class="article-foot"><a href="../" class="back-to-blog">&larr; ' + escapeHtml(L.backFull) + '</a></footer>',
        '  </article>',
        '</main>'
      ].filter(Boolean).join(NL);

      const page = pageShell({
        htmlLang: L.htmlLang, title: a.title + ' — FrameOn', description: a.excerpt || '',
        canonical: canonical, alternates: alternates, head: head,
        css: chrome.css, gtag: chrome.gtag, header: headerArt, footer: footerArt,
        behavior: chrome.behavior, i18n: i18nArt, bodyInner: inner
      });
      const outDir = path.join(outDirBase, a.slug);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'index.html'), page, 'utf8');
      built.push(a);
      sitemapEntries.push({ loc: canonical, lastmod: (dateMod || '').slice(0, 10), slug: a.slug });
    });

    built.sort(function (x, y) { return (y.isoDate || '').localeCompare(x.isoDate || ''); });

    // ---- indice do idioma ----
    const cards = built.map(function (a) {
      return [
        '    <article class="post-card">',
        '      <a class="card-link" href="' + a.slug + '/">',
        a.image ? '        <div class="cover" style="background-image:url(&#39;' + escapeHtml(a.image) + '&#39;)"></div>' : '',
        '        <div class="card-body">',
        '          <span class="card-date">' + escapeHtml(a.dateDisplay || '') + '</span>',
        '          <h2>' + escapeHtml(a.title) + '</h2>',
        '          <p>' + escapeHtml(a.excerpt || '') + '</p>',
        '          <span class="read-more">' + escapeHtml(L.readMore) + ' &rarr;</span>',
        '        </div>',
        '      </a>',
        '    </article>'
      ].filter(Boolean).join(NL);
    }).join(NL);

    const idxInner = [
      '<main class="blog-wrap">',
      '  <div class="blog-hero">',
      '    <span class="tag">Insights</span>',
      '    <h1 class="grad-text">' + escapeHtml(L.heroTitle) + '</h1>',
      '    <p>' + escapeHtml(L.heroSub) + '</p>',
      '  </div>',
      '  <div class="blog-grid">',
      built.length ? cards : '    <p style="color:var(--white-muted);text-align:center;grid-column:1/-1">' + escapeHtml(L.emptyMsg) + '</p>',
      '  </div>',
      '</main>'
    ].join(NL);

    const idxCanonical = SITE + '/' + L.outBase + '/';
    // hreflang dos indices (todos os idiomas tem indice)
    const idxAlt = LANGS.map(function (X) {
      return '<link rel="alternate" hreflang="' + X.hreflang + '" href="' + SITE + '/' + X.outBase + '/"/>';
    }).concat(['<link rel="alternate" hreflang="x-default" href="' + SITE + '/insights/"/>']).join(NL);

    const idxLd = {
      '@context': 'https://schema.org', '@type': 'Blog', 'name': 'Insights — FrameOn',
      'url': idxCanonical, 'inLanguage': L.htmlLang,
      'blogPost': built.map(function (a) {
        return { '@type': 'BlogPosting', 'headline': a.title, 'url': urlFor(a.slug, L.code), 'datePublished': a.isoDate, 'image': a.image || undefined };
      })
    };

    const indexPage = pageShell({
      htmlLang: L.htmlLang, title: L.indexTitle, description: L.indexDesc,
      canonical: idxCanonical, alternates: idxAlt,
      head: '<script type="application/ld+json">' + JSON.stringify(idxLd) + '</script>',
      css: chrome.css, gtag: chrome.gtag, header: headerIdx, footer: footerIdx,
      behavior: chrome.behavior, i18n: i18nIdx, bodyInner: idxInner
    });
    fs.mkdirSync(outDirBase, { recursive: true });
    fs.writeFileSync(path.join(outDirBase, 'index.html'), indexPage, 'utf8');
    sitemapEntries.push({ loc: idxCanonical, lastmod: '2026-06-09', isIndex: true });

    summary.push({ code: L.code, n: built.length });
    console.log('  [' + L.code + '] ' + built.length + ' artigo(s) -> /' + L.outBase + '/');
  });

  writeSitemap(sitemapEntries);
  console.log(NL + 'Concluido: ' + summary.map(function (s) { return s.code + '=' + s.n; }).join(', '));
}

function writeSitemap(entries) {
  const NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';
  const out = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="' + NS + '" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
  // home
  out.push(urlBlock(SITE + '/', '2026-06-09', 'weekly', '1.0', null));
  entries.forEach(function (e) {
    const prio = e.isIndex ? '0.8' : '0.7';
    const freq = e.isIndex ? 'weekly' : 'monthly';
    // alternates por artigo (hreflang no sitemap)
    let alts = null;
    if (e.slug) {
      const present = langsForSlug(e.slug);
      if (present.length > 1) {
        alts = present.map(function (L) {
          return '    <xhtml:link rel="alternate" hreflang="' + L.hreflang + '" href="' + urlFor(e.slug, L.code) + '"/>';
        }).join(NL);
      }
    }
    out.push(urlBlock(e.loc, e.lastmod || '2026-06-09', freq, prio, alts));
  });
  out.push('</urlset>');
  fs.writeFileSync(SITEMAP, out.join(NL) + NL, 'utf8');
  console.log('  OK sitemap.xml (' + (entries.length + 1) + ' URLs)');

  function urlBlock(loc, lastmod, freq, prio, alts) {
    return '  <url>' + NL + '    <loc>' + loc + '</loc>' + NL +
      (alts ? alts + NL : '') +
      '    <lastmod>' + lastmod + '</lastmod>' + NL +
      '    <changefreq>' + freq + '</changefreq>' + NL +
      '    <priority>' + prio + '</priority>' + NL + '  </url>';
  }
}

build();
