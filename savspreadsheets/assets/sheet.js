/** The screen of a workbook: bars, the formula bar, the grid, the tabs of the sheets, the side panels. */
import { ask, btn, colorPop, confirm, copyText, ctxAt, dialog, drop, dropBtn, empty, errText, face, fail, h, icon, iconBtn, INKS, item, K, keepCaret, menuAt, mobile, PASTEL, primary, put, select, tile, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api, keep, local, offline } from './store.js';
import { Grid } from './grid.js';
import { Engine, FUNCTIONS, canonical, isErr, tokenize } from './formula.js';
import { editText, formatValue, isDateFormat, LOCALES, loc, nowSerial, parseInput, todaySerial } from './format.js';

/** What is typed and edited in the cells is always standard British English (formulas, numbers, dates); only what the cells show follows the language of the workbook. */
const EN = LOCALES.en;
import { applyOp, cleanCell, colName, inRange, DEF_H, DEF_W, diffBack, extent, FONT_STACK, key, MAX_COLS, MAX_ROWS, mergeAt, moveFormula, newId, normalize, parseRange, pos, rangeStr, renameOps, sheetRef, shiftOps, snapshot, styleAt, uniqueName, words } from './model.js';
import { cellFrom, decimals, fill, fromHtml, fromTsv, machine, pageBreaks, pagePrefs, presets, region, setPagePrefs, shownDecimals, tableAt, sortRange, toHtml, toTsv } from './tools.js';
import { chartData, chartSVG } from './chart.js';
import { Sync } from './sync.js';
import { can } from './actions.js';
import { reportDialog, shareDialog } from './share.js';
import { commands, prefs, setPrefs, userMenu } from './account.js';
import { SIG, desc } from './sigs.js';

const SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
const REFCOLORS = ['#2563eb', '#dc2626', '#7c3aed', '#059669', '#d97706', '#db2777', '#0891b2', '#4d7c0f'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const FULLR = (g) => g.c1 <= 1 && g.c2 >= MAX_COLS, FULLC = (g) => g.r1 <= 1 && g.r2 >= MAX_ROWS;

export async function openSheet(root, pid, opt = {}) {
  const isLocal = pid.startsWith('local-');
  let data, ldoc = null;
  if (isLocal && !S.user) throw Object.assign(new Error(), { code: 'doc_signin' });
  if (isLocal) {
    ldoc = await local.get(pid);
    if (!ldoc) throw Object.assign(new Error(), { code: 'doc_not_found' });
    data = { doc: { id: pid, title: ldoc.title, role: 'owner', mine: true, rev: 0 }, content: ldoc.content, comments: [], stamp: '' };
  } else {
    try {
      data = await api('doc.get', undefined, { doc: pid, review: opt.review ? 1 : undefined });
      if (!opt.review && S.user) offline.put('doc:' + pid, data);
    } catch (e) {
      const c = e.code === 'network' && S.user ? await offline.get('doc:' + pid) : null;
      if (!c) throw e.code === 'network' && S.user ? Object.assign(new Error(), { code: 'offline_missing' }) : e;
      data = c;
      S.offline = true;
    }
  }
  const book = normalize(structuredClone(data.content));
  const W = { root, pid, isLocal, doc: data.doc, comments: data.comments || [], book, title: data.doc.title, tab: '', zoom: +(localStorage.getItem('savspreadsheets-zoom') || 1) };
  if (!book.sheets.length) throw Object.assign(new Error(), { code: 'no_sheets' });
  // what this person can do on each sheet: the owner everything; the others what the rules of the sheet say (sent by the
  // server as "my"), else what they can do on the workbook. Protected ranges carry "mine": whether they may change them.
  const isOwner = data.doc.role === 'owner';
  const roleOf = (s) => (isOwner ? 'owner' : s.my || data.doc.role);
  const base = !data.doc.review && !data.doc.deleted && (isLocal || !!S.user);
  const editable = (W.editable = base && book.sheets.some((s) => can(roleOf(s), 'editor')));
  const sheetOk = (s) => base && can(roleOf(s), 'editor');
  // a protected range covers its cells, or (out) every cell of the sheet but its own
  const boxes = new WeakMap();
  const box = (x) => { if (!boxes.has(x)) boxes.set(x, parseRange(x.r)); return boxes.get(x); };
  const covers = (x, r, c) => { const g = box(x); return !!g && inRange(g, r, c) !== !!x.out; };
  const protAt = (s, r, c) => (s.protect || []).find((x) => covers(x, r, c));
  const lockAt = (s, r, c) => !isOwner && (s.protect || []).some((x) => !x.mine && covers(x, r, c));
  const cellOk = (s, r, c) => sheetOk(s) && !lockAt(s, r, c);
  const ruled = (s) => (isOwner ? Object.keys(s.perm || {}).length > 0 || (s.protect || []).length > 0 : !sheetOk(s) || (s.protect || []).some((x) => !x.mine));
  const lim = editable ? {} : book.settings;
  W.canComment = !isLocal && !!S.user && !data.doc.review && !data.doc.deleted && !lim.noComments;
  let L = loc(book.settings.lang), lang = book.settings.lang;
  const ui = getLang();
  const eng = (W.eng = new Engine(book, lang));
  eng.recalc();
  let sh = book.sheets.find((s) => s.id === localStorage.getItem('savspreadsheets-at-' + pid) && !s.hidden) || book.sheets.find((s) => !s.hidden) || book.sheets[0];
  const undos = [], redos = [];

  // ------------------------------------------------------------------ frame

  const title = h('sav-input.dtitle', { value: data.doc.title, maxlength: 160, readonly: !editable, size: 'sm', 'aria-label': t('rename_doc'), spellcheck: 'false' });
  const status = h('span.status', { role: 'status' }), people = h('div.people');
  const undoB = iconBtn('undo-2', t('undo'), () => undo(), { kbd: 'Mod+Z', size: 'md' }), redoB = iconBtn('redo-2', t('redo'), () => undo(true), { kbd: 'Mod+Shift+Z', size: 'md' });
  const shareB = !isLocal && data.doc.role === 'owner' ? btn(h('span.lbl', t('share')), { icon: 'user-plus', label: t('share'), variant: 'primary', appearance: 'soft', onclick: () => shareDialog(W) }) : isLocal && S.user?.verified ? btn(h('span.lbl', t('save_account')), { icon: 'cloud-upload', label: t('save_account'), variant: 'primary', appearance: 'soft', onclick: () => toAccount() }) : null;
  const downB = iconBtn('download', t('download'), () => downloadDialog(), { size: 'md' });
  const menuB = drop(h('sav-button', { icon: 'ellipsis-vertical', appearance: 'ghost', variant: 'neutral', square: true, label: t('more') }), () => moreItems(), { placement: 'bottom-end', label: data.doc.title });
  const fmt = h('div.fmt', { role: 'toolbar', 'aria-label': t('format_tab') });
  const nameBox = h('input.namebox', { 'aria-label': t('name_box'), spellcheck: 'false', autocomplete: 'off' });
  const fxBtn = iconBtn('square-function', t('g_title'), () => guide(), { size: 'sm' });
  const fxWrap = h('div.fxwrap'), fxHl = h('div.fxhl', { 'aria-hidden': 'true' }), fxIn = h('textarea.fxin', { rows: 1, spellcheck: 'false', 'aria-label': t('formula'), readonly: !editable || null, autocomplete: 'off' });
  fxWrap.append(fxHl, fxIn);
  const fxOk = iconBtn('check', t('enter'), () => commit(0, 0), { size: 'sm', class: 'fxok' }), fxNo = iconBtn('x', t('cancel'), () => cancelEdit(), { size: 'sm', class: 'fxno' });
  // the formula box: its normal height (it grows a little with the text), double or triple; kept in this browser
  let fxSize = Math.max(1, Math.min(3, +localStorage.getItem('savspreadsheets-fxsize') || 1));
  const fxGrow = iconBtn('chevrons-down', '', () => { fxSize = fxSize % 3 + 1; localStorage.setItem('savspreadsheets-fxsize', fxSize); fxSized(); autoBar(); }, { size: 'sm', class: 'fxgrow' });
  function fxSized() {
    fxWrap.dataset.size = fxSize;
    fxGrow.button.icon = fxSize === 3 ? 'chevrons-up' : 'chevrons-down';
    const label = t(fxSize === 3 ? 'fx_size_back' : fxSize === 1 ? 'fx_size_2' : 'fx_size_3');
    fxGrow.setAttribute('content', label); fxGrow.button.setAttribute('label', label);
  }
  fxSized();
  fxIn.addEventListener('scroll', () => { fxHl.scrollTop = fxIn.scrollTop; }); // the colours follow the text when it scrolls
  const fbar = h('div.fbar', nameBox, h('i.sep'), editable ? [fxNo, fxOk] : null, fxBtn, fxWrap, fxGrow);
  const gridHost = h('div.ghost'), panel = h('aside.epanel'), rail = h('sav-bottom-nav.rail', { label: t('panels') });
  const tabsEl = h('sav-tabs.stabs', { appearance: 'pills', 'aria-label': t('sheets') }), roBadge = h('sav-badge.robadge', { variant: 'neutral', appearance: 'soft', pill: true, hidden: true }, icon('lock'), ' ', t('sheet_ro')), statsEl = h('div.stats'), zoomEl = h('sav-zoom', { value: Math.round(W.zoom * 100), min: 50, max: 200, step: 10, size: 'sm', appearance: 'plain' });
  // the pieces of the title bar and of the status bar that each person may show or not (⋮ → Customise the bars)
  const SB = { addSheet: editable ? iconBtn('plus', t('add_sheet'), () => addSheet(), { place: 'top' }) : null, sheets: dropBtn('menu', t('all_sheets'), () => book.sheets.map((s) => [s.hidden ? 'eye-off' : 'sheet', s.name, () => { if (s.hidden && editable) change([{ t: 'sheet', id: s.id, p: { hidden: false } }]); switchTo(s.id); }, { check: s === sh }]), { placement: 'top-start', caret: false }), stats: statsEl, zoom: zoomEl };
  const bottom = h('div.sbottom');
  const homeA = h('a.ehome', { href: '#/', title: t('home'), 'aria-label': t('home') }, h('img', { src: 'icons/favicon.svg', width: 30, height: 30, alt: '' })), etitle = h('div.etitle', title, status);
  // on the right, always: ⋮, the apps of SavOffice and the account (signed out too: the apps, then Sign in)
  const accountEl = S.user ? userMenu() : h('span.umenu', h('savoffice-apps', { current: 'savspreadsheets' }), mobile() ? null : btn(t('sign_in'), { appearance: 'outline', variant: 'neutral', href: '#/signin' }));
  const TB2 = { undo: editable ? undoB : null, redo: editable ? redoB : null, people, share: shareB, download: mobile() || lim.noDownload ? null : downB,
    find: iconBtn('search', t('find'), () => setTab('find', true), { kbd: 'Mod+F', size: 'md' }), print: lim.noDownload ? null : iconBtn('printer', t('print'), () => printSheet(), { kbd: 'Mod+P', size: 'md' }),
    guide: editable ? iconBtn('square-function', t('g_title'), () => guide(), { size: 'md' }) : null };
  const top = h('header.etop');
  /** A bar as each person chose it (⋮ → Customise the bars, kept with the account): its list, in order, with '|' a separator,
   *  '_' a fixed space and '~' an adaptive one (SavOffice.bars); what it has at first when nothing was chosen. */
  const BARS = window.SavOffice?.bars;
  const barPick = (id, def, items, old) => { const v = prefs().bars?.[id] ?? old; return BARS ? BARS.pick(v, def, items) : def; };
  const barList = (id, def, items, old) => { const l = barPick(id, def, items, old); return BARS ? BARS.layout(l) : l; };
  const barEl = (k, map) => (k === '|' ? h('i.sep.so-sep') : k === '_' ? h('i.bgap') : k === '~' ? h('div.spacer') : map[k]);
  const TITLE_ITEMS = () => [['undo', 'undo-2', t('undo')], ['redo', 'redo-2', t('redo')], ['people', 'users', t('bar_people')], ['share', 'user-plus', t('share')], ['download', 'download', t('download')], ['find', 'search', t('find')], ['print', 'printer', t('print')], ['guide', 'square-function', t('g_title')]].filter(([k]) => TB2[k]);
  const TITLE_DEF = ['undo', 'redo', '~', 'people', 'share', 'download'];
  /** The title bar: the logo and the title first, ⋮ and the account last (always); between them the list, in its order. */
  function layoutTitle() { put(top, homeA, etitle, barList('title', TITLE_DEF, TITLE_ITEMS()).map((k) => barEl(k, TB2)), menuB, accountEl); }
  SB.tabs = tabsEl; SB.ro = roBadge;
  const STATUS_ITEMS = () => [['addSheet', 'plus', t('add_sheet')], ['sheets', 'menu', t('all_sheets')], ['tabs', 'sheet', t('sheets'), { lock: true }], ['ro', 'lock', t('sheet_ro'), { lock: true }], ['stats', 'sigma', t('bar_stats')], ['zoom', 'zoom-in', t('bar_zoom')]].filter(([k]) => SB[k]);
  const STATUS_DEF = ['addSheet', 'sheets', 'tabs', '~', 'ro', 'stats', 'zoom'];
  function layoutStatus() { put(bottom, barList('status', STATUS_DEF, STATUS_ITEMS()).map((k) => barEl(k, SB))); }
  layoutTitle();
  layoutStatus();
  const note = editable ? null : h('sav-alert.robar', { variant: data.doc.review ? 'warning' : 'neutral', noicon: true }, data.doc.review ? t('a_review_bar') : data.doc.role === 'commenter' ? t('can_comment') : t('read_only'));
  const center = h('section.scenter', note, fbar, gridHost, bottom);
  const frame = h('div.sheetapp' + (editable ? '' : '.reading'), top, editable ? fmt : null, h('div.emain', center, panel, rail));
  put(root, frame);
  document.title = data.doc.title + ' – SavSpreadsheets';

  // ------------------------------------------------------------------ what each cell shows

  let disp = new Map(), mm = new Map(), mlist = [], filtered = new Set(), rowAuto = new Map(), ext = extent(sh), more = { r: 0, c: 0 }, cfc = null, notes = new Map();
  const z = () => W.zoom;
  function rebuild() {
    frame.classList.toggle('sheet-ro', editable && !sheetOk(sh));
    roBadge.hidden = !(base && !sheetOk(sh));
    fxIn.readOnly = !sheetOk(sh);
    disp = new Map();
    mm = new Map();
    mlist = sh.merges.map(parseRange).filter(Boolean);
    for (const g of mlist) {
      const r2 = Math.min(g.r2, g.r1 + 2000), c2 = Math.min(g.c2, g.c1 + 200);
      for (let r = g.r1; r <= r2; r++) for (let c = g.c1; c <= c2; c++) mm.set(r * 1000 + c, r === g.r1 && c === g.c1 ? { r2: g.r2, c2: g.c2 } : 'covered');
    }
    ext = extent(sh);
    for (const ch of sh.charts) { const g = parseRange(ch.r); if (g) { ext.r = Math.max(ext.r, g.r2); ext.c = Math.max(ext.c, g.c2); } }
    // rows grow with big text, as in every spreadsheet
    rowAuto = new Map();
    for (const [k, c] of Object.entries(sh.cells)) { if (!c.s?.fz || c.s.fz <= 12) continue; const r = pos(k)[0], hh = Math.ceil(c.s.fz * 1.333 * 1.35 + 6); if (hh > (rowAuto.get(r) || DEF_H)) rowAuto.set(r, hh); }
    refilter();
    cfc = null;
    notes = new Map();
    for (const c of W.comments) if (!c.parent && !c.resolved && c.block?.startsWith(sh.id + '!')) notes.set(c.block.split('!')[1], (notes.get(c.block.split('!')[1]) || 0) + (c.private ? 0 : 1) || -1);
  }
  function refilter() {
    filtered = new Set();
    const f = sh.filter, g = f && parseRange(f.r);
    if (!g) return;
    const cols = Object.entries(f.h || {}).filter(([, v]) => v.length).map(([c, v]) => [colNumOf(c), new Set(v)]);
    if (!cols.length) return;
    for (let r = g.r1 + 1; r <= Math.min(g.r2, MAX_ROWS); r++) for (const [c, hide] of cols) if (hide.has(shown(r, c))) { filtered.add(r); break; }
  }
  const colNumOf = (s) => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  /** The text of a cell as shown. */
  function shown(r, c, s) {
    const k = key(r, c), v = eng.value(s || sh, k);
    return v === null ? '' : formatValue(v, styleAt(s || sh, r, c, (s || sh).cells[k]).nf, L).text;
  }
  const W8 = (c) => (sh.cols[colName(c)]?.w ?? DEF_W);
  const H8 = (r) => (sh.rows[r]?.h ?? rowAuto.get(r) ?? DEF_H);
  function cellView(r, c) {
    const id = r * 1000 + c;
    if (disp.has(id)) return disp.get(id);
    const d = view(r, c);
    disp.set(id, d);
    return d;
  }
  function view(r, c) {
    const m = mm.get(r * 1000 + c);
    if (m === 'covered') return { merge: 'covered' };
    const k = key(r, c), cell = sh.cells[k], st = styleAt(sh, r, c, cell), v = eng.value(sh, k), cf = cfAt(r, c, v), s = cf?.s ? { ...st, ...cf.s } : st;
    const dv = dvAt(r, c), cm = notes.get(k), fh = filterHead(r, c);
    const pr = sh.protect.length ? protAt(sh, r, c) : null;
    if (v === null && !Object.keys(s).length && !m && !dv && !cm && !fh && !cf && !pr) return null;
    const f = v === null ? { text: '' } : formatValue(v, s.nf, L);
    const zz = z(), out = { merge: m, wrap: !!s.w, va: s.va || 'b' };
    out.text = f.text;
    out.align = s.ha || (isErr(v) || typeof v === 'boolean' ? 'c' : typeof v === 'number' ? 'r' : 'l');
    let css = '';
    if (s.ff || zz !== 1 || s.fz) css += `font-size:${((s.fz || book.settings.fontSize || 10) * 1.333 * zz).toFixed(1)}px;`;
    if (s.ff) css += `font-family:${FONT_STACK[s.ff]};`;
    if (s.b) css += 'font-weight:700;';
    if (s.i) css += 'font-style:italic;';
    if (s.u || s.k) css += `text-decoration:${s.u ? 'underline' : ''} ${s.k ? 'line-through' : ''};`;
    const color = f.color || s.c;
    if (color) css += `color:${color};`;
    if (s.ind) css += `padding-${out.align === 'r' ? 'right' : 'left'}:${4 + s.ind * 10 * zz}px;`;
    if (s.rot) css += `--rot:${-s.rot}deg;`;
    let bg = s.bg ? `background:${s.bg};` : '';
    if (cf?.bg) bg = `background:${cf.bg};`;
    // protected cells: a hatch (stronger for who may not change them)
    if (pr) bg += `background-image:repeating-linear-gradient(135deg,rgb(77 124 15 / ${lockAt(sh, r, c) ? '.16' : '.07'}) 0 1.5px,transparent 1.5px 7px);`;
    out.bgcss = bg;
    const bd = ['bt', 'br', 'bb', 'bl'].filter((x) => s[x]).map((x) => { const [kind, col] = s[x].split(' '), side = { bt: 'top', br: 'right', bb: 'bottom', bl: 'left' }[x]; const wd = kind === 'medium' ? 2 : kind === 'thick' ? 3 : kind === 'double' ? 3 : 1, line = kind === 'dashed' ? 'dashed' : kind === 'dotted' ? 'dotted' : kind === 'double' ? 'double' : 'solid'; return `border-${side}:${wd}px ${line} ${col}`; });
    if (bd.length) out.bd = bd.join(';');
    const extra = [];
    if (cf?.bar) extra.push(`<i class="dbar" style="width:${cf.bar[0]}%;background:${cf.bar[1]}"></i>`);
    if (dv?.k === 'check') { extra.push(`<i class="chk${v === true ? ' on' : dv.tri && typeof v !== 'boolean' ? ' mid' : ''}" data-r="${r}" data-c="${c}" role="checkbox" aria-checked="${v === true ? 'true' : dv.tri && typeof v !== 'boolean' ? 'mixed' : 'false'}"></i>`); out.text = ''; }
    if (cm) extra.push(`<i class="cmk${cm < 0 ? ' own' : ''}"></i>`);
    if (fh) extra.push(`<i class="fbtn${fh.on ? ' on' : ''}" data-fc="${c}"></i>`);
    const arrow = dv?.k === 'list' && editable && dv.arrow !== false;
    if (arrow) extra.push(`<i class="dvb${v === null ? ' e' : ''}${dv.sel ? ' sel' : dv.hover !== false ? ' hov' : ''}" data-r="${r}" data-c="${c}"></i>`);
    if (fh || (arrow && v !== null)) css += 'padding-right:22px;';
    if (extra.length) out.html = extra.join('');
    out.css = css;
    const tc = [];
    if (isErr(v) || f.error) tc.push('er');
    if (typeof v === 'string' && /^https?:\/\/\S+$/.test(v)) tc.push('lk');
    if (s.rot) tc.push('rot');
    if (dv && dv.bad) tc.push('bad');
    if (eng.spilledAt(sh, k)) tc.push('sp');
    out.tcls = tc.join(' ');
    return out;
  }
  // ---------------------------------------------------------------- conditional formats
  function cfAt(r, c, v) {
    if (!sh.cf.length) return null;
    if (!cfc) cfc = sh.cf.map((x) => ({ ...x, g: parseRange(x.r) }));
    let out = null;
    for (const x of cfc) {
      if (!x.g || r < x.g.r1 || r > x.g.r2 || c < x.g.c1 || c > x.g.c2) continue;
      const hit = cfTest(x, r, c, v);
      if (!hit) continue;
      out ||= {};
      if (hit.bg) out.bg = hit.bg;
      if (hit.bar) out.bar = hit.bar;
      if (x.s && Object.keys(x.s).length && hit === true) out.s = { ...(out.s || {}), ...x.s };
    }
    return out;
  }
  function cfStats(x) {
    if (x.stats) return x.stats;
    const vals = [], counts = new Map(), g = { ...x.g, r2: Math.min(x.g.r2, ext.r), c2: Math.min(x.g.c2, ext.c) };
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const v = eng.value(sh, key(r, c)); if (typeof v === 'number') vals.push(v); if (v !== null && v !== '') { const kk = typeof v === 'string' ? v.toLowerCase() : String(v); counts.set(kk, (counts.get(kk) || 0) + 1); } }
    const sorted = [...vals].sort((a, b) => b - a), n = Math.max(1, Math.floor(+x.a || 10));
    return (x.stats = { min: Math.min(...vals), max: Math.max(...vals), counts, top: sorted[Math.min(n, sorted.length) - 1] ?? Infinity });
  }
  const mix = (a, b, k) => { const p = (s, i) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16), q = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k)); return '#' + q.map((x) => x.toString(16).padStart(2, '0')).join(''); };
  function cfTest(x, r, c, v) {
    const n = (s) => { const p = parseInput(String(s ?? ''), EN); return typeof p.v === 'number' ? p.v : null; }, a = n(x.a), b = n(x.b);
    switch (x.k) {
      case 'gt': return typeof v === 'number' && a !== null && v > a;
      case 'lt': return typeof v === 'number' && a !== null && v < a;
      case 'ge': return typeof v === 'number' && a !== null && v >= a;
      case 'le': return typeof v === 'number' && a !== null && v <= a;
      case 'eq': return a !== null ? v === a : String(v ?? '').toLowerCase() === String(x.a).toLowerCase();
      case 'ne': return a !== null ? v !== a : String(v ?? '').toLowerCase() !== String(x.a).toLowerCase();
      case 'between': return typeof v === 'number' && a !== null && b !== null && v >= Math.min(a, b) && v <= Math.max(a, b);
      case 'text': return v !== null && String(v).toLowerCase().includes(String(x.a).toLowerCase());
      case 'empty': return v === null || v === '';
      case 'filled': return v !== null && v !== '';
      case 'dup': return v !== null && v !== '' && cfStats(x).counts.get(typeof v === 'string' ? v.toLowerCase() : String(v)) > 1;
      case 'top': return typeof v === 'number' && v >= cfStats(x).top;
      case 'formula': { const f = moveFormula('=' + String(x.a).replace(/^=/, ''), r - x.g.r1, c - x.g.c1), res = eng.once(sh, r, c, f); return res === true || (typeof res === 'number' && res !== 0); }
      case 'scale': { if (typeof v !== 'number') return false; const st = cfStats(x), k = st.max === st.min ? 0.5 : (v - st.min) / (st.max - st.min), c1 = x.c1 || '#f8696b', c2 = x.c2 || '#63be7b', c3 = x.c3; return { bg: c3 ? (k < 0.5 ? mix(c1, c3, k * 2) : mix(c3, c2, (k - 0.5) * 2)) : mix(c1, c2, k) }; }
      case 'bars': { if (typeof v !== 'number') return false; const st = cfStats(x), lo = Math.min(0, st.min), k = st.max === lo ? 0 : (v - lo) / (st.max - lo); return { bar: [Math.max(0, Math.min(100, k * 100)).toFixed(1), x.c1 || '#7fb55c'] }; }
    }
    return false;
  }
  // ---------------------------------------------------------------- validation and filters
  function dvAt(r, c) {
    for (const x of sh.dv) { const g = parseRange(x.r); if (g && r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) { const v = eng.value(sh, key(r, c)); return { ...x, bad: v !== null && !dvOk(x, v) }; } }
    return null;
  }
  function dvOk(x, v) {
    const n = (s) => { const p = parseInput(String(s ?? ''), EN); return typeof p.v === 'number' ? p.v : null; }, a = n(x.a), b = n(x.b);
    switch (x.k) {
      case 'list': return x.list.some((i) => i.toLowerCase() === String(typeof v === 'number' ? formatValue(v, '', L).text : v).toLowerCase());
      case 'number': case 'date': return typeof v === 'number' && (a === null || v >= a) && (b === null || v <= b);
      case 'int': return typeof v === 'number' && Number.isInteger(v) && (a === null || v >= a) && (b === null || v <= b);
      case 'text': { const l = String(v).length; return (a === null || l >= a) && (b === null || l <= b); }
      case 'check': return typeof v === 'boolean' || (x.tri && (v === null || v === ''));
    }
    return true;
  }
  function filterHead(r, c) {
    const g = sh.filter && parseRange(sh.filter.r);
    if (!g || r !== g.r1 || c < g.c1 || c > g.c2) return null;
    return { on: !!sh.filter.h?.[colName(c)]?.length || sh.filter.sort === colName(c) };
  }

  // ------------------------------------------------------------------ the grid

  const grid = (W.grid = new Grid(gridHost, {
    editable,
    colW: (c) => W8(c) * z(), rowH: (r) => H8(r) * z(), pages: () => { const p = pagePrefs(); return p.guides ? pageBreaks(sh, p) : null; },
    colHidden: (c) => !!sh.cols[colName(c)]?.x, rowHidden: (r) => !!sh.rows[r]?.x || filtered.has(r),
    freeze: () => sh.freeze || { r: 0, c: 0 },
    size: () => ({ r: Math.max(1000, ext.r + 100) + more.r, c: Math.max(26, ext.c + 6) + more.c }),
    merges: () => mlist,
    cell: (r, c) => cellView(r, c),
    on: {
      select: (s, how) => { if (editing && how !== 'pick') commit(0, 0, true); selected(); },
      selected: () => {},
      dblclick: (r, c) => { if (editable) startEdit('edit'); else if (W.canComment) startComment(); },
      menu: (x, y, hh) => cellMenu(x, y, hh),
      resizing: (axis, list, size) => { const was = axis === 'c' ? W8 : H8; grid.o.colW = axis === 'c' ? (c) => (list.includes(c) ? size : W8(c) * z()) : grid.o.colW; grid.o.rowH = axis === 'r' ? (r) => (list.includes(r) ? size : H8(r) * z()) : grid.o.rowH; grid.refresh(); void was; },
      resize: (axis, list, size) => { grid.o.colW = (c) => W8(c) * z(); grid.o.rowH = (r) => H8(r) * z(); setSizes(axis, list, Math.round(size / z())); },
      autofit: (axis, list) => autofit(axis, list),
      fill: (from, to) => doFill(from, to),
      scroll: () => { const v = grid.view; if (v && v.r2 > grid.nr - 30 && grid.nr < MAX_ROWS) { more.r += 500; grid.refresh(); } if (v && v.c2 > grid.nc - 3 && grid.nc < MAX_COLS) { more.c += 10; grid.refresh(); } drawCharts(); },
      drop: (files) => import('./actions.js').then((a) => a.openFile(files[0])),
      unhide: (axis, i) => editable && unhide(axis, i),
      pick: (hh) => pickable() && !hh.head ? (pickAt(hh, hh), true) : false,
      pickMove: (a, b) => pickAt(a, b),
      picked: () => {},
    },
  }));
  W.grid = grid;
  // fill handle, resizing… only where this person may change the sheet
  Object.defineProperty(grid.o, 'editable', { get: () => sheetOk(sh), configurable: true });
  rebuild();
  grid.refresh();
  // going to a cell far away (the name box, a search, a link, Ctrl+arrows): the grid grows to it first, or there is nothing to scroll to
  { const show = grid.show.bind(grid);
    grid.show = (r, c) => {
      let grew = false;
      if (r > grid.nr - 30 && grid.nr < MAX_ROWS) { more.r += r - grid.nr + 100; grew = true; }
      if (c > grid.nc - 3 && grid.nc < MAX_COLS) { more.c += c - grid.nc + 6; grew = true; }
      if (grew) grid.refresh();
      show(r, c);
    }; }
  const wrap = grid.wrap;
  wrap.soMenu = () => cellItems({});
  // the keys reach a hidden text box: whatever is typed into it (keys, a dictation, an input method) opens the cell editor.
  // On touch screens the grid itself keeps the focus, so the keyboard does not open at every tap.
  const sink = h('textarea.keysink', { autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': t('formula'), tabindex: -1 });
  gridHost.append(sink);
  const coarse = () => matchMedia('(pointer: coarse)').matches;
  const focusGrid = () => (coarse() ? wrap : sink).focus({ preventScroll: true });
  const gridFocused = () => document.activeElement === wrap || document.activeElement === sink;
  grid.o.focus = focusGrid;
  sink.addEventListener('input', () => { const v = sink.value; sink.value = ''; if (!editing && editable && v) startEdit('enter', v); });

  // a click on a checkbox, a filter button or a list of a validation
  wrap.addEventListener('pointerdown', (e) => {
    const x = e.target.closest('.chk,.fbtn,.dvb');
    if (!x) return;
    e.stopPropagation(); e.preventDefault();
    if (x.classList.contains('chk') && editable) toggleCheck(+x.dataset.r, +x.dataset.c, false);
    else if (x.classList.contains('fbtn')) filterPop(+x.dataset.fc, x);
    else if (x.classList.contains('dvb')) dvPress = x.dataset.r + ':' + x.dataset.c;
  }, true);
  // the list of a dropdown opens on the click, once the button is released: opened on the press, the release that
  // follows (outside the list, which was not there yet) would close it straight away (light dismiss of popovers)
  let dvPress = null;
  wrap.addEventListener('click', (e) => {
    const x = e.target.closest('.dvb');
    if (!x || x.dataset.r + ':' + x.dataset.c !== dvPress) { dvPress = null; return; }
    dvPress = null;
    e.stopPropagation(); e.preventDefault();
    listPop(+x.dataset.r, +x.dataset.c, x);
  }, true);
  wrap.addEventListener('click', (e) => { if ((e.ctrlKey || e.metaKey) && e.target.closest('.lk')) { const hh = grid.hit(e.clientX, e.clientY), v = eng.value(sh, key(hh.r, hh.c)); if (typeof v === 'string' && /^https?:\/\//.test(v)) window.open(v, '_blank', 'noopener'); } });

  // ------------------------------------------------------------------ changes, undo, saving

  let saveT = null;
  /**
   * Applies changes made here: they are drawn, remembered for undo, and sent. opts.record false: from undo or recovery.
   */
  /** What the rules allow of some changes (the server checks the same): cells of protected ranges and sheets that are only to read are left out. */
  function permitted(ops) {
    if (isOwner) return ops;
    const out = [];
    let blocked = false;
    const sheetBy = (id) => book.sheets.find((x) => x.id === id);
    for (const op of ops) {
      const s = sheetBy(op.s || op.id);
      if (op.t === 'cells') {
        if (!s || !sheetOk(s)) { blocked = true; continue; }
        const m = {};
        for (const [k, c] of Object.entries(op.m)) { const p = pos(k); if (p && !lockAt(s, p[0], p[1])) m[k] = c; else blocked = true; }
        if (Object.keys(m).length) out.push({ ...op, m });
      } else if (op.t === 'shift') {
        // the formulas rewritten after a shift belong to it: all or nothing
        if (!s || !sheetOk(s) || s.protect.some((x) => !x.mine)) { toast(t('locked_cells'), 'warning'); return []; }
        out.push(op);
      } else if (op.t === 'sheet') {
        if (!s || !sheetOk(s)) { blocked = true; continue; }
        const p = { ...op.p };
        delete p.perm; delete p.protect;
        if (Object.keys(p).length) out.push({ ...op, p });
      } else if (op.t === 'addsheet') { if (can(data.doc.role, 'editor')) out.push({ ...op, sheet: { ...op.sheet, perm: {}, protect: [] } }); else blocked = true; }
      else if (op.t === 'delsheet' || op.t === 'movsheet') { if (s && sheetOk(s) && (op.t === 'movsheet' || !s.protect.length)) out.push(op); else blocked = true; }
      else if (op.t === 'settings' || op.t === 'title') { if (can(data.doc.role, 'editor')) out.push(op); else blocked = true; }
      else out.push(op);
    }
    if (blocked) toast(t(sheetOk(sh) ? 'locked_cells' : 'sheet_ro'), 'warning');
    return out;
  }
  function change(ops, o = {}) {
    if (!editable || !ops.length) return;
    if (o.record !== false && !o.redo) ops = permitted(ops);
    if (!ops.length) return;
    if (editing && !o.keepEdit) cancelEdit(true);
    const structural = ops.some((x) => ['shift', 'addsheet', 'delsheet', 'movsheet'].includes(x.t) || (x.t === 'sheet' && 'name' in x.p) || x.t === 'settings');
    const touched = [...new Set(ops.map((x) => x.s || x.id).filter(Boolean))];
    // the way back: for cells only their old content, otherwise a picture of the sheets touched
    let back;
    if (!structural && ops.every((x) => x.t === 'cells')) back = ops.map((x) => { const s = book.sheets.find((y) => y.id === x.s), m = {}; for (const k in x.m) m[k] = s?.cells[k] || null; return { t: 'cells', s: x.s, m }; }).reverse();
    const snap = back ? null : snapshot(book, touched);
    applyAll(ops, structural);
    if (!back) back = diffBack(book, snap);
    if (o.record !== false && back.length) { undos.push({ undo: back, redo: ops, sel: { ...grid.sel, sid: sh.id } }); if (undos.length > 200) undos.shift(); if (!o.redo) redos.length = 0; }
    send(ops);
    afterChange();
    if (!o.keepEdit && (document.activeElement === document.body || document.activeElement?.closest?.('.fmt, .sbottom, .etop .hist'))) focusGrid();
  }
  function applyAll(ops, structural) {
    const keys = new Map();
    for (const op of ops) {
      applyOp(book, op, (x) => { W.title = x; title.value = x; document.title = x + ' – SavSpreadsheets'; });
      if (op.t === 'cells') { let s = keys.get(op.s); if (!s) keys.set(op.s, (s = new Set())); for (const k in op.m) s.add(k); }
      if (op.t === 'settings') { L = loc(op.s.lang); lang = op.s.lang; eng.setLang(lang); }
    }
    if (structural) eng.invalidateAll(); else for (const [sid, ks] of keys) eng.touch(sid, [...ks]);
    eng.recalc();
    if (!book.sheets.includes(sh)) sh = book.sheets.find((s) => s.id === sh.id) || book.sheets.find((s) => !s.hidden) || book.sheets[0];
  }
  function send(ops) {
    if (W.sync) W.sync.push(ops);
    else if (isLocal) { setState('saving'); clearTimeout(saveT); saveT = setTimeout(saveLocal, 500); }
  }
  function afterChange() {
    rebuild();
    grid.refresh();
    drawCharts();
    drawTabs();
    selected();
    undoB.button.disabled = !undos.length;
    redoB.button.disabled = !redos.length;
  }
  function undo(back) {
    const from = back ? redos : undos, to = back ? undos : redos, e = from.pop();
    if (!e) return;
    if (editing) cancelEdit(true);
    const ops = back ? e.redo : e.undo;
    const snap = snapshot(book, [...new Set(ops.map((x) => x.s || x.id).filter(Boolean))]);
    applyAll(ops, true);
    const inv = diffBack(book, snap);
    to.push(back ? { ...e, undo: inv } : { ...e, redo: inv.length ? inv : e.redo });
    send(ops);
    if (e.sel?.sid && e.sel.sid !== sh.id && book.sheets.some((s) => s.id === e.sel.sid)) switchTo(e.sel.sid, true);
    if (e.sel) { grid.sel = { ranges: e.sel.ranges, r: e.sel.r, c: e.sel.c }; grid.show(e.sel.r, e.sel.c); }
    afterChange();
  }
  /** Changes of the others (from the server). */
  function remote(ops) {
    const structural = ops.some((x) => ['shift', 'addsheet', 'delsheet', 'movsheet'].includes(x.t) || (x.t === 'sheet' && 'name' in x.p) || x.t === 'settings');
    const keep = editing ? { ...editing, text: fxIn.value } : null;
    applyAll(ops, structural);
    // undo keeps working on what is still there; changes of the others are not undone here
    rebuild();
    grid.refresh();
    drawCharts();
    drawTabs();
    if (!keep) selected(); else showStats();
  }
  async function saveLocal() {
    clearTimeout(saveT);
    saveT = null;
    ldoc.title = W.title;
    ldoc.content = { settings: book.settings, sheets: book.sheets };
    try { await local.put(ldoc); setState('saved'); } catch (e) { fail(e); }
  }
  function setState(s) { status.dataset.s = s; put(status, icon(isLocal ? (s === 'saved' ? 'hard-drive' : 'cloud-upload') : { saved: 'cloud-check', saving: 'refresh-cw', offline: 'cloud-off' }[s]), isLocal && s === 'saved' ? t('local_note') : t(s)); }
  function setPeople(list) {
    const seen = new Set();
    put(people, list.filter((p) => !seen.has(p.name) && seen.add(p.name)).slice(0, 4).map((p) => face(p.name, p.hue, 28)));
    W.people = list;
    drawPeople();
  }
  function drawPeople() {
    grid.people = (W.people || []).map((p) => { const [sid, k] = (p.block || '').split('!'), q = sid === sh.id && pos(k); return q ? { ...p, r: q[0], c: q[1] } : { ...p, r: 0 }; });
    grid.overlay();
  }
  title.addEventListener('change', () => { const v = title.value.trim() || t('untitled'); title.value = v; if (v === W.title) return; change([{ t: 'title', title: v }]); });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); focusGrid(); } });
  W.settings = () => book.settings;
  W.setSettings = (p) => change([{ t: 'settings', s: { ...book.settings, ...p } }]);

  // ------------------------------------------------------------------ the selection

  const cur = () => grid.sel.ranges.at(-1);
  const act = () => ({ r: grid.sel.r, c: grid.sel.c });
  function selected() {
    W.dvShow?.();
    if (W.ready) { (W.sels ||= {})[sh.id] = grid.sel; W.keepCell?.(); }
    const s = grid.sel, g = cur(), k = key(s.r, s.c);
    nameBox.value = g.r1 === g.r2 && g.c1 === g.c2 || (mm.get(g.r1 * 1000 + g.c1)?.r2 === g.r2 && mm.get(g.r1 * 1000 + g.c1)?.c2 === g.c2) ? k : FULLC(g) ? colName(g.c1) + ':' + colName(g.c2) : FULLR(g) ? g.r1 + ':' + g.r2 : rangeStr(g);
    if (!editing) setBar(barText(sh.cells[k]));
    if (W.sync) W.sync.block = sh.id + '!' + k;
    refreshTools();
    showStats();
  }
  const barText = (cell) => (cell?.f ? cell.f : editText(cell, EN));
  function setBar(v) { fxIn.value = v; paintHl(fxHl, v); autoBar(); }
  /** Normal size: as tall as its text (up to 120px). Double and triple: a fixed height (CSS), scrolling inside. */
  function autoBar() { if (fxSize > 1) { fxIn.style.height = ''; return; } fxIn.style.height = 'auto'; fxIn.style.height = Math.min(120, fxIn.scrollHeight) + 'px'; }
  /** Sum, average and count of the selected cells, at the bottom. */
  function showStats() {
    let n = 0, cnt = 0, s = 0, mn = Infinity, mx = -Infinity, guard = 0;
    for (const g of grid.sel.ranges) {
      const r2 = Math.min(g.r2, ext.r), c2 = Math.min(g.c2, ext.c);
      for (let r = g.r1; r <= r2; r++) for (let c = g.c1; c <= c2; c++) { if (++guard > 300000) break; const v = eng.value(sh, key(r, c)); if (v === null || v === '') continue; cnt++; if (typeof v === 'number') { n++; s += v; mn = Math.min(mn, v); mx = Math.max(mx, v); } }
    }
    const one = grid.sel.ranges.length === 1 && cur().r1 === cur().r2 && cur().c1 === cur().c2;
    if (one || cnt < 2) return put(statsEl);
    const nf = styleAt(sh, grid.sel.r, grid.sel.c, sh.cells[key(grid.sel.r, grid.sel.c)]).nf, f = (v) => formatValue(v, nf && !/@/.test(nf) ? nf : '', L).text;
    const items = n ? [[t('st_sum'), f(s)], [t('st_avg'), f(s / n)], [t('st_count'), String(cnt)], [t('st_min'), f(mn)], [t('st_max'), f(mx)]] : [[t('st_count'), String(cnt)]];
    const pick = prefs().stat || 0, main = items[Math.min(pick, items.length - 1)];
    put(statsEl, drop(btn(h('span', main[0] + ': ', h('b', main[1])), { size: 'sm', appearance: 'ghost', caret: true }), items.map(([l, v], i) => [null, `${l}: ${v}`, () => { setPrefs({ stat: i }).catch(() => {}); showStats(); }, { check: i === pick }]), { placement: 'top-end' }));
  }
  function setSel(r, c, ext2) {
    r = Math.max(1, Math.min(MAX_ROWS, r)); c = Math.max(1, Math.min(MAX_COLS, c));
    if (ext2) { const a = act(); grid.sel = { ranges: [grid.grow({ r1: Math.min(a.r, r), c1: Math.min(a.c, c), r2: Math.max(a.r, r), c2: Math.max(a.c, c) })], r: a.r, c: a.c }; grid.sel.focus = { r, c }; }
    else { const m = mergeAt(sh, r, c); if (m) { r = m.r1; c = m.c1; } grid.sel = { ranges: [m || { r1: r, c1: c, r2: r, c2: c }], r, c }; }
    grid.overlay();
    grid.show(ext2 ? r : grid.sel.r, ext2 ? c : grid.sel.c);
    selected();
  }
  /** Ctrl+arrow: to the edge of the block of filled cells. */
  function jump(r, c, dr, dc) {
    const has = (rr, cc) => eng.value(sh, key(rr, cc)) !== null;
    const lim = (rr, cc) => rr >= 1 && cc >= 1 && rr <= Math.max(ext.r, 1) + 1 && cc <= Math.max(ext.c, 1) + 1;
    let rr = r + dr, cc = c + dc;
    if (!lim(rr, cc)) return [Math.max(1, dr < 0 ? 1 : dr > 0 ? Math.max(r, ext.r) : r), Math.max(1, dc < 0 ? 1 : dc > 0 ? Math.max(c, ext.c) : c)];
    if (has(r, c) && has(rr, cc)) { while (lim(rr + dr, cc + dc) && has(rr + dr, cc + dc)) { rr += dr; cc += dc; } return [rr, cc]; }
    while (lim(rr, cc) && !has(rr, cc)) { rr += dr; cc += dc; }
    if (!lim(rr, cc)) return [dr ? (dr < 0 ? 1 : Math.max(1, ext.r)) : r, dc ? (dc < 0 ? 1 : Math.max(1, ext.c)) : c];
    return [rr, cc];
  }
  /** Each selected cell, inside the part of the sheet in use (whole columns stop at the last row used). */
  function eachSel(fn, o = {}) {
    let n = 0;
    for (const g of grid.sel.ranges) {
      const r2 = Math.min(g.r2, FULLC(g) ? Math.max(ext.r, 1) : g.r2), c2 = Math.min(g.c2, FULLR(g) ? Math.max(ext.c, 1) : g.c2);
      for (let r = g.r1; r <= r2; r++) for (let c = g.c1; c <= c2; c++) { if (++n > (o.max || 500000)) return; if (!o.all && mm.get(r * 1000 + c) === 'covered') continue; fn(r, c); }
    }
  }
  nameBox.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') { if (e.key === 'Escape') { selected(); focusGrid(); } return; }
    e.preventDefault();
    let v = nameBox.value.trim().toUpperCase().replace(/\$/g, ''), target = sh;
    const m = /^(?:'?([^'!]+)'?!)?(.+)$/.exec(nameBox.value.trim());
    if (m?.[1]) { const s2 = book.sheets.find((s) => s.name.toLowerCase() === m[1].toLowerCase()); if (s2) { target = s2; v = m[2].toUpperCase().replace(/\$/g, ''); } }
    if (target !== sh) switchTo(target.id);
    const g = parseRange(v), cols = /^([A-Z]{1,2}):([A-Z]{1,2})$/.exec(v), rows = /^(\d+):(\d+)$/.exec(v);
    if (g) { grid.sel = { ranges: [g], r: g.r1, c: g.c1 }; grid.show(g.r1, g.c1); }
    else if (cols) { const a = colNumOf(cols[1]), b = colNumOf(cols[2]); grid.sel = { ranges: [{ r1: 1, r2: MAX_ROWS, c1: Math.min(a, b), c2: Math.max(a, b) }], r: 1, c: Math.min(a, b) }; grid.show(1, Math.min(a, b)); }
    else if (rows) { const a = +rows[1], b = +rows[2]; grid.sel = { ranges: [{ r1: Math.min(a, b), r2: Math.max(a, b), c1: 1, c2: MAX_COLS }], r: Math.min(a, b), c: 1 }; grid.show(Math.min(a, b), 1); }
    else { toast(t('bad_ref'), 'warning'); return; }
    grid.overlay();
    selected();
    focusGrid();
  });

  // ------------------------------------------------------------------ writing in a cell

  let editing = null; // {r, c, mode: 'enter' | 'edit', orig}
  const ce = h('div.celledit', { hidden: true }), ceHl = h('div.cehl', { 'aria-hidden': 'true' }), ceIn = h('textarea.cein', { spellcheck: 'false', autocomplete: 'off', 'aria-label': t('formula') });
  ce.append(ceHl, ceIn);
  const ac = h('div.acpop', { hidden: true, role: 'listbox' }), hint = h('div.sighint', { hidden: true });
  document.body.append(ac, hint);
  let point = null; // a reference being chosen with the mouse or the arrows: {start, end} in the text, {anchor, r, c}
  function startEdit(mode, text) {
    if (!editable || editing) return;
    const { r, c } = act(), cell = sh.cells[key(r, c)];
    if (!cellOk(sh, r, c)) { toast(t(sheetOk(sh) ? 'locked_cells' : 'sheet_ro'), 'warning'); return; }
    if (dvAt(r, c)?.k === 'check') return;
    editing = { r, c, mode, orig: barText(cell), sid: sh.id };
    const v = text !== undefined ? text : editing.orig;
    ceIn.value = v;
    fxIn.value = v;
    place();
    ce.hidden = false;
    frame.classList.add('editing');
    grid.editing = true;
    grid.overlay();
    paint();
    if (!fxFocus) { ceIn.focus({ preventScroll: true }); ceIn.setSelectionRange(v.length, v.length); }
    // the first letters typed on the grid open the editor: they already ask for suggestions (values of a dropdown, functions)
    if (text !== undefined && text !== '') complete(fxFocus ? fxIn : ceIn);
  }
  function place() {
    if (!editing) return;
    const { r, c } = editing, m = mm.get(r * 1000 + c), r2 = m?.r2 || r, c2 = m?.c2 || c, { p, x0, y0 } = grid.paneOf(r, c);
    if (ce.parentNode !== p) p.append(ce);
    const st = styleAt(sh, r, c, sh.cells[key(r, c)]);
    const left = grid.x(c) - x0, topY = grid.y(r) - y0, w = grid.x(c2 + 1) - grid.x(c), hh = grid.y(r2 + 1) - grid.y(r);
    Object.assign(ce.style, { left: left + 'px', top: topY + 'px', minWidth: w + 'px', minHeight: hh + 'px', fontSize: ((st.fz || book.settings.fontSize || 10) * 1.333 * z()) + 'px', fontFamily: st.ff ? FONT_STACK[st.ff] : '', fontWeight: st.b ? 700 : '', fontStyle: st.i ? 'italic' : '', textAlign: st.ha === 'c' ? 'center' : st.ha === 'r' ? 'right' : 'left', background: st.bg || '' });
    grow();
  }
  const meter = h('span.cemeter', { 'aria-hidden': 'true' });
  document.body.append(meter);
  function grow() {
    const cs = getComputedStyle(ceIn);
    meter.style.font = cs.font;
    meter.style.letterSpacing = cs.letterSpacing;
    meter.textContent = ceIn.value + '\u200b';
    const maxW = Math.max(160, wrap.clientWidth - 60), minW = parseFloat(ce.style.minWidth) - 4, minH = parseFloat(ce.style.minHeight) - 4;
    ceIn.style.width = Math.min(maxW, Math.max(minW, meter.offsetWidth + 14)) + 'px';
    ceIn.style.height = Math.max(minH, meter.offsetHeight + 4) + 'px';
  }
  let fxFocus = false;
  fxIn.addEventListener('focus', () => { fxFocus = true; if (!editing && editable) startEdit('edit'); });
  fxIn.addEventListener('blur', () => { fxFocus = false; });
  const sync = (from) => { const v = from.value; if (from === ceIn) fxIn.value = v; else ceIn.value = v; paint(); grow(); autoBar(); };
  ceIn.addEventListener('input', () => { point = null; sync(ceIn); complete(ceIn); });
  fxIn.addEventListener('input', () => { if (!editing) return; point = null; sync(fxIn); complete(fxIn); });
  for (const x of [ceIn, fxIn]) {
    x.addEventListener('keydown', (e) => editKey(e, x));
    x.addEventListener('keyup', () => { if (editing) { paint(); sigHint(x); } });
    x.addEventListener('click', () => { if (editing) { point = null; if (editing.mode === 'enter') editing.mode = 'edit'; sigHint(x); } });
  }
  /** The references of the formula, coloured in the text and on the grid. */
  function paint() {
    const v = ceIn.value;
    paintHl(ceHl, v);
    paintHl(fxHl, v);
    grid.marks = [];
    if (v[0] === '=') { let i = 0; for (const tk of safeTokens(v.slice(1))) if (tk.t === 'ref') { const r = tk.ref; if (!r.sheet || r.sheet.toLowerCase() === sh.name.toLowerCase()) grid.marks.push({ r1: Math.min(r.r1, r.r2), c1: Math.min(r.c1, r.c2), r2: Math.max(r.r1, r.r2), c2: Math.max(r.c1, r.c2), color: REFCOLORS[i % REFCOLORS.length] }); i++; } }
    grid.overlay();
  }
  const safeTokens = (s) => { try { return tokenize(s); } catch { return []; } };
  function paintHl(box, v) {
    if (v[0] !== '=') { box.textContent = ''; box.parentNode?.classList.remove('hl'); return; }
    let i = 0;
    const toks = safeTokens(v.slice(1));
    if (!toks.length && v.length > 1) { box.textContent = ''; box.parentNode?.classList.remove('hl'); return; }
    box.innerHTML = '=' + toks.map((tk) => (tk.t === 'ref' ? `<span style="color:${REFCOLORS[i++ % REFCOLORS.length]}">${esc(tk.src)}</span>` : tk.t === 'func' ? `<b>${esc(tk.src)}</b>` : tk.t === 'str' ? `<span class="s">${esc(tk.src)}</span>` : tk.t === 'num' ? `<span class="n">${esc(tk.src)}</span>` : esc(tk.src))).join('') + '​';
    box.parentNode?.classList.add('hl');
  }
  /** Writing a formula, a click on a cell (or an arrow) puts its reference where the caret is. */
  function pickable() {
    if (!editing) return false;
    const x = fxFocus ? fxIn : ceIn, v = x.value, at = x.selectionStart;
    if (v[0] !== '=') return false;
    if (point) return true;
    const before = v.slice(0, at).trimEnd();
    return /[=(,;+\-*/^&<>:]$/.test(before) && (editing.mode === 'enter' || at === v.length || /^[\s),;+\-*/^&<>]/.test(v.slice(at)));
  }
  function pickAt(a, b) {
    const x = fxFocus ? fxIn : ceIn;
    const g = { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) };
    const pre = sh.id !== editing.sid ? sheetRef(sh.name) + '!' : '';
    const ref = pre + (g.r1 === g.r2 && g.c1 === g.c2 ? key(g.r1, g.c1) : rangeStr(g));
    const v = x.value, start = point ? point.start : x.selectionStart, end = point ? point.end : x.selectionEnd;
    x.value = v.slice(0, start) + ref + v.slice(end);
    point = { start, end: start + ref.length, anchor: { r: a.r, c: a.c }, r: b.r, c: b.c };
    x.setSelectionRange(point.end, point.end);
    sync(x);
    x.focus({ preventScroll: true });
  }
  function editKey(e, x) {
    if (!editing) return;
    if (!ac.hidden) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); acMove(e.key === 'ArrowDown' ? 1 : -1); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.altKey)) {
        e.preventDefault();
        const value = acList[acI][1] === null;
        acPick(x);
        // a value of a dropdown is written at once, and the key moves on as usual
        if (value) { if (e.key === 'Tab') commit(0, e.shiftKey ? -1 : 1); else commit(e.shiftKey ? -1 : 1, 0); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); ac.hidden = true; return; }
    }
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && (e.altKey || (e.shiftKey && x === fxIn && false))) { e.preventDefault(); const s = x.selectionStart; x.setRangeText('\n', s, x.selectionEnd, 'end'); sync(x); return; }
    if (e.key === 'Enter') { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 0, false, mod); return; }
    if (e.key === 'Tab') { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); return; }
    if (e.key === 'F4') { e.preventDefault(); cycleAbs(x); return; }
    if (e.key === 'F2') { e.preventDefault(); editing.mode = editing.mode === 'edit' ? 'enter' : 'edit'; return; }
    if (e.key.startsWith('Arrow') && x === ceIn) {
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      if (pickable() && !mod) {
        e.preventDefault();
        const from = point ? { r: point.r, c: point.c } : { r: editing.r, c: editing.c }, to = { r: Math.max(1, from.r + d[0]), c: Math.max(1, from.c + d[1]) };
        pickAt(e.shiftKey && point ? point.anchor : to, to);
        grid.show(to.r, to.c);
        return;
      }
      if (editing.mode === 'enter') { e.preventDefault(); commit(d[0], d[1]); }
    }
  }
  /** F4: $A$1 → A$1 → $A1 → A1 on the reference at the caret. */
  function cycleAbs(x) {
    const v = x.value, at = x.selectionStart;
    let o = 1;
    for (const tk of safeTokens(v.slice(1))) {
      const s = o, e2 = o + tk.src.length;
      o = e2;
      if (tk.t !== 'ref' || at < s || at > e2) continue;
      const nx = tk.src.replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g, (m, a, c, b, r) => { const st = (a ? 2 : 0) + (b ? 1 : 0), n2 = { 0: 3, 3: 1, 1: 2, 2: 0 }[st]; return (n2 & 2 ? '$' : '') + c + (n2 & 1 ? '$' : '') + r; });
      x.value = v.slice(0, s) + nx + v.slice(e2);
      x.setSelectionRange(s + nx.length, s + nx.length);
      sync(x);
      return;
    }
  }
  // names of functions offered while typing
  let acList = [], acI = 0;
  function complete(x) {
    const v = x.value, at = x.selectionStart, m = /(^=|[=(,;+\-*/^&<> ])([A-Za-zÀ-ú][A-Za-z0-9.À-ú]*)$/.exec(v.slice(0, at));
    const dv = editing && v[0] !== '=' ? dvAt(editing.r, editing.c) : null;
    if (dv?.k === 'list' && dv.suggest !== false) { suggestValues(x, dv); return; }
    if (v[0] !== '=' || !m) { ac.hidden = true; sigHint(x); return; }
    const w = m[2].toUpperCase();
    acList = FUNCTIONS.map((f) => [f, f]).filter(([n]) => n.startsWith(w)).sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0])).slice(0, 8);
    if (!acList.length) { ac.hidden = true; return; }
    acI = 0;
    drawAc(x);
  }
  /** The values of a dropdown that hold what is being written (those that start with it first). Their f is null. */
  function suggestValues(x, dv) {
    const q = x.value.trim().toLowerCase();
    acList = q ? dv.list.filter((i) => i.toLowerCase().includes(q) && i.toLowerCase() !== q).sort((a, b) => (b.toLowerCase().startsWith(q) - a.toLowerCase().startsWith(q)) || a.localeCompare(b)).slice(0, 8).map((i) => [i, null]) : [];
    if (!acList.length) { ac.hidden = true; return; }
    acI = 0;
    drawAc(x);
  }
  function drawAc(x) {
    put(ac, acList.map(([n, f], i) => h('div.aci' + (i === acI ? '.on' : ''), { role: 'option', onpointerdown: (e) => { e.preventDefault(); acI = i; const value = f === null; acPick(x); if (value) commit(0, 0); } }, h('b', n), f ? h('small', desc(f, ui)) : null)));
    const r = x.getBoundingClientRect();
    ac.hidden = false;
    ac.style.left = Math.min(innerWidth - 300, r.left) + 'px';
    ac.style.top = (r.bottom + 4 + ac.offsetHeight > innerHeight ? r.top - ac.offsetHeight - 4 : r.bottom + 4) + 'px';
  }
  const acMove = (d) => { acI = (acI + d + acList.length) % acList.length; drawAc(fxFocus ? fxIn : ceIn); };
  function acPick(x) {
    // a value of a dropdown takes the place of what was written
    if (acList[acI][1] === null) { x.value = acList[acI][0]; x.setSelectionRange(x.value.length, x.value.length); ac.hidden = true; sync(x); return; }
    const [n] = acList[acI], v = x.value, at = x.selectionStart, m = /([A-Za-zÀ-ú][A-Za-z0-9.À-ú]*)$/.exec(v.slice(0, at));
    x.value = v.slice(0, at - m[1].length) + n + '(' + v.slice(at);
    const p = at - m[1].length + n.length + 1;
    x.setSelectionRange(p, p);
    ac.hidden = true;
    sync(x);
    sigHint(x);
  }
  /** The arguments of the function the caret is in. */
  function sigHint(x) {
    const v = x.value.slice(0, x.selectionStart);
    if (v[0] !== '=' || !editing) { hint.hidden = true; return; }
    let depth = 0, arg = 0, name = '';
    for (let i = v.length - 1; i >= 0; i--) {
      const ch = v[i];
      if (ch === ')') depth++;
      else if (ch === '(') { if (!depth) { name = /([A-Za-zÀ-ú][A-Za-z0-9.À-ú]*)$/.exec(v.slice(0, i))?.[1] || ''; break; } depth--; }
      else if ((ch === ',' || ch === ';') && !depth) arg++;
      else if (ch === '"') { const j = v.lastIndexOf('"', i - 1); if (j < 0) break; i = j; }
    }
    const en = name.toUpperCase(), sig = SIG[en];
    if (!name || !sig) { hint.hidden = true; return; }
    const shownName = en, sep = ', ';
    hint.innerHTML = `<b>${esc(shownName)}</b>(${sig.map((a, i) => (i === Math.min(arg, sig.length - 1) || (a.endsWith('…') && arg >= i) ? `<u>${esc(a)}</u>` : esc(a))).join(sep)})${desc(en, ui) ? `<small>${esc(desc(en, ui))}</small>` : ''}`;
    const r = x.getBoundingClientRect();
    hint.hidden = false;
    hint.style.left = Math.min(innerWidth - 360, r.left) + 'px';
    hint.style.top = Math.max(4, r.top - hint.offsetHeight - 6) + 'px';
  }
  function endEdit() {
    editing = null;
    point = null;
    ce.hidden = true;
    ac.hidden = true;
    hint.hidden = true;
    grid.editing = false;
    grid.marks = [];
    frame.classList.remove('editing');
    grid.overlay();
  }
  function cancelEdit(quiet) {
    if (!editing) return;
    const back = editing.sid !== sh.id ? editing.sid : null;
    endEdit();
    if (back) switchTo(back);
    if (!quiet) { setBar(barText(sh.cells[key(grid.sel.r, grid.sel.c)])); focusGrid(); }
  }
  /** What was typed goes into the cell (or into all the selected cells with Ctrl+Enter), then the selection moves. */
  /** "=ABS(E16" is written "=ABS(E16)": the brackets left open (outside quoted texts) are closed, nested ones too. */
  function closeBrackets(v) {
    if (v[0] !== '=') return v;
    let open = 0, q = false;
    for (const ch of v) { if (ch === '"') q = !q; else if (!q && ch === '(') open++; else if (!q && ch === ')') open = Math.max(0, open - 1); }
    return open && !q ? v.trimEnd() + ')'.repeat(open) : v;
  }
  function commit(dr, dc, stay, all) {
    if (!editing) return;
    const { r, c, sid } = editing, text = closeBrackets(ceIn.value);
    const home = book.sheets.find((s) => s.id === sid);
    endEdit();
    if (home && home !== sh) switchTo(sid, true);
    const m = {}, base = sh.cells[key(r, c)];
    const make = (rr, cc) => {
      const old = sh.cells[key(rr, cc)], stl = { ...(old?.s || {}) };
      let cell;
      if (text.trim() === '' && !text.includes('\n')) cell = Object.keys(stl).length ? { s: stl } : null;
      else if (text[0] === '=' && text.length > 1) cell = { f: canonical(text), ...(Object.keys(stl).length ? { s: stl } : {}) };
      else { cell = cellFrom(text, EN, book.settings.currency, stl); if (cell && cell.s?.nf && old?.s?.nf && !/General/.test(old.s.nf)) cell.s.nf = old.s.nf; }
      if (cell?.f && (rr !== r || cc !== c)) cell.f = moveFormula(cell.f, rr - r, cc - c);
      return cleanCell(cell);
    };
    if (all) eachSel((rr, cc) => { m[key(rr, cc)] = make(rr, cc); }, { max: 100000 });
    else m[key(r, c)] = make(r, c);
    // data validation: a strict rule refuses what does not fit
    const dv = dvAt(r, c), nv = m[key(r, c)];
    if (dv?.strict && nv && nv.v !== undefined && !nv.f && !dvOk(dv, nv.v)) { toast(t('dv_refused'), 'warning'); startEdit('edit', text); return; }
    const changed = Object.entries(m).some(([k, v]) => JSON.stringify(v) !== JSON.stringify(sh.cells[k] || null));
    if (changed) {
      change([{ t: 'cells', s: sh.id, m }], { keepEdit: true });
      // the result of a formula is kept with it, so pictures in the home and other programs see it
      const res = {};
      for (const [k, v] of Object.entries(m)) if (v?.f) { const x = eng.value(sh, k); if (x !== null && !isErr(x) && typeof x !== 'object' && JSON.stringify(x) !== JSON.stringify(v.v)) res[k] = { ...sh.cells[k], v: x }; }
      if (Object.keys(res).length) { for (const [k, v] of Object.entries(res)) sh.cells[k] = v; send([{ t: 'cells', s: sh.id, m: res }]); }
      void base;
    }
    if (!stay) {
      const g = cur(), inside = grid.sel.ranges.length === 1 && (g.r1 !== g.r2 || g.c1 !== g.c2) && !all;
      if (inside && (dr || dc)) moveInside(dr, dc); else if (dr || dc) setSel((mm.get(r * 1000 + c)?.r2 && dr > 0 ? mm.get(r * 1000 + c).r2 : r) + dr, (mm.get(r * 1000 + c)?.c2 && dc > 0 ? mm.get(r * 1000 + c).c2 : c) + dc);
      else selected();
      focusGrid();
    } else selected();
  }
  /** Enter and Tab inside a selection go round its cells. */
  function moveInside(dr, dc) {
    const g = cur();
    let { r, c } = grid.sel;
    if (dr) { r += dr; if (r > g.r2) { r = g.r1; c = c + 1 > g.c2 ? g.c1 : c + 1; } else if (r < g.r1) { r = g.r2; c = c - 1 < g.c1 ? g.c2 : c - 1; } }
    if (dc) { c += dc; if (c > g.c2) { c = g.c1; r = r + 1 > g.r2 ? g.r1 : r + 1; } else if (c < g.c1) { c = g.c2; r = r - 1 < g.r1 ? g.r2 : r - 1; } }
    grid.sel.r = r; grid.sel.c = c;
    grid.overlay();
    grid.show(r, c);
    selected();
  }

  // ------------------------------------------------------------------ the keyboard

  /** The next state of a checkbox: two states FALSE ⇄ TRUE · three FALSE → TRUE → indeterminate (no value) → FALSE.
   *  all: the other checkbox cells of the selection take the same state (Space on several of them). */
  function toggleCheck(r, c, all) {
    if (!cellOk(sh, r, c)) { toast(t(sheetOk(sh) ? 'locked_cells' : 'sheet_ro'), 'warning'); return; }
    const old = sh.cells[key(r, c)]?.v, tri = dvAt(r, c)?.tri, nv = tri ? (old === true ? null : old === false) : !(old === true);
    const put1 = (rr, cc) => {
      const cell = sh.cells[key(rr, cc)];
      if (nv === null) { const { v: _v, f: _f, ...rest } = cell || {}; return Object.keys(rest).length ? rest : null; }
      const { f: _f, ...rest } = cell || {};
      return { ...rest, v: nv };
    };
    const m = { [key(r, c)]: put1(r, c) };
    if (all) eachSel((rr, cc) => { if (dvAt(rr, cc)?.k === 'check' && cellOk(sh, rr, cc)) m[key(rr, cc)] = put1(rr, cc); }, { max: 5000 });
    change([{ t: 'cells', s: sh.id, m }]);
  }
  const onKey = (e, force) => {
    if (editing || (!force && e.target !== wrap && e.target !== sink) || e.isComposing) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key, { r, c } = grid.sel.focus && e.shiftKey ? grid.sel.focus : act();
    if (k === ' ' && !mod && !e.shiftKey && !e.altKey && editable && dvAt(r, c)?.k === 'check') { e.preventDefault(); toggleCheck(r, c, true); return; }
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[k]) {
      e.preventDefault();
      const [dr, dc] = arrows[k];
      if (mod) { const [rr, cc] = jump(r, c, dr, dc); setSel(rr, cc, e.shiftKey); return; }
      const m = mm.get(r * 1000 + c);
      setSel(r + (dr > 0 && m?.r2 ? m.r2 - r + 1 : dr), c + (dc > 0 && m?.c2 ? m.c2 - c + 1 : dc), e.shiftKey);
      return;
    }
    if (k === 'Enter') { e.preventDefault(); const g = cur(); if (grid.sel.ranges.length === 1 && (g.r1 !== g.r2 || g.c1 !== g.c2)) moveInside(e.shiftKey ? -1 : 1, 0); else setSel(r + (e.shiftKey ? -1 : 1), c); return; }
    if (k === 'Tab') { e.preventDefault(); const g = cur(); if (grid.sel.ranges.length === 1 && (g.r1 !== g.r2 || g.c1 !== g.c2)) moveInside(0, e.shiftKey ? -1 : 1); else setSel(r, c + (e.shiftKey ? -1 : 1)); return; }
    if (k === 'Home') { e.preventDefault(); setSel(mod ? 1 : r, 1, e.shiftKey); return; }
    if (k === 'End' && mod) { e.preventDefault(); setSel(Math.max(1, ext.r), Math.max(1, ext.c), e.shiftKey); return; }
    if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); if (mod) { const vis = book.sheets.filter((s) => !s.hidden), i = vis.indexOf(sh); const n2 = vis[(i + (k === 'PageDown' ? 1 : -1) + vis.length) % vis.length]; switchTo(n2.id); return; } setSel(r + (k === 'PageDown' ? 1 : -1) * grid.page(), c, e.shiftKey); return; }
    if (k === 'F2') { e.preventDefault(); startEdit('edit'); return; }
    if (k === 'Escape') { if (grid.copyBox) { grid.copyBox = null; clip = null; grid.overlay(); } return; }
    if ((k === 'Delete' || k === 'Backspace') && !mod) { e.preventDefault(); clearSel('values'); return; }
    if (mod && !e.altKey) {
      const lk = k.toLowerCase();
      if (lk === 'z') { e.preventDefault(); undo(e.shiftKey); return; }
      if (lk === 'y') { e.preventDefault(); undo(true); return; }
      if (lk === 'b') { e.preventDefault(); toggleStyle('b'); return; }
      if (lk === 'i') { e.preventDefault(); toggleStyle('i'); return; }
      if (lk === 'u') { e.preventDefault(); toggleStyle('u'); return; }
      if (lk === '5') { e.preventDefault(); toggleStyle('k'); return; }
      if (lk === '1') { e.preventDefault(); formatDialog(); return; }
      if (lk === 'a') { e.preventDefault(); const g = region(sh, r, c); const g0 = cur(); if (g.r1 === g.r2 && g.c1 === g.c2 || (g0.r1 === g.r1 && g0.r2 === g.r2 && g0.c1 === g.c1 && g0.c2 === g.c2)) grid.select({ ranges: [{ r1: 1, c1: 1, r2: MAX_ROWS, c2: MAX_COLS }], r: 1, c: 1 }, 'all'); else grid.select({ ranges: [g], r, c }, 'all'); return; }
      if (lk === 'd') { e.preventDefault(); const g = cur(); if (g.r2 > g.r1) doFill({ ...g, r2: g.r1 }, g); return; }
      if (lk === 'r') { e.preventDefault(); const g = cur(); if (g.c2 > g.c1) doFill({ ...g, c2: g.c1 }, g); return; }
      if (k === ';' || k === ',' && false) { e.preventDefault(); writeHere(e.shiftKey ? { v: nowSerial() % 1, s: { nf: 'hh:mm' } } : { v: todaySerial(), s: { nf: presets(lang)[9][1] } }); return; }
      if (k === ':') { e.preventDefault(); writeHere({ v: nowSerial() % 1, s: { nf: 'hh:mm' } }); return; }
      if (lk === 'f' || lk === 'h') { e.preventDefault(); setTab('find', true); return; }
      if (lk === 'p') { e.preventDefault(); if (!lim.noDownload) printSheet(); return; }
      if (lk === 's') { e.preventDefault(); if (isLocal) saveLocal(); else W.sync?.flush(); return; }
      if (lk === 'l' && e.shiftKey) { e.preventDefault(); toggleFilter(); return; }
      if (k === ' ') { e.preventDefault(); grid.select({ ranges: [{ r1: 1, r2: MAX_ROWS, c1: cur().c1, c2: cur().c2 }], r: 1, c }, 'col'); return; }
      if (k === '+' || k === '=') { e.preventDefault(); insertCells(); return; }
      if (k === '-') { e.preventDefault(); deleteCells(); return; }
      if (k === 'Enter') return;
    }
    if (e.shiftKey && k === ' ' && !mod) { e.preventDefault(); grid.select({ ranges: [{ r1: cur().r1, r2: cur().r2, c1: 1, c2: MAX_COLS }], r, c: 1 }, 'row'); return; }
    if (e.altKey && (k === '=' || e.code === 'Equal')) { e.preventDefault(); autosum('SUM'); return; }
    if (e.ctrlKey && e.altKey && e.code === 'KeyM' && W.canComment) { e.preventDefault(); startComment(); return; }
    if (e.shiftKey && k === 'F11') { e.preventDefault(); addSheet(); return; }
    // typing writes in the cell: the key reaches the editor that opens now
    if (k.length === 1 && !mod && !e.altKey && editable) { startEdit('enter', ''); return; }
  };
  // dropdown arrows shown "only on hover": the one of the cell under the mouse and the one of the cell in use.
  // A rule in a <style>, so it holds while the cells are drawn again.
  const dvHoverCss = h('style');
  document.head.append(dvHoverCss);
  let dvHover = null, dvRaf = 0;
  const dvShow = () => { const at = (cls, r, c) => `.t .dvb.${cls}[data-r="${r}"][data-c="${c}"]`, { r, c } = grid.sel; dvHoverCss.textContent = [dvHover ? at('hov', ...dvHover) : '', at('hov', r, c), at('sel', r, c)].filter(Boolean).join(',') + '{opacity:.55}'; };
  wrap.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' || dvRaf) return; dvRaf = requestAnimationFrame(() => { dvRaf = 0; const x = grid.hit(e.clientX, e.clientY), m = mm.get(x.r * 1000 + x.c); let at = x.r && x.c ? [x.r, x.c] : null; if (m === 'covered') for (const g of mlist) if (x.r >= g.r1 && x.r <= g.r2 && x.c >= g.c1 && x.c <= g.c2) at = [g.r1, g.c1]; if (String(at) !== String(dvHover)) { dvHover = at; dvShow(); } }); });
  wrap.addEventListener('pointerleave', () => { dvHover = null; dvShow(); });
  W.dvShow = dvShow; // selected() runs it too: the arrow of the cell in use shows (also with the keyboard)
  wrap.addEventListener('keydown', onKey);
  sink.addEventListener('keydown', onKey);
  // after a menu or a button the focus is on the page: the keys of the grid still work
  const docKey = (e) => { if ((e.target === document.body || e.target === document.documentElement) && !editing && !document.querySelector('sav-dialog[open], sav-dropdown[open], sav-popover[open]')) { focusGrid(); onKey(e, true); } };
  addEventListener('keydown', docKey);
  const writeHere = (cell) => { const { r, c } = act(), old = sh.cells[key(r, c)]; change([{ t: 'cells', s: sh.id, m: { [key(r, c)]: { ...old, ...cell, s: { ...(old?.s || {}), ...cell.s } } } }]); };

  // ------------------------------------------------------------------ the clipboard

  let clip = null; // {sid, g, cells, cut, tsv}
  function selText() {
    const g = cur(), r2 = Math.min(g.r2, Math.max(ext.r, g.r1)), c2 = Math.min(g.c2, Math.max(ext.c, g.c1)), rows = [], html = [], cells = {};
    for (let r = g.r1; r <= r2; r++) {
      if (filtered.has(r)) continue;
      const tr = [], hr = [];
      for (let c = g.c1; c <= c2; c++) {
        const k = key(r, c), cell = sh.cells[k], v = eng.value(sh, k), st = styleAt(sh, r, c, cell);
        const tx = v === null ? '' : typeof v === 'number' && (!st.nf || /^(0|#)/.test(st.nf)) && !st.nf?.includes('%') ? formatValue(v, st.nf || '', L).text : formatValue(v, st.nf, L).text;
        tr.push(tx);
        hr.push({ text: tx, css: [st.b ? 'font-weight:bold' : '', st.i ? 'font-style:italic' : '', st.c ? 'color:' + st.c : '', st.bg ? 'background:' + st.bg : '', st.ha ? 'text-align:' + { l: 'left', c: 'center', r: 'right' }[st.ha] : ''].filter(Boolean).join(';') });
        if (cell) cells[(r - g.r1) + ',' + (c - g.c1)] = cell;
        else if (eng.spilledAt(sh, k)) cells[(r - g.r1) + ',' + (c - g.c1)] = { v };
      }
      rows.push(tr);
      html.push(hr);
    }
    return { g: { ...g, r2, c2 }, rows, html, cells };
  }
  function onCopy(e, cut) {
    if (editing || !gridFocused()) return;
    if (lim.noCopy) { e.preventDefault(); toast(t('no_copy'), 'warning'); return; }
    e.preventDefault();
    const x = selText(), tsv = toTsv(x.rows);
    e.clipboardData.setData('text/plain', tsv);
    e.clipboardData.setData('text/html', toHtml(x.html));
    clip = { sid: sh.id, g: x.g, cells: x.cells, cut: cut && editable, tsv };
    grid.copyBox = x.g;
    grid.overlay();
    toast(t(cut ? 'cut_done' : 'copied_cells'), 'neutral', { duration: 1600 });
  }
  function onPaste(e) {
    if (editing || !gridFocused() || !editable) return;
    e.preventDefault();
    const tsv = e.clipboardData.getData('text/plain'), html = e.clipboardData.getData('text/html');
    paste({ tsv, html }, e.shiftKey ? 'values' : '');
  }
  document.addEventListener('copy', onCopy);
  const onCut = (e) => onCopy(e, true);
  document.addEventListener('cut', onCut);
  document.addEventListener('paste', onPaste);
  /** Pastes what was copied here (formulas move, looks stay) or text of another program. how: '' | values | formats */
  function paste({ tsv, html }, how = '') {
    const { r, c } = act(), m = {}, g0 = cur();
    let ops = [];
    if (clip && tsv.replace(/\r/g, '') === clip.tsv.replace(/\r/g, '')) {
      const src = book.sheets.find((s) => s.id === clip.sid), R = clip.g.r2 - clip.g.r1 + 1, C = clip.g.c2 - clip.g.c1 + 1;
      // one cell copied into a bigger selection fills it all
      const tr = g0.r2 - g0.r1 + 1 >= R && (g0.r2 - g0.r1 + 1) % R === 0 && g0.r2 < MAX_ROWS ? (g0.r2 - g0.r1 + 1) / R : 1, tc = g0.c2 - g0.c1 + 1 >= C && (g0.c2 - g0.c1 + 1) % C === 0 && g0.c2 < MAX_COLS ? (g0.c2 - g0.c1 + 1) / C : 1;
      const r0 = tr > 1 || tc > 1 ? g0.r1 : r, c0 = tr > 1 || tc > 1 ? g0.c1 : c;
      for (let a = 0; a < tr; a++) for (let b = 0; b < tc; b++) for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
        const rr = r0 + a * R + i, cc = c0 + b * C + j, cell = clip.cells[i + ',' + j] || null, old = sh.cells[key(rr, cc)];
        if (rr > MAX_ROWS || cc > MAX_COLS) continue;
        let n2;
        if (how === 'values') { const v = src ? eng.value(src, key(clip.g.r1 + i, clip.g.c1 + j)) : cell?.v; n2 = v === null || isErr(v) ? (old?.s ? { s: old.s } : null) : { v, ...(old?.s || cell?.s ? { s: { ...(old?.s || {}), ...(cell?.s?.nf ? { nf: cell.s.nf } : {}) } } : {}) }; }
        else if (how === 'formats') n2 = cell?.s ? { ...(old || {}), s: cell.s } : old ? { ...old, s: undefined } : null;
        else n2 = cell ? (cell.f ? { ...cell, f: clip.cut ? cell.f : moveFormula(cell.f, rr - (clip.g.r1 + i), cc - (clip.g.c1 + j)) } : { ...cell }) : null;
        m[key(rr, cc)] = cleanCell(n2);
      }
      if (clip.cut && how === '') {
        const cutM = {};
        for (let i = clip.g.r1; i <= clip.g.r2; i++) for (let j = clip.g.c1; j <= clip.g.c2; j++) { const k = key(i, j); if (!(clip.sid === sh.id && k in m)) cutM[k] = null; }
        if (Object.keys(cutM).length) ops.push({ t: 'cells', s: clip.sid, m: cutM });
        clip = null;
        grid.copyBox = null;
      }
      grid.sel = { ranges: [{ r1: r0, c1: c0, r2: Math.min(MAX_ROWS, r0 + R * tr - 1), c2: Math.min(MAX_COLS, c0 + C * tc - 1) }], r: r0, c: c0 };
    } else {
      // from another program: an HTML table keeps bold and colours, otherwise tab-separated text
      const t2 = html && fromHtml(html), rows = t2 ? t2.rows : fromTsv(tsv).map((row) => row.map((text) => ({ text, s: {} })));
      if (!rows.length || (rows.length === 1 && rows[0].length === 1 && !rows[0][0].text && !tsv)) return;
      if (rows.length * rows[0].length > 400000) { toast(t('too_big'), 'warning'); return; }
      rows.forEach((row, i) => row.forEach((x, j) => {
        const rr = r + i, cc = c + j, old = sh.cells[key(rr, cc)];
        if (rr > MAX_ROWS || cc > MAX_COLS) return;
        m[key(rr, cc)] = cleanCell(how === 'formats' ? { ...(old || {}), s: x.s } : cellFrom(String(x.text ?? '').replace(/\r/g, ''), [EN, L], book.settings.currency, how === 'values' ? old?.s || {} : { ...(old?.s || {}), ...x.s }));
      }));
      grid.sel = { ranges: [{ r1: r, c1: c, r2: Math.min(MAX_ROWS, r + rows.length - 1), c2: Math.min(MAX_COLS, c + rows[0].length - 1) }], r, c };
    }
    ops = [{ t: 'cells', s: sh.id, m }, ...ops];
    change(ops);
  }
  W.pasteFrom = async (how) => {
    try {
      const items = await navigator.clipboard.read?.();
      let tsv = '', html = '';
      if (items) for (const it of items) { if (it.types.includes('text/html')) html = await (await it.getType('text/html')).text(); if (it.types.includes('text/plain')) tsv = await (await it.getType('text/plain')).text(); }
      else tsv = await navigator.clipboard.readText();
      paste({ tsv, html }, how);
    } catch { toast(t('paste_keys', { k: K('Mod+V') }), 'neutral'); }
  };

  // ------------------------------------------------------------------ commands on cells

  /** Changes the look of the selected cells: whole columns and rows keep it as theirs. */
  function styleSel(patch, o = {}) {
    if (!editable) return;
    const m = {}, cols = { ...sh.cols }, rows = { ...sh.rows };
    let colsChanged = false, rowsChanged = false;
    const merge = (s) => { const n = { ...(s || {}) }; for (const [k, v] of Object.entries(typeof patch === 'function' ? patch(s || {}) : patch)) { if (v === null || v === undefined || v === false || v === '') delete n[k]; else n[k] = v; } return n; };
    for (const g of grid.sel.ranges) {
      if (FULLC(g) && !FULLR(g)) { for (let c = g.c1; c <= g.c2; c++) { const k = colName(c), x = { ...(cols[k] || {}) }; x.s = merge(x.s); if (!Object.keys(x.s).length) delete x.s; cols[k] = x; } colsChanged = true; }
      else if (FULLR(g) && !FULLC(g)) { for (let r = g.r1; r <= g.r2; r++) { const x = { ...(rows[r] || {}) }; x.s = merge(x.s); if (!Object.keys(x.s).length) delete x.s; rows[r] = x; } rowsChanged = true; }
    }
    // the cells inside keep their own look, changed the same way
    eachSel((r, c) => {
      const k = key(r, c), old = sh.cells[k];
      const g = grid.sel.ranges.find((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2);
      if (!old && (FULLC(g) || FULLR(g))) return;
      m[k] = cleanCell({ ...(old || {}), s: merge(old?.s) });
    }, { max: 300000 });
    const ops = [];
    if (Object.keys(m).length) ops.push({ t: 'cells', s: sh.id, m });
    if (colsChanged || rowsChanged) ops.push({ t: 'sheet', id: sh.id, p: { ...(colsChanged ? { cols } : {}), ...(rowsChanged ? { rows } : {}) } });
    change(ops);
    if (!o.keep) focusGrid();
  }
  const curStyle = () => styleAt(sh, grid.sel.r, grid.sel.c, sh.cells[key(grid.sel.r, grid.sel.c)]);
  function toggleStyle(k) { const on = !curStyle()[k]; styleSel({ [k]: on ? 1 : null }); }
  function clearSel(what) {
    const m = {};
    eachSel((r, c) => {
      const k = key(r, c), old = sh.cells[k];
      if (!old) return;
      if (what === 'all') m[k] = null;
      else if (what === 'formats') m[k] = cleanCell({ v: old.v, f: old.f });
      else m[k] = old.s ? { s: old.s } : null;
    }, { all: true });
    const ops = Object.keys(m).length ? [{ t: 'cells', s: sh.id, m }] : [];
    if (what !== 'values') {
      // whole columns and rows lose their look too
      const cols = { ...sh.cols }, rows = { ...sh.rows };
      let any = false;
      for (const g of grid.sel.ranges) { if (FULLC(g)) for (let c = g.c1; c <= Math.min(g.c2, MAX_COLS); c++) { const x = cols[colName(c)]; if (x?.s) { cols[colName(c)] = { ...x }; delete cols[colName(c)].s; any = true; } } if (FULLR(g)) for (let r = g.r1; r <= Math.min(g.r2, ext.r + 1000); r++) { const x = rows[r]; if (x?.s) { rows[r] = { ...x }; delete rows[r].s; any = true; } } }
      if (any) ops.push({ t: 'sheet', id: sh.id, p: { cols, rows } });
    }
    change(ops);
  }
  function setBorders(kind, line = 'thin', color = '#1c1c1c') {
    const b = line + ' ' + color, m = {};
    for (const g of grid.sel.ranges) {
      const r2 = Math.min(g.r2, Math.max(ext.r, g.r1)), c2 = Math.min(g.c2, Math.max(ext.c, g.c1));
      for (let r = g.r1; r <= r2; r++) for (let c = g.c1; c <= c2; c++) {
        const k = key(r, c), old = m[k] || sh.cells[k] || {}, s = { ...(old.s || {}) };
        const top = r === g.r1, bot = r === r2, lef = c === g.c1, rig = c === c2;
        const set = (x, on) => { if (on) s[x] = b; };
        if (kind === 'none') { delete s.bt; delete s.bb; delete s.bl; delete s.br; }
        if (kind === 'all') { set('bt', 1); set('bb', 1); set('bl', 1); set('br', 1); }
        if (kind === 'outer') { set('bt', top); set('bb', bot); set('bl', lef); set('br', rig); }
        if (kind === 'inner') { set('bb', !bot); set('br', !rig); }
        if (kind === 'top') set('bt', top);
        if (kind === 'bottom') set('bb', bot);
        if (kind === 'left') set('bl', lef);
        if (kind === 'right') set('br', rig);
        if (kind === 'horiz') set('bb', !bot);
        if (kind === 'vert') set('br', !rig);
        m[k] = cleanCell({ ...old, s });
      }
    }
    change([{ t: 'cells', s: sh.id, m }]);
  }
  async function mergeSel(how = 'all') {
    const g = cur();
    if (g.r1 === g.r2 && g.c1 === g.c2) return;
    if (FULLC(g) || FULLR(g) || (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1) > 200000) { toast(t('merge_big'), 'warning'); return; }
    const parts = how === 'rows' ? Array.from({ length: g.r2 - g.r1 + 1 }, (_, i) => ({ ...g, r1: g.r1 + i, r2: g.r1 + i })) : how === 'cols' ? Array.from({ length: g.c2 - g.c1 + 1 }, (_, i) => ({ ...g, c1: g.c1 + i, c2: g.c1 + i })) : [g];
    let lost = false;
    const m = {};
    for (const p of parts) for (let r = p.r1; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) if ((r !== p.r1 || c !== p.c1) && sh.cells[key(r, c)]) { if (sh.cells[key(r, c)].v !== undefined || sh.cells[key(r, c)].f) lost = true; m[key(r, c)] = null; }
    if (lost && !(await confirm(t('merge'), t('merge_lost'), t('merge')))) return;
    const keepOut = sh.merges.filter((x) => { const q = parseRange(x); return !(q.r1 <= g.r2 && q.r2 >= g.r1 && q.c1 <= g.c2 && q.c2 >= g.c1); });
    const ops = [{ t: 'sheet', id: sh.id, p: { merges: [...keepOut, ...parts.filter((p) => p.r1 !== p.r2 || p.c1 !== p.c2).map(rangeStr)] } }];
    if (Object.keys(m).length) ops.push({ t: 'cells', s: sh.id, m });
    change(ops);
  }
  function unmergeSel() { const g = cur(); change([{ t: 'sheet', id: sh.id, p: { merges: sh.merges.filter((x) => { const q = parseRange(x); return !(q.r1 <= g.r2 && q.r2 >= g.r1 && q.c1 <= g.c2 && q.c2 >= g.c1); }) } }]); }
  function setSizes(axis, list, size) {
    const k = axis === 'c' ? 'cols' : 'rows', map = { ...sh[k] };
    for (const i of list) { const id = axis === 'c' ? colName(i) : String(i); map[id] = { ...(map[id] || {}), [axis === 'c' ? 'w' : 'h']: size }; }
    change([{ t: 'sheet', id: sh.id, p: { [k]: map } }]);
  }
  /** Columns as wide as their longest text; rows as high as their text. */
  function autofit(axis, list) {
    const cv = document.createElement('canvas').getContext('2d'), map = { ...sh[axis === 'c' ? 'cols' : 'rows'] };
    for (const i of list) {
      let best = axis === 'c' ? 30 : DEF_H;
      if (axis === 'c') {
        for (let r = 1; r <= ext.r; r++) {
          const k = key(r, i), v = eng.value(sh, k);
          if (v === null || mm.get(r * 1000 + i)) continue;
          const st = styleAt(sh, r, i, sh.cells[k]);
          cv.font = `${st.i ? 'italic ' : ''}${st.b ? 700 : 400} ${(st.fz || book.settings.fontSize || 10) * 1.333}px ${FONT_STACK[st.ff || 'sans']}`;
          for (const line of formatValue(v, st.nf, L).text.split('\n')) best = Math.max(best, cv.measureText(line).width + 14 + (st.ind || 0) * 10);
        }
        map[colName(i)] = { ...(map[colName(i)] || {}), w: Math.min(800, Math.ceil(best)) };
      } else {
        const x = { ...(map[i] || {}) };
        delete x.h;
        map[i] = x;
      }
    }
    change([{ t: 'sheet', id: sh.id, p: { [axis === 'c' ? 'cols' : 'rows']: map } }]);
  }
  function hideSel(axis, on = true) {
    const k = axis === 'c' ? 'cols' : 'rows', map = { ...sh[k] }, g = cur();
    for (let i = axis === 'c' ? g.c1 : g.r1; i <= Math.min(axis === 'c' ? g.c2 : g.r2, axis === 'c' ? MAX_COLS : ext.r + 1000); i++) { const id = axis === 'c' ? colName(i) : String(i), x = { ...(map[id] || {}) }; if (on) x.x = 1; else delete x.x; map[id] = x; }
    change([{ t: 'sheet', id: sh.id, p: { [k]: map } }]);
  }
  function unhide(axis, i) {
    const k = axis === 'c' ? 'cols' : 'rows', map = { ...sh[k] };
    for (let j = i; j >= 1; j--) { const id = axis === 'c' ? colName(j) : String(j); if (!map[id]?.x) { if (j < i) break; continue; } const x = { ...map[id] }; delete x.x; map[id] = x; }
    for (let j = i; ; j++) { const id = axis === 'c' ? colName(j) : String(j); if (!map[id]?.x) break; const x = { ...map[id] }; delete x.x; map[id] = x; }
    change([{ t: 'sheet', id: sh.id, p: { [k]: map } }]);
  }
  /** Rows (or columns) added before/after the selection: as many as are selected. */
  function insert(axis, after) {
    const g = cur(), n = axis === 'r' ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1, at = axis === 'r' ? (after ? g.r2 + 1 : g.r1) : after ? g.c2 + 1 : g.c1;
    if (n > 5000 && !FULLC(g) && !FULLR(g)) return;
    change(shiftOps(book, sh.id, axis, at, Math.min(n, axis === 'r' ? 5000 : 100)));
  }
  async function remove(axis) {
    const g = cur(), n = axis === 'r' ? Math.min(g.r2, Math.max(ext.r, g.r1)) - g.r1 + 1 : Math.min(g.c2, Math.max(ext.c, g.c1)) - g.c1 + 1, at = axis === 'r' ? g.r1 : g.c1;
    change(shiftOps(book, sh.id, axis, at, -n));
    setSel(axis === 'r' ? g.r1 : grid.sel.r, axis === 'c' ? g.c1 : grid.sel.c);
  }
  function insertCells() { const g = cur(); if (FULLR(g)) insert('r', false); else if (FULLC(g)) insert('c', false); else cellMenu(innerWidth / 2, innerHeight / 2, { r: g.r1, c: g.c1, head: '', insertOnly: true }); }
  function deleteCells() { const g = cur(); if (FULLR(g)) remove('r'); else if (FULLC(g)) remove('c'); else cellMenu(innerWidth / 2, innerHeight / 2, { r: g.r1, c: g.c1, head: '', deleteOnly: true }); }
  function doFill(from, to) {
    const m = fill(sh, from, to, lang);
    for (const k in m) m[k] = cleanCell(m[k]);
    change([{ t: 'cells', s: sh.id, m }]);
    grid.sel = { ranges: [to], r: grid.sel.r, c: grid.sel.c };
    grid.overlay();
    selected();
  }
  async function sortSel(desc, o = {}) {
    let g = cur();
    if (g.r1 === g.r2 && g.c1 === g.c2) g = tableAt(sh, g.r1, g.c1);
    if (FULLC(g)) g = { ...g, r1: 1, r2: Math.max(1, ext.r) };
    if (FULLR(g)) g = { ...g, c2: Math.max(1, ext.c) };
    const head = o.head ?? (g.r2 > g.r1 && [...Array(g.c2 - g.c1 + 1)].every((_, j) => typeof eng.value(sh, key(g.r1, g.c1 + j)) === 'string') && [...Array(g.c2 - g.c1 + 1)].some((_, j) => typeof eng.value(sh, key(g.r1 + 1, g.c1 + j)) === 'number'));
    const keys = o.keys || [{ c: Math.max(g.c1, Math.min(g.c2, grid.sel.c)), desc }];
    if (g.r2 - g.r1 > 100000) return;
    const m = sortRange(sh, g, keys, (r, c) => eng.value(sh, key(r, c)), head);
    for (const k in m) m[k] = cleanCell(m[k]);
    change([{ t: 'cells', s: sh.id, m }]);
  }
  function autosum(fn) {
    const g = cur();
    let { r, c } = act();
    // a selection of numbers: the result goes below each column
    if (g.r2 > g.r1 && !FULLC(g)) { const m = {}; for (let cc = g.c1; cc <= g.c2; cc++) m[key(g.r2 + 1, cc)] = { f: `=${fn}(${key(g.r1, cc)}:${key(g.r2, cc)})`, s: sh.cells[key(g.r2, cc)]?.s?.nf ? { nf: sh.cells[key(g.r2, cc)].s.nf } : undefined }; for (const k in m) m[k] = cleanCell(m[k]); change([{ t: 'cells', s: sh.id, m }]); return; }
    // the numbers right above (or on the left)
    let r1 = r - 1;
    while (r1 >= 1 && typeof eng.value(sh, key(r1, c)) === 'number') r1--;
    let txt;
    if (r1 < r - 1) txt = `=${fn}(${key(r1 + 1, c)}:${key(r - 1, c)})`;
    else { let c1 = c - 1; while (c1 >= 1 && typeof eng.value(sh, key(r, c1)) === 'number') c1--; txt = c1 < c - 1 ? `=${fn}(${key(r, c1 + 1)}:${key(r, c - 1)})` : `=${fn}()`; }
    startEdit('edit', txt);
    if (txt.endsWith('()')) { ceIn.setSelectionRange(ceIn.value.length - 1, ceIn.value.length - 1); point = null; }
  }
  // ---------------------------------------------------------------- filters
  function toggleFilter() {
    if (sh.filter) { change([{ t: 'sheet', id: sh.id, p: { filter: null } }]); return; }
    let g = cur();
    // a whole column: the table it holds; one cell: the table it is in; more cells: just those
    if (FULLC(g)) { let last = Math.max(1, ext.r); while (last > 1 && !shown(last, g.c1)) last--; const t0 = tableAt(sh, last, g.c1); g = { ...t0, c1: Math.min(t0.c1, g.c1), c2: Math.max(t0.c2, g.c2) }; } else if (g.r1 === g.r2 && g.c1 === g.c2) g = tableAt(sh, g.r1, g.c1);
    if (g.r2 <= g.r1) g = { ...g, r2: Math.max(g.r1 + 1, ext.r) };
    change([{ t: 'sheet', id: sh.id, p: { filter: { r: rangeStr({ ...g, c2: Math.min(g.c2, Math.max(ext.c, g.c1)) }), h: {} } } }]);
  }
  function filterPop(c, anchor) {
    const f = sh.filter, g = parseRange(f.r), col = colName(c), hidden = new Set(f.h?.[col] || []), vals = new Map();
    for (let r = g.r1 + 1; r <= Math.min(g.r2, MAX_ROWS); r++) { const tx = shown(r, c); vals.set(tx, (vals.get(tx) || 0) + 1); }
    const list = [...vals.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true })));
    const q = h('sav-input', { type: 'search', size: 'sm', placeholder: t('search'), clearable: true });
    const box = h('div.flist');
    const checks = list.map((v) => { const x = h('sav-checkbox', { size: 'sm', checked: !hidden.has(v) || null, 'data-v': v }, v === '' ? t('blanks') : v, h('small', ' ' + vals.get(v))); return x; });
    const paint = () => { const s = (q.value || '').toLowerCase(); put(box, checks.filter((x) => x.dataset.v.toLowerCase().includes(s))); };
    q.addEventListener('input', paint);
    q.addEventListener('keydown', (e) => e.stopPropagation());
    paint();
    const apply = (extra = {}) => { const hide = checks.filter((x) => !x.checked).map((x) => x.dataset.v); change([{ t: 'sheet', id: sh.id, p: { filter: { ...f, h: { ...f.h, [col]: hide }, ...extra } } }]); d.hide(); };
    const sortBy = (desc) => { apply({ sort: col, desc }); const g2 = parseRange(f.r); grid.sel = { ranges: [g2], r: g2.r1, c: c }; sortSel(desc, { head: true, keys: [{ c, desc }] }); };
    const d = dialog({ title: t('filter_col', { c: col }), width: '22rem', body: h('div.form', h('div.prow', btn(t('sort_az'), { size: 'sm', icon: 'arrow-down-a-z', onclick: () => sortBy(false) }), btn(t('sort_za'), { size: 'sm', icon: 'arrow-down-z-a', onclick: () => sortBy(true) })), q, h('div.prow', btn(t('select_all'), { size: 'sm', appearance: 'ghost', onclick: () => checks.forEach((x) => { x.checked = true; }) }), btn(t('select_none'), { size: 'sm', appearance: 'ghost', onclick: () => checks.forEach((x) => { x.checked = false; }) })), box),
      actions: [{ label: t('cancel') }, { label: t('apply'), primary: true, run: () => { apply(); return false; } }] });
    void anchor;
  }
  function listPop(r, c, anchor) {
    const dv = dvAt(r, c);
    if (!dv) return;
    grid.sel = { ranges: [{ r1: r, c1: c, r2: r, c2: c }], r, c };
    grid.overlay();
    selected();
    const rc = anchor.getBoundingClientRect(), now = shown(r, c).toLowerCase();
    // the value the cell holds now has the tick
    menuAt(rc.left - 120, rc.bottom + 2, [...dv.list.map((v) => [null, v, () => writeHere(cellFrom(v, EN, book.settings.currency, sh.cells[key(r, c)]?.s || {}) || {}), { check: v.toLowerCase() === now }]), '-', ['eraser', t('clear_values'), () => change([{ t: 'cells', s: sh.id, m: { [key(r, c)]: sh.cells[key(r, c)]?.s ? { s: sh.cells[key(r, c)].s } : null } }])]], { label: t('dv_pick') });
  }

  // ------------------------------------------------------------------ menus

  /** The rules of data validation of this kind that the selection touches. */
  const dvIn = (kind) => { const g = cur(); return sh.dv.filter((d) => { const q = parseRange(d.r); return d.k === kind && q && q.r1 <= g.r2 && q.r2 >= g.r1 && q.c1 <= g.c2 && q.c2 >= g.c1; }); };
  /** Takes the checkboxes (or the dropdowns) away from the selected cells only: a rule larger than the selection keeps the rest of
   *  its cells (split around it). Checkboxes leave their cells empty, as before them; a dropdown leaves what was chosen. */
  function removeDv(kind) {
    const g0 = cur(), g = { ...g0, r2: Math.min(g0.r2, Math.max(ext.r, g0.r1) + 1000), c2: Math.min(g0.c2, Math.max(ext.c, g0.c1)) };
    const out = [], m = {};
    for (const d of sh.dv) {
      const q = parseRange(d.r);
      if (d.k !== kind || !q || q.r1 > g0.r2 || q.r2 < g0.r1 || q.c1 > g0.c2 || q.c2 < g0.c1) { out.push(d); continue; }
      const top = Math.max(q.r1, g0.r1), bot = Math.min(q.r2, g0.r2), lft = Math.max(q.c1, g0.c1), rgt = Math.min(q.c2, g0.c2);
      for (const p of [{ r1: q.r1, r2: top - 1, c1: q.c1, c2: q.c2 }, { r1: bot + 1, r2: q.r2, c1: q.c1, c2: q.c2 }, { r1: top, r2: bot, c1: q.c1, c2: lft - 1 }, { r1: top, r2: bot, c1: rgt + 1, c2: q.c2 }])
        if (p.r1 <= p.r2 && p.c1 <= p.c2) out.push({ ...d, r: rangeStr(p) });
      if (kind === 'check') for (let r = top; r <= Math.min(bot, g.r2); r++) for (let c = lft; c <= Math.min(rgt, g.c2); c++) { const cell = sh.cells[key(r, c)]; if (cell && typeof cell.v === 'boolean') { const { v: _v, ...rest } = cell; m[key(r, c)] = Object.keys(rest).length ? rest : null; } }
    }
    const ops = [{ t: 'sheet', id: sh.id, p: { dv: out } }];
    if (Object.keys(m).length) ops.push({ t: 'cells', s: sh.id, m });
    change(ops);
  }
  function cellMenu(x, y, hh) { ctxAt(x, y, cellItems(hh)); }
  /** What can be done with the cells chosen: the right click on them, and "For the selection" in ⌘J (the grid's soMenu). */
  function cellItems(hh = {}) {
    const g = cur(), wholeR = FULLR(g), wholeC = FULLC(g), nR = g.r2 - g.r1 + 1, nC = g.c2 - g.c1 + 1;
    const E = sheetOk(sh);
    if (hh.insertOnly) return ([['arrow-down-to-line', tn('ins_rows_above', nR), () => insert('r', false)], ['arrow-right-to-line', tn('ins_cols_left', nC), () => insert('c', false)]]);
    if (hh.deleteOnly) return ([['trash', tn('del_rows', nR), () => remove('r'), { danger: true }], ['trash', tn('del_cols', nC), () => remove('c'), { danger: true }]]);
    const clipItems = [['scissors', t('cut'), () => document.execCommand('cut'), { kbd: 'Mod+X', disabled: !E }], ['copy', t('copy'), () => { focusGrid(); document.execCommand('copy'); }, { kbd: 'Mod+C' }], E ? ['clipboard-paste', t('paste'), () => W.pasteFrom(''), { kbd: 'Mod+V' }] : null, E ? ['clipboard-type', t('paste_values'), () => W.pasteFrom('values'), { kbd: 'Mod+Shift+V' }] : null, E ? ['paintbrush', t('paste_formats'), () => W.pasteFrom('formats')] : null];
    let items;
    if (hh.head === 'row' || wholeR) items = [...clipItems, '-', E ? ['arrow-up-to-line', tn('ins_rows_above', nR), () => insert('r', false)] : null, E ? ['arrow-down-to-line', tn('ins_rows_below', nR), () => insert('r', true)] : null, E ? ['trash', tn('del_rows', nR), () => remove('r'), { danger: true }] : null, E ? ['eraser', t('clear_rows'), () => clearSel('all')] : null, '-', E ? ['eye-off', t('hide_rows'), () => hideSel('r')] : null, E ? ['eye', t('unhide_rows'), () => hideSel('r', false)] : null, E ? ['move-vertical', t('row_height'), () => sizeDialog('r')] : null, E ? ['wand-sparkles', t('fit_rows'), () => autofit('r', range(g.r1, g.r2))] : null, E ? ['snowflake', t('freeze_to_row', { n: g.r2 }), () => change([{ t: 'sheet', id: sh.id, p: { freeze: { ...sh.freeze, r: g.r2 } } }])] : null];
    else if (hh.head === 'col' || wholeC) items = [...clipItems, '-', E ? ['arrow-left-to-line', tn('ins_cols_left', nC), () => insert('c', false)] : null, E ? ['arrow-right-to-line', tn('ins_cols_right', nC), () => insert('c', true)] : null, E ? ['trash', tn('del_cols', nC), () => remove('c'), { danger: true }] : null, E ? ['eraser', t('clear_cols'), () => clearSel('all')] : null, '-', E ? ['arrow-down-a-z', t('sort_sheet_az'), () => { grid.sel = { ranges: [{ r1: 1, c1: 1, r2: Math.max(1, ext.r), c2: Math.max(1, ext.c) }], r: 1, c: g.c1 }; sortSel(false); }] : null, E ? ['arrow-down-z-a', t('sort_sheet_za'), () => { grid.sel = { ranges: [{ r1: 1, c1: 1, r2: Math.max(1, ext.r), c2: Math.max(1, ext.c) }], r: 1, c: g.c1 }; sortSel(true); }] : null, '-', E ? ['eye-off', t('hide_cols'), () => hideSel('c')] : null, E ? ['eye', t('unhide_cols'), () => hideSel('c', false)] : null, E ? ['move-horizontal', t('col_width'), () => sizeDialog('c')] : null, E ? ['wand-sparkles', t('fit_cols'), () => autofit('c', range(g.c1, g.c2))] : null, E ? ['snowflake', t('freeze_to_col', { c: colName(g.c2) }), () => change([{ t: 'sheet', id: sh.id, p: { freeze: { ...sh.freeze, c: g.c2 } } }])] : null];
    else items = [...clipItems, '-', E ? ['arrow-up-to-line', tn('ins_rows_above', nR), () => insert('r', false)] : null, E ? ['arrow-left-to-line', tn('ins_cols_left', nC), () => insert('c', false)] : null, E ? ['trash', tn('del_rows', nR), () => remove('r'), { danger: true }] : null, E ? ['trash', tn('del_cols', nC), () => remove('c'), { danger: true }] : null, '-',
      E ? ['eraser', t('clear_values'), () => clearSel('values'), { kbd: 'Del' }] : null, E ? ['remove-formatting', t('clear_formats'), () => clearSel('formats')] : null, '-',
      E ? ['arrow-down-a-z', t('sort_az'), () => sortSel(false)] : null, E ? ['arrow-down-z-a', t('sort_za'), () => sortSel(true)] : null, E ? ['funnel', t(sh.filter ? 'filter_off' : 'filter_on'), () => toggleFilter()] : null, E ? ['chart-column', t('insert_chart'), () => chartDialog()] : null, '-',
      W.canComment && can(W.doc.role, 'commenter') ? ['message-square', t('c_add'), () => startComment(), { kbd: 'Mod+Alt+M' }] : null, W.canComment ? ['sticky-note', t('n_add'), () => startComment(true)] : null,
      E ? ['list-collapse', t('dv_dropdown') + '…', () => dvDialog('list')] : null, E ? ['square-check', t('dv_check'), () => dvDialog('check')] : null,
      E && dvIn('check').length ? ['square-x', t('dv_remove_check'), () => removeDv('check'), { danger: true }] : null, E && dvIn('list').length ? ['list-x', t('dv_remove_list'), () => removeDv('list'), { danger: true }] : null, E ? ['list-checks', t('validation') + '…', () => dvDialog()] : null, E ? ['paint-bucket', t('cond_format') + '…', () => cfDialog()] : null, E ? ['sliders-horizontal', t('format_cells'), () => formatDialog(), { kbd: 'Mod+1' }] : null, isOwner && !isLocal ? ['lock', t('protect_these'), () => protectDialog(sh, rangeStr(cur()))] : null, isOwner && !isLocal ? ['lock-open', t('protect_but_these'), () => protectDialog(sh, rangeStr(cur()), true)] : null, '-', ['link', t('copy_cell_link'), () => copyText(`${location.origin}${location.pathname}#/d/${pid}/${sh.id}!${key(grid.sel.r, grid.sel.c)}`, t('link_copied'))]];
    return items;
  }
  /** A text with a number: the singular form (key_1) when there is one. */
  const tn = (k, n, v = {}) => t(n === 1 && t(k + '_1') !== k + '_1' ? k + '_1' : k, { n, ...v });
  const range = (a, b) => Array.from({ length: Math.min(b, a + 2000) - a + 1 }, (_, i) => a + i);
  function sizeDialog(axis) {
    const g = cur(), list = axis === 'c' ? range(g.c1, Math.min(g.c2, MAX_COLS)) : range(g.r1, Math.min(g.r2, ext.r + 1000)), cur0 = axis === 'c' ? W8(g.c1) : H8(g.r1);
    const n = h('sav-number-input', { label: t(axis === 'c' ? 'col_width' : 'row_height') + ' (px)', value: cur0, min: axis === 'c' ? 16 : 12, max: axis === 'c' ? 1200 : 800, step: 1 });
    dialog({ title: t(axis === 'c' ? 'col_width' : 'row_height'), width: '22rem', body: n, actions: [{ label: t('cancel') }, { label: t('apply'), primary: true, run: () => setSizes(axis, list, Math.round(+n.value || cur0)) }] });
  }

  // ------------------------------------------------------------------ the toolbar

  const B = {};
  function buildToolbar() {
    if (!editable) return;
    const cbtn = (ic, label) => h('sav-button.cicon', { icon: ic, label, title: label, size: 'sm', appearance: 'ghost', variant: 'neutral', square: true });
    const ib = (ic, k, fn, kbd) => (B[k] = iconBtn(ic, t(k), fn, { kbd }));
    B.paint = iconBtn('paint-roller', t('painter'), () => { if (W.brush) { W.brush = null; B.paint.on(false); return; } W.brush = { s: curStyle() }; B.paint.on(true); toast(t('painter_t'), 'neutral'); });
    B.font = select(null, Object.keys(FONT_STACK).map((k) => [k, t('ff_' + k), `font-family:${FONT_STACK[k]}`]), book.settings.font, (v) => { if (v) styleSel({ ff: v === book.settings.font ? null : v }); }, { 'aria-label': t('font'), class: 'f-font' });
    B.size = select(null, SIZES.map((x) => [String(x), String(x)]), String(book.settings.fontSize || 10), (v) => { if (v) styleSel({ fz: +v === (book.settings.fontSize || 10) ? null : +v }); }, { 'aria-label': t('size'), class: 'f-size' });
    ib('bold', 'bold', () => toggleStyle('b'), 'Mod+B'); ib('italic', 'italic', () => toggleStyle('i'), 'Mod+I'); ib('underline', 'underline', () => toggleStyle('u'), 'Mod+U'); ib('strikethrough', 'strike', () => toggleStyle('k'), 'Mod+5');
    B.color = colorPop(t('color'), '', (v) => styleSel({ c: v || null }), { trigger: cbtn('baseline', t('color')), none: t('automatic'), list: INKS });
    B.fill = colorPop(t('fill'), '', (v) => styleSel({ bg: v || null }), { trigger: cbtn('paint-bucket', t('fill')), none: t('none'), list: [...PASTEL, '#4d7c0f', '#1d4e89', '#b3261e', '#1c1c1c'] });
    let bline = 'thin', bcol = '#1c1c1c';
    B.borders = dropBtn('grid-3x3', t('borders'), () => [['grid-3x3', t('bd_all'), () => setBorders('all', bline, bcol)], ['square', t('bd_outer'), () => setBorders('outer', bline, bcol)], ['plus', t('bd_inner'), () => setBorders('inner', bline, bcol)], ['panel-top', t('bd_top'), () => setBorders('top', bline, bcol)], ['panel-bottom', t('bd_bottom'), () => setBorders('bottom', bline, bcol)], ['panel-left', t('bd_left'), () => setBorders('left', bline, bcol)], ['panel-right', t('bd_right'), () => setBorders('right', bline, bcol)], ['rows-2', t('bd_horiz'), () => setBorders('horiz', bline, bcol)], ['columns-2', t('bd_vert'), () => setBorders('vert', bline, bcol)], ['square-dashed', t('bd_none'), () => setBorders('none')], '-', { head: t('bd_line') }, ...['thin', 'medium', 'thick', 'dashed', 'dotted', 'double'].map((k) => [null, t('bl_' + k), () => { bline = k; }, { check: bline === k }]), '-', ...[['#1c1c1c', t('black')], ['#9aa29d', t('gray')], ['#4d7c0f', t('green')], ['#1d4e89', t('blue')], ['#b3261e', t('red')]].map(([c, l]) => [null, l, () => { bcol = c; }, { check: bcol === c, style: `--c:${c}` }])]);
    B.merge = dropBtn('merge', t('merge'), () => [['merge', t('merge_all'), () => mergeSel('all')], ['rows-3', t('merge_rows'), () => mergeSel('rows')], ['columns-3', t('merge_cols'), () => mergeSel('cols')], ['split', t('unmerge'), () => unmergeSel()]]);
    B.ha = dropBtn('text-align-start', t('align'), () => [['l', 'text-align-start', 'left'], ['c', 'text-align-center', 'center'], ['r', 'text-align-end', 'right']].map(([k, ic, l]) => [ic, t(l), () => styleSel({ ha: curStyle().ha === k ? null : k }), { check: curStyle().ha === k }]).concat(['-', ...[['t', 'arrow-up-to-line', 'v_top'], ['m', 'fold-vertical', 'v_middle'], ['b', 'arrow-down-to-line', 'v_bottom']].map(([k, ic, l]) => [ic, t(l), () => styleSel({ va: k === 'b' ? null : k }), { check: (curStyle().va || 'b') === k }])]));
    B.wrap = ib('wrap-text', 'wrap', () => toggleStyle('w'));
    const P = presets(lang, book.settings.currency);
    B.nf = dropBtn('hash', t('num_format'), () => [...P.map(([k, f]) => [null, h('span.nfi', h('span', t('nf_' + k)), h('small', k === 'general' ? '' : formatValue(k === 'text' ? 'abc' : /date|time|weekday|month/.test(k) ? 45351.6 : k === 'duration' ? 1.25 : -1234.567, f, L).text)), () => styleSel({ nf: k === 'general' ? null : f }), { check: (curStyle().nf || 'General') === f }]), '-', ['settings-2', t('nf_custom'), () => formatDialog('number')]]);
    B.cur = iconBtn(book.settings.currency === 'USD' ? 'dollar-sign' : book.settings.currency === 'GBP' ? 'pound-sterling' : 'euro', t('nf_currency'), () => styleSel({ nf: P.find((x) => x[0] === 'currency')[1] }));
    B.pct = iconBtn('percent', t('nf_percent0'), () => styleSel({ nf: '0%' }));
    B.dec0 = iconBtn('decimals-arrow-left', t('dec_less'), () => styleSel((s) => ({ nf: decimals(s.nf || (typeof eng.value(sh, key(grid.sel.r, grid.sel.c)) === 'number' ? '0.' + '0'.repeat(shownDecimals(eng.value(sh, key(grid.sel.r, grid.sel.c)))) : '0'), -1) })));
    B.dec1 = iconBtn('decimals-arrow-right', t('dec_more'), () => styleSel((s) => ({ nf: decimals(s.nf || (typeof eng.value(sh, key(grid.sel.r, grid.sel.c)) === 'number' ? '0.' + '0'.repeat(shownDecimals(eng.value(sh, key(grid.sel.r, grid.sel.c)))) : '0'), 1) })));
    B.sum = dropBtn('sigma', t('functions'), () => [['sigma', t('f_sum'), () => autosum('SUM'), { kbd: 'Alt+=' }], ['chart-no-axes-column', t('f_avg'), () => autosum('AVERAGE')], ['hash', t('f_count'), () => autosum('COUNT')], ['arrow-up-to-line', t('f_max'), () => autosum('MAX')], ['arrow-down-to-line', t('f_min'), () => autosum('MIN')], '-', ['square-function', t('g_title') + '…', () => guide()]]);
    B.chart = iconBtn('chart-column', t('insert_chart'), () => chartDialog());
    B.filter = iconBtn('funnel', t('filter'), () => toggleFilter(), { kbd: 'Mod+Shift+L' });
    B.sort = dropBtn('arrow-down-a-z', t('sort'), () => [['arrow-down-a-z', t('sort_az'), () => sortSel(false)], ['arrow-down-z-a', t('sort_za'), () => sortSel(true)], '-', ['list-ordered', t('sort_more'), () => sortDialog()]]);
    B.freeze = dropBtn('snowflake', t('freeze'), freezeItems);
    B.cf = dropBtn('blend', t('cond_format'), cfItems);
    B.dv = dropBtn('list-checks', t('dv_menu'), dvItems);
    B.clear = iconBtn('remove-formatting', t('clear_formats'), () => clearSel('formats'));
    // actions that are not in the bar at first, to add when customising it
    const one = (k) => tn(k, 1);
    B.insRow = iconBtn('between-horizontal-start', one('ins_rows_above'), () => insert('r', false));
    B.insCol = iconBtn('between-vertical-start', one('ins_cols_left'), () => insert('c', false));
    B.delRow = iconBtn('table-rows-split', one('del_rows'), () => remove('r'));
    B.delCol = iconBtn('table-columns-split', one('del_cols'), () => remove('c'));
    B.fmtCells = iconBtn('sliders-horizontal', t('format_cells'), () => formatDialog(), { kbd: 'Mod+1' });
    B.dropdown = iconBtn('list-collapse', t('dv_dropdown'), () => dvDialog('list'));
    B.checkbox = iconBtn('square-check', t('dv_check'), () => dvDialog('check'));
    B.guide = iconBtn('square-function', t('g_title'), () => guide());
    B.comment = W.canComment && can(data.doc.role, 'commenter') ? iconBtn('message-square', t('c_add'), () => startComment(), { kbd: 'Mod+Alt+M' }) : null;
    B.find = iconBtn('search', t('find'), () => setTab('find', true), { kbd: 'Mod+F' });
    B.print = lim.noDownload ? null : iconBtn('printer', t('print'), () => printSheet(), { kbd: 'Mod+P' });
    B.pages = iconBtn('file-scan', t('page_guides'), () => toggleGuides());
    B.sortAZ = iconBtn('arrow-down-a-z', t('sort_az'), () => sortSel(false));
    B.sortZA = iconBtn('arrow-down-z-a', t('sort_za'), () => sortSel(true));
    B.fitCols = iconBtn('wand-sparkles', t('fit_cols'), () => { const g = cur(); autofit('c', range(g.c1, Math.min(g.c2, Math.max(ext.c, g.c1)))); });
    layoutToolbar();
    keepCaret(fmt);
  }
  /** What the bar can hold: its id, icon and name (for the window that customises it), in the order of the catalogue. */
  const TB_ITEMS = () => [['paint', 'paint-roller', t('painter')], ['font', 'type', t('font')], ['size', 'a-large-small', t('size')], ['bold', 'bold', t('bold')], ['italic', 'italic', t('italic')], ['underline', 'underline', t('underline')], ['strike', 'strikethrough', t('strike')],
    ['color', 'baseline', t('color')], ['fill', 'paint-bucket', t('fill')], ['borders', 'grid-3x3', t('borders')], ['merge', 'merge', t('merge')], ['ha', 'text-align-start', t('align')], ['wrap', 'wrap-text', t('wrap')],
    ['cur', 'euro', t('nf_currency')], ['pct', 'percent', t('nf_percent0')], ['dec0', 'decimals-arrow-left', t('dec_less')], ['dec1', 'decimals-arrow-right', t('dec_more')], ['nf', 'hash', t('num_format')],
    ['sum', 'sigma', t('functions')], ['chart', 'chart-column', t('insert_chart')], ['filter', 'funnel', t('filter')], ['sort', 'arrow-down-a-z', t('sort')], ['freeze', 'snowflake', t('freeze')], ['cf', 'blend', t('cond_format')], ['dv', 'list-checks', t('dv_menu')], ['clear', 'remove-formatting', t('clear_formats')],
    ['insRow', 'between-horizontal-start', tn('ins_rows_above', 1)], ['insCol', 'between-vertical-start', tn('ins_cols_left', 1)], ['delRow', 'table-rows-split', tn('del_rows', 1)], ['delCol', 'table-columns-split', tn('del_cols', 1)], ['fmtCells', 'sliders-horizontal', t('format_cells')],
    ['dropdown', 'list-collapse', t('dv_dropdown')], ['checkbox', 'square-check', t('dv_check')], ['guide', 'square-function', t('g_title')], ['comment', 'message-square', t('c_add')], ['find', 'search', t('find')], ['print', 'printer', t('print')], ['pages', 'file-scan', t('page_guides')],
    ['sortAZ', 'arrow-down-a-z', t('sort_az')], ['sortZA', 'arrow-down-z-a', t('sort_za')], ['fitCols', 'wand-sparkles', t('fit_cols')]].filter(([k]) => B[k]);
  const TB_DEFAULT = ['paint', '|', 'font', 'size', '|', 'bold', 'italic', 'underline', 'strike', 'color', 'fill', '|', 'borders', 'merge', 'ha', 'wrap', '|', 'cur', 'pct', 'dec0', 'dec1', 'nf', '|', 'sum', 'chart', 'filter', 'sort', 'freeze', 'cf', 'dv', '|', 'clear'];
  /** The toolbar chosen ('|' a separator): kept with the account (prefs().bars.tools), or the usual one. */
  const tbChosen = () => barPick('tools', TB_DEFAULT, TB_ITEMS(), prefs().tools);
  /** The toolbar laid out in the order of the list (separators and spaces too). */
  function layoutToolbar() {
    put(fmt, (BARS ? BARS.layout(tbChosen()) : tbChosen()).map((k) => barEl(k, B)));
    refreshTools();
  }

  /** Customising the bars (⋮ → Customise the bars): the window shared by the apps of SavOffice, a tab for each bar. */
  function toolbarDialog() {
    if (!window.SavOffice?.bars) return;
    const bars = [{ id: 'title', items: TITLE_ITEMS(), def: TITLE_DEF, before: [[null, W.title || data.doc.title]], after: [['ellipsis-vertical', t('more')], ['layout-grid', 'SavOffice'], ['user', t('account')]] }, editable ? { id: 'tools', items: TB_ITEMS(), def: TB_DEFAULT.filter((k) => k === '|' || B[k]) } : null, { id: 'status', items: STATUS_ITEMS(), def: STATUS_DEF }].filter(Boolean);
    const value = { title: barPick('title', TITLE_DEF, TITLE_ITEMS()), tools: editable ? tbChosen() : [], status: barPick('status', STATUS_DEF, STATUS_ITEMS()) };
    window.SavOffice.bars.dialog({ bars, value, save: async (v) => { await setPrefs({ bars: { ...(prefs().bars || {}), ...v } }); layoutTitle(); if (editable) layoutToolbar(); layoutStatus(); } });
  }


  // the format painter: the next selection takes the look
  grid.o.on.selected = () => { if (!W.brush) return; const s = W.brush.s; W.brush = null; B.paint.on(false); styleSel(() => Object.fromEntries(['b', 'i', 'u', 'k', 'w', 'c', 'bg', 'ff', 'fz', 'ha', 'va', 'nf', 'bt', 'br', 'bb', 'bl', 'ind', 'rot'].map((k) => [k, s[k] ?? null]))); };
  function refreshTools() {
    if (!editable || !B.bold) return;
    const s = curStyle();
    for (const [k, x] of [['bold', 'b'], ['italic', 'i'], ['underline', 'u'], ['strike', 'k'], ['wrap', 'w']]) B[k].on(!!s[x]);
    B.filter.on(!!sh.filter);
    B.pages?.on(pagePrefs().guides);
    const ff = s.ff || book.settings.font, fz = String(s.fz || book.settings.fontSize || 10);
    if (B.font.value !== ff) B.font.value = ff;
    if (!SIZES.includes(+fz) && !B.size.querySelector(`[value="${fz}"]`)) B.size.append(h('option', { value: fz }, fz));
    if (B.size.value !== fz) B.size.value = fz;
    B.color.show_?.(s.c || '');
    B.fill.show_?.(s.bg || '');
    undoB.button.disabled = !undos.length;
    redoB.button.disabled = !redos.length;
  }

  // ------------------------------------------------------------------ sheets and their tabs

  function switchTo(id, quiet) {
    const s = book.sheets.find((x) => x.id === id);
    if (!s || s === sh) return;
    if (editing && !pickable()) commit(0, 0, true);
    sh = s;
    localStorage.setItem('savspreadsheets-at-' + pid, id);
    more = { r: 0, c: 0 };
    rebuild();
    grid.sel = W.sels?.[id] || { ranges: [{ r1: 1, c1: 1, r2: 1, c2: 1 }], r: 1, c: 1 };
    grid.wrap.scrollTo(0, 0);
    grid.refresh();
    grid.show(grid.sel.r, grid.sel.c); // back to the cell this sheet was left on
    drawCharts();
    drawTabs();
    drawPeople();
    if (!quiet) selected();
  }
  // the cell in use of each sheet is kept in this browser: the workbook opens again where it was left
  const CELL_KEY = 'savspreadsheets-cell-' + pid;
  let cellT = 0;
  const keepCell = () => { clearTimeout(cellT); cellT = setTimeout(() => { const o = {}; for (const [id, s] of Object.entries(W.sels || {})) if (book.sheets.some((x) => x.id === id)) o[id] = [s.r, s.c]; try { localStorage.setItem(CELL_KEY, JSON.stringify(o)); } catch { /* full: nothing kept */ } }, 400); };
  try { for (const [id, p] of Object.entries(JSON.parse(localStorage.getItem(CELL_KEY) || '{}'))) if (Array.isArray(p) && p[0] >= 1 && p[1] >= 1 && p[0] <= MAX_ROWS && p[1] <= MAX_COLS) (W.sels ||= {})[id] = { ranges: [{ r1: p[0], c1: p[1], r2: p[0], c2: p[1] }], r: p[0], c: p[1] }; } catch { /* nothing kept */ }
  W.keepCell = keepCell;
  grid.o.on.select = ((orig) => (s, how) => { (W.sels ||= {})[sh.id] = s; orig(s, how); })(grid.o.on.select);
  /** The icon of a tab: its colour and, when the sheet has rules (or is only to read), a lock. */
  const tabIcon = (s) => {
    const lock = ruled(s), c = s.color;
    if (!lock && !c) return null;
    if (!c) return 'lock';
    const name = `ss-tab-${c.slice(1)}${lock ? '-l' : ''}`;
    window.Sav?.registerIcon?.(name, lock ? `<circle cx="12" cy="12" r="10" fill="${c}" stroke="none"/><rect x="8" y="11" width="8" height="6" rx="1" stroke="#fff" stroke-width="1.8"/><path d="M10 11V9a2 2 0 0 1 4 0v2" stroke="#fff" stroke-width="1.8"/>` : `<circle cx="12" cy="12" r="6.5" fill="${c}" stroke="none"/>`);
    return name;
  };
  /** The tabs of the sheets: a sav-tabs of SavComponents, one sav-tab for each sheet that is not hidden. */
  function drawTabs() {
    tabsEl.setAttribute('active', sh.id);
    put(tabsEl, book.sheets.filter((s) => !s.hidden).map((s) => h('sav-tab', { name: s.id, label: s.name, icon: tabIcon(s), active: s === sh || null })));
    requestAnimationFrame(() => tabsEl.shadowRoot?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    setCmds();
  }
  tabsEl.addEventListener('sav-tab-show', (e) => { if (e.detail?.name && e.detail.name !== sh.id) switchTo(e.detail.name); });
  const tabAt = (e) => { const b = e.composedPath().find((x) => x.getAttribute?.('role') === 'tab' && x.dataset?.i !== undefined); const tab = b && tabsEl.tabs[+b.dataset.i]; return tab ? book.sheets.find((x) => x.id === tab.getAttribute('name')) : null; };
  tabsEl.addEventListener('contextmenu', (e) => { const s = tabAt(e); if (!s) return; e.preventDefault(); sheetMenu(s, e.clientX, e.clientY - 10); });
  tabsEl.addEventListener('dblclick', (e) => { const s = tabAt(e); if (s && sheetOk(s)) renameSheet(s); });
  // a long press opens the menu on phones
  // a long press on a tab (phones, tablets) opens the same menu: SavOffice.context hears it as a right click
  function sheetMenu(s, x, y) {
    if (!editable) return;
    const i = book.sheets.indexOf(s), vis = book.sheets.filter((q) => !q.hidden);
    const rules = isOwner && !isLocal ? [['users', t('sheet_perm'), () => permDialog(s)], ['lock', t('protect_cells'), () => protectDialog(s)], '-'] : [];
    if (!sheetOk(s)) return ctxAt(x, y, rules.length ? rules : [['lock', t('sheet_ro'), null, { disabled: true }]], { label: s.name });
    ctxAt(x, y, [...rules, ['pencil', t('rename'), () => renameSheet(s)], ['copy', t('duplicate'), () => dupSheet(s)], ['palette', t('tab_color'), () => colorDialog(s)], ['arrow-left', t('move_left'), () => change([{ t: 'movsheet', id: s.id, after: book.sheets[i - 2]?.id || '' }]), { disabled: i === 0 }], ['arrow-right', t('move_right'), () => change([{ t: 'movsheet', id: s.id, after: book.sheets[i + 1]?.id || s.id }]), { disabled: i === book.sheets.length - 1 }], ['eye-off', t('hide_sheet'), () => { change([{ t: 'sheet', id: s.id, p: { hidden: true } }]); if (s === sh) switchTo(vis.find((q) => q !== s)?.id); }, { disabled: vis.length < 2 }], ['grid-3x3', t(s.grid === false ? 'grid_show' : 'grid_hide'), () => change([{ t: 'sheet', id: s.id, p: { grid: s.grid === false } }])], '-', ['trash', t('delete'), () => delSheet(s), { danger: true, disabled: book.sheets.length < 2 }]], { label: s.name });
  }
  function addSheet() {
    const id = newId(), name = uniqueName(book, t('sheet_n', { n: book.sheets.length + 1 }));
    change([{ t: 'addsheet', id, after: sh.id, sheet: { name, cells: {}, cols: {}, rows: {}, merges: [], cf: [], dv: [], charts: [], freeze: { r: 0, c: 0 }, grid: true, hidden: false, color: '', filter: null } }]);
    switchTo(id);
  }
  function dupSheet(s) {
    const id = newId(), copy = structuredClone({ ...s, id: undefined });
    copy.name = uniqueName(book, `${s.name} (${t('copy_short')})`.slice(0, 60));
    copy.charts = copy.charts.map((c) => ({ ...c, id: newId() }));
    change([{ t: 'addsheet', id, after: s.id, sheet: copy }]);
    switchTo(id);
  }
  async function renameSheet(s) {
    const n = await ask(t('rename_sheet'), t('name'), s.name, t('rename'));
    if (!n || n === s.name) return;
    const clean = n.replace(/[[\]:*?/\\]/g, '').trim().slice(0, 60);
    if (!clean) return;
    if (book.sheets.some((x) => x !== s && x.name.toLowerCase() === clean.toLowerCase())) { toast(t('sheet_exists'), 'warning'); return; }
    change(renameOps(book, s.id, clean));
  }
  async function delSheet(s) {
    if (!(await confirm(t('delete_sheet'), t('delete_sheet_t', { name: s.name }), t('delete')))) return;
    if (s === sh) switchTo(book.sheets.find((x) => x !== s && !x.hidden)?.id || book.sheets.find((x) => x !== s).id, true);
    change([{ t: 'delsheet', id: s.id }]);
  }
  function colorDialog(s) {
    const c = colorPop(t('tab_color'), s.color, (v) => change([{ t: 'sheet', id: s.id, p: { color: v || '' } }]), { none: t('none'), list: ['#4d7c0f', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#475569'] });
    dialog({ title: t('tab_color'), width: '20rem', body: c, actions: [{ label: t('close') }] });
    setTimeout(() => c.show?.(), 100);
  }

  // ------------------------------------------------------------------ charts

  let chartLayer = null, chartSel = null;
  function drawCharts() {
    const p = grid.P.b22;
    if (!chartLayer || chartLayer.parentNode !== p) { chartLayer?.remove(); chartLayer = h('div.charts'); p.append(chartLayer); }
    const dark = document.documentElement.classList.contains('sav-theme-dark') || (matchMedia('(prefers-color-scheme: dark)').matches && !document.documentElement.classList.contains('sav-theme-light'));
    const x0 = grid.x(grid.fc + 1), y0 = grid.y(grid.fr + 1);
    put(chartLayer, sh.charts.map((ch) => {
      const data = chartData(ch, (r, c) => eng.value(sh, key(r, c)), (r, c) => shown(r, c)), w = ch.w * z(), hh = ch.h * z();
      const nf = (() => { const g = parseRange(ch.r); return g ? styleAt(sh, g.r1 + 1, g.c2, sh.cells[key(g.r1 + 1, g.c2)]).nf : ''; })();
      const el = h('div.chart' + (chartSel === ch.id ? '.on' : ''), { style: `left:${ch.x * z() - x0}px;top:${ch.y * z() - y0}px;width:${w}px;height:${hh}px`, 'data-id': ch.id, html: chartSVG(ch, data, ch.w, ch.h, { dark, fmt: nf && !/@/.test(nf) ? (n) => formatValue(n, nf, L).text : null }) });
      if (editable) {
        el.append(h('i.cgrip'));
        if (chartSel === ch.id) el.append(h('div.cbar', iconBtn('pencil', t('edit_chart'), () => chartDialog(ch), { size: 'sm' }), iconBtn('copy', t('duplicate'), () => change([{ t: 'sheet', id: sh.id, p: { charts: [...sh.charts, { ...ch, id: newId(), x: ch.x + 24, y: ch.y + 24 }] } }]), { size: 'sm' }), iconBtn('trash', t('delete'), () => { chartSel = null; change([{ t: 'sheet', id: sh.id, p: { charts: sh.charts.filter((x) => x.id !== ch.id) } }]); }, { size: 'sm' })));
        chartDrag(el, ch);
      }
      return el;
    }));
  }
  function chartDrag(el, ch) {
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.cbar')) return;
      e.stopPropagation();
      e.preventDefault();
      const resize = e.target.classList.contains('cgrip'), sx = e.clientX, sy = e.clientY, start = { ...ch };
      if (chartSel !== ch.id) { chartSel = ch.id; drawCharts(); }
      const moveTo = (ev) => { const dx = (ev.clientX - sx) / z(), dy = (ev.clientY - sy) / z(); const n = resize ? { w: Math.max(160, start.w + dx), h: Math.max(120, start.h + dy) } : { x: Math.max(0, start.x + dx), y: Math.max(0, start.y + dy) }; Object.assign(ch, n); const node = chartLayer.querySelector(`[data-id="${ch.id}"]`); if (node) { const x0 = grid.x(grid.fc + 1), y0 = grid.y(grid.fr + 1); Object.assign(node.style, { left: ch.x * z() - x0 + 'px', top: ch.y * z() - y0 + 'px', width: ch.w * z() + 'px', height: ch.h * z() + 'px' }); } };
      const up = () => { removeEventListener('pointermove', moveTo); removeEventListener('pointerup', up); const moved = start.x !== ch.x || start.y !== ch.y || start.w !== ch.w || start.h !== ch.h; if (moved) { const now = { ...ch }; Object.assign(ch, start); change([{ t: 'sheet', id: sh.id, p: { charts: sh.charts.map((x) => (x.id === ch.id ? { ...now, x: Math.round(now.x), y: Math.round(now.y), w: Math.round(now.w), h: Math.round(now.h) } : x)) } }]); } };
      addEventListener('pointermove', moveTo);
      addEventListener('pointerup', up);
    });
    el.addEventListener('dblclick', (e) => { e.stopPropagation(); chartDialog(ch); });
  }
  wrap.addEventListener('pointerdown', (e) => { if (chartSel && !e.target.closest('.chart')) { chartSel = null; drawCharts(); } });
  addEventListener('keydown', (e) => { if (chartSel && (e.key === 'Delete' || e.key === 'Backspace') && gridFocused() && editable) { e.preventDefault(); e.stopImmediatePropagation(); const id = chartSel; chartSel = null; change([{ t: 'sheet', id: sh.id, p: { charts: sh.charts.filter((x) => x.id !== id) } }]); } }, true);

  // ------------------------------------------------------------------ dialogs (dialogs.js)

  const D = () => import('./dialogs.js');
  const ctx = () => ({ W, sh, book, eng, L, lang, ui, grid, cur, change, styleSel, curStyle, shown, ext, presets: presets(lang, book.settings.currency), dvAt, sortSel, setSel, switchTo, startEdit, selOf: () => { let g = cur(); if (FULLC(g)) g = { ...g, r1: 1, r2: Math.max(1, ext.r) }; if (FULLR(g)) g = { ...g, c2: Math.max(1, ext.c) }; return g; }, rangeOf: () => { let g = cur(); if (g.r1 === g.r2 && g.c1 === g.c2) g = tableAt(sh, g.r1, g.c1); if (FULLC(g)) g = { ...g, r1: 1, r2: Math.max(1, ext.r) }; if (FULLR(g)) g = { ...g, c2: Math.max(1, ext.c) }; return g; } });
  const formatDialog = (tab) => D().then((d) => d.formatDialog(ctx(), tab)).catch(fail);
  /** Frozen rows and frozen columns are two choices: each part has its own tick. */
  function freezeItems() {
    const fr = sh.freeze || { r: 0, c: 0 }, set = (p) => () => change([{ t: 'sheet', id: sh.id, p: { freeze: { ...fr, ...p } } }]);
    const part = (k, icons) => {
      const n = fr[k], list = [0, 1, 2, 3];
      if (!list.includes(n)) list.push(n); // what is frozen now shows even when it is not among the usual ones
      return list.sort((a, b) => a - b).map((x) => [x ? icons[Math.min(x, icons.length) - 1] : 'x', x ? tn(k === 'r' ? 'freeze_rows' : 'freeze_cols', x) : t(k === 'r' ? 'freeze_no_rows' : 'freeze_no_cols'), set({ [k]: x }), { check: n === x }]);
    };
    return [{ head: t('rows') }, ...part('r', ['rows-2', 'rows-3', 'rows-4']), '-', { head: t('columns') }, ...part('c', ['columns-2', 'columns-3', 'columns-4']), '-',
      ['grid-2x2', t('freeze_here', { k: key(grid.sel.r, grid.sel.c) }), set({ r: Math.max(0, grid.sel.r - 1), c: Math.max(0, grid.sel.c - 1) })],
      ['settings-2', t('freeze_custom'), () => freezeDialog()]];
  }
  function freezeDialog() {
    const fr = sh.freeze || { r: 0, c: 0 };
    const r = h('sav-number-input', { label: t('rows'), value: fr.r || 0, min: 0, max: 100, step: 1, size: 'sm' }), c = h('sav-number-input', { label: t('columns'), value: fr.c || 0, min: 0, max: 50, step: 1, size: 'sm' });
    dialog({ title: t('freeze'), width: '22rem', body: h('div.form', h('p.muted', t('freeze_custom_t')), h('div.grid2', r, c)), actions: [{ label: t('cancel') }, { label: t('apply'), primary: true, run: () => change([{ t: 'sheet', id: sh.id, p: { freeze: { r: Math.max(0, Math.min(100, Math.trunc(+r.value || 0))), c: Math.max(0, Math.min(50, Math.trunc(+c.value || 0))) } } }]) }] });
  }
  const cfDialog = (quick) => D().then((d) => d.cfDialog(ctx(), quick)).catch(fail);
  const dvDialog = (k0) => D().then((d) => d.dvDialog(ctx(), k0)).catch(fail);
  /** The common rules one click away; the ones without a value are added at once, the others open their rule. */
  const cfItems = () => [{ head: t('cf_quick') }, ...[['gt', 'chevron-right'], ['lt', 'chevron-left'], ['between', 'between-horizontal-start'], ['text', 'text-search'], ['dup', 'copy'], ['scale', 'palette'], ['bars', 'chart-bar']].map(([k, ic]) => [ic, t('cf_' + (k === 'text' ? 'text_k' : k)) + (['dup', 'scale', 'bars'].includes(k) ? '' : '…'), () => cfDialog(k)]), '-', ['settings-2', t('cf_manage'), () => cfDialog()]];
  const dvItems = () => [['list-collapse', t('dv_dropdown') + '…', () => dvDialog('list')], ['square-check', t('dv_check'), () => dvDialog('check')], ['square-minus', t('dv_check3'), () => dvDialog('check3')], '-', ['list-checks', t('validation') + '…', () => dvDialog()]];
  const chartDialog = (ch) => D().then((d) => d.chartDialog(ctx(), ch, (id) => { chartSel = id; drawCharts(); })).catch(fail);
  const sortDialog = () => D().then((d) => d.sortDialog(ctx())).catch(fail);
  /** What the panel "Formula" makes: into the formula being written (where the caret is), or into the cell in use. */
  function insertFormula(text, full) {
    if (editing && (ceIn.value[0] === '=')) { const x = fxFocus ? fxIn : ceIn, at = x.selectionStart; x.setRangeText(text, at, x.selectionEnd, 'end'); sync(x); x.focus(); return; }
    if (editing) cancelEdit(true);
    if (!cellOk(sh, grid.sel.r, grid.sel.c)) { toast(t(sheetOk(sh) ? 'locked_cells' : 'sheet_ro'), 'warning'); return; }
    startEdit('edit', full);
    commit(0, 0);
    focusGrid();
  }
  const guide = () => (editable ? setTab('formula', true) : functionDialog());
  const functionDialog = () => D().then((d) => d.functionDialog(ctx(), (name) => { const n = name; if (editing) { const x = fxFocus ? fxIn : ceIn, at = x.selectionStart; x.setRangeText(n + '(', at, x.selectionEnd, 'end'); sync(x); x.focus(); } else startEdit('edit', '=' + n + '('); })).catch(fail);
  W.settingsDialog = () => D().then((d) => d.bookDialog(ctx())).catch(fail);
  const permDialog = (s) => D().then((d) => d.permDialog(ctx(), s)).catch(fail);
  const protectDialog = (s, r, out) => D().then((d) => d.protectDialog(ctx(), s, r, out)).catch(fail);
  W.permDialog = () => permDialog(sh);

  // ------------------------------------------------------------------ side panels: comments, notes, history, find

  const TABS = [...(editable ? [['formula', 'square-function']] : []), ...(isLocal ? [] : [['comments', 'message-square'], ['notes', 'sticky-note']]), ['find', 'search'], ...(editable && !isLocal && data.doc.versions !== false ? [['history', 'history']] : [])];
  function drawRail() { queueMicrotask(() => window.SavOffice?.railMore?.(rail)); // at the bottom (phones, tablets): from the fifth panel on, "More"
    put(rail, TABS.map(([k, ic]) => h('sav-bottom-nav-item', { label: t('tab_' + k), icon: ic, value: k, badge: k === 'comments' ? W.comments.filter((c) => !c.parent && !c.resolved && !c.private).length || null : null, current: W.tab === k }))); }
  rail.addEventListener('sav-select', (e) => { e.stopPropagation(); setTab(e.detail.value); });
  function setTab(name, force) {
    W.tab = W.tab === name && !force ? '' : name;
    frame.classList.toggle('has-panel', !!W.tab);
    drawRail();
    drawPanel();
    setTimeout(() => { grid.refresh(); drawCharts(); }, 30);
  }
  W.setTab = setTab;
  function drawPanel() {
    if (!W.tab) { grid.found = null; return put(panel); }
    const body = h('div.pbody'), name = W.tab;
    W.pbody = body;
    put(panel, h('div.phead', h('h2', t('tab_' + name)), iconBtn('x', t('close'), () => setTab(name))), body);
    if (name === 'find') drawFind();
    else if (name === 'formula') import('./guide.js').then((g) => { if (W.pbody === body) g.guidePanel(ctx, body, { insert: insertFormula }); }).catch(fail);
    else if (name === 'history') drawHistory();
    else drawNotes(name);
    return undefined;
  }
  function drawFind() {
    const q = h('sav-input', { label: t('f_find'), clearable: true }), w2 = h('sav-input', { label: t('f_with') }), cs = h('sav-switch', { size: 'sm' }, t('f_case')), whole = h('sav-switch', { size: 'sm' }, t('f_whole')), inF = h('sav-switch', { size: 'sm' }, t('f_formulas')), all = h('sav-switch', { size: 'sm' }, t('f_all_sheets')), info = h('span.muted');
    let found = [], i = 0;
    const run = () => {
      found = [];
      const s0 = q.value;
      if (!s0) { info.textContent = ''; grid.found = null; grid.overlay(); return; }
      const s = cs.checked ? s0 : s0.toLowerCase();
      for (const x of all.checked ? book.sheets : [sh]) {
        const keys = Object.keys(x.cells).map((k) => [k, pos(k)]).sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1]);
        for (const [k, p] of keys) {
          const cell = x.cells[k], txt0 = inF.checked && cell.f ? cell.f : shown(p[0], p[1], x), txt = cs.checked ? txt0 : txt0.toLowerCase();
          if (whole.checked ? txt === s : txt.includes(s)) found.push({ sid: x.id, r: p[0], c: p[1], k });
        }
      }
      i = Math.min(i, Math.max(0, found.length - 1));
      show();
    };
    const show = () => {
      info.textContent = q.value ? (found.length ? t('f_count', { n: i + 1, m: found.length }) : t('no_match')) : '';
      const f = found[i];
      if (!f) { grid.found = null; grid.overlay(); return; }
      if (f.sid !== sh.id) switchTo(f.sid, true);
      grid.found = { r1: f.r, c1: f.c, r2: f.r, c2: f.c };
      setSel(f.r, f.c);
    };
    const goTo = (d) => { if (!found.length) run(); if (found.length) { i = (i + d + found.length) % found.length; show(); } };
    q.addEventListener('input', () => { i = 0; run(); });
    for (const x of [cs, whole, inF, all]) x.addEventListener('change', run);
    q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); goTo(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') setTab('find'); });
    w2.addEventListener('keydown', (e) => e.stopPropagation());
    const repl = (list) => {
      const bySheet = new Map(), re = new RegExp(q.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs.checked ? 'g' : 'gi');
      for (const f of list) {
        const x = book.sheets.find((s) => s.id === f.sid), cell = x.cells[f.k];
        if (!cell) continue;
        let n2;
        if (cell.f) { if (!inF.checked) continue; n2 = { ...cell, f: whole.checked ? w2.value : cell.f.replace(re, w2.value) }; }
        else { const tx = typeof cell.v === 'string' ? cell.v : editText(cell, EN), nt = whole.checked ? w2.value : tx.replace(re, w2.value); n2 = cellFrom(nt, EN, book.settings.currency, cell.s || {}); }
        if (!bySheet.has(f.sid)) bySheet.set(f.sid, {});
        bySheet.get(f.sid)[f.k] = cleanCell(n2);
      }
      change([...bySheet].map(([s, m]) => ({ t: 'cells', s, m })));
      toast(t('replaced', { n: list.length }), 'success');
      run();
    };
    put(W.pbody, h('div.form', q, h('div.prow', info, h('span.grow'), iconBtn('chevron-left', t('previous'), () => goTo(-1)), iconBtn('chevron-right', t('next'), () => goTo(1))), cs, whole, inF, all, editable ? [w2, h('div.prow.wrap', btn(t('f_one'), { size: 'sm', onclick: () => { if (found[i]) repl([found[i]]); } }), btn(t('f_all'), { size: 'sm', variant: 'primary', onclick: () => { run(); if (found.length) repl(found); } }))] : null));
    setTimeout(() => q.focus?.(), 60);
  }
  async function drawHistory() {
    const body = W.pbody;
    put(body, h('sav-spinner'));
    try {
      await W.sync?.flush();
      const { versions } = await api('version.list', undefined, { doc: pid });
      if (body !== W.pbody) return;
      put(body, btn(t('h_save'), { icon: 'history', size: 'sm', block: true, onclick: async () => { const n = await ask(t('h_save'), t('h_name')); if (n) { await W.sync.flush(); await api('version.save', { doc: pid, name: n }); drawHistory(); } } }),
        versions.length ? h('div.stack.versions', versions.map((v) => tile(v.name || when(v.at), () => preview(v).catch(fail), { class: 'version' }, h('strong', v.name || new Date(v.at).toLocaleString(ui, { dateStyle: 'medium', timeStyle: 'short' })), h('span.muted.small', `${v.name ? when(v.at) : t('h_auto')} · ${t('cells_n', { n: v.words })}${v.by ? ' · ' + v.by : ''}`)))) : empty('history', t('h_none'), t('h_none_t')));
    } catch (e) { put(body, h('p.muted', errText(e))); }
  }
  async function preview(v) {
    const { content } = await api('version.get', undefined, { doc: pid, id: v.id }), { miniSheet } = await import('./thumbs.js');
    const b2 = normalize(content), list = h('div.vprev');
    const show = (s) => { const e2 = new Engine(b2, b2.settings.lang); e2.recalc(); put(list, miniSheet(s, { rows: 40, cols: 14, value: (k) => e2.value(s, k), big: true })); };
    const tabs = b2.sheets.length > 1 ? select(null, b2.sheets.map((s) => [s.id, s.name]), b2.sheets[0].id, (id) => show(b2.sheets.find((s) => s.id === id)), { size: 'sm', 'aria-label': t('sheets') }) : null;
    show(b2.sheets[0]);
    dialog({ title: v.name || when(v.at), width: '60rem', body: h('div.form', tabs, list), actions: [{ label: t('close') }, { label: t('h_restore'), icon: 'rotate-ccw', primary: true, run: async () => { if (!(await confirm(t('h_restore'), t('h_restore_t'), t('restore'), false))) return false; await W.sync.flush(); await api('version.restore', { doc: pid, id: v.id }); toast(t('h_restored'), 'success'); reload(); return undefined; } }] });
  }
  async function refreshComments() { try { setComments(await api('comment.list', undefined, { doc: pid })); } catch { /* next time */ } }
  function setComments(r) { W.comments = r.comments; if (W.sync) W.sync.stamp = r.stamp; drawRail(); rebuild(); grid.draw(); if (['comments', 'notes'].includes(W.tab) && !panel.querySelector('sav-textarea:focus-within')) drawNotes(W.tab); }
  function startComment(priv) {
    const { r, c } = act();
    W.draft = { block: sh.id + '!' + key(r, c), quote: (key(r, c) + ': ' + shown(r, c)).slice(0, 300) };
    setTab(priv ? 'notes' : 'comments', true);
    setTimeout(() => W.pbody.querySelector('sav-textarea')?.focus(), 80);
  }
  function drawNotes(name) {
    const body = W.pbody, priv = name === 'notes';
    if (!S.user) return put(body, empty(priv ? 'sticky-note' : 'message-square', t('c_signin_h'), t('c_signin'), primary(t('sign_in'), { href: '#/signin' })));
    const mayAdd = W.canComment && (priv || can(W.doc.role, 'commenter')), roots = W.comments.filter((c) => !c.parent && c.private === priv && (W.showDone || !c.resolved)), ta = h('sav-textarea', { placeholder: t(priv ? 'n_new' : 'c_new'), rows: 3, maxlength: 4000, size: 'sm' });
    const send2 = async () => { const v = ta.value.trim(); if (!v) return; const { r, c } = act(); const r2 = await api('comment.add', { doc: pid, body: v, private: priv, ...(W.draft || { block: sh.id + '!' + key(r, c), quote: (key(r, c) + ': ' + shown(r, c)).slice(0, 300) }) }); W.draft = null; setComments(r2); drawNotes(name); };
    ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send2().catch(fail); });
    const goCell = (c) => { const [sid, k] = (c.block || '').split('!'), p = pos(k); if (!p || !book.sheets.some((s) => s.id === sid)) return; switchTo(sid); setSel(p[0], p[1]); };
    const one = (c) => {
      const reply = c.parent ? null : W.comments.filter((x) => x.parent === c.id), sname = book.sheets.find((s) => s.id === (c.block || '').split('!')[0])?.name;
      const inner = [h('div.chead', face(c.by, null, 28), h('div.grow', h('strong', c.mine ? t('you') : c.by), h('span.muted.small', when(c.at))), c.parent || c.private ? null : iconBtn(c.resolved ? 'rotate-ccw' : 'check', t(c.resolved ? 'c_reopen' : 'c_resolve'), () => api('comment.resolve', { doc: pid, id: c.id, on: !c.resolved }).then(setComments)), c.mine || (W.doc.role === 'owner' && !c.private) ? iconBtn('trash', t('delete'), () => api('comment.delete', { doc: pid, id: c.id }).then(setComments)) : null),
        c.block && !c.parent ? btn((sname && book.sheets.length > 1 ? sname + ' · ' : '') + (c.quote || c.block.split('!')[1]).slice(0, 80), { size: 'sm', appearance: 'ghost', icon: 'map-pin', class: 'quoteb', onclick: () => goCell(c) }) : null, h('p.cbody', c.body)];
      if (c.parent) return h('div.reply', inner);
      const box = h('sav-input', { placeholder: t('c_reply'), size: 'sm' });
      box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && box.value.trim()) api('comment.add', { doc: pid, parent: c.id, body: box.value.trim() }).then(setComments).catch(fail); });
      return h('sav-card.comment' + (c.resolved ? '.done' : ''), h('div.stack', inner, reply.map(one), !c.private && can(W.doc.role, 'commenter') && W.canComment ? box : null));
    };
    const where = W.draft?.quote || (() => { const { r, c } = act(); return key(r, c) + ': ' + shown(r, c); })();
    return put(body, mayAdd ? h('div.form', h('sav-alert', { variant: 'primary', noicon: true }, icon('map-pin'), ' ', where.slice(0, 80)), ta, h('div.prow', h('span.grow'), primary(t(priv ? 'n_add' : 'c_send'), { size: 'sm', onclick: send2 }))) : null, priv ? null : h('sav-switch.showdone', { size: 'sm', checked: W.showDone || null, onchange: (e) => { W.showDone = e.currentTarget.checked; drawNotes(name); } }, t('c_show_done')), roots.length ? h('div.stack.clist', roots.map(one)) : empty(priv ? 'sticky-note' : 'message-square', t(priv ? 'n_none' : 'c_none'), t(priv ? 'n_none_t' : 'c_none_t')));
  }

  // ------------------------------------------------------------------ files, print, menu

  /** Everything an export needs: the workbook and the values computed. */
  W.bundle = () => ({ title: W.title, settings: book.settings, sheets: book.sheets, value: (s, k) => eng.value(s, k), text: (s, r, c) => shown(r, c, s), active: sh.id });
  const DL = [['xlsx', 'file-spreadsheet', 'Excel (.xlsx)'], ['ods', 'file-spreadsheet', 'OpenDocument (.ods)'], ['xls', 'file-spreadsheet', 'Excel 97–2003 (.xls)'], ['savspr', 'file-box', t('dl_savspr')], ['csv', 'file-text', 'CSV'], ['tsv', 'file-text', 'TSV'], ['html', 'globe', 'HTML'], ['pdf', 'printer', 'PDF']];
  function downloadDialog() {
    if (lim.noDownload) return;
    let d = null;
    const card = ([kind, ic, label]) => { const c = tile(label, async () => { if (c.classList.contains('busy')) return; c.classList.add('busy'); try { await save(kind); d.hide(); } catch (e) { fail(e); } finally { c.classList.remove('busy'); } }, { class: 'dl' }, icon(ic), h('b', label), h('small', t('dlt_' + kind))); return c; };
    d = dialog({ title: t('download'), width: '40rem', body: h('div.dls', DL.map(card)) });
  }
  W.download = downloadDialog;
  // SavDrive: the cloud next to the grid of the apps saves this workbook into the drive (../assets/savoffice/savoffice.js)
  if (!lim.noDownload) window.SavOffice?.exporter?.({ key: pid, make: async () => { const b = W.bundle(), files = await import('./files.js'); return { blob: await files.write('savspr', b, sh), name: files.fileName(b.title, 'savspr') }; } });
  async function save(kind) {
    if (kind === 'pdf') { toast(t('pdf_hint'), 'neutral'); return printSheet(); }
    const n = toast(t('preparing'), 'neutral', { duration: 0 });
    try {
      const b = W.bundle(), files = await import('./files.js');
      const out = await files.write(kind, b, sh);
      files.download(out, files.fileName(b.title + (['csv', 'tsv'].includes(kind) && book.sheets.length > 1 ? ' - ' + sh.name : ''), kind));
    } finally { n.remove(); }
  }
  async function printSheet() { const { printBook } = await import('./print.js'); printBook(W.bundle(), sh, cur(), () => grid.refresh()); }
  const toggleGuides = () => { setPagePrefs({ guides: !pagePrefs().guides }); grid.refresh(); refreshTools(); };
  W.print = printSheet;
  async function toAccount() { const id = await keep({ title: W.title, settings: book.settings, sheets: book.sheets }); await local.remove(pid); toast(t('saved_account'), 'success'); W.close(); location.hash = '#/d/' + id; }
  const reload = () => { W.close(); openSheet(root, pid, opt).then((w) => opt.onReload?.(w)).catch(fail); };
  function shortcuts() {
    const Lk = [[t('undo'), 'Mod+Z'], [t('redo'), 'Mod+Shift+Z'], [t('bold'), 'Mod+B'], [t('italic'), 'Mod+I'], [t('underline'), 'Mod+U'], [t('strike'), 'Mod+5'], [t('format_cells'), 'Mod+1'], [t('edit_cell'), 'F2'], [t('abs_ref'), 'F4'], [t('new_line'), 'Alt+Enter'], [t('fill_sel'), 'Mod+Enter'], [t('fill_down'), 'Mod+D'], [t('fill_right'), 'Mod+R'], [t('f_sum'), 'Alt+='], [t('today'), 'Mod+;'], [t('now_time'), 'Mod+Shift+;'], [t('sel_region'), 'Mod+A'], [t('sel_col'), 'Mod+Space'], [t('sel_row'), 'Shift+Space'], [t('to_edge'), 'Mod+↑↓←→'], [t('next_sheet'), 'Mod+PageDown'], [t('add_sheet'), 'Shift+F11'], [t('find'), 'Mod+F'], [t('filter'), 'Mod+Shift+L'], [t('paste_values'), 'Mod+Shift+V'], [t('c_add'), 'Mod+Alt+M'], [t('print'), 'Mod+P']];
    dialog({ title: t('shortcuts'), width: '34rem', body: h('div.keys', Lk.map(([l, k]) => [h('span', l), h('kbd', K(k))])) });
  }
  const duplicate = async () => { await W.sync?.flush(); const r = await api('doc.duplicate', { doc: pid, title: `${t('copy_of')} ${W.title}`.slice(0, 160) }); location.hash = '#/d/' + r.doc.id; };
  const owner = data.doc.role === 'owner';
  /** The search of actions (⌘J / Ctrl+J): the tools of the grid, the workbook (the menu ⋮) and the sheets to go to. */
  function setCmds() {
    const E = editable && sheetOk(sh), one = (k) => tn(k, 1);
    commands([t('edit'), [E ? ['sliders-horizontal', t('format_cells'), () => formatDialog(), 'Mod+1'] : null, E ? ['arrow-up-to-line', one('ins_rows_above'), () => insert('r', false)] : null, E ? ['arrow-left-to-line', one('ins_cols_left'), () => insert('c', false)] : null,
      E ? ['arrow-down-a-z', t('sort'), () => sortDialog()] : null, E ? ['funnel', t(sh.filter ? 'filter_off' : 'filter_on'), () => toggleFilter(), 'Mod+Shift+L'] : null, E ? ['chart-column', t('insert_chart'), () => chartDialog()] : null,
      E ? ['paint-bucket', t('cond_format'), () => cfDialog()] : null, E ? ['list-collapse', t('dv_dropdown'), () => dvDialog('list')] : null, E ? ['square-check', t('dv_check'), () => dvDialog('check')] : null, E ? ['list-checks', t('validation'), () => dvDialog()] : null, ['square-function', t('g_title'), () => guide()], ['square-function', t('functions'), () => functionDialog()],
      W.canComment && can(data.doc.role, 'commenter') ? ['message-square', t('c_add'), () => startComment(), 'Mod+Alt+M'] : null, W.canComment ? ['sticky-note', t('n_add'), () => startComment(true)] : null,
      isOwner && !isLocal ? ['lock', t('protect_cells'), () => protectDialog(sh)] : null, editable ? ['plus', t('add_sheet'), () => addSheet(), 'Shift+F11'] : null, window.SavOffice?.bars ? ['settings-2', window.SavOffice.bars.menuLabel(), () => toolbarDialog()] : null]],
    [t('more'), [shareB ? ['user-plus', t('share'), () => shareB.click()] : null, lim.noDownload ? null : ['download', t('download'), () => downloadDialog()], ...moreItems().filter(Array.isArray).filter((x) => x[0] !== 'download' && x[2]).map(([ic, l, fn, o]) => [ic, l, fn, o?.kbd])]],
    [t('sheets'), book.sheets.filter((s) => !s.hidden && s !== sh).map((s) => ['sheet', s.name, () => switchTo(s.id)])]);
  }
  function moreItems() {
    return [...(mobile() && !S.user ? [['log-in', t('sign_in'), () => { location.hash = '#/signin'; }], '-'] : []),
      ['search', t('find'), () => setTab('find', true), { kbd: 'Mod+F' }], editable && !isLocal && data.doc.versions !== false ? ['history', t('history'), () => setTab('history', true)] : null, isOwner && !isLocal ? ['users', t('sheet_perm'), () => permDialog(sh)] : null, editable ? ['settings-2', t('book_settings'), () => W.settingsDialog()] : null, '-',
      mobile() && !lim.noDownload ? ['download', t('download'), () => downloadDialog()] : null, lim.noDownload ? null : ['printer', t('print'), () => printSheet(), { kbd: 'Mod+P' }], ['file-scan', t('page_guides_m', { p: t('paper_' + pagePrefs().paper.toLowerCase()) }), () => toggleGuides(), { check: pagePrefs().guides }], editable ? ['file-up', t('import_into'), () => import('./actions.js').then((a) => a.importInto(W))] : null,
      !isLocal && S.user && !lim.noCopy ? ['copy-plus', t('duplicate'), () => duplicate()] : null, ['link', t('copy_link'), () => copyText(`${location.origin}${location.pathname}#/d/${pid}`, t('link_copied'))], '-',
      !mobile() && window.SavOffice?.bars ? ['settings-2', window.SavOffice.bars.menuLabel(), () => toolbarDialog()] : null, ['keyboard', t('shortcuts'), () => shortcuts()], !owner && !isLocal ? ['flag', t('report'), () => reportDialog(pid)] : null];
  }
  zoomEl.addEventListener('change', (e) => { W.zoom = Math.max(0.5, Math.min(2, (+(e.detail?.value ?? zoomEl.value) || 100) / 100)); localStorage.setItem('savspreadsheets-zoom', W.zoom); disp = new Map(); grid.refresh(); drawCharts(); place(); });

  // ------------------------------------------------------------------ beginning and end

  buildToolbar();
  drawTabs();
  drawRail();
  drawCharts();
  // an address with a cell (#/d/<id>/<sheet>!B7) opens there
  const want = (location.hash.split('/')[3] || '').split('!');
  if (want[1] && book.sheets.some((s) => s.id === want[0])) { switchTo(want[0], true); const p = pos(want[1]); if (p) setSel(p[0], p[1]); }
  else if (W.sels?.[sh.id]) { const p = W.sels[sh.id]; setSel(p.r, p.c); } // where it was left last time
  W.ready = true;
  selected();
  if (!isLocal && !data.doc.review && !data.doc.deleted) {
    W.sync = new Sync({ pid, rev: data.doc.rev, role: data.doc.role, stamp: data.stamp, apply: (ops) => remote(ops), on: {
      busy: () => !!editing && W.sync.queue.length === 0 && false,
      state: (s) => setState(s), people: (p) => setPeople(p), comments: () => refreshComments(), refused: () => toast(t('locked_cells'), 'warning'),
      role: () => { toast(t('role_changed'), 'warning'); reload(); }, reload: (quiet) => { if (!quiet) toast(t('reloaded')); reload(); }, error: (e) => { toast(errText(e), 'danger', { duration: 0 }); setState('offline'); },
    } });
    if (editable) { const old = W.sync.recover(); if (old.length) { change(old, { record: false }); toast(t('recovered'), 'success'); } }
  }
  setState('saved');
  undoB && (undoB.button.disabled = true);
  redoB && (redoB.button.disabled = true);
  if (!coarse()) focusGrid();
  if (data.doc.deleted) toast(t('err_doc_in_trash'), 'warning');
  const unload = (e) => { if (editing) commit(0, 0, true); if (W.sync?.pending || saveT) { W.sync?.flush(); e.preventDefault(); } };
  addEventListener('beforeunload', unload);
  const relayout = () => { if (editing) place(); };
  wrap.addEventListener('scroll', relayout, { passive: true });
  W.close = () => {
    window.SavOffice?.exporter?.(null);
    if (editing) commit(0, 0, true);
    if (saveT) saveLocal();
    if (!isLocal && !data.doc.review && !data.doc.deleted && S.user) offline.put('doc:' + pid, { ...data, doc: { ...W.doc, title: W.title, rev: W.sync?.rev ?? data.doc.rev }, content: { settings: book.settings, sheets: book.sheets }, comments: W.comments || [] });
    W.sync?.flush().finally(() => W.sync.stop());
    grid.destroy();
    ac.remove();
    hint.remove();
    meter.remove();
    document.removeEventListener('copy', onCopy);
    document.removeEventListener('cut', onCut);
    document.removeEventListener('paste', onPaste);
    removeEventListener('beforeunload', unload);
    removeEventListener('keydown', docKey);
  };
  window.__sheet = W;
  void words; void isDateFormat; void machine; void item;
  return W;
}
