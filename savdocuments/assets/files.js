/**
 * Files of a document.
 *   .savdoc  a ZIP: mimetype, document.json {format, version, title, settings, blocks}, media/<id>.<ext>
 *   .docx    Word (see docx.js), .html, .txt
 * The images travel as {id: Blob}; reading gives back {title, settings, blocks, images}.
 */
import { zip, unzip, text } from './zip.js';
import { cleanBlocks, newId, esc } from './clean.js';
import { DEFAULTS } from './settings.js';

export const SAVDOC = 'application/vnd.savdocuments.document+zip';
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

export const fileName = (title, ext) => (title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'document') + '.' + ext;

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

export const imageIds = (blocks) => [...new Set(blocks.flatMap((b) => [...b.h.matchAll(/data-i="([a-f0-9]{24})"/g)].map((m) => m[1])))];

export async function toSavdoc({ title, settings, blocks, images }) {
  const media = [];
  for (const [id, blob] of Object.entries(images)) media.push([`media/${id}.${EXT[blob.type] || 'png'}`, new Uint8Array(await blob.arrayBuffer()), { store: true }]);
  const doc = { format: 'savdoc', version: 1, title, settings, blocks: blocks.map(({ id, h }) => ({ id, h })) };
  return zip([['mimetype', SAVDOC, { store: true }], ['document.json', JSON.stringify(doc)], ...media], SAVDOC);
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
    if (m && MIME[m[2]]) images[m[1]] = new Blob([await read()], { type: MIME[m[2]] });
  }
  const blocks = d.blocks.map((b) => ({ id: /^[a-z0-9]{4,12}$/.test(b?.id) ? b.id : newId(), h: cleanBlocks(String(b?.h || ''))[0] })).filter((b) => b.h);
  return { title: String(d.title || ''), settings: { ...DEFAULTS, ...(d.settings || {}) }, blocks, images };
}

/** Text of a block with line breaks. */
export function blockText(html) {
  const d = new DOMParser().parseFromString(html, 'text/html').body;
  d.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
  d.querySelectorAll('li').forEach((l) => { const list = l.parentNode, n = [...list.children].indexOf(l) + 1; l.prepend(list.localName === 'ol' ? `${n}. ` : list.classList.contains('check') ? (l.dataset.c === '1' ? '[x] ' : '[ ] ') : '- '); l.append('\n'); });
  d.querySelectorAll('td,th').forEach((c) => c.append('\t'));
  d.querySelectorAll('tr').forEach((r) => r.append('\n'));
  return d.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

export const toText = ({ blocks }) => new Blob([blocks.map((b) => blockText(b.h)).join('\n\n') + '\n'], { type: 'text/plain;charset=utf-8' });

export async function toHtml({ title, settings, blocks, images }) {
  const url = {};
  for (const [id, b] of Object.entries(images)) url[id] = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  const body = blocks.map((b) => b.h.replace(/<img data-i="([a-f0-9]{24})"/g, (m, id) => `<img src="${url[id] || ''}"`).replace(/<sup class="fn" data-n="([^"]*)"><\/sup>/g, '<sup title="$1">*</sup>').replace(/<div class="(toc|pb)"><\/div>/g, '')).join('\n');
  return new Blob([`<!doctype html><html lang="${esc(settings.lang)}"><meta charset="utf-8"><title>${esc(title)}</title><style>body{max-width:46rem;margin:2rem auto;padding:0 1rem;font:${settings.fontSize}pt/${settings.line} ${esc(settings.font)},sans-serif;color:${esc(settings.color)}}h1,h2,h3,h4,.title{font-family:${esc(settings.headFont)},sans-serif;color:${esc(settings.headColor)};line-height:1.2}.title{font-size:2.2em;font-weight:700}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:.4em .6em;text-align:left}img{max-width:100%}figure{margin:1em 0}blockquote{border-left:3px solid #ccc;margin:1em 0;padding-left:1em}pre{background:#f4f4f2;padding:1em;overflow:auto}.callout{background:#eef5f1;padding:.6em 1em}</style>\n${body}`], { type: 'text/html;charset=utf-8' });
}

const mdInline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
function fromMarkdown(src) {
  const out = [];
  let list = null, code = null;
  for (const line of src.replace(/\r/g, '').split('\n')) {
    if (code !== null) { if (/^```/.test(line)) { out.push(`<pre>${esc(code.replace(/\n$/, ''))}</pre>`); code = null; } else code += line + '\n'; continue; }
    const li = line.match(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)/);
    const kind = li && (li[2] ? 'check' : /\d/.test(li[1]) ? 'ol' : 'ul');
    if (list && list.kind !== kind) { out.push(list.kind === 'ol' ? `<ol>${list.h}</ol>` : `<ul${list.kind === 'check' ? ' class="check"' : ''}>${list.h}</ul>`); list = null; }
    if (li) { list ||= { kind, h: '' }; list.h += `<li${li[2] && /x/i.test(li[2]) ? ' data-c="1"' : ''}>${mdInline(li[3])}</li>`; continue; }
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
  const wrap = (html) => ({ title, settings: { ...DEFAULTS }, blocks: html.map((h) => ({ id: newId(), h })), images: {} });
  let d;
  if (ext === 'savdoc') d = await fromSavdoc(await file.arrayBuffer());
  else if (ext === 'docx') d = await (await import('./docx.js')).fromDocx(await file.arrayBuffer());
  else if (ext === 'html' || ext === 'htm') d = wrap(cleanBlocks(await file.text()));
  else if (ext === 'md') d = wrap(fromMarkdown(await file.text()));
  else if (ext === 'txt') d = wrap((await file.text()).replace(/\r/g, '').split('\n').filter((l, i, a) => l.trim() || (i && a[i - 1].trim())).map((l) => `<p>${esc(l) || '<br>'}</p>`));
  else throw new Error('file_type');
  d.title = d.title || title;
  if (!d.blocks.length) d.blocks = [{ id: newId(), h: '<p><br></p>' }];
  return d;
}
