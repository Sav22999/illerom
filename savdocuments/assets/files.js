/**
 * Files of a document.
 *   .savdoc  a ZIP: mimetype, document.json {format, version, title, settings, blocks}, media/<id>.<ext>
 *   .docx    Word (see docx.js), .html, .txt
 * The images travel as {id: Blob}; reading gives back {title, settings, blocks, images}.
 */
import {text, unzip, zip} from './zip.js';
import {cleanBlocks, esc, newId} from './clean.js';
import {DEFAULTS, fontStack} from './settings.js';
import {cleanObject, drawObject} from './objects.js';
import {mathml} from './math.js';

export const SAVDOC = 'application/vnd.savdocuments.document+zip';
const EXT = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif'};
const MIME = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif'};

export const fileName = (title, ext) => (title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'document') + '.' + ext;

export function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

export const imageIds = (blocks) => [...new Set(blocks.flatMap((b) => [...b.h.matchAll(/data-i="([a-f0-9]{24})"/g)].map((m) => m[1])))];

export async function toSavdoc({title, settings, blocks, images}) {
    const media = [];
    for (const [id, blob] of Object.entries(images)) media.push([`media/${id}.${EXT[blob.type] || 'png'}`, new Uint8Array(await blob.arrayBuffer()), {store: true}]);
    const doc = {format: 'savdoc', version: 1, title, settings, blocks: blocks.map(({id, h}) => ({id, h}))};
    return zip([['mimetype', SAVDOC, {store: true}], ['document.json', JSON.stringify(doc)], ...media], SAVDOC);
}

async function fromSavdoc(buf) {
    const z = await unzip(buf);
    if (!z.has('document.json')) throw new Error('file_invalid');
    const d = JSON.parse(text(await z.get('document.json')()));
    if (d.format !== 'savdoc' || !Array.isArray(d.blocks)) throw new Error('file_invalid');
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
    return {title: String(d.title || ''), settings: {...DEFAULTS, ...(d.settings || {})}, blocks, images};
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
    const look = {accent: settings.accent || '#0f6e56', ink: settings.color, font: fontStack(settings.font)}, notes = [];
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
const webCss = (s) => `body{max-width:46rem;margin:2rem auto;padding:0 1rem;font:${s.fontSize}pt/${s.line} ${esc(fontStack(s.font))};color:${esc(s.color)};background:${esc(s.bg || '#fff')}}h1,h2,h3,h4,.title,.subtitle{font-family:${esc(fontStack(s.headFont))};color:${esc(s.headColor)};line-height:1.2}.title{font-size:2.3em;font-weight:700;margin:.2em 0}.subtitle{font-size:1.3em;opacity:.75}.lead{font-size:1.15em}.small{font-size:.85em}.eq{text-align:center}table{border-collapse:collapse;width:100%;margin:1em 0}td,th{border:1px solid #bbb;padding:.4em .6em;text-align:left;vertical-align:top}table.plain td,table.plain th{border-width:1px 0}table.bare td{border:0}table.striped tr:nth-child(even) td{background:#f6f8f6}img,svg{max-width:100%;height:auto}figure{margin:1em 0;text-align:center}figcaption{font-size:.85em;opacity:.75}.beside figure{float:left;width:40%;margin:0 1em .5em 0}.beside[data-k=r] figure{float:right;margin:0 0 .5em 1em}.beside::after{content:"";display:block;clear:both}blockquote{border-left:3px solid ${esc(s.accent || '#888')};margin:1em 0;padding-left:1em;font-style:italic}pre{background:#f4f4f2;padding:1em;overflow:auto;white-space:pre-wrap}.callout{background:#eef4fb;border-left:4px solid #3b7dbf;padding:.6em 1em;margin:1em 0}.callout[data-k=tip]{background:#e9f5ef;border-color:#0f6e56}.callout[data-k=warn]{background:#fdf1ea;border-color:#d85a30}ul.check{list-style:none;padding-left:1.4em}ul.check li::before{content:"\\2610\\2002";margin-left:-1.4em}ul.check li[data-c]::before{content:"\\2611\\2002"}hr{border:0;border-top:1px solid #bbb;margin:1.4em 0}hr.thick{border-top:4px solid ${esc(s.accent || '#888')}}hr.dash{border-top:2px dashed #999}hr.dots{border-top:4px dotted ${esc(s.accent || '#888')}}hr.dbl{border-top:4px double #999}hr.short,hr.orn{width:22%;border-top:3px solid ${esc(s.accent || '#888')}}.drop::first-letter{float:left;font-size:3.2em;line-height:.85;padding-right:.1em;font-weight:700;color:${esc(s.accent || '#888')}}`;

export async function toHtml(d) {
    const url = {};
    for (const [id, b] of Object.entries(d.images)) url[id] = await dataUrl(b);
    return new Blob([`<!doctype html><html lang="${esc(d.settings.lang)}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(d.title)}</title><style>${webCss(d.settings)}</style>\n${standalone(d, (id) => url[id] || '')}`], {type: 'text/html;charset=utf-8'});
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

/** Reads .savdoc, .docx, .html, .md and .txt. */
export async function readFile(file) {
    if (file.size > 60e6) throw new Error('file_too_big');
    const ext = (file.name.match(/\.(\w+)$/) || [])[1]?.toLowerCase() || '', title = file.name.replace(/\.\w+$/, '');
    const wrap = (html) => ({title, settings: {...DEFAULTS}, blocks: html.map((h) => ({id: newId(), h})), images: {}});
    let d;
    if (ext === 'savdoc') d = await fromSavdoc(await file.arrayBuffer());
    else if (ext === 'docx') d = await (await import('./docx.js')).fromDocx(await file.arrayBuffer());
    else if (ext === 'html' || ext === 'htm') d = wrap(cleanBlocks(await file.text()));
    else if (ext === 'md') d = wrap(fromMarkdown(await file.text()));
    else if (ext === 'txt') d = wrap((await file.text()).replace(/\r/g, '').split('\n').filter((l, i, a) => l.trim() || (i && a[i - 1].trim())).map((l) => `<p>${esc(l) || '<br>'}</p>`));
    else throw new Error('file_type');
    d.title = d.title || title;
    if (!d.blocks.length) d.blocks = [{id: newId(), h: '<p><br></p>'}];
    return d;
}
