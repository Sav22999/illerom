/** Settings: a page of its own, cards as in SavPresentations — new documents, sharing, editor, offline, look, account, data. */
import { btn, dialog, fail, h, icon, put, select, toast } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, offline } from './store.js';
import { brand, credit, go, prefs, setPrefs, setUser, signOut, userMenu } from './account.js';
import { DEFAULTS, FONTS, LOOKS, SIZES } from './settings.js';
import { pageForm, styleForm } from './panels.js';
import { fontDialog, fontOptions, withFont } from './fonts.js';
import { download } from './files.js';

export function settingsScreen(root) {
  const u = S.user, p = prefs();
  const saved = () => toast(t('settings_saved'), 'success');
  const save = (x, quiet) => setPrefs(x).then(() => { if (!quiet) saved(); }).catch(fail);
  const sw = (k, label, def = true, help) => { const s = h('sav-switch', { checked: (p[k] ?? def) || null, help }, label); s.addEventListener('change', () => save({ [k]: s.checked }, true)); return s; };
  const card = (title, ic, ...kids) => h('sav-card.scard', { appearance: 'elevated' }, h('div.shead', { slot: 'header' }, icon(ic), h('strong', title)), h('div.form', kids));

  // new documents: the most used choices here, everything else in "All options"
  const defs = () => ({ ...structuredClone(DEFAULTS), lang: getLang(), ...(prefs().defaults || {}) });
  const setDef = (x) => save({ defaults: { ...(prefs().defaults || {}), ...x } });
  const d = defs(), md = { size: 'md' };
  const allDefaults = () => {
    const s = defs(), up = (x) => Object.assign(s, x);
    dialog({ title: t('g_defaults'), width: '34rem', body: h('sav-tabs', h('sav-tab', { label: t('tab_page') }, pageForm(s, up)), h('sav-tab', { label: t('tab_style') }, styleForm(s, up))), actions: [{ label: t('reset'), run: async () => { await setPrefs({ defaults: null }); saved(); go('#/settings'); } }, { label: t('cancel') }, { label: t('save'), primary: true, run: async () => { await setPrefs({ defaults: s }); saved(); go('#/settings'); } }] });
  };
  const newDocs = card(t('g_defaults'), 'file-text', h('p.muted', t('defaults_text')),
    h('div.grid2', select(t('o_size'), Object.keys(SIZES).map((k) => [k, `${k} · ${SIZES[k].join(' × ')} mm`]), d.size === 'custom' ? 'A4' : d.size, (v) => setDef({ size: v }), md), select(t('o_orient'), [['0', t('portrait')], ['1', t('landscape')]], d.landscape ? '1' : '0', (v) => setDef({ landscape: v === '1' }), md)),
    h('div.grid2', select(t('look'), [['', t('look_none')], ...Object.keys(LOOKS).map((k) => [k, t('look_' + k)])], '', (v) => { if (v) setDef(LOOKS[v]); }, md), select(t('font'), fontOptions(d.fonts), d.font, (v) => { if (v !== '__more') return setDef({ font: v, headFont: v }); fontDialog({ current: d.font, used: d.fonts, onpick: (f) => { setDef({ font: f.n, headFont: f.n, fonts: withFont(d.fonts, f) }); go('#/settings'); } }); }, { ...md, searchable: true })),
    select(t('doc_lang'), [['it', 'Italiano'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['ro', 'Română']], d.lang, (v) => setDef({ lang: v }), md),
    h('div', btn(t('all_options'), { size: 'sm', icon: 'sliders-horizontal', appearance: 'outline', onclick: allDefaults })));

  const sharing = card(t('sharing'), 'users',
    select(t('access_new'), [['private', t('v_private')], ['link', t('v_link')]], p.access || 'private', (v) => save({ access: v }), md),
    select(t('link_role_new'), [['viewer', t('r_viewer')], ['commenter', t('r_commenter')], ['editor', t('r_editor')]], p.linkRole || 'viewer', (v) => save({ linkRole: v }), md),
    sw('mailShare', t('mail_share')));

  const editor = card(t('g_editor'), 'pencil', sw('spellcheck', t('g_spellcheck')), sw('autoformat', t('g_autoformat')), sw('bubble', t('g_bubble')), sw('rulers', t('g_rulers')), sw('outline', t('g_outline')),
    h('div', btn(t('toolbar_reset'), { size: 'sm', icon: 'settings-2', appearance: 'outline', onclick: () => save({ tools: null }) })));

  // offline: copies of the recent documents in this browser
  const count = h('span.muted'), showCount = async () => { put(count, t('offline_n', { n: (await offline.docs()).length })); };
  const off = h('sav-switch', { checked: p.offline !== false || null, help: t('offline_help') }, t('offline_keep'));
  off.addEventListener('change', async () => { await save({ offline: off.checked }, true); if (!off.checked) await offline.clear(); showCount(); });
  const offCard = card(t('offline_title'), 'cloud-off', h('p.muted', t('offline_text')), off, count, h('div', btn(t('offline_clear'), { size: 'sm', icon: 'trash', appearance: 'outline', onclick: async () => { await offline.clear(); showCount(); saved(); } })));
  showCount();

  const theme = h('sav-theme-choice', { value: p.theme || 'auto', appearance: 'buttons', label: t('theme') });
  theme.addEventListener('change', (e) => save({ theme: e.detail?.value ?? theme.value }, true));
  const look = card(t('look_app'), 'palette', theme, select(t('language'), [['it', 'Italiano'], ['en', 'English']], getLang(), async (v) => { setLang(v); u.lang = v; await api('auth.profile', { lang: v }).catch(fail); go('#/settings'); }, md));

  const name = h('sav-input', { label: t('your_name'), value: u.name, maxlength: 80 });
  const cur = h('sav-input', { label: t('current_pw'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }), pw = h('sav-input', { label: t('new_password'), type: 'password', 'password-toggle': true, autocomplete: 'new-password', help: t('pw_hint') });
  const account = card(t('g_account'), 'user', h('p.muted', u.email), name, h('div', btn(t('save'), { size: 'sm', onclick: async () => { try { const r = await api('auth.profile', { name: name.value, lang: getLang() }); setUser({ ...r.user, prefs: prefs() }); saved(); } catch (e) { fail(e); } } })),
    window.Identity ? h('div', btn(window.Identity.text('methods'), { size: 'sm', icon: 'shield', appearance: 'outline', onclick: () => window.Identity.methods() })) : null,
    h('h4', t(u.hasPassword ? 'change_pw' : 'set_pw')), u.hasPassword ? cur : null, pw, h('div', btn(t('save'), { size: 'sm', appearance: 'outline', onclick: async () => { try { const r = await api('auth.password', { current: cur.value, password: pw.value }); setUser({ ...r.user, prefs: prefs() }); cur.value = pw.value = ''; saved(); } catch (e) { fail(e); } } })));

  const del = () => {
    const f = u.hasPassword ? h('sav-input', { label: t('password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password' }) : null;
    dialog({ title: t('delete_account'), width: '28rem', body: h('div.form', h('p', t('delete_account_text')), f), actions: [{ label: t('cancel') }, { label: t('delete_forever'), danger: true, run: async () => { await api('auth.delete', { password: f?.value || '' }); await offline.clear(); offline.rememberUser(null); S.user = null; go('#/welcome'); } }] });
  };
  const data = card(t('your_data'), 'shield', h('p.muted', t('your_data_t')),
    h('div.prow.wrap', btn(t('export_data'), { icon: 'download', appearance: 'outline', size: 'sm', onclick: async () => { try { const r = await fetch('api/?r=auth.export', { cache: 'no-store' }); if (!r.ok) throw Object.assign(new Error(), { code: 'server' }); download(await r.blob(), 'savdocuments-data.json'); } catch (e) { fail(Object.assign(e, { code: e.code || 'network' })); } } }), btn(t('sign_out'), { icon: 'log-out', appearance: 'outline', size: 'sm', onclick: () => signOut() })),
    h('div', btn(t('delete_account'), { icon: 'trash', variant: 'danger', appearance: 'soft', size: 'sm', onclick: del })));

  put(root, h('div.home.setp', h('header.htop', brand(), h('div.spacer'), userMenu()),
    h('main.smain', h('div.shd', btn(t('home'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go('#/') }), h('h1', t('settings'))), h('p.muted', t('settings_t')),
      h('div.sgrid', newDocs, sharing, editor, offCard, look, account, data)), credit()));
  document.title = t('settings') + ' · SavDocuments';
}
