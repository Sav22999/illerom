/**
 * Excel files (.xlsx, Office Open XML), read and written without libraries. Kept: values, formulas (shared ones too),
 * the results of formulas, number formats, fonts, colours (of the theme too), fills, borders, alignment, widths and
 * heights, hidden rows and columns, merged cells, frozen panes, tab colours, grid lines, filters, list validations and
 * the simplest conditional formats. Charts and pictures of the file are not read.
 */
import { zip, text } from './zip.js';
import { colName, key, moveFormula, parseRange, extent, styleAt } from './model.js';
import { isErr } from './formula.js';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const all = (el, name) => (el ? [...el.getElementsByTagNameNS('*', name)] : []);
const one = (el, name) => all(el, name)[0] || null;
const kids = (el, name) => (el ? [...el.children].filter((x) => x.localName === name) : []);
const attr = (el, a) => el?.getAttribute(a) ?? null;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

/** Number formats every Excel file may use without writing them. */
export const BUILTIN = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??', 14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd/mm/yyyy h:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@' };
/** Functions newer than Excel 2007 are written with this prefix in the files. */
export const XLFN = new Set(['IFS', 'SWITCH', 'XOR', 'IFNA', 'CONCAT', 'TEXTJOIN', 'MAXIFS', 'MINIFS', 'XLOOKUP', 'XMATCH', 'FILTER', 'SORT', 'SORTBY', 'UNIQUE', 'SEQUENCE', 'RANDARRAY', 'STDEV.S', 'STDEV.P', 'VAR.S', 'VAR.P', 'MODE.SNGL', 'PERCENTILE.INC', 'PERCENTILE.EXC', 'QUARTILE.INC', 'RANK.EQ', 'RANK.AVG', 'CEILING.MATH', 'FLOOR.MATH', 'ISOWEEKNUM', 'DAYS', 'NORM.DIST', 'NORM.S.DIST', 'COVARIANCE.P', 'COVARIANCE.S', 'FORECAST.LINEAR', 'TEXTBEFORE', 'TEXTAFTER', 'TEXTSPLIT', 'HSTACK', 'VSTACK', 'UNICHAR', 'UNICODE', 'NUMBERVALUE', 'PERCENTRANK.INC', 'FORMULATEXT', 'ISFORMULA']);

// ------------------------------------------------------------------ colours

function themeColors(doc) {
  const out = [];
  const s = one(doc, 'clrScheme');
  if (!s) return out;
  const pick = (n) => { const e = kids(s, n)[0]; const c = e && (one(e, 'srgbClr') || one(e, 'sysClr')); return c ? '#' + (attr(c, 'val')?.length === 6 ? attr(c, 'val') : attr(c, 'lastClr') || '000000').toLowerCase() : '#000000'; };
  // the order of the indexes: light 1, dark 1, light 2, dark 2, the six accents, link, followed link
  for (const n of ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) out.push(pick(n));
  return out;
}
const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99', '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
function tint(hex, t) {
  if (!t) return hex;
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).map((v) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t));
  return '#' + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
function color(el, theme) {
  if (!el) return '';
  const rgb = attr(el, 'rgb'), th = attr(el, 'theme'), ix = attr(el, 'indexed'), tn = +(attr(el, 'tint') || 0);
  let c = '';
  if (rgb) c = '#' + rgb.slice(-6).toLowerCase();
  else if (th !== null && theme[+th]) c = theme[+th];
  else if (ix !== null && INDEXED[+ix]) c = '#' + INDEXED[+ix].toLowerCase();
  return c ? tint(c, tn) : '';
}

// ------------------------------------------------------------------ reading

export async function readXlsx(files) {
  const get = async (n) => { const f = files.get(n) || files.get(n.replace(/^\//, '')); return f ? text(await f()) : null; };
  const wb = xml(await get('xl/workbook.xml')), rels = xml((await get('xl/_rels/workbook.xml.rels')) || '<r/>');
  const target = (id) => { const r = all(rels, 'Relationship').find((x) => attr(x, 'Id') === id); if (!r) return null; const t2 = attr(r, 'Target'); return t2.startsWith('/') ? t2.slice(1) : 'xl/' + t2.replace(/^\.\//, ''); };
  const date1904 = attr(one(wb, 'workbookPr'), 'date1904') === '1' || attr(one(wb, 'workbookPr'), 'date1904') === 'true';
  const theme = themeColors(xml((await get('xl/theme/theme1.xml')) || '<r/>'));
  // shared texts
  const sst = [];
  const ss = await get('xl/sharedStrings.xml');
  if (ss) for (const si of all(xml(ss), 'si')) sst.push(all(si, 't').filter((x) => x.parentNode.localName !== 'rPh').map((x) => x.textContent).join(''));
  // styles
  const st = xml((await get('xl/styles.xml')) || '<r/>'), fmts = { ...BUILTIN };
  for (const f of all(st, 'numFmt')) fmts[attr(f, 'numFmtId')] = attr(f, 'formatCode');
  const fonts = kids(one(st, 'fonts'), 'font').map((f) => { const o = {}; if (one(f, 'b') && attr(one(f, 'b'), 'val') !== '0') o.b = 1; if (one(f, 'i') && attr(one(f, 'i'), 'val') !== '0') o.i = 1; if (one(f, 'u') && attr(one(f, 'u'), 'val') !== 'none') o.u = 1; if (one(f, 'strike') && attr(one(f, 'strike'), 'val') !== '0') o.k = 1; const sz = +attr(one(f, 'sz'), 'val'); if (sz && sz !== 11) o.fz = sz; const c = color(one(f, 'color'), theme); if (c && c !== '#000000') o.c = c; const n = (attr(one(f, 'name'), 'val') || '').toLowerCase(); if (/times|georgia|serif|cambria|garamond|book/.test(n) && !/sans/.test(n)) o.ff = 'serif'; else if (/courier|mono|consol/.test(n)) o.ff = 'mono'; else if (/comic|script|hand/.test(n)) o.ff = 'hand'; else if (/narrow|condensed/.test(n)) o.ff = 'narrow'; return o; });
  const fills = kids(one(st, 'fills'), 'fill').map((f) => { const p = one(f, 'patternFill'); if (!p || !attr(p, 'patternType') || attr(p, 'patternType') === 'none') return ''; return color(one(p, 'fgColor'), theme) || color(one(p, 'bgColor'), theme); });
  const KIND = { thin: 'thin', hair: 'thin', medium: 'medium', thick: 'thick', dashed: 'dashed', mediumDashed: 'dashed', dashDot: 'dashed', mediumDashDot: 'dashed', dashDotDot: 'dotted', mediumDashDotDot: 'dotted', slantDashDot: 'dashed', dotted: 'dotted', double: 'double' };
  const borders = kids(one(st, 'borders'), 'border').map((b) => { const o = {}; for (const [side, k] of [['top', 'bt'], ['right', 'br'], ['bottom', 'bb'], ['left', 'bl']]) { const e = kids(b, side)[0], kind = KIND[attr(e, 'style')]; if (kind) o[k] = kind + ' ' + (color(one(e, 'color'), theme) || '#1c1c1c'); } return o; });
  const xfs = kids(one(st, 'cellXfs'), 'xf').map((x) => {
    const s = { ...(fonts[+attr(x, 'fontId')] || {}), ...(borders[+attr(x, 'borderId')] || {}) }, bg = fills[+attr(x, 'fillId')], nf = fmts[attr(x, 'numFmtId') || '0'];
    if (bg && bg !== '#ffffff') s.bg = bg;
    if (nf && nf !== 'General') s.nf = nf.replace(/\\-/g, '-').replace(/\[\$-[0-9A-F]+\]/gi, '');
    const al = one(x, 'alignment');
    if (al) { const hz = attr(al, 'horizontal'), vt = attr(al, 'vertical'); if (hz === 'center' || hz === 'centerContinuous') s.ha = 'c'; else if (hz === 'right') s.ha = 'r'; else if (hz === 'left') s.ha = 'l'; if (vt === 'center') s.va = 'm'; else if (vt === 'top') s.va = 't'; if (attr(al, 'wrapText') === '1' || attr(al, 'wrapText') === 'true') s.w = 1; if (+attr(al, 'indent')) s.ind = +attr(al, 'indent'); const rot = +attr(al, 'textRotation'); if (rot && rot <= 90) s.rot = rot; else if (rot > 90 && rot <= 180) s.rot = 90 - rot; }
    return s;
  });
  const dxfs = kids(one(st, 'dxfs'), 'dxf').map((d) => { const o = {}; const f = one(d, 'font'); if (f) { if (one(f, 'b')) o.b = 1; if (one(f, 'i')) o.i = 1; const c = color(one(f, 'color'), theme); if (c) o.c = c; } const p = one(d, 'fill'); if (p) { const c = color(one(p, 'bgColor'), theme) || color(one(p, 'fgColor'), theme); if (c) o.bg = c; } return o; });
  const sheets = [];
  for (const s of all(wb, 'sheet')) {
    const path = target(attr(s, 'r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const src = path && (await get(path));
    if (!src) continue;
    const doc = xml(src), cells = {}, cols = {}, rows = {}, shared = {};
    const defW = +attr(one(doc, 'sheetFormatPr'), 'defaultColWidth') || 0;
    for (const c of all(doc, 'col')) {
      const w = +attr(c, 'width'), hid = attr(c, 'hidden') === '1' || attr(c, 'hidden') === 'true', sx = +attr(c, 'style') || 0;
      for (let i = +attr(c, 'min'); i <= Math.min(+attr(c, 'max'), 702); i++) { const o = {}; if (w && (attr(c, 'customWidth') === '1' || Math.abs(w - 8.43) > 0.3)) o.w = Math.round(w * 7 + 5); if (hid) o.x = 1; if (sx && xfs[sx] && Object.keys(xfs[sx]).length) o.s = xfs[sx]; if (Object.keys(o).length) cols[colName(i)] = o; }
    }
    if (defW && !Object.keys(cols).length) { /* the default width is the one of the app */ }
    for (const row of all(doc, 'row')) {
      const r = +attr(row, 'r');
      if (r > 100000) break;
      const o = {}, ht = +attr(row, 'ht');
      if (ht && attr(row, 'customHeight') === '1') o.h = Math.round(ht * 96 / 72);
      if (attr(row, 'hidden') === '1' || attr(row, 'hidden') === 'true') o.x = 1;
      if (Object.keys(o).length) rows[r] = o;
      for (const c of kids(row, 'c')) {
        const ref = attr(c, 'r');
        if (!ref || !/^[A-Z]{1,2}\d+$/.test(ref)) continue;
        const ty = attr(c, 't'), vEl = kids(c, 'v')[0], fEl = kids(c, 'f')[0], s = xfs[+attr(c, 's') || 0] || {};
        let v;
        if (ty === 's') v = sst[+vEl?.textContent];
        else if (ty === 'inlineStr') v = all(c, 't').map((x) => x.textContent).join('');
        else if (ty === 'b') v = vEl?.textContent === '1';
        else if (ty === 'str') v = vEl?.textContent ?? '';
        else if (ty === 'e') v = undefined;
        else if (vEl) { v = +vEl.textContent; if (date1904 && s.nf && /[dmy]/i.test(s.nf)) v += 1462; }
        let f = null;
        if (fEl) {
          const si = attr(fEl, 'si'), body = fEl.textContent;
          if (attr(fEl, 't') === 'shared' && si !== null) {
            if (body) shared[si] = { f: '=' + body, ref };
            else if (shared[si]) { const a = parseRange(shared[si].ref), b = parseRange(ref); f = moveFormula(shared[si].f, b.r1 - a.r1, b.c1 - a.c1); }
          }
          if (body) f = '=' + body;
          if (f) f = f.replace(/_xlfn\.(_xlws\.)?/g, '').replace(/_xlpm\./g, '');
        }
        const cell = {};
        if (v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v))) cell.v = v;
        if (f) cell.f = f;
        if (Object.keys(s).length) cell.s = s;
        if (Object.keys(cell).length) cells[ref] = cell;
      }
    }
    const view = one(doc, 'sheetView'), pane = one(view, 'pane'), freeze = { r: 0, c: 0 };
    if (pane && (attr(pane, 'state') === 'frozen' || attr(pane, 'state') === 'frozenSplit')) { freeze.r = Math.round(+attr(pane, 'ySplit') || 0); freeze.c = Math.round(+attr(pane, 'xSplit') || 0); }
    const tab = one(one(doc, 'sheetPr'), 'tabColor');
    const cf = [];
    for (const block of all(doc, 'conditionalFormatting')) {
      const r = (attr(block, 'sqref') || '').split(' ')[0];
      for (const rule of kids(block, 'cfRule')) {
        const type = attr(rule, 'type'), op = attr(rule, 'operator'), fs = kids(rule, 'formula').map((x) => x.textContent), s = dxfs[+attr(rule, 'dxfId')] || {};
        const k = type === 'cellIs' ? { greaterThan: 'gt', lessThan: 'lt', greaterThanOrEqual: 'ge', lessThanOrEqual: 'le', equal: 'eq', notEqual: 'ne', between: 'between' }[op] : type === 'containsText' ? 'text' : type === 'containsBlanks' ? 'empty' : type === 'notContainsBlanks' ? 'filled' : type === 'duplicateValues' ? 'dup' : type === 'top10' ? 'top' : type === 'expression' ? 'formula' : type === 'colorScale' ? 'scale' : type === 'dataBar' ? 'bars' : null;
        if (!k) continue;
        const x = { r, k, a: type === 'containsText' ? attr(rule, 'text') || '' : type === 'top10' ? attr(rule, 'rank') || '10' : (fs[0] || '').replace(/^"|"$/g, ''), b: (fs[1] || '').replace(/^"|"$/g, ''), s };
        if (k === 'scale') { const cs = all(rule, 'color').map((e) => color(e, theme)); x.c1 = cs[0]; if (cs.length === 3) { x.c3 = cs[1]; x.c2 = cs[2]; } else x.c2 = cs[1]; }
        if (k === 'bars') x.c1 = color(one(rule, 'color'), theme) || '#638ec6';
        cf.push(x);
      }
    }
    const dv = [];
    for (const d of all(doc, 'dataValidation')) {
      const r = (attr(d, 'sqref') || '').split(' ')[0], type = attr(d, 'type'), f1 = one(d, 'formula1')?.textContent || '', f2 = one(d, 'formula2')?.textContent || '';
      if (type === 'list' && /^".*"$/.test(f1)) dv.push({ r, k: 'list', list: f1.slice(1, -1).split(','), strict: attr(d, 'errorStyle') !== 'warning' && attr(d, 'errorStyle') !== 'information' });
      else if (type === 'whole' || type === 'decimal' || type === 'date' || type === 'textLength') dv.push({ r, k: type === 'whole' ? 'int' : type === 'decimal' ? 'number' : type === 'date' ? 'date' : 'text', list: [], a: f1, b: f2, strict: true });
    }
    const af = one(doc, 'autoFilter');
    sheets.push({ name: attr(s, 'name'), hidden: attr(s, 'state') === 'hidden' || attr(s, 'state') === 'veryHidden', cells, cols, rows, freeze, grid: attr(view, 'showGridLines') !== '0' && attr(view, 'showGridLines') !== 'false',
      merges: all(doc, 'mergeCell').map((m) => attr(m, 'ref')).filter((x) => x && x.includes(':')), color: tab ? color(tab, theme) : '', cf, dv, filter: af && attr(af, 'ref')?.includes(':') ? { r: attr(af, 'ref'), h: {} } : null, charts: [] });
  }
  if (!sheets.length) throw Object.assign(new Error('file_invalid'), { code: 'file_invalid' });
  const title = (await get('docProps/core.xml'))?.match(/<dc:title>([^<]*)<\/dc:title>/)?.[1];
  return { title: title ? new DOMParser().parseFromString(title, 'text/html').body.textContent : '', settings: { lang: 'en' }, sheets };
}

// ------------------------------------------------------------------ writing

const FONT = { sans: 'Calibri', serif: 'Cambria', mono: 'Consolas', round: 'Arial Rounded MT Bold', hand: 'Comic Sans MS', narrow: 'Arial Narrow' };
const RGB = (c) => 'FF' + c.slice(1).toUpperCase();
/** A formula as Excel keeps it: without "=", with the prefix of the newer functions. */
export const xlFormula = (f) => f.slice(1).replace(/("(?:[^"]|"")*")|\b([A-Z][A-Z0-9.]*)(?=\()/g, (m, q, n) => (q ? q : XLFN.has(n) ? '_xlfn.' + n : n));

export async function writeXlsx(b) {
  const fonts = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], numFmts = [], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const fontIx = new Map(), fillIx = new Map(), borderIx = new Map(), fmtIx = new Map(), xfIx = new Map([['{}', 0]]), dxfs = [];
  const builtinIx = Object.fromEntries(Object.entries(BUILTIN).map(([k, v]) => [v, +k]));
  const ix = (map, list, k, mk) => { if (!map.has(k)) { map.set(k, list.length); list.push(mk()); } return map.get(k); };
  const xf = (s) => {
    if (!s || !Object.keys(s).length) return 0;
    const k = JSON.stringify(s);
    if (xfIx.has(k)) return xfIx.get(k);
    const fk = JSON.stringify([s.b, s.i, s.u, s.k, s.c, s.fz, s.ff]);
    const font = ix(fontIx, fonts, fk, () => `<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}${s.k ? '<strike/>' : ''}${s.u ? '<u/>' : ''}<sz val="${s.fz || 11}"/>${s.c ? `<color rgb="${RGB(s.c)}"/>` : ''}<name val="${FONT[s.ff] || 'Calibri'}"/></font>`) + (fontIx.size === fonts.length - 1 ? 0 : 0);
    const fill = s.bg ? ix(fillIx, fills, s.bg, () => `<fill><patternFill patternType="solid"><fgColor rgb="${RGB(s.bg)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const side = (n, v) => { if (!v) return `<${n}/>`; const [kind, c] = v.split(' '); return `<${n} style="${kind}"><color rgb="${RGB(c)}"/></${n}>`; };
    const bk = JSON.stringify([s.bl, s.br, s.bt, s.bb]);
    const border = s.bl || s.br || s.bt || s.bb ? ix(borderIx, borders, bk, () => `<border>${side('left', s.bl)}${side('right', s.br)}${side('top', s.bt)}${side('bottom', s.bb)}<diagonal/></border>`) : 0;
    let fmt = 0;
    if (s.nf) fmt = builtinIx[s.nf] ?? (fmtIx.has(s.nf) ? fmtIx.get(s.nf) : (fmtIx.set(s.nf, 164 + numFmts.length), numFmts.push(`<numFmt numFmtId="${164 + numFmts.length}" formatCode="${esc(s.nf)}"/>`), fmtIx.get(s.nf)));
    const al = s.ha || s.va || s.w || s.ind || s.rot ? `<alignment${s.ha ? ` horizontal="${{ l: 'left', c: 'center', r: 'right' }[s.ha]}"` : ''} vertical="${{ t: 'top', m: 'center' }[s.va] || 'bottom'}"${s.w ? ' wrapText="1"' : ''}${s.ind ? ` indent="${s.ind}"` : ''}${s.rot ? ` textRotation="${s.rot > 0 ? s.rot : 90 - s.rot}"` : ''}/>` : '';
    xfIx.set(k, xfs.length);
    xfs.push(`<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${fmt ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`);
    return xfIx.get(k);
  };
  const dxf = (s) => { dxfs.push(`<dxf>${s.b || s.c ? `<font>${s.b ? '<b/>' : ''}${s.c ? `<color rgb="${RGB(s.c)}"/>` : ''}</font>` : ''}${s.bg ? `<fill><patternFill><bgColor rgb="${RGB(s.bg)}"/></patternFill></fill>` : ''}</dxf>`); return dxfs.length - 1; };
  const sst = [], sstIx = new Map(), str = (s) => { if (!sstIx.has(s)) { sstIx.set(s, sst.length); sst.push(s); } return sstIx.get(s); };
  const files = [], sheetsXml = [];
  b.sheets.forEach((sh, n) => {
    const ext = extent(sh), rowsXml = [];
    const rowSet = new Map();
    for (const k of Object.keys(sh.cells)) { const m = /^([A-Z]+)(\d+)$/.exec(k); const r = +m[2]; if (!rowSet.has(r)) rowSet.set(r, []); rowSet.get(r).push(k); }
    for (const r of Object.keys(sh.rows).map(Number)) if (!rowSet.has(r)) rowSet.set(r, []);
    const colN = (k) => { let x = 0; for (const ch of /^[A-Z]+/.exec(k)[0]) x = x * 26 + ch.charCodeAt(0) - 64; return x; };
    for (const r of [...rowSet.keys()].sort((a, c) => a - c)) {
      const ro = sh.rows[r] || {}, list = rowSet.get(r).sort((a, c) => colN(a) - colN(c));
      const cs = list.map((k) => {
        const cell = sh.cells[k], c = colN(k), s = xf(styleAt(sh, r, c, cell)), sa = s ? ` s="${s}"` : '';
        let v = cell.f ? b.value(sh, k) : cell.v;
        if (cell.f) {
          const f = `<f>${esc(xlFormula(cell.f))}</f>`;
          if (isErr(v)) return `<c r="${k}"${sa} t="e">${f}<v>${esc(v.code)}</v></c>`;
          if (typeof v === 'string') return `<c r="${k}"${sa} t="str">${f}<v>${esc(v)}</v></c>`;
          if (typeof v === 'boolean') return `<c r="${k}"${sa} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
          return `<c r="${k}"${sa}>${f}${typeof v === 'number' ? `<v>${v}</v>` : ''}</c>`;
        }
        if (typeof v === 'number') return `<c r="${k}"${sa}><v>${v}</v></c>`;
        if (typeof v === 'boolean') return `<c r="${k}"${sa} t="b"><v>${v ? 1 : 0}</v></c>`;
        if (typeof v === 'string') return `<c r="${k}"${sa} t="s"><v>${str(v)}</v></c>`;
        return `<c r="${k}"${sa}/>`;
      });
      const rs = ro.s ? xf(ro.s) : 0;
      rowsXml.push(`<row r="${r}"${ro.h ? ` ht="${(ro.h * 72 / 96).toFixed(2)}" customHeight="1"` : ''}${ro.x ? ' hidden="1"' : ''}${rs ? ` s="${rs}" customFormat="1"` : ''}>${cs.join('')}</row>`);
    }
    const colsXml = Object.entries(sh.cols).map(([c, x]) => { const i = colN(c); return `<col min="${i}" max="${i}" width="${(((x.w || 100) - 5) / 7).toFixed(2)}"${x.w ? ' customWidth="1"' : ''}${x.x ? ' hidden="1"' : ''}${x.s ? ` style="${xf(x.s)}"` : ''}/>`; }).sort((a, c) => +/min="(\d+)"/.exec(a)[1] - +/min="(\d+)"/.exec(c)[1]);
    const fr = sh.freeze || { r: 0, c: 0 };
    const pane = fr.r || fr.c ? `<pane${fr.c ? ` xSplit="${fr.c}"` : ''}${fr.r ? ` ySplit="${fr.r}"` : ''} topLeftCell="${key(fr.r + 1, fr.c + 1)}" activePane="${fr.r && fr.c ? 'bottomRight' : fr.r ? 'bottomLeft' : 'topRight'}" state="frozen"/>` : '';
    const cfXml = sh.cf.map((x, i) => {
      const k2 = { gt: 'greaterThan', lt: 'lessThan', ge: 'greaterThanOrEqual', le: 'lessThanOrEqual', eq: 'equal', ne: 'notEqual', between: 'between' }[x.k], q = (v) => (/^-?\d+(\.\d+)?$/.test(v) ? v : `"${esc(String(v).replace(/"/g, '""'))}"`), first = x.r.split(':')[0];
      if (k2) return `<conditionalFormatting sqref="${x.r}"><cfRule type="cellIs" dxfId="${dxf(x.s)}" priority="${i + 1}" operator="${k2}"><formula>${q(x.a)}</formula>${x.k === 'between' ? `<formula>${q(x.b)}</formula>` : ''}</cfRule></conditionalFormatting>`;
      if (x.k === 'text') return `<conditionalFormatting sqref="${x.r}"><cfRule type="containsText" dxfId="${dxf(x.s)}" priority="${i + 1}" operator="containsText" text="${esc(x.a)}"><formula>NOT(ISERROR(SEARCH("${esc(x.a)}",${first})))</formula></cfRule></conditionalFormatting>`;
      if (x.k === 'formula') return `<conditionalFormatting sqref="${x.r}"><cfRule type="expression" dxfId="${dxf(x.s)}" priority="${i + 1}"><formula>${esc(xlFormula('=' + x.a))}</formula></cfRule></conditionalFormatting>`;
      if (x.k === 'dup') return `<conditionalFormatting sqref="${x.r}"><cfRule type="duplicateValues" dxfId="${dxf(x.s)}" priority="${i + 1}"/></conditionalFormatting>`;
      if (x.k === 'empty' || x.k === 'filled') return `<conditionalFormatting sqref="${x.r}"><cfRule type="${x.k === 'empty' ? 'containsBlanks' : 'notContainsBlanks'}" dxfId="${dxf(x.s)}" priority="${i + 1}"><formula>${x.k === 'empty' ? '' : 'NOT('}LEN(TRIM(${first}))=0${x.k === 'empty' ? '' : ')'}</formula></cfRule></conditionalFormatting>`;
      if (x.k === 'top') return `<conditionalFormatting sqref="${x.r}"><cfRule type="top10" dxfId="${dxf(x.s)}" priority="${i + 1}" rank="${parseInt(x.a, 10) || 10}"/></conditionalFormatting>`;
      if (x.k === 'scale') return `<conditionalFormatting sqref="${x.r}"><cfRule type="colorScale" priority="${i + 1}"><colorScale><cfvo type="min"/>${x.c3 ? '<cfvo type="percentile" val="50"/>' : ''}<cfvo type="max"/><color rgb="${RGB(x.c1 || '#f8696b')}"/>${x.c3 ? `<color rgb="${RGB(x.c3)}"/>` : ''}<color rgb="${RGB(x.c2 || '#63be7b')}"/></colorScale></cfRule></conditionalFormatting>`;
      if (x.k === 'bars') return `<conditionalFormatting sqref="${x.r}"><cfRule type="dataBar" priority="${i + 1}"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="${RGB(x.c1 || '#7fb55c')}"/></dataBar></cfRule></conditionalFormatting>`;
      return '';
    }).join('');
    const dvs = sh.dv.filter((d) => d.k === 'list' && d.list.length || ['number', 'int', 'date', 'text'].includes(d.k));
    const dvXml = dvs.length ? `<dataValidations count="${dvs.length}">${dvs.map((d) => d.k === 'list' ? `<dataValidation type="list" allowBlank="1" showErrorMessage="${d.strict ? 1 : 0}" sqref="${d.r}"><formula1>"${esc(d.list.join(',').slice(0, 250))}"</formula1></dataValidation>` : `<dataValidation type="${{ number: 'decimal', int: 'whole', date: 'date', text: 'textLength' }[d.k]}" operator="${d.a && d.b ? 'between' : d.a ? 'greaterThanOrEqual' : 'lessThanOrEqual'}" allowBlank="1" showErrorMessage="${d.strict ? 1 : 0}" sqref="${d.r}"><formula1>${esc(d.a || d.b || '0')}</formula1>${d.a && d.b ? `<formula2>${esc(d.b)}</formula2>` : ''}</dataValidation>`).join('')}</dataValidations>` : '';
    const ws = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${sh.color ? `<sheetPr><tabColor rgb="${RGB(sh.color)}"/></sheetPr>` : ''}<dimension ref="A1:${key(Math.max(1, ext.r), Math.max(1, ext.c))}"/><sheetViews><sheetView workbookViewId="0"${sh.grid === false ? ' showGridLines="0"' : ''}${n === 0 ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18" defaultColWidth="13.57"/>${colsXml.length ? `<cols>${colsXml.join('')}</cols>` : ''}<sheetData>${rowsXml.join('')}</sheetData>${sh.filter ? `<autoFilter ref="${sh.filter.r}"/>` : ''}${sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}${cfXml}${dvXml}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
    files.push([`xl/worksheets/sheet${n + 1}.xml`, ws]);
    sheetsXml.push(`<sheet name="${esc(sh.name)}" sheetId="${n + 1}"${sh.hidden ? ' state="hidden"' : ''} r:id="rId${n + 1}"/>`);
  });
  const N = b.sheets.length;
  const defined = b.sheets.map((sh, i) => (sh.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(sh.name.replace(/'/g, "''"))}'!${sh.filter.r.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>` : '')).join('');
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="${NS}">${numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs></styleSheet>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const out = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${b.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(b.title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`],
    ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>SavSpreadsheets</Application></Properties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheetsXml.join('')}</sheets>${defined ? `<definedNames>${defined}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${b.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${N + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${N + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`],
    ...files,
    ['xl/styles.xml', styles],
    ['xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="${NS}" count="${sst.length}" uniqueCount="${sst.length}">${sst.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`],
  ];
  return new Blob([await zip(out)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
