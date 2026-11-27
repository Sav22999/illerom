/**
 * Excel 97–2003 files (.xls, BIFF8 inside a compound file), read and written without libraries.
 * Reading: values, shared texts, number formats, fonts, fills, borders, alignment, the palette, formulas (the tokens of
 * Excel turned back into text, shared ones and references to other sheets too), merged cells, widths, heights, frozen
 * panes, hidden sheets. Writing: the same; formulas are written as tokens when Excel 97 knows their functions, otherwise
 * only their result is kept. The format holds at most 65,536 rows and 256 columns.
 */
import { cfb, cfbWrite } from './cfb.js';
import { colName, key, extent, styleAt } from './model.js';
import { isErr, parse } from './formula.js';
import { BUILTIN } from './xlsx.js';

/** Numbers and arguments of the functions of Excel 97 (the index is the number in the file). */
const FTAB = {
  0: ['COUNT', -1], 1: ['IF', -1], 2: ['ISNA', 1], 3: ['ISERROR', 1], 4: ['SUM', -1], 5: ['AVERAGE', -1], 6: ['MIN', -1], 7: ['MAX', -1], 8: ['ROW', -1], 9: ['COLUMN', -1], 10: ['NA', 0], 11: ['NPV', -1], 12: ['STDEV', -1], 13: ['DOLLAR', -1], 14: ['FIXED', -1], 15: ['SIN', 1], 16: ['COS', 1], 17: ['TAN', 1], 18: ['ATAN', 1], 19: ['PI', 0], 20: ['SQRT', 1], 21: ['EXP', 1], 22: ['LN', 1], 23: ['LOG10', 1], 24: ['ABS', 1], 25: ['INT', 1], 26: ['SIGN', 1], 27: ['ROUND', 2], 28: ['LOOKUP', -1], 29: ['INDEX', -1], 30: ['REPT', 2], 31: ['MID', 3], 32: ['LEN', 1], 33: ['VALUE', 1], 34: ['TRUE', 0], 35: ['FALSE', 0], 36: ['AND', -1], 37: ['OR', -1], 38: ['NOT', 1], 39: ['MOD', 2], 46: ['VAR', -1], 48: ['TEXT', 2], 56: ['PV', -1], 57: ['FV', -1], 58: ['NPER', -1], 59: ['PMT', -1], 60: ['RATE', -1], 62: ['IRR', -1], 63: ['RAND', 0], 64: ['MATCH', -1], 65: ['DATE', 3], 66: ['TIME', 3], 67: ['DAY', 1], 68: ['MONTH', 1], 69: ['YEAR', 1], 70: ['WEEKDAY', -1], 71: ['HOUR', 1], 72: ['MINUTE', 1], 73: ['SECOND', 1], 74: ['NOW', 0], 76: ['ROWS', 1], 77: ['COLUMNS', 1], 78: ['OFFSET', -1], 82: ['SEARCH', -1], 83: ['TRANSPOSE', 1], 86: ['TYPE', 1], 97: ['ATAN2', 2], 98: ['ASIN', 1], 99: ['ACOS', 1], 100: ['CHOOSE', -1], 101: ['HLOOKUP', -1], 102: ['VLOOKUP', -1], 105: ['ISREF', 1], 109: ['LOG', -1], 111: ['CHAR', 1], 112: ['LOWER', 1], 113: ['UPPER', 1], 114: ['PROPER', 1], 115: ['LEFT', -1], 116: ['RIGHT', -1], 117: ['EXACT', 2], 118: ['TRIM', 1], 119: ['REPLACE', 4], 120: ['SUBSTITUTE', -1], 121: ['CODE', 1], 124: ['FIND', -1], 126: ['ISERR', 1], 127: ['ISTEXT', 1], 128: ['ISNUMBER', 1], 129: ['ISBLANK', 1], 130: ['T', 1], 131: ['N', 1], 140: ['DATEVALUE', 1], 141: ['TIMEVALUE', 1], 142: ['SLN', 3], 148: ['INDIRECT', -1], 162: ['CLEAN', 1], 167: ['IPMT', -1], 168: ['PPMT', -1], 169: ['COUNTA', -1], 183: ['PRODUCT', -1], 184: ['FACT', 1], 190: ['ISNONTEXT', 1], 193: ['STDEVP', -1], 194: ['VARP', -1], 197: ['TRUNC', -1], 198: ['ISLOGICAL', 1], 212: ['ROUNDUP', 2], 213: ['ROUNDDOWN', 2], 216: ['RANK', -1], 219: ['ADDRESS', -1], 220: ['DAYS360', -1], 221: ['TODAY', 0], 227: ['MEDIAN', -1], 228: ['SUMPRODUCT', -1], 229: ['SINH', 1], 230: ['COSH', 1], 231: ['TANH', 1], 261: ['ERROR.TYPE', 1], 269: ['AVEDEV', -1], 276: ['COMBIN', 2], 279: ['EVEN', 1], 285: ['FLOOR', 2], 288: ['CEILING', 2], 293: ['NORMDIST', 4], 297: ['STANDARDIZE', 3], 298: ['ODD', 1], 299: ['PERMUT', 2], 307: ['CORREL', 2], 308: ['COVAR', 2], 309: ['FORECAST', 3], 311: ['INTERCEPT', 2], 312: ['PEARSON', 2], 313: ['RSQ', 2], 315: ['SLOPE', 2], 318: ['DEVSQ', -1], 319: ['GEOMEAN', -1], 320: ['HARMEAN', -1], 321: ['SUMSQ', -1], 325: ['LARGE', 2], 326: ['SMALL', 2], 327: ['QUARTILE', 2], 328: ['PERCENTILE', 2], 329: ['PERCENTRANK', -1], 330: ['MODE', -1], 336: ['CONCATENATE', -1], 337: ['POWER', 2], 342: ['RADIANS', 1], 343: ['DEGREES', 1], 344: ['SUBTOTAL', -1], 345: ['SUMIF', -1], 346: ['COUNTIF', 2], 347: ['COUNTBLANK', 1], 351: ['DATEDIF', 3], 359: ['HYPERLINK', -1], 361: ['AVERAGEA', -1], 362: ['MAXA', -1], 363: ['MINA', -1],
};
const BYNAME = Object.fromEntries(Object.entries(FTAB).map(([i, [n, a]]) => [n, [+i, a]]));
const ERRS = { 0x00: '#NULL!', 0x07: '#DIV/0!', 0x0f: '#VALUE!', 0x17: '#REF!', 0x1d: '#NAME?', 0x24: '#NUM!', 0x2a: '#N/A' };
const ERRCODE = Object.fromEntries(Object.entries(ERRS).map(([k, v]) => [v, +k]));
const DEFAULT_PALETTE = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF', '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99', '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];

// ------------------------------------------------------------------ reading

function records(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = [];
  for (let p = 0; p + 4 <= b.length;) { const type = v.getUint16(p, true), len = v.getUint16(p + 2, true); out.push({ type, pos: p, data: b.subarray(p + 4, p + 4 + len) }); p += 4 + len; }
  return out;
}
const dv = (d) => new DataView(d.buffer, d.byteOffset, d.byteLength);
/** A text of the file: flags then 8-bit or 16-bit characters. */
function xstr(d, o, cch, flagsAt) {
  const f = d[flagsAt], wide = f & 1, rich = f & 8, ext = f & 4;
  let p = flagsAt + 1;
  const runs = rich ? dv(d).getUint16(p, true) : 0;
  if (rich) p += 2;
  const extLen = ext ? dv(d).getUint32(p, true) : 0;
  if (ext) p += 4;
  let s = '';
  if (wide) { for (let i = 0; i < cch; i++) s += String.fromCharCode(dv(d).getUint16(p + i * 2, true)); p += cch * 2; } else { for (let i = 0; i < cch; i++) s += String.fromCharCode(d[p + i]); p += cch; }
  return { s, end: p + runs * 4 + extLen };
}
/** The shared texts: they may continue in CONTINUE records, where each piece of text starts again with its flags. */
function readSst(parts) {
  const out = [];
  let seg = 0, p = 8;
  const total = dv(parts[0]).getUint32(4, true);
  const need = (n) => { if (p + n > parts[seg].length && seg + 1 < parts.length && p >= parts[seg].length) { seg++; p = 0; } };
  for (let i = 0; i < total && seg < parts.length; i++) {
    need(3);
    let d = parts[seg];
    if (p + 3 > d.length) { seg++; p = 0; d = parts[seg]; if (!d) break; }
    const cch = dv(d).getUint16(p, true);
    let f = d[p + 2];
    p += 3;
    const runs = f & 8 ? dv(d).getUint16(p, true) : 0;
    if (f & 8) p += 2;
    const ext = f & 4 ? dv(d).getUint32(p, true) : 0;
    if (f & 4) p += 4;
    let s = '', left = cch;
    while (left > 0) {
      if (p >= d.length) { seg++; d = parts[seg]; if (!d) break; f = d[0]; p = 1; }
      const wide = f & 1, can = Math.min(left, Math.floor((d.length - p) / (wide ? 2 : 1)));
      for (let k = 0; k < can; k++) s += String.fromCharCode(wide ? dv(d).getUint16(p + k * 2, true) : d[p + k]);
      p += can * (wide ? 2 : 1);
      left -= can;
      if (can === 0 && left > 0) { seg++; d = parts[seg]; if (!d) break; f = d[0]; p = 1; }
    }
    out.push(s);
    // skip the formatting runs and the extra data, which can continue too
    let skip = runs * 4 + ext;
    while (skip > 0 && d) { const n = Math.min(skip, d.length - p); p += n; skip -= n; if (skip > 0) { seg++; d = parts[seg]; p = 0; } }
  }
  return out;
}
function rk(x) {
  const n = x & 2 ? (x >> 2) : (() => { const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, x & 0xfffffffc, true); return b.getFloat64(0, true); })();
  return x & 1 ? n / 100 : n;
}

/** The tokens of a formula as text. base: the cell, for shared formulas. */
function decode(d, o, cce, ctx, base) {
  const st = [], end = o + cce, v = dv(d);
  const ref = (rw, col, rel) => {
    const rowRel = col & 0x8000, colRel = col & 0x4000;
    let r = rw, c = col & 0xff;
    if (rel) { if (rowRel) r = base.r - 1 + ((rw << 16) >> 16); if (colRel) c = base.c - 1 + ((c << 24) >> 24); r = ((r % 65536) + 65536) % 65536; c = ((c % 256) + 256) % 256; }
    return (colRel ? '' : '$') + colName(c + 1) + (rowRel ? '' : '$') + (r + 1);
  };
  const area = (r1, r2, c1, c2, rel) => {
    if ((c1 & 0xff) === 0 && (c2 & 0xff) === 255 && !rel) return `${r1 + 1}:${r2 + 1}`;
    if (r1 === 0 && r2 === 65535 && !rel) return `${colName((c1 & 0xff) + 1)}:${colName((c2 & 0xff) + 1)}`;
    return ref(r1, c1, rel) + ':' + ref(r2, c2, rel);
  };
  const sheetOf = (ixti) => { const x = ctx.xti[ixti]; const s = x ? ctx.names[x[1]] : null; return s ? (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(s) ? s : `'${s.replace(/'/g, "''")}'`) + '!' : '#REF!'; };
  const OPS = { 3: '+', 4: '-', 5: '*', 6: '/', 7: '^', 8: '&', 9: '<', 10: '<=', 11: '=', 12: '>=', 13: '>', 14: '<>', 15: ' ', 16: ',', 17: ':' };
  for (let p = o; p < end;) {
    const t = d[p++], b = t >= 0x20 ? (t & 0x1f) | 0x20 : t;
    if (OPS[t]) { const y = st.pop(), x = st.pop(); st.push(x + OPS[t] + y); continue; }
    switch (b) {
      case 0x01: { const rw = v.getUint16(p, true), col = v.getUint16(p + 2, true); p += 4; const sh = ctx.shared?.[key(rw + 1, col + 1)]; if (sh) return sh(base); return null; }
      case 0x12: st.push('+' + st.pop()); break;
      case 0x13: st.push('-' + st.pop()); break;
      case 0x14: st.push(st.pop() + '%'); break;
      case 0x15: st.push('(' + st.pop() + ')'); break;
      case 0x16: st.push(''); break;
      case 0x17: { const cch = d[p], r = xstr(d, p, cch, p + 1); st.push('"' + r.s.replace(/"/g, '""') + '"'); p = r.end; break; }
      case 0x19: { const g = d[p], w = v.getUint16(p + 1, true); p += 3; if (g & 0x04) p += (w + 1) * 2; if (g & 0x10) st.push(`SUM(${st.pop()})`); break; }
      case 0x1c: st.push(ERRS[d[p]] || '#N/A'); p++; break;
      case 0x1d: st.push(d[p] ? 'TRUE' : 'FALSE'); p++; break;
      case 0x1e: st.push(String(v.getUint16(p, true))); p += 2; break;
      case 0x1f: st.push(String(+v.getFloat64(p, true).toPrecision(15))); p += 8; break;
      case 0x20: p += 7; st.push('0'); break;
      case 0x21: case 0x22: {
        let n, ix;
        if (b === 0x21) { ix = v.getUint16(p, true); p += 2; n = FTAB[ix]?.[1] ?? 1; } else { n = d[p] & 0x7f; ix = v.getUint16(p + 1, true) & 0x7fff; p += 3; }
        const args = st.splice(st.length - n, n);
        let name = FTAB[ix]?.[0];
        if (ix === 255) name = String(args.shift()).replace(/^_xlfn\./, '');
        st.push((name || 'UNKNOWN') + '(' + args.join(',') + ')');
        break;
      }
      case 0x23: p += 4; st.push('#NAME?'); break;
      case 0x24: st.push(ref(v.getUint16(p, true), v.getUint16(p + 2, true), false)); p += 4; break;
      case 0x25: st.push(area(v.getUint16(p, true), v.getUint16(p + 2, true), v.getUint16(p + 4, true), v.getUint16(p + 6, true), false)); p += 8; break;
      case 0x26: case 0x27: case 0x28: p += 6; break;
      case 0x29: p += 2; break;
      case 0x2a: st.push('#REF!'); p += 4; break;
      case 0x2b: st.push('#REF!'); p += 8; break;
      case 0x2c: st.push(ref(v.getUint16(p, true), v.getUint16(p + 2, true), true)); p += 4; break;
      case 0x2d: st.push(area(v.getUint16(p, true), v.getUint16(p + 2, true), v.getUint16(p + 4, true), v.getUint16(p + 6, true), true)); p += 8; break;
      case 0x39: { const ixti = v.getUint16(p, true), il = v.getUint16(p + 2, true); p += 6; st.push(ctx.extNames?.[ixti]?.[il - 1] || '#NAME?'); break; }
      case 0x3a: { const ixti = v.getUint16(p, true); st.push(sheetOf(ixti) + ref(v.getUint16(p + 2, true), v.getUint16(p + 4, true), false)); p += 6; break; }
      case 0x3b: { const ixti = v.getUint16(p, true); st.push(sheetOf(ixti) + area(v.getUint16(p + 2, true), v.getUint16(p + 4, true), v.getUint16(p + 6, true), v.getUint16(p + 8, true), false)); p += 10; break; }
      case 0x3c: st.push('#REF!'); p += 6; break;
      case 0x3d: st.push('#REF!'); p += 10; break;
      default: return null;
    }
  }
  return st.length ? '=' + st.pop() : null;
}

export async function readXls(buf) {
  const c = cfb(buf), w = c.stream('Workbook') || c.stream('Book');
  if (!w) throw Object.assign(new Error('file_invalid'), { code: 'file_invalid' });
  const recs = records(w), fonts = [], fmts = { ...BUILTIN }, xfs = [], bound = [], palette = DEFAULT_PALETTE.map((x) => '#' + x.toLowerCase()), xti = [], extNames = [];
  let sst = [], date1904 = false, biff = 0x600;
  // globals
  for (let i = 0; i < recs.length; i++) {
    const { type, data: d } = recs[i];
    if (type === 0x0a && i > 0) break;
    if (type === 0x809 && i === 0) biff = dv(d).getUint16(0, true);
    else if (type === 0x22) date1904 = dv(d).getUint16(0, true) === 1;
    else if (type === 0x31) { const x = dv(d), o = {}; const hgt = x.getUint16(0, true) / 20, gr = x.getUint16(2, true), icv = x.getUint16(4, true), bls = x.getUint16(6, true), uls = d[10]; if (bls >= 700) o.b = 1; if (gr & 2) o.i = 1; if (gr & 8) o.k = 1; if (uls) o.u = 1; if (hgt && hgt !== 10) o.fz = hgt; o.icv = icv; const nm = biff === 0x600 ? xstr(d, 14, d[14], 15).s : ''; if (/times|georgia|cambria|garamond/i.test(nm)) o.ff = 'serif'; else if (/courier|consol|mono/i.test(nm)) o.ff = 'mono'; fonts.push(o); }
    else if (type === 0x41e) { const id = dv(d).getUint16(0, true); fmts[id] = biff === 0x600 ? xstr(d, 2, dv(d).getUint16(2, true), 4).s : ''; }
    else if (type === 0xe0) xfs.push(d);
    else if (type === 0x92) { const n = dv(d).getUint16(0, true); for (let k = 0; k < n; k++) palette[8 + k] = '#' + [d[2 + k * 4], d[3 + k * 4], d[4 + k * 4]].map((x) => x.toString(16).padStart(2, '0')).join(''); }
    else if (type === 0x85) bound.push({ pos: dv(d).getUint32(0, true), hidden: (d[4] & 3) !== 0, dt: d[5], name: biff === 0x600 ? xstr(d, 6, d[6], 7).s : String.fromCharCode(...d.subarray(7, 7 + d[6])) });
    else if (type === 0x17) { const n = dv(d).getUint16(0, true); for (let k = 0; k < n; k++) xti.push([dv(d).getUint16(2 + k * 6, true), dv(d).getUint16(4 + k * 6, true), dv(d).getUint16(6 + k * 6, true)]); }
    else if (type === 0xfc) { const parts = [d]; for (let j = i + 1; j < recs.length && recs[j].type === 0x3c; j++) parts.push(recs[j].data); sst = readSst(parts); }
  }
  const col = (i) => (i === 0x7fff || i === 64 || i === 65 ? '' : palette[i] || '');
  const BS = { 1: 'thin', 2: 'medium', 3: 'dashed', 4: 'dotted', 5: 'thick', 6: 'double', 7: 'thin', 8: 'dashed', 9: 'dashed', 10: 'dashed', 11: 'dotted', 12: 'dotted', 13: 'dashed' };
  const styles = xfs.map((d) => {
    const x = dv(d), f = fonts[(() => { const i = x.getUint16(0, true); return i >= 4 ? i - 1 : i; })()] || {}, s = { ...f };
    delete s.icv;
    const fc = col(f.icv);
    if (fc && fc !== '#000000') s.c = fc;
    const nf = fmts[x.getUint16(2, true)];
    if (nf && nf !== 'General') s.nf = nf.replace(/\[\$-[0-9A-F]+\]/gi, '');
    const al = d[6], hz = al & 7, vt = (al >> 4) & 7;
    if (hz === 1) s.ha = 'l'; else if (hz === 2 || hz === 6) s.ha = 'c'; else if (hz === 3) s.ha = 'r';
    if (al & 8) s.w = 1;
    if (vt === 0) s.va = 't'; else if (vt === 1) s.va = 'm';
    const rot = d[7]; if (rot && rot <= 90) s.rot = rot; else if (rot > 90 && rot <= 180) s.rot = 90 - rot;
    if (d[8] & 15) s.ind = d[8] & 15;
    const b1 = x.getUint32(10, true), b2 = x.getUint32(14, true), fill = x.getUint16(18, true);
    const side = (st, ic) => (BS[st] ? BS[st] + ' ' + (col(ic) || '#000000') : '');
    const L2 = side(b1 & 15, (b1 >> 16) & 0x7f), R = side((b1 >> 4) & 15, (b1 >> 23) & 0x7f), T = side((b1 >> 8) & 15, b2 & 0x7f), B = side((b1 >> 12) & 15, (b2 >> 7) & 0x7f);
    if (L2) s.bl = L2; if (R) s.br = R; if (T) s.bt = T; if (B) s.bb = B;
    if (((b2 >>> 26) & 0x3f) > 0) { const fg = col(fill & 0x7f); if (fg && fg !== '#ffffff') s.bg = fg; }
    return s;
  });
  const sheets = [], names = bound.map((x) => x.name), byPos = new Map(recs.map((r, i) => [r.pos, i]));
  for (const bs of bound) {
    if (bs.dt !== 0) continue;
    const start = byPos.get(bs.pos);
    if (start === undefined) continue;
    const cells = {}, cols = {}, rows = {}, merges = [], freeze = { r: 0, c: 0 }, shared = {};
    let grid = true, lastF = null;
    const ctx = { xti, names, shared, extNames };
    const put = (r, c, o) => { if (r >= 100000 || c >= 702) return; cells[key(r + 1, c + 1)] = o; };
    const sty = (ix) => { const s = styles[ix]; return s && Object.keys(s).length ? s : null; };
    const val = (r, c, ix, v) => { const o = {}, s = sty(ix); if (v !== undefined && v !== null) o.v = date1904 && typeof v === 'number' && s?.nf && /[dmy]/i.test(s.nf) ? v + 1462 : v; if (s) o.s = s; if (Object.keys(o).length) put(r, c, o); };
    for (let i = start + 1; i < recs.length; i++) {
      const { type, data: d } = recs[i], x = dv(d);
      if (type === 0x0a) break;
      if (type === 0x203) val(x.getUint16(0, true), x.getUint16(2, true), x.getUint16(4, true), x.getFloat64(6, true));
      else if (type === 0x27e) val(x.getUint16(0, true), x.getUint16(2, true), x.getUint16(4, true), rk(x.getInt32(6, true)));
      else if (type === 0xbd) { const r = x.getUint16(0, true), c1 = x.getUint16(2, true), n = (d.length - 6) / 6; for (let k = 0; k < n; k++) val(r, c1 + k, x.getUint16(4 + k * 6, true), rk(x.getInt32(6 + k * 6, true))); }
      else if (type === 0xfd) val(x.getUint16(0, true), x.getUint16(2, true), x.getUint16(4, true), sst[x.getUint32(6, true)] ?? '');
      else if (type === 0x204) val(x.getUint16(0, true), x.getUint16(2, true), x.getUint16(4, true), biff === 0x600 ? xstr(d, 6, x.getUint16(6, true), 8).s : String.fromCharCode(...d.subarray(8, 8 + x.getUint16(6, true))));
      else if (type === 0x205) val(x.getUint16(0, true), x.getUint16(2, true), x.getUint16(4, true), d[7] ? undefined : !!d[6]);
      else if (type === 0x201) val(x.getUint16(0, true), x.getUint16(2, true), x.getUint16(4, true), null);
      else if (type === 0xbe) { const r = x.getUint16(0, true), c1 = x.getUint16(2, true), n = (d.length - 6) / 2; for (let k = 0; k < n; k++) val(r, c1 + k, x.getUint16(4 + k * 2, true), null); }
      else if (type === 0x06) {
        const r = x.getUint16(0, true), c = x.getUint16(2, true), ix = x.getUint16(4, true), cce = x.getUint16(20, true);
        let v;
        if (x.getUint16(12, true) === 0xffff) { const k = d[6]; v = k === 1 ? !!d[8] : k === 3 ? '' : k === 2 ? undefined : null; } else v = x.getFloat64(6, true);
        const f = decode(d, 22, cce, ctx, { r: r + 1, c: c + 1 });
        const o = {};
        if (v !== undefined && v !== null && v !== '') o.v = v;
        if (f) o.f = f;
        const s = sty(ix); if (s) o.s = s;
        put(r, c, o);
        lastF = { r, c, k: key(r + 1, c + 1), pending: v === null };
        // a shared formula starts here: its tokens come in the next record
        if (d[22] === 0x01 && !f) lastF.shared = true;
      } else if (type === 0x207 && lastF) { const s = biff === 0x600 ? xstr(d, 0, x.getUint16(0, true), 2).s : ''; const cell = cells[lastF.k]; if (cell) cell.v = s; }
      else if (type === 0x4bc) {
        const r1 = x.getUint16(0, true), r2 = x.getUint16(2, true), c1 = d[4], c2 = d[5], cce = x.getUint16(8, true), body = d.slice(10, 10 + cce);
        const fn = (base) => decode(body, 0, cce, ctx, base);
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) shared[key(r + 1, c + 1)] = fn;
        shared[key(r1 + 1, c1 + 1)] = fn;
        // the formulas already read that point here
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const cell = cells[key(r + 1, c + 1)]; if (cell && !cell.f && (lastF?.shared || true)) { const f = fn({ r: r + 1, c: c + 1 }); if (f && (r !== r1 || c !== c1 || lastF?.shared) && (cell.v !== undefined || cell.s)) { /* only cells that had a FORMULA record */ } } }
        // the anchor cell itself
        const a = cells[key(r1 + 1, c1 + 1)]; if (a && !a.f) { const f = fn({ r: r1 + 1, c: c1 + 1 }); if (f) a.f = f; }
      }
      else if (type === 0x7d) { const c1 = x.getUint16(0, true), c2 = x.getUint16(2, true), wd = x.getUint16(4, true), gr = x.getUint16(8, true); for (let c = c1; c <= Math.min(c2, 255); c++) { const o = {}; if (Math.abs(wd / 256 - 8.43) > 0.3) o.w = Math.round((wd / 256) * 7 + 5); if (gr & 1) o.x = 1; if (Object.keys(o).length) cols[colName(c + 1)] = o; } }
      else if (type === 0x208) { const r = x.getUint16(0, true), hh = x.getUint16(6, true), gr = x.getUint16(12, true), o = {}; if (gr & 0x40 && !(hh & 0x8000)) o.h = Math.round((hh & 0x7fff) / 20 * 96 / 72); if (gr & 0x20) o.x = 1; if (Object.keys(o).length && r < 100000) rows[r + 1] = o; }
      else if (type === 0xe5) { const n = x.getUint16(0, true); for (let k = 0; k < n; k++) { const o = 2 + k * 8, r1 = x.getUint16(o, true), r2 = x.getUint16(o + 2, true), c1 = x.getUint16(o + 4, true), c2 = x.getUint16(o + 6, true); if (r1 !== r2 || c1 !== c2) merges.push(key(r1 + 1, c1 + 1) + ':' + key(r2 + 1, c2 + 1)); } }
      else if (type === 0x23e) { const g = x.getUint16(0, true); grid = !!(g & 2); }
      else if (type === 0x41) { freeze.c = x.getUint16(0, true); freeze.r = x.getUint16(2, true); }
    }
    // formulas that were waiting for their shared tokens
    for (const [k, cell] of Object.entries(cells)) if (!cell.f && shared[k] && cell.__f !== false) { /* values only */ }
    sheets.push({ name: bs.name, hidden: bs.hidden, cells, cols, rows, merges, freeze: { r: Math.min(freeze.r, 100), c: Math.min(freeze.c, 50) }, grid, cf: [], dv: [], charts: [] });
  }
  if (!sheets.length) throw Object.assign(new Error('file_invalid'), { code: 'file_invalid' });
  return { title: '', settings: { lang: 'en' }, sheets };
}

// ------------------------------------------------------------------ writing

class Out {
  constructor() { this.parts = []; this.len = 0; }
  rec(type, bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    // records longer than 8224 bytes continue in CONTINUE records
    for (let o = 0, first = true; o < b.length || first; first = false) {
      const n = Math.min(8224, b.length - o), h = new Uint8Array(4 + n), v = new DataView(h.buffer);
      v.setUint16(0, first ? type : 0x3c, true); v.setUint16(2, n, true); h.set(b.subarray(o, o + n), 4);
      this.parts.push(h); this.len += h.length; o += n;
      if (!n) break;
    }
    return this.len;
  }
  bytes() { const b = new Uint8Array(this.len); let p = 0; for (const x of this.parts) { b.set(x, p); p += x.length; } return b; }
}
const W = () => { const a = []; const o = { u8: (x) => (a.push(x & 255), o), u16: (x) => (a.push(x & 255, (x >> 8) & 255), o), u32: (x) => (a.push(x & 255, (x >>> 8) & 255, (x >>> 16) & 255, (x >>> 24) & 255), o), f64: (x) => { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, x, true); for (let i = 0; i < 8; i++) a.push(b.getUint8(i)); return o; }, str16: (s) => { o.u16(s.length).u8(1); for (let i = 0; i < s.length; i++) o.u16(s.charCodeAt(i)); return o; }, str8: (s) => { o.u8(s.length).u8(1); for (let i = 0; i < s.length; i++) o.u16(s.charCodeAt(i)); return o; }, raw: (b) => (a.push(...b), o), bytes: () => new Uint8Array(a), get length() { return a.length; } }; return o; };
const REFS = new Set(['SUM', 'COUNT', 'COUNTA', 'AVERAGE', 'MIN', 'MAX', 'PRODUCT', 'ROW', 'COLUMN', 'ROWS', 'COLUMNS', 'OFFSET', 'INDEX', 'SUMIF', 'COUNTIF', 'ISREF', 'COUNTBLANK', 'SUMPRODUCT', 'SUBTOTAL', 'LOOKUP', 'VLOOKUP', 'HLOOKUP', 'MATCH', 'NPV', 'STDEV', 'VAR', 'MEDIAN', 'MODE', 'LARGE', 'SMALL', 'RANK', 'PERCENTILE', 'QUARTILE', 'CORREL', 'AVERAGEA', 'MAXA', 'MINA', 'SUMSQ', 'IRR', 'AND', 'OR', 'CONCATENATE']);

/** A formula as the tokens of Excel 97, or null when it cannot be written so. */
function encode(f, sheetIndex) {
  let tree;
  try { tree = parse(f.slice(1)); } catch { return null; }
  const w = W();
  const cell = (r, c, ar, ac) => { if (r > 65536 || c > 256) throw 0; w.u16(r - 1).u16((c - 1) | (ac ? 0 : 0x4000) | (ar ? 0 : 0x8000)); };
  const node = (n, inFn) => {
    switch (n.t) {
      case 'v': {
        const v = n.v;
        if (typeof v === 'number') { if (Number.isInteger(v) && v >= 0 && v <= 65535) w.u8(0x1e).u16(v); else w.u8(0x1f).f64(v); }
        else if (typeof v === 'string') { if (v.length > 255) throw 0; w.u8(0x17).str8(v); }
        else if (typeof v === 'boolean') w.u8(0x1d).u8(v ? 1 : 0);
        else if (v === null) w.u8(0x16);
        else if (isErr(v)) w.u8(0x1c).u8(ERRCODE[v.code] ?? 0x2a);
        else throw 0;
        return;
      }
      case 'ref': {
        const r = n.ref, sh = r.sheet ? sheetIndex(r.sheet) : -1;
        if (r.sheet && sh < 0) throw 0;
        const isArea = r.kind !== 'cell', cls = isArea ? 0x20 : inFn ? 0x20 : 0x40;
        const r1 = r.kind === 'cols' ? 1 : r.r1, r2 = r.kind === 'cols' ? 65536 : r.r2, c1 = r.kind === 'rows' ? 1 : r.c1, c2 = r.kind === 'rows' ? 256 : r.c2;
        if (sh >= 0) { w.u8((isArea ? 0x1b : 0x1a) | cls).u16(sh); } else w.u8((isArea ? 0x05 : 0x04) | cls);
        if (isArea) { if (r2 > 65536 || c2 > 256) throw 0; w.u16(r1 - 1).u16(r2 - 1).u16((c1 - 1) | (r.ac1 ? 0 : 0x4000) | (r.ar1 ? 0 : 0x8000)).u16((c2 - 1) | (r.ac2 ? 0 : 0x4000) | (r.ar2 ? 0 : 0x8000)); }
        else cell(r1, c1, r.ar1, r.ac1);
        return;
      }
      case 'neg': node(n.a, inFn); w.u8(0x13); return;
      case 'pct': node(n.a, inFn); w.u8(0x14); return;
      case 'bin': { node(n.a, false); node(n.b, false); w.u8({ '+': 3, '-': 4, '*': 5, '/': 6, '^': 7, '&': 8, '<': 9, '<=': 10, '=': 11, '>=': 12, '>': 13, '<>': 14 }[n.op]); return; }
      case 'fn': {
        if (n.name === 'IFERROR' && n.args.length === 2) return node({ t: 'fn', name: 'IF', args: [{ t: 'fn', name: 'ISERROR', args: [n.args[0]] }, n.args[1], n.args[0]] }, inFn);
        const fx = BYNAME[n.name];
        if (!fx) throw 0;
        const takesRef = REFS.has(n.name);
        for (const a of n.args) node(a, takesRef);
        if (fx[1] >= 0) { if (fx[1] !== n.args.length) throw 0; w.u8(0x41).u16(fx[0]); } else w.u8(0x42).u8(n.args.length).u16(fx[0]);
        return;
      }
    }
    throw 0;
  };
  try { node(tree, false); } catch { return null; }
  return w.length > 1800 ? null : w.bytes();
}

export async function writeXls(b) {
  const out = new Out(), N = b.sheets.length;
  // the palette: the colours used by the cells take the free places (56 at most)
  const pal = DEFAULT_PALETTE.map((x) => '#' + x.toLowerCase()), custom = [];
  const icv = (c) => {
    if (!c) return 0x7fff;
    let i = pal.indexOf(c);
    if (i >= 0) return i + 8;
    if (custom.length < 48) { const slot = 8 + custom.length; pal[slot] = c; custom.push(c); return slot + 8; }
    const rgb = (x) => [1, 3, 5].map((k) => parseInt(x.slice(k, k + 2), 16)), t = rgb(c);
    let best = 0, d = Infinity;
    pal.forEach((p, k) => { const q = rgb(p), e = (q[0] - t[0]) ** 2 + (q[1] - t[1]) ** 2 + (q[2] - t[2]) ** 2; if (e < d) { d = e; best = k; } });
    return best + 8;
  };
  const fonts = [], fontIx = new Map(), fmts = [], fmtIx = new Map(), xfs = [], xfIx = new Map();
  const builtinIx = Object.fromEntries(Object.entries(BUILTIN).map(([k, v]) => [v, +k]));
  const font = (s) => { const k = JSON.stringify([s.b, s.i, s.u, s.k, s.c, s.fz, s.ff]); if (!fontIx.has(k)) { fontIx.set(k, fonts.length); fonts.push(s); } const i = fontIx.get(k) + 4; return i >= 4 ? i + 1 : i; };
  const BST = { thin: 1, medium: 2, dashed: 3, dotted: 4, thick: 5, double: 6 };
  const xf = (s) => {
    if (!s || !Object.keys(s).length) return 15;
    const k = JSON.stringify(s);
    if (xfIx.has(k)) return xfIx.get(k);
    const fmt = s.nf ? builtinIx[s.nf] ?? (fmtIx.has(s.nf) ? fmtIx.get(s.nf) : (fmtIx.set(s.nf, 164 + fmts.length), fmts.push(s.nf), fmtIx.get(s.nf))) : 0;
    const side = (v) => (v ? [BST[v.split(' ')[0]] || 1, icv(v.split(' ')[1]) & 0x7f] : [0, 0]);
    const [lS, lC] = side(s.bl), [rS, rC] = side(s.br), [tS, tC] = side(s.bt), [bS, bC] = side(s.bb);
    const w = W().u16(font(s)).u16(fmt).u16(0x0001).u8(({ l: 1, c: 2, r: 3 }[s.ha] || 0) | (s.w ? 8 : 0) | (({ t: 0, m: 1 }[s.va] ?? 2) << 4)).u8(s.rot > 0 ? s.rot : s.rot < 0 ? 90 - s.rot : 0).u8(s.ind || 0).u8(0xfc)
      .u32(lS | (rS << 4) | (tS << 8) | (bS << 12) | (lC << 16) | (rC << 23)).u32(tC | (bC << 7) | ((s.bg ? 1 : 0) << 26)).u16(s.bg ? (icv(s.bg) & 0x7f) | (65 << 7) : 64 | (65 << 7));
    xfIx.set(k, 16 + xfs.length);
    xfs.push(w.bytes());
    return xfIx.get(k);
  };
  // first all the cells, to know styles and texts
  const sst = [], sstIx = new Map(), str = (s) => { if (!sstIx.has(s)) { sstIx.set(s, sst.length); sst.push(s); } return sstIx.get(s); };
  const sheetIndex = (name) => b.sheets.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
  let total = 0;
  const bodies = b.sheets.map((sh) => {
    const ext = extent(sh), R = Math.min(Math.max(1, ext.r), 65536), C = Math.min(Math.max(1, ext.c), 256), recs = [];
    const rr = (type, w) => recs.push([type, w.bytes ? w.bytes() : w]);
    rr(0x200, W().u32(0).u32(R).u16(0).u16(C).u16(0));
    for (const [c, x] of Object.entries(sh.cols)) { let i = 0; for (const ch of c) i = i * 26 + ch.charCodeAt(0) - 64; if (i > 256) continue; rr(0x7d, W().u16(i - 1).u16(i - 1).u16(Math.round((((x.w || 100) - 5) / 7) * 256)).u16(x.s ? xf(x.s) : 15).u16(x.x ? 1 : 0).u16(0)); }
    for (const [r, x] of Object.entries(sh.rows)) { if (+r > 65536 || (!x.h && !x.x)) continue; rr(0x208, W().u16(+r - 1).u16(0).u16(C).u16(x.h ? Math.round(x.h * 72 / 96 * 20) : 0x8000 | 255).u16(0).u16(0).u16((x.x ? 0x20 : 0) | (x.h ? 0x40 : 0) | 0x100).u16(15)); }
    const keys = Object.keys(sh.cells).map((k) => { const m = /^([A-Z]+)(\d+)$/.exec(k); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return [k, +m[2], c]; }).filter(([, r, c]) => r <= 65536 && c <= 256).sort((a, c) => a[1] - c[1] || a[2] - c[2]);
    for (const [k, r, c] of keys) {
      const cell = sh.cells[k], ix = xf(styleAt(sh, r, c, cell)), head = () => W().u16(r - 1).u16(c - 1).u16(ix);
      const v = cell.f ? b.value(sh, k) : cell.v;
      const tok = cell.f ? encode(cell.f, sheetIndex) : null;
      if (tok) {
        const w = head();
        if (typeof v === 'number') w.f64(v); else if (typeof v === 'boolean') w.u8(1).u8(0).u8(v ? 1 : 0).u8(0).u16(0).u16(0xffff); else if (isErr(v)) w.u8(2).u8(0).u8(ERRCODE[v.code] ?? 0x2a).u8(0).u16(0).u16(0xffff); else if (typeof v === 'string' && v !== '') w.u8(0).u8(0).u16(0).u16(0).u16(0xffff); else w.u8(3).u8(0).u16(0).u16(0).u16(0xffff);
        w.u16(2).u32(0).u16(tok.length).raw(tok);
        rr(0x06, w);
        if (typeof v === 'string' && v !== '') rr(0x207, W().str16(v.slice(0, 32767)));
        continue;
      }
      if (typeof v === 'number') rr(0x203, head().f64(v));
      else if (typeof v === 'boolean') rr(0x205, head().u8(v ? 1 : 0).u8(0));
      else if (isErr(v)) rr(0x205, head().u8(ERRCODE[v.code] ?? 0x2a).u8(1));
      else if (typeof v === 'string' && v !== '') rr(0xfd, head().u32(str(v)));
      else if (ix !== 15) rr(0x201, head());
      total++;
    }
    const fr = sh.freeze || { r: 0, c: 0 }, frozen = fr.r || fr.c;
    rr(0x23e, W().u16((sh.grid === false ? 0 : 2) | 4 | (frozen ? 8 | 0x100 : 0) | 0x10 | 0x20 | 0x80 | (sh === b.sheets[0] ? 0x600 : 0)).u16(0).u16(0).u32(64).u16(0).u16(0).u32(0));
    if (frozen) rr(0x41, W().u16(fr.c).u16(fr.r).u16(fr.r).u16(fr.c).u8(fr.r && fr.c ? 0 : fr.r ? 2 : 1).u8(0));
    const ms = sh.merges.map((m) => { const [p, q] = m.split(':'), a = /^([A-Z]+)(\d+)$/.exec(p), z = /^([A-Z]+)(\d+)$/.exec(q), cn = (s) => { let x = 0; for (const ch of s) x = x * 26 + ch.charCodeAt(0) - 64; return x; }; return [+a[2], +z[2], cn(a[1]), cn(z[1])]; }).filter((m) => m[1] <= 65536 && m[3] <= 256);
    for (let i = 0; i < ms.length; i += 1000) { const w = W().u16(Math.min(1000, ms.length - i)); for (const m of ms.slice(i, i + 1000)) w.u16(m[0] - 1).u16(m[1] - 1).u16(m[2] - 1).u16(m[3] - 1); rr(0xe5, w); }
    return recs;
  });
  void total;
  // the globals
  const bof = (dt) => W().u16(0x600).u16(dt).u16(0x0dbb).u16(0x07cc).u32(0).u32(6);
  out.rec(0x809, bof(5).bytes());
  out.rec(0x42, W().u16(1200).bytes());
  out.rec(0x3d, W().u16(0).u16(0).u16(0x4000).u16(0x2000).u16(0x38).u16(0).u16(0).u16(1).u16(600).bytes());
  out.rec(0x22, W().u16(0).bytes());
  const fontRec = (s) => { const nm = { serif: 'Times New Roman', mono: 'Courier New', hand: 'Comic Sans MS', narrow: 'Arial Narrow' }[s.ff] || 'Arial'; return W().u16(Math.round((s.fz || 10) * 20)).u16((s.i ? 2 : 0) | (s.k ? 8 : 0)).u16(s.c ? icv(s.c) : 0x7fff).u16(s.b ? 700 : 400).u16(0).u8(s.u ? 1 : 0).u8(0).u8(0).u8(0).str8(nm).bytes(); };
  for (let i = 0; i < 4; i++) out.rec(0x31, fontRec({}));
  for (const f of fonts) out.rec(0x31, fontRec(f));
  fmts.forEach((f, i) => out.rec(0x41e, W().u16(164 + i).str16(f).bytes()));
  const styleXf = W().u16(0).u16(0).u16(0xfff5).u8(0x20).u8(0).u8(0).u8(0).u32(0).u32(0).u16(0x20c0).bytes();
  for (let i = 0; i < 15; i++) out.rec(0xe0, styleXf);
  out.rec(0xe0, W().u16(0).u16(0).u16(0x0001).u8(0x20).u8(0).u8(0).u8(0).u32(0).u32(0).u16(0x20c0).bytes());
  for (const x of xfs) out.rec(0xe0, x);
  out.rec(0x293, W().u16(0x8000).u8(0).u8(0xff).bytes());
  const p = W().u16(56);
  for (let i = 0; i < 56; i++) { const c = pal[i]; p.u8(parseInt(c.slice(1, 3), 16)).u8(parseInt(c.slice(3, 5), 16)).u8(parseInt(c.slice(5, 7), 16)).u8(0); }
  out.rec(0x92, p.bytes());
  const boundAt = [];
  b.sheets.forEach((sh) => { boundAt.push(out.len + 4); out.rec(0x85, W().u32(0).u8(sh.hidden ? 1 : 0).u8(0).str8(sh.name.slice(0, 31)).bytes()); });
  out.rec(0x1ae, W().u16(N).u16(0x401).bytes());
  const xt = W().u16(N);
  for (let i = 0; i < N; i++) xt.u16(0).u16(i).u16(i);
  out.rec(0x17, xt.bytes());
  // shared texts, split in CONTINUE records without cutting a text header
  const chunks = [];
  let cur = W().u32(sst.length).u32(sst.length);
  for (const s of sst) {
    const t2 = s.slice(0, 32767);
    if (cur.length + 3 > 8224) { chunks.push(cur.bytes()); cur = W(); }
    cur.u16(t2.length).u8(1);
    let i = 0;
    while (i < t2.length) {
      const room = Math.floor((8224 - cur.length) / 2);
      if (room <= 0) { chunks.push(cur.bytes()); cur = W().u8(1); continue; }
      const n = Math.min(room, t2.length - i);
      for (let k = 0; k < n; k++) cur.u16(t2.charCodeAt(i + k));
      i += n;
    }
  }
  chunks.push(cur.bytes());
  chunks.forEach((c, i) => { const h = new Uint8Array(4 + c.length), v = new DataView(h.buffer); v.setUint16(0, i ? 0x3c : 0xfc, true); v.setUint16(2, c.length, true); h.set(c, 4); out.parts.push(h); out.len += h.length; });
  out.rec(0x0a, new Uint8Array(0));
  // the sheets, and where each one starts
  const starts = [];
  bodies.forEach((recs) => { starts.push(out.len); out.rec(0x809, bof(0x10).bytes()); for (const [type, by] of recs) out.rec(type, by); out.rec(0x0a, new Uint8Array(0)); });
  const all = out.bytes(), v = new DataView(all.buffer);
  boundAt.forEach((at, i) => v.setUint32(at, starts[i], true));
  return new Blob([cfbWrite('Workbook', all)], { type: 'application/vnd.ms-excel' });
}
