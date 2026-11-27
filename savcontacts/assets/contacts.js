/**
 * The address book: the frame of SavDrive (header with the pill search, the apps and the account; the side menu with the
 * big "New", the places and the groups), and in the page the list and the card side by side as in SavMail (on phones one
 * at a time, the card with a way back).
 *   places: #/ all · #/fav · #/birthdays · #/duplicates · #/trash · #/g/<group>; a contact open: <place>/c/<id>
 * The screen stays while only the open contact changes, so the list keeps its scroll and its selection.
 */
import { K, btn, colorPop, confirm, dialog, drop, empty, fail, h, icon, iconBtn, item, primary, put, toast, copyText, mobile } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api, contact, group, putContact, setGroups } from './store.js';
import { brand, commands, credit, go, prefs, setPrefs, userMenu } from './account.js';
import { LABELS, avatar, birthdayText, daysText, fold, fullName, haystack, labelText, letterOf, nameNode, nextBirthday, sortContacts, subline } from './people.js';

const enc = encodeURIComponent;
let cur = null; // the screen on show: {key, show(cid), page}

export const placeHash = (v) => (v.kind === 'all' ? '#/' : v.kind === 'group' ? '#/g/' + v.id : '#/' + v.kind);
const hashOf = (v, cid) => placeHash(v) + (cid ? (v.kind === 'all' ? 'c/' : '/c/') + cid : '');

export function contactsScreen(root, view, cid) {
  const key = view.kind + ':' + (view.id || '');
  if (cur && cur.key === key && root.contains(cur.page)) { cur.show(cid); return cur.leave; }
  cur?.leave?.();
  cur = build(root, view, key);
  cur.show(cid);
  return cur.leave;
}
/** Draws again what is on show (after a change made elsewhere: an import, the settings). */
export const redraw = () => cur?.redrawAll?.();

function build(root, view, key) {
  const sel = new Set();
  let q = '', open = null, trash = null, sets = null, shown = [];

  // ---------------------------------------------------------------- header
  const search = h('sav-input.hsearch', { type: 'search', placeholder: t('search_contacts'), clearable: true, pill: true, 'aria-label': t('search_contacts') }, icon('search', { slot: 'prefix' }));
  let st;
  search.addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => { q = fold(search.value.trim()); drawList(); }, 120); });
  search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { search.value = ''; q = ''; drawList(); search.blur(); } if (e.key === 'Enter' || e.key === 'ArrowDown') { const r = list.querySelector('.crow'); if (r) { e.preventDefault(); r.focus(); if (e.key === 'Enter') r.click(); } } });

  // ---------------------------------------------------------------- side menu
  const side = h('nav.hside', { 'aria-label': t('all_contacts') });
  const newMenu = () => {
    const trig = primary(t('new'), { icon: 'plus', size: 'lg', block: true, slot: 'trigger', class: 'newb' });
    const d = h('sav-dropdown.newd', { placement: 'bottom-start', 'sheet-on-mobile': true, label: t('new') }, trig,
      item('contact', 'user-plus', t('new_contact'), { kbd: 'N' }), item('group', 'tag-plus', t('new_group')), h('sav-divider'), item('import', 'file-up', t('import_file')));
    d.addEventListener('sav-select', (e) => {
      const v = String(e.detail.value);
      setTimeout(() => { if (v === 'contact') newContact(); else if (v === 'group') groupDialog(); else if (v === 'import') import('./files.js').then((m) => m.importDialog()); }, 20);
    });
    return d;
  };
  const drawSide = () => {
    const mi = (value, ic, label, count) => { const x = h('sav-menu-item', { value }, typeof ic === 'string' ? icon(ic, { slot: 'prefix' }) : ic, h('span.mlab', label), count ? h('sav-badge', { slot: 'suffix', variant: 'neutral', appearance: 'soft', pill: true }, String(count)) : null); if (value === key) x.setAttribute('current', ''); return x; };
    const soon = S.contacts.filter((c) => { const n = nextBirthday(c); return n && n.days <= 7; }).length;
    const places = h('sav-menu.dnav', { label: t('all_contacts'), selectable: true },
      mi('all:', 'contact', t('all_contacts'), 0), mi('fav:', 'star', t('favorites'), 0), mi('birthdays:', 'cake', t('birthdays'), soon), mi('duplicates:', 'merge', t('duplicates'), 0), mi('trash:', 'trash', t('trash'), S.trash),
      // on phones the groups follow the places in the same row that scrolls
      mobile() ? S.groups.map((g) => mi('group:' + g.id, h('span.gdot', { slot: 'prefix', style: `--g:${g.color}` }), g.name, 0)) : null);
    places.addEventListener('sav-select', (e) => nav(String(e.detail.value)));
    const groups = h('sav-menu', { label: t('groups'), selectable: true }, S.groups.map((g) => mi('group:' + g.id, h('span.gdot', { slot: 'prefix', style: `--g:${g.color}` }), g.name, S.contacts.filter((c) => c.groups.includes(g.id)).length)));
    groups.addEventListener('sav-select', (e) => nav(String(e.detail.value)));
    put(side, newMenu(), places,
      mobile() ? null : [h('div.navh', h('span', t('groups')), iconBtn('plus', t('new_group'), () => groupDialog(), { place: 'right' })), groups],
      h('div.sidecount', h('b', String(S.contacts.length)), h('span', S.contacts.length === 1 ? t('one_contact').replace(/^1 /, '') : t('n_contacts', { n: '' }).trim())));
  };
  const nav = (v) => { const [k, id] = v.split(':'); go(placeHash({ kind: k, id })); };

  // ---------------------------------------------------------------- the panes
  const list = h('div.crows', { role: 'listbox', 'aria-label': t('all_contacts'), 'aria-multiselectable': 'true' });
  const head = h('div.dhead');
  const clist = h('section.clist', head, list);
  const cread = h('section.cread', { 'aria-live': 'polite' });
  const panes = h('div.cpanes', { 'data-pane': 'list' }, clist, cread);
  const main = h('main.hmain', panes);
  const page = h('div.home.cont', h('header.htop', brand(), search, h('div.spacer'), userMenu()), h('div.hbody', side, main), credit());
  put(root, page);

  // files dropped on the page are imported
  const over = (e) => { if (!e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); page.classList.add('drop-over'); };
  page.addEventListener('dragover', over);
  page.addEventListener('dragleave', (e) => { if (!page.contains(e.relatedTarget)) page.classList.remove('drop-over'); });
  page.addEventListener('drop', (e) => { page.classList.remove('drop-over'); const f = e.dataTransfer?.files?.[0]; if (!f) return; e.preventDefault(); import('./files.js').then((m) => m.importFile(f)).catch(fail); });

  // ---------------------------------------------------------------- what the place holds
  const title = () => ({ all: t('all_contacts'), fav: t('favorites'), birthdays: t('birthdays'), duplicates: t('duplicates'), trash: t('trash') })[view.kind] || group(view.id)?.name || '';
  function base() {
    if (view.kind === 'trash') return trash || [];
    let l = S.contacts;
    if (view.kind === 'fav') l = l.filter((c) => c.favorite);
    if (view.kind === 'group') l = l.filter((c) => c.groups.includes(view.id));
    if (view.kind === 'birthdays') return l.filter((c) => c.birthday).map((c) => [c, nextBirthday(c)]).sort((a, b) => a[1].days - b[1].days || fullName(a[0]).localeCompare(fullName(b[0]))).map((x) => x[0]);
    return sortContacts(l);
  }
  const filtered = () => (q ? base().filter((c) => q.split(/\s+/).every((w) => haystack(c).includes(w))) : base());

  // ---------------------------------------------------------------- the list
  function drawHead() {
    const n = sel.size;
    head.classList.toggle('sel', n > 0);
    panes.classList.toggle('selecting', n > 0);
    if (n) {
      const inTrash = view.kind === 'trash';
      put(head, iconBtn('x', t('clear_sel'), () => { sel.clear(); drawList(); }), h('div.ttl', h('h1', t('n_selected', { n }))),
        inTrash ? [btn(t('restore'), { size: 'sm', icon: 'rotate-ccw', onclick: () => restore([...sel]) }), iconBtn('trash', t('delete_forever'), () => purge([...sel]))]
          : [iconBtn('star', t('star'), () => bulk('star')), groupMenu([...sel]), view.kind === 'group' ? iconBtn('tag', t('remove_from_group'), () => bulk('group.remove', view.id)) : null,
            iconBtn('download', t('export'), () => import('./files.js').then((m) => m.exportDialog({ ids: [...sel] }))), iconBtn('trash', t('delete_contact'), () => remove([...sel]))]);
      return;
    }
    const count = shown.length;
    const more = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', square: true, size: 'sm' }), () => [
      view.kind !== 'trash' && view.kind !== 'duplicates' ? ['square-check', t('select_all'), () => { shown.forEach((c) => sel.add(c.id)); drawList(); }, { kbd: 'Mod+A' }] : null,
      view.kind !== 'trash' && view.kind !== 'duplicates' ? ['download', t('export'), () => import('./files.js').then((m) => m.exportDialog(view.kind === 'group' ? { group: view.id } : {}))] : null,
      view.kind === 'all' ? ['file-up', t('import_file'), () => import('./files.js').then((m) => m.importDialog())] : null,
      view.kind === 'group' ? '-' : null,
      view.kind === 'group' ? ['pencil', t('rename'), () => groupDialog(group(view.id))] : null,
      view.kind === 'group' ? ['trash', t('delete_group'), () => deleteGroup(group(view.id)), { danger: true }] : null,
      view.kind === 'trash' && trash?.length ? ['trash', t('empty_trash'), () => emptyTrash(), { danger: true }] : null,
    ], { placement: 'bottom-end', label: t('more') });
    const sortBtn = view.kind === 'birthdays' || view.kind === 'trash' || view.kind === 'duplicates' ? null
      : drop(h('sav-button', { icon: 'arrow-down-a-z', label: t('sort_by'), appearance: 'ghost', variant: 'neutral', square: true, size: 'sm', title: t('sort_by') }), () => [
        ['', t('sort_first'), () => setPrefs({ sort: 'first' }).then(drawList), { check: prefs().sort !== 'last' }], ['', t('sort_last'), () => setPrefs({ sort: 'last' }).then(drawList), { check: prefs().sort === 'last' }]], { placement: 'bottom-end', label: t('sort_by') });
    put(head, view.kind === 'group' ? h('span.gdot', { style: `--g:${group(view.id)?.color}` }) : null,
      h('div.ttl', h('h1', q ? t('results_for', { q: search.value.trim() }) : title()), h('small', count === 1 ? t('one_contact') : t('n_contacts', { n: count.toLocaleString(getLang()) }))), sortBtn, more);
  }

  let chunk = 0, sentinel = null, io = null;
  function drawList() {
    if (view.kind === 'duplicates') return drawDups();
    shown = filtered();
    for (const id of [...sel]) if (!shown.some((c) => c.id === id)) sel.delete(id);
    drawHead();
    io?.disconnect();
    if (!shown.length) {
      const e = q ? empty('search', t('nothing_found'), '') : ({
        all: empty('contact', t('no_contacts'), t('no_contacts_t'), h('div.prow', primary(t('new_contact'), { icon: 'user-plus', onclick: () => newContact() }), btn(t('import_file'), { icon: 'file-up', onclick: () => import('./files.js').then((m) => m.importDialog()) }))),
        fav: empty('star', t('no_favorites'), t('no_favorites_t')), birthdays: empty('cake', t('no_birthdays'), t('no_birthdays_t')), trash: empty('trash', t('trash_empty'), t('trash_t')),
      })[view.kind] || empty('tag', t('empty_group'), t('empty_group_t'));
      put(list, e);
      return;
    }
    put(list);
    chunk = 0;
    more();
  }
  // the rows come 250 at a time, the next ones when the end of the list comes into sight
  function more() {
    sentinel?.remove();
    const from = chunk * 250, part = shown.slice(from, from + 250);
    chunk++;
    let last = from ? letterOf(shown[from - 1]) : null;
    const frag = document.createDocumentFragment();
    for (const c of part) {
      if (view.kind !== 'birthdays' && view.kind !== 'trash' && !q) { const l = letterOf(c); if (l !== last) { frag.append(h('div.letter', { 'aria-hidden': 'true' }, l)); last = l; } }
      frag.append(row(c));
    }
    list.append(frag);
    if (from + 250 < shown.length) {
      sentinel = h('div', { style: 'height:1px' });
      list.append(sentinel);
      io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { io.disconnect(); more(); } }, { root: mobile() ? null : list, rootMargin: '400px' });
      io.observe(sentinel);
    }
  }
  function row(c) {
    const box = h('sav-checkbox.csel', { checked: sel.has(c.id), 'aria-label': t('select'), size: 'sm' });
    box.addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('change', () => { box.checked ? sel.add(c.id) : sel.delete(c.id); r.classList.toggle('sel', box.checked); drawHead(); });
    const nb = view.kind === 'birthdays' ? nextBirthday(c) : null;
    const r = h('div.crow', { role: 'option', tabindex: -1, 'data-id': c.id, 'aria-selected': String(open === c.id), class: (open === c.id ? 'active ' : '') + (sel.has(c.id) ? 'sel' : '') },
      h('div.cpick', avatar(c, 38), box),
      h('div.cbody', h('div.cname', nameNode(c)), h('div.csub', nb ? birthdayText(c) + (nb.age ? ' · ' + t('turns', { n: nb.age }) : '') : view.kind === 'trash' ? t('changed', { w: when(c.deleted) }) : subline(c))),
      h('div.cside', nb ? h('span.cdays' + (nb.days <= 7 ? '.soon' : ''), daysText(nb.days) || nb.date.toLocaleDateString(getLang(), { day: 'numeric', month: 'short' })) : null, c.favorite && view.kind !== 'trash' ? icon('star-full', { class: 'cstar', label: t('favorite') }) : null));
    r.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || panes.classList.contains('selecting')) { box.checked = !box.checked; box.dispatchEvent(new Event('change')); return; }
      go(hashOf(view, c.id));
    });
    r.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.click(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); step(e.key === 'ArrowDown' ? 1 : -1, r); }
    });
    return r;
  }
  function step(d, from) {
    const rows = [...list.querySelectorAll('.crow')];
    const i = rows.indexOf(from || list.querySelector('.crow.active') || rows[0]);
    const n = rows[Math.max(0, Math.min(rows.length - 1, i + d))];
    if (n) { n.focus(); go(hashOf(view, n.dataset.id)); }
  }
  const mark = () => list.querySelectorAll('.crow').forEach((r) => { const on = r.dataset.id === open; r.classList.toggle('active', on); r.setAttribute('aria-selected', String(on)); });

  // ---------------------------------------------------------------- the card
  function show(cid) {
    open = cid || null;
    panes.dataset.pane = open ? 'read' : 'list';
    mark();
    if (view.kind === 'duplicates') return;
    const c = open ? (view.kind === 'trash' ? (trash || []).find((x) => x.id === open) : contact(open)) : null;
    if (!c) { put(cread, empty('contact', t('pick_contact'), t('pick_contact_t'))); document.title = title() + ' – SavContacts'; if (open && view.kind !== 'trash') open = null; return; }
    document.title = fullName(c) + ' – SavContacts';
    drawCard(c);
    if (!mobile()) list.querySelector(`.crow[data-id="${c.id}"]`)?.scrollIntoView({ block: 'nearest' });
    else scrollTo(0, 0);
  }
  function drawCard(c) {
    const inTrash = !!c.deleted;
    const field = (ic, label, value, href, extra = []) => h('div.cfield', icon(ic), h('div.fv', href ? h('a', { href, rel: 'noopener', target: /^https?:/.test(href) ? '_blank' : null }, value) : h('span', value), label ? h('small', label) : null),
      h('div.fa', iconBtn('copy', t('copy_v'), () => copyText(value)), extra));
    const sec = (title, kids) => (kids.length ? h('section.csec', h('h3', title), kids) : null);
    const nb = nextBirthday(c);
    const star = iconBtn(c.favorite ? 'star-full' : 'star', t(c.favorite ? 'unstar' : 'star'), () => toggleStar(c), { kbd: 'S' });
    if (c.favorite) star.on(true);
    const moreMenu = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', square: true, size: 'sm' }), () => [
      ['download', t('export'), () => import('./files.js').then((m) => m.exportDialog({ ids: [c.id], one: fullName(c) }))],
      ['copy', t('copy_v'), () => copyText([fullName(c), ...c.emails.map((x) => x.value), ...c.phones.map((x) => x.value)].join('\n'))],
      ['printer', t('print'), () => print()], '-',
      ['trash', t('delete_contact'), () => remove([c.id]), { danger: true, kbd: 'Delete' }]], { placement: 'bottom-end', label: t('more') });
    const tool = h('div.ctool', iconBtn('arrow-left', t('all_contacts'), () => go(hashOf(view, null)), { class: 'cback' }), h('span.spacer'),
      inTrash ? [btn(t('restore'), { size: 'sm', icon: 'rotate-ccw', onclick: () => restore([c.id]) }), btn(t('delete_forever'), { size: 'sm', variant: 'danger', appearance: 'soft', onclick: () => purge([c.id]) })]
        : [star, groupMenu([c.id], c), iconBtn('pencil', t('edit_contact'), () => edit(c), { kbd: 'E' }), moreMenu]);
    const email = c.emails[0]?.value, phone = c.phones.find((p) => p.label === 'mobile')?.value || c.phones[0]?.value;
    const groups = c.groups.map(group).filter(Boolean);
    const sub = [c.title, c.department, c.company].filter(Boolean).join(' · ');
    put(cread, h('article.card', tool, h('div.cscroll',
      h('div.chero', avatar(c, 96), h('div', h('h2', fullName(c)), c.nickname ? h('div.cnick', '“' + c.nickname + '”') : null, sub ? h('div.muted', sub) : null,
        groups.length ? h('div.cchips', groups.map((g) => h('a.gchip', { href: placeHash({ kind: 'group', id: g.id }), style: `--g:${g.color}` }, h('span.gdot'), g.name))) : null)),
      !inTrash && (email || phone) ? h('div.cact', email ? btn(t('send_email'), { icon: 'mail', size: 'sm', href: 'mailto:' + email }) : null, email ? btn(t('write_savmail'), { icon: 'send', size: 'sm', href: '../savmail/#/compose?to=' + enc(`${fullName(c)} <${email}>`), target: '_blank' }) : null,
        phone ? btn(t('call'), { icon: 'phone', size: 'sm', href: 'tel:' + phone.replace(/[^\d+]/g, '') }) : null) : null,
      sec(t('emails'), c.emails.map((x) => field('mail', labelText(x.label), x.value, 'mailto:' + x.value))),
      sec(t('phones'), c.phones.map((x) => field(x.label === 'mobile' ? 'smartphone' : 'phone', labelText(x.label), x.value, 'tel:' + x.value.replace(/[^\d+]/g, '')))),
      sec(t('addresses'), c.addresses.map((a) => { const text = [a.street, [a.code, a.city, a.region].filter(Boolean).join(' '), a.country].filter(Boolean).join('\n'); return field('map-pin', labelText(a.label), text, null, [iconBtn('external-link', t('open_map'), () => window.open('https://www.openstreetmap.org/search?query=' + enc(text.replace(/\n/g, ', ')), '_blank', 'noopener'))]); })),
      sec(t('urls'), c.urls.map((x) => field('globe', labelText(x.label), x.value, /^https?:\/\//i.test(x.value) ? x.value : null))),
      c.birthday ? sec(t('birthday'), [field('cake', [nb?.age ? t('turns', { n: nb.age }) : '', daysText(nb?.days ?? 99)].filter(Boolean).join(' · '), birthdayText(c), null)]) : null,
      c.notes ? h('section.csec', h('h3', t('notes')), h('div.cnotes', c.notes)) : null,
      c.extra ? h('section.csec', h('h3', t('extra_fields')), h('p.muted.small', t('extra_fields_t')), otherBox(c)) : null,
      h('div.cmeta', [t('created', { w: when(c.created) }), t('changed', { w: when(c.updated) })].join(' · ')))));
  }
  function otherBox(c) {
    const pre = h('pre.cother', '…');
    api('con.contact', undefined, { id: c.id }).then((r) => { pre.textContent = (r.other || []).map((l) => l.replace(/^o?item\d+\./i, '')).join('\n'); }).catch(() => pre.remove());
    return pre;
  }

  // ---------------------------------------------------------------- duplicates
  async function drawDups() {
    head.classList.remove('sel');
    panes.classList.add('single');
    document.title = t('duplicates') + ' – SavContacts';
    put(list, h('div.wait', h('sav-spinner', { style: 'font-size:1.6rem' })));
    if (!sets) { try { sets = (await api('con.duplicates')).sets; } catch (e) { fail(e); sets = []; } }
    const live = sets.map((s) => s.map(contact).filter(Boolean)).filter((s) => s.length > 1);
    const score = (c) => ['first', 'last', 'company', 'title', 'birthday', 'notes'].filter((k) => c[k]).length + c.emails.length + c.phones.length + c.addresses.length + c.urls.length + (c.photo ? 2 : 0);
    put(head, h('div.ttl', h('h1', t('duplicates')), h('small', live.length ? t('merge_t') : '')), live.length > 1 ? btn(t('merge_all', { n: live.length }), { size: 'sm', icon: 'merge', onclick: async () => {
      if (!(await confirm(t('merge_all_q'), t('merge_all_t'), t('merge'), false))) return;
      for (const s of live) { const ids = s.slice().sort((a, b) => score(b) - score(a)).map((c) => c.id); await mergeIds(ids, true); }
      toast(t('merged'), 'success'); sets = null; drawDups(); drawSide();
    } }) : null);
    if (!live.length) { put(list, empty('merge', t('no_dups'), t('no_dups_t'))); return; }
    put(list, h('div.dupl', live.map((s) => {
      const best = s.slice().sort((a, b) => score(b) - score(a))[0];
      let keep = best.id;
      const radios = h('sav-radio-group', { value: keep, 'aria-label': t('keep_this') }, s.map((c) => h('div.drow', h('sav-radio', { value: c.id, 'aria-label': t('keep_this') }), avatar(c, 34),
        h('div', h('b', fullName(c)), h('small', [...new Set([subline(c), ...c.emails.map((x) => x.value), ...c.phones.map((x) => x.value)].filter(Boolean))].slice(0, 3).join(' · '))))));
      radios.addEventListener('change', () => { keep = radios.value; });
      return h('sav-card.dset', { appearance: 'outlined' }, radios, h('div.prow', btn(t('open'), { size: 'sm', appearance: 'ghost', href: '#/c/' + keep }), primary(t('merge'), { size: 'sm', icon: 'merge', onclick: async () => {
        await mergeIds([keep, ...s.map((c) => c.id).filter((x) => x !== keep)]);
        sets = sets.filter((x) => !x.includes(keep)); drawDups(); drawSide();
      } })));
    })));
  }
  async function mergeIds(ids, quiet) {
    const r = await api('con.merge', { ids });
    S.contacts = S.contacts.filter((c) => !ids.slice(1).includes(c.id));
    S.trash += ids.length - 1;
    putContact(r.contact);
    if (!quiet) toast(t('merged'), 'success');
  }

  // ---------------------------------------------------------------- actions
  const refresh = () => { drawSide(); drawList(); show(open); };
  async function toggleStar(c) {
    const r = await api('con.contact.star', { id: c.id, on: !c.favorite });
    putContact(r.contact); refresh();
  }
  async function bulk(doWhat, gid) {
    const ids = [...sel];
    const r = await api('con.bulk', { ids, do: doWhat, group: gid });
    r.contacts.forEach(putContact);
    if (doWhat === 'group.remove') sel.clear();
    refresh();
  }
  async function remove(ids) {
    await api('con.contact.delete', { ids });
    const gone = S.contacts.filter((c) => ids.includes(c.id));
    S.contacts = S.contacts.filter((c) => !ids.includes(c.id));
    S.trash += gone.length; trash = null;
    ids.forEach((id) => sel.delete(id));
    const al = toast(ids.length === 1 ? t('deleted_one') : t('deleted_n', { n: ids.length }), 'neutral', { duration: 7000 });
    const undo = h('sav-button', { size: 'sm', appearance: 'outline', variant: 'neutral', style: 'margin-inline-start:.7rem' }, t('undo'));
    undo.addEventListener('click', () => { al.remove(); restore(ids, gone).catch(fail); });
    al?.append(undo);
    if (ids.includes(open)) go(hashOf(view, null)); else refresh();
  }
  async function restore(ids, back) {
    await api('con.contact.restore', { ids });
    const list2 = back || (trash || []).filter((c) => ids.includes(c.id));
    list2.forEach((c) => putContact({ ...c, deleted: null }));
    S.trash = Math.max(0, S.trash - ids.length);
    if (trash) trash = trash.filter((c) => !ids.includes(c.id));
    ids.forEach((id) => sel.delete(id));
    toast(t('restored'), 'success');
    if (view.kind === 'trash' && ids.includes(open)) go(hashOf(view, null)); else refresh();
  }
  async function purge(ids) {
    if (!(await confirm(t('delete_forever_q'), t('delete_forever_t'), t('delete_forever')))) return;
    await api('con.contact.purge', { ids });
    trash = (trash || []).filter((c) => !ids.includes(c.id));
    S.trash = trash.length;
    ids.forEach((id) => sel.delete(id));
    if (ids.includes(open)) go(hashOf(view, null)); else refresh();
  }
  async function emptyTrash() {
    if (!(await confirm(t('empty_trash'), t('empty_trash_t'), t('delete_forever')))) return;
    await api('con.trash.empty', {});
    trash = []; S.trash = 0; sel.clear();
    go(hashOf(view, null)); refresh();
  }
  async function edit(c) {
    const { openEditor } = await import('./editor.js');
    const r = await openEditor(c);
    if (r) { putContact(r); refresh(); }
  }
  async function newContact() {
    const { openEditor } = await import('./editor.js');
    const r = await openEditor(null, { groups: view.kind === 'group' ? [view.id] : [], favorite: view.kind === 'fav' });
    if (r) { putContact(r); go(hashOf(view.kind === 'trash' || view.kind === 'duplicates' ? { kind: 'all' } : view, r.id)); if (cur?.key === key) refresh(); }
  }
  /** The groups of some contacts: a press adds them all to a group, or takes them out when they all are in it already. */
  function groupMenu(ids, c) {
    const trig = h('sav-button', { icon: 'tag', label: t('add_to_group'), title: t('add_to_group'), appearance: 'ghost', variant: 'neutral', square: true, size: 'sm' });
    return drop(trig, () => {
      const items = S.groups.map((g) => {
        const all = ids.every((id) => contact(id)?.groups.includes(g.id));
        return ['', g.name, async () => { const r = await api('con.bulk', { ids, do: all ? 'group.remove' : 'group.add', group: g.id }); r.contacts.forEach(putContact); refresh(); }, { check: all }];
      });
      return [{ head: t('add_to_group') }, ...items, items.length ? '-' : null, ['tag-plus', t('new_group') + '…', () => groupDialog(null, ids)]];
    }, { placement: 'bottom-end', label: t('add_to_group') });
  }
  function groupDialog(g = null, add = []) {
    const name = h('sav-input', { label: t('group_name'), value: g?.name || '', maxlength: 60, autofocus: true });
    let color = g?.color || '';
    const cp = colorPop(t('group_color'), color || '#4338ca', (v) => { color = v; }, { list: ['#4338ca', '#0b7a87', '#1a7f37', '#b7791f', '#c4362f', '#c2307a', '#6a2cf0', '#0a78c2', '#4a5875', '#8f6500'] });
    dialog({ title: g ? t('rename') : t('new_group'), width: '26rem', body: h('div.form', name, h('div', h('span.flabel', t('group_color')), cp)), actions: [{ label: t('cancel') }, { label: g ? t('save') : t('create'), primary: true, run: async () => {
      const r = await api('con.group.save', { id: g?.id, name: name.value, color: color || undefined, add });
      setGroups(r.groups);
      if (add.length) add.forEach((id) => { const c = contact(id); if (c && !c.groups.includes(r.id)) c.groups.push(r.id); });
      if (!g && !add.length) go(placeHash({ kind: 'group', id: r.id })); else refresh();
    } }] });
  }
  async function deleteGroup(g) {
    if (!g || !(await confirm(t('delete_group'), t('delete_group_t'), t('delete')))) return;
    const r = await api('con.group.delete', { id: g.id });
    setGroups(r.groups);
    S.contacts.forEach((c) => { c.groups = c.groups.filter((x) => x !== g.id); });
    go('#/');
  }

  // ---------------------------------------------------------------- keys and the search of actions
  const onKey = (e) => {
    if (e.defaultPrevented || e.target.closest?.('sav-input, input, textarea, sav-dialog, sav-textarea, [contenteditable]') || document.querySelector('sav-dialog[open]')) return;
    const c = open ? contact(open) : null;
    if (e.key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); search.focus(); }
    else if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); newContact(); }
    else if (e.key === 'e' && c && !e.metaKey && !e.ctrlKey) { e.preventDefault(); edit(c); }
    else if (e.key === 's' && c && !e.metaKey && !e.ctrlKey) { e.preventDefault(); toggleStar(c).catch(fail); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && (sel.size || c) && view.kind !== 'trash') { e.preventDefault(); remove(sel.size ? [...sel] : [c.id]).catch(fail); }
    else if ((e.key === 'ArrowDown' || e.key === 'j') && view.kind !== 'duplicates') { e.preventDefault(); step(1); }
    else if ((e.key === 'ArrowUp' || e.key === 'k') && view.kind !== 'duplicates') { e.preventDefault(); step(-1); }
    else if ((e.metaKey || e.ctrlKey) && e.key === 'a' && view.kind !== 'duplicates') { e.preventDefault(); shown.forEach((x) => sel.add(x.id)); drawList(); }
    else if (e.key === 'Escape') { if (sel.size) { sel.clear(); drawList(); } else if (open) go(hashOf(view, null)); }
  };
  addEventListener('keydown', onKey);
  commands([t('all_contacts'), [['user-plus', t('new_contact'), () => newContact(), 'N'], ['tag-plus', t('new_group'), () => groupDialog()], ['file-up', t('import_file'), () => import('./files.js').then((m) => m.importDialog())],
    ['download', t('export'), () => import('./files.js').then((m) => m.exportDialog({}))], ['search', t('search_contacts'), () => search.focus(), '/'],
    ['star', t('favorites'), '#/fav'], ['cake', t('birthdays'), '#/birthdays'], ['merge', t('duplicates'), '#/duplicates'], ['trash', t('trash'), '#/trash']]]);

  const redrawAll = () => { sets = null; trash = view.kind === 'trash' ? null : trash; start(); };
  async function start() {
    drawSide();
    if (view.kind === 'trash' && !trash) { put(list, h('div.wait', h('sav-spinner'))); try { trash = (await api('con.trash')).contacts; } catch (e) { fail(e); trash = []; } }
    drawList();
    show(open);
  }
  let wasMobile = mobile();
  const onResize = () => { if (mobile() !== wasMobile) { wasMobile = mobile(); drawSide(); } };
  addEventListener('resize', onResize);
  start();
  return { key, page, show, redrawAll, leave: () => { removeEventListener('keydown', onKey); removeEventListener('resize', onResize); io?.disconnect(); if (cur?.page === page) cur = null; } };
}

/** The keys of the address book. */
export function shortcutsDialog() {
  const row = (keys, label) => h('div.orow', h('div.orow-t', h('b', label)), h('div.orow-c', keys.map((k) => h('sav-kbd', K(k)))));
  dialog({ title: t('shortcuts'), width: '28rem', body: h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', row(['N'], t('k_new')), row(['/'], t('k_search')), row(['↑', '↓'], t('k_move')), row(['E'], t('k_edit')), row(['S'], t('k_star')), row(['Delete'], t('k_del')), row(['Mod+A'], t('select_all')), row(['Mod+J'], t('actions_search')))), actions: [{ label: t('close') }] });
}
