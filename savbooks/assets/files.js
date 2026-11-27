/**
 * Files of a book.
 *   .savboo  a ZIP: mimetype, book.json {format: "savboo", version, title, settings (with settings.book), blocks}, media/<id>.<ext>
 *   .savdoc  a document of SavDocuments (the same ZIP with document.json): it becomes a book (see toBook in book.js)
 *   .epub    e-books (EPUB 2 and 3): the chapters in reading order, the details and the cover
 *   .fb2     FictionBook
 *   .docx    Word (see docx.js), .odt, .doc, .rtf, .html, .md, .txt
 * The images travel as {id: Blob}; reading gives back {title, settings, blocks, images}.
 */
import {text, unzip, zip} from './zip.js';
import {cleanBlocks, esc, newId} from './clean.js';
import {DEFAULTS, LOOKS, fontStack} from './settings.js';
import {cleanObject, drawObject} from './objects.js';
import {mathml} from './math.js';

export const SAVBOO = 'application/vnd.savbooks.book+zip';
const EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif'};
const MIME = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif'};

export const fileName = (title, ext) => (title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'book') + '.' + ext;

/** Inside the Android app: the file goes to the app in pieces, then the system asks where to keep it. */
export const inApp = () => /SavBooksApp\/Android/.test(navigator.userAgent) && !!window.SavBooksAndroid?.saveFile;
async function saveInApp(blob, name) {
  // the pieces end at a multiple of 4 characters, so each one can be decoded alone
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  window.SavBooksAndroid.saveBegin(name, blob.type || 'application/octet-stream');
  for (let i = 0; i < b64.length; i += 524288) window.SavBooksAndroid.saveFile(b64.slice(i, i + 524288));
  window.SavBooksAndroid.saveEnd();
}
export function download(blob, name) {
  if (inApp()) return void saveInApp(blob, name);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

/** The pictures of a book: those in the text, and the one of the cover. */
export const imageIds = (blocks, settings) => [...new Set([...blocks.flatMap((b) => [...b.h.matchAll(/data-i="([a-f0-9]{24})"/g)].map((m) => m[1])), ...(/^[a-f0-9]{24}$/.test(settings?.book?.cover || '') ? [settings.book.cover] : [])])];
const hexId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');

export async function toSavboo({title, settings, blocks, images}) {
    const media = [];
    for (const [id, blob] of Object.entries(images)) media.push([`media/${id}.${EXT[blob.type] || 'png'}`, new Uint8Array(await blob.arrayBuffer()), {store: true}]);
    const doc = {format: 'savboo', version: 1, title, settings, blocks: blocks.map(({id, h}) => ({id, h}))};
    return zip([['mimetype', SAVBOO, {store: true}], ['book.json', JSON.stringify(doc)], ...media], SAVBOO);
}

/** A .savboo, or a .savdoc of SavDocuments (the same kind of ZIP): {title, settings, blocks, images, kind}. */
async function fromSavboo(buf) {
    const z = await unzip(buf);
    const name = z.has('book.json') ? 'book.json' : z.has('document.json') ? 'document.json' : '';
    if (!name) throw new Error('file_invalid');
    const d = JSON.parse(text(await z.get(name)()));
    if (!['savboo', 'savdoc'].includes(d.format) || !Array.isArray(d.blocks)) throw new Error('file_invalid');
    if (d.version > 1) throw new Error('file_newer');
    const images = {};
    for (const [name, read] of z) {
        const m = name.match(/^media\/([a-f0-9]{24})\.(\w+)$/);
        if (m && MIME[m[2]]) images[m[1]] = new Blob([await read()], {type: MIME[m[2]]});
    }
    const blocks = d.blocks.map((b) => ({
        id: /^[a-z0-9]{4,12}$/.test(b?.id) ? b.id : newId(),
        h: cleanBlocks(String(b?.h || ''))[0]
    })).filter((b) => b.h);
    return {title: String(d.title || ''), settings: {...DEFAULTS, ...(d.settings || {})}, blocks, images, kind: d.format};
}

// ------------------------------------------------------------------ e-books in

const cleanMeta = (v) => String(v || '').replace(/\s+/g, ' ').trim();
/** epub:type of an element, in HTML and in XML documents alike. */
const etype = (n) => (n.getAttribute?.('epub:type') || n.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type') || '') + ' ' + (n.getAttribute?.('role') || '');
const hasType = (root, re) => [root, ...root.querySelectorAll('*')].some((n) => re.test(etype(n)));
/** HTML of a chapter: the pictures become data-i (their files go in images), the labels made by SavBooks go away. */
function bookHtml(body, resolve, images, made) {
    body.querySelectorAll('script,style,nav,.chap-label').forEach((n) => n.remove());
    [...body.querySelectorAll('*')].filter((n) => /pagebreak/.test(etype(n))).forEach((n) => n.remove());
    for (const i of body.querySelectorAll('img,image')) {
        const src = i.getAttribute('src') || i.getAttribute('xlink:href') || i.getAttribute('href') || '';
        const r = resolve(src);
        if (!r) { i.remove(); continue; }
        const id = made[r.path] ||= hexId();
        images[id] ||= r.blob;
        const img = document.createElement('img');
        img.dataset.i = id;
        img.alt = i.getAttribute('alt') || '';
        const box = i.closest('svg') || i, fig = box.closest('figure');
        if (fig) box.replaceWith(img); else { const f = document.createElement('figure'); f.dataset.a = 'c'; f.append(img); box.replaceWith(f); }
    }
    return cleanBlocks(body.innerHTML);
}

/** EPUB 2 and 3: the files of the spine in order, the details of the package, the cover. */
async function fromEpub(buf) {
    const z = await unzip(buf), X = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const read = async (p) => (z.has(p) ? text(await z.get(p)()) : null);
    const cont = await read('META-INF/container.xml');
    const opfPath = cont && X(cont).querySelector('rootfile')?.getAttribute('full-path');
    const opfText = opfPath && await read(opfPath);
    if (!opfText) throw new Error('file_invalid');
    const opf = X(opfText), dir = opfPath.includes('/') ? opfPath.replace(/[^/]+$/, '') : '';
    const join = (base, rel) => { const out = []; for (const x of (base + rel).split('/')) { if (x === '..') out.pop(); else if (x && x !== '.') out.push(x); } return out.join('/'); };
    const items = {};
    for (const it of opf.getElementsByTagName('item')) items[it.getAttribute('id')] = {href: join(dir, decodeURIComponent(it.getAttribute('href') || '')), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || ''};
    const dc = (tag) => [...opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', tag)].map((n) => cleanMeta(n.textContent)).filter(Boolean);
    const metas = [...opf.getElementsByTagName('meta')];
    const titleNodes = [...opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')];
    const sub = titleNodes.find((n) => n.id && metas.some((m) => m.getAttribute('refines') === '#' + n.id && m.textContent.trim() === 'subtitle'));
    const images = {}, made = {}, MIMES = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp'};
    const media = async (path) => { const ext = path.split('.').pop().toLowerCase(); if (!MIMES[ext] || !z.has(path)) return null; return new Blob([await z.get(path)()], {type: MIMES[ext]}); };
    // the cover: properties="cover-image" (EPUB 3) or <meta name="cover"> (EPUB 2)
    const coverItem = Object.values(items).find((x) => x.props.split(' ').includes('cover-image')) || items[metas.find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content')];
    let cover = '';
    if (coverItem && /^image\//.test(coverItem.type)) { const b = await media(coverItem.href); if (b) { cover = made[coverItem.href] = hexId(); images[cover] = b; } }
    const blocks = [];
    let dedication = '';
    const skip = /(^|\/)(cover|titlepage|title|toc|nav|contents|copyright|colophon)\.x?html?$/i;
    // all the files of the spine first: the notes (endnotes, footnotes) can be anywhere
    const files = [], notes = {};
    for (const ref of opf.getElementsByTagName('itemref')) {
        const it = items[ref.getAttribute('idref')];
        if (!it || !/x?html/.test(it.type) || it.props.includes('nav')) continue;
        const src = await read(it.href);
        if (!src) continue;
        const doc = new DOMParser().parseFromString(src, /<\?xml|xmlns=/.test(src.slice(0, 400)) ? 'application/xhtml+xml' : 'text/html');
        const body = doc.body || doc.querySelector('body');
        if (!body) continue;
        files.push({it, ref, body});
        for (const n of [...body.querySelectorAll('li[id],aside[id],div[id],p[id]')].filter((x) => /\b(endnote|footnote|rearnote|doc-endnote|doc-footnote)\b/.test(etype(x)) || /^nota\d+$/.test(x.id))) {
            const c = n.cloneNode(true);
            c.querySelectorAll('a').forEach((a) => { if (/backlink/.test(etype(a)) || /^[↩\s]*$/.test(a.textContent)) a.remove(); });
            notes[it.href.replace(/^.*\//, '') + '#' + n.id] = notes['#' + n.id] = cleanMeta(c.textContent).slice(0, 2000);
            n.dataset.note = '1';
        }
    }
    for (const {it, ref, body} of files) {
        const words = (body.textContent || '').trim();
        if (hasType(body, /\bdedication\b/) || /(^|\/)dedication\.x?html?$/i.test(it.href)) { dedication = [...body.querySelectorAll('p')].map((p) => p.textContent.trim()).filter(Boolean).join('\n'); continue; }
        if (ref.getAttribute('linear') === 'no' || (skip.test(it.href) && words.length < 1500) || hasType(body, /\b(titlepage|copyright-page|cover)\b/)) continue;
        // a file of notes only: they are already back inside the text
        const noteEls = body.querySelectorAll('[data-note]');
        if (noteEls.length && noteEls.length >= body.querySelectorAll('p,li').length - 1 - body.querySelectorAll('[data-note] p').length) continue;
        noteEls.forEach((n) => n.remove());
        // the references to a note become notes of SavBooks again
        for (const a of [...body.querySelectorAll('a[href*="#"]')]) {
            const href = a.getAttribute('href') || '', key = href.replace(/^.*\//, '').replace(/^([^#]*)#/, (m, f) => (f ? f + '#' : '#'));
            const txt = notes[key] || notes['#' + href.split('#')[1]];
            if (!txt || !(/noteref/.test(etype(a)) || a.closest('sup'))) continue;
            const sup = body.ownerDocument.createElement('sup');
            sup.setAttribute('class', 'fn');
            sup.setAttribute('data-n', txt);
            (a.closest('sup') || a).replaceWith(sup);
        }
        const base = it.href.includes('/') ? it.href.replace(/[^/]+$/, '') : '';
        const resolve = (s) => { if (!s || /^(https?:|data:)/.test(s)) return null; const path = join(base, decodeURIComponent(s.split('#')[0])); return z.has(path) ? {path, blob: null} : null; };
        // pictures first (they are read asynchronously), then the text
        for (const i of body.querySelectorAll('img,image')) { const r = resolve(i.getAttribute('src') || i.getAttribute('xlink:href') || i.getAttribute('href')); if (r && !made[r.path]) { const b = await media(r.path); if (b) { made[r.path] = hexId(); images[made[r.path]] = b; } } }
        const html = bookHtml(body, (s) => { const r = resolve(s); return r && made[r.path] ? {path: r.path, blob: images[made[r.path]]} : null; }, images, made);
        for (const hh of html) blocks.push({id: newId(), h: hh});
    }
    const isbn = dc('identifier').map((x) => x.replace(/^urn:isbn:/i, '')).find((x) => /^(97[89])?\d{9}[\dX]$/i.test(x.replace(/[\s-]/g, ''))) || '';
    const lang = (dc('language')[0] || '').slice(0, 2).toLowerCase();
    const title = cleanMeta(titleNodes.find((n) => n !== sub)?.textContent) || '';
    const book = {sub: cleanMeta(sub?.textContent), author: dc('creator').join('; '), publisher: dc('publisher')[0] || '', date: (dc('date')[0] || '').slice(0, 10), desc: (dc('description')[0] || '').replace(/<[^>]+>/g, ''), subjects: dc('subject').join(', '), rights: dc('rights')[0] || '', isbn, dedication, cover, cv: cover ? 'art' : 'classic'};
    return {title, settings: {...DEFAULTS, ...(/^[a-z]{2}$/.test(lang) ? {lang} : {}), book}, blocks, images};
}

/** FictionBook 2: sections become chapters, poems and epigraphs keep their shape, pictures come from the binaries. */
async function fromFb2(src) {
    const x = new DOMParser().parseFromString(src, 'application/xml');
    if (x.querySelector('parsererror')) throw new Error('file_invalid');
    const q = (n, sel) => n?.getElementsByTagName(sel)[0], all = (n, sel) => [...(n?.getElementsByTagName(sel) || [])];
    const info = q(x, 'title-info'), images = {}, ids = {};
    for (const b of all(x, 'binary')) { try { const type = b.getAttribute('content-type') || 'image/jpeg'; if (!/^image\/(png|jpeg|gif|webp)$/.test(type)) continue; const bin = Uint8Array.from(atob(b.textContent.replace(/\s+/g, '')), (c) => c.charCodeAt(0)); ids[b.getAttribute('id')] = hexId(); images[ids[b.getAttribute('id')]] = new Blob([bin], {type}); } catch { /* a broken picture stays out */ } }
    const imgOf = (n) => { const href = (n.getAttribute('l:href') || n.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '').replace(/^#/, ''); return ids[href] ? `<figure data-a="c"><img data-i="${ids[href]}" alt=""></figure>` : ''; };
    const inline = (n) => [...n.childNodes].map((c) => {
        if (c.nodeType === 3) return esc(c.nodeValue);
        if (c.nodeType !== 1) return '';
        const k = c.localName, inner = inline(c);
        return k === 'emphasis' ? `<em>${inner}</em>` : k === 'strong' ? `<strong>${inner}</strong>` : k === 'strikethrough' ? `<s>${inner}</s>` : k === 'sup' ? `<sup>${inner}</sup>` : k === 'sub' ? `<sub>${inner}</sub>` : k === 'a' ? inner : k === 'image' ? '' : inner;
    }).join('');
    const out = [];
    const walk = (sec, depth) => {
        for (const c of sec.children) {
            const k = c.localName;
            if (k === 'title' && depth === 0) continue; // the title of the book: the title page says it
            if (k === 'title') { const tx = all(c, 'p').map(inline).join(' — ') || inline(c); if (tx.trim()) out.push(`<h${Math.min(4, depth)}>${tx}</h${Math.min(4, depth)}>`); }
            else if (k === 'section') walk(c, depth + 1);
            else if (k === 'p') out.push(`<p>${inline(c) || '<br>'}</p>`);
            else if (k === 'subtitle') out.push(`<h${Math.min(4, depth + 1)}>${inline(c)}</h${Math.min(4, depth + 1)}>`);
            else if (k === 'empty-line') out.push('<p><br></p>');
            else if (k === 'image') { const f = imgOf(c); if (f) out.push(f); }
            else if (k === 'epigraph' || k === 'cite') out.push(`<blockquote>${all(c, 'p').map(inline).join('<br>')}${all(c, 'text-author').map((a) => '<br>— ' + inline(a)).join('')}</blockquote>`);
            else if (k === 'poem') for (const st of all(c, 'stanza')) out.push(`<p>${all(st, 'v').map(inline).join('<br>')}</p>`);
            else if (k === 'table') out.push(`<table><tbody>${all(c, 'tr').map((r) => `<tr>${[...r.children].map((td) => `<td>${inline(td)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        }
    };
    const bodies = all(x, 'body').filter((b) => b.getAttribute('name') !== 'notes');
    for (const b of bodies) walk(b, 0);
    const name = (a) => ['first-name', 'middle-name', 'last-name'].map((k) => q(a, k)?.textContent.trim()).filter(Boolean).join(' ') || q(a, 'nickname')?.textContent.trim() || '';
    const coverImg = q(q(info, 'coverpage'), 'image'), coverId = coverImg ? ids[(coverImg.getAttribute('l:href') || coverImg.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '').replace(/^#/, '')] || '' : '';
    // the book title in the first body is already the title page: it goes
    const blocks = cleanBlocks(out.join('')).map((hh) => ({id: newId(), h: hh}));
    const lang = (q(info, 'lang')?.textContent || '').trim().slice(0, 2).toLowerCase();
    return {title: cleanMeta(q(info, 'book-title')?.textContent), settings: {...DEFAULTS, ...(/^[a-z]{2}$/.test(lang) ? {lang} : {}), book: {author: all(info, 'author').map(name).filter(Boolean).join('; '), desc: cleanMeta(q(info, 'annotation')?.textContent), subjects: all(info, 'genre').map((g) => g.textContent.trim()).join(', '), date: (q(info, 'date')?.getAttribute('value') || '').slice(0, 10), cover: coverId, cv: coverId ? 'art' : 'classic'}}, blocks, images};
}

/** Text of a block with line breaks. */
export function blockText(html) {
    const d = new DOMParser().parseFromString(html, 'text/html').body;
    d.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
    d.querySelectorAll('li').forEach((l) => {
        const list = l.parentNode, n = [...list.children].indexOf(l) + 1;
        l.prepend(list.localName === 'ol' ? `${n}. ` : list.classList.contains('check') ? (l.dataset.c === '1' ? '[x] ' : '[ ] ') : '- ');
        l.append('\n');
    });
    d.querySelectorAll('td,th').forEach((c) => c.append('\t'));
    d.querySelectorAll('tr').forEach((r) => r.append('\n'));
    return d.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

export const toText = ({blocks}) => new Blob([blocks.map((b) => blockText(b.h)).join('\n\n') + '\n'], {type: 'text/plain;charset=utf-8'});

const dataUrl = (b) => new Promise((r) => {
    const f = new FileReader();
    f.onload = () => r(f.result);
    f.readAsDataURL(b);
});
const unesc = (v) => new DOMParser().parseFromString(v, 'text/html').body.textContent;

/** Blocks as HTML that stands on its own: pictures by address, objects drawn, formulas as MathML, notes at the end. */
export function standalone({settings, blocks}, src) {
    const look = {accent: settings.accent || '#8a2346', ink: settings.color, font: fontStack(settings.font)}, notes = [];
    const n = [0, 0, 0], heads = [];
    const out = blocks.map((b) => {
        let h = b.h.replace(/<img data-i="([a-f0-9]{24})"/g, (m, id) => `<img src="${src(id)}"`)
            .replace(/<figure([^>]*) data-o="([^"]*)"([^>]*)>/g, (m, p, o, q) => { const v = cleanObject(unesc(o)), w = (p + q).match(/data-w="(\d+)"/); return v ? `<figure${p}${q}><div style="width:${w ? w[1] : 100}%;margin:auto">${drawObject(v, look).replace(/ width="[\d.]+" height="[\d.]+"/, '')}</div>` : m; })
            .replace(/<span class="math" data-m="([^"]*)"><\/span>/g, (m, t) => mathml(unesc(t), /class="eq"/.test(b.h)).replace('<math', '<math xmlns="http://www.w3.org/1998/Math/MathML"'))
            .replace(/<sup class="fn" data-n="([^"]*)"><\/sup>/g, (m, t) => { notes.push(t); return `<sup><a href="#nota${notes.length}" id="rif${notes.length}">${notes.length}</a></sup>`; })
            .replace(/<figcaption><br><\/figcaption>/g, '').replace(/<div class="pb"><\/div>/g, '');
        const m = h.match(/^<h([1-4])/);
        if (m) {
            const l = +m[1] - 1;
            let num = '';
            if (settings.numbered && l < 3) { n[l]++; n.fill(0, l + 1); num = n.slice(0, l + 1).map((y) => y || 1).join('.') + (l ? ' ' : '. '); }
            h = h.replace(/^<h\d/, `$& id="b-${b.id}"`).replace(/>/, `>${num}`);
            heads.push([l + 1, b.id, num + h.replace(/<[^>]+>/g, '').replace(num, '')]);
        }
        return h;
    });
    const toc = (lv) => `<ul>${heads.filter((q) => q[0] <= lv).map((q) => `<li style="margin-left:${(q[0] - 1) * 1.2}em;list-style:none"><a href="#b-${q[1]}">${q[2]}</a></li>`).join('')}</ul>`;
    const body = out.map((h) => h.replace(/<div class="toc"( data-k="f")?(?: data-l="(\d)")?><\/div>/g, (m, k, l) => (k ? '' : toc(+l || 3)))).filter(Boolean).join('\n');
    return body + (notes.length ? `\n<hr><ol>${notes.map((t, i) => `<li id="nota${i + 1}">${t} <a href="#rif${i + 1}">&#8617;</a></li>`).join('')}</ol>` : '');
}
export const webCss = (s) => `body{max-width:46rem;margin:2rem auto;padding:0 1rem;font:${s.fontSize}pt/${s.line} ${esc(fontStack(s.font))};color:${esc(s.color)};background:${esc(s.bg || '#fff')}}h1,h2,h3,h4,.title,.subtitle{font-family:${esc(fontStack(s.headFont))};color:${esc(s.headColor)};line-height:1.2}.title{font-size:2.3em;font-weight:700;margin:.2em 0}.subtitle{font-size:1.3em;opacity:.75}.lead{font-size:1.15em}.small{font-size:.85em}.eq{text-align:center}table{border-collapse:collapse;width:100%;margin:1em 0}td,th{border:1px solid #bbb;padding:.4em .6em;text-align:left;vertical-align:top}table.plain td,table.plain th{border-width:1px 0}table.bare td{border:0}table.striped tr:nth-child(even) td{background:#f6f8f6}img,svg{max-width:100%;height:auto}figure{margin:1em 0;text-align:center}figcaption{font-size:.85em;opacity:.75}.beside figure{float:left;width:40%;margin:0 1em .5em 0}.beside[data-k=r] figure{float:right;margin:0 0 .5em 1em}.beside::after{content:"";display:block;clear:both}blockquote{border-left:3px solid ${esc(s.accent || '#888')};margin:1em 0;padding-left:1em;font-style:italic}pre{background:#f4f4f2;padding:1em;overflow:auto;white-space:pre-wrap}.callout{background:#eef4fb;border-left:4px solid #3b7dbf;padding:.6em 1em;margin:1em 0}.callout[data-k=tip]{background:#e9f5ef;border-color:#8a2346}.callout[data-k=warn]{background:#fdf1ea;border-color:#d85a30}ul.check{list-style:none;padding-left:1.4em}ul.check li::before{content:"\\2610\\2002";margin-left:-1.4em}ul.check li[data-c]::before{content:"\\2611\\2002"}hr{border:0;border-top:1px solid #bbb;margin:1.4em 0}hr.thick{border-top:4px solid ${esc(s.accent || '#888')}}hr.dash{border-top:2px dashed #999}hr.dots{border-top:4px dotted ${esc(s.accent || '#888')}}hr.dbl{border-top:4px double #999}hr.short,hr.orn{width:22%;border-top:3px solid ${esc(s.accent || '#888')}}.drop::first-letter{float:left;font-size:3.2em;line-height:.85;padding-right:.1em;font-weight:700;color:${esc(s.accent || '#888')}}`;

/** Typefaces of Bunny Fonts used by the document, linked from the web page (the included ones fall back to the same kind). */
const fontLinks = (s) => (s.fonts || []).filter((f) => f.b).map((f) => `<link rel="stylesheet" href="https://fonts.bunny.net/css?family=${encodeURIComponent(f.b)}:400,400i,700,700i&display=swap">`).join('');

export async function toHtml(d) {
    const url = {};
    for (const [id, b] of Object.entries(d.images)) url[id] = await dataUrl(b);
    return new Blob([`<!doctype html><html lang="${esc(d.settings.lang)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(d.title)}</title>${fontLinks(d.settings)}<style>${webCss(d.settings)}</style>\n${standalone(d, (id) => url[id] || '')}`], {type: 'text/html;charset=utf-8'});
}

/** An e-book: one chapter for each heading of the first level. */
export async function toEpub(d) {
    const s = d.settings, media = [], path = {};
    for (const [id, b] of Object.entries(d.images)) { const ext = EXT[b.type] || 'png'; path[id] = `media/${id}.${ext}`; media.push([`OEBPS/media/${id}.${ext}`, new Uint8Array(await b.arrayBuffer()), {store: true}, b.type, id]); }
    const doc = new DOMParser().parseFromString(standalone(d, (id) => path[id] || ''), 'text/html');
    const parts = [[]];
    for (const n of doc.body.children) { if (n.localName === 'h1' && parts.at(-1).length) parts.push([]); parts.at(-1).push(n); }
    const ser = new XMLSerializer(), page = (body, title) => `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${esc(s.lang)}"><head><title>${esc(title)}</title><link rel="stylesheet" href="style.css"/></head><body>${body}</body></html>`;
    const ch = parts.map((l, i) => ({id: `c${i + 1}`, title: l.find((n) => /^h[1-4]$/.test(n.localName) || n.matches('.title'))?.textContent.trim() || `${i + 1}`, body: l.map((n) => ser.serializeToString(n)).join('\n').replace(/href="#(b-[a-z0-9]+)"/g, (m, t) => { const k = parts.findIndex((p) => p.some((n) => n.id === t || n.querySelector(`#${t}`))); return k < 0 ? m : `href="c${k + 1}.xhtml#${t}"`; })}));
    const uid = 'urn:uuid:' + crypto.randomUUID(), now = new Date().toISOString().replace(/\.\d+Z/, 'Z');
    const has = (c, r) => (r.test(c.body) ? 1 : 0), props = (c) => { const p = [has(c, /<math/) && 'mathml', has(c, /<svg/) && 'svg'].filter(Boolean).join(' '); return p ? ` properties="${p}"` : ''; };
    return zip([['mimetype', 'application/epub+zip', {store: true}],
        ['META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
        ['OEBPS/book.opf', `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">${uid}</dc:identifier><dc:title>${esc(d.title)}</dc:title><dc:language>${esc(s.lang)}</dc:language><meta property="dcterms:modified">${now}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${ch.map((c) => `<item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"${props(c)}/>`).join('')}${media.map((m) => `<item id="m${m[4]}" href="${m[0].slice(6)}" media-type="${m[3]}"/>`).join('')}</manifest><spine>${ch.map((c) => `<itemref idref="${c.id}"/>`).join('')}</spine></package>`],
        ['OEBPS/nav.xhtml', page(`<nav epub:type="toc"><ol>${ch.map((c) => `<li><a href="${c.id}.xhtml">${esc(c.title)}</a></li>`).join('')}</ol></nav>`, d.title)], ['OEBPS/style.css', webCss(s).replace(/^body\{[^}]*\}/, 'body{line-height:1.5}')],
        ...ch.map((c) => [`OEBPS/${c.id}.xhtml`, page(c.body, c.title)]), ...media.map((m) => m.slice(0, 3))], 'application/epub+zip');
}

/** Markdown: what it cannot say (charts, colours) is left out. */
export function toMarkdown({title, blocks}) {
    const notes = [];
    const inl = (n) => [...n.childNodes].map((c) => {
        if (c.nodeType === 3) return c.nodeValue.replace(/​/g, '').replace(/([*_`[\]\\])/g, '\\$1');
        const t = inl(c), w = (a) => (t.trim() ? t.replace(/^(\s*)(.*?)(\s*)$/s, `$1${a}$2${a}$3`) : t);
        switch (c.localName) {
            case 'strong': return w('**');
            case 'em': return w('*');
            case 's': return w('~~');
            case 'code': return '`' + c.textContent + '`';
            case 'br': return '  \n';
            case 'a': return `[${t}](${c.getAttribute('href')})`;
            case 'sup': if (c.matches('.fn')) { notes.push(c.dataset.n); return `[^${notes.length}]`; } return `<sup>${t}</sup>`;
            case 'sub': return `<sub>${t}</sub>`;
            case 'span': return c.matches('.math') ? `$${c.dataset.m}$` : t;
            case 'ul': case 'ol': return '';
            default: return t;
        }
    }).join('');
    const list = (l, d = 0) => [...l.children].map((li, i) => `${'    '.repeat(d)}${l.localName === 'ol' ? `${i + (parseInt(l.getAttribute('start'), 10) || 1)}.` : '-'} ${l.matches('.check') ? (li.dataset.c ? '[x] ' : '[ ] ') : ''}${inl(li).trim()}${[...li.children].filter((c) => /^[uo]l$/.test(c.localName)).map((c) => '\n' + list(c, d + 1)).join('')}`).join('\n');
    const one = (n) => {
        switch (n.localName) {
            case 'h1': case 'h2': case 'h3': case 'h4': return '#'.repeat(+n.localName[1]) + ' ' + inl(n);
            case 'ul': case 'ol': return list(n);
            case 'blockquote': return inl(n).split('\n').map((l) => '> ' + l.trim()).join('\n');
            case 'pre': return '```\n' + n.textContent + '\n```';
            case 'hr': return '---';
            case 'table': { const rows = [...n.querySelectorAll('tr')].map((r) => [...r.children].map((c) => inl(c).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim())); if (!rows.length) return ''; const w = Math.max(...rows.map((r) => r.length)); return rows.map((r, i) => `| ${Array.from({length: w}, (_, k) => r[k] || ' ').join(' | ')} |${i ? '' : `\n|${' --- |'.repeat(w)}`}`).join('\n'); }
            case 'figure': return n.querySelector('figcaption')?.textContent ? `*${n.querySelector('figcaption').textContent}*` : '';
            case 'div': return n.matches('.callout') ? [...n.children].map((p) => '> ' + inl(p)).join('\n>\n') : n.matches('.beside') ? [...n.children].map(one).filter(Boolean).join('\n\n') : '';
            default: return n.matches('.title') ? '# ' + inl(n) : n.matches('.eq') ? `$$\n${n.querySelector('.math')?.dataset.m || ''}\n$$` : inl(n);
        }
    };
    const p = new DOMParser(), body = blocks.map((b) => one(p.parseFromString(b.h, 'text/html').body.firstElementChild)).filter((x) => x?.trim()).join('\n\n');
    return new Blob([(/^# /.test(body) ? '' : `# ${title}\n\n`) + body + (notes.length ? '\n\n' + notes.map((x, i) => `[^${i + 1}]: ${x}`).join('\n') : '') + '\n'], {type: 'text/markdown;charset=utf-8'});
}

const mdInline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');

function fromMarkdown(src) {
    const out = [];
    let list = null, code = null;
    for (const line of src.replace(/\r/g, '').split('\n')) {
        if (code !== null) {
            if (/^```/.test(line)) {
                out.push(`<pre>${esc(code.replace(/\n$/, ''))}</pre>`);
                code = null;
            } else code += line + '\n';
            continue;
        }
        const li = line.match(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)/);
        const kind = li && (li[2] ? 'check' : /\d/.test(li[1]) ? 'ol' : 'ul');
        if (list && list.kind !== kind) {
            out.push(list.kind === 'ol' ? `<ol>${list.h}</ol>` : `<ul${list.kind === 'check' ? ' class="check"' : ''}>${list.h}</ul>`);
            list = null;
        }
        if (li) {
            list ||= {kind, h: ''};
            list.h += `<li${li[2] && /x/i.test(li[2]) ? ' data-c="1"' : ''}>${mdInline(li[3])}</li>`;
            continue;
        }
        let m;
        if (/^```/.test(line)) code = '';
        else if ((m = line.match(/^(#{1,6})\s+(.*)/))) out.push(`<h${Math.min(4, m[1].length)}>${mdInline(m[2])}</h${Math.min(4, m[1].length)}>`);
        else if (/^(-{3,}|\*{3,})\s*$/.test(line)) out.push('<hr>');
        else if ((m = line.match(/^>\s?(.*)/))) out.push(`<blockquote>${mdInline(m[1])}</blockquote>`);
        else if (line.trim()) out.push(`<p>${mdInline(line)}</p>`);
    }
    if (list) out.push(list.kind === 'ol' ? `<ol>${list.h}</ol>` : `<ul${list.kind === 'check' ? ' class="check"' : ''}>${list.h}</ul>`);
    return out;
}

export const ACCEPT = '.savboo,.savdoc,.epub,.docx,.doc,.odt,.rtf,.fb2,.html,.htm,.md,.txt';
/** Reads .savboo, .savdoc, .epub, .fb2, .docx, .odt, .doc, .rtf, .html, .md and .txt: whatever is not a book yet becomes one. */
export async function readFile(file) {
    if (file.size > 60e6) throw new Error('file_too_big');
    const ext = (file.name.match(/\.(\w+)$/) || [])[1]?.toLowerCase() || '', title = file.name.replace(/\.\w+$/, '');
    const wrap = (html) => ({title, settings: {...DEFAULTS}, blocks: html.map((h) => ({id: newId(), h})), images: {}});
    let d;
    if (ext === 'savboo' || ext === 'savdoc') d = await fromSavboo(await file.arrayBuffer());
    else if (ext === 'epub') d = await fromEpub(await file.arrayBuffer());
    else if (ext === 'fb2') d = await fromFb2(await file.text());
    else if (ext === 'docx') d = await (await import('./docx.js')).fromDocx(await file.arrayBuffer());
    else if (ext === 'odt') d = await (await import('./odf.js')).fromOdt(await file.arrayBuffer());
    else if (ext === 'doc' || ext === 'rtf') d = await (await import('./odf.js')).fromDoc(await file.arrayBuffer());
    else if (ext === 'html' || ext === 'htm') d = wrap(cleanBlocks(await file.text()));
    else if (ext === 'md') d = wrap(fromMarkdown(await file.text()));
    else if (ext === 'txt') d = wrap((await file.text()).replace(/\r/g, '').split('\n').filter((l, i, a) => l.trim() || (i && a[i - 1].trim())).map((l) => `<p>${esc(l) || '<br>'}</p>`));
    else throw new Error('file_type');
    d.title = d.title || title;
    if (!d.blocks.length) d.blocks = [{id: newId(), h: '<p><br></p>'}];
    if (d.kind === 'savboo') return d;
    const {toBook, BOOK} = await import('./book.js');
    if (d.settings.book) d.settings.book = {...BOOK, ...d.settings.book};
    // plain text and e-books have no look of their own: the one of a book
    if (['txt', 'md', 'html', 'htm', 'epub', 'fb2'].includes(ext)) Object.assign(d.settings, LOOKS.book, {accent: '#8a2346'});
    return toBook(d, {keepTitle: ext === 'epub'});
}
