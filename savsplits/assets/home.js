/**
 * Home: the groups of the account (and My spending, #/spending: assets/budget.js, beside the same side menu), as in SavSchedules, SavDocuments and SavPresentations: the side with "New", the views
 * and two numbers; the title with sort, grid or list and "Open a file"; the box to start a group from a template; the cards.
 */
import { btn, confirm, copyText, dialog, drop, empty, fail, h, icon, iconBtn, item, primary, put, select, tile, toast } from './ui.js';
import { t, when } from './i18n.js';
import { S, api, loadGroups } from './store.js';
import { brand, commands, credit, go, prefs, setPrefs, userMenu } from './account.js';
import { curOptions, money } from './money.js';

/** The templates of a group: [kind, icon, colour]. The condominium starts with a table of thousandths. */
export const KINDS = [['trip', 'plane', '#1f56d1'], ['home', 'house', '#0b7a87'], ['couple', 'heart', '#c2307a'], ['event', 'party-popper', '#6a2cf0'], ['team', 'users', '#0f8a63'], ['condo', 'building', '#4a5875'], ['personal', 'user', '#7a5c3e'], ['generic', 'wallet', '#1a7f37']];
export const kindOf = (k) => KINDS.find((x) => x[0] === k) || KINDS[KINDS.length - 1];
export const groupIcon = (g) => g.icon || kindOf(g.kind)[1];
const linkUrl = (code) => location.origin + location.pathname.replace(/[^/]*$/, '') + '#/j/' + code;

/** What a balance means for the account: "you get back", "you owe", "settled up". */
export function balanceText(v, cur) {
  if (v === null || v === undefined) return [t('not_member'), 'none'];
  if (v > 0) return [t('you_get', { a: money(v, cur) }), 'pos'];
  if (v < 0) return [t('you_owe', { a: money(-v, cur) }), 'neg'];
  return [t('settled'), 'zero'];
}

/** The picture of a card: the icon of the group on its colour, what the account gets back or owes, the kind. */
function thumb(g) {
  // a personal group has no balance: what was spent this month
  if (g.kind === 'personal') return h('div.cthumb', { style: `--c:${g.color}` }, h('div.gtile', icon(groupIcon(g))), h('div.tstat', h('strong', money(g.month || 0, g.currency)), h('small', t('spent_month'))), h('span.ckind', icon('user')));
  const v = g.balance;
  const stat = v === null ? h('div.tstat', h('strong', money(g.total, g.currency)), h('small', t('spent'))) : h('div.tstat', h('strong.' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'), v ? money(Math.abs(v), g.currency) : t('settled')), h('small', v > 0 ? t('to_get') : v < 0 ? t('to_give') : t('n_expenses', { n: g.expenses })));
  return h('div.cthumb', { style: `--c:${g.color}` }, h('div.gtile', icon(groupIcon(g))), stat, h('span.ckind', icon(kindOf(g.kind)[1])));
}

export async function homeScreen(root, view = '') {
  let term = '';
  const mode = () => prefs().view || 'grid';
  const main = h('main.hmain'), side = h('nav.hside', { 'aria-label': t('my_groups') });
  const q = h('sav-input', { type: 'search', placeholder: t('search_groups'), 'aria-label': t('search'), clearable: true, pill: true }, icon('search', { slot: 'prefix' }));
  q.addEventListener('input', () => { term = q.value.trim().toLowerCase(); draw(); });
  q.addEventListener('sav-clear', () => { term = ''; draw(); });
  put(root, h('div.home', h('header.htop', brand(), h('div.hsearch', q), h('div.spacer'), userMenu()), h('div.hbody', side, main), credit()));
  put(main, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' })));
  await loadGroups();
  const reload = async () => { await loadGroups(); draw(); };

  const V = {
    '': ['all_groups', 'layout-grid', () => S.groups.filter((g) => !g.archived)],
    spending: ['my_spending', 'pie-chart', () => []],
    get: ['v_get', 'arrow-down-left', () => S.groups.filter((g) => !g.archived && g.balance > 0)],
    owe: ['v_owe', 'arrow-up-right', () => S.groups.filter((g) => !g.archived && g.balance < 0)],
    mine: ['v_mine', 'user', () => S.groups.filter((g) => !g.archived && g.owner)],
    archived: ['archived', 'archive', () => S.groups.filter((g) => g.archived)],
  };
  if (!V[view]) view = '';

  function drawSide() {
    const count = { get: V.get[2]().length, owe: V.owe[2]().length, archived: V.archived[2]().length, spending: S.capsOver };
    const it = (v) => { const x = item(v, V[v][1], t(V[v][0])); x.toggleAttribute('current', view === v); if (count[v]) x.append(h('sav-badge', { slot: 'suffix', appearance: 'soft', variant: v === 'spending' ? 'danger' : 'neutral', pill: true, title: v === 'spending' ? t(count[v] === 1 ? 'caps_over_1' : 'caps_over_n', { n: count[v] }) : null }, v === 'spending' ? '!' : String(count[v]))); return x; };
    const menu = h('sav-menu', { label: t('my_groups'), selectable: true }, Object.keys(V).map(it));
    menu.addEventListener('sav-select', (e) => go('#/' + e.detail.value));
    // the two numbers: in the currency of most groups
    const by = {};
    for (const g of S.groups) if (!g.archived) by[g.currency] = (by[g.currency] || 0) + 1;
    const cur = Object.keys(by).sort((a, b) => by[b] - by[a])[0] || prefs().currency || 'EUR';
    const sum = (f) => S.groups.filter((g) => !g.archived && g.currency === cur && g.balance && f(g.balance)).reduce((a, g) => a + Math.abs(g.balance), 0);
    put(side, primary(t('new_group'), { icon: 'plus', size: 'lg', block: true, class: 'newbtn', onclick: () => newGroupDialog() }), menu,
      h('div.sidebox', h('div', h('strong.pos', money(sum((v) => v > 0), cur)), h('small.muted', t('to_get'))), h('div', h('strong.neg', money(sum((v) => v < 0), cur)), h('small.muted', t('to_give')))),
      btn(t('open_link'), { icon: 'link', appearance: 'ghost', size: 'sm', class: 'sidelink', onclick: () => joinDialog() }));
  }

  function menuOf(g) {
    return [['arrow-right', t('open'), () => go('#/g/' + g.id)],
      g.kind === 'personal' ? null : ['link', t('copy_link'), async () => { const d = await api('splits.group', undefined, { id: g.id }); if (d.group.link) copyText(linkUrl(d.group.link), t('link_copied')); else toast(t('share_ask_owner'), 'neutral'); }],
      ['download', t('save_savspl'), async () => { const d = await api('splits.group', undefined, { id: g.id }); (await import('./files.js')).saveSavspl(d); }], '-',
      g.me ? ['archive', t(g.archived ? 'unarchive' : 'archive'), async () => { await api('splits.group.archive', { id: g.id, archived: !g.archived }); toast(t(g.archived ? 'unarchived_done' : 'archived_done'), 'success'); reload(); }] : null,
      g.owner ? ['trash', t('delete_group'), async () => { if (await confirm(t('delete_group'), t('delete_group_t', { n: g.name, x: g.expenses }), t('delete_forever'))) { await api('splits.group.delete', { id: g.id }); toast(t('group_deleted'), 'success'); reload(); } }, { danger: true }] : null];
  }

  function card(g) {
    const meta = [g.kind === 'personal' ? t('personal_title') : t('n_people', { n: g.people }), g.expenses ? t('spent_total', { a: money(g.total, g.currency) }) : t('no_expenses_yet'), when(g.updated)].join(' · ');
    const more = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', size: 'sm', square: true }), menuOf(g).filter(Boolean), { placement: 'bottom-end' });
    more.addEventListener('click', (e) => e.stopPropagation());
    const badge = g.kind === 'personal' ? h('div.cbadges', h('sav-badge', { variant: 'neutral', appearance: 'soft', pill: true }, icon('user'), ' ', t('personal_badge')))
      : !g.owner && g.me ? h('div.cbadges', h('sav-badge', { variant: 'neutral', appearance: 'soft', pill: true }, icon('users'), ' ', t('shared_with_me'))) : null;
    return tile(g.name, () => go('#/g/' + g.id), { class: 'card' + (g.archived ? ' away' : '') }, thumb(g), badge, h('div.cinfo', h('div', h('b', g.name), h('small', meta)), more));
  }

  function quick() {
    const tl = ([k, ic, c]) => tile(t('k_' + k), () => newGroupDialog(k), { class: 'qt', style: `--c:${c}` }, h('div.qpic', icon(ic)), h('div', h('strong', t('k_' + k)), h('small.muted', t('k_' + k + '_t'))));
    return h('sav-card.quick', h('div.qhead', h('h2', t('start_new')), btn(t('all_templates'), { size: 'sm', appearance: 'ghost', 'icon-end': 'arrow-right', onclick: () => newGroupDialog() })), h('div.qrow', KINDS.slice(0, 6).map(tl)));
  }

  function draw() {
    drawSide();
    if (view === 'spending') {
      import('./budget.js').then((m) => m.spendingView(main, term)).catch(fail);
      commands([t('my_spending'), [['upload', t('import_bank'), () => import('./bankcsv.js').then((m) => m.importDialog())], ['target', t('set_caps'), () => import('./budget.js').then((m) => m.capsDialog())], ['tag', t('keywords'), () => import('./budget.js').then((m) => m.keywordsDialog())]]],
        [t('my_groups'), Object.keys(V).map((v) => [V[v][1], t(V[v][0]), '#/' + v])]);
      return;
    }
    let shown = V[view][2]();
    if (term) shown = shown.filter((g) => (g.name + ' ' + g.names.join(' ')).toLowerCase().includes(term));
    const sort = prefs().sort || 'updated';
    shown = [...shown].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'balance' ? (b.balance ?? 0) - (a.balance ?? 0) : b.updated.localeCompare(a.updated)));
    const sorter = drop(h('sav-button', { caret: true, appearance: 'ghost', variant: 'neutral', size: 'sm' }, t('sort_' + sort)), ['updated', 'balance', 'name'].map((k) => ['', t('sort_' + k), () => setPrefs({ sort: k }).then(draw).catch(fail), { check: sort === k }]), { placement: 'bottom-end' });
    const viewBtn = iconBtn(mode() === 'grid' ? 'list' : 'layout-grid', t(mode() === 'grid' ? 'as_list' : 'as_grid'), () => setPrefs({ view: mode() === 'grid' ? 'list' : 'grid' }).then(draw));
    const head = h('div.hhead', h('h1', term ? t('results_for', { q: term }) : t(V[view][0])), h('div.spacer'), sorter, viewBtn, btn(t('open_file'), { size: 'sm', icon: 'file-up', appearance: 'outline', variant: 'neutral', onclick: () => import('./files.js').then((m) => m.openFileDialog()) }));
    const none = term ? empty('search', t('nothing_found'), '') : view === 'archived' ? empty('archive', t('no_archived'), t('no_archived_t')) : view ? empty(V[view][1], t('none_here'), '') : empty('wallet', t('no_groups'), t('no_groups_t'), primary(t('new_group'), { icon: 'plus', onclick: () => newGroupDialog() }));
    put(main, head, view === '' && !term ? quick() : null, view === '' && !term && shown.length ? h('h2', t('recent')) : null, shown.length ? h('div.' + (mode() === 'grid' ? 'grid' : 'rows'), shown.map(card)) : none);
    commands([t('new_group'), [['plus', t('new_group'), () => newGroupDialog(), 'N'], ...KINDS.map(([k, ic]) => [ic, t('k_' + k), () => newGroupDialog(k)]), ['file-up', t('open_file'), () => import('./files.js').then((m) => m.openFileDialog())], ['link', t('open_link'), () => joinDialog()]]],
      [t('my_groups'), Object.keys(V).map((v) => [V[v][1], t(V[v][0]), '#/' + v])],
      [t('recent'), S.groups.filter((g) => !g.archived).slice(0, 80).map((g) => [groupIcon(g), g.name, '#/g/' + g.id])]);
  }
  draw();
  document.title = t(V[view][0]) + ' – SavSplits';
  if (S.pendingFile) import('./files.js').then((m) => m.openPending());
  const onKey = (e) => { if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('sav-dialog[open]') && !e.composedPath().some((x) => /^(input|textarea|sav-input|sav-textarea|sav-select|sav-chip-input)$/.test(x.localName || ''))) { e.preventDefault(); newGroupDialog(); } };
  const onFocus = () => { if (document.visibilityState === 'visible') { if (view === 'spending') S.mine = null; reload().catch(() => {}); } };
  // the budget changed (caps, an import): the numbers again
  const onBudget = () => reload().catch(fail);
  addEventListener('keydown', onKey);
  addEventListener('savsplits-budget', onBudget);
  document.addEventListener('visibilitychange', onFocus);
  if (view === 'spending') S.mine = null; // read again each time the view opens
  return () => { removeEventListener('keydown', onKey); removeEventListener('savsplits-budget', onBudget); document.removeEventListener('visibilitychange', onFocus); };
}

/** The link of a group someone shared: pasted here, it opens. */
function joinDialog() {
  const i = h('sav-input', { label: t('join_link'), placeholder: t('join_ph'), help: t('join_link_t'), autofocus: true });
  dialog({ title: t('open_link'), width: '28rem', body: i, actions: [{ label: t('cancel') }, { label: t('open'), primary: true, run: () => {
    const m = String(i.value).match(/(?:#\/j\/)?([A-Za-z0-9]{16})\b/);
    if (!m) throw Object.assign(new Error(), { code: 'link_invalid' });
    go('#/j/' + m[1]);
  } }] });
}

/** New: a name, a template, the currency and the people (the account is one of them); "Create". As in SavSchedules. */
export function newGroupDialog(kind = 'trip') {
  let k = kind;
  const name = h('sav-input', { label: t('group_name'), maxlength: 80, autofocus: true });
  const cards = {};
  const tables = h('div.condo-t', h('p.muted.small', t('condo_tables_t')),
    ...[['prop', t('tbl_prop'), true], ['stairs', t('tbl_stairs')], ['lift', t('tbl_lift')], ['heat', t('tbl_heat')]].map(([id, label, on]) => h('sav-checkbox', { value: id, checked: on || null, 'data-name': label }, label)));
  const alone = h('sav-alert', { variant: 'neutral', appearance: 'soft' }, icon('user', { slot: 'icon' }), t('personal_only'));
  const mark = () => { Object.entries(cards).forEach(([x, c]) => c.classList.toggle('on', x === k)); name.placeholder = t('k_' + k + '_ph'); tables.hidden = k !== 'condo'; people.hidden = k === 'personal'; alone.hidden = k !== 'personal'; };
  const pre = ([id, ic, c]) => (cards[id] = tile(t('k_' + id), () => { k = id; mark(); }, { class: 'pret', style: `--c:${c}` }, icon(ic), h('div', h('strong', t('k_' + id)), h('small.muted', t('k_' + id + '_t')))));
  const cur = select(t('currency'), curOptions(), prefs().currency || 'EUR', null, { searchable: true });
  const people = h('sav-chip-input', { label: t('others'), multiple: true, placeholder: t('others_ph'), help: t('others_t', { me: S.user.name }), 'max-terms': 59 });
  const body = h('div.form', name, h('sav-label', { appearance: 'plain', case: 'normal', variant: 'neutral' }, t('template')), h('div.presets', KINDS.map(pre)), tables, alone, h('div.grid2', cur, h('div')), people,
    h('div', btn(t('open_file'), { icon: 'file-up', size: 'sm', appearance: 'ghost', onclick: () => { d.hide(); import('./files.js').then((m) => m.openFileDialog()); } })));
  mark();
  const d = dialog({ title: t('new_group'), width: '44rem', body, actions: [{ label: t('cancel') }, { label: t('create'), icon: 'plus', primary: true, run: async () => {
    const others = k === 'personal' ? [] : String(people.value || '').split(',').map((x) => x.trim()).filter(Boolean);
    const tbl = k === 'condo' ? [...tables.querySelectorAll('sav-checkbox')].filter((c) => c.checked).map((c) => ({ id: c.value, name: c.dataset.name })) : [];
    const [, ic, color] = kindOf(k);
    const r = await api('splits.group.create', { name: name.value.trim() || name.placeholder, kind: k, icon: ic, color, currency: cur.value || 'EUR', members: [{ name: S.user.name, me: true }, ...others.map((n) => ({ name: n }))], tables: tbl });
    go('#/g/' + r.group.id + (k === 'condo' ? '/people' : ''));
  } }] });
  body.addEventListener('dblclick', (e) => { if (e.target.closest('.pret')) d.primary?.click(); });
}
