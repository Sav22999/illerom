/**
 * Formulas: reading ("=SUM(A1:B3)*2"), computing, and keeping every result up to date. Formulas are always written in
 * the standard English of spreadsheets, whatever the language of the app or of the workbook: English names of the
 * functions, "," between arguments, "." for decimals, TRUE and FALSE. Only the values shown in the cells follow the
 * language of the workbook.
 *
 * Engine: each formula remembers what it read; a change marks dirty only the formulas that depend on it, and they are
 * computed again on demand. A result that is a table spills into the cells below and to the right (#SPILL! when
 * something is in the way). A formula that reads itself gives #REF! (circular reference).
 */
import { boolText, formatValue, fromSerial, general, loc, nowSerial, parseInput, toSerial, todaySerial } from './format.js';

export class Err { constructor(code, msg = '') { this.code = code; this.msg = msg; } toString() { return this.code; } }
export const isErr = (v) => v instanceof Err;
const E = (c, m) => new Err(c, m);
const DIV0 = '#DIV/0!', NA = '#N/A', NAME = '#NAME?', NUM = '#NUM!', REF = '#REF!', VALUE = '#VALUE!', SPILL = '#SPILL!', CALC = '#CALC!';
export const ERRORS = [DIV0, NA, NAME, '#NULL!', NUM, REF, VALUE, SPILL, CALC];

const colNum = (s) => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
const colName = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const MAXR = 100000, MAXC = 702;

// ------------------------------------------------------------------ reading

const REF_RE = /^(?:('(?:[^']|'')+'|[A-Za-z_À-￿][A-Za-z0-9_.À-￿]*)!)?(?:(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?::(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7}))?|(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})|(\$?)(\d{1,7}):(\$?)(\d{1,7}))(?![A-Za-z0-9_.(À-￿])/;

/** Tokens with their source text (so a formula can be written back changing only some references). */
export function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i], rest = src.slice(i);
    let m;
    if (/\s/.test(ch)) { m = /^\s+/.exec(rest); out.push({ t: 'ws', src: m[0] }); i += m[0].length; continue; }
    if (ch === '"') {
      let j = i + 1, v = '';
      for (; j < src.length; j++) { if (src[j] === '"') { if (src[j + 1] === '"') { v += '"'; j++; continue; } break; } v += src[j]; }
      if (j >= src.length) throw E(NAME, 'quote');
      out.push({ t: 'str', v, src: src.slice(i, j + 1) }); i = j + 1; continue;
    }
    if (ch === '#') { m = /^#(DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!|SPILL!|CALC!)/i.exec(rest); if (m) { out.push({ t: 'err', v: m[0].toUpperCase(), src: m[0] }); i += m[0].length; continue; } }
    // references come before numbers ("1:3") and names ("A1")
    const prevT = out.filter((x) => x.t !== 'ws').at(-1);
    const operand = !prevT || ['op', 'sep', 'lp', 'lb', 'semi'].includes(prevT.t);
    if (operand && (m = REF_RE.exec(rest))) {
      const r = refOf(m);
      if (r) { out.push({ t: 'ref', ref: r, src: m[0] }); i += m[0].length; continue; }
    }
    if ((m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(rest))) { out.push({ t: 'num', v: +m[0], src: m[0] }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_À-￿][A-Za-z0-9_.À-￿]*/.exec(rest))) {
      const w = m[0];
      let j = i + w.length;
      while (src[j] === ' ') j++;
      if (src[j] === '(') out.push({ t: 'func', v: w.toUpperCase().replace(/^_XLFN\.(_XLWS\.)?/, ''), src: w });
      else if (/^(TRUE|FALSE)$/i.test(w)) out.push({ t: 'bool', v: /^TRUE$/i.test(w), src: w });
      else out.push({ t: 'name', v: w, src: w });
      i += w.length; continue;
    }
    if ((m = /^(<=|>=|<>|[-+*/^&=<>%])/.exec(rest))) { out.push({ t: 'op', v: m[0], src: m[0] }); i += m[0].length; continue; }
    if (ch === ',' || ch === ';') { out.push({ t: ch === ';' && depth(out) === 'brace' ? 'semi' : 'sep', src: ch }); i++; continue; }
    if (ch === '(') { out.push({ t: 'lp', src: ch }); i++; continue; }
    if (ch === ')') { out.push({ t: 'rp', src: ch }); i++; continue; }
    if (ch === '{') { out.push({ t: 'lb', src: ch }); i++; continue; }
    if (ch === '}') { out.push({ t: 'rb', src: ch }); i++; continue; }
    throw E(NAME, 'char');
  }
  return out;
}
/** Inside an array constant {…} or not. */
const depth = (out) => { for (let k = out.length - 1; k >= 0; k--) { if (out[k].t === 'rb') return ''; if (out[k].t === 'lb') return 'brace'; } return ''; };
function refOf(m) {
  let sheet = m[1] || null;
  if (sheet && sheet[0] === "'") sheet = sheet.slice(1, -1).replace(/''/g, "'");
  if (m[3]) {
    const c1 = colNum(m[3]), r1 = +m[5];
    if (c1 > 16384 || r1 < 1) return null;
    if (m[7]) return { sheet, kind: 'range', r1, c1, r2: +m[9], c2: colNum(m[7]), ar1: !!m[4], ac1: !!m[2], ar2: !!m[8], ac2: !!m[6] };
    return { sheet, kind: 'cell', r1, c1, r2: r1, c2: c1, ar1: !!m[4], ac1: !!m[2], ar2: !!m[4], ac2: !!m[2] };
  }
  if (m[11]) return { sheet, kind: 'cols', r1: 1, r2: MAXR, c1: colNum(m[11]), c2: colNum(m[13]), ac1: !!m[10], ac2: !!m[12] };
  if (m[15]) return { sheet, kind: 'rows', r1: +m[15], r2: +m[17], c1: 1, c2: MAXC, ar1: !!m[14], ar2: !!m[16] };
  return null;
}

/** A formula (without "=") as a tree. */
export function parse(src) {
  const toks = tokenize(src).filter((x) => x.t !== 'ws');
  let p = 0;
  const peek = () => toks[p], next = () => toks[p++];
  const isOp = (...v) => peek()?.t === 'op' && v.includes(peek().v);
  const expect = (t) => { if (peek()?.t !== t) throw E(NAME, 'syntax'); return next(); };
  function cmp() { let a = cat(); while (isOp('=', '<>', '<', '>', '<=', '>=')) { const op = next().v; a = { t: 'bin', op, a, b: cat() }; } return a; }
  function cat() { let a = add(); while (isOp('&')) { next(); a = { t: 'bin', op: '&', a, b: add() }; } return a; }
  function add() { let a = mul(); while (isOp('+', '-')) { const op = next().v; a = { t: 'bin', op, a, b: mul() }; } return a; }
  function mul() { let a = pow(); while (isOp('*', '/')) { const op = next().v; a = { t: 'bin', op, a, b: pow() }; } return a; }
  function pow() { let a = pct(); while (isOp('^')) { next(); a = { t: 'bin', op: '^', a, b: pct() }; } return a; }
  function pct() { let a = un(); while (isOp('%')) { next(); a = { t: 'pct', a }; } return a; }
  function un() { if (isOp('-', '+')) { const op = next().v; return op === '-' ? { t: 'neg', a: un() } : un(); } return prim(); }
  function prim() {
    const tk = next();
    if (!tk) throw E(NAME, 'syntax');
    if (tk.t === 'num') return { t: 'v', v: tk.v };
    if (tk.t === 'str') return { t: 'v', v: tk.v };
    if (tk.t === 'bool') return { t: 'v', v: tk.v };
    if (tk.t === 'err') return { t: 'v', v: E(tk.v) };
    if (tk.t === 'ref') return { t: 'ref', ref: tk.ref };
    if (tk.t === 'lp') { const e = cmp(); expect('rp'); return e; }
    if (tk.t === 'lb') {
      const rows = [[]];
      for (;;) {
        let v;
        const neg = isOp('-') ? (next(), -1) : 1, x = next();
        if (!x) throw E(NAME, 'syntax');
        if (x.t === 'num') v = neg * x.v; else if (x.t === 'str' || x.t === 'bool') v = x.v; else if (x.t === 'err') v = E(x.v); else throw E(NAME, 'array');
        rows.at(-1).push(v);
        const s = next();
        if (s?.t === 'rb') break;
        if (s?.t === 'semi' || (s?.t === 'sep' && s.src === ';')) rows.push([]);
        else if (s?.t !== 'sep') throw E(NAME, 'array');
      }
      return { t: 'arr', v: rows };
    }
    if (tk.t === 'func') {
      expect('lp');
      const name = tk.v, args = [];
      if (peek()?.t === 'rp') { next(); return { t: 'fn', name, args }; }
      for (;;) {
        if (peek()?.t === 'sep' || peek()?.t === 'rp') args.push({ t: 'v', v: null, empty: true });
        else args.push(cmp());
        const s = next();
        if (s?.t === 'rp') break;
        if (s?.t !== 'sep') throw E(NAME, 'syntax');
      }
      return { t: 'fn', name, args };
    }
    if (tk.t === 'name') return { t: 'name', v: tk.v };
    throw E(NAME, 'syntax');
  }
  const tree = cmp();
  if (p < toks.length) throw E(NAME, 'syntax');
  return tree;
}

/** A formula as kept in the cells: names of the functions in capitals, "," between the arguments (";" is read too). */
export function canonical(f) {
  if (!f || f[0] !== '=') return f;
  let toks;
  try { toks = tokenize(f.slice(1)); } catch { return f; }
  return '=' + toks.map((x) => (x.t === 'func' ? x.v : x.t === 'sep' ? ',' : x.t === 'bool' ? (x.v ? 'TRUE' : 'FALSE') : x.src)).join('');
}

// ------------------------------------------------------------------ values

/** A rectangle of cells, read lazily. */
export class Ref {
  constructor(eng, sh, r1, c1, r2, c2) { Object.assign(this, { eng, sh, r1, c1, r2, c2 }); }
  get rows() { return this.r2 - this.r1 + 1; }
  get cols() { return this.c2 - this.c1 + 1; }
  /** The values as a table (formulas inside are computed). */
  grid() { return this.eng.readRange(this); }
  one() { return this.eng.read(this.sh, this.r1, this.c1); }
}
const isRef = (v) => v instanceof Ref;
const isArr = Array.isArray;
/** A table of values from anything. */
const table = (v) => (isRef(v) ? v.grid() : isArr(v) ? v : [[v]]);
const flat = (v) => table(v).flat();

let CTX = null; // the cell being computed (for ROW(), implicit intersection and the language)
/** One value from a reference or a table: the cell on the same row or column (implicit intersection), or the first one. */
function scalar(v) {
  if (isRef(v)) {
    if (v.rows === 1 && v.cols === 1) return v.one();
    if (CTX && v.cols === 1 && CTX.r >= v.r1 && CTX.r <= v.r2 && CTX.sh === v.sh) return v.eng.read(v.sh, CTX.r, v.c1);
    if (CTX && v.rows === 1 && CTX.c >= v.c1 && CTX.c <= v.c2 && CTX.sh === v.sh) return v.eng.read(v.sh, v.r1, CTX.c);
    return E(VALUE, 'range');
  }
  if (isArr(v)) return v[0]?.[0] ?? null;
  return v;
}
const L = () => CTX?.L || loc('en');
function toNum(v) {
  v = scalar(v);
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErr(v)) throw v;
  const t = String(v).trim();
  if (t === '') return 0;
  const p = parseInput(t, loc('en'));
  if (typeof p.v === 'number') return p.v;
  throw E(VALUE, 'number');
}
function toStr(v) {
  v = scalar(v);
  if (isErr(v)) throw v;
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return boolText(v, L());
  if (typeof v === 'number') return general(v, L());
  return String(v);
}
function toBool(v) {
  v = scalar(v);
  if (isErr(v)) throw v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null || v === undefined) return false;
  const u = String(v).toUpperCase();
  if (u === 'TRUE') return true;
  if (u === 'FALSE') return false;
  throw E(VALUE, 'bool');
}
const int = (v) => Math.trunc(toNum(v));
const check = (n) => { if (!Number.isFinite(n)) throw E(NUM); return n; };

/** The numbers of the arguments, as SUM reads them: in ranges only numbers count; typed values are converted. */
function nums(args, { text0 = false } = {}) {
  const out = [];
  for (const a of args) {
    if (isRef(a) || isArr(a)) {
      for (const v of flat(a)) {
        if (typeof v === 'number') out.push(v);
        else if (isErr(v)) throw v;
        else if (text0 && (typeof v === 'string' || typeof v === 'boolean')) out.push(typeof v === 'boolean' ? +v : 0);
      }
    } else if (a !== null && a !== undefined) {
      if (isErr(a)) throw a;
      out.push(toNum(a));
    }
  }
  return out;
}
const firstErr = (args) => { for (const a of args) if (isErr(a)) return a; return null; };

/** Comparison as in spreadsheets: numbers < texts < logicals; texts without case. */
function compare(a, b) {
  const rank = (v) => (v === null ? 0 : typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : 3);
  if (a === null && typeof b === 'string') a = '';
  if (b === null && typeof a === 'string') b = '';
  if (a === null && typeof b === 'number') a = 0;
  if (b === null && typeof a === 'number') b = 0;
  if (a === null && typeof b === 'boolean') a = false;
  if (b === null && typeof a === 'boolean') b = false;
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'string') { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The criterion of COUNTIF, SUMIF…: ">5", "<>x", "ab*", 7, "" … */
function criterion(c) {
  c = scalar(c);
  if (isErr(c)) throw c;
  if (typeof c === 'number' || typeof c === 'boolean') return (v) => (typeof c === 'number' ? (typeof v === 'number' ? v === c : typeof v === 'string' && v.trim() !== '' && +v === c) : v === c);
  let s = c === null ? '' : String(c), op = '=';
  const m = /^(<=|>=|<>|<|>|=)/.exec(s);
  if (m) { op = m[1]; s = s.slice(m[1].length); }
  const n = s.trim() === '' ? null : parseInput(s, loc('en')).v;
  if (typeof n === 'number') {
    const f = { '=': (v) => v === n, '<>': (v) => v !== n, '<': (v) => v < n, '>': (v) => v > n, '<=': (v) => v <= n, '>=': (v) => v >= n }[op];
    return (v) => (typeof v === 'number' ? f(v) : op === '<>');
  }
  if (s === '') return op === '<>' ? (v) => v !== null && v !== '' : op === '=' ? (v) => v === null || v === '' : () => false;
  const up = s.toUpperCase();
  if (up === 'TRUE' || up === 'FALSE') { const b = up === 'TRUE'; return op === '<>' ? (v) => v !== b : (v) => v === b; }
  if (op === '=' || op === '<>') {
    const re = wild(s);
    return op === '=' ? (v) => typeof v === 'string' && re.test(v) : (v) => !(typeof v === 'string' && re.test(v));
  }
  const ls = s.toLowerCase();
  return (v) => typeof v === 'string' && { '<': v.toLowerCase() < ls, '>': v.toLowerCase() > ls, '<=': v.toLowerCase() <= ls, '>=': v.toLowerCase() >= ls }[op];
}
const wild = (s) => new RegExp('^' + s.replace(/~([*?~])|([.+^${}()|[\]\\])|(\*)|(\?)/g, (m, esc, sp, star, q) => (esc ? '\\' + esc : sp ? '\\' + sp : star ? '[\\s\\S]*' : '[\\s\\S]')) + '$', 'i');

// ------------------------------------------------------------------ computing

/** Broadcasts an operation over tables: a table and a single value, or two tables of the same size. */
function lift(a, b, f) {
  const A = isRef(a) && a.rows * a.cols > 1 ? a.grid() : isArr(a) ? a : null, B = isRef(b) && b.rows * b.cols > 1 ? b.grid() : isArr(b) ? b : null;
  if (!A && !B) return f(scalar(a), scalar(b));
  const ra = A ? A.length : 1, ca = A ? A[0].length : 1, rb = B ? B.length : 1, cb = B ? B[0].length : 1, R = Math.max(ra, rb), C = Math.max(ca, cb);
  const out = [];
  for (let i = 0; i < R; i++) {
    const row = [];
    for (let j = 0; j < C; j++) {
      const x = A ? (A[ra === 1 ? 0 : i]?.[ca === 1 ? 0 : j]) : scalar(a), y = B ? (B[rb === 1 ? 0 : i]?.[cb === 1 ? 0 : j]) : scalar(b);
      row.push(x === undefined || y === undefined ? E(NA) : safe(() => f(x ?? null, y ?? null)));
    }
    out.push(row);
  }
  return out;
}
const safe = (fn) => { try { return fn(); } catch (e) { if (isErr(e)) return e; throw e; } };
function binop(op, a, b) {
  return lift(a, b, (x, y) => {
    if (isErr(x)) return x;
    if (isErr(y)) return y;
    switch (op) {
      case '+': return check(toNum(x) + toNum(y));
      case '-': return check(toNum(x) - toNum(y));
      case '*': return check(toNum(x) * toNum(y));
      case '/': { const d = toNum(y); if (d === 0) return E(DIV0); return check(toNum(x) / d); }
      case '^': { const r = toNum(x) ** toNum(y); return Number.isFinite(r) ? r : E(NUM); }
      case '&': return toStr(x) + toStr(y);
      case '=': return compare(x, y) === 0;
      case '<>': return compare(x, y) !== 0;
      case '<': return compare(x, y) < 0;
      case '>': return compare(x, y) > 0;
      case '<=': return compare(x, y) <= 0;
      case '>=': return compare(x, y) >= 0;
    }
    return E(VALUE);
  });
}
const mapv = (v, f) => (isRef(v) && v.rows * v.cols > 1 ? v.grid() : isArr(v) ? v : null)?.map((row) => row.map((x) => safe(() => (isErr(x) ? x : f(x))))) ?? safe(() => { const s = scalar(v); return isErr(s) ? s : f(s); });

function evaluate(n, eng) {
  switch (n.t) {
    case 'v': return n.v;
    case 'arr': return n.v;
    case 'ref': return eng.ref(n.ref, CTX);
    case 'neg': return mapv(evaluate(n.a, eng), (x) => -toNum(x));
    case 'pct': return mapv(evaluate(n.a, eng), (x) => toNum(x) / 100);
    case 'bin': return binop(n.op, evaluate(n.a, eng), evaluate(n.b, eng));
    case 'name': return E(NAME, n.v);
    case 'fn': {
      const def = FN[n.name];
      if (!def) return E(NAME, n.name);
      if (def.v) CTX.vol = true;
      const [min, max] = def.n || [0, 255];
      if (n.args.length < min || n.args.length > max) return E(NA, 'args');
      try {
        if (def.lazy) return def.f(n.args.map((a) => () => (a.empty ? null : evaluate(a, eng))), eng);
        const args = n.args.map((a) => (a.empty ? null : evaluate(a, eng)));
        if (!def.raw) { const e = firstErr(args); if (e) return e; }
        return def.f(args, eng);
      } catch (e) {
        if (isErr(e)) return e;
        throw e;
      }
    }
  }
  return E(VALUE);
}

// ------------------------------------------------------------------ the functions

const FN = {};
/** def: f(args, engine); n: [min, max] arguments; lazy: arguments as functions; raw: errors reach the function; v: volatile */
const def = (names, f, n, o = {}) => { for (const k of names.split(' ')) FN[k] = { f, n, ...o }; };
const agg = (fn, o) => (args) => fn(nums(args, o));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => { if (!a.length) throw E(DIV0); return sum(a) / a.length; };
const variance = (a, s) => { const m = mean(a), n = a.length - (s ? 1 : 0); if (n <= 0) throw E(DIV0); return a.reduce((x, y) => x + (y - m) ** 2, 0) / n; };
const sorted = (a) => [...a].sort((x, y) => x - y);
function pctile(a, k, exc) {
  const s = sorted(a), n = s.length;
  if (!n || k < 0 || k > 1) throw E(NUM);
  const h = exc ? (n + 1) * k - 1 : (n - 1) * k;
  if (h < 0 || h > n - 1) throw E(NUM);
  const lo = Math.floor(h);
  return s[lo] + (h - lo) * ((s[lo + 1] ?? s[lo]) - s[lo]);
}
const round = (n, d) => { const f = 10 ** d, x = Math.abs(n) * f; const r = Math.round(+x.toPrecision(15)) / f; return Math.sign(n) * r; };

// math
def('SUM', agg(sum));
def('PRODUCT', agg((a) => a.reduce((x, y) => x * y, a.length ? 1 : 0)));
def('SUMSQ', agg((a) => sum(a.map((x) => x * x))));
def('ABS', ([a]) => Math.abs(toNum(a)), [1, 1]);
def('ROUND', ([a, d]) => round(toNum(a), int(d ?? 0)), [1, 2]);
def('ROUNDUP', ([a, d]) => { const f = 10 ** int(d ?? 0), x = toNum(a); return Math.sign(x) * Math.ceil(+(Math.abs(x) * f).toPrecision(15)) / f; }, [1, 2]);
def('ROUNDDOWN', ([a, d]) => { const f = 10 ** int(d ?? 0), x = toNum(a); return Math.sign(x) * Math.floor(+(Math.abs(x) * f).toPrecision(15)) / f; }, [1, 2]);
def('MROUND', ([a, m]) => { const x = toNum(a), y = toNum(m); if (!y) return 0; if (x * y < 0) throw E(NUM); return round(Math.round(x / y) * y, 10); }, [2, 2]);
def('CEILING CEILING.MATH CEILING.PRECISE ISO.CEILING', ([a, m]) => { const x = toNum(a), y = m === undefined || m === null ? 1 : Math.abs(toNum(m)); return y ? round(Math.ceil(+(x / y).toPrecision(15)) * y, 10) : 0; }, [1, 3]);
def('FLOOR FLOOR.MATH FLOOR.PRECISE', ([a, m]) => { const x = toNum(a), y = m === undefined || m === null ? 1 : Math.abs(toNum(m)); return y ? round(Math.floor(+(x / y).toPrecision(15)) * y, 10) : 0; }, [1, 3]);
def('INT', ([a]) => Math.floor(toNum(a)), [1, 1]);
def('TRUNC', ([a, d]) => { const f = 10 ** int(d ?? 0); return Math.trunc(toNum(a) * f) / f; }, [1, 2]);
def('MOD', ([a, b]) => { const x = toNum(a), y = toNum(b); if (!y) throw E(DIV0); return round(x - y * Math.floor(x / y), 12); }, [2, 2]);
def('POWER', ([a, b]) => check(toNum(a) ** toNum(b)), [2, 2]);
def('SQRT', ([a]) => { const x = toNum(a); if (x < 0) throw E(NUM); return Math.sqrt(x); }, [1, 1]);
def('EXP', ([a]) => check(Math.exp(toNum(a))), [1, 1]);
def('LN', ([a]) => { const x = toNum(a); if (x <= 0) throw E(NUM); return Math.log(x); }, [1, 1]);
def('LOG', ([a, b]) => { const x = toNum(a), y = b === undefined || b === null ? 10 : toNum(b); if (x <= 0 || y <= 0 || y === 1) throw E(NUM); return Math.log(x) / Math.log(y); }, [1, 2]);
def('LOG10', ([a]) => { const x = toNum(a); if (x <= 0) throw E(NUM); return Math.log10(x); }, [1, 1]);
def('PI', () => Math.PI, [0, 0]);
def('RAND', () => Math.random(), [0, 0], { v: true });
def('RANDBETWEEN', ([a, b]) => { const x = Math.ceil(toNum(a)), y = Math.floor(toNum(b)); if (y < x) throw E(NUM); return x + Math.floor(Math.random() * (y - x + 1)); }, [2, 2], { v: true });
def('RANDARRAY', ([r, c, lo, hi, whole]) => { const R = int(r ?? 1), C = int(c ?? 1), a = toNum(lo ?? 0), b = toNum(hi ?? 1), w = whole ? toBool(whole) : false; return Array.from({ length: R }, () => Array.from({ length: C }, () => (w ? Math.floor(a + Math.random() * (b - a + 1)) : a + Math.random() * (b - a)))); }, [0, 5], { v: true });
def('SIGN', ([a]) => Math.sign(toNum(a)), [1, 1]);
def('EVEN', ([a]) => { const x = toNum(a), c = Math.ceil(Math.abs(x) / 2) * 2; return Math.sign(x) * c; }, [1, 1]);
def('ODD', ([a]) => { const x = toNum(a); let c = Math.ceil(Math.abs(x)); if (c % 2 === 0) c++; return (x < 0 ? -1 : 1) * c; }, [1, 1]);
const fact = (n) => { if (n < 0) throw E(NUM); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
def('FACT', ([a]) => check(fact(Math.floor(toNum(a)))), [1, 1]);
def('COMBIN', ([a, b]) => { const n = int(a), k = int(b); if (k < 0 || n < k) throw E(NUM); let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); }, [2, 2]);
def('PERMUT', ([a, b]) => { const n = int(a), k = int(b); if (k < 0 || n < k) throw E(NUM); let r = 1; for (let i = 0; i < k; i++) r *= n - i; return r; }, [2, 2]);
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
def('GCD', agg((a) => a.map(Math.trunc).reduce((x, y) => gcd(x, y), 0)));
def('LCM', agg((a) => a.map(Math.trunc).reduce((x, y) => (x && y ? (x * y) / gcd(x, y) : 0), 1)));
def('QUOTIENT', ([a, b]) => { const y = toNum(b); if (!y) throw E(DIV0); return Math.trunc(toNum(a) / y); }, [2, 2]);
for (const [k, f] of Object.entries({ SIN: Math.sin, COS: Math.cos, TAN: Math.tan, ASIN: Math.asin, ACOS: Math.acos, ATAN: Math.atan, SINH: Math.sinh, COSH: Math.cosh, TANH: Math.tanh })) def(k, ([a]) => check(f(toNum(a))), [1, 1]);
def('ATAN2', ([x, y]) => { const a = toNum(x), b = toNum(y); if (!a && !b) throw E(DIV0); return Math.atan2(b, a); }, [2, 2]);
def('DEGREES', ([a]) => (toNum(a) * 180) / Math.PI, [1, 1]);
def('RADIANS', ([a]) => (toNum(a) * Math.PI) / 180, [1, 1]);
def('SUMPRODUCT', (args) => {
  const ts = args.map(table), R = ts[0].length, C = ts[0][0].length;
  if (ts.some((t) => t.length !== R || t[0].length !== C)) throw E(VALUE);
  let s = 0;
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { let p = 1; for (const t of ts) { const v = t[i][j]; if (isErr(v)) throw v; p *= typeof v === 'number' ? v : typeof v === 'boolean' ? +v : 0; } s += p; }
  return s;
}, [1, 255]);
def('SUBTOTAL', ([k, ...rest]) => { const n = int(k) % 100, f = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV', 8: 'STDEVP', 9: 'SUM', 10: 'VAR', 11: 'VARP' }[n]; if (!f) throw E(VALUE); return FN[f].f(rest); }, [2, 255]);
def('SEQUENCE', ([r, c, s, st]) => { const R = int(r), C = int(c ?? 1), a = toNum(s ?? 1), d = toNum(st ?? 1); if (R < 1 || C < 1 || R * C > 1e6) throw E(VALUE); return Array.from({ length: R }, (_, i) => Array.from({ length: C }, (_, j) => a + (i * C + j) * d)); }, [1, 4]);

// statistics
def('AVERAGE', agg(mean));
def('AVERAGEA', agg(mean, { text0: true }));
def('COUNT', (args) => { let n = 0; for (const a of args) { if (isRef(a) || isArr(a)) { for (const v of flat(a)) if (typeof v === 'number') n++; } else if (typeof a === 'number' || (typeof a === 'string' && typeof parseInput(a, loc('en')).v === 'number') || typeof a === 'boolean') n++; } return n; }, [0, 255], { raw: true });
def('COUNTA', (args) => { let n = 0; for (const a of args) { if (isRef(a) || isArr(a)) { for (const v of flat(a)) if (v !== null && v !== '') n++; } else if (a !== null) n++; } return n; }, [0, 255], { raw: true });
def('COUNTBLANK', ([a]) => flat(a).filter((v) => v === null || v === '').length, [1, 1]);
def('MAX', agg((a) => (a.length ? Math.max(...a) : 0)));
def('MIN', agg((a) => (a.length ? Math.min(...a) : 0)));
def('MAXA', agg((a) => (a.length ? Math.max(...a) : 0), { text0: true }));
def('MINA', agg((a) => (a.length ? Math.min(...a) : 0), { text0: true }));
def('MEDIAN', agg((a) => { if (!a.length) throw E(NUM); const s = sorted(a), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }));
def('MODE MODE.SNGL', agg((a) => { const c = new Map(); let best = null, n = 1; for (const x of a) { const k = (c.get(x) || 0) + 1; c.set(x, k); if (k > n) { n = k; best = x; } } if (best === null) throw E(NA); return best; }));
def('STDEV STDEV.S', agg((a) => Math.sqrt(variance(a, true))));
def('STDEVP STDEV.P', agg((a) => Math.sqrt(variance(a, false))));
def('VAR VAR.S', agg((a) => variance(a, true)));
def('VARP VAR.P', agg((a) => variance(a, false)));
def('LARGE', ([a, k]) => { const s = sorted(nums([a])).reverse(), i = int(k); if (i < 1 || i > s.length) throw E(NUM); return s[i - 1]; }, [2, 2]);
def('SMALL', ([a, k]) => { const s = sorted(nums([a])), i = int(k); if (i < 1 || i > s.length) throw E(NUM); return s[i - 1]; }, [2, 2]);
def('RANK RANK.EQ', ([v, a, o]) => { const x = toNum(v), s = nums([a]); if (!s.includes(x)) throw E(NA); return 1 + s.filter((y) => (o && toNum(o) ? y < x : y > x)).length; }, [2, 3]);
def('RANK.AVG', ([v, a, o]) => { const x = toNum(v), s = nums([a]); if (!s.includes(x)) throw E(NA); const b = s.filter((y) => (o && toNum(o) ? y < x : y > x)).length, e = s.filter((y) => y === x).length; return b + (e + 1) / 2; }, [2, 3]);
def('PERCENTILE PERCENTILE.INC', ([a, k]) => pctile(nums([a]), toNum(k)), [2, 2]);
def('PERCENTILE.EXC', ([a, k]) => pctile(nums([a]), toNum(k), true), [2, 2]);
def('QUARTILE QUARTILE.INC', ([a, q]) => { const k = int(q); if (k < 0 || k > 4) throw E(NUM); return pctile(nums([a]), k / 4); }, [2, 2]);
def('PERCENTRANK PERCENTRANK.INC', ([a, v, d]) => { const s = sorted(nums([a])), x = toNum(v), n = s.length; if (!n || x < s[0] || x > s[n - 1]) throw E(NA); let i = s.findIndex((y) => y >= x); let r = s[i] === x ? i / (n - 1 || 1) : (i - 1 + (x - s[i - 1]) / (s[i] - s[i - 1])) / (n - 1); return Math.floor(r * 10 ** int(d ?? 3)) / 10 ** int(d ?? 3); }, [2, 3]);
const pairs = (a, b) => { const x = flat(a), y = flat(b); if (x.length !== y.length) throw E(NA); const out = [[], []]; x.forEach((v, i) => { if (typeof v === 'number' && typeof y[i] === 'number') { out[0].push(v); out[1].push(y[i]); } }); if (out[0].length < 2) throw E(DIV0); return out; };
function linreg(ys, xs) { const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; }); if (!sxx) throw E(DIV0); const b = sxy / sxx; return { b, a: my - b * mx, r: syy ? sxy / Math.sqrt(sxx * syy) : 0 }; }
def('CORREL PEARSON', ([a, b]) => { const [x, y] = pairs(a, b); return linreg(y, x).r; }, [2, 2]);
def('RSQ', ([a, b]) => { const [y, x] = pairs(a, b); return linreg(y, x).r ** 2; }, [2, 2]);
def('SLOPE', ([a, b]) => { const [y, x] = pairs(a, b); return linreg(y, x).b; }, [2, 2]);
def('INTERCEPT', ([a, b]) => { const [y, x] = pairs(a, b); return linreg(y, x).a; }, [2, 2]);
def('FORECAST FORECAST.LINEAR', ([v, a, b]) => { const [y, x] = pairs(a, b), r = linreg(y, x); return r.a + r.b * toNum(v); }, [3, 3]);
def('COVARIANCE.P COVAR', ([a, b]) => { const [x, y] = pairs(a, b), mx = mean(x), my = mean(y); return sum(x.map((v, i) => (v - mx) * (y[i] - my))) / x.length; }, [2, 2]);
def('COVARIANCE.S', ([a, b]) => { const [x, y] = pairs(a, b), mx = mean(x), my = mean(y); return sum(x.map((v, i) => (v - mx) * (y[i] - my))) / (x.length - 1); }, [2, 2]);
def('GEOMEAN', agg((a) => { if (!a.length || a.some((x) => x <= 0)) throw E(NUM); return Math.exp(sum(a.map(Math.log)) / a.length); }));
def('HARMEAN', agg((a) => { if (!a.length || a.some((x) => x <= 0)) throw E(NUM); return a.length / sum(a.map((x) => 1 / x)); }));
def('AVEDEV', agg((a) => { const m = mean(a); return sum(a.map((x) => Math.abs(x - m))) / a.length; }));
def('DEVSQ', agg((a) => { const m = mean(a); return sum(a.map((x) => (x - m) ** 2)); }));
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
def('NORM.DIST NORMDIST', ([x, m, s, c]) => { const X = toNum(x), M = toNum(m), S = toNum(s); if (S <= 0) throw E(NUM); return toBool(c) ? 0.5 * (1 + erf((X - M) / (S * Math.SQRT2))) : Math.exp(-((X - M) ** 2) / (2 * S * S)) / (S * Math.sqrt(2 * Math.PI)); }, [4, 4]);
def('NORM.S.DIST', ([x, c]) => FN['NORM.DIST'].f([x, 0, 1, c ?? true]), [1, 2]);
def('STANDARDIZE', ([x, m, s]) => { const S = toNum(s); if (S <= 0) throw E(NUM); return (toNum(x) - toNum(m)) / S; }, [3, 3]);

// conditions over ranges
function ifs(pairsArgs, target) {
  const conds = [];
  for (let i = 0; i < pairsArgs.length; i += 2) conds.push([table(pairsArgs[i]), criterion(pairsArgs[i + 1])]);
  const R = conds[0][0].length, C = conds[0][0][0]?.length || 0, T = target ? table(target) : null, out = [];
  for (const [t] of conds) if (t.length !== R || (t[0]?.length || 0) !== C) throw E(VALUE);
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (conds.every(([t, f]) => f(t[i][j]))) out.push(T ? T[i]?.[j] ?? null : null);
  return out;
}
const onlyNums = (a) => a.filter((v) => typeof v === 'number');
def('COUNTIF', ([r, c]) => ifs([r, c]).length, [2, 2]);
def('COUNTIFS', (args) => ifs(args).length, [2, 254]);
def('SUMIF', ([r, c, s]) => sum(onlyNums(ifs([r, c], s ?? r))), [2, 3]);
def('SUMIFS', ([s, ...rest]) => sum(onlyNums(ifs(rest, s))), [3, 255]);
def('AVERAGEIF', ([r, c, s]) => mean(onlyNums(ifs([r, c], s ?? r))), [2, 3]);
def('AVERAGEIFS', ([s, ...rest]) => mean(onlyNums(ifs(rest, s))), [3, 255]);
def('MAXIFS', ([s, ...rest]) => { const a = onlyNums(ifs(rest, s)); return a.length ? Math.max(...a) : 0; }, [3, 255]);
def('MINIFS', ([s, ...rest]) => { const a = onlyNums(ifs(rest, s)); return a.length ? Math.min(...a) : 0; }, [3, 255]);

// logic
def('IF', ([c, a, b]) => (toBool(c()) ? (a ? a() : true) : b ? b() ?? false : false), [1, 3], { lazy: true });
def('IFS', (args) => { for (let i = 0; i < args.length; i += 2) if (toBool(args[i]())) return args[i + 1](); throw E(NA); }, [2, 254], { lazy: true });
def('IFERROR', ([a, b]) => { const v = safe(() => scalarOrTable(a())); return isErr(v) ? b() : v; }, [2, 2], { lazy: true });
def('IFNA', ([a, b]) => { const v = safe(() => scalarOrTable(a())); return isErr(v) && v.code === NA ? b() : v; }, [2, 2], { lazy: true });
def('SWITCH', ([x, ...rest]) => { const v = scalar(x()); if (isErr(v)) return v; for (let i = 0; i + 1 < rest.length; i += 2) if (compare(v, scalar(rest[i]())) === 0) return rest[i + 1](); if (rest.length % 2) return rest.at(-1)(); throw E(NA); }, [3, 254], { lazy: true });
def('CHOOSE', ([i, ...rest]) => { const k = int(i()); if (k < 1 || k > rest.length) throw E(VALUE); return rest[k - 1](); }, [2, 255], { lazy: true });
const bools = (args) => { const out = []; for (const a of args) { if (isRef(a) || isArr(a)) { for (const v of flat(a)) { if (isErr(v)) throw v; if (typeof v === 'boolean') out.push(v); else if (typeof v === 'number') out.push(v !== 0); } } else if (a !== null) out.push(toBool(a)); } if (!out.length) throw E(VALUE); return out; };
def('AND', (a) => bools(a).every(Boolean), [1, 255]);
def('OR', (a) => bools(a).some(Boolean), [1, 255]);
def('XOR', (a) => bools(a).filter(Boolean).length % 2 === 1, [1, 255]);
def('NOT', ([a]) => !toBool(a), [1, 1]);
def('TRUE', () => true, [0, 0]);
def('FALSE', () => false, [0, 0]);
const scalarOrTable = (v) => (isRef(v) ? (v.rows * v.cols === 1 ? v.one() : v) : v);

// lookups
function findIn(list, v, mode) {
  // mode 0: exact (wildcards on text); 1: largest ≤ (sorted ascending); -1: smallest ≥ (sorted descending)
  if (mode === 0) {
    const re = typeof v === 'string' && /[*?~]/.test(v) ? wild(v) : null;
    return list.findIndex((x) => (re ? typeof x === 'string' && re.test(x) : x !== null && compare(x, v) === 0 && typeof x === typeof v || (x !== null && typeof x === 'string' && typeof v === 'string' && x.toLowerCase() === v.toLowerCase())));
  }
  let lo = 0, hi = list.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, x = list[mid];
    if (x === null) { hi = mid - 1; continue; }
    const c = compare(x, v) * (mode === 1 ? 1 : -1);
    if (c <= 0 && (typeof x === typeof v)) { best = mid; lo = mid + 1; } else if (c <= 0) lo = mid + 1; else hi = mid - 1;
  }
  return best;
}
def('VLOOKUP', ([v, r, c, a]) => { const t = table(r), k = int(c), x = scalar(v); if (k < 1 || k > (t[0]?.length || 0)) throw E(REF); const i = findIn(t.map((row) => row[0]), x, a === undefined || a === null || toBool(a) ? 1 : 0); if (i < 0) throw E(NA); return t[i][k - 1]; }, [3, 4]);
def('HLOOKUP', ([v, r, c, a]) => { const t = table(r), k = int(c), x = scalar(v); if (k < 1 || k > t.length) throw E(REF); const i = findIn(t[0], x, a === undefined || a === null || toBool(a) ? 1 : 0); if (i < 0) throw E(NA); return t[k - 1][i]; }, [3, 4]);
def('LOOKUP', ([v, a, b]) => { const A = flat(a), B = b ? flat(b) : A, i = findIn(A, scalar(v), 1); if (i < 0) throw E(NA); return B[i] ?? E(NA); }, [2, 3]);
def('MATCH', ([v, a, m]) => { const mode = m === undefined || m === null ? 1 : Math.sign(toNum(m)), i = findIn(flat(a), scalar(v), mode); if (i < 0) throw E(NA); return i + 1; }, [2, 3]);
function xfind(list, v, mm, sm) {
  const order = sm === -1 ? list.map((_, i) => list.length - 1 - i) : list.map((_, i) => i);
  if (sm === 2 || sm === -2) { const i = findIn(sm === 2 ? list : [...list].reverse(), v, mm === 0 || mm === 2 ? 0 : mm > 0 ? 1 : -1); return i < 0 ? -1 : sm === 2 ? i : list.length - 1 - i; }
  let best = -1;
  const re = mm === 2 && typeof v === 'string' ? wild(v) : null;
  for (const i of order) {
    const x = list[i];
    if (x === null) continue;
    if (re ? typeof x === 'string' && re.test(x) : compare(x, v) === 0 && typeof x === typeof v) return i;
    if (mm === -1 && typeof x === typeof v && compare(x, v) < 0 && (best < 0 || compare(x, list[best]) > 0)) best = i;
    if (mm === 1 && typeof x === typeof v && compare(x, v) > 0 && (best < 0 || compare(x, list[best]) < 0)) best = i;
  }
  return best;
}
def('XLOOKUP', ([v, a, b, nf, mm, sm]) => {
  const t = table(a), R = table(b), vert = t[0].length === 1, list = vert ? t.map((r) => r[0]) : t[0];
  const i = xfind(list, scalar(v), mm ? int(mm) : 0, sm ? int(sm) : 1);
  if (i < 0) { if (nf !== undefined && nf !== null) return nf; throw E(NA); }
  return vert ? (R[i].length === 1 ? R[i][0] : [R[i]]) : R.length === 1 ? R[0][i] : R.map((r) => [r[i]]);
}, [3, 6]);
def('XMATCH', ([v, a, mm, sm]) => { const i = xfind(flat(a), scalar(v), mm ? int(mm) : 0, sm ? int(sm) : 1); if (i < 0) throw E(NA); return i + 1; }, [2, 4]);
def('INDEX', ([r, i, j]) => {
  const ri = i === undefined || i === null ? 0 : int(i), ci = j === undefined || j === null ? 0 : int(j);
  if (isRef(r)) {
    let rr = ri, cc = ci;
    if (r.rows === 1 && j === undefined) { cc = ri; rr = 1; }
    if (rr < 0 || cc < 0 || rr > r.rows || cc > r.cols) throw E(REF);
    return new Ref(r.eng, r.sh, rr ? r.r1 + rr - 1 : r.r1, cc ? r.c1 + cc - 1 : r.c1, rr ? r.r1 + rr - 1 : r.r2, cc ? r.c1 + cc - 1 : r.c2);
  }
  const t = table(r);
  let rr = ri, cc = ci;
  if (t.length === 1 && j === undefined) { cc = ri; rr = 1; }
  if (rr > t.length || cc > t[0].length || rr < 0 || cc < 0) throw E(REF);
  if (!rr) return t.map((row) => [row[cc - 1]]);
  if (!cc) return [t[rr - 1]];
  return t[rr - 1][cc - 1];
}, [2, 3], { raw: true });
def('OFFSET', ([r, dr, dc, hh, ww]) => {
  if (!isRef(r)) throw E(VALUE);
  const r1 = r.r1 + int(dr), c1 = r.c1 + int(dc), R = hh === undefined || hh === null ? r.rows : int(hh), C = ww === undefined || ww === null ? r.cols : int(ww);
  if (r1 < 1 || c1 < 1 || R < 1 || C < 1 || r1 + R - 1 > MAXR || c1 + C - 1 > MAXC) throw E(REF);
  return new Ref(r.eng, r.sh, r1, c1, r1 + R - 1, c1 + C - 1);
}, [3, 5], { v: true, raw: true });
def('INDIRECT', ([t], eng) => { const s = toStr(t).trim(), m = REF_RE.exec(s); if (!m || m[0].length !== s.length) throw E(REF); return eng.ref(refOf(m), CTX); }, [1, 2], { v: true });
def('ROW', ([r]) => (r === undefined || r === null ? CTX.r : isRef(r) ? (r.rows === 1 ? r.r1 : Array.from({ length: r.rows }, (_, i) => [r.r1 + i])) : E(VALUE)), [0, 1], { raw: true });
def('COLUMN', ([r]) => (r === undefined || r === null ? CTX.c : isRef(r) ? (r.cols === 1 ? r.c1 : [Array.from({ length: r.cols }, (_, i) => r.c1 + i)]) : E(VALUE)), [0, 1], { raw: true });
def('ROWS', ([r]) => (isRef(r) ? r.rows : table(r).length), [1, 1], { raw: true });
def('COLUMNS', ([r]) => (isRef(r) ? r.cols : table(r)[0].length), [1, 1], { raw: true });
def('ADDRESS', ([r, c, a, s, sh]) => { const R = int(r), C = int(c), k = a ? int(a) : 1; const ref = (k === 1 || k === 3 ? '$' : '') + colName(C) + (k === 1 || k === 2 ? '$' : '') + R; return (sh ? toStr(sh) + '!' : '') + ref; }, [2, 5]);
def('TRANSPOSE', ([a]) => { const t = table(a); return t[0].map((_, j) => t.map((row) => row[j])); }, [1, 1]);
def('FILTER', ([a, inc, e]) => {
  const t = table(a), m = table(inc), byRow = m.length === t.length;
  const keep = byRow ? m.map((r) => toBool(r[0])) : m[0].map((x) => toBool(x));
  const out = byRow ? t.filter((_, i) => keep[i]) : t.map((r) => r.filter((_, j) => keep[j]));
  if (!out.length || !out[0].length) { if (e !== undefined && e !== null) return e; throw E(CALC, 'empty'); }
  return out;
}, [2, 3]);
def('SORT', ([a, idx, ord, byCol]) => {
  const t = table(a).map((r) => [...r]), k = int(idx ?? 1) - 1, o = ord === undefined || ord === null ? 1 : Math.sign(toNum(ord)) || 1;
  if (byCol && toBool(byCol)) { const tr = t[0].map((_, j) => t.map((r) => r[j])); tr.sort((x, y) => compare(x[k], y[k]) * o); return tr[0].map((_, j) => tr.map((r) => r[j])); }
  return t.sort((x, y) => compare(x[k], y[k]) * o);
}, [1, 4]);
def('SORTBY', ([a, ...rest]) => { const t = table(a), keys = []; for (let i = 0; i < rest.length; i += 2) keys.push([flat(rest[i]), rest[i + 1] === undefined ? 1 : Math.sign(toNum(rest[i + 1])) || 1]); return t.map((r, i) => [r, i]).sort((x, y) => { for (const [k, o] of keys) { const c = compare(k[x[1]], k[y[1]]); if (c) return c * o; } return 0; }).map((x) => x[0]); }, [2, 255]);
def('UNIQUE', ([a, byCol, once]) => {
  const t = table(a), seen = new Map(), key = (r) => JSON.stringify(r.map((x) => (typeof x === 'string' ? x.toLowerCase() : x)));
  for (const r of t) { const k = key(r); seen.set(k, [r, (seen.get(k)?.[1] || 0) + 1]); }
  const out = [...seen.values()].filter(([, n]) => !(once && toBool(once)) || n === 1).map(([r]) => r);
  if (!out.length) throw E(CALC, 'empty');
  return out;
}, [1, 3]);
def('HSTACK', (args) => { const ts = args.map(table), R = Math.max(...ts.map((t) => t.length)); return Array.from({ length: R }, (_, i) => ts.flatMap((t) => t[i] || Array(t[0].length).fill(E(NA)))); }, [1, 255]);
def('VSTACK', (args) => { const ts = args.map(table), C = Math.max(...ts.map((t) => t[0].length)); return ts.flatMap((t) => t.map((r) => [...r, ...Array(C - r.length).fill(E(NA))])); }, [1, 255]);

// text
def('CONCATENATE CONCAT', (args) => args.map((a) => (isRef(a) || isArr(a) ? flat(a).map(toStr).join('') : toStr(a))).join(''), [1, 255]);
def('TEXTJOIN', ([d, ign, ...rest]) => { const sep = toStr(d), skip = toBool(ign), parts = []; for (const a of rest) for (const v of isRef(a) || isArr(a) ? flat(a) : [a]) { if (isErr(v)) throw v; const s = toStr(v); if (!(skip && s === '')) parts.push(s); } return parts.join(sep); }, [3, 255]);
def('LEFT', ([s, n]) => { const k = n === undefined || n === null ? 1 : int(n); if (k < 0) throw E(VALUE); return [...toStr(s)].slice(0, k).join(''); }, [1, 2]);
def('RIGHT', ([s, n]) => { const k = n === undefined || n === null ? 1 : int(n); if (k < 0) throw E(VALUE); const a = [...toStr(s)]; return k ? a.slice(-k).join('') : ''; }, [1, 2]);
def('MID', ([s, a, n]) => { const i = int(a), k = int(n); if (i < 1 || k < 0) throw E(VALUE); return [...toStr(s)].slice(i - 1, i - 1 + k).join(''); }, [3, 3]);
def('LEN', ([s]) => [...toStr(s)].length, [1, 1]);
def('LOWER', ([s]) => toStr(s).toLowerCase(), [1, 1]);
def('UPPER', ([s]) => toStr(s).toUpperCase(), [1, 1]);
def('PROPER', ([s]) => toStr(s).toLowerCase().replace(/(^|[^\p{L}'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()), [1, 1]);
def('TRIM', ([s]) => toStr(s).replace(/ +/g, ' ').trim(), [1, 1]);
def('CLEAN', ([s]) => toStr(s).replace(/[\x00-\x1F]/g, ''), [1, 1]);
def('SUBSTITUTE', ([s, a, b, n]) => { const t = toStr(s), x = toStr(a), y = toStr(b); if (!x) return t; if (n === undefined || n === null) return t.split(x).join(y); let k = int(n), i = -1; while (k-- > 0) { i = t.indexOf(x, i + 1); if (i < 0) return t; } return t.slice(0, i) + y + t.slice(i + x.length); }, [3, 4]);
def('REPLACE', ([s, a, n, r]) => { const t = toStr(s), i = int(a) - 1; if (i < 0) throw E(VALUE); return t.slice(0, i) + toStr(r) + t.slice(i + int(n)); }, [4, 4]);
def('FIND', ([a, s, st]) => { const i = toStr(s).indexOf(toStr(a), (st ? int(st) : 1) - 1); if (i < 0) throw E(VALUE); return i + 1; }, [2, 3]);
def('SEARCH', ([a, s, st]) => { const t = toStr(s), from = (st ? int(st) : 1) - 1, re = new RegExp(wild(toStr(a)).source.slice(1, -1), 'i'), m = re.exec(t.slice(from)); if (!m) throw E(VALUE); return from + m.index + 1; }, [2, 3]);
def('REPT', ([s, n]) => { const k = int(n); if (k < 0 || k * toStr(s).length > 32767) throw E(VALUE); return toStr(s).repeat(k); }, [2, 2]);
def('TEXT', ([v, f]) => { let x = scalar(v); if (typeof x === 'string') { const p = parseInput(x, loc('en')); if (typeof p.v === 'number') x = p.v; } return formatValue(x, toStr(f), L()).text; }, [2, 2]);
def('VALUE NUMBERVALUE', ([s]) => { const v = scalar(s); if (typeof v === 'number') return v; return toNum(toStr(v)); }, [1, 3]);
def('EXACT', ([a, b]) => toStr(a) === toStr(b), [2, 2]);
def('CHAR', ([n]) => { const k = int(n); if (k < 1 || k > 255) throw E(VALUE); return String.fromCharCode(k); }, [1, 1]);
def('UNICHAR', ([n]) => { const k = int(n); if (k < 1 || k > 0x10ffff) throw E(VALUE); return String.fromCodePoint(k); }, [1, 1]);
def('CODE UNICODE', ([s]) => { const t = toStr(s); if (!t) throw E(VALUE); return t.codePointAt(0); }, [1, 1]);
def('T', ([v]) => { const x = scalar(v); return typeof x === 'string' ? x : ''; }, [1, 1]);
def('N', ([v]) => { const x = scalar(v); return typeof x === 'number' ? x : typeof x === 'boolean' ? +x : 0; }, [1, 1]);
def('FIXED', ([v, d, nc]) => { const k = d === undefined || d === null ? 2 : int(d); return formatValue(round(toNum(v), k), (nc && toBool(nc) ? '0' : '#,##0') + (k > 0 ? '.' + '0'.repeat(k) : ''), L()).text; }, [1, 3]);
def('DOLLAR', ([v, d]) => { const k = d === undefined || d === null ? 2 : int(d); return formatValue(round(toNum(v), k), (L().dec === ',' ? '#,##0' + (k > 0 ? '.' + '0'.repeat(k) : '') + ' "€"' : '"$"#,##0' + (k > 0 ? '.' + '0'.repeat(k) : '')), L()).text; }, [1, 2]);
def('TEXTBEFORE', ([s, d, n]) => { const t = toStr(s), x = toStr(d), k = n ? int(n) : 1; let i = -1; for (let j = 0; j < k; j++) { i = t.indexOf(x, i + 1); if (i < 0) throw E(NA); } return t.slice(0, i); }, [2, 6]);
def('TEXTAFTER', ([s, d, n]) => { const t = toStr(s), x = toStr(d), k = n ? int(n) : 1; let i = -1; for (let j = 0; j < k; j++) { i = t.indexOf(x, i + 1); if (i < 0) throw E(NA); } return t.slice(i + x.length); }, [2, 6]);
def('TEXTSPLIT', ([s, cd, rd]) => { const t = toStr(s), c = cd === null || cd === undefined ? null : toStr(cd), r = rd === undefined || rd === null ? null : toStr(rd); const rows = (r ? t.split(r) : [t]).map((x) => (c ? x.split(c) : [x])), C = Math.max(...rows.map((x) => x.length)); return rows.map((x) => [...x, ...Array(C - x.length).fill(E(NA))]); }, [2, 6]);
def('HYPERLINK', ([u, l]) => (l === undefined || l === null ? toStr(u) : scalar(l)), [1, 2]);

// dates
const ymd = (v) => { const n = toNum(v); if (n < 0) throw E(NUM); return fromSerial(Math.floor(n)); };
def('TODAY', () => todaySerial(), [0, 0], { v: true });
def('NOW', () => nowSerial(), [0, 0], { v: true });
def('DATE', ([y, m, d]) => { let Y = int(y); if (Y < 1900) Y += 1900; const v = (Date.UTC(Y, int(m) - 1, int(d)) - Date.UTC(1899, 11, 30)) / 86400000; if (v < 0) throw E(NUM); return v; }, [3, 3]);
def('TIME', ([h, m, s]) => { const v = (int(h) * 3600 + int(m) * 60 + int(s)) / 86400; if (v < 0) throw E(NUM); return v % 1; }, [3, 3]);
def('YEAR', ([v]) => ymd(v).y, [1, 1]);
def('MONTH', ([v]) => ymd(v).m, [1, 1]);
def('DAY', ([v]) => ymd(v).d, [1, 1]);
def('HOUR', ([v]) => fromSerial(toNum(v) % 1).hh, [1, 1]);
def('MINUTE', ([v]) => fromSerial(toNum(v) % 1).mi, [1, 1]);
def('SECOND', ([v]) => fromSerial(toNum(v) % 1).ss, [1, 1]);
def('WEEKDAY', ([v, t]) => { const w = ymd(v).wd, k = t ? int(t) : 1; if (k === 1 || k === 17) return w + 1; if (k === 2 || k === 11) return ((w + 6) % 7) + 1; if (k === 3) return (w + 6) % 7; if (k >= 12 && k <= 16) return ((w - (k - 10) + 7) % 7) + 1; throw E(NUM); }, [1, 2]);
const isoWeek = (n) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000), day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); return 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7); };
def('ISOWEEKNUM', ([v]) => isoWeek(toNum(v)), [1, 1]);
def('WEEKNUM', ([v, t]) => { const n = Math.floor(toNum(v)), k = t ? int(t) : 1; if (k === 21) return isoWeek(n); const d = fromSerial(n), jan1 = toSerial(d.y, 1, 1), start = k === 2 || k === 11 ? 1 : 0, wd = (fromSerial(jan1).wd - start + 7) % 7; return Math.floor((n - jan1 + wd) / 7) + 1; }, [1, 2]);
const addMonths = (v, m) => { const d = ymd(v), t = new Date(Date.UTC(d.y, d.m - 1 + m, 1)), last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); return toSerial(t.getUTCFullYear(), t.getUTCMonth() + 1, Math.min(d.d, last)); };
def('EDATE', ([v, m]) => addMonths(v, int(m)), [2, 2]);
def('EOMONTH', ([v, m]) => { const d = ymd(v), t = new Date(Date.UTC(d.y, d.m + int(m), 0)); return toSerial(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }, [2, 2]);
def('DAYS', ([a, b]) => Math.floor(toNum(a)) - Math.floor(toNum(b)), [2, 2]);
def('DAYS360', ([a, b]) => { const x = ymd(a), y = ymd(b); return (y.y - x.y) * 360 + (y.m - x.m) * 30 + (Math.min(30, y.d) - Math.min(30, x.d)); }, [2, 3]);
def('DATEDIF', ([a, b, u]) => {
  const s = Math.floor(toNum(a)), e = Math.floor(toNum(b)), unit = toStr(u).toUpperCase();
  if (e < s) throw E(NUM);
  const x = fromSerial(s), y = fromSerial(e);
  let months = (y.y - x.y) * 12 + y.m - x.m - (y.d < x.d ? 1 : 0);
  switch (unit) {
    case 'D': return e - s;
    case 'M': return months;
    case 'Y': return Math.floor(months / 12);
    case 'YM': return months % 12;
    case 'MD': { const prev = y.d >= x.d ? y.d - x.d : e - toSerial(y.m === 1 ? y.y - 1 : y.y, y.m === 1 ? 12 : y.m - 1, x.d); return prev; }
    case 'YD': { let z = toSerial(y.y, x.m, x.d); if (z > e) z = toSerial(y.y - 1, x.m, x.d); return e - z; }
  }
  throw E(NUM);
}, [3, 3]);
const holidays = (h) => new Set(h ? flat(h).filter((x) => typeof x === 'number').map(Math.floor) : []);
const workday = (n, hol) => { const wd = fromSerial(n).wd; return wd !== 0 && wd !== 6 && !hol.has(n); };
def('NETWORKDAYS', ([a, b, h]) => { let s = Math.floor(toNum(a)), e = Math.floor(toNum(b)), sign = 1; if (e < s) { [s, e] = [e, s]; sign = -1; } const hol = holidays(h); let n = 0; for (let d = s; d <= e; d++) if (workday(d, hol)) n++; return sign * n; }, [2, 3]);
def('WORKDAY', ([a, k, h]) => { let d = Math.floor(toNum(a)), n = int(k); const hol = holidays(h), st = Math.sign(n); while (n) { d += st; if (workday(d, hol)) n -= st; } return d; }, [2, 3]);
def('DATEVALUE', ([s]) => { const p = parseInput(toStr(s), loc('en')); if (typeof p.v !== 'number') throw E(VALUE); return Math.floor(p.v); }, [1, 1]);
def('TIMEVALUE', ([s]) => { const p = parseInput(toStr(s), loc('en')); if (typeof p.v !== 'number') throw E(VALUE); return p.v % 1; }, [1, 1]);
def('YEARFRAC', ([a, b, basis]) => { let s = Math.floor(toNum(a)), e = Math.floor(toNum(b)); if (e < s) [s, e] = [e, s]; const k = basis ? int(basis) : 0; if (k === 1) return (e - s) / 365.25; if (k === 2) return (e - s) / 360; if (k === 3) return (e - s) / 365; const x = fromSerial(s), y = fromSerial(e); return ((y.y - x.y) * 360 + (y.m - x.m) * 30 + Math.min(30, y.d) - Math.min(30, x.d)) / 360; }, [2, 3]);

// information
def('ISBLANK', ([v]) => scalar(v) === null, [1, 1], { raw: true });
def('ISNUMBER', ([v]) => typeof scalar(v) === 'number', [1, 1], { raw: true });
def('ISTEXT', ([v]) => typeof scalar(v) === 'string', [1, 1], { raw: true });
def('ISNONTEXT', ([v]) => typeof scalar(v) !== 'string', [1, 1], { raw: true });
def('ISLOGICAL', ([v]) => typeof scalar(v) === 'boolean', [1, 1], { raw: true });
def('ISERROR', ([v]) => isErr(safe(() => scalar(v()))), [1, 1], { lazy: true });
def('ISERR', ([v]) => { const x = safe(() => scalar(v())); return isErr(x) && x.code !== NA; }, [1, 1], { lazy: true });
def('ISNA', ([v]) => { const x = safe(() => scalar(v())); return isErr(x) && x.code === NA; }, [1, 1], { lazy: true });
def('ISEVEN', ([v]) => Math.trunc(toNum(v)) % 2 === 0, [1, 1]);
def('ISODD', ([v]) => Math.abs(Math.trunc(toNum(v))) % 2 === 1, [1, 1]);
def('ISREF', ([v]) => isRef(v), [1, 1], { raw: true });
def('ISFORMULA', ([v]) => isRef(v) && !!v.sh.cells[colName(v.c1) + v.r1]?.f, [1, 1], { raw: true });
def('FORMULATEXT', ([v]) => { if (!isRef(v)) throw E(NA); const f = v.sh.cells[colName(v.c1) + v.r1]?.f; if (!f) throw E(NA); return f; }, [1, 1], { raw: true });
def('NA', () => E(NA), [0, 0]);
def('TYPE', ([v]) => { const x = scalar(v); return typeof x === 'number' || x === null ? 1 : typeof x === 'string' ? 2 : typeof x === 'boolean' ? 4 : isErr(x) ? 16 : isArr(v) ? 64 : 1; }, [1, 1], { raw: true });
def('ERROR.TYPE', ([v]) => { const x = scalar(v); if (!isErr(x)) throw E(NA); return ['#NULL!', DIV0, VALUE, REF, NAME, NUM, NA].indexOf(x.code) + 1 || 8; }, [1, 1], { raw: true });

// finance
const pv0 = (r, n, pmt, fv, t) => (r ? -(fv + pmt * (1 + r * t) * ((1 + r) ** n - 1) / r) / (1 + r) ** n : -(fv + pmt * n));
const pmt0 = (r, n, pv, fv, t) => { if (!n) throw E(NUM); return r ? -(r * (fv + pv * (1 + r) ** n)) / ((1 + r * t) * ((1 + r) ** n - 1)) : -(pv + fv) / n; };
const fv0 = (r, n, pmt, pv, t) => (r ? -(pv * (1 + r) ** n + pmt * (1 + r * t) * ((1 + r) ** n - 1) / r) : -(pv + pmt * n));
const o = (v, d = 0) => (v === undefined || v === null ? d : toNum(v));
def('PMT', ([r, n, pv, fv, t]) => pmt0(toNum(r), toNum(n), toNum(pv), o(fv), o(t)), [3, 5]);
def('FV', ([r, n, pmt, pv, t]) => fv0(toNum(r), toNum(n), toNum(pmt), o(pv), o(t)), [3, 5]);
def('PV', ([r, n, pmt, fv, t]) => pv0(toNum(r), toNum(n), toNum(pmt), o(fv), o(t)), [3, 5]);
def('NPER', ([r, pmt, pv, fv, t]) => { const R = toNum(r), P = toNum(pmt), V = toNum(pv), F = o(fv), T = o(t); if (!R) { if (!P) throw E(NUM); return -(V + F) / P; } const a = P * (1 + R * T) - F * R, b = V * R + P * (1 + R * T); const x = a / b; if (x <= 0) throw E(NUM); return Math.log(x) / Math.log(1 + R); }, [3, 5]);
const ipmt0 = (r, k, n, pv, fv, t) => { const p = pmt0(r, n, pv, fv, t); if (k === 1 && t === 1) return 0; const bal = fv0(r, k - 1, p, pv, t); return (t === 1 ? bal / (1 + r) : bal) * r; };
def('IPMT', ([r, k, n, pv, fv, t]) => ipmt0(toNum(r), toNum(k), toNum(n), toNum(pv), o(fv), o(t)), [4, 6]);
def('PPMT', ([r, k, n, pv, fv, t]) => { const R = toNum(r), N = toNum(n), V = toNum(pv), F = o(fv), T = o(t); return pmt0(R, N, V, F, T) - ipmt0(R, toNum(k), N, V, F, T); }, [4, 6]);
def('RATE', ([n, pmt, pv, fv, t, g]) => { const N = toNum(n), P = toNum(pmt), V = toNum(pv), F = o(fv), T = o(t); let r = o(g, 0.1); for (let i = 0; i < 100; i++) { const f = fv0(r, N, P, V, T) - F, h = 1e-6, d = (fv0(r + h, N, P, V, T) - F - f) / h; if (!d) break; const nr = r - f / d; if (Math.abs(nr - r) < 1e-10) return nr; r = nr; } throw E(NUM); }, [3, 6]);
def('NPV', ([r, ...rest]) => { const R = toNum(r); return nums(rest).reduce((s, v, i) => s + v / (1 + R) ** (i + 1), 0); }, [2, 255]);
def('IRR', ([vals, g]) => { const cf = nums([vals]); let r = o(g, 0.1); for (let i = 0; i < 200; i++) { let f = 0, d = 0; cf.forEach((v, k) => { f += v / (1 + r) ** k; d -= (k * v) / (1 + r) ** (k + 1); }); if (!d) break; const nr = r - f / d; if (Math.abs(nr - r) < 1e-10) return nr; r = nr; } throw E(NUM); }, [1, 2]);
def('SLN', ([c, s, l]) => { const L2 = toNum(l); if (!L2) throw E(DIV0); return (toNum(c) - toNum(s)) / L2; }, [3, 3]);
def('EFFECT', ([r, n]) => { const N = Math.trunc(toNum(n)); if (N < 1) throw E(NUM); return (1 + toNum(r) / N) ** N - 1; }, [2, 2]);
def('NOMINAL', ([r, n]) => { const N = Math.trunc(toNum(n)); if (N < 1) throw E(NUM); return N * ((1 + toNum(r)) ** (1 / N) - 1); }, [2, 2]);

export const FUNCTIONS = Object.keys(FN).sort();
export const isVolatileName = (n) => !!FN[n]?.v;

// ------------------------------------------------------------------ the engine

const same = (a, b) => a === b || (isErr(a) && isErr(b) && a.code === b.code) || (isArr(a) && isArr(b) && JSON.stringify(a) === JSON.stringify(b));

export class Engine {
  /** book: the workbook ({sheets}), read live; lang: the language of the workbook (decimals, true/false). */
  constructor(book, lang = 'en') {
    this.book = book;
    this.L = loc(lang);
    this.trees = new Map();
    this.reset();
  }
  setLang(lang) { this.L = loc(lang); this.invalidateAll(); }
  reset() {
    this.vals = new Map();       // "sid!A1" → value of a formula (a table for the first cell of a spilled one)
    this.deps = new Map();       // "sid!A1" → {cells: Set, ranges: [entries]}
    this.rcell = new Map();      // "sid!A1" → Set of formulas that read it
    this.rrange = new Map();     // sid → Set of {r1, c1, r2, c2, who}
    this.dirty = new Set();
    this.vol = new Set();
    this.spills = new Map();     // sid → Map "A1" → value written by a spilled formula
    this.spillOf = new Map();    // "sid!A1" of the formula → {sid, r1, c1, r2, c2}
    this.stack = [];
    this.onStack = new Set();
    for (const s of this.book.sheets) for (const [k, c] of Object.entries(s.cells)) if (c.f) this.dirty.add(s.id + '!' + k);
  }
  invalidateAll() { this.reset(); }
  sheet(name) {
    if (!name) return null;
    const n = name.toLowerCase();
    return this.book.sheets.find((s) => s.name.toLowerCase() === n) || null;
  }
  tree(f) {
    let t = this.trees.get(f);
    if (!t) {
      try { t = parse(f.slice(1)); } catch (e) { t = { t: 'v', v: isErr(e) ? e : E(NAME) }; }
      if (this.trees.size > 20000) this.trees.clear();
      this.trees.set(f, t);
    }
    return t;
  }
  /** A reference of a formula, as a Ref. */
  ref(r, ctx) {
    const sh = r.sheet ? this.sheet(r.sheet) : ctx.sh;
    // a sheet this person cannot see: the formula keeps its last result (see compute)
    if (!sh && ctx) ctx.miss = true;
    if (!sh || r.r1 > MAXR || r.r2 > MAXR || r.c1 > MAXC || r.c2 > MAXC) return E(REF);
    let r1 = Math.min(r.r1, r.r2), r2 = Math.max(r.r1, r.r2), c1 = Math.min(r.c1, r.c2), c2 = Math.max(r.c1, r.c2);
    // whole rows or columns: only as far as the sheet holds something
    if (r.kind === 'cols' || r.kind === 'rows') { const x = this.extent(sh); if (r.kind === 'cols') r2 = Math.max(1, x.r); else c2 = Math.max(1, x.c); }
    return new Ref(this, sh, r1, c1, r2, c2);
  }
  extent(sh) {
    let r = 0, c = 0;
    for (const k in sh.cells) { const m = /^([A-Z]+)(\d+)$/.exec(k); const cc = colNum(m[1]), rr = +m[2]; if (rr > r) r = rr; if (cc > c) c = cc; }
    const sp = this.spills.get(sh.id);
    if (sp) for (const k of sp.keys()) { const m = /^([A-Z]+)(\d+)$/.exec(k); r = Math.max(r, +m[2]); c = Math.max(c, colNum(m[1])); }
    return { r, c };
  }
  /** What a formula reads in one cell (it is remembered as something the formula depends on). */
  read(sh, r, c) {
    const k = colName(c) + r, id = sh.id + '!' + k, who = this.stack.at(-1);
    if (who) { this.deps.get(who).cells.add(id); let s = this.rcell.get(id); if (!s) this.rcell.set(id, (s = new Set())); s.add(who); }
    return this.raw(sh, k, id);
  }
  raw(sh, k, id) {
    const cell = sh.cells[k];
    if (cell?.f) { const v = this.formula(sh, k, id); return isArr(v) ? v[0][0] : v; }
    if (cell && cell.v !== undefined) return cell.v;
    const sp = this.spills.get(sh.id)?.get(k);
    return sp === undefined ? null : sp;
  }
  /** A rectangle of values (remembered once as a dependency). */
  readRange(ref) {
    const who = this.stack.at(-1);
    if (who) {
      const ent = { r1: ref.r1, c1: ref.c1, r2: ref.r2, c2: ref.c2, who };
      this.deps.get(who).ranges.push([ref.sh.id, ent]);
      let set = this.rrange.get(ref.sh.id);
      if (!set) this.rrange.set(ref.sh.id, (set = new Set()));
      set.add(ent);
    }
    const out = [], sh = ref.sh, sp = this.spills.get(sh.id);
    if ((ref.r2 - ref.r1 + 1) * (ref.c2 - ref.c1 + 1) > 2e6) throw E(NUM, 'big');
    for (let r = ref.r1; r <= ref.r2; r++) {
      const row = [];
      for (let c = ref.c1; c <= ref.c2; c++) {
        const k = colName(c) + r, cell = sh.cells[k];
        if (cell?.f) { const v = this.formula(sh, k, sh.id + '!' + k); row.push(isArr(v) ? v[0][0] : v); }
        else if (cell && cell.v !== undefined) row.push(cell.v);
        else { const x = sp?.get(k); row.push(x === undefined ? null : x); }
      }
      out.push(row);
    }
    return out;
  }
  /** The value of a formula cell, computed when it is dirty. */
  formula(sh, k, id) {
    if (!this.dirty.has(id) && this.vals.has(id)) return this.vals.get(id);
    if (this.onStack.has(id)) return E(REF, 'circular');
    return this.compute(sh, k, id);
  }
  compute(sh, k, id) {
    const cell = sh.cells[k];
    this.unlink(id);
    this.deps.set(id, { cells: new Set(), ranges: [] });
    this.stack.push(id);
    this.onStack.add(id);
    const m = /^([A-Z]+)(\d+)$/.exec(k), prev = CTX;
    CTX = { sh, r: +m[2], c: colNum(m[1]), L: this.L, vol: false };
    let v;
    try {
      v = evaluate(this.tree(cell.f), this);
      if (isRef(v)) v = v.rows * v.cols === 1 ? v.one() : v.grid();
      if (isArr(v)) { if (!v.length || !v[0].length) v = E(CALC); else if (v.length === 1 && v[0].length === 1) v = v[0][0]; }
      if (v === undefined) v = null;
      if (typeof v === 'number' && !Number.isFinite(v)) v = E(NUM);
    } catch (e) {
      v = isErr(e) ? e : E(VALUE);
      if (!isErr(e)) console.error(e);
    } finally {
      if (CTX.miss && isErr(v) && cell.v !== undefined) v = cell.v;
      if (CTX.vol) this.vol.add(id); else this.vol.delete(id);
      CTX = prev;
      this.stack.pop();
      this.onStack.delete(id);
    }
    if (v === null) v = 0; // an empty result shows 0, as in every spreadsheet
    this.dirty.delete(id);
    v = this.spill(sh, id, +m[2], colNum(m[1]), v);
    if (this.changed && !same(this.vals.get(id), v)) this.changed.add(id);
    this.vals.set(id, v);
    return v;
  }
  /** A table spills over the cells below and to the right, unless something is already there. */
  spill(sh, id, r, c, v) {
    const old = this.spillOf.get(id);
    if (old) {
      const sp = this.spills.get(old.sid);
      for (let i = old.r1; i <= old.r2; i++) for (let j = old.c1; j <= old.c2; j++) if (i !== r || j !== c) sp?.delete(colName(j) + i);
      this.spillOf.delete(id);
      this.changedSpill = (this.changedSpill || []).concat([old]);
    }
    if (!isArr(v)) return v;
    const R = v.length, C = v[0].length;
    if (r + R - 1 > MAXR || c + C - 1 > MAXC) return E(SPILL);
    let sp = this.spills.get(sh.id);
    if (!sp) this.spills.set(sh.id, (sp = new Map()));
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      if (!i && !j) continue;
      const k = colName(c + j) + (r + i), cell = sh.cells[k];
      if ((cell && (cell.v !== undefined || cell.f)) || sp.has(k)) return E(SPILL, 'blocked');
    }
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) if (i || j) { const x = v[i][j]; sp.set(colName(c + j) + (r + i), x === null || x === undefined ? null : x); }
    const area = { sid: sh.id, r1: r, c1: c, r2: r + R - 1, c2: c + C - 1 };
    this.spillOf.set(id, area);
    this.changedSpill = (this.changedSpill || []).concat([area]);
    return v;
  }
  unlink(id) {
    const d = this.deps.get(id);
    if (!d) return;
    for (const c of d.cells) this.rcell.get(c)?.delete(id);
    for (const [sid, ent] of d.ranges) this.rrange.get(sid)?.delete(ent);
    this.deps.delete(id);
  }
  /** Cells that changed: the formulas that depend on them become dirty (and those that depend on those…). */
  touch(sid, keys) {
    const queue = [];
    for (const k of keys) {
      const id = sid + '!' + k, sh = this.book.sheets.find((s) => s.id === sid), cell = sh?.cells[k];
      queue.push(id);
      if (cell?.f) this.dirty.add(id); else { this.vals.delete(id); this.unlink(id); const sp = this.spillOf.get(id); if (sp) { this.spill(sh, id, 0, 0, null); queue.push(...this.areaIds(sp)); } }
    }
    this.spread(queue);
  }
  areaIds(a) { const out = []; for (let i = a.r1; i <= a.r2; i++) for (let j = a.c1; j <= a.c2; j++) out.push(a.sid + '!' + colName(j) + i); return out; }
  spread(queue) {
    const seen = new Set();
    while (queue.length) {
      const id = queue.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const [sid, k] = id.split('!'), m = /^([A-Z]+)(\d+)$/.exec(k);
      const who = new Set(this.rcell.get(id) || []);
      const set = this.rrange.get(sid);
      if (set) { const r = +m[2], c = colNum(m[1]); for (const e of set) if (r >= e.r1 && r <= e.r2 && c >= e.c1 && c <= e.c2) who.add(e.who); }
      for (const w of who) {
        if (!this.dirty.has(w)) { this.dirty.add(w); queue.push(w); }
        const sp = this.spillOf.get(w);
        if (sp) queue.push(...this.areaIds(sp));
      }
    }
  }
  /**
   * Computes every dirty formula. Returns the ids ("sid!A1") whose value changed, spilled cells included.
   */
  recalc() {
    const changed = (this.changed = new Set());
    for (const v of this.vol) this.dirty.add(v);
    for (let pass = 0; pass < 4 && this.dirty.size; pass++) {
      this.changedSpill = [];
      const list = [...this.dirty];
      for (const id of list) {
        if (!this.dirty.has(id)) continue;
        const [sid, k] = id.split('!'), sh = this.book.sheets.find((s) => s.id === sid);
        if (!sh?.cells[k]?.f) { this.dirty.delete(id); this.vals.delete(id); continue; }
        this.compute(sh, k, id);
      }
      // what spilled (or stopped spilling) changes the cells it covers: their readers are computed again
      if (this.changedSpill.length) {
        const ids = this.changedSpill.flatMap((a) => this.areaIds(a));
        ids.forEach((x) => changed.add(x));
        this.spread(ids);
      }
    }
    this.dirty.clear();
    this.changed = null;
    return changed;
  }
  /** The value shown in a cell: a formula's result, a spilled one, or what was typed. */
  value(sh, k) {
    const cell = sh.cells[k];
    if (cell?.f) { const v = this.vals.get(sh.id + '!' + k); return v === undefined ? (cell.v ?? null) : isArr(v) ? v[0][0] : v; }
    if (cell && cell.v !== undefined) return cell.v;
    const sp = this.spills.get(sh.id)?.get(k);
    return sp === undefined ? null : sp;
  }
  spilledAt(sh, k) { return this.spills.get(sh.id)?.has(k) || false; }
  /** A formula computed once, outside the cells (conditional formats, validation): "=A1>3" seen from cell (r, c). */
  once(sh, r, c, f) {
    const prev = CTX;
    CTX = { sh, r, c, L: this.L, vol: false };
    try { let v = evaluate(this.tree(f), this); if (isRef(v)) v = scalar(v); if (isArr(v)) v = v[0][0]; return v; } catch (e) { return isErr(e) ? e : E(VALUE); } finally { CTX = prev; }
  }
}

/** A value as text for messages and exports, in the language of the workbook. */
export const show = (v, lang) => (isErr(v) ? v.code : formatValue(v, '', loc(lang)).text);
