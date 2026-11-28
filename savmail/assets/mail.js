/**
 * The mail: the mailboxes and their folders on the side, the list of messages, the message open.
 *
 * Two kinds of view:
 *   all/<role>          the same folder of every mailbox at once (inbox, drafts, sent, archive, junk, trash): each mailbox
 *                       is asked in parallel (one request each) and the lists are merged by date. "More" asks each
 *                       mailbox for its next page only when its messages run out in the merged list.
 *   <mailbox>/<folder>  one folder of one mailbox.
 * Every row knows its mailbox and folder (a, f), so the actions work the same in both kinds of view.
 * On phones one pane at a time: the list, or the message; the folders in a drawer.
 */
import { btn, confirm, dialog, drop, dropBtn, empty, errText, fail, face, h, icon, iconBtn, mobile, put, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api, takeState } from './store.js';
import { commands, go, prefs, setPrefs } from './account.js';
import { ROLES, roleBox, shell, sumUnread } from './shell.js';

/** How often new mail is checked while the mail is on screen and the tab in front (settings: 30 s … 15 min, or by hand only). */
const every = () => { const v = Number(prefs().every ?? 60); return [30, 60, 120, 300, 600, 900, 0].includes(v) ? v : 60; };
const key = (m) => `${m.a}|${m.f}|${m.uid}`;
const acc = (id) => S.accounts.find((x) => x.id === id);
const enc = encodeURIComponent;

/** The state of the screen; it lives as long as the page (coming back from the settings keeps the folders). */
const M = { filter: '', view: null, rows: [], buf: {}, total: 0, sel: new Set(), open: null, q: '', loading: false, more: false, page: 0, gen: 0 };

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), l = getLang();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(l, { hour: '2-digit', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(l, { day: 'numeric', month: 'short' });
  return d.toLocaleDateString(l, { day: '2-digit', month: '2-digit', year: '2-digit' });
}
const longDate = (iso) => iso ? new Date(iso).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' }) : '';
const size = (n) => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1).replace('.0', '') + ' MB';
const who = (p) => p?.name || p?.email || t('nobody');

// ------------------------------------------------------------------ loading

/** Folders of every mailbox, in parallel; each mailbox that fails says so on the side instead of stopping the others. */
export async function loadFolders() {
  await Promise.all(S.accounts.map(async (a) => {
    try { const r = await api('ml.folders', null, { a: a.id }); S.folders[a.id] = { list: r.folders, special: r.special, err: null, labels: !!r.labels }; a.special = r.special; }
    catch (e) { if (e.code === 'vault_locked') throw e; S.folders[a.id] = { list: S.folders[a.id]?.list || [], special: S.folders[a.id]?.special || a.special || {}, err: e }; }
  }));
}

/** The first page of the view (or the next one: more). */
async function loadList(more = false) {
  const v = M.view, gen = more ? M.gen : ++M.gen;
  M.loading = true;
  if (!more) { M.rows = []; M.buf = {}; M.page = 0; M.more = false; M.total = 0; }
  try {
    if (v.kind === 'box') {
      const r = await api('ml.list', null, { a: v.a, f: v.f, page: more ? M.page + 1 : 0, q: M.q, filter: M.filter });
      if (gen !== M.gen) return;
      if (more) M.page++;
      M.rows.push(...r.messages.map((m) => ({ ...m, a: v.a, f: v.f })));
      M.total = r.total; // null: not known yet (the attachments filter looks at the messages a block at a time)
      M.more = typeof r.more === 'boolean' ? r.more : (M.page + 1) * r.pageSize < r.total;
    } else await fillAll(gen, M.rows.length + 50);
  } finally { if (gen === M.gen) M.loading = false; }
}

/** The merged list of a role: the newest message among the heads of every mailbox, until $want are shown. */
async function fillAll(gen, want) {
  const role = M.view.role;
  for (const a of S.accounts) {
    if (M.buf[a.id]) continue;
    const f = roleBox(a, role);
    M.buf[a.id] = f ? { f, rows: [], page: -1, done: false, total: 0 } : { f: null, rows: [], page: -1, done: true, total: 0 };
  }
  const fetchNext = async (id) => {
    const b = M.buf[id];
    try {
      const r = await api('ml.list', null, { a: id, f: b.f, page: b.page + 1, q: M.q, filter: M.filter.startsWith('label:') ? '' : M.filter });
      b.page++;
      b.rows.push(...r.messages.map((m) => ({ ...m, a: id, f: b.f })));
      b.total = r.total ?? null;
      b.done = typeof r.more === 'boolean' ? !r.more : (b.page + 1) * r.pageSize >= r.total;
    } catch (e) { if (e.code === 'vault_locked') throw e; b.done = true; b.err = e; }
  };
  while (M.rows.length < want) {
    const empty = Object.keys(M.buf).filter((id) => !M.buf[id].done && !M.buf[id].rows.length);
    if (empty.length) { await Promise.all(empty.map(fetchNext)); if (gen !== M.gen) return; continue; }
    let best = null;
    for (const b of Object.values(M.buf)) if (b.rows.length && (!best || String(b.rows[0].date) > String(best.rows[0].date))) best = b;
    if (!best) break;
    M.rows.push(best.rows.shift());
  }
  M.total = Object.values(M.buf).some((b) => b.total === null) ? null : Object.values(M.buf).reduce((s, b) => s + b.total, 0);
  M.more = Object.values(M.buf).some((b) => b.rows.length || !b.done);
  const errs = Object.entries(M.buf).filter(([, b]) => b.err);
  if (errs.length) toast(t('some_failed', { list: errs.map(([id]) => acc(id)?.email).join(', ') }), 'warning');
}

// ------------------------------------------------------------------ actions on messages

/** The messages chosen: the selection, or the one open. */
const picked = () => M.sel.size ? M.rows.filter((m) => M.sel.has(key(m))) : M.open ? M.rows.filter((m) => key(m) === key(M.open)).concat(M.rows.some((m) => key(m) === key(M.open)) ? [] : [M.open]) : [];
/** Groups by mailbox and folder: one request each. */
const groups = (list) => { const g = new Map(); for (const m of list) { const k = m.a + '|' + m.f; if (!g.has(k)) g.set(k, { a: m.a, f: m.f, uids: [] }); g.get(k).uids.push(m.uid); } return [...g.values()]; };

async function act(kind, list = picked(), extra = {}) {
  if (!list.length) return;
  const gone = kind === 'move' || kind === 'delete';
  for (const g of groups(list)) {
    if (kind === 'seen' || kind === 'flagged') await api('ml.flag', { a: g.a, f: g.f, uids: g.uids, flag: kind, on: extra.on });
    else if (kind === 'move') await api('ml.move', { a: g.a, f: g.f, uids: g.uids, to: extra.to });
    else if (kind === 'delete') await api('ml.delete', { a: g.a, f: g.f, uids: g.uids });
  }
  const ks = new Set(list.map(key));
  if (gone) {
    const idx = M.rows.findIndex((m) => ks.has(key(m)));
    M.rows = M.rows.filter((m) => !ks.has(key(m)));
    if (M.total !== null) M.total = Math.max(0, M.total - list.length);
    if (M.open && ks.has(key(M.open))) {
      const next = !mobile() && M.rows[Math.min(idx, M.rows.length - 1)];
      M.open = null;
      if (next) openMessage(next); else showReader();
    }
    M.sel.clear();
    toast(t(kind === 'delete' ? 'deleted_n' : 'moved_n', { n: list.length }), 'success');
  } else for (const m of M.rows) if (ks.has(key(m))) m[kind] = !!extra.on;
  if (M.open && ks.has(key(M.open))) M.open[kind] = !!extra.on;
  drawList();
  refreshCounts();
}

// ------------------------------------------------------------------ the screen

let els = null, timer = 0;

export async function mailScreen(root, path, compose) {
  if (!S.accounts.length) { const { reroute } = await import('./app.js'); S.vault = 'empty'; reroute(); return; }
  // #/m/all/<role> · #/m/<mailbox>/<folder>[/<uid>]
  const [p0 = 'all', p1 = 'inbox', p2 = ''] = path;
  let view = p0 === 'all' ? { kind: 'all', role: ROLES.some((r) => r[0] === p1) ? p1 : 'inbox' } : acc(p0) ? { kind: 'box', a: p0, f: p1 || 'INBOX' } : { kind: 'all', role: 'inbox' };
  // with one mailbox the folders of "all" are simply its own
  if (view.kind === 'all' && S.accounts.length === 1) view = { kind: 'box', a: S.accounts[0].id, f: roleBox(S.accounts[0], view.role) || 'INBOX' };
  const same = M.view && JSON.stringify(M.view) === JSON.stringify(view) && root.contains(els?.list);
  if (!same) { M.view = view; M.sel.clear(); M.q = ''; M.filter = ''; if (!els || !root.contains(els?.list)) build(root); }
  else if (!root.contains(els?.list)) build(root);
    drawNav();
  setTitle();
  if (!Object.keys(S.folders).length) loadFolders().then(() => { drawNav(); setTitle(); }).catch(fail);
  if (!same) {
    put(els.list, skeleton());
    els.head.replaceChildren(listHead());
    try { await loadList(); } catch (e) { if (e.code === 'vault_locked') throw e; put(els.list, empty('circle-alert', errText(e), e.data?.server || '', btn(t('retry'), { onclick: () => mailScreen(root, path, compose) }))); return stop; }
    drawList();
  }
  if (p2 && view.kind === 'box') openMessage({ a: view.a, f: view.f, uid: +p2 }, true);
  else if (!p2 && M.open && same) { /* keep it */ } else if (!p2) { M.open = null; showReader(); }
  els.root.dataset.pane = p2 ? 'read' : 'list';
  if (compose) { const { composeDialog } = await import('./compose.js'); composeDialog({ mode: 'new', to: compose.get('to') || '' }); history.replaceState(null, '', '#/'); }
  clearInterval(timer);
  if (every()) timer = setInterval(poll, every() * 1000);
  addEventListener('keydown', keys);
  setCommands();
  return stop;
}
function stop() { clearInterval(timer); removeEventListener('keydown', keys); document.body.classList.remove('inapp'); }

function build(root) {
  const list = h('div.mrows', { role: 'listbox', 'aria-multiselectable': 'true', tabindex: '-1' });
  const head = h('div.mlhead');
  const read = h('section.mread', { 'aria-live': 'polite' });
  const search = h('sav-input.msearch', { type: 'search', placeholder: t('search_mail'), size: 'sm', clearable: true, 'aria-label': t('search_mail') }, h('sav-icon', { name: 'search', slot: 'prefix' }));
  let st = 0;
  search.addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => { if (search.value.trim() === M.q) return; M.q = search.value.trim(); reload(); }, 450); });
  search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { clearTimeout(st); M.q = search.value.trim(); reload(); } if (e.key === 'Escape') search.blur(); });
  const fab = h('sav-button.mfab', { variant: 'primary', appearance: 'solid', icon: 'square-pen', label: t('compose'), onclick: () => openCompose({ mode: 'new' }) });
  const frame = shell(root, { fixed: true, current: current(), search, compose: () => openCompose({ mode: 'new' }) });
  const listPane = h('section.mlist', head, list);
  const r = h('div.mail', { 'data-pane': 'list' }, listPane, read, fab);
  put(frame.main, r);
  els = { root: r, frame, list, head, read, search, listPane };
  // more messages when the end of the list comes into view
  const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && M.more && !M.loading) more(); }, { root: list, rootMargin: '300px' });
  els.sentinel = h('div.msent');
  io.observe(els.sentinel);
  showReader();
}
/** The item of the side menu of this view. */
const current = (v = M.view) => v.kind === 'all' ? 'all:' + v.role : `f:${v.a}:${v.f}`;

const skeleton = () => h('div.skel', Array.from({ length: 8 }, () => h('div.srow', h('sav-skeleton', { variant: 'circle', style: 'width:32px;height:32px' }), h('div.grow', h('sav-skeleton', { style: 'width:40%' }), h('sav-skeleton', { style: 'width:80%;margin-top:.4rem' })))));

function viewName(v = M.view) {
  if (v.kind === 'all') return t('role_' + v.role);
  const f = S.folders[v.a]?.list?.find((x) => x.raw === v.f);
  return f ? (f.role ? t('role_' + f.role) : f.name.split(f.delim || '/').pop()) : v.f === 'INBOX' ? t('role_inbox') : v.f;
}
function setTitle() {
  const unread = M.view.kind === 'all' ? sumUnread(M.view.role) : (S.folders[M.view.a]?.list?.find((x) => x.raw === M.view.f)?.unread || 0);
  document.title = (unread ? `(${unread}) ` : '') + viewName() + ' – SavMail';
}
function drawNav() { els?.frame.setCurrent(current()); }


/**
 * The icon of the sender's domain on the avatar (lib/icons.php fetches it, so the sender never sees the reader): asked once
 * per domain and page; while it comes, and when there is none, the initials stay. Free mail (gmail.com…) keeps the initials.
 */
const FREE = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'outlook.it', 'hotmail.com', 'hotmail.it', 'live.com', 'live.it', 'msn.com', 'yahoo.com', 'yahoo.it', 'ymail.com', 'rocketmail.com',
  'icloud.com', 'me.com', 'mac.com', 'libero.it', 'virgilio.it', 'tiscali.it', 'alice.it', 'tim.it', 'fastwebnet.it', 'email.it', 'inwind.it', 'iol.it', 'blu.it', 'giallo.it', 'aol.com', 'gmx.com',
  'gmx.net', 'gmx.de', 'gmx.it', 'web.de', 'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me', 'tutanota.com', 'tuta.io', 'zoho.com', 'mail.com', 'yandex.com', 'yandex.ru', 'qq.com', '163.com',
  'pec.it', 'legalmail.it', 'postecert.it']);
const ICONS = new Map();
function senderIcon(av, email) {
  const dom = String(email || '').split('@')[1]?.toLowerCase();
  if (!dom || FREE.has(dom) || prefs().icons === false || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom)) return av;
  const url = `api/?r=ml.icon&d=${enc(dom)}`;
  let p = ICONS.get(dom);
  if (!p) { p = new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false); im.src = url; }); ICONS.set(dom, p); }
  p.then((ok) => { if (ok) { av.setAttribute('image', url); av.classList.add('logo'); } });
  return av;
}

// ------------------------------------------------------------------ the list

function listHead() {
  const all = h('sav-checkbox.selall', { 'aria-label': t('select_all') });
  all.addEventListener('change', () => { if (all.checked) M.rows.forEach((m) => M.sel.add(key(m))); else M.sel.clear(); drawList(); });
  const title = h('div.lttl', h('h1', viewName()), h('small.muted.lcount', ''));
  const bulk = h('div.bulk', { hidden: true },
    iconBtn('archive', t('archive'), () => act('move', picked(), { to: 'archive' })),
    iconBtn('octagon-alert', t('spam'), () => act('move', picked(), { to: 'junk' })),
    iconBtn('trash', t('delete'), () => act('delete')),
    iconBtn('mail-open', t('mark_read'), () => act('seen', picked(), { on: true })),
    iconBtn('mail', t('mark_unread'), () => act('seen', picked(), { on: false })),
    iconBtn('star', t('star'), () => act('flagged', picked(), { on: true })),
    moveMenu(() => picked()));
  els.bulk = bulk; els.selall = all; els.lcount = title.querySelector('.lcount');
  // checking for new mail belongs to the folder on screen: at the end of its row (it turns while it works)
  // the icon is inside the button (not its icon attribute) so that it can turn; while it turns the button does nothing
  const btnR = h('sav-button.lrefresh', { appearance: 'ghost', variant: 'neutral', size: 'sm', square: true, label: t('refresh') }, h('sav-icon', { name: 'refresh-cw' }));
  btnR.addEventListener('click', () => { refresh(true).catch(fail); });
  const again = h('sav-tooltip', { content: t('refresh'), placement: 'bottom', delay: 350 }, btnR);
  els.again = btnR;
  spin(!!refreshing);
  // filtering the list (the mail server does it, over the whole folder): read, unread, starred, attachments, a Gmail label
  const fbtn = h('sav-button.lfilter', { appearance: 'ghost', variant: 'neutral', size: 'sm', square: true, label: t('filter'), title: t('filter') }, h('sav-icon', { name: 'filter' }));
  const fdrop = drop(fbtn, () => {
    // one choice: the chosen one shows a tick in place of its icon (plain items, so the menu closes on a choice)
    const opt = (v, ic, label) => [M.filter === v ? 'check' : ic, label, () => setFilter(v), { style: M.filter === v ? 'font-weight:600' : null }];
    const a = M.view.kind === 'box' ? S.folders[M.view.a] : null;
    const labels = a?.labels ? (a.list || []).filter((f) => !f.role && f.raw !== M.view.f).slice(0, 60) : [];
    return [{ head: t('show') }, opt('', 'inbox', t('f_all')), opt('unread', 'mail', t('f_unread')), opt('read', 'mail-open', t('f_read')), opt('flagged', 'star', t('f_flagged')), opt('att', 'paperclip', t('f_att')),
      labels.length ? '-' : null, labels.length ? { head: t('f_label') } : null, ...labels.map((f) => opt('label:' + f.raw, 'folder', f.name.split(f.delim || '/').join(' › ')))];
  }, { placement: 'bottom-end', label: t('filter') });
  els.filterBtn = fbtn;
  return h('div.lbar', all, title, h('div.spacer'), fdrop, again, bulk);
}

function row(m) {
  const k = key(m), a = acc(m.a), sentish = /^(sent|drafts)$/.test(M.view.kind === 'all' ? M.view.role : (S.folders[m.a]?.list?.find((f) => f.raw === m.f)?.role || ''));
  const person = sentish ? (m.to?.[0] || m.from) : m.from;
  const cb = h('sav-checkbox.rsel', { checked: M.sel.has(k), 'aria-label': t('select') });
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => { cb.checked ? M.sel.add(k) : M.sel.delete(k); markSel(); });
  // the icon inside the button (not its icon attribute), so a starred message shows a full yellow star
  const star = h('sav-button.rstar' + (m.flagged ? '.on' : ''), { appearance: 'ghost', size: 'sm', square: true, label: t(m.flagged ? 'unstar' : 'star') }, h('sav-icon', { name: m.flagged ? 'star-full' : 'star' }));
  star.addEventListener('click', (e) => { e.stopPropagation(); act('flagged', [m], { on: !m.flagged }).catch(fail); });
  const av = senderIcon(face(who(person), null, 34), person?.email);
  const el = h('div.mrow' + (m.seen ? '' : '.unread') + (M.open && key(M.open) === k ? '.active' : '') + (M.sel.has(k) ? '.sel' : ''), { role: 'option', tabindex: 0, 'aria-selected': String(M.sel.has(k)), 'data-k': k },
    h('div.rpick', av, cb),
    h('div.rbody',
      h('div.rl1', h('span.rfrom', sentish ? t('to_x', { x: who(person) }) : who(person)), m.draft ? h('span.rdraft', t('draft')) : null, h('span.spacer'),
        m.att ? icon('paperclip', { class: 'ratt', label: t('attachments') }) : null,
        M.view.kind === 'all' && S.accounts.length > 1 ? h('span.adot.small', { style: `--c:${a?.color || '#8f6500'}`, title: a?.email }) : null,
        h('time.rdate', { datetime: m.date || '' }, fmtDate(m.date))),
      h('div.rl2', h('span.rsubj', m.subject || t('no_subject')), m.answered ? icon('reply', { class: 'rans', label: t('answered') }) : null)),
    star);
  // what can be done with this message (with the ones chosen, when it is one of them): its right click and ⌘J (SavOffice.context)
  el.soMenu = () => {
    const list = M.sel.has(k) && M.sel.size > 1 ? picked() : [m], one = list.length === 1;
    return [
      one ? ['mail-open', t('open'), () => (m.draft || S.folders[m.a]?.list?.find((f) => f.raw === m.f)?.role === 'drafts' ? openDraft(m) : openMessage(m))] : { head: t('n_selected', { n: list.length }) },
      one && !m.draft ? ['reply', t('reply'), () => openCompose({ mode: 'reply', msg: m })] : null, one && !m.draft ? ['reply-all', t('reply_all'), () => openCompose({ mode: 'all', msg: m })] : null, one && !m.draft ? ['forward', t('forward'), () => openCompose({ mode: 'forward', msg: m })] : null, '-',
      list.every((x) => x.seen) ? ['mail', t('mark_unread'), () => act('seen', list, { on: false }).catch(fail)] : ['mail-open', t('mark_read'), () => act('seen', list, { on: true }).catch(fail)],
      list.every((x) => x.flagged) ? ['star-off', t('unstar'), () => act('flagged', list, { on: false }).catch(fail)] : ['star', t('star'), () => act('flagged', list, { on: true }).catch(fail)], '-',
      ['archive', t('archive'), () => act('move', list, { to: 'archive' }).catch(fail)], ['octagon-alert', t('spam'), () => act('move', list, { to: 'junk' }).catch(fail)], ['trash', t('delete'), () => act('delete', list).catch(fail), { danger: true }],
    ].filter(Boolean);
  };
  el.addEventListener('click', (e) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey) { M.sel.has(k) ? M.sel.delete(k) : M.sel.add(k); markSel(); return; }
    if (m.draft || (S.folders[m.a]?.list?.find((f) => f.raw === m.f)?.role === 'drafts')) { openDraft(m); return; }
    openMessage(m);
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
  return el;
}


const FILTERS = { unread: 'f_unread', read: 'f_read', flagged: 'f_flagged', att: 'f_att' };
function filterName() {
  if (!M.filter) return '';
  if (M.filter.startsWith('label:')) { const raw = M.filter.slice(6), f = M.view.kind === 'box' && S.folders[M.view.a]?.list?.find((x) => x.raw === raw); return t('f_label_x', { x: f ? f.name.split(f.delim || '/').pop() : raw }); }
  return t(FILTERS[M.filter] || 'f_all');
}
/** The filter button stands out while a filter is on. */
function paintFilter() {
  const b = els?.filterBtn;
  if (!b) return;
  b.setAttribute('variant', M.filter ? 'primary' : 'neutral');
  b.setAttribute('appearance', M.filter ? 'soft' : 'ghost');
  b.setAttribute('aria-pressed', String(!!M.filter));
  b.setAttribute('label', M.filter ? `${t('filter')}: ${filterName()}` : t('filter'));
  b.title = b.getAttribute('label');
}
function setFilter(v) {
  if (M.filter === v) return;
  M.filter = v;
  M.sel.clear();
  paintFilter();
  reload();
}

function markSel() {
  els.list.querySelectorAll('.mrow').forEach((r) => { const on = M.sel.has(r.dataset.k); r.classList.toggle('sel', on); r.setAttribute('aria-selected', String(on)); const c = r.querySelector('.rsel'); if (c && c.checked !== on) c.checked = on; });
  els.bulk.hidden = !M.sel.size;
  els.selall.checked = M.sel.size > 0 && M.sel.size === M.rows.length;
  els.selall.indeterminate = M.sel.size > 0 && M.sel.size < M.rows.length;
  els.root.classList.toggle('selecting', M.sel.size > 0);
}

function drawList() {
  if (!els) return;
  if (!M.rows.length) put(els.list, empty(M.q ? 'search' : 'inbox', M.q ? t('nothing_found') : t('folder_empty'), M.q ? t('nothing_found_t', { q: M.q }) : ''));
  else put(els.list, M.rows.map(row), M.more ? h('div.mmore', btn(t('load_more'), { size: 'sm', appearance: 'ghost', onclick: () => more() })) : null, els.sentinel);
  if (els.lcount) els.lcount.textContent = [M.total === null ? t('results_more', { n: M.rows.length }) : M.total ? (M.q || M.filter ? t(M.total === 1 ? 'results_1' : 'results_n', { n: M.total }) : t(M.total === 1 ? 'messages_1' : 'messages_n', { n: M.total })) : '', M.filter ? filterName() : ''].filter(Boolean).join(' · ');
  paintFilter();
  markSel();
}

async function more() {
  if (M.loading || !M.more) return;
  try { await loadList(true); drawList(); } catch (e) { fail(e); }
}
async function reload() {
  put(els.list, skeleton());
  try { await loadList(); drawList(); } catch (e) { put(els.list, empty('circle-alert', errText(e), e.data?.server || '')); }
}
async function refreshCounts() {
  await loadFolders().catch(() => {});
  drawNav();
  setTitle();
}
/** By hand (the button) or every few minutes: the counts, and the first page when nothing would move under the pointer. */
/** Only one check at a time: a second press (or the timer) waits for the one under way; the button turns meanwhile. */
let refreshing = null;
function spin(on) {
  const b = els?.again;
  if (!b) return;
  b.classList.toggle('spin', on);
  b.toggleAttribute('aria-busy', on);
  b.setAttribute('aria-disabled', String(on));
}
function refresh(hand) {
  if (refreshing) return refreshing;
  spin(true);
  refreshing = (async () => {
    await refreshCounts();
    const quiet = !M.sel.size && els.list.scrollTop < 40 && M.rows.length <= 50;
    if (hand || quiet) { const keep = M.open; await loadList().catch(fail); M.open = keep; drawList(); }
  })().finally(() => { refreshing = null; spin(false); });
  return refreshing;
}
function poll() { if (document.visibilityState === 'visible' && navigator.onLine !== false) refresh(false).catch(() => {}); }

// ------------------------------------------------------------------ moving

function moveMenu(list) {
  return dropBtn('folder', t('move_to'), () => {
    const sel = list();
    const ids = [...new Set(sel.map((m) => m.a))];
    if (ids.length !== 1) return [{ head: t('move_one_mailbox') }];
    const F = S.folders[ids[0]]?.list || [];
    return [{ head: t('move_to') }, ...F.filter((f) => !sel.every((m) => m.f === f.raw)).map((f) => [ROLES.find((r) => r[0] === f.role)?.[1] || 'folder', f.role ? t('role_' + f.role) : f.name, () => act('move', sel, { to: f.raw })])];
  }, { caret: false });
}

// ------------------------------------------------------------------ the message

function showReader(content) {
  if (!els) return;
  if (!content) put(els.read, h('div.rempty', empty('mail', t('pick_message'), M.rows.length ? '' : '')));
  else put(els.read, content);
}

async function openMessage(m, fromUrl = false) {
  M.open = { ...m };
  els.list.querySelectorAll('.mrow.active').forEach((r) => r.classList.remove('active'));
  els.list.querySelector(`.mrow[data-k="${CSS.escape(key(m))}"]`)?.classList.add('active');
  els.root.dataset.pane = 'read';
  const href = `#/m/${enc(m.a)}/${enc(m.f)}/${m.uid}`;
  if (M.view.kind === 'box' && location.hash !== href) history.replaceState(history.state, '', href);
  // on phones the message is a step of its own: Back closes it
  if (mobile() && !fromUrl && !history.state?.ml) history.pushState({ ml: 1 }, '', location.href);
  showReader(h('div.rload', h('sav-spinner')));
  const images = prefs().images === 'always' || prefs().imgFrom?.includes(m.from?.email);
  try {
    const r = await api('ml.msg', null, { a: m.a, f: m.f, uid: m.uid, images: images ? 1 : '' });
    if (!M.open || key(M.open) !== key(m)) return;
    Object.assign(M.open, r.message);
    const inList = M.rows.find((x) => key(x) === key(m));
    if (inList && !inList.seen) { inList.seen = true; els.list.querySelector(`.mrow[data-k="${CSS.escape(key(m))}"]`)?.classList.remove('unread'); refreshCounts(); }
    showReader(reader(M.open));
  } catch (e) {
    if (e.code === 'vault_locked') { dispatchEvent(new Event('savmail-locked')); return; }
    showReader(h('div.rempty', empty('circle-alert', errText(e), e.data?.server || '', btn(t('retry'), { onclick: () => openMessage(m, true) }))));
  }
}

function closeMessage() {
  if (history.state?.ml) { history.back(); return; } // popstate closes it
  doClose();
}
function doClose() {
  M.open = null;
  if (!els) return;
  els.root.dataset.pane = 'list';
  els.list.querySelectorAll('.mrow.active').forEach((r) => r.classList.remove('active'));
  showReader();
  if (M.view.kind === 'box' && /\/\d+$/.test(location.hash)) history.replaceState(null, '', `#/m/${enc(M.view.a)}/${enc(M.view.f)}`);
}
addEventListener('popstate', () => { if (els && M.open && !history.state?.ml) doClose(); });

/** The page shown inside the frame: the safe HTML of the message on white paper, with its own styles. No scripts can run in it. */
function frameDoc(m) {
  const csp = `default-src 'none'; img-src data: ${m.imagesShown ? 'https: http:' : ''}; style-src 'unsafe-inline'; font-src data:`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><base target="_blank">
<style>html{color-scheme:light}body{margin:0;padding:18px 20px;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Arial,sans-serif;color:#1d1b16;background:#fff;overflow-wrap:anywhere}
img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}blockquote{margin:.6em 0 .6em .3em;padding-left:.9em;border-left:3px solid #e2d9c3;color:#5c5546}
a{color:#7a5600}.plain{white-space:pre-wrap;font:inherit}.plain .q{color:#7a7262}</style><style>${m.css || ''}</style></head><body>${m.html || ''}</body></html>`;
}

function reader(m) {
  const a = acc(m.a);
  const frame = h('iframe.rframe', { sandbox: 'allow-same-origin allow-popups allow-popups-to-escape-sandbox', referrerpolicy: 'no-referrer', title: m.subject || t('message'), srcdoc: frameDoc(m) });
  const fit = () => { try { const d = frame.contentDocument; if (!d?.body) return; frame.style.height = Math.max(90, Math.ceil(d.body.getBoundingClientRect().height)) + 'px'; } catch { /* not ready */ } };
  frame.addEventListener('load', () => {
    fit();
    try {
      const d = frame.contentDocument;
      new ResizeObserver(fit).observe(d.body);
      d.querySelectorAll('img').forEach((i) => i.addEventListener('load', fit));
      // a mailto: link writes a message here; the others open in a new tab without saying where they come from
      d.addEventListener('click', (e) => { const l = e.target.closest?.('a[href]'); if (!l) return; const href = l.getAttribute('href'); if (/^mailto:/i.test(href)) { e.preventDefault(); openCompose({ mode: 'new', a: m.a, to: decodeURIComponent(href.slice(7).split('?')[0]) }); } });
    } catch { /* nothing to watch */ }
  });
  const showImages = async (always) => {
    if (always === 'sender') await setPrefs({ imgFrom: [...new Set([...(prefs().imgFrom || []), m.from?.email].filter(Boolean))].slice(-300) });
    const r = await api('ml.msg', null, { a: m.a, f: m.f, uid: m.uid, images: 1, peek: 1 });
    Object.assign(M.open, r.message, { imagesShown: true });
    showReader(reader(M.open));
  };
  if (prefs().images === 'always' || prefs().imgFrom?.includes(m.from?.email)) m.imagesShown = true;
  const held = m.held > 0 && !m.imagesShown ? h('sav-alert.held', { variant: 'neutral', appearance: 'soft' }, h('sav-icon', { name: 'image-off', slot: 'icon' }),
    h('div', h('b', t('held_n', { n: m.held })), h('div.small.muted', t('held_t'))),
    h('div.prow.wrap', btn(t('show_images'), { size: 'sm', onclick: () => showImages() }), m.from?.email ? btn(t('always_from', { x: m.from.email }), { size: 'sm', appearance: 'ghost', onclick: () => showImages('sender') }) : null)) : null;
  const people = (label, list) => list?.length ? h('div.rppl', h('span.muted', label + ' '), list.map((p, i) => h('span', { title: p.email }, (i ? ', ' : '') + who(p)))) : null;
  const tool = h('div.rtool',
    iconBtn('arrow-left', t('back'), () => closeMessage(), { class: 'rback' }),
    iconBtn('reply', t('reply'), () => openCompose({ mode: 'reply', msg: m }), { kbd: 'Alt+Shift+R' }),
    iconBtn('reply-all', t('reply_all'), () => openCompose({ mode: 'all', msg: m }), { kbd: 'Alt+Shift+A' }),
    iconBtn('forward', t('forward'), () => openCompose({ mode: 'forward', msg: m }), { kbd: 'Alt+Shift+F' }),
    h('span.tsep'),
    iconBtn('archive', t('archive'), () => act('move', [m], { to: 'archive' }), { kbd: 'Alt+Shift+E' }),
    iconBtn('octagon-alert', t('spam'), () => act('move', [m], { to: 'junk' })),
    iconBtn('trash', t('delete'), () => act('delete', [m]), { kbd: '#' }),
    h('span.tsep'),
    iconBtn('mail', t('mark_unread'), async () => { await act('seen', [m], { on: false }); closeMessage(); }, { kbd: 'Alt+Shift+U' }),
    iconBtn('star', t(m.flagged ? 'unstar' : 'star'), (b) => { act('flagged', [m], { on: !m.flagged }).then(() => b.on(m.flagged)).catch(fail); }),
    moveMenu(() => [m]));
  tool.querySelector('sav-tooltip:has([icon="star"])')?.on?.(m.flagged);
  // each attachment: a press shows it (previewAtt), the arrow on its side downloads it at once
  const atts = m.atts?.length ? h('div.ratts', h('div.small.muted', icon('paperclip'), ' ', t('attachments_n', { n: m.atts.length })), h('div.attl', m.atts.map((x, i) =>
    h('div.att', { title: x.name },
      h('button.attp', { type: 'button', onclick: () => previewAtt(m, i) }, icon(attKind(x).ic), h('span.attn', x.name), h('small', size(x.size))),
      h('a.attd', { href: attUrl(m, x), download: x.name, title: t('download'), 'aria-label': `${t('download')} ${x.name}` }, icon('download')))))) : null;
  return h('article.reader',
    tool,
    h('div.rscroll',
      h('h1.rtitle', m.subject || t('no_subject')),
      h('div.rhead', senderIcon(face(who(m.from), null, 40), m.from?.email), h('div.grow',
        h('div.rfromline', h('b', who(m.from)), m.from?.name ? h('span.muted', ` <${m.from.email}>`) : null),
        people(t('to'), m.to), people(t('cc'), m.cc)),
        h('div.rside', h('time.muted.small', { datetime: m.date || '' }, longDate(m.date)), S.accounts.length > 1 ? h('span.achip', { style: `--c:${a?.color}` }, a?.email) : null)),
      held, h('div.rpaper', frame), atts,
      m.unsubscribe && /^https:/.test(m.unsubscribe) ? h('p.small.muted.unsub', icon('bell-off'), ' ', h('a', { href: m.unsubscribe, target: '_blank', rel: 'noopener noreferrer' }, t('unsubscribe'))) : null,
      h('div.rquick', btn(t('reply'), { icon: 'reply', onclick: () => openCompose({ mode: 'reply', msg: m }) }), btn(t('forward'), { icon: 'forward', appearance: 'ghost', onclick: () => openCompose({ mode: 'forward', msg: m }) }))));
}


// ------------------------------------------------------------------ attachments: preview, or download at once

const attUrl = (m, x) => `api/?r=ml.att&a=${enc(m.a)}&f=${enc(m.f)}&uid=${m.uid}&part=${enc(x.part)}`;
const EXT = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', txt: 'text/plain', csv: 'text/csv', ics: 'text/calendar',
  json: 'application/json', xml: 'text/xml', md: 'text/markdown', eml: 'message/rfc822', html: 'text/html', htm: 'text/html', log: 'text/plain', vcf: 'text/vcard' };
/** What an attachment is, from its type or (when the sender said "octet-stream") from its name: how it is shown and its icon. */
function attKind(x) {
  let type = String(x.type || '').toLowerCase();
  if (!type || type === 'application/octet-stream') type = EXT[String(x.name).split('.').pop().toLowerCase()] || type;
  if (/^image\/(png|jpeg|gif|webp|bmp|svg\+xml|avif)$/.test(type)) return { k: 'image', type, ic: 'image' };
  if (type === 'application/pdf') return { k: 'pdf', type, ic: 'file-text' };
  if (/^video\/(mp4|webm|ogg|quicktime)$/.test(type)) return { k: 'video', type, ic: 'file-text' };
  if (/^audio\//.test(type)) return { k: 'audio', type, ic: 'file-text' };
  if (/^text\//.test(type) || /^(application\/(json|xml)|message\/rfc822)$/.test(type)) return { k: 'text', type, ic: 'file-text' };
  return { k: 'none', type, ic: 'paperclip' };
}

/**
 * The preview of the attachments of a message, as in SavDrive: one at a time in the large dialog, arrows to the others,
 * "Download" below. The file is read as data and shown with a type chosen here, never as a page of this site: pictures
 * (SVG too, as a picture: no script runs in it), PDF in the viewer of the browser, video and audio, texts as plain text
 * (an HTML file shows its source). Anything else: no preview, the download.
 */
function previewAtt(m, start) {
  const list = m.atts;
  let i = start, url = null, turn = 0;
  const stage = h('div.pvstage'), info = h('div.pvinfo');
  const free = () => { if (url) URL.revokeObjectURL(url); url = null; };
  const none = (x, text) => h('div.pvnone', h('span.tic.big', icon(attKind(x).ic)), h('b', x.name), h('p.muted', text));
  const show = async () => {
    const x = list[i], k = attKind(x), n = ++turn;
    free();
    d.setAttribute('label', x.name);
    put(info, h('small.muted', size(x.size)), h('span.grow'), h('sav-button', { size: 'sm', icon: 'download', href: attUrl(m, x), download: x.name }, t('download')));
    if (k.k === 'none') return put(stage, none(x, t('pv_none')));
    if (x.size > 30 * 1048576) return put(stage, none(x, t('pv_big')));
    put(stage, h('sav-spinner', { style: 'font-size:2rem' }));
    try {
      const r = await fetch(attUrl(m, x), { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) throw new Error();
      const buf = await r.arrayBuffer();
      if (n !== turn) return;
      if (k.k === 'text') { const txt = new TextDecoder().decode(buf.slice(0, 400000)); return put(stage, h('pre.pvtext', txt + (buf.byteLength > 400000 ? '\n…' : ''))); }
      url = URL.createObjectURL(new Blob([buf], { type: k.type }));
      if (k.k === 'image') put(stage, h('img.pvimg', { src: url, alt: x.name }));
      else if (k.k === 'pdf') put(stage, h('iframe.pvpdf', { src: url, title: x.name }));
      else if (k.k === 'video') put(stage, h('video.pvvid', { src: url, controls: true, playsinline: true }));
      else put(stage, h('div.pvaud', icon('file-text'), h('audio', { src: url, controls: true })));
    } catch { if (n === turn) put(stage, none(x, t('pv_failed'))); }
  };
  const nav = (dir) => { if (list.length < 2) return; i = (i + dir + list.length) % list.length; show(); };
  const prev = iconBtn('chevron-left', t('previous'), () => nav(-1), { class: 'pvnav l' }), next = iconBtn('chevron-right', t('next'), () => nav(1), { class: 'pvnav r' });
  const d = dialog({ title: list[i].name, width: '72rem', cls: 'pv', body: [h('div.pvwrap', list.length > 1 ? prev : null, stage, list.length > 1 ? next : null), info], onclose: free });
  d.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') nav(-1); else if (e.key === 'ArrowRight') nav(1); });
  show();
}

// ------------------------------------------------------------------ writing

async function openCompose(o) {
  const { composeDialog } = await import('./compose.js');
  const a = o.a || o.msg?.a || (M.view.kind === 'box' ? M.view.a : S.accounts[0].id);
  composeDialog({ ...o, a, sent: () => { if (/^(sent|drafts)$/.test(M.view.kind === 'all' ? M.view.role : '') || M.view.kind === 'box') setTimeout(() => refresh(false), 800); if (o.msg) { const r = M.rows.find((x) => key(x) === key(o.msg)); if (r && o.mode !== 'forward') { r.answered = true; drawList(); } } } });
}
async function openDraft(m) {
  try {
    const r = await api('ml.msg', null, { a: m.a, f: m.f, uid: m.uid, peek: 1, images: 1 });
    openCompose({ mode: 'draft', msg: { ...m, ...r.message }, a: m.a });
  } catch (e) { fail(e); }
}

// ------------------------------------------------------------------ keys and ⌘J

function keys(e) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || document.querySelector('sav-dialog[open]') || /^(input|textarea|sav-input|sav-chip-input)$/i.test(e.target.localName || '') || e.target.isContentEditable) return;
  // a letter is a shortcut only with ⌥⇧ (Alt+Shift), never alone: read from the key itself (on a Mac ⌥ changes the character)
  const L = e.altKey && e.shiftKey && /^Key[A-Z]$/.test(e.code) ? e.code[3].toLowerCase() : null;
  if ((e.altKey && !L) || (!L && /^[a-z]$/i.test(e.key))) return;
  const i = M.open ? M.rows.findIndex((x) => key(x) === key(M.open)) : -1;
  const k = L || e.key;
  if (k === 'c') { e.preventDefault(); openCompose({ mode: 'new' }); }
  else if (k === '/') { e.preventDefault(); els.search.focus(); }
  else if (k === 'ArrowDown' && !L && M.rows[i + 1]) { e.preventDefault(); openMessage(M.rows[i + 1]); }
  else if (k === 'ArrowUp' && !L && i > 0) { e.preventDefault(); openMessage(M.rows[i - 1]); }
  else if (!M.open && !M.sel.size) return;
  else if (k === 'r' && M.open?.html !== undefined) openCompose({ mode: 'reply', msg: M.open });
  else if (k === 'a' && M.open?.html !== undefined) openCompose({ mode: 'all', msg: M.open });
  else if (k === 'f' && M.open?.html !== undefined) openCompose({ mode: 'forward', msg: M.open });
  else if (k === 'e') act('move', picked(), { to: 'archive' }).catch(fail);
  else if (k === '#' || k === 'Delete') act('delete').catch(fail);
  else if (k === 'u' && M.open) act('seen', picked(), { on: false }).then(closeMessage).catch(fail);
  else if (k === 'Escape') { if (M.sel.size) { M.sel.clear(); drawList(); } else if (M.open) closeMessage(); }
}

function setCommands() {
  commands([t('mail'), [
    ['square-pen', t('compose'), () => openCompose({ mode: 'new' }), 'Alt+Shift+C'],
    ['search', t('search_mail'), () => els.search.focus(), '/'],
    ['refresh-cw', t('refresh'), () => refresh(true)],
    ...(S.accounts.length > 1 ? ROLES.map(([r, ic]) => [ic, t('all_x', { x: t('role_' + r) }), '#/m/all/' + r]) : ROLES.map(([r, ic]) => roleBox(S.accounts[0], r) ? [ic, t('role_' + r), `#/m/${enc(S.accounts[0].id)}/${enc(roleBox(S.accounts[0], r))}`] : null)),
    ['at-sign', t('g_mailboxes'), '#/addresses'],
  ]]);
}

export { takeState, go, confirm, drop };
