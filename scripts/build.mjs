import { readFile, writeFile, readdir, mkdir, rm, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateTranslation, validateUI, validateUISource, localizePerson, formatMessage } from './i18n-core.mjs';
import { escapeHtml as e, yearOf, lifeStatus, timelineOrder, safeUrl } from './utils.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const baseTaxonomy = await json('data/taxonomy.json');
const localeConfig = await json('data/i18n/locales.json');
const locales = localeConfig.locales.filter(l=>l.enabled);
const sourceLocale=localeConfig.source??localeConfig.default;
const baseUI = await json(`data/i18n/${sourceLocale}/ui.json`);
const siteUrl=process.env.SITE_URL;
const siteBase=siteUrl?new URL(siteUrl.endsWith('/')?siteUrl:`${siteUrl}/`):null;
if(siteBase&&!['http:','https:'].includes(siteBase.protocol))throw new Error('SITE_URL must be HTTP(S)');
const candidates = await json('data/candidates.json');
const filenames = (await readdir(path.join(root, 'data/people'))).filter(x => x.endsWith('.json'));
const profiles = await Promise.all(filenames.map(async file => {
  const person = await json(`data/people/${file}`);
  lifeStatus(person); // Reject missing status before generating any pages.
  person.image = await json(`data/images/${person.id}.json`);
  return person;
}));
const featured = ['elon-musk','jensen-huang','mark-zuckerberg','larry-page','albert-einstein','marie-curie','donald-trump','vladimir-putin','emmanuel-macron','tu-youyou','leonardo-da-vinci','frida-kahlo','nelson-mandela','ada-lovelace','warren-buffett','jack-ma','confucius','rabindranath-tagore','lu-xun','charlie-chaplin','michael-jackson','michael-jordan','serena-williams','yuri-gagarin'];
profiles.sort((a,b) => featured.indexOf(a.id) - featured.indexOf(b.id));
function createViews(locale,ui,profiles,taxonomy) {
const byId = new Map(profiles.map(p => [p.id, p]));
const label = (group, id) => taxonomy[group].find(x => x.id === id)?.label ?? id;
const shortDomain = id => taxonomy.domains.find(x => x.id === id)?.short ?? id;
const external = (url, text, cls = '') => `<a class="${e(cls)}" href="${e(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${e(text)}</a>`;
const planet = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="13" stroke="currentColor" stroke-width="1.5"/><ellipse cx="24" cy="24" rx="23" ry="7" transform="rotate(-35 24 24)" stroke="currentColor" stroke-width="1.5"/><circle cx="40" cy="10" r="2.4" fill="currentColor"/></svg>`;
const arrow = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" stroke-width="1.4"/></svg>`;
const searchIcon = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="m16 16 5 5" stroke="currentColor" stroke-width="1.5"/></svg>`;

const t=(key,params={})=>e(formatMessage(ui[key],params));
const localeRoot=id=>id===localeConfig.default?'':`${id}/`;
const assets=prefix=>`${prefix}${locale.id===localeConfig.default?'':'../'}`;
const number=new Intl.NumberFormat(locale.lang,{useGrouping:false});
const yearLabel=value=>yearOf(value)<0?formatMessage(ui['date.bce'],{year:number.format(Math.abs(yearOf(value)))}):number.format(yearOf(value));
const lifeLabel=person=>`${yearLabel(person.birth)} — ${person.death?yearLabel(person.death):ui['date.present']}`;
const dateLabel=value=>{
  if(value.startsWith('-'))return yearLabel(value);
  const parts=value.split('-').map(Number);
  if(parts.length===1)return formatMessage(ui['date.year'],{year:number.format(parts[0])});
  const date=new Date(0);date.setUTCFullYear(parts[0],parts[1]-1,parts[2]??1);date.setUTCHours(0,0,0,0);
  return new Intl.DateTimeFormat(locale.lang,{year:'numeric',month:'short',...(parts.length===3?{day:'numeric'}:{}),timeZone:'UTC'}).format(date);
};
function alternateHref(target,pagePath) {
  const from=path.posix.dirname(`${localeRoot(locale.id)}${pagePath}`);
  return path.posix.relative(from,`${localeRoot(target)}${pagePath}`)||path.posix.basename(pagePath);
}
function languageMenu(pagePath) {
  return `<details class="language-switcher"><summary aria-label="${t('nav.language')}"><span aria-hidden="true">◎</span> <bdi>${e(locale.name)}</bdi> <span aria-hidden="true">⌄</span></summary><nav class="language-options" aria-label="${t('nav.language')}">${locales.map(l=>`<a href="${e(alternateHref(l.id,pagePath))}" hreflang="${e(l.lang)}" lang="${e(l.lang)}" dir="${l.dir}" data-language="${l.id}"${l.id===locale.id?' aria-current="true"':''}><bdi>${e(l.name)}</bdi>${l.id===locale.id?' <span aria-hidden="true">✓</span>':''}</a>`).join('')}</nav></details>`;
}

function layout({title, description, body, active = '', prefix = '', script = false, jsonld = null, pageClass = '', pagePath = 'index.html'}) {
  return `<!doctype html>
<html lang="${e(locale.lang)}" dir="${locale.dir}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${e(title)} · Big Names on This Planet</title><meta name="description" content="${e(description)}"><meta property="og:type" content="website">${locales.map(l=>`<link rel="alternate" hreflang="${e(l.lang)}" href="${e(siteBase?new URL(`${localeRoot(l.id)}${pagePath}`,siteBase).href:alternateHref(l.id,pagePath))}">`).join('')}<link rel="alternate" hreflang="x-default" href="${e(siteBase?new URL(`${localeRoot(localeConfig.default)}${pagePath}`,siteBase).href:alternateHref(localeConfig.default,pagePath))}">${siteBase?`<link rel="canonical" href="${e(new URL(`${localeRoot(locale.id)}${pagePath}`,siteBase).href)}">`:''}<meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><link rel="icon" href="${assets(prefix)}assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${assets(prefix)}assets/site.css">${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replaceAll('<','\\u003c')}</script>` : ''}</head>
<body class="${e(pageClass)}"><a class="skip-link" href="#main">${t('nav.skip')}</a>
<header class="site-header"><div class="header-inner"><a class="brand" href="${prefix}index.html" aria-label="Big Names on This Planet ${t('nav.home')}"><span class="brand-icon">${planet}</span><span class="brand-text">BIG NAMES<span>ON THIS PLANET / ${t('site.title')}</span></span></a><nav class="main-nav" aria-label="${t('nav.main')}">${[['index.html',ui['nav.index'],'index'],['candidates.html',ui['nav.candidates'],'candidates'],['about.html',ui['nav.about'],'about']].map(([url,text,key]) => `<a href="${prefix}${url}"${active === key ? ' class="active" aria-current="page"' : ''}>${e(text)}</a>`).join('')}</nav><span class="edition"><i></i> ${t('site.edition')}</span>${languageMenu(pagePath)}</div></header>
<main id="main">${body}</main>
<footer class="site-footer"><div class="footer-inner"><div><a class="brand" href="${prefix}index.html"><span class="brand-icon">${planet}</span><span class="brand-text">BIG NAMES<span>${t('footer.tagline')}</span></span></a><p>${t('footer.note')}</p></div><div class="footer-links"><a href="${prefix}about.html">${t('footer.principles')}</a><a href="${prefix}credits.html">${t('nav.credits')}</a><a href="${prefix}candidates.html">${t('footer.next')}</a><span>${t('footer.edition')}</span></div></div></footer>
<script src="${assets(prefix)}assets/locales/${locale.id}.js" defer></script>${script ? `<script src="${assets(prefix)}assets/${locale.id===localeConfig.default?'people-index.js':`indexes/${locale.id}.js`}" defer></script>` : ''}<script src="${assets(prefix)}assets/site.js" defer></script></body></html>`;
}

function picture(p, prefix = '', eager = false, extra = '') {
  return `<img class="person-portrait" data-life-status="${lifeStatus(p)}" src="${assets(prefix)}${e(p.image.src)}" alt="${t(p.image.kind==='photo'?'image.altPhoto':'image.altArtwork',{name:p.name})}" width="600" height="680" loading="${eager ? 'eager' : 'lazy'}" decoding="async" style="object-position:${e(p.image.position ?? '50% 25%')}" ${extra}>`;
}
function card(p, index) {
  return `<article class="person-card" data-id="${e(p.id)}"><a class="card-link" href="people/${e(p.id)}/index.html"><div class="card-image">${picture(p, '', index < 6)}<span class="card-domain">${e(shortDomain(p.domains[0]))}</span>${p.image.kind !== 'photo' ? `<span class="image-kind">${t('image.historical')}</span>` : ''}</div><div class="card-body"><div class="card-kicker"><span>${e(lifeLabel(p))}</span><span class="card-arrow">${arrow}</span></div><h3>${e(p.name)}${p.name!==p.enName?`<span class="en-name" lang="en" dir="ltr">${e(p.enName)}</span>`:''}</h3><p class="card-role">${e(p.role)}</p><div class="card-tags">${p.tags.slice(0,2).map(t => `<span>${e(t)}</span>`).join('')}</div></div></a></article>`;
}
function heroPortrait(id, index, caption) {
  const p = byId.get(id);
  if (!p) return '';
  return `<a class="hero-portrait hero-portrait-${index}" href="people/${id}/index.html" aria-label="${t('hero.read',{name:p.name})}">${picture(p,'',true)}<span class="portrait-caption"><b>${e(caption)}</b><small>${e(p.enName)}</small></span></a>`;
}
function indexPage() {
  const body = `<div class="container"><section class="hero" aria-labelledby="hero-title"><div class="hero-copy"><p class="eyebrow"><span class="tiny-line"></span> ${t('hero.eyebrow')}</p><h1 id="hero-title">${t('hero.titleBefore')}<br><em>${t('hero.titleEmphasis')}</em>${t('hero.titleAfter')}</h1><p class="hero-description">${t('hero.description1')}<br>${t('hero.description2')}</p><div class="hero-meta"><span><strong>${profiles.length.toString().padStart(2,'0')}</strong> ${t('hero.profiles')}</span><span><strong>08</strong> ${t('hero.domains')}</span><span><strong>2,500+</strong> ${t('hero.years')}</span></div></div><div class="hero-art" aria-label="${t('hero.featured')}"><span class="hero-orbit" aria-hidden="true"></span><span class="hero-art-label">${t('hero.artLabel1')}<br>${t('hero.artLabel2')}</span>${heroPortrait('albert-einstein',1,ui['hero.einstein'])}${heroPortrait('marie-curie',2,ui['hero.curie'])}${heroPortrait('elon-musk',3,ui['hero.musk'])}<span class="hero-art-index">${t('hero.artIndex')}</span></div></section><div class="hero-bottom"><span>${t('hero.bottom')}</span><a href="#explore">${t('hero.explore')} <span aria-hidden="true">↓</span></a></div>
<section id="explore" class="explore-section" aria-labelledby="explore-title"><div class="explore-heading"><div><p class="eyebrow">${t('explore.eyebrow')}</p><h2 id="explore-title">${t('explore.title')}</h2><p>${t('explore.description')}</p></div><div class="search-wrap">${searchIcon}<label class="sr-only" for="search">${t('search.label')}</label><input id="search" type="search" placeholder="${t('search.placeholder')}" autocomplete="off"><kbd aria-hidden="true">/</kbd></div></div>
<div class="browse-layout"><aside class="filters" aria-label="${t('filter.label')}"><div class="filter-heading"><h3>${t('filter.browse')}</h3><button id="clear-filters" type="button">${t('filter.reset')}</button></div><div class="filter-group"><p class="filter-title">${t('filter.domain')}</p><div id="domain-filters"><button class="filter-option active" type="button" data-domain="all" aria-pressed="true"><span class="filter-label">${t('filter.allDomains')}</span><span class="filter-count">${profiles.length}</span></button>${taxonomy.domains.map(d => `<button class="filter-option" type="button" data-domain="${d.id}" aria-pressed="false"><span class="filter-label">${e(d.label)}</span><span class="filter-count">${profiles.filter(p=>p.domains.includes(d.id)).length}</span></button>`).join('')}</div></div><div class="filter-group"><label class="filter-title" for="era-filter">${t('filter.era')}</label><select id="era-filter"><option value="all">${t('filter.allEras')}</option>${taxonomy.eras.map(d=>`<option value="${d.id}">${e(d.label)}</option>`).join('')}</select></div><div class="filter-group"><label class="filter-title" for="region-filter">${t('filter.region')}</label><select id="region-filter"><option value="all">${t('filter.allRegions')}</option>${taxonomy.regions.map(d=>`<option value="${d.id}">${e(d.label)}</option>`).join('')}</select></div><p class="filter-note">${t('filter.note1')}<br>${t('filter.note2')}</p><a class="plan-link" href="candidates.html">${t('filter.next')} ${arrow}</a></aside>
<div class="results-area"><div class="results-toolbar"><p id="result-count" role="status" aria-live="polite">${t('results.total',{count:profiles.length})}</p><label class="sort-label" for="sort">${t('sort.label')} <select id="sort"><option value="featured">${t('sort.featured')}</option><option value="name">${t('sort.name')}</option><option value="birth">${t('sort.birth')}</option></select></label></div><div id="active-filters" class="active-filters" aria-label="${t('filter.selected')}"></div><div id="people-grid" class="people-grid">${profiles.map(card).join('')}</div><div id="empty-state" class="empty-state" hidden><span class="empty-symbol" aria-hidden="true">◎</span><h3>${t('empty.title')}</h3><p>${t('empty.description')}</p><button id="reset-empty" type="button" class="primary-button">${t('empty.reset')}</button><a href="candidates.html">${t('empty.candidates')} →</a></div><nav id="pagination" class="pagination" aria-label="${t('pagination.label')}"></nav><p id="results-summary" class="results-summary">${t('results.initial',{count:profiles.length})}</p><noscript><p>${t('noscript')}</p></noscript></div></div></section>
<section class="collection-note"><span class="eyebrow">${t('collection.eyebrow')}</span><h2>${t('collection.title')}</h2><p>${t('collection.description1',{count:profiles.length,total:candidates.length})}<br>${t('collection.description2')}</p><a href="candidates.html">${t('collection.link')} <span aria-hidden="true">↗</span></a></section></div>`;
  return layout({title:ui['site.title'],description:ui['site.description'],body,active:'index',script:true,pageClass:'index-page'});
}
function sourceLinks(p, ids) {
  return `<span class="source-links">${(ids ?? []).map(id=> {
    const s=p.sources.find(x=>x.id===id); if(!s)return '';
    return external(s.url,`[${p.sources.indexOf(s)+1}]`,'source-inline');
  }).join(' ')}</span>`;
}
function profilePage(p,index) {
  const prefix='../../';
  const tags=[...p.domains.map(id=>({text:label('domains',id),url:`domain=${id}`})),...p.tags.map((tag,i)=>({text:tag,url:`tag=${encodeURIComponent(p.tagIds[i])}`}))];
  const related=profiles.filter(x=>x.id!==p.id).sort((a,b)=> b.domains.filter(d=>p.domains.includes(d)).length-a.domains.filter(d=>p.domains.includes(d)).length).slice(0,3);
  const body=`<div class="container profile-container"><nav class="breadcrumb" aria-label="${t('nav.breadcrumb')}"><a href="${prefix}index.html#explore">${t('nav.index')}</a><span aria-hidden="true">/</span><a href="${prefix}index.html?domain=${p.domains[0]}#explore">${e(label('domains',p.domains[0]))}</a><span aria-hidden="true">/</span><span>${e(p.name)}</span></nav><div class="profile-layout"><aside class="profile-sidebar"><figure class="profile-photo">${picture(p,prefix,true)}${p.image.kind!=='photo'?`<figcaption class="image-kind-note">${t('image.historicalNote')}</figcaption>`:''}</figure><p class="photo-credit">${e(p.image.credit)}<br>${external(p.image.licenseUrl,p.image.license)} · ${external(p.image.sourceUrl,`${ui['image.source']} ↗`)}<br><span>${t(lifeStatus(p) === 'deceased' ? 'image.deceasedTreatment' : 'image.livingTreatment')}</span></p><dl class="profile-facts"><dt>${t('profile.lifespan')}</dt><dd>${e(lifeLabel(p))}</dd><dt>${t('profile.country')}</dt><dd>${e(p.country)}</dd><dt>${t('profile.eras')}</dt><dd>${p.eras.map(id=>e(label('eras',id))).join('<br>')}</dd><dt>${t('profile.regions')}</dt><dd>${p.regions.map(id=>e(label('regions',id))).join(' / ')}</dd>${p.facts.map(f=>`<dt>${e(f.label)}</dt><dd>${e(f.value)}</dd>`).join('')}</dl><div class="profile-actions"><button id="print-profile" type="button">${t('profile.print')} <span aria-hidden="true">↗</span></button><button id="copy-link" type="button">${t('profile.copy')} <span aria-hidden="true">↗</span></button><span id="copy-status" role="status" aria-live="polite"></span></div></aside><article class="profile-main"><header class="profile-heading"><p class="eyebrow">${t('profile.eyebrow',{number:String(index+1).padStart(3,'0')})}</p><h1>${e(p.name)}</h1>${p.name!==p.enName?`<p class="profile-english" lang="en" dir="ltr">${e(p.enName)}</p>`:''}<p class="profile-role">${e(p.role)}</p><div class="profile-tags">${tags.map(t=>`<a href="${prefix}index.html?${e(t.url)}#explore">${e(t.text)}</a>`).join('')}</div></header><section class="profile-section" aria-labelledby="overview"><h2 id="overview"><span class="section-number">01</span> ${t('profile.overview')}</h2><p class="profile-summary">${e(p.summary)}</p></section><section class="profile-section" aria-labelledby="achievements"><h2 id="achievements"><span class="section-number">02</span> ${t('profile.achievements')}</h2><div class="achievement-grid">${p.highlights.map(h=>`<div class="achievement"><h3>${e(h.title)}</h3><p>${e(h.text)} ${sourceLinks(p,h.sourceIds)}</p></div>`).join('')}</div></section><section class="profile-section" aria-labelledby="timeline-title"><h2 id="timeline-title"><span class="section-number">03</span> ${t('profile.timeline')} <small>${t('profile.reverse')}</small></h2><ol class="timeline">${p.timeline.map(t=>`<li class="timeline-item"><div class="timeline-date">${e(t.dateLabel??dateLabel(t.date))}</div><div class="timeline-content"><h3>${e(t.title)}</h3><p>${e(t.text)} ${sourceLinks(p,t.sourceIds)}</p></div></li>`).join('')}</ol></section><section class="profile-section sources-list" aria-labelledby="sources-title"><h2 id="sources-title"><span class="section-number">04</span> ${t('profile.sources')}</h2><ol>${p.sources.map(s=>`<li id="source-${e(s.id)}">${external(s.url,`${s.title} ↗`)}<span class="source-publisher">${e(s.publisher)}</span></li>`).join('')}</ol><div class="profile-note"><p>${t('profile.verified',{date:p.verifiedAt,count:p.timeline.length})}</p><p>${e(p.coverageNote)}</p><a href="${prefix}about.html">${t('profile.principles')} →</a></div></section></article></div><section class="related-section"><div class="section-heading"><p class="eyebrow">${t('profile.relatedEyebrow')}</p><h2>${t('profile.relatedTitle')}</h2></div><div class="related-grid">${related.map(x=>`<a class="related-card" href="../${x.id}/index.html"><span>${e(shortDomain(x.domains[0]))} / ${e(lifeLabel(x))}</span><h3>${e(x.name)}</h3><p lang="en">${e(x.enName)}</p>${arrow}</a>`).join('')}</div><a class="back-link" href="${prefix}index.html#explore">← ${t('profile.back')}</a></section></div>`;
  const jsonld={'inLanguage':locale.lang,'@context':'https://schema.org','@type':'Person',name:p.name,alternateName:[p.enName,...p.aliases],description:p.summary,sameAs:p.sources.map(s=>s.url)};
  if(!p.birth.startsWith('-'))jsonld.birthDate=p.birth;
  if(p.death&&!p.death.startsWith('-'))jsonld.deathDate=p.death;
  return layout({title:p.name,description:p.summary,body,prefix,jsonld,pageClass:'profile-page',pagePath:`people/${p.id}/index.html`});
}
function candidatesPage() {
  const body=`<div class="container"><header class="page-intro"><p class="eyebrow">${t('candidates.eyebrow')}</p><h1>${t('candidates.title')}</h1><p>${t('candidates.description1')}<br>${t('candidates.description2')}</p></header><div class="plan-stats"><div class="stat"><strong>${candidates.length}</strong><span>${t('candidates.total')}</span></div><div class="stat"><strong>${profiles.length}</strong><span>${t('candidates.published')}</span></div><div class="stat"><strong>${candidates.length-profiles.length}</strong><span>${t('candidates.pending')}</span></div><div class="stat"><strong>08</strong><span>${t('candidates.domains')}</span></div></div><section class="batch-grid" aria-label="${t('candidates.planLabel')}">${taxonomy.batches.map(b=>`<article class="batch-card"><span class="eyebrow">${t('candidates.batch',{batch:b.id})}</span><h2>${e(b.title)}</h2><p>${e(b.description)}</p><span class="status-badge ${b.id===1?'published':'planned'}">${t(b.id===1?'candidates.batchFinished':'candidates.batchPlanned')} · ${t('candidates.batchCount',{count:candidates.filter(c=>c.batch===b.id).length})}</span></article>`).join('')}</section><div class="candidate-controls"><div class="search-wrap">${searchIcon}<label for="candidate-search" class="sr-only">${t('candidates.searchLabel')}</label><input id="candidate-search" type="search" placeholder="${t('candidates.searchPlaceholder')}"></div><label>${t('filter.domain')} <select id="candidate-domain"><option value="all">${t('filter.allDomains')}</option>${taxonomy.domains.map(d=>`<option value="${d.id}">${e(d.label)}</option>`).join('')}</select></label><label>${t('candidates.batchLabel')} <select id="candidate-batch"><option value="all">${t('candidates.allBatches')}</option>${taxonomy.batches.map(b=>`<option value="${b.id}">${t('candidates.batch',{batch:b.id})}</option>`).join('')}</select></label></div><p id="candidate-count" role="status" aria-live="polite">${t('candidates.count',{count:candidates.length,total:candidates.length})}</p><div class="table-wrap"><table class="candidate-table"><caption class="sr-only">${t('candidates.tableCaption')}</caption><thead><tr><th scope="col">${t('candidates.name')}</th><th scope="col">${t('candidates.primaryDomain')}</th><th scope="col">${t('candidates.batchLabel')}</th><th scope="col">${t('candidates.status')}</th></tr></thead><tbody>${candidates.map(c=>`<tr data-candidate data-search="${e(`${byId.get(c.id)?.name??c.name} ${c.name} ${c.enName} ${c.id}`)}" data-domain="${c.domain}" data-batch="${c.batch}"><td>${byId.has(c.id)?`<a href="people/${c.id}/index.html">${e(byId.get(c.id)?.name??(locale.id===sourceLocale?c.name:c.enName))} ↗</a>`:`<span>${e(byId.get(c.id)?.name??(locale.id===sourceLocale?c.name:c.enName))}</span>`}<small lang="en">${e(c.enName)}</small></td><td>${e(label('domains',c.domain))}</td><td>${t('candidates.batch',{batch:c.batch})}</td><td><span class="status-badge ${byId.has(c.id)?'published':'planned'}">${t(byId.has(c.id)?'candidates.statusPublished':'candidates.statusPending')}</span></td></tr>`).join('')}</tbody></table></div><p class="profile-note">${t('candidates.note')}</p><a class="back-link" href="index.html#explore">← ${t('candidates.back')}</a></div>`;
  return layout({title:ui['nav.candidates'],description:ui['candidates.meta'],body,active:'candidates',pageClass:'candidates-page',pagePath:'candidates.html'});
}
function aboutPage() {
  const body=`<div class="container"><header class="page-intro"><p class="eyebrow">${t('about.eyebrow')}</p><h1>${t('about.heading1')}<br>${t('about.heading2')}</h1><p>Big Names on This Planet / ${t('site.subtitle')}<br>${t('about.description')}</p></header><article class="prose"><h2>${t('about.whyTitle')}</h2><p>${t('about.why1')}</p><p>${t('about.why2')}</p><h2>${t('about.tagsTitle')}</h2><div class="principle-grid"><section class="principle"><h3>${t('about.domainsTitle')}</h3><p>${t('about.domains')}</p></section><section class="principle"><h3>${t('about.erasTitle')}</h3><p>${t('about.eras')}</p></section><section class="principle"><h3>${t('about.regionsTitle')}</h3><p>${t('about.regions')}</p></section><section class="principle"><h3>${t('about.keywordsTitle')}</h3><p>${t('about.keywords')}</p></section></div><h2>${t('about.sourcesTitle')}</h2><p>${t('about.sources1')}</p><p>${t('about.sources2')}</p><p>${t('about.sources3')}</p><h2>${t('about.photosTitle')}</h2><p>${t('about.photos1')}</p><p>${t('about.photos2')}<a href="credits.html">${t('about.photosLink')} →</a></p><h2>${t('about.expansionTitle')}</h2><p>${t('about.expansion',{count:profiles.length,total:candidates.length})}</p><p><a href="candidates.html">${t('about.plan')} →</a></p></article><a class="back-link" href="index.html#explore">← ${t('profile.back')}</a></div>`;
  return layout({title:ui['about.title'],description:ui['about.meta'],body,active:'about',pageClass:'about-page',pagePath:'about.html'});
}
function creditsPage() {
  const body=`<div class="container"><header class="page-intro"><p class="eyebrow">${t('credits.eyebrow')}</p><h1>${t('credits.heading')}</h1><p>${t('credits.description1')}<br>${t('credits.description2')}</p></header><div class="table-wrap"><table class="candidate-table credits-table"><caption class="sr-only">${t('credits.tableCaption',{count:profiles.length})}</caption><thead><tr><th scope="col">${t('candidates.name')}</th><th scope="col">${t('credits.author')}</th><th scope="col">${t('credits.license')}</th><th scope="col">${t('credits.source')}</th></tr></thead><tbody>${profiles.map(p=>`<tr><td><a href="people/${p.id}/index.html">${e(p.name)}</a><small>${t(p.image.kind==='photo'?'image.photo':'image.historical')}</small></td><td>${e(p.image.credit)}</td><td>${external(p.image.licenseUrl,p.image.license)}</td><td>${external(p.image.sourceUrl,`${ui['credits.view']} ↗`)}</td></tr>`).join('')}</tbody></table></div><div class="prose"><p>${t('credits.note1',{date:'2026-11-13'})}</p><p>${t('credits.note2')}</p></div><a class="back-link" href="index.html">← ${t('credits.back')}</a></div>`;
  return layout({title:ui['nav.credits'],description:ui['credits.meta'],body,pageClass:'credits-page',pagePath:'credits.html'});
}

return {indexPage,profilePage,candidatesPage,aboutPage,creditsPage};
}

// Validate every enabled language before replacing the previous static output.
const localeIds=new Set();
for(const locale of localeConfig.locales) {
  if(!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(locale.id)||localeIds.has(locale.id))throw new Error(`Invalid or duplicate locale id: ${locale.id}`);
  if(!['ltr','rtl'].includes(locale.dir)||!locale.name||!locale.lang)throw new Error(`Invalid locale metadata: ${locale.id}`);
  new Intl.Locale(locale.lang);
  localeIds.add(locale.id);
}
if(!localeConfig.locales.some(l=>l.id===sourceLocale))throw new Error('Source language must be registered');
if(!locales.some(l=>l.id===localeConfig.default))throw new Error('Default language must be enabled');
const prepared=[];
for(const locale of locales) {
  const ui=await json(`data/i18n/${locale.id}/ui.json`);
  validateUI(baseUI,ui,locale.id);
  if(locale.id!==sourceLocale)validateUISource(baseUI,await json(`data/i18n/${locale.id}/ui-source.json`),locale.id);
  const localized=[];
  for(const person of profiles) {
    let translation=null;
    if(locale.id!==sourceLocale) {
      translation=await json(`data/i18n/${locale.id}/people/${person.id}.json`);
      // Image metadata is separate from the canonical biography and its source hash.
      const {image,...canonical}=person;
      validateTranslation(canonical,translation,locale.id);
    }
    const projected=localizePerson(person,translation);
    projected.timeline.sort(timelineOrder);
    localized.push(projected);
  }
  const taxonomy=structuredClone(baseTaxonomy);
  for(const group of ['domains','eras','regions'])for(const item of taxonomy[group]) {
    item.label=ui[`${group}.${item.id}.label`];
    if(item.short)item.short=ui[`${group}.${item.id}.short`];
  }
  for(const batch of taxonomy.batches)for(const key of ['title','description'])batch[key]=ui[`batches.${batch.id}.${key}`];
  prepared.push({locale,ui,profiles:localized,taxonomy});
}
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
await cp(path.join(root,'public'),output,{recursive:true});
await mkdir(path.join(output,'assets/locales'),{recursive:true});
await mkdir(path.join(output,'assets/indexes'),{recursive:true});
const sitemapUrls=[];
const js=value=>JSON.stringify(value).replaceAll('<','\\u003c');
for(const bundle of prepared) {
  const {locale,ui,profiles,taxonomy}=bundle;
  const folder=locale.id===localeConfig.default?'':`${locale.id}/`;
  const views=createViews(locale,ui,profiles,taxonomy);
  const write=async (file,content)=>{
    await mkdir(path.dirname(path.join(output,folder,file)),{recursive:true});
    await writeFile(path.join(output,folder,file),content);
    if(file!=='404.html')sitemapUrls.push(`${folder}${file}`);
  };
  await write('index.html',views.indexPage());
  await write('candidates.html',views.candidatesPage());
  await write('about.html',views.aboutPage());
  await write('credits.html',views.creditsPage());
  for(const [index,person] of profiles.entries())await write(`people/${person.id}/index.html`,views.profilePage(person,index));
  const localeScript=`window.SITE_LOCALE = ${js(locale.lang)};\nwindow.SITE_MESSAGES = ${js(ui)};\n`;
  await writeFile(path.join(output,`assets/locales/${locale.id}.js`),localeScript);
  const indexData=profiles.map(p=>Object.fromEntries(['id','name','enName','aliases','birth','death','country','domains','eras','regions','tags','tagIds','role','summary'].map(key=>[key,p[key]])));
  const indexName=locale.id===localeConfig.default?'people-index.js':`indexes/${locale.id}.js`;
  await writeFile(path.join(output,`assets/${indexName}`),`window.PEOPLE_INDEX = ${js(indexData)};\nwindow.TAXONOMY = ${js(taxonomy)};\n`);
  const homeFor404=siteBase?new URL(`${folder}index.html`,siteBase).pathname:`/${folder}index.html`;
  await write('404.html',`<!doctype html><html lang="${e(locale.lang)}" dir="${locale.dir}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(ui['error.title'])} · Big Names</title><style>body{margin:0;background:#f7f5ef;color:#20382f;font:16px/1.9 system-ui,sans-serif}main{max-width:700px;padding:15vh 8vw;margin:auto}small{color:#b85837;letter-spacing:2px}h1{font:clamp(28px,6vw,48px)/1.5 Georgia,serif}a{color:inherit;text-underline-offset:5px}a:focus-visible{outline:2px solid #b85837;outline-offset:6px}</style><main><small>BIG NAMES / ARCHIVE 404</small><h1>${e(ui['error.heading'])}</h1><p>${e(ui['error.description'])}</p><a href="${e(homeFor404)}">${e(ui['credits.back'])}</a></main></html>`);
}
if(siteBase) {
  await writeFile(path.join(output,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapUrls.map(url=>`<url><loc>${e(new URL(url,siteBase).href)}</loc></url>`).join('')}</urlset>`);
  await writeFile(path.join(output,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml',siteBase).href}\n`);
}
console.log(`Built ${locales.length} languages × ${profiles.length} biographies, ${sitemapUrls.length+locales.length} static HTML pages. Shared portraits: ${output}/assets/portraits`);
