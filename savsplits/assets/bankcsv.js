/**
 * A bank statement (CSV) into a group: read here, in the browser (the file never leaves it), with the columns chosen by
 * hand (date, description, amount or money out and in, separator, decimal mark, date format), a preview of every row,
 * the rows already in the group left out, and a category given by the keywords remembered (lib/budget.php keeps them).
 * Only the rows chosen are sent, as expenses paid by the account: for itself, or equally among the people of the group.
 */
import { btn, dialog, h, icon, put, segmented, select, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api, loadGroups, loadMine } from './store.js';
import { CATS, catName, dec, money } from './money.js';
import { dayLabel } from './time.js';

const MAX_ROWS = 1000;

// ------------------------------------------------------------------ reading the file

/** The text of the file: UTF-8, or Windows-1252 (the CSV of many banks) when it is not valid UTF-8. */
async function textOf(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

/** CSV with quotes ("a ""b""", fields over more lines), with the separator given. */
export function parseCsv(text, sep) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"' && f === '') q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

/** The separator used most, the same number of times, in the first lines. */
function guessSep(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 12);
  let best = ';', score = -1;
  for (const s of [';', ',', '\t', '|']) {
    const n = lines.map((l) => l.split(s).length - 1);
    const common = n.sort((a, b) => a - b)[Math.floor(n.length / 2)] || 0;
    const sc = common * (n.filter((x) => x === common).length);
    if (common > 0 && sc > score) { score = sc; best = s; }
  }
  return best;
}

/** A date as the bank writes it, in the order given (dmy, mdy, ymd): YYYY-MM-DD, or null. */
export function readDate(s, order) {
  const m = String(s || '').match(/(\d{1,4})\D(\d{1,2})\D(\d{2,4})/);
  if (!m) { const c = String(s || '').match(/^(\d{4})(\d{2})(\d{2})$/); return c ? check(+c[1], +c[2], +c[3]) : null; }
  let [a, b, c] = [+m[1], +m[2], +m[3]];
  if (m[1].length === 4) order = 'ymd';
  const [y, mo, d] = order === 'ymd' ? [a, b, c] : order === 'mdy' ? [c, a, b] : [c, b, a];
  return check(y < 100 ? 2000 + y : y, mo, d);
}
function check(y, m, d) {
  const x = new Date(Date.UTC(y, m - 1, d));
  if (y < 1970 || y > 2200 || x.getUTCMonth() !== m - 1 || x.getUTCDate() !== d) return null;
  return x.toISOString().slice(0, 10);
}

/** An amount as the bank writes it ("-1.234,56", "1,234.56 €", "(12.50)", "12,50-"), with the decimal mark given: a number, or null. */
export function readAmount(s, mark) {
  let x = String(s || '').replace(/[\s  ']/g, '');
  if (!x) return null;
  let neg = false;
  if (/^\(.*\)$/.test(x)) { neg = true; x = x.slice(1, -1); }
  if (/-$/.test(x)) { neg = true; x = x.slice(0, -1); }
  if (/^[-−–]/.test(x.replace(/^[^\d\-−–]+/, ''))) neg = !neg;
  x = x.replace(/[^\d.,]/g, '');
  if (!/\d/.test(x)) return null;
  x = mark === ',' ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  const n = parseFloat(x);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** The columns from the names of the header, in Italian or English (the banks of both). */
function guessCols(head) {
  const find = (re) => head.findIndex((x) => re.test(x));
  const cols = {
    date: find(/^(data( (contabile|operazione|registrazione))?|date|booking date|transaction date|giorno)$/i),
    desc: find(/descri|causale|dettagli|operazione|memo|payee|beneficiar|details|narrative|reference/i),
    amount: find(/^(importo|amount|ammontare|valore|importo (eur|€)|amount \(eur\))$/i),
    debit: find(/uscit|addebit|^dare$|debit|money out|paid out/i),
    credit: find(/entrat|accredit|^avere$|credit|money in|paid in/i),
  };
  if (cols.date < 0) cols.date = find(/data|date/i);
  if (cols.amount < 0) cols.amount = find(/importo|amount/i);
  return cols;
}

/** Words of a description that are worth remembering: without codes, numbers, dates and the words every bank adds. */
const NOISE = /^(pagamento|pagam|pag|pos|carta|card|acquisto|addebito|sdd|sepa|bonifico|disposizione|a|favore|di|da|del|della|presso|op|n|nr|num|ore|il|in|the|payment|purchase|to|from|at|on|contactless|debit|visa|mastercard|maestro|bancomat|prelievo|eur|euro|data|valuta)$/i;
export function keyOf(desc) {
  const words = String(desc || '').toLowerCase().replace(/[^\p{L}\p{N}\s&'.-]/gu, ' ').split(/\s+/).map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ''))
    .filter((w) => w.length > 1 && !/\d/.test(w) && !NOISE.test(w));
  return words.slice(0, 2).join(' ');
}
/** The category of the longest keyword the description contains. */
export function catFor(desc, rules) {
  const s = String(desc || '').toLowerCase().replace(/\s+/g, ' ');
  let best = null;
  for (const r of rules) if (r.k && s.includes(r.k) && (!best || r.k.length > best.k.length)) best = r;
  return best?.c || '';
}

// ------------------------------------------------------------------ the dialog

/** gid: the group to start with (the personal one when there is one). */
export async function importDialog(gid) {
  if (!S.ready) await loadGroups();
  if (!S.mine) await loadMine().catch(() => null);
  const groups = S.groups.filter((g) => g.me && !g.archived).sort((a, b) => (b.kind === 'personal') - (a.kind === 'personal'));
  const rules = (S.mine?.budget?.rules || []).map((r) => ({ ...r }));
  const learnt = new Map(); // keyword → category, written in this import
  const saved = S.mine?.budget?.csv || {};
  const it = getLang() === 'it';
  const st = {
    gid: gid && groups.some((g) => g.id === gid) ? gid : groups[0]?.id || '',
    for: 'me', file: null, text: '', table: [], G: null,
    sep: saved.sep || ';', dec: saved.dec || (it ? ',' : '.'), date: saved.date || (it ? 'dmy' : 'dmy'), head: saved.head ?? true, skip: saved.skip || 0,
    amount: saved.amount || 'one', sign: saved.sign || 'neg', cols: { date: -1, desc: -1, amount: -1, debit: -1, credit: -1, ...(saved.cols || {}) },
    rows: [], shown: 100,
  };

  const body = h('div.form.csvf');
  const groupBox = h('div'), mapBox = h('div.csvmap'), prevBox = h('div.csvprev');
  const drop = h('sav-dropzone', { accept: '.csv,.txt,text/csv,text/plain', label: t('import_drop'), 'max-size': 6000000 });
  drop.addEventListener('change', async (e) => {
    const f = e.detail?.files?.[0] || drop.files?.[0];
    if (!f) { st.file = null; st.text = ''; st.table = []; paintMap(); return; }
    st.file = f;
    st.text = await textOf(f);
    st.sep = guessSep(st.text);
    st.table = parseCsv(st.text, st.sep);
    autoMap();
    // the last way of reading is kept when the file looks the same (the same header, the same columns)
    if (saved.sig && saved.sig === sigOf()) Object.assign(st, { dec: saved.dec, date: saved.date, head: saved.head, skip: saved.skip, amount: saved.amount, sign: saved.sign, cols: { ...st.cols, ...saved.cols } });
    paintMap();
  });

  /** What a statement of the same bank has in common: its separator, the names and the number of its columns. */
  const sigOf = () => [st.sep, st.head ? (st.table[st.skip] || []).join('|') : '', Math.max(0, ...st.table.slice(0, 30).map((r) => r.length))].join('#').slice(0, 300);

  function autoMap() {
    st.skip = 0;
    // the header: the first row with a date-like and an amount-like name (some banks write a few lines before it)
    let hi = st.table.slice(0, 15).findIndex((r) => { const c = guessCols(r); return c.date >= 0 && (c.amount >= 0 || c.debit >= 0); });
    st.head = hi >= 0;
    if (hi < 0) hi = 0; else st.skip = hi;
    const head = st.table[hi] || [];
    const c = st.head ? guessCols(head) : { date: -1, desc: -1, amount: -1, debit: -1, credit: -1 };
    const data = st.table.slice(hi + (st.head ? 1 : 0), hi + 20);
    const ncol = Math.max(...st.table.slice(0, 30).map((r) => r.length));
    // without names: the column of dates, the column of amounts, the longest text
    const score = (i, re) => data.filter((r) => re.test(r[i] || '')).length;
    if (c.date < 0) c.date = [...Array(ncol).keys()].sort((a, b) => score(b, /^\d{1,4}[./-]\d{1,2}[./-]\d{2,4}/) - score(a, /^\d{1,4}[./-]\d{1,2}[./-]\d{2,4}/))[0] ?? 0;
    if (c.amount < 0 && c.debit < 0) c.amount = [...Array(ncol).keys()].filter((i) => i !== c.date).sort((a, b) => score(b, /^[-+(]?[\d.,\s]+\d[)-]?$/) - score(a, /^[-+(]?[\d.,\s]+\d[)-]?$/))[0] ?? 1;
    if (c.desc < 0) c.desc = [...Array(ncol).keys()].filter((i) => i !== c.date && i !== c.amount).sort((a, b) => data.reduce((x, r) => x + (r[b] || '').length, 0) - data.reduce((x, r) => x + (r[a] || '').length, 0))[0] ?? 2;
    st.amount = c.amount < 0 && c.debit >= 0 ? 'two' : 'one';
    st.cols = c;
    // the decimal mark and the order of the date, from the values
    const amts = data.map((r) => r[st.amount === 'two' ? c.debit : c.amount] || r[c.credit] || '').filter(Boolean);
    if (amts.some((x) => /\d,\d{1,2}\s*[-)€]?$/.test(x))) st.dec = ','; else if (amts.some((x) => /\d\.\d{1,2}\s*[-)€]?$/.test(x))) st.dec = '.';
    const dates = data.map((r) => r[c.date] || '');
    if (dates.some((x) => /^\d{4}/.test(x))) st.date = 'ymd';
    else if (dates.some((x) => { const m = x.match(/^(\d{1,2})\D(\d{1,2})/); return m && +m[2] > 12; })) st.date = 'mdy';
    else st.date = 'dmy';
    // expenses: negative when some amounts are negative and some positive (or the most are negative)
    if (st.amount === 'one') { const n = amts.map((x) => readAmount(x, st.dec)).filter((x) => x !== null); st.sign = n.filter((x) => x < 0).length >= n.filter((x) => x > 0).length / 3 ? 'neg' : 'pos'; }
  }

  // ---------------------------------------------------------------- the group
  function paintGroup() {
    if (!groups.length) { put(groupBox, h('sav-alert', { variant: 'neutral' }, t('no_groups_import'))); return; }
    const g = groups.find((x) => x.id === st.gid);
    put(groupBox, h('div.grid2', select(t('import_into'), groups.map((x) => [x.id, x.name + (x.kind === 'personal' ? ' · ' + t('personal_badge') : '')]), st.gid, async (v) => { st.gid = v; st.G = null; paintGroup(); await loadTarget(); build(); }, { searchable: true }),
      g && g.kind !== 'personal' ? h('div', h('span.flabel', t('import_split')), segmented(t('import_split'), st.for, [['me', 'user', t('split_me')], ['all', 'users', t('split_all')]], (v) => { st.for = v; }, { class: 'wide' }), h('small.muted', t('import_split_t'))) : null));
    groupBox.querySelectorAll('.segm sav-radio').forEach((r) => r.append(' ', h('span.lbl', r.getAttribute('title'))));
  }
  async function loadTarget() {
    if (!st.gid) return;
    try { st.G = await api('splits.group', undefined, { id: st.gid }); } catch { st.G = null; }
  }

  // ---------------------------------------------------------------- the columns
  function paintMap() {
    if (!st.table.length) { put(mapBox); put(prevBox, st.file ? h('sav-alert', { variant: 'neutral' }, t('csv_empty')) : null); refreshButton(); return; }
    const ncol = Math.max(...st.table.slice(0, 30).map((r) => r.length));
    const head = st.head ? st.table[st.skip] || [] : [];
    const first = st.table[st.skip + (st.head ? 1 : 0)] || [];
    const colOpts = (none) => [...(none ? [['-1', t('col_none')]] : []), ...[...Array(ncol).keys()].map((i) => [String(i), `${i + 1} · ${(head[i] || first[i] || '').slice(0, 28)}`])];
    const colSel = (k, label, none) => select(label, colOpts(none), String(st.cols[k] ?? -1), (v) => { st.cols[k] = +v; build(); });
    put(mapBox, h('h3', t('import_map')),
      h('div.grid3', colSel('date', t('col_date')), colSel('desc', t('col_desc')),
        st.amount === 'one' ? colSel('amount', t('col_amount')) : h('div.grid2.tight', colSel('debit', t('col_debit'), true), colSel('credit', t('col_credit'), true))),
      h('div.grid3',
        select(t('csv_amount'), [['one', t('amt_one')], ['two', t('amt_two')]], st.amount, (v) => { st.amount = v; paintMap(); }),
        st.amount === 'one' ? select(t('csv_sign'), [['neg', t('sign_neg')], ['pos', t('sign_pos')]], st.sign, (v) => { st.sign = v; build(); }) : h('div'),
        select(t('csv_dec'), [[',', t('dec_comma')], ['.', t('dec_dot')]], st.dec, (v) => { st.dec = v; build(); })),
      h('div.grid3',
        select(t('csv_date'), [['dmy', t('date_dmy')], ['mdy', t('date_mdy')], ['ymd', t('date_ymd')]], st.date, (v) => { st.date = v; build(); }),
        select(t('csv_sep'), [[';', t('sep_semi')], [',', t('sep_comma')], ['\t', t('sep_tab')], ['|', t('sep_pipe')]], st.sep, (v) => { st.sep = v; st.table = parseCsv(st.text, v); paintMap(); }),
        h('sav-number-input', { label: t('csv_skip'), value: st.skip, min: 0, max: 50, size: 'sm', onchange: (e) => { st.skip = Math.max(0, Math.min(50, parseInt(e.currentTarget.value, 10) || 0)); paintMap(); } })),
      h('sav-checkbox', { checked: st.head || null, onchange: (e) => { st.head = e.currentTarget.checked; paintMap(); } }, t('csv_head')));
    build();
  }

  // ---------------------------------------------------------------- the rows, as they will be saved
  function build() {
    if (!st.table.length) return;
    const cur = st.G?.group.currency || 'EUR', d = dec(cur);
    // the expenses already in the group: the same day and the same amount
    const have = new Set();
    const me = st.G?.me;
    for (const e of st.G?.expenses || []) if (e.kind === 'expense') { have.add(e.day + '|' + e.amount); if (me && e.alloc[me]) have.add(e.day + '|' + e.alloc[me]); }
    const data = st.table.slice(st.skip + (st.head ? 1 : 0), st.skip + (st.head ? 1 : 0) + MAX_ROWS);
    const old = new Map(st.rows.map((r) => [r.key, r]));
    st.rows = data.map((r, i) => {
      const day = readDate(r[st.cols.date], st.date);
      const desc = (r[st.cols.desc] || '').replace(/\s+/g, ' ').trim();
      let v = null, kind = 'out';
      if (st.amount === 'two') {
        const o = readAmount(r[st.cols.debit], st.dec), n = readAmount(r[st.cols.credit], st.dec);
        if (o) v = Math.abs(o); else if (n) { v = Math.abs(n); kind = 'in'; }
      } else {
        const n = readAmount(r[st.cols.amount], st.dec);
        if (n !== null && n !== 0) { const out = st.sign === 'neg' ? n < 0 : n > 0; v = Math.abs(n); kind = out ? 'out' : 'in'; }
      }
      const amount = v === null ? null : Math.round(v * 10 ** d);
      if (!day || !amount || !desc) kind = 'bad';
      const key = i + '|' + day + '|' + amount + '|' + desc;
      const prev = old.get(key);
      const dup = kind === 'out' && have.has(day + '|' + amount);
      const auto = catFor(desc, [...rules, ...[...learnt].map(([k, c]) => ({ k, c }))]);
      return { key, day, desc, amount, kind, dup, cat: prev?.manual ? prev.cat : auto, manual: prev?.manual || false, on: prev ? prev.on : kind === 'out' && !dup };
    });
    paintPreview();
  }

  function paintPreview() {
    const cur = st.G?.group.currency || 'EUR';
    const out = st.rows.filter((r) => r.kind === 'out'), chosen = out.filter((r) => r.on);
    const nIn = st.rows.filter((r) => r.kind === 'in').length, nBad = st.rows.filter((r) => r.kind === 'bad').length, nDup = out.filter((r) => r.dup).length;
    const sum = chosen.reduce((a, r) => a + r.amount, 0);
    const opts = [['', t('cat_none')], ...CATS.map(([c]) => [c, catName(c)])];
    const line = (r) => {
      const box = r.kind === 'out' ? h('sav-checkbox', { checked: r.on || null, 'aria-label': r.desc, onchange: (e) => { r.on = e.currentTarget.checked; paintPreview(); } }) : h('span.cbx');
      const cat = r.kind === 'out' ? select(null, opts, r.cat, (v) => { r.cat = v; r.manual = true; learn(r); }, { 'aria-label': t('category'), class: 'pcat', searchable: true }) : null;
      return h('div.prow3' + (r.kind !== 'out' ? '.off' : r.on ? '' : '.no'), box,
        h('div.pmid', h('b', r.desc || '—'), h('small.muted', r.day ? dayLabel(r.day, { day: 'numeric', month: 'short', year: 'numeric' }) : t('bad_row'),
          r.dup ? [' · ', h('span.dupb', icon('copy'), ' ', t('dup'))] : null, r.kind === 'in' ? ' · ' + t('money_in') : null, r.kind === 'bad' && r.day ? ' · ' + t('bad_row') : null)),
        cat, h('strong.pamt' + (r.kind === 'in' ? '.pos' : ''), r.amount ? (r.kind === 'in' ? '+' : '') + money(r.amount, cur) : '—'));
    };
    const shown = st.rows.slice(0, st.shown);
    put(prevBox, h('div.bhead', h('h3', t('preview')), h('span.spacer'),
      btn(t('select_all'), { size: 'sm', appearance: 'ghost', onclick: () => { out.forEach((r) => { r.on = true; }); paintPreview(); } }),
      btn(t('select_none'), { size: 'sm', appearance: 'ghost', onclick: () => { out.forEach((r) => { r.on = false; }); paintPreview(); } })),
      h('small.muted.pnote', [t('prev_n', { n: chosen.length, t: money(sum, cur) }), nDup ? t('prev_dup', { n: nDup }) : null, nIn ? t('prev_skip_in', { n: nIn }) : null, nBad ? t('prev_bad', { n: nBad }) : null].filter(Boolean).join(' · ')),
      h('div.plist3', shown.map(line)),
      st.rows.length > st.shown ? h('div.center', btn(t('show_more'), { size: 'sm', appearance: 'ghost', onclick: () => { st.shown += 200; paintPreview(); } })) : null);
    refreshButton();
  }

  /** A category changed by hand: its keyword is remembered, and the rows with the same one that were not chosen by hand follow. */
  function learn(r) {
    const k = keyOf(r.desc);
    if (!k || !r.cat) return;
    learnt.set(k, r.cat);
    for (const x of st.rows) if (!x.manual && x !== r && x.desc.toLowerCase().includes(k)) x.cat = r.cat;
    paintPreview();
  }

  function refreshButton() {
    const n = st.rows.filter((r) => r.kind === 'out' && r.on).length;
    if (dlg.primary) { dlg.primary.textContent = t('import_n', { n }); dlg.primary.disabled = !n || !st.gid; }
  }

  async function run() {
    const chosen = st.rows.filter((r) => r.kind === 'out' && r.on);
    if (!chosen.length) throw Object.assign(new Error(), { code: 'import_empty' });
    const r = await api('splits.expense.import', { id: st.gid, for: st.for, rows: chosen.map((x) => ({ day: x.day, title: x.desc, amount: x.amount, category: x.cat })) });
    // how the file was read, and the keywords learnt, for the next statement
    const merged = [...rules.filter((x) => !learnt.has(x.k)), ...[...learnt].map(([k, c]) => ({ k, c }))];
    await api('splits.budget.save', { csv: { sig: sigOf(), sep: st.sep, dec: st.dec, date: st.date, head: st.head, skip: st.skip, amount: st.amount, sign: st.sign, cols: st.cols }, ...(learnt.size ? { rules: merged } : {}) }).catch(() => null);
    toast(t('imported_n', { n: r.imported }) + (learnt.size ? ' · ' + t(learnt.size === 1 ? 'learnt_1' : 'learnt_n', { n: learnt.size }) : ''), 'success');
    if (S.G?.group?.id === st.gid) S.G = { ...r, src: S.G.src };
    S.mine = null;
    dispatchEvent(new CustomEvent('savsplits-budget'));
  }

  put(body, h('p.muted.small', icon('lock'), ' ', t('import_t')), groupBox, drop, mapBox, prevBox);
  const dlg = dialog({ title: t('import_bank'), width: '52rem', cls: 'csvdlg', body, actions: [{ label: t('cancel') }, { label: t('import_n', { n: 0 }), primary: true, icon: 'upload', run }] });
  paintGroup();
  refreshButton();
  await loadTarget();
}
