/**
 * The frame of every page of a signed-in person, as in SavNewsletters: the bar on top (brand, search, the apps of
 * SavOffice, the account), the menu on the side (a big button, then the folders of every address together, the folders of
 * each address, the addresses and the settings), and the page. The menu folds into a column of icons; on phones it is a
 * drawer opened from the bar.
 */
import { h, iconBtn, primary, put } from './ui.js';
import { t } from './i18n.js';
import { S } from './store.js';
import { brand, credit, go, userMenu } from './account.js';

export const ROLES = [['inbox', 'inbox'], ['drafts', 'file-pen'], ['sent', 'send'], ['archive', 'archive'], ['junk', 'octagon-alert'], ['trash', 'trash']];
const enc = encodeURIComponent;

/** The folder of a role in an address (its name on the server), from its folders or from what the vault remembers. */
export function roleBox(a, role) {
  if (role === 'inbox') return 'INBOX';
  return S.folders[a.id]?.special?.[role] || a.special?.[role] || null;
}
export const sumUnread = (role) => S.accounts.reduce((s, a) => s + (S.folders[a.id]?.list?.find((f) => (role === 'inbox' ? f.raw.toUpperCase() === 'INBOX' : f.raw === roleBox(a, role)))?.unread || 0), 0);

/**
 * shell(root, {current, content, search, fixed, action, noSide}): current is the value of the menu item of this page
 * ('all:inbox', 'f:<address>:<folder>', 'addresses', 'settings'); fixed: the page fills the window (the mail).
 * Returns {main, nav, top, redraw}.
 */
export function shell(root, o = {}) {
  const main = h('main.hmain' + (o.fixed ? '.fixed' : ''));
  const nav = h('nav.hside', { 'aria-label': t('folders') });
  const drawer = h('sav-drawer.mdrawer', { placement: 'start', label: 'SavMail', style: '--size:min(19rem, 86vw)' });
  const menuBtn = o.noSide ? null : iconBtn('menu', t('menu'), () => { put(drawer, side(o, () => drawer.hide(), false)); drawer.show(); }, { class: 'mmenu' });
  const top = h('header.htop', menuBtn, brand(), o.search ? h('div.hsearch', o.search) : null, h('div.spacer'), o.tools || null, userMenu());
  // the side menu folds into a column of icons, as the collapsible vertical tabs of SavComponents: the round handle on its
  // edge, the names in a tip on hover; remembered in this browser. On phones it is a drawer instead.
  const handle = h('button.sfold', { type: 'button' }, h('sav-icon', { name: 'panel-left-close' }));
  // a page of its own (the settings): no side menu at all, the page says how to go back
  const body = o.noSide ? h('div.hbody', main) : h('div.hbody', nav, handle, main);
  const page = h('div.home.app' + (o.fixed ? '.fixed' : '') + (o.noSide ? '.noside' : fold('side-mini') ? '.side-mini' : ''), top, body, o.fixed ? null : credit(), drawer);
  const mini = () => page.classList.contains('side-mini');
  const setMini = (v) => {
    page.classList.toggle('side-mini', v);
    fold('side-mini', v);
    handle.querySelector('sav-icon').setAttribute('name', v ? 'panel-left-open' : 'panel-left-close');
    handle.setAttribute('aria-label', t(v ? 'side_open' : 'side_close'));
    handle.dataset.tip = t(v ? 'side_open' : 'side_close');
    handle.setAttribute('aria-expanded', String(!v));
    redraw();
  };
  o.expand = () => setMini(false);
  handle.addEventListener('click', () => setMini(!mini()));
  const tip = h('div.mtip', { role: 'tooltip', hidden: true });
  const showTip = (el) => { const r = el.getBoundingClientRect(); tip.textContent = el.dataset.tip; tip.style.left = `${r.right + 10}px`; tip.style.top = `${r.top + r.height / 2}px`; tip.hidden = false; };
  const hideTip = () => { tip.hidden = true; };
  nav.addEventListener('pointerover', (e) => { const el = mini() && e.target.closest?.('[data-tip]'); if (el && nav.contains(el)) showTip(el); else hideTip(); });
  nav.addEventListener('pointerleave', hideTip);
  nav.addEventListener('focusin', (e) => { const el = mini() && e.target.closest?.('[data-tip]'); if (el) showTip(el); });
  nav.addEventListener('focusout', hideTip);
  nav.addEventListener('scroll', hideTip, { passive: true });
  nav.addEventListener('click', hideTip);
  put(root, page);
  page.append(tip);
  const redraw = () => put(nav, side(o, null, mini()));
  if (!o.noSide) setMini(mini()); // the settings, without a side menu, leave the choice as it is
  // the folders of every address, once per visit, for the menu of whatever page opens first
  if (S.vault === 'open' && S.accounts.length && !Object.keys(S.folders).length && !shell.loading) {
    shell.loading = import('./mail.js').then((m) => m.loadFolders()).then(() => { if (document.body.contains(nav)) redraw(); }).catch(() => {}).finally(() => { shell.loading = null; });
  }
  if (o.content) put(main, o.content);
  document.body.classList.toggle('inapp', !!o.fixed);
  return { main, nav, top, redraw, setCurrent: (c) => { o.current = c; redraw(); } };
}

/** The menu on the side; mini: only icons (each name in a tip), a dot where something is unread. */
function side(o, after, mini) {
  const cur = o.current || '';
  const item = (value, ic, label, count, attrs = {}) => {
    const x = mini
      ? h('sav-menu-item.mi', { value, 'aria-label': count ? `${label} (${count})` : label, 'data-tip': count ? `${label} · ${count}` : label, ...attrs }, typeof ic === 'string' ? h('sav-icon', { name: ic, slot: 'prefix' }) : ic, count ? h('span.mdot', { slot: 'prefix', 'aria-hidden': 'true' }) : null)
      : h('sav-menu-item', { value, ...attrs }, typeof ic === 'string' ? h('sav-icon', { name: ic, slot: 'prefix' }) : ic, h('span.mlab', label),
        count ? h('sav-badge', { slot: 'suffix', variant: 'primary', appearance: 'soft', pill: true }, String(count)) : null);
    if (value === cur) x.setAttribute('current', '');
    return x;
  };
  const nav = (v) => {
    v = String(v || '');
    if (v === 'x:more') return o.expand?.();
    if (!v || v.startsWith('x:')) return;
    after?.();
    if (v === 'addresses') return go('#/addresses');
    if (v === 'settings') return go('#/settings');
    if (v.startsWith('all:')) return go('#/m/all/' + v.slice(4));
    const [, a, ...f] = v.split(':');
    go(`#/m/${enc(a)}/${enc(f.join(':'))}`);
  };
  const menu = (label, kids) => { const m = h('sav-menu', { label, selectable: true }, kids); m.addEventListener('sav-select', (ev) => nav(ev.detail.value)); return m; };
  const multi = S.accounts.length > 1, out = [];
  if (multi) {
    const kids = [mini ? null : h('sav-menu-label', t('all_mailboxes'))];
    for (const [role, ic] of ROLES) {
      if (role !== 'inbox' && !S.accounts.some((a) => roleBox(a, role))) continue;
      kids.push(item('all:' + role, ic, mini ? t('all_x', { x: t('role_' + role) }) : t('role_' + role), role === 'inbox' || role === 'junk' ? sumUnread(role) : 0));
    }
    out.push(menu(t('all_mailboxes'), kids));
  }
  for (const a of S.accounts) out.push(addressBlock(a, cur, item, menu, nav, mini));
  out.push(h('sav-divider'), menu(t('settings'), [item('addresses', 'at-sign', t('g_mailboxes'), 0), item('settings', 'settings', t('settings'), 0)]));
  const run = () => { after?.(); if (!S.accounts.length) return go('#/addresses/new'); o.compose ? o.compose() : go('#/compose'); };
  const label = S.accounts.length ? t('compose') : t('add_mailbox'), ic = S.accounts.length ? 'square-pen' : 'plus';
  const action = o.action || (mini ? h('sav-button.newbtn.newmini', { variant: 'primary', appearance: 'solid', size: 'lg', square: true, label, 'data-tip': label, onclick: run }, h('sav-icon', { name: ic }))
    : primary(label, { icon: ic, size: 'lg', block: true, class: 'newbtn', onclick: run }));
  return [action, ...out];
}

const fold = (k, v) => { try { if (v === undefined) return localStorage.getItem('savmail-' + k); if (v) localStorage.setItem('savmail-' + k, typeof v === 'string' ? v : '1'); else localStorage.removeItem('savmail-' + k); } catch { return null; } return null; };

/**
 * One address in the side menu: a heading that closes and opens it (remembered in this browser; closed, it shows what is
 * unread), its system folders, then its other folders (Gmail labels, folders of one's own) as a tree whose branches open one
 * by one. Open and closed are always the person's choice, the same in the full menu and in the column of icons.
 */
function addressBlock(a, cur, item, menu, nav, mini) {
  const F = S.folders[a.id];
  const list = F?.list || [{ raw: 'INBOX', name: 'INBOX', role: 'inbox', delim: '/' }];
  const roles = list.filter((f) => f.role), others = list.filter((f) => !f.role);
  const mine = cur.startsWith(`f:${a.id}:`), curRaw = mine ? cur.slice(`f:${a.id}:`.length) : null;
  let open = !fold('closed-' + a.id); // the person's choice, in the full menu and in the icons alike (never opened by itself)
  if (mini) {
    // the same choice as the full menu: a closed address shows only its dot (with a mark when something is unread); a press opens it
    const kids = roles.map((f) => item(`f:${a.id}:${f.raw}`, ROLES.find((r) => r[0] === f.role)?.[1] || 'folder', t('role_' + f.role), f.role === 'inbox' || f.role === 'junk' ? f.unread : 0));
    if (others.length) kids.push(item('x:more', 'folder', t('other_folders', { n: others.length }), 0, { current: others.some((f) => f.raw === curRaw) || null }));
    if (F?.err) kids.push(item('addresses', 'circle-alert', t('mb_problem'), 0, { class: 'aerr' }));
    const unreadAll = list.find((f) => f.raw.toUpperCase() === 'INBOX')?.unread || 0;
    const body = menu(a.email, kids);
    const head = h('button.gdot.ahead-mini', { type: 'button', style: `--g:${a.color || '#8f6500'}` }, (a.name || a.email)[0].toUpperCase(), h('span.mdot.adot-mini', { 'aria-hidden': 'true' }));
    const paint = () => {
      body.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
      head.classList.toggle('closed', !open);
      head.querySelector('.adot-mini').hidden = open || !unreadAll;
      head.dataset.tip = a.email + (!open && unreadAll ? ` · ${unreadAll}` : '');
      head.setAttribute('aria-label', head.dataset.tip);
    };
    head.addEventListener('click', () => { open = !open; fold('closed-' + a.id, !open); paint(); });
    paint();
    return h('div.ablock.mini', head, body);
  }
  const unread = (list.find((f) => f.raw.toUpperCase() === 'INBOX')?.unread || 0);
  const chev = h('sav-icon.achev', { name: 'chevron-down' });
  const badge = h('sav-badge.abadge', { variant: 'primary', appearance: 'soft', pill: true }, String(unread));
  const head = h('button.ahd', { type: 'button', title: a.email }, h('span.gdot.small', { style: `--g:${a.color || '#8f6500'}` }), h('span.aem', a.email), F?.err ? h('sav-icon.aerr', { name: 'circle-alert' }) : null, badge, chev);
  const body = h('div.abody');
  const paint = () => { body.hidden = !open; head.setAttribute('aria-expanded', String(open)); head.classList.toggle('closed', !open); badge.hidden = open || !unread; };
  head.addEventListener('click', () => { open = !open; fold('closed-' + a.id, !open); paint(); });
  const kids = roles.map((f) => item(`f:${a.id}:${f.raw}`, ROLES.find((r) => r[0] === f.role)?.[1] || 'folder', t('role_' + f.role), f.role === 'inbox' || f.role === 'junk' ? f.unread : 0));
  if (F?.err) kids.push(item('addresses', 'circle-alert', t('mb_problem'), 0, { class: 'aerr' }));
  body.append(menu(a.email, kids));
  if (others.length) {
    // the other folders as a tree, from their names ("Etichette/Volt": Volt inside Etichette); a folder with folders inside
    // is a branch, closed until it is opened (the open ones are remembered in this browser)
    let openSet = new Set();
    try { openSet = new Set(JSON.parse(fold('branches-' + a.id) || '[]')); } catch { /* none */ }
    const tree = h('sav-tree.atree', { label: a.email, selectable: true });
    const nodes = new Map();
    const node = (path, parts, f) => {
      const label = (x) => parts[parts.length - 1] + (x?.unread ? ` · ${x.unread}` : '');
      if (nodes.has(path)) { const n = nodes.get(path); if (f) { n.setAttribute('value', `f:${a.id}:${f.raw}`); n.setAttribute('label', label(f)); } return n; }
      const n = h('sav-tree-item', { label: label(f), icon: 'folder', 'icon-open': 'folder-open', value: f ? `f:${a.id}:${f.raw}` : 'x:' + path, 'data-path': path });
      if (openSet.has(path)) n.setAttribute('expanded', '');
      nodes.set(path, n);
      (parts.length > 1 ? node(parts.slice(0, -1).join('/'), parts.slice(0, -1), null) : tree).append(n);
      return n;
    };
    for (const f of others) { const parts = f.name.split(f.delim || '/').filter(Boolean); if (parts.length) node(parts.join('/'), parts, f); }
    // the folder on screen: chosen, and its branch open
    const n = curRaw ? [...nodes.values()].find((x) => x.getAttribute('value') === cur) : null;
    if (n) n.setAttribute('selected', ''); // its branch stays as the person left it
    tree.addEventListener('sav-select', (e) => { const it = e.detail.item; if (String(e.detail.value).startsWith('x:')) { tree.toggle(it); it.removeAttribute('selected'); } else nav(e.detail.value); });
    tree.addEventListener('sav-toggle', (e) => {
      const path = e.detail.item.dataset.path;
      e.detail.expanded ? openSet.add(path) : openSet.delete(path);
      fold('branches-' + a.id, openSet.size ? JSON.stringify([...openSet].slice(-200)) : '');
    });
    body.append(tree);
  }
  paint();
  return h('div.ablock', head, body);
}
