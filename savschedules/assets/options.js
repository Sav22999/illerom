/** Settings: a page of its own, cards as in SavDocuments — new schedules, look, account, data. */
import { btn, dialog, fail, h, icon, put, select, toast } from './ui.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { brand, credit, go, prefs, setPrefs, setUser, userMenu } from './account.js';
import { COLORS } from './plan.js';
import { LOCAL_TZ, ZONES } from './time.js';
import { download } from './files.js';

export function settingsScreen(root) {
  const u = S.user, p = prefs(), md = { size: 'md' };
  const saved = () => toast(t('settings_saved'), 'success');
  const save = (x, quiet) => setPrefs(x).then(() => { if (!quiet) saved(); }).catch(fail);
  const card = (title, ic, ...kids) => h('sav-card.scard', { appearance: 'elevated' }, h('div.shead', { slot: 'header' }, icon(ic), h('strong', title)), h('div.form', kids));
  const d = { access: 'open', askEmail: 'optional', notify: true, hidden: false, tz: LOCAL_TZ, color: 'blue', ...(p.defaults || {}) };
  const setDef = (x) => save({ defaults: { ...(prefs().defaults || {}), ...x } });
  const sw = (k, label, help) => { const s = h('sav-switch', { checked: d[k] || null, help }, label); s.addEventListener('change', () => setDef({ [k]: s.checked })); return s; };

  const defaults = card(t('g_defaults'), 'calendar-plus', h('p.muted', t('defaults_text')),
    select(t('who_answers'), [['open', t('acc_open')], ['account', t('acc_account')]], d.access, (v) => setDef({ access: v }), md),
    select(t('ask_email'), [['no', t('email_no')], ['optional', t('email_optional')], ['required', t('email_required')]], d.askEmail, (v) => setDef({ askEmail: v }), md),
    select(t('timezone'), ZONES.map((z) => [z, z.replace(/_/g, ' ')]), d.tz, (v) => setDef({ tz: v }), { ...md, searchable: true }),
    select(t('color'), Object.keys(COLORS).map((k) => [k, t('c_' + k)]), d.color, (v) => setDef({ color: v }), md),
    sw('notify', t('notify'), t('notify_t')), sw('hidden', t('hide_answers'), t('hide_answers_t')));

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
    dialog({ title: t('delete_account'), width: '28rem', body: h('div.form', h('p', t('delete_account_text')), f), actions: [{ label: t('cancel') }, { label: t('delete_forever'), danger: true, run: async () => { await api('auth.delete', { password: f?.value || '' }); S.user = null; go('#/welcome'); } }] });
  };
  const data = card(t('your_data'), 'shield', h('p.muted', t('your_data_t')),
    h('div.prow.wrap', btn(t('export_data'), { icon: 'download', appearance: 'outline', size: 'sm', onclick: async () => { try { const r = await fetch('api/?r=auth.export', { cache: 'no-store' }); if (!r.ok) throw Object.assign(new Error(), { code: 'server' }); download(await r.blob(), 'savschedules-data.json'); } catch (e) { fail(Object.assign(e, { code: e.code || 'network' })); } } })),
    h('div', btn(t('delete_account'), { icon: 'trash', variant: 'danger', appearance: 'soft', size: 'sm', onclick: del })));

  put(root, h('div.home.setp', h('header.htop', brand(), h('div.spacer'), userMenu()),
    h('main.smain', h('div.shd', btn(t('home'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go('#/') }), h('h1', t('settings'))), h('p.muted', t('settings_t')),
      h('div.sgrid', defaults, look, account, data)), credit()));
  document.title = t('settings') + ' · SavSchedules';
}
