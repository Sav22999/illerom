/**
 * OpenDocument spreadsheets (.ods: LibreOffice, Collabora…), read and written without libraries. Kept: values, formulas
 * (ODF writes "of:=SUM([.A1:.B2])": they are turned into the common syntax and back), number formats (the common ones),
 * bold, italic, colours, fills, borders, alignment, widths and heights, hidden rows and columns, merged cells.
 */
import { zip, text } from './zip.js';
import { colName, key, extent, styleAt } from './model.js';
import { isErr } from './formula.js';
import { fromSerial, toSerial } from './format.js';

const T = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0', O = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0', ST = 'urn:oasis:names:tc:opendocument:xmlns:style:1.0', FO = 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0', N = 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0';
const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const a = (el, ns, n) => el?.getAttributeNS(ns, n) ?? null;
const kids = (el, ns, n) => (el ? [...el.children].filter((x) => x.namespaceURI === ns && x.localName === n) : []);
const len = (v) => { const m = /^([\d.]+)(cm|mm|in|pt|px)?$/.exec(v || ''); if (!m) return 0; return +m[1] * ({ cm: 37.795, mm: 3.7795, in: 96, pt: 96 / 72, px: 1 }[m[2] || 'px']); };

/** "of:=SUM([.A1:.B2];['Sheet 2'.C3])" → "=SUM(A1:B2,'Sheet 2'!C3)" */
export function fromOdf(f) {
  let s = f.replace(/^(of|oooc):/, '');
  if (!s.startsWith('=')) s = '=' + s;
  let out = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { q = !q; out += ch; continue; }
    if (q) { out += ch; continue; }
    if (ch === '[') {
      const end = s.indexOf(']', i), inner = s.slice(i + 1, end);
      i = end;
      out += inner.split(':').map((p, k) => { const m = /^\$?('(?:[^']|'')*'|[^.]*)\.(.*)$/.exec(p); if (!m) return p; const sheet = m[1]; return (sheet && (k === 0 || sheet !== '') ? sheet.replace(/^\$/, '') + '!' : '') + m[2]; }).join(':').replace(/^([^!]+!)(.*):\1/, '$1$2:');
      continue;
    }
    out += ch === ';' ? ',' : ch;
  }
  return out;
}
/** "=SUM(A1:B2,'Sheet 2'!C3)" → "of:=SUM([.A1:.B2];['Sheet 2'.C3])" */
export function toOdf(f) {
  let out = '', q = false;
  const s = f.slice(1), re = /^(?:('(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?(?![A-Za-z0-9_(])/;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { q = !q; out += ch; continue; }
    if (q) { out += ch; continue; }
    const prev = s[i - 1];
    if (!prev || !/[A-Za-z0-9_.$]/.test(prev)) {
      const m = re.exec(s.slice(i));
      if (m) { const sh = m[1] ? (m[1][0] === "'" ? m[1] : `'${m[1]}'`) : ''; out += `[${sh}.${m[2]}${m[3] ? ':' + (sh ? sh : '') + '.' + m[3] : ''}]`; i += m[0].length - 1; continue; }
    }
    out += ch === ',' ? ';' : ch;
  }
  return 'of:=' + out;
}

// ------------------------------------------------------------------ reading

export async function readOds(files) {
  const get = async (n) => (files.has(n) ? text(await files.get(n)()) : null);
  const doc = xml(await get('content.xml')), stylesDoc = xml((await get('styles.xml')) || '<r/>');
  // number styles: a format code for each
  const numFmt = {};
  for (const d of [stylesDoc, doc]) for (const el of d.getElementsByTagNameNS(N, '*')) {
    if (!/-style$/.test(el.localName) || !a(el, ST, 'name')) continue;
    const name = a(el, ST, 'name'), k = el.localName;
    if (k === 'percentage-style') { const n2 = el.getElementsByTagNameNS(N, 'number')[0]; const dp = +(a(n2, N, 'decimal-places') || 0); numFmt[name] = dp ? '0.' + '0'.repeat(dp) + '%' : '0%'; }
    else if (k === 'date-style') numFmt[name] = [...el.children].map((c) => c.localName === 'day' ? (a(c, N, 'style') === 'long' ? 'dd' : 'd') : c.localName === 'month' ? (a(c, N, 'textual') === 'true' ? (a(c, N, 'style') === 'long' ? 'mmmm' : 'mmm') : a(c, N, 'style') === 'long' ? 'mm' : 'm') : c.localName === 'year' ? (a(c, N, 'style') === 'long' ? 'yyyy' : 'yy') : c.localName === 'day-of-week' ? (a(c, N, 'style') === 'long' ? 'dddd' : 'ddd') : c.localName === 'hours' ? 'hh' : c.localName === 'minutes' ? 'mm' : c.localName === 'seconds' ? 'ss' : c.localName === 'text' ? (c.textContent.match(/^[\s/.,:-]*$/) ? c.textContent : `"${c.textContent}"`) : '').join('') || 'dd/mm/yyyy';
    else if (k === 'time-style') numFmt[name] = (a(el, N, 'truncate-on-overflow') === 'false' ? '[h]' : 'hh') + ':mm' + ([...el.children].some((c) => c.localName === 'seconds') ? ':ss' : '');
    else if (k === 'currency-style' || k === 'number-style') {
      const n2 = el.getElementsByTagNameNS(N, 'number')[0], sci = el.getElementsByTagNameNS(N, 'scientific-number')[0];
      if (sci) { numFmt[name] = '0.' + '0'.repeat(+(a(sci, N, 'decimal-places') || 2)) + 'E+00'; continue; }
      if (!n2) continue;
      const dp = +(a(n2, N, 'decimal-places') || 0), grp = a(n2, N, 'grouping') === 'true', core = (grp ? '#,##0' : '0') + (dp ? '.' + '0'.repeat(dp) : '');
      const sym = el.getElementsByTagNameNS(N, 'currency-symbol')[0]?.textContent;
      const order = [...el.children].map((c) => c.localName);
      numFmt[name] = sym ? (order.indexOf('currency-symbol') < order.indexOf('number') ? `"${sym}"${core}` : `${core} "${sym}"`) : core;
    }
  }
  // cell styles
  const cellSt = {}, colSt = {}, rowSt = {};
  for (const d of [stylesDoc, doc]) for (const s of d.getElementsByTagNameNS(ST, 'style')) {
    const name = a(s, ST, 'name'), fam = a(s, ST, 'family');
    if (fam === 'table-column') { const p = s.getElementsByTagNameNS(ST, 'table-column-properties')[0]; colSt[name] = Math.round(len(a(p, ST, 'column-width'))); continue; }
    if (fam === 'table-row') { const p = s.getElementsByTagNameNS(ST, 'table-row-properties')[0]; rowSt[name] = a(p, ST, 'use-optimal-row-height') === 'true' ? 0 : Math.round(len(a(p, ST, 'row-height'))); continue; }
    if (fam !== 'table-cell') continue;
    const o = { ...(cellSt[a(s, ST, 'parent-style-name')] || {}) }, tp = s.getElementsByTagNameNS(ST, 'text-properties')[0], cp = s.getElementsByTagNameNS(ST, 'table-cell-properties')[0], pp = s.getElementsByTagNameNS(ST, 'paragraph-properties')[0];
    if (tp) { if (a(tp, FO, 'font-weight') === 'bold') o.b = 1; if (a(tp, FO, 'font-style') === 'italic') o.i = 1; const u = a(tp, ST, 'text-underline-style'); if (u && u !== 'none') o.u = 1; const k2 = a(tp, ST, 'text-line-through-style'); if (k2 && k2 !== 'none') o.k = 1; const c = a(tp, FO, 'color'); if (c && /^#[0-9a-f]{6}$/i.test(c) && c.toLowerCase() !== '#000000') o.c = c.toLowerCase(); const fz = parseFloat(a(tp, FO, 'font-size')); if (fz && fz !== 10) o.fz = fz; }
    if (cp) {
      const bg = a(cp, FO, 'background-color'); if (bg && /^#[0-9a-f]{6}$/i.test(bg) && bg.toLowerCase() !== '#ffffff') o.bg = bg.toLowerCase();
      const va = a(cp, ST, 'vertical-align'); if (va === 'middle') o.va = 'm'; else if (va === 'top') o.va = 't';
      if (a(cp, FO, 'wrap-option') === 'wrap') o.w = 1;
      const bd = (v) => { const m = /([\d.]+(?:cm|mm|in|pt|px))\s+(solid|dashed|dotted|double)\s+(#[0-9a-f]{6})/i.exec(v || ''); if (!m) return ''; const w = len(m[1]); return (m[2] === 'solid' ? (w > 2.2 ? 'thick' : w > 1.2 ? 'medium' : 'thin') : m[2]) + ' ' + m[3].toLowerCase(); };
      const all = bd(a(cp, FO, 'border'));
      for (const [side, k2] of [['top', 'bt'], ['right', 'br'], ['bottom', 'bb'], ['left', 'bl']]) { const v = bd(a(cp, FO, 'border-' + side)) || all; if (v) o[k2] = v; }
    }
    if (pp) { const ta = a(pp, FO, 'text-align'); if (ta === 'center') o.ha = 'c'; else if (ta === 'end' || ta === 'right') o.ha = 'r'; else if (ta === 'start' || ta === 'left') o.ha = 'l'; }
    const ds = a(s, ST, 'data-style-name');
    if (ds && numFmt[ds]) o.nf = numFmt[ds];
    cellSt[name] = o;
  }
  const sheets = [];
  for (const tb of doc.getElementsByTagNameNS(T, 'table')) {
    const cells = {}, cols = {}, rows = {}, merges = [];
    let c0 = 1;
    const colDefault = [];
    for (const col of tb.getElementsByTagNameNS(T, 'table-column')) {
      const n2 = Math.min(+(a(col, T, 'number-columns-repeated') || 1), 702 - c0 + 1), w = colSt[a(col, T, 'style-name')], hid = a(col, T, 'visibility') === 'collapse', ds = a(col, T, 'default-cell-style-name');
      for (let i = 0; i < n2 && c0 <= 702; i++, c0++) { const o = {}; if (w && Math.abs(w - 85) > 3) o.w = w; if (hid) o.x = 1; if (Object.keys(o).length) cols[colName(c0)] = o; colDefault[c0] = ds; }
      if (c0 > 702) break;
    }
    let r = 1;
    for (const row of tb.getElementsByTagNameNS(T, 'table-row')) {
      const rep = +(a(row, T, 'number-rows-repeated') || 1), hh = rowSt[a(row, T, 'style-name')], hid = a(row, T, 'visibility') === 'collapse';
      const has = [...row.children].some((c) => c.firstElementChild || a(c, O, 'value-type') || a(c, T, 'formula'));
      if (!has && rep > 50) { r += rep; if (r > 100000) break; continue; }
      for (let k = 0; k < Math.min(rep, 1000) && r <= 100000; k++, r++) {
        if (hh && Math.abs(hh - 17) > 2) rows[r] = { ...(rows[r] || {}), h: hh };
        if (hid) rows[r] = { ...(rows[r] || {}), x: 1 };
        let c = 1;
        for (const cell of row.children) {
          if (cell.namespaceURI !== T) continue;
          const crep = Math.min(+(a(cell, T, 'number-columns-repeated') || 1), 702);
          if (cell.localName === 'covered-table-cell') { c += crep; continue; }
          const type = a(cell, O, 'value-type'), f = a(cell, T, 'formula'), sn = a(cell, T, 'style-name') || colDefault[c], s = cellSt[sn] || {};
          let v;
          if (type === 'float' || type === 'percentage' || type === 'currency') v = +a(cell, O, 'value');
          else if (type === 'date') { const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d):(\d\d))?/.exec(a(cell, O, 'date-value') || ''); if (m) v = toSerial(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
          else if (type === 'time') { const m = /PT(\d+)H(\d+)M([\d.]+)S/.exec(a(cell, O, 'time-value') || ''); if (m) v = (+m[1] * 3600 + +m[2] * 60 + +m[3]) / 86400; }
          else if (type === 'boolean') v = a(cell, O, 'boolean-value') === 'true';
          else if (type === 'string' || cell.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'p').length) v = [...cell.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'p')].map((p) => p.textContent).join('\n') || undefined;
          if (crep > 1 && v === undefined && !f && !Object.keys(s).length) { c += crep; continue; }
          for (let j = 0; j < Math.min(crep, 200) && c <= 702; j++, c++) {
            const o = {};
            if (v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v))) o.v = v;
            if (f) o.f = fromOdf(f);
            if (Object.keys(s).length) o.s = s;
            if (type === 'date' && !s.nf) o.s = { ...(o.s || {}), nf: v % 1 ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy' };
            if (type === 'percentage' && !s.nf) o.s = { ...(o.s || {}), nf: '0%' };
            if (Object.keys(o).length) cells[key(r, c)] = o;
            const rs = +(a(cell, T, 'number-rows-spanned') || 1), cs = +(a(cell, T, 'number-columns-spanned') || 1);
            if (rs > 1 || cs > 1) merges.push(key(r, c) + ':' + key(r + rs - 1, c + cs - 1));
          }
          if (crep > 200) c += crep - 200;
        }
      }
      if (r > 100000) break;
    }
    sheets.push({ name: a(tb, T, 'name'), cells, cols, rows, merges, cf: [], dv: [], charts: [] });
  }
  if (!sheets.length) throw Object.assign(new Error('file_invalid'), { code: 'file_invalid' });
  return { title: '', settings: { lang: 'en' }, sheets };
}

// ------------------------------------------------------------------ writing

/** A number format as an ODF data style (the common kinds). */
function dataStyle(name, nf) {
  const dec = (s) => (/\.(0+)/.exec(s)?.[1].length || 0);
  if (/%/.test(nf)) return `<number:percentage-style style:name="${name}"><number:number number:decimal-places="${dec(nf)}" number:min-decimal-places="${dec(nf)}" number:min-integer-digits="1"/><number:text>%</number:text></number:percentage-style>`;
  const clean = nf.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
  if (/[dmyhs]/i.test(clean) && !/[0#]/.test(clean)) {
    const parts = [], re = /(yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|"[^"]*"|.)/gi;
    const timeAround = (i, arr) => /h/i.test(arr[i - 1] || '') || /s/i.test(arr[i + 1] || '') || /h/i.test(arr[i - 2] || '');
    const toks = nf.match(re) || [];
    toks.forEach((tk, i) => {
      const l = tk.toLowerCase();
      if (l === 'yyyy') parts.push('<number:year number:style="long"/>'); else if (l === 'yy') parts.push('<number:year/>');
      else if (l === 'mmmm') parts.push('<number:month number:textual="true" number:style="long"/>'); else if (l === 'mmm') parts.push('<number:month number:textual="true"/>');
      else if (l === 'mm' || l === 'm') parts.push(timeAround(i, toks.map((x) => x.toLowerCase())) ? `<number:minutes${l === 'mm' ? ' number:style="long"' : ''}/>` : `<number:month${l === 'mm' ? ' number:style="long"' : ''}/>`);
      else if (l === 'dddd') parts.push('<number:day-of-week number:style="long"/>'); else if (l === 'ddd') parts.push('<number:day-of-week/>');
      else if (l === 'dd') parts.push('<number:day number:style="long"/>'); else if (l === 'd') parts.push('<number:day/>');
      else if (l === 'hh') parts.push('<number:hours number:style="long"/>'); else if (l === 'h') parts.push('<number:hours/>');
      else if (l === 'ss') parts.push('<number:seconds number:style="long"/>'); else if (l === 's') parts.push('<number:seconds/>');
      else if (l === 'am/pm') parts.push('<number:am-pm/>');
      else parts.push(`<number:text>${esc(tk.replace(/^"|"$/g, ''))}</number:text>`);
    });
    return `<number:date-style style:name="${name}">${parts.join('')}</number:date-style>`;
  }
  const cur = /"([^"]+)"/.exec(nf)?.[1], before = cur && nf.indexOf('"') < nf.search(/[0#]/);
  const num = `<number:number number:decimal-places="${dec(nf)}" number:min-decimal-places="${dec(nf)}" number:min-integer-digits="1"${/#,##/.test(nf) ? ' number:grouping="true"' : ''}/>`;
  if (/E\+/.test(nf)) return `<number:number-style style:name="${name}"><number:scientific-number number:decimal-places="${dec(nf)}" number:min-integer-digits="1" number:min-exponent-digits="2"/></number:number-style>`;
  if (cur) return `<number:currency-style style:name="${name}">${before ? `<number:currency-symbol>${esc(cur)}</number:currency-symbol>${num}` : `${num}<number:text> </number:text><number:currency-symbol>${esc(cur)}</number:currency-symbol>`}</number:currency-style>`;
  return `<number:number-style style:name="${name}">${num}</number:number-style>`;
}

export async function writeOds(b) {
  const auto = [], data = [], cellIx = new Map(), dataIx = new Map(), colIx = new Map(), rowIx = new Map();
  const cellStyle = (s) => {
    if (!s || !Object.keys(s).length) return '';
    const k = JSON.stringify(s);
    if (cellIx.has(k)) return cellIx.get(k);
    const name = 'ce' + (cellIx.size + 1);
    let ds = '';
    if (s.nf) { if (!dataIx.has(s.nf)) { const n2 = 'N' + (dataIx.size + 1); dataIx.set(s.nf, n2); data.push(dataStyle(n2, s.nf)); } ds = ` style:data-style-name="${dataIx.get(s.nf)}"`; }
    const bd = (v) => { if (!v) return 'none'; const [kind, c] = v.split(' '); return `${kind === 'thick' ? '2.5pt' : kind === 'medium' ? '1.5pt' : '0.75pt'} ${['dashed', 'dotted', 'double'].includes(kind) ? kind : 'solid'} ${c}`; };
    const cp = `<style:table-cell-properties${s.bg ? ` fo:background-color="${s.bg}"` : ''}${s.va ? ` style:vertical-align="${s.va === 'm' ? 'middle' : 'top'}"` : ''}${s.w ? ' fo:wrap-option="wrap"' : ''}${s.bt || s.br || s.bb || s.bl ? ` fo:border-top="${bd(s.bt)}" fo:border-right="${bd(s.br)}" fo:border-bottom="${bd(s.bb)}" fo:border-left="${bd(s.bl)}"` : ''}${s.ha ? ' style:text-align-source="fix"' : ''}${s.rot ? ` style:rotation-angle="${s.rot < 0 ? 360 + s.rot : s.rot}"` : ''}/>`;
    const pp = s.ha ? `<style:paragraph-properties fo:text-align="${{ l: 'start', c: 'center', r: 'end' }[s.ha]}"${s.ind ? ` fo:margin-left="${s.ind * 0.3}cm"` : ''}/>` : '';
    const tp = s.b || s.i || s.u || s.k || s.c || s.fz || s.ff ? `<style:text-properties${s.b ? ' fo:font-weight="bold"' : ''}${s.i ? ' fo:font-style="italic"' : ''}${s.u ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : ''}${s.k ? ' style:text-line-through-style="solid"' : ''}${s.c ? ` fo:color="${s.c}"` : ''}${s.fz ? ` fo:font-size="${s.fz}pt"` : ''}${s.ff ? ` style:font-name="${{ sans: 'Liberation Sans', serif: 'Liberation Serif', mono: 'Liberation Mono', round: 'Liberation Sans', hand: 'Comic Sans MS', narrow: 'Liberation Sans Narrow' }[s.ff]}"` : ''}/>` : '';
    auto.push(`<style:style style:name="${name}" style:family="table-cell" style:parent-style-name="Default"${ds}>${cp}${pp}${tp}</style:style>`);
    cellIx.set(k, name);
    return name;
  };
  const colStyle = (w) => { const k = Math.round(w); if (!colIx.has(k)) { const n2 = 'co' + (colIx.size + 1); colIx.set(k, n2); auto.push(`<style:style style:name="${n2}" style:family="table-column"><style:table-column-properties fo:break-before="auto" style:column-width="${(k / 37.795).toFixed(3)}cm"/></style:style>`); } return colIx.get(k); };
  const rowStyle = (hh) => { const k = Math.round(hh); if (!rowIx.has(k)) { const n2 = 'ro' + (rowIx.size + 1); rowIx.set(k, n2); auto.push(`<style:style style:name="${n2}" style:family="table-row"><style:table-row-properties style:row-height="${(k / 37.795).toFixed(3)}cm" fo:break-before="auto" style:use-optimal-row-height="${k === 24 ? 'true' : 'false'}"/></style:style>`); } return rowIx.get(k); };
  const tables = b.sheets.map((sh) => {
    const ext = extent(sh), R = Math.max(1, ext.r), C = Math.max(1, ext.c), cover = new Set(), span = new Map();
    for (const m of sh.merges) { const [p, q] = m.split(':'), g = /^([A-Z]+)(\d+)$/.exec(p), h2 = /^([A-Z]+)(\d+)$/.exec(q); let c1 = 0, c2 = 0; for (const ch of g[1]) c1 = c1 * 26 + ch.charCodeAt(0) - 64; for (const ch of h2[1]) c2 = c2 * 26 + ch.charCodeAt(0) - 64; span.set(p, [+h2[2] - +g[2] + 1, c2 - c1 + 1]); for (let r = +g[2]; r <= +h2[2]; r++) for (let c = c1; c <= c2; c++) if (r !== +g[2] || c !== c1) cover.add(key(r, c)); }
    let x = `<table:table table:name="${esc(sh.name)}"${sh.hidden ? ' table:display="false"' : ''}>`;
    for (let c = 1; c <= C; c++) { const o = sh.cols[colName(c)] || {}; x += `<table:table-column table:style-name="${colStyle(o.w || 100)}"${o.x ? ' table:visibility="collapse"' : ''} table:default-cell-style-name="Default"/>`; }
    for (let r = 1; r <= R; r++) {
      const ro = sh.rows[r] || {};
      x += `<table:table-row table:style-name="${rowStyle(ro.h || 24)}"${ro.x ? ' table:visibility="collapse"' : ''}>`;
      for (let c = 1; c <= C; c++) {
        const k = key(r, c);
        if (cover.has(k)) { x += '<table:covered-table-cell/>'; continue; }
        const cell = sh.cells[k], st = styleAt(sh, r, c, cell), sn = cellStyle(st), sp = span.get(k), v = cell?.f ? b.value(sh, k) : cell?.v;
        let at = sn ? ` table:style-name="${sn}"` : '';
        if (sp) at += ` table:number-rows-spanned="${sp[0]}" table:number-columns-spanned="${sp[1]}"`;
        if (cell?.f) at += ` table:formula="${esc(toOdf(cell.f))}"`;
        const shownText = b.text(sh, r, c);
        if (typeof v === 'number') {
          const nf = st.nf || '';
          if (/%/.test(nf)) at += ` office:value-type="percentage" office:value="${v}"`;
          else if (/[dmyhs]/i.test(nf.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '')) && !/[0#]/.test(nf.replace(/"[^"]*"/g, '')) && v >= 0) { const d = fromSerial(v), iso = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}T${String(d.hh).padStart(2, '0')}:${String(d.mi).padStart(2, '0')}:${String(d.ss).padStart(2, '0')}`; at += v < 1 && !/[dmy]/i.test(nf.replace(/m+(?=[^dy]*$)/i, '')) ? ` office:value-type="time" office:time-value="PT${d.hh}H${d.mi}M${d.ss}S"` : ` office:value-type="date" office:date-value="${iso}"`; }
          else if (/"[^"]*[€$£¥]|CHF|kr|zł/.test(nf)) at += ` office:value-type="currency" office:value="${v}"`;
          else at += ` office:value-type="float" office:value="${v}"`;
          x += `<table:table-cell${at}><text:p>${esc(shownText)}</text:p></table:table-cell>`;
        } else if (typeof v === 'boolean') x += `<table:table-cell${at} office:value-type="boolean" office:boolean-value="${v}"><text:p>${v ? 'TRUE' : 'FALSE'}</text:p></table:table-cell>`;
        else if (typeof v === 'string' && v !== '') x += `<table:table-cell${at} office:value-type="string">${v.split('\n').map((l) => `<text:p>${esc(l)}</text:p>`).join('')}</table:table-cell>`;
        else if (isErr(v)) x += `<table:table-cell${at}><text:p>${esc(v.code)}</text:p></table:table-cell>`;
        else x += `<table:table-cell${at}/>`;
      }
      x += '</table:table-row>';
    }
    return x + '</table:table>';
  });
  const NSS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"';
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${NSS} office:version="1.3"><office:automatic-styles>${data.join('')}${auto.join('')}</office:automatic-styles><office:body><office:spreadsheet>${tables.join('')}</office:spreadsheet></office:body></office:document-content>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ${NSS} office:version="1.3"><office:styles><style:default-style style:family="table-cell"><style:text-properties style:font-name="Liberation Sans" fo:font-size="10pt"/></style:default-style><style:style style:name="Default" style:family="table-cell"/></office:styles></office:document-styles>`;
  const meta = `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta ${NSS} office:version="1.3"><office:meta><dc:title>${esc(b.title)}</dc:title><meta:generator>SavSpreadsheets</meta:generator></office:meta></office:document-meta>`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>`;
  return new Blob([await zip([['mimetype', 'application/vnd.oasis.opendocument.spreadsheet', { store: true }], ['META-INF/manifest.xml', manifest], ['content.xml', content], ['styles.xml', styles], ['meta.xml', meta]])], { type: 'application/vnd.oasis.opendocument.spreadsheet' });
}
