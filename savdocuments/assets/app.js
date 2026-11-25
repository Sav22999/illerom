/** SavDocuments — the app: addresses, accounts, home, settings, administration. */
import { h, put, icon, btn, primary, tool, menu, dialog, confirm, ask, select, toggle, toast, fail, errText, face, copyText } from './ui.js';
import { svg } from './icons.js';
import { t, setLang, getLang, when } from './i18n.js';
import { S, api, local, keep } from './store.js';
import { TEMPLATES, fromTemplate } from './templates.js';
import { DEFAULTS, pageMM } from './settings.js';
import { can, importFile, openFile } from './actions.js';
import { openWriter, optionsForm, reportDialog } from './write.js';

const root = document.getElementById('app');
let writer = null, draft = 0;

// ------------------------------------------------------------------ preferences (kept in the account, or in this browser)

export const prefs = () => S.user?.prefs || JSON.parse(localStorage.getItem('savdocuments-prefs') || '{}');
export async function setPrefs(p) {
  const all = { ...prefs(), ...p };
  if (S.user) { S.user.prefs = all; await api('auth.prefs', { prefs: all }); }
  localStorage.setItem('savdocuments-prefs', JSON.stringify(all));
  applyTheme();
}
function applyTheme() { window.Sav?.setMode(prefs().theme || 'auto'); }

function setUser(u, csrf) {
  S.user = u;
  if (csrf) S.csrf = csrf;
  if (u) { if (u.prefs && Object.keys(u.prefs).length) localStorage.setItem('savdocuments-prefs', JSON.stringify(u.prefs)); if (Array.isArray(u.prefs)) u.prefs = {}; setLang(u.lang); }
  applyTheme();
}

// ------------------------------------------------------------------ boot and addresses

async function boot() {
  setLang(getLang());
  applyTheme();
  window.Sav?.registerIcon('pipette', svg('pipette', 24)); // the only icon the controls would ask to another site
  try {
    S.config = await api('auth.config');
    if (S.config.installed) { const me = await api('auth.me'); if (me.user) setUser(me.user, me.csrf); }
  } catch (e) { S.config = { installed: false, down: true }; if (e.code !== 'network') console.error(e); }
  window.Identity?.setup({ name: 'SavDocuments', lang: getLang, accent: '#0F6E56', accept: 'acceptTerms', acceptUrl: () => 'terms.html', google: (slot, cb) => googleButton(slot, cb), body: () => ({ lang: getLang() }) });
  // signed in with Google or SavAccount (the page was left and came back): on to the document that was asked for
  const next = sessionStorage.getItem('savdocuments-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savdocuments-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  addEventListener('hashchange', route);
  // a .savdoc or .docx opened from the files of the device
  window.launchQueue?.setConsumer(async (p) => { for (const f of p.files || []) await openFile(await f.getFile()); });
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function route() {
  const [, a = '', b = ''] = location.hash.split('/');
  const n = ++draft;
  if (writer) { const w = writer; writer = null; w.close(); }
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  try {
    if (a === 'verify') return verify(b);
    if (a === 'reset') return reset(b);
    if (a === 'invite') return await invite(b);
    if (a === 'd' && b) {
      put(root, h('div.wait', h('img', { src: 'icons/favicon.svg', width: 56, height: 56, alt: '' })));
      const w = await openWriter(root, b, { review: location.hash.endsWith('/review'), onReload: (x) => { writer = x; } });
      if (n !== draft) w.close(); else writer = w;
      return;
    }
    document.title = 'SavDocuments';
    if (a === 'signin' || a === 'signup') return S.user ? go('#/') : land(a);
    if (a === 'admin' && S.user?.master) return admin(b || 'overview');
    if (S.user && !S.user.verified) return unverified();
    const left = !S.user && (await local.list().catch(() => [])).length;
    if (S.user || a === 'local' || (left && a !== 'welcome')) return home(a, b);
    land();
  } catch (e) {
    if (n !== draft) return;
    if (!e.code) console.error(e);
    if (e.code === 'doc_signin') return land('signin', h('sav-alert', { variant: 'neutral', heading: t('doc_signin') }, t('doc_signin_text')));
    put(root, h('div.wait', h('div.empty', h('img', { src: 'icons/favicon.svg', width: 56, height: 56, alt: '' }), h('strong', errText(e)), h('div.row', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}
const go = (x) => { if (location.hash === x) route(); else location.hash = x; };

// ------------------------------------------------------------------ files

async function create(tp, folder) {
  const d = { title: tp === 'blank' ? t('untitled') : t('tp_' + tp), ...fromTemplate(tp, prefs().defaults || {}) };
  go('#/d/' + (await keep(d, { folder })));
}

// ------------------------------------------------------------------ accounts

let gis = null;
function googleButton(slot, cb) {
  if (!S.config.googleClientId) return;
  gis ||= new Promise((ok, no) => { const s = h('script', { src: 'https://accounts.google.com/gsi/client', async: true }); s.onload = ok; s.onerror = no; document.head.append(s); });
  gis.then(() => {
    google.accounts.id.initialize({ client_id: S.config.googleClientId, callback: (r) => cb(r.credential) });
    google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', width: Math.min(360, slot.clientWidth || 320), locale: getLang(), text: 'continue_with' });
  }).catch(() => {});
}
const langSwitch = () => h('div.langs', ['it', 'en'].map((l) => h('button' + (getLang() === l ? '.on' : ''), { type: 'button', lang: l, onclick: () => { setLang(l); if (S.user) api('auth.profile', { lang: l }).catch(() => {}); route(); } }, l === 'it' ? 'Italiano' : 'English')));
const credit = () => h('footer.credit', h('a', { href: 'privacy.html' }, 'Privacy'), h('a', { href: 'terms.html' }, t('terms')), h('a', { href: 'https://www.illerom.eu/', rel: 'noopener' }, 'Illerom'), h('span', getLang() === 'it' ? 'di ' : 'by ', h('a.sig', { href: 'https://www.saveriomorelli.com', rel: 'noopener' }, 'Saverio Morelli')), langSwitch());

function signedIn(r) {
  setUser(r.user, r.csrf);
  const next = sessionStorage.getItem('savdocuments-next');
  sessionStorage.removeItem('savdocuments-next');
  go(next || '#/');
}

function authCard(mode) {
  const box = h('div.card.auth');
  const draw = () => {
    const err = h('p.dlg-err', { hidden: true, role: 'alert' });
    const show = (e) => { err.textContent = errText(e); err.hidden = false; };
    const name = h('sav-input', { label: t('your_name'), maxlength: 80, autocomplete: 'name' }), email = h('sav-input', { label: t('email'), type: 'email', autocomplete: 'email', help: mode === 'signup' ? t('email_fixed') : null });
    const pw = h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: mode === 'signup' ? 'new-password' : 'current-password', help: mode === 'signup' ? t('pw_hint') : null });
    const terms = h('sav-checkbox', {}, t('accept') + ' ', h('a', { href: 'terms.html', target: '_blank' }, t('terms')), ` ${t('and_privacy')} `, h('a', { href: 'privacy.html', target: '_blank' }, t('privacy')));
    const submit = primary(t(mode === 'signup' ? 'sign_up' : 'sign_in'), { block: true });
    const run = async () => {
      if (submit.loading) return;
      submit.loading = true;
      err.hidden = true;
      try {
        if (mode === 'signup') {
          await api('auth.register', { name: name.value, email: email.value, password: pw.value, acceptTerms: terms.checked, lang: getLang() });
          put(box, h('div.empty', icon('mail', 40), h('strong', t('check_email')), h('p.muted', t('check_email_text'))));
        } else signedIn(await api('auth.login', { email: email.value, password: pw.value }));
      } catch (e) { show(e); } finally { submit.loading = false; }
    };
    submit.addEventListener('click', run);
    const form = h('div.form', mode === 'signup' ? name : null, email, pw, mode === 'signup' ? terms : null, err, submit);
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.localName === 'sav-input') run(); });
    const g = h('div.gbox'), sav = window.Identity?.button(S.config.savAccount) || null;
    put(box, h('div.seg', ['signin', 'signup'].map((k) => h('button' + (mode === k ? '.on' : ''), { type: 'button', onclick: () => { mode = k; draw(); } }, t(k === 'signin' ? 'sign_in' : 'sign_up')))), form,
      mode === 'signin' ? h('button.linkish', { type: 'button', onclick: forgot }, t('forgot')) : !S.config.mailReady && S.config.installed ? h('p.muted.small', t('mail_off')) : null,
      S.config.googleClientId || sav ? [h('div.or', h('span', t('or'))), S.config.googleClientId ? g : null, sav, h('p.muted.small.center', t('google_terms'))] : null);
    if (S.config.googleClientId) setTimeout(() => googleButton(g, async (credential) => {
      try {
        let r = await api('auth.google', { credential, lang: getLang() });
        if (r.error === 'needs_signup') { if (!(await confirm(t('sign_up'), t('google_new'), t('create'), false))) return; r = await api('auth.google', { credential, acceptTerms: true, lang: getLang() }); }
        signedIn(r);
      } catch (e) { if (!window.Identity?.handle(e)) show(e); }
    }));
  };
  draw();
  if (!S.config.installed) put(box, h('div.empty', icon('cloud-off', 36), h('p.muted', t(S.config.down ? 'err_network' : 'err_not_installed'))));
  return box;
}
function forgot() {
  const email = h('sav-input', { label: t('email'), type: 'email', autofocus: true });
  dialog({ title: t('forgot'), body: h('div.form', h('p.muted', t('forgot_text')), email), actions: [{ label: t('cancel') }, { label: t('send_link'), primary: true, run: async () => { await api('auth.forgot', { email: email.value, lang: getLang() }); toast(t('link_sent'), 'success'); } }] });
}
function land(mode = 'signin', note) {
  if (/^#\/(d|invite)\//.test(location.hash)) sessionStorage.setItem('savdocuments-next', location.hash);
  put(root, h('div.land', h('header.lhead', h('a.brand', { href: '#/welcome' }, h('img', { src: 'icons/favicon.svg', width: 40, height: 40, alt: '' }), h('span', 'SavDocuments')), langSwitch()),
    h('main.lmain', h('div.ltext', h('h1', t('land_title')), h('p.lead', t('land_text')), h('div.row.wrap', primary(t('try_now'), { icon: 'pencil', size: 'lg', onclick: () => create('blank') }), btn(t('open_file'), { icon: 'upload', size: 'lg', onclick: () => importFile() })), h('p.muted.small', t('try_hint')), demo()), h('div.lside', note || null, authCard(mode === 'signup' ? 'signup' : 'signin'))), credit()));
}
const demo = () => h('div.demo', { 'aria-hidden': 'true' }, h('div.dsheet', h('b'), h('i'), h('i.s'), h('i'), h('i.m'), h('div.dtable', Array.from({ length: 9 }, () => h('span'))), h('i'), h('i.caret')), h('div.dsheet.two', h('i'), h('i.m'), h('div.dimg'), h('i'), h('i.s')));

function verify(token) {
  put(root, h('div.wait', h('div.card.auth', h('div.empty', icon('mail', 40), h('strong', t('verify_title')), h('p.muted', t('verify_text')), primary(t('verify_btn'), { onclick: async () => { signedIn(await api('auth.verify', { token })); } })))));
}
function reset(token) {
  const pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') });
  put(root, h('div.wait', h('div.card.auth', h('h2', t('reset_title')), h('div.form', pw, primary(t('save'), { block: true, onclick: async () => { signedIn(await api('auth.reset', { token, password: pw.value })); } })))));
}
function unverified() {
  put(root, h('div.wait', h('div.card.auth', h('div.empty', icon('mail', 40), h('strong', t('unverified')), h('p.muted', S.user.email), primary(t('resend'), { onclick: async () => { await api('auth.resend', { lang: getLang() }); toast(t('resent'), 'success'); } }), btn(t('sign_out'), { onclick: signOut })))));
}
async function invite(token) {
  if (!S.user?.verified) { land('signin', h('sav-alert', { variant: 'primary', heading: t('invite_open') }, t('invite_text'))); sessionStorage.setItem('savdocuments-next', location.hash); return; }
  try { go('#/d/' + (await api('invite.accept', { token })).doc); } catch (e) { fail(e); go('#/'); }
}
async function signOut() { await api('auth.logout', {}); S.user = null; S.csrf = ''; go('#/welcome'); }

// ------------------------------------------------------------------ home

const thumb = (id) => {
  const x = fromTemplate(id, prefs().defaults || {}), [w, hh] = pageMM(x.settings);
  const kinds = x.blocks.slice(0, 13).map(({ h: b }) => (/class="title"/.test(b) ? 'T' : /class="subtitle"/.test(b) ? 'S' : /^<h\d/.test(b) ? 'H' : /^<table/.test(b) ? 'G' : /^<[ou]l/.test(b) ? 'L' : /toc/.test(b) ? 'C' : /"pb"/.test(b) ? 'X' : /text-align:right/.test(b) ? 'R' : 'P'));
  const cut = kinds.indexOf('X');
  return h('span.th', { style: `aspect-ratio:${w}/${hh}` }, (id === 'blank' ? [] : (cut > 0 ? kinds.slice(0, cut) : kinds)).map((k) => (k === 'G' ? h('span.g', Array.from({ length: 6 }, () => h('u'))) : k === 'L' || k === 'C' ? [h('i.L'), h('i.L')] : h('i.' + k))), id === 'blank' ? icon('plus', 26) : null);
};

async function home(view = '', arg = '') {
  const docs = [], folders = [];
  const main = h('main.hmain'), nav = h('nav.hnav');
  const q = h('sav-input', { type: 'search', placeholder: t('search'), 'aria-label': t('search'), clearable: true });
  const av = S.user ? h('button.avb', { type: 'button', 'aria-label': t('settings'), onclick: () => menu(av, [{ head: S.user.name }, { head: S.user.email }, '-', { label: t('settings'), icon: 'settings', run: () => settings() }, S.user.master ? { label: t('admin'), icon: 'shield', run: () => go('#/admin') } : null, '-', { label: t('sign_out'), icon: 'log-out', run: signOut }], { end: true }) }, face(S.user.name)) : btn(t('sign_in'), { size: 'sm', href: '#/signin' });
  put(root, h('div.home', h('header.hhead', h('a.brand', { href: '#/' }, h('img', { src: 'icons/favicon.svg', width: 36, height: 36, alt: '' }), h('span', 'SavDocuments')), h('div.hsearch', q), S.user ? null : tool('settings', t('settings'), () => settings()), av), h('div.hbody', nav, main), credit()));
  let term = '';
  q.addEventListener('input', () => { term = q.value.trim().toLowerCase(); draw(); });
  const locals = await local.list().catch(() => []);
  if (S.user) { put(main, h('p.muted', t('loading'))); const d = await api('doc.list'); docs.push(...d.docs); folders.push(...d.folders); }
  const reload = async () => { const d = S.user ? await api('doc.list') : null; if (d) { docs.splice(0, docs.length, ...d.docs); folders.splice(0, folders.length, ...d.folders); } locals.splice(0, locals.length, ...(await local.list())); draw(); };
  const V = {
    '': ['all_docs', 'file-text', () => docs.filter((d) => d.mine && !d.deleted)], recent: ['recent', 'clock', () => docs.filter((d) => d.opened && !d.deleted).sort((a, b) => (a.opened < b.opened ? 1 : -1))], shared: ['shared', 'users', () => docs.filter((d) => !d.mine)],
    starred: ['starred', 'star', () => docs.filter((d) => d.starred && !d.deleted)], trash: ['trash', 'trash-2', () => docs.filter((d) => d.mine && d.deleted)], local: ['on_device', 'smartphone', () => locals.map((d) => ({ id: d.id, title: d.title, local: true, updated: new Date(d.updated).toISOString(), words: null }))],
  };
  if (!S.user) view = 'local';
  const folder = view === 'f' ? folders.find((f) => f.id === +arg) : null;
  if (view !== 'f' && !V[view]) view = '';

  function draw() {
    const link = (k, label, ic) => h('a' + (view === k && !folder ? '.on' : ''), { href: '#/' + k }, icon(ic, 18), h('span', label));
    put(nav, S.user ? ['', 'recent', 'shared', 'starred'].map((k) => link(k, t(V[k][0]), V[k][1])) : null, locals.length || !S.user ? link('local', t('on_device'), 'smartphone') : null, S.user ? link('trash', t('trash'), 'trash-2') : null,
      S.user ? h('div.nhead', t('folders'), tool('folder-plus', t('new_folder'), async () => { const n = await ask(t('new_folder'), t('folder_name'), '', t('create')); if (n) { await api('folder.create', { name: n }); reload(); } })) : null,
      folders.map((f) => h('div.nf' + (folder?.id === f.id ? '.on' : ''), h('a', { href: '#/f/' + f.id }, icon('folder', 18), h('span', f.name)), tool('ellipsis', t('more'), (b) => menu(b, [{ label: t('rename'), icon: 'pencil', run: async () => { const n = await ask(t('rename'), t('folder_name'), f.name); if (n) { await api('folder.rename', { id: f.id, name: n }); reload(); } } }, { label: t('delete'), icon: 'trash-2', danger: true, run: async () => { if (await confirm(f.name, t('folder_delete_text'), t('delete'))) { await api('folder.delete', { id: f.id }); folder?.id === f.id ? go('#/') : reload(); } } }])))));
    const list = (term ? [...docs.filter((d) => !d.deleted), ...V.local[2]()].filter((d) => d.title.toLowerCase().includes(term)) : folder ? docs.filter((d) => d.mine && !d.deleted && d.folder === folder.id) : V[view][2]());
    const starts = !term && ['', 'local', 'recent'].includes(view) || folder;
    put(main,
      starts ? h('section.starts', h('h2', t('start_from')), h('div.tps', Object.keys(TEMPLATES).map((k) => h('button.tp', { type: 'button', onclick: (e) => { const b = e.currentTarget; if (b.disabled) return; b.disabled = true; create(k, folder?.id).catch((x) => { b.disabled = false; fail(x); }); } }, thumb(k), h('span', t('tp_' + k)))), h('button.tp', { type: 'button', onclick: () => importFile(folder?.id) }, h('span.th.up', { style: 'aspect-ratio:210/297' }, icon('upload', 26)), h('span', t('open_file'))))) : null,
      h('section', h('div.lhd', h('h2', term ? t('search') : folder ? folder.name : t(V[view][0])), view === 'trash' ? h('span.muted.small', t('trash_note')) : view === 'local' ? h('span.muted.small', t('try_hint')) : null),
        list.length ? h('div.docs', list.map(row)) : h('div.empty', icon('file-text', 40), h('strong', t(term ? 'empty_search' : 'empty_docs')), term || view === 'trash' || view === 'shared' ? null : h('p.muted', t('empty_docs_text')))));
  }
  function row(d) {
    const info = [d.mine === false ? d.owner : null, `${when(d.updated)}`, d.words !== null ? `${d.words.toLocaleString(getLang())} ${t(d.words === 1 ? 'word' : 'words')}` : null, d.suspended ? t('suspended') : null].filter(Boolean).join(' · ');
    return h('div.docrow', h('a.doclink', { href: '#/d/' + d.id }, h('span.fi', { html: svg('file-text', 20) }), h('span.dt', h('strong', d.title), h('span.muted.small', info))),
      d.visibility === 'link' ? h('span.dst', { title: t('v_link'), html: svg('globe', 16) }) : d.people ? h('span.dst', { title: t('sh_people'), html: svg('users', 16) }) : null,
      d.local || d.deleted ? null : h('button.tb.star' + (d.starred ? '.on' : ''), { type: 'button', 'aria-label': t(d.starred ? 'unstar' : 'star'), 'aria-pressed': String(!!d.starred), html: svg('star', 17), onclick: async () => { d.starred = !d.starred; draw(); api('doc.star', { doc: d.id, on: d.starred }).catch(fail); } }),
      tool('ellipsis-vertical', t('more'), (b) => rowMenu(b, d)));
  }
  function rowMenu(b, d) {
    const act = (r, body, msg, opt) => api(r, { doc: d.id, ...body }).then(() => { if (msg) toast(msg, 'neutral', opt); return reload(); });
    if (d.local) return menu(b, [{ label: t('rename'), icon: 'pencil', run: async () => { const n = await ask(t('rename'), t('rename_doc'), d.title); if (n) { await local.put({ ...(await local.get(d.id)), title: n }); reload(); } } }, S.user?.verified ? { label: t('save_account'), icon: 'cloud-upload', run: () => toAccount(d.id).then(reload) } : null, '-', { label: t('delete_forever'), icon: 'trash-2', danger: true, run: async () => { if (await confirm(d.title, t('delete_sure'), t('delete'))) { await local.remove(d.id); reload(); } } }], { end: true });
    if (d.deleted) return menu(b, [{ label: t('restore'), icon: 'rotate-ccw', run: () => act('doc.restore') }, { label: t('delete_forever'), icon: 'trash-2', danger: true, run: async () => { if (await confirm(d.title, t('delete_sure'), t('delete'))) await act('doc.delete'); } }], { end: true });
    menu(b, [
      can(d.role, 'editor') ? { label: t('rename'), icon: 'pencil', run: async () => { const n = await ask(t('rename'), t('rename_doc'), d.title); if (n) await act('doc.rename', { title: n }); } } : null,
      { label: t('duplicate'), icon: 'copy', run: () => act('doc.duplicate', { title: `${t('copy_of')} ${d.title}`.slice(0, 160) }) }, d.mine ? { label: t('move'), icon: 'folder', run: () => moveDialog(d) } : null,
      { label: t('copy_link'), icon: 'link-2', run: () => copyText(`${location.origin}${location.pathname}#/d/${d.id}`, t('link_copied')) }, d.mine ? null : { label: t('report'), icon: 'flag', run: () => reportDialog(d.id) }, '-',
      d.mine ? { label: t('to_trash'), icon: 'trash-2', danger: true, run: () => act('doc.trash', {}, t('moved_trash')) } : { label: t('leave'), icon: 'x', danger: true, run: () => act('doc.leave') },
    ], { end: true });
  }
  function moveDialog(d) {
    const s = select(t('folders'), [['', t('no_folder')], ...folders.map((f) => [String(f.id), f.name])], d.folder ? String(d.folder) : '');
    dialog({ title: t('move'), body: s, actions: [{ label: t('cancel') }, { label: t('move').replace('…', ''), primary: true, run: async () => { await api('doc.move', { doc: d.id, folder: s.value ? +s.value : null }); reload(); } }] });
  }
  draw();
}

async function toAccount(id) {
  const d = await local.get(id), images = {};
  for (const i of d.images || []) { const b = await local.image(i); if (b) images[i] = b; }
  await keep({ title: d.title, settings: d.content.settings, blocks: d.content.blocks, images });
  await local.remove(id);
  toast(t('saved_account'), 'success');
}

// ------------------------------------------------------------------ settings

function settings() {
  const p = prefs(), u = S.user;
  const opt = (k, def = true) => toggle(t(k), p[k] ?? def, (v) => setPrefs({ [k]: v }).catch(fail));
  const name = u ? h('sav-input', { label: t('your_name'), value: u.name, maxlength: 80 }) : null;
  const pwBox = () => {
    const cur = h('sav-input', { label: t('current_pw'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }), pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') });
    dialog({ title: t(u.hasPassword ? 'change_pw' : 'set_pw'), body: h('div.form', u.hasPassword ? cur : null, pw), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => { const r = await api('auth.password', { current: cur.value, password: pw.value }); setUser(r.user); toast(t('pw_changed'), 'success'); } }] });
  };
  const del = () => {
    const pw = h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' });
    dialog({ title: t('delete_account'), body: h('div.form', h('p', t('delete_account_text')), u.hasPassword ? pw : null), actions: [{ label: t('cancel') }, { label: t('delete_account'), danger: true, run: async () => { await api('auth.delete', { password: pw.value }); S.user = null; go('#/welcome'); } }] });
  };
  const defs = () => {
    const s = { ...structuredClone(DEFAULTS), lang: getLang(), ...(prefs().defaults || {}) };
    optionsForm(s, { title: t('g_defaults'), done: async () => { await setPrefs({ defaults: s }); toast(t('settings_saved'), 'success'); } });
  };
  dialog({ title: t('settings'), width: '36rem', body: h('sav-tabs', {},
    h('sav-tab', { label: t('g_editor'), name: 'ed' }, h('div.form', h('div.grid2', select(t('theme'), ['auto', 'light', 'dark'].map((k) => [k, t('th_' + k)]), p.theme || 'auto', (v) => setPrefs({ theme: v }).catch(fail)), select(t('language'), [['it', 'Italiano'], ['en', 'English']], getLang(), async (v) => { setLang(v); if (u) { const r = await api('auth.profile', { lang: v }).catch(fail); if (r) setUser(r.user); } document.querySelector('sav-dialog')?.hide(); route(); })), opt('spellcheck'), opt('autoformat'), opt('bubble'))),
    h('sav-tab', { label: t('g_defaults'), name: 'def' }, h('div.form', h('p.muted', t('defaults_text')), btn(t('doc_options'), { icon: 'settings', onclick: () => { defs(); } }))),
    u ? h('sav-tab', { label: t('g_account'), name: 'acc' }, h('div.form', h('div.row.end', h('div.grow', name), btn(t('save'), { onclick: async () => { const r = await api('auth.profile', { name: name.value, lang: getLang() }); setUser(r.user); toast(t('settings_saved'), 'success'); route(); } })), h('p.muted', u.email), h('div.row.wrap', btn(t(u.hasPassword ? 'change_pw' : 'set_pw'), { icon: 'lock', onclick: () => { pwBox(); } }), window.Identity ? btn(window.Identity.text('methods'), { icon: 'shield', onclick: () => { window.Identity.methods(); } }) : null), btn(t('delete_account'), { icon: 'trash-2', variant: 'danger', onclick: () => { del(); } }))) : null) });
}

// ------------------------------------------------------------------ administration

async function admin(tab) {
  const main = h('main.hmain'), tabs = ['overview', 'users', 'docs', 'reports'];
  put(root, h('div.home', h('header.hhead', h('a.brand', { href: '#/' }, h('img', { src: 'icons/favicon.svg', width: 36, height: 36, alt: '' }), h('span', 'SavDocuments')), h('span.grow'), h('span.badge', t('admin'))), h('div.hbody', h('nav.hnav', tabs.map((k) => h('a' + (k === tab ? '.on' : ''), { href: '#/admin/' + k }, icon({ overview: 'monitor', users: 'users', docs: 'file-text', reports: 'flag' }[k], 18), h('span', t('a_' + k)))), h('a', { href: '#/' }, icon('arrow-left', 18), h('span', t('home')))), main)));
  const table = (heads, rows) => h('div.tbox', h('table.at', h('thead', h('tr', heads.map((x) => h('th', x)))), h('tbody', rows.map((r) => h('tr', r.map((c) => h('td', c)))))));
  const search = (fn) => { const q = h('sav-input', { type: 'search', placeholder: t('a_find'), clearable: true }); let to; q.addEventListener('input', () => { clearTimeout(to); to = setTimeout(() => fn(q.value.trim()).catch(fail), 300); }); return q; };
  const box = h('div');
  const suspend = (id, on) => api('master.suspend', { doc: id, on });
  if (tab === 'overview') {
    const o = await api('master.overview');
    put(main, h('h2', t('a_overview')), h('div.stats', [['a_users', o.users], ['a_blocked', o.blocked], ['a_docs', o.docs], ['a_active', o.active], ['a_images', (o.images / 1048576).toFixed(1) + ' MB'], ['a_reports', o.reports]].map(([k, v]) => h('div.stat', h('strong', typeof v === 'number' ? v.toLocaleString(getLang()) : v), h('span.muted', t(k))))), h('p.muted', t('a_privacy')));
  } else if (tab === 'users') {
    const load = async (q = '') => {
      const { users } = await api('master.users', undefined, { q });
      put(box, table([t('name'), t('a_docs'), t('a_last'), '', ''], users.map((u) => [[h('strong', u.name), h('div.muted.small', u.email)], u.docs, when(u.login) || '—', u.blocked ? h('sav-badge', { variant: 'danger' }, t('rep_' + u.reason) + (u.note ? ': ' + u.note : '')) : u.master ? h('sav-badge', { variant: 'primary' }, t('admin')) : u.verified ? '' : h('sav-badge', { variant: 'neutral' }, t('a_unverified')),
        u.master ? '' : btn(t(u.blocked ? 'a_unblock' : 'a_block'), { size: 'sm', icon: u.blocked ? 'circle-check' : 'ban', variant: u.blocked ? 'neutral' : 'danger', onclick: () => {
          if (u.blocked) return api('master.block', { id: u.id, on: false }).then(() => load(q));
          const why = select(t('reason'), ['spam', 'phishing', 'illegal', 'other'].map((k) => [k, t('rep_' + k)]), 'spam'), note = h('sav-input', { label: t('a_note'), maxlength: 300 });
          dialog({ title: `${t('a_block')}: ${u.name}`, body: h('div.form', h('p.muted', t('a_block_t')), why, note), actions: [{ label: t('cancel') }, { label: t('a_block'), danger: true, run: async () => { await api('master.block', { id: u.id, on: true, reason: why.value, note: note.value }); load(q); } }] });
        } })])));
    };
    put(main, h('h2', t('a_users')), search(load), box);
    await load();
  } else if (tab === 'docs') {
    const load = async (q = '') => {
      const { docs } = await api('master.docs', undefined, { q });
      put(box, table([t('document'), t('a_owner'), t('modified'), t('a_access'), ''], docs.map((d) => [[h('code', d.id), h('div.muted.small', `${d.words} ${t('words')} · ${Math.ceil(d.bytes / 1024)} KB`)], [d.owner, h('div.muted.small', d.email)], when(d.updated), [t(d.visibility === 'link' ? 'a_link' : 'a_private'), d.reports ? h('div', h('sav-badge', { variant: 'warning' }, `${t('a_reports')}: ${d.reports}`)) : null, d.suspended ? h('div', h('sav-badge', { variant: 'danger' }, t('suspended'))) : null], btn(t(d.suspended ? 'a_unsuspend' : 'a_suspend'), { size: 'sm', variant: d.suspended ? 'neutral' : 'danger', onclick: () => suspend(d.id, !d.suspended).then(() => load(q)) })])));
    };
    put(main, h('h2', t('a_docs')), h('p.muted.small', t('a_privacy')), search(load), box);
    await load();
  } else {
    const load = async () => {
      const { reports } = await api('master.reports');
      put(box, reports.length ? table([t('document'), t('reason'), t('a_owner'), '', ''], reports.map((r) => [[h('strong', r.title), h('div.muted.small', when(r.at))], [t('rep_' + r.reason), r.note ? h('div.muted.small', r.note) : null], [r.owner, h('div.muted.small', r.email)], h('sav-badge', { variant: r.open ? 'warning' : 'neutral' }, t(r.open ? 'a_open' : 'a_done')),
        h('div.row.wrap', r.open ? btn(t('a_review'), { size: 'sm', icon: 'eye', href: `#/d/${r.doc}/review` }) : null, btn(t(r.suspended ? 'a_unsuspend' : 'a_suspend'), { size: 'sm', variant: r.suspended ? 'neutral' : 'danger', onclick: () => suspend(r.doc, !r.suspended).then(load) }), btn(t(r.open ? 'a_closed' : 'a_reopen'), { size: 'sm', onclick: () => api('master.report', { id: r.id, closed: r.open }).then(load) }))])) : h('div.empty', icon('flag', 36), h('p.muted', t('c_none').replace(t('comments').toLowerCase(), t('a_reports').toLowerCase()))));
    };
    put(main, h('h2', t('a_reports')), h('p.muted.small', t('a_privacy')), box);
    await load();
  }
}


boot();
