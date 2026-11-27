/**
 * Money: amounts are integers of minor units (cents) of their currency, as the server keeps them. Here they are written
 * and read in the language of the app, and an expense being written is split the same way the server will split it
 * (lib/splits.php: largest remainder, then the order of the people), so the numbers on screen are the ones saved.
 */
import { getLang, t } from './i18n.js';

/** Minor units of each currency (ISO 4217); the server sends the same list (splits.init). */
export let CURRENCIES = {
  EUR: 2, USD: 2, GBP: 2, CHF: 2, JPY: 0, SEK: 2, NOK: 2, DKK: 2, ISK: 0, PLN: 2, CZK: 2, HUF: 2, RON: 2, BGN: 2, TRY: 2, AUD: 2, CAD: 2, NZD: 2, CNY: 2, HKD: 2, SGD: 2,
  KRW: 0, INR: 2, IDR: 2, MYR: 2, PHP: 2, THB: 2, ILS: 2, ZAR: 2, BRL: 2, MXN: 2, AED: 2, ALL: 2, ARS: 2, CLP: 0, COP: 2, EGP: 2, GEL: 2, KES: 2, MAD: 2, RSD: 2, SAR: 2,
  TND: 3, TWD: 2, UAH: 2, VND: 0,
};
export const setCurrencies = (c) => { if (c && typeof c === 'object' && !Array.isArray(c)) CURRENCIES = c; };
export const dec = (cur) => CURRENCIES[cur] ?? 2;
const locale = () => (getLang() === 'it' ? 'it-IT' : 'en-GB');

/** The name of a currency in the language of the app ("euro", "US dollar"). */
export function curName(cur) {
  try { return new Intl.DisplayNames([locale()], { type: 'currency' }).of(cur) || cur; } catch { return cur; }
}
export const curOptions = () => Object.keys(CURRENCIES).map((c) => [c, `${c} · ${curName(c)}`]);

const fmts = new Map();
/** 1234 EUR -> "12,34 €". o.sign: "+" before positive amounts; o.plain: no symbol. */
export function money(minor, cur, o = {}) {
  const d = dec(cur), k = cur + d + locale() + (o.plain ? 'p' : '');
  if (!fmts.has(k)) fmts.set(k, o.plain ? new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : new Intl.NumberFormat(locale(), { style: 'currency', currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }));
  const s = fmts.get(k).format((minor || 0) / 10 ** d);
  return o.sign && minor > 0 ? '+' + s : s;
}
/** Minor units as a number of major units (for the charts). */
export const major = (minor, cur) => (minor || 0) / 10 ** dec(cur);
/** For an input box: 1234 -> "12,34" (no thousands separators, the decimal mark of the language). */
export const toInput = (minor, cur) => { if (minor === null || minor === undefined || minor === '') return ''; const d = dec(cur); const s = (minor / 10 ** d).toFixed(d); return getLang() === 'it' ? s.replace('.', ',') : s; };

/** A number as people write it: "12,50", "12.50", "1.234,56", "1,234.56", "1 234". null when it is not one. */
function readNumber(s) {
  s = s.replace(/[\s  ']/g, '');
  if (!/^\d*[.,]?\d*([.,]\d+)*$/.test(s) || !/\d/.test(s)) return null;
  const marks = s.match(/[.,]/g) || [];
  if (!marks.length) return +s;
  const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  const thousands = getLang() === 'it' ? '.' : ',';
  // the same mark more than once ("1.234.567"), or the thousands mark of the language before three digits ("1.234"
  // in Italian, "1,234" in English): thousands. Otherwise the last mark is the decimal one ("12,50", "1.234,56")
  if (new Set(marks).size === 1 && (marks.length > 1 || (marks[0] === thousands && /^\d{1,3}[.,]\d{3}$/.test(s)))) return +s.replace(/[.,]/g, '');
  return +(s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1));
}

/**
 * What is written in an amount box, in minor units: a number, or a small sum to do ("12,50 + 8 + 3*2"), so a bill of
 * several items is written as it is read. null when it is not an amount.
 */
export function parseAmount(text, cur) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const toks = s.replace(/[×x]/gi, '*').replace(/÷/g, '/').match(/[\d.,\s  ']+|[-+*/()]/g);
  if (!toks || toks.join('').replace(/\s/g, '') !== s.replace(/[×x]/gi, '*').replace(/÷/g, '/').replace(/\s/g, '')) return null;
  let i = 0;
  const peek = () => toks[i]?.trim(), next = () => toks[i++]?.trim();
  const atom = () => {
    const x = next();
    if (x === '(') { const v = sum(); if (next() !== ')') throw 0; return v; }
    if (x === '-') return -atom();
    const n = readNumber(x || '');
    if (n === null || Number.isNaN(n)) throw 0;
    return n;
  };
  const prod = () => { let v = atom(); while (peek() === '*' || peek() === '/') { const o = next(), w = atom(); v = o === '*' ? v * w : (w ? v / w : NaN); } return v; };
  const sum = () => { let v = prod(); while (peek() === '+' || peek() === '-') { const o = next(), w = prod(); v = o === '+' ? v + w : v - w; } return v; };
  try {
    const v = sum();
    if (i !== toks.length || !Number.isFinite(v)) return null;
    return Math.round(v * 10 ** dec(cur));
  } catch { return null; }
}
/** Whether what is written is a sum to do (then the box shows its result). */
export const isSum = (text) => /\d\s*[-+*/×x÷]\s*[\d(]/i.test(String(text || ''));

/** An amount of $from in minor units of $to at $rate (1 $from = rate $to): the same rounding as the server. */
export const convert = (amount, from, to, rate) => (from === to ? amount : Math.round(amount / 10 ** dec(from) * rate * 10 ** dec(to)));

/** $total split by weights {key: number}: the parts add up to $total (largest remainder, then the order of the keys). */
export function apportion(total, weights) {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0);
  if (!keys.length) return {};
  const sum = keys.reduce((a, k) => a + +weights[k], 0), sign = total < 0 ? -1 : 1, abs = Math.abs(total), out = {}, rem = [];
  let given = 0;
  keys.forEach((k, i) => { const exact = abs * weights[k] / sum; out[k] = Math.floor(exact + 1e-9); rem.push([exact - out[k], i, k]); given += out[k]; });
  rem.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let i = 0, left = abs - given; left > 0; i++, left--) out[rem[i % rem.length][2]]++;
  for (const k of keys) out[k] *= sign;
  return out;
}

/**
 * The parts of an expense being written, in minor units of the expense: {parts: {mid: amount}, error, left}. members: the
 * people of the group in their order; split: {mode, parts, table}. left: what is still to give out (exact, percent).
 */
export function previewSplit(amount, split, members, tables = []) {
  const order = members.map((m) => m.id), w = {};
  const parts = split.parts || {};
  const inOrder = (o) => Object.fromEntries(order.filter((k) => o[k] > 0).map((k) => [k, o[k]]));
  if (split.mode === 'table') {
    if (!tables.some((x) => x.id === split.table)) return { parts: {}, error: 'table_required' };
    const chosen = Object.keys(parts).filter((k) => parts[k] > 0);
    for (const m of members) { const q = +(m.quotas?.[split.table] || 0); if (q > 0 && (!chosen.length || chosen.includes(m.id))) w[m.id] = q; }
    if (!Object.keys(w).length) return { parts: {}, error: 'table_empty' };
    return { parts: apportion(amount, inOrder(w)) };
  }
  if (split.mode === 'exact') {
    const p = inOrder(parts), given = Object.values(p).reduce((a, b) => a + b, 0);
    return { parts: p, left: amount - given, error: given !== amount ? 'exact_sum' : null };
  }
  if (split.mode === 'percent') {
    const p = inOrder(parts), given = Object.values(p).reduce((a, b) => a + +b, 0);
    return { parts: apportion(amount, p), left: Math.round((100 - given) * 100) / 100, error: Math.abs(given - 100) > 0.011 ? 'percent_sum' : null };
  }
  const p = inOrder(parts);
  if (!Object.keys(p).length) return { parts: {}, error: 'split_required' };
  return { parts: apportion(amount, split.mode === 'shares' ? p : Object.fromEntries(Object.keys(p).map((k) => [k, 1]))) };
}

/** The categories, with their icons (the order of the menu). */
export const CATS = [
  ['food', 'utensils'], ['groceries', 'shopping-cart'], ['drinks', 'coffee'], ['transport', 'bus'], ['fuel', 'fuel'], ['stay', 'bed'], ['rent', 'house'], ['bills', 'zap'],
  ['shopping', 'shopping-bag'], ['fun', 'party-popper'], ['tickets', 'ticket'], ['health', 'activity'], ['gifts', 'gift'], ['home', 'sofa'], ['maintenance', 'wrench'],
  ['cleaning', 'droplets'], ['insurance', 'umbrella'], ['fees', 'landmark'], ['other', 'tag'],
];
export const catIcon = (c) => (CATS.find((x) => x[0] === c) || [0, 'receipt'])[1];
export const catName = (c) => (c ? t('cat_' + c) : t('cat_none'));
/** The colour of a category in the charts and on the rows: a hue of its own, the same in every group. */
export const catHue = (c) => [28, 42, 18, 205, 0, 262, 150, 50, 320, 290, 340, 0, 345, 120, 25, 190, 230, 60, 210][CATS.findIndex((x) => x[0] === c)] ?? 40;
