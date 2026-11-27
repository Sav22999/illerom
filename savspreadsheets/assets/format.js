/**
 * Numbers, dates and texts as people read and type them. Number formats are the codes of every spreadsheet
 * ("#,##0.00", "0%", "dd/mm/yyyy", "[Red]-0.0;0.0", '"€" #,##0'…), so files of Excel and LibreOffice look the same.
 * Dates are numbers of days since 30 December 1899; times are fractions of a day.
 */

export const LOCALES = {
  it: { dec: ',', grp: '.', dmy: 'dmy', sep: '/', tag: 'it-IT', t: 'VERO', f: 'FALSO' },
  en: { dec: '.', grp: ',', dmy: 'dmy', sep: '/', tag: 'en-GB', t: 'TRUE', f: 'FALSE' },
  'en-US': { dec: '.', grp: ',', dmy: 'mdy', sep: '/', tag: 'en-US', t: 'TRUE', f: 'FALSE' },
  fr: { dec: ',', grp: ' ', dmy: 'dmy', sep: '/', tag: 'fr-FR', t: 'VRAI', f: 'FAUX' },
  de: { dec: ',', grp: '.', dmy: 'dmy', sep: '.', tag: 'de-DE', t: 'WAHR', f: 'FALSCH' },
  es: { dec: ',', grp: '.', dmy: 'dmy', sep: '/', tag: 'es-ES', t: 'VERDADERO', f: 'FALSO' },
  pt: { dec: ',', grp: '.', dmy: 'dmy', sep: '/', tag: 'pt-PT', t: 'VERDADEIRO', f: 'FALSO' },
  nl: { dec: ',', grp: '.', dmy: 'dmy', sep: '-', tag: 'nl-NL', t: 'WAAR', f: 'ONWAAR' },
};
export const loc = (lang) => LOCALES[lang] || LOCALES[String(lang || '').slice(0, 2)] || LOCALES.en;
export const CURRENCY = { EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', JPY: '¥', CNY: '¥', INR: '₹', BRL: 'R$', SEK: 'kr', PLN: 'zł' };
/** The format of an amount in a currency: the symbol before or after, as each language writes it. */
export function currencyFormat(cur, lang, dec = 2) {
  const s = CURRENCY[cur] || '€', z = dec ? '0.' + '0'.repeat(dec) : '0', after = loc(lang).dec === ',' && !['$', '£'].includes(s);
  return after ? `#,##${z} "${s}"` : `"${s}"#,##${z}`;
}
export const dateFormat = (lang) => { const L = loc(lang); return (L.dmy === 'mdy' ? ['mm', 'dd', 'yyyy'] : ['dd', 'mm', 'yyyy']).join(L.sep); };

// ------------------------------------------------------------------ dates

const EPOCH = Date.UTC(1899, 11, 30), DAY = 86400000;
export const toSerial = (y, m, d, hh = 0, mi = 0, ss = 0) => (Date.UTC(y, m - 1, d, hh, mi, ss) - EPOCH) / DAY;
export function fromSerial(n) {
  const ms = Math.round(n * DAY / 1000) * 1000 + EPOCH, x = new Date(ms);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), wd: x.getUTCDay(), hh: x.getUTCHours(), mi: x.getUTCMinutes(), ss: x.getUTCSeconds() };
}
export const todaySerial = () => { const d = new Date(); return toSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
export const nowSerial = () => { const d = new Date(); return toSerial(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()); };
const names = new Map();
function monthNames(tag, style) {
  const k = tag + style;
  if (!names.has(k)) names.set(k, Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(tag, { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2021, i, 15)))));
  return names.get(k);
}
function dayNames(tag, style) {
  const k = 'd' + tag + style;
  if (!names.has(k)) names.set(k, Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(tag, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2021, 7, 1 + i)))));
  return names.get(k); // 1 August 2021 was a Sunday
}

// ------------------------------------------------------------------ general numbers

/** A number without a format: at most 10 significant digits, the decimal separator of the language. */
export function general(n, L = LOCALES.en) {
  if (!Number.isFinite(n)) return '#NUM!';
  if (n === 0) return '0';
  const a = Math.abs(n);
  let s;
  if (a >= 1e11 || a < 1e-9) s = n.toExponential(5).replace(/\.?0+e/, 'e').replace('e+', 'E+').replace('e-', 'E-').replace(/E([+-])(\d)$/, 'E$10$2');
  else s = String(+n.toPrecision(10));
  if (/e/.test(s)) s = (+s).toFixed(10).replace(/\.?0+$/, '');
  return L.dec === '.' ? s : s.replace('.', L.dec);
}
export const boolText = (b, L = LOCALES.en) => (b ? L.t : L.f);

// ------------------------------------------------------------------ format codes

const cache = new Map();
const COLORS = { red: '#d32f2f', blue: '#1565c0', green: '#2e7d32', black: '#1c1c1c', white: '#ffffff', yellow: '#b59a00', magenta: '#c2185b', cyan: '#00838f' };
const INDEXED = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];

function splitSections(code) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') q = !q;
    if (ch === '\\' && !q) { cur += ch + (code[i + 1] ?? ''); i++; continue; }
    if (ch === ';' && !q) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** A section of a format, read once: its tokens and what kind it is. */
function parseSection(src) {
  const s = { color: '', cond: null, toks: [], date: false, text: false, pct: 0, grp: false, scale: 0, elapsed: false };
  let i = 0;
  const lit = (v) => { const last = s.toks.at(-1); if (last?.t === 'lit') last.v += v; else s.toks.push({ t: 'lit', v }); };
  while (i < src.length) {
    const ch = src[i], rest = src.slice(i);
    let m;
    if (ch === '[') {
      const end = src.indexOf(']', i), inner = end > 0 ? src.slice(i + 1, end) : '';
      i = end > 0 ? end + 1 : src.length;
      const lo = inner.toLowerCase();
      if (COLORS[lo]) s.color = COLORS[lo];
      else if ((m = /^color\s*(\d+)$/i.exec(inner))) s.color = INDEXED[(+m[1] - 1) % 8] || '';
      else if ((m = /^(<=|>=|<>|<|>|=)\s*(-?[\d.]+)$/.exec(inner))) s.cond = [m[1], +m[2]];
      else if ((m = /^\$([^-\]]*)(-[0-9a-f]+)?$/i.exec(inner))) lit(m[1]);
      else if (/^(h+|m+|s+)$/i.test(inner)) { s.date = true; s.elapsed = true; s.toks.push({ t: 'el', v: lo[0] }); }
      continue;
    }
    if (ch === '"') { const end = src.indexOf('"', i + 1); lit(src.slice(i + 1, end < 0 ? undefined : end)); i = end < 0 ? src.length : end + 1; continue; }
    if (ch === '\\') { lit(src[i + 1] ?? ''); i += 2; continue; }
    if (ch === '_') { lit(' '); i += 2; continue; }
    if (ch === '*') { i += 2; continue; }
    if ((m = /^(am\/pm|a\/p)/i.exec(rest))) { s.toks.push({ t: 'ampm', v: m[1] }); s.date = true; i += m[1].length; continue; }
    if ((m = /^(y+|m+|d+|h+|s+)/i.exec(rest))) { s.toks.push({ t: 'dt', v: m[1].toLowerCase() }); s.date = true; i += m[1].length; continue; }
    if ((m = /^[eE][+-]/.exec(rest))) { s.toks.push({ t: 'exp', v: rest[1] }); i += 2; continue; }
    if ('0#?'.includes(ch)) { s.toks.push({ t: 'dig', v: ch }); i++; continue; }
    if (ch === '.') { s.toks.push({ t: 'dot' }); i++; continue; }
    if (ch === ',') { s.toks.push({ t: 'comma' }); i++; continue; }
    if (ch === '%') { s.pct++; lit('%'); i++; continue; }
    if (ch === '@') { s.text = true; s.toks.push({ t: 'at' }); i++; continue; }
    if (ch === '/') { s.toks.push({ t: 'slash' }); i++; continue; }
    lit(ch);
    i++;
  }
  // minutes or months: "m" right after hours or right before seconds means minutes
  if (s.date) {
    const dts = s.toks.filter((x) => x.t === 'dt' || x.t === 'el');
    dts.forEach((x, k) => { if (x.t === 'dt' && x.v[0] === 'm' && x.v.length <= 2 && ((dts[k - 1] && 'h'.includes(dts[k - 1].v[0])) || (dts[k + 1] && dts[k + 1].v[0] === 's'))) x.v = x.v.replace(/m/g, 'M'); });
    // ".0" after seconds: fractions of a second
    for (let k = 0; k < s.toks.length; k++) if (s.toks[k].t === 'dot' && s.toks[k + 1]?.t === 'dig') { let n = 0; while (s.toks[k + 1 + n]?.t === 'dig') n++; s.toks.splice(k, 1 + n, { t: 'frac', n }); }
  } else {
    // a comma between digits groups the thousands; commas right after the last digit divide by 1000
    const d = s.toks.map((x, k) => (x.t === 'dig' ? k : -1)).filter((k) => k >= 0), first = d[0], last = d.at(-1), dot = s.toks.findIndex((x) => x.t === 'dot');
    s.toks.forEach((x, k) => {
      if (x.t !== 'comma') return;
      if (k > first && k < last && (dot < 0 || k < dot)) s.grp = true;
      else if (k > last || (dot >= 0 && k > dot && !s.toks.slice(k).some((y) => y.t === 'dig'))) s.scale++;
      else return;
      x.t = 'skip';
    });
    s.toks = s.toks.map((x) => (x.t === 'comma' ? { t: 'lit', v: ',' } : x)).filter((x) => x.t !== 'skip');
  }
  return s;
}
function compile(code) {
  if (cache.has(code)) return cache.get(code);
  const secs = splitSections(code).map(parseSection);
  cache.set(code, secs);
  return secs;
}
const groupDigits = (s, sep) => s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);

function fmtNumber(n, s, L) {
  const toks = s.toks;
  n *= 100 ** s.pct;
  n /= 1000 ** s.scale;
  const di = toks.map((x, k) => (x.t === 'dig' ? k : -1)).filter((k) => k >= 0);
  if (!di.length) return toks.map((x) => (x.t === 'lit' ? x.v : '')).join('');
  const first = di[0], last = di.at(-1);
  const pre = toks.slice(0, first).map((x) => (x.t === 'lit' ? x.v : '')).join(''), post = toks.slice(last + 1).filter((x) => x.t !== 'exp').map((x) => (x.t === 'lit' ? x.v : '')).join('');
  const core = toks.slice(first, last + 1);
  // fractions: "# ?/?" or "0/4"
  const sl = core.findIndex((x) => x.t === 'slash');
  if (sl >= 0) {
    const den = core.slice(sl + 1), fixed = den.filter((x) => x.t === 'lit' && /^\d+$/.test(x.v.trim()))[0], dd = den.filter((x) => x.t === 'dig').length;
    const numPart = core.slice(0, sl), sp = numPart.findIndex((x, k) => x.t === 'lit' && k > 0), hasWhole = sp > 0;
    const a = Math.abs(n);
    let whole = hasWhole ? Math.floor(a) : 0, f = a - whole, best = [0, 1];
    if (fixed) best = [Math.round(f * +fixed.v), +fixed.v];
    else { const maxD = 10 ** Math.max(1, dd) - 1; let err = Infinity; for (let q = 1; q <= maxD; q++) { const p = Math.round(f * q), e = Math.abs(f - p / q); if (e < err - 1e-12) { err = e; best = [p, q]; } } }
    if (best[0] === best[1]) { whole++; best[0] = 0; }
    const sign = n < 0 ? '-' : '';
    const fr = best[0] ? `${best[0]}/${best[1]}` : hasWhole ? '' : `0/${best[1]}`;
    return pre + sign + (hasWhole ? (whole || !fr ? whole + (fr ? ' ' : '') : '') : '') + fr + post;
  }
  const ex = toks.findIndex((x) => x.t === 'exp'), dot = core.findIndex((x) => x.t === 'dot');
  const intT = dot >= 0 ? core.slice(0, dot) : core, fracT = dot >= 0 ? core.slice(dot + 1) : [];
  const fd = fracT.filter((x) => x.t === 'dig');
  let a = Math.abs(n), e = 0;
  if (ex >= 0) {
    const id = Math.max(1, intT.filter((x) => x.t === 'dig').length);
    if (a) { e = Math.floor(Math.log10(a)) - (id - 1); a /= 10 ** e; if (+a.toFixed(fd.length) >= 10 ** id) { a /= 10; e++; } }
  }
  const fixed = a.toFixed(Math.min(20, fd.length)), [ip, fp = ''] = fixed.split('.');
  // the whole part: digits placed from the right; what is left goes to the leftmost place
  let intText;
  const ph = intT.filter((x) => x.t === 'dig'), zeros = ph.filter((x) => x.v === '0').length;
  let digits = ip === '0' && !zeros ? '' : ip;
  if (s.grp || intT.every((x) => x.t === 'dig')) {
    digits = digits.padStart(zeros, '0');
    if (s.grp) digits = groupDigits(digits, L.grp);
    const q = ph.filter((x) => x.v === '?').length - Math.max(0, digits.replace(/\D/g, '').length - zeros);
    intText = (q > 0 ? ' '.repeat(Math.max(0, ph.length - Math.max(zeros, digits.replace(/\D/g, '').length))) : '') + digits;
  } else {
    let k = digits.length, out = '';
    for (let j = intT.length - 1; j >= 0; j--) {
      const x = intT[j];
      if (x.t === 'lit') { out = x.v + out; continue; }
      if (x.t !== 'dig') continue;
      const isFirst = intT.findIndex((y) => y.t === 'dig') === j;
      if (k > 0) { out = (isFirst ? digits.slice(0, k) : digits[k - 1]) + out; k = isFirst ? 0 : k - 1; } else out = (x.v === '0' ? '0' : x.v === '?' ? ' ' : '') + out;
    }
    intText = out;
  }
  // decimals: "0" always, "#" only when needed, "?" a space
  let fracText = '';
  if (fd.length) {
    let digs = fp.split(''), j = digs.length - 1;
    for (let k = fd.length - 1; k >= 0 && j >= 0; k--, j--) { if (digs[j] !== '0' || fd[k].v === '0') break; digs[j] = fd[k].v === '?' ? ' ' : ''; }
    let di2 = 0;
    for (const x of fracT) { if (x.t === 'dig') fracText += digs[di2++] ?? ''; else if (x.t === 'lit') fracText += x.v; }
  }
  const showDot = dot >= 0 && (fd.length ? fracText.trim() !== '' || fd.some((x) => x.v === '0') : true);
  let out = intText + (showDot ? L.dec + fracText : '');
  if (ex >= 0) {
    const ed = toks.slice(ex + 1).filter((x) => x.t === 'dig').length || 2;
    out += 'E' + (e < 0 ? '-' : toks[ex].v === '+' ? '+' : '') + String(Math.abs(e)).padStart(ed, '0');
  }
  return pre + out + post;
}

function fmtDate(n, s, L) {
  const hasFrac = s.toks.find((x) => x.t === 'frac'), d = fromSerial(hasFrac ? n : Math.round(n * 86400) / 86400), ampm = s.toks.some((x) => x.t === 'ampm');
  const ms = Math.round((n * 86400 - Math.floor(n * 86400 + 1e-9)) * 1000);
  let out = '';
  for (const x of s.toks) {
    if (x.t === 'lit') out += x.v;
    else if (x.t === 'el') { const tot = n * 24 * (x.v === 'm' ? 60 : x.v === 's' ? 3600 : 1); out += Math.floor(tot + 1e-9); }
    else if (x.t === 'ampm') out += x.v.length > 3 ? (d.hh < 12 ? 'AM' : 'PM') : d.hh < 12 ? 'A' : 'P';
    else if (x.t === 'frac') out += L.dec + String(ms).padStart(3, '0').slice(0, x.n);
    else if (x.t === 'dt') {
      const v = x.v;
      if (v[0] === 'y') out += v.length <= 2 ? String(d.y).slice(-2) : d.y;
      else if (v[0] === 'm') out += v.length === 1 ? d.m : v.length === 2 ? String(d.m).padStart(2, '0') : v.length === 3 ? monthNames(L.tag, 'short')[d.m - 1].replace('.', '') : v.length === 5 ? monthNames(L.tag, 'long')[d.m - 1][0] : monthNames(L.tag, 'long')[d.m - 1];
      else if (v[0] === 'd') out += v.length === 1 ? d.d : v.length === 2 ? String(d.d).padStart(2, '0') : v.length === 3 ? dayNames(L.tag, 'short')[d.wd] : dayNames(L.tag, 'long')[d.wd];
      else if (v[0] === 'h') { const hh = ampm ? (d.hh % 12 || 12) : d.hh; out += v.length > 1 ? String(hh).padStart(2, '0') : hh; }
      else if (v[0] === 'M') out += v.length > 1 ? String(d.mi).padStart(2, '0') : d.mi;
      else if (v[0] === 's') out += v.length > 1 ? String(d.ss).padStart(2, '0') : d.ss;
    } else if (x.t === 'dig') out += '0';
    else if (x.t === 'dot') out += '.';
    else if (x.t === 'slash') out += '/';
    else if (x.t === 'comma') out += ',';
  }
  return out;
}

/**
 * A value with a format: {text, color}. value: number, text, true/false, null, or an error ({code}).
 */
export function formatValue(v, nf, L = LOCALES.en) {
  if (v === null || v === undefined || v === '') return { text: '' };
  if (typeof v === 'boolean') return { text: boolText(v, L) };
  if (typeof v === 'object') return { text: v.code || '#VALUE!', error: true };
  const code = nf && nf !== 'General' ? nf : '';
  if (typeof v === 'string') {
    if (!code) return { text: v };
    const secs = compile(code), s = secs[3] || secs.find((x) => x.text);
    if (!s) return { text: v };
    return { text: s.toks.map((x) => (x.t === 'lit' ? x.v : x.t === 'at' ? v : '')).join(''), color: s.color };
  }
  if (!code) return { text: general(v, L) };
  const secs = compile(code).filter((x, i) => i < 3 || !x.text);
  let s = secs[0], n = v;
  if (secs.some((x) => x.cond)) {
    const ok = (c) => !c || { '<': v < c[1], '>': v > c[1], '<=': v <= c[1], '>=': v >= c[1], '=': v === c[1], '<>': v !== c[1] }[c[0]];
    s = secs.find((x) => x.cond && ok(x.cond)) || secs.find((x) => !x.cond) || secs[0];
    if (v < 0 && s !== secs[0] && !s.cond) n = Math.abs(v);
  } else if (v < 0 && secs[1]) { s = secs[1]; n = -v; }
  else if (v === 0 && secs[2]) s = secs[2];
  if (s.text && !s.toks.some((x) => x.t === 'dig')) return { text: general(v, L), color: s.color };
  if (s.date) { if (n < 0 || n > 2958465) return { text: '#'.repeat(8), error: true }; return { text: fmtDate(n, s, L), color: s.color }; }
  let text = fmtNumber(n, s, L);
  if (n < 0 && s === secs[0] && /[1-9]/.test(text)) text = '-' + text.replace(/^-/, '');
  return { text, color: s.color };
}
export const isDateFormat = (nf) => !!nf && compile(nf).some((s) => s.date);
export const isTimeOnly = (nf) => !!nf && isDateFormat(nf) && !/[ydM]/.test(nf.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, ''));
export const isPercent = (nf) => !!nf && compile(nf)[0].pct > 0;

// ------------------------------------------------------------------ reading what is typed

const num = (s, L) => {
  s = s.trim().replace(/\s/g, '');
  if (!s) return null;
  let m;
  if (/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s) && (L.dec === '.' || !/^\d{1,3}(\.\d{3})+$/.test(s.replace(/^[-+]/, '')))) return +s;
  if (L.dec === ',') {
    if ((m = /^([-+]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?([eE][-+]?\d+)?$/.exec(s))) return +(m[1] + m[2].replace(/\./g, '') + (m[3] ? '.' + m[3] : '') + (m[4] || ''));
  } else if ((m = /^([-+]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?([eE][-+]?\d+)?$/.exec(s))) return +(m[1] + m[2].replace(/,/g, '') + (m[3] ? '.' + m[3] : '') + (m[4] || ''));
  return null;
};
const decimalsOf = (s, L) => { const i = s.lastIndexOf(L.dec); return i >= 0 && !(L.dec === ',' ? /^\d{1,3}(,\d{3})+$/ : /^$/).test(s) ? s.length - i - 1 : 0; };

function parseDate(s, L) {
  let m, y, mo, d, hh = 0, mi = 0, ss = 0, time = false;
  const tm = /\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s);
  if (tm) { s = s.slice(0, tm.index); hh = +tm[1]; mi = +tm[2]; ss = +(tm[3] || 0); if (tm[4]) hh = (hh % 12) + (/pm/i.test(tm[4]) ? 12 : 0); time = true; }
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    [d, mo, y] = L.dmy === 'mdy' ? [+m[2], +m[1], +m[3]] : [+m[1], +m[2], +m[3]];
    if (m[3].length === 2) y += y < 30 ? 2000 : 1900;
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59 || ss > 59) return null;
  const v = toSerial(y, mo, d, hh, mi, ss);
  if (fromSerial(Math.floor(v)).d !== d) return null;
  const base = /^\d{4}-/.test(s) ? 'yyyy-mm-dd' : (L.dmy === 'mdy' ? ['mm', 'dd', 'yyyy'] : ['dd', 'mm', 'yyyy']).join(s.match(/[/.-]/)[0]);
  return { v, nf: time ? base + ' hh:mm' + (tm[3] ? ':ss' : '') : base };
}

/**
 * What a person typed in a cell, as a value: {v, nf} (nf: a format that fits, when the cell has none) or {f} for a
 * formula. A leading ' keeps it as text.
 */
export function parseInput(raw, L = LOCALES.en, currency = 'EUR') {
  const s = String(raw ?? '');
  if (s === '') return { v: null };
  if (s[0] === "'") return { v: s.slice(1) };
  if (s[0] === '=' && s.length > 1) return { f: s };
  const t = s.trim();
  if (!t) return { v: s };
  const up = t.toUpperCase();
  if (up === 'TRUE' || up === L.t) return { v: true };
  if (up === 'FALSE' || up === L.f) return { v: false };
  let m, n;
  if ((n = num(t, L)) !== null) return { v: n };
  if ((m = /^([-+]?[\d.,\s]+)\s*%$/.exec(t)) && (n = num(m[1], L)) !== null) return { v: n / 100, nf: decimalsOf(m[1].trim(), L) ? '0.' + '0'.repeat(Math.min(4, decimalsOf(m[1].trim(), L))) + '%' : '0%' };
  // amounts: "€ 12,50", "12,50 €", "$1,200", "-£3"
  if ((m = /^([-+]?)\s*(€|\$|£|¥|₹|R\$|CHF|kr|zł)\s*([\d.,\s]+)$/i.exec(t)) || (m = /^([-+]?)\s*([\d.,\s]+?)\s*(€|\$|£|¥|₹|R\$|CHF|kr|zł)$/i.exec(t))) {
    const isPre = /\d/.test(m[3]), sym = isPre ? m[2] : m[3], amount = isPre ? m[3] : m[2];
    if ((n = num(amount, L)) !== null) {
      const code = Object.keys(CURRENCY).find((k) => CURRENCY[k].toLowerCase() === sym.toLowerCase()) || currency, dec = decimalsOf(amount.trim(), L) ? 2 : (Number.isInteger(n) ? 0 : 2);
      return { v: (m[1] === '-' ? -1 : 1) * n, nf: currencyFormat(code, L === LOCALES.it ? 'it' : L.dec === ',' ? 'it' : 'en', dec) };
    }
  }
  const d = parseDate(t, L);
  if (d) return d;
  if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(t))) {
    let hh = +m[1];
    const mi = +m[2], ss = +(m[3] || 0);
    if (m[4]) hh = (hh % 12) + (/pm/i.test(m[4]) ? 12 : 0);
    if (hh < 24 && mi < 60 && ss < 60) return { v: (hh * 3600 + mi * 60 + ss) / 86400, nf: m[3] ? 'hh:mm:ss' : 'hh:mm' };
  }
  return { v: s };
}

/** A number written for a formula or for editing: no grouping, the decimal separator of the language. */
export const plainNumber = (n, L) => { const s = Number.isInteger(n) ? String(n) : String(+n.toPrecision(15)); return L.dec === '.' ? s : s.replace('.', L.dec); };

/** What the bar above the grid shows to edit a cell: the formula, or the value as it can be typed again. */
export function editText(cell, L) {
  if (!cell) return '';
  if (cell.f) return cell.f;
  const v = cell.v, nf = cell.s?.nf;
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return boolText(v, L);
  if (typeof v === 'string') return /^(=|')/.test(v) || parseInput(v, L).v !== v ? "'" + v : v;
  if (nf && isDateFormat(nf)) {
    const d = fromSerial(v), date = (L.dmy === 'mdy' ? [d.m, d.d, d.y] : [d.d, d.m, d.y]).join(L.sep === '-' ? '-' : L.sep), time = `${d.hh}:${String(d.mi).padStart(2, '0')}${d.ss ? ':' + String(d.ss).padStart(2, '0') : ''}`;
    if (isTimeOnly(nf)) return time;
    return v % 1 ? date + ' ' + time : date;
  }
  if (nf && isPercent(nf)) return plainNumber(+(v * 100).toPrecision(15), L) + '%';
  return plainNumber(v, L);
}
