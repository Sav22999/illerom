/** Sharing a document (as in SavPresentations: people, general access, what viewers can do, single-use links), and reporting one. */
import { btn, copyText, dialog, errText, face, fail, h, icon, iconBtn, primary, put, select, toast } from './ui.js';
import { t, when } from './i18n.js';
import { api } from './store.js';

const ROLES = () => [['viewer', t('r_viewer')], ['commenter', t('r_commenter')], ['editor', t('r_editor')]];
const HOURS = () => [['1', t('exp_h1')], ['24', t('exp_h24')], ['168', t('exp_d7')], ['720', t('exp_d30')]];

/** W: the open document (pid, title, and from the editor the settings of what viewers can do); from the home only pid and title. */
export async function shareDialog(W) {
  const { pid } = W, title = W.title || W.doc?.title || '';
  const body = h('div.share', h('div.wait', h('sav-spinner')));
  dialog({ title: title ? t('sh_title_of', { title }) : t('sh_title'), width: '38rem', cls: 'sharedlg', body, actions: [{ label: t('done'), primary: true }] });
  const link = `${location.origin}${location.pathname}#/d/${pid}`, md = { size: 'md' };
  let fresh = null;
  const call = (r, b) => api(r, { doc: pid, ...b }).then((d) => { draw(d); return d; }).catch(fail);

  function draw(d) {
    // people
    const mail = h('sav-input', { type: 'email', inputmode: 'email', placeholder: t('sh_add'), 'aria-label': t('sh_add'), class: 'grow' }), role = select(null, ROLES(), 'viewer', null, { ...md, 'aria-label': t('a_access'), class: 'rolesel' }), notify = h('sav-checkbox', { checked: true }, t('sh_notify'));
    const add = async () => { if (!mail.value.trim()) return mail.focus(); const r = await call('share.add', { email: mail.value.trim(), role: role.value, notify: notify.checked }); if (r) toast(t('invited'), 'success'); };
    mail.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(); } });
    const person = (p, owner) => h('div.person', face(p.name || p.email, null, 34), h('div.pinfo', h('b', p.name || p.email), h('small', p.pending ? t('pending') : p.email)),
      owner ? h('span.muted', t('r_owner')) : select(null, ROLES(), p.role, (v) => call('share.role', { id: p.id, role: v }).then(() => toast(t('settings_saved'), 'success')), { 'aria-label': t('a_access'), class: 'rolesel' }),
      owner ? null : iconBtn('x', t('remove'), () => call('share.remove', { id: p.id })));

    // general access
    const access = h('sav-radio-group', { value: d.visibility, class: 'access', 'aria-label': t('sh_general') },
      h('sav-radio', { value: 'private' }, h('span.acc', icon('lock'), h('span', h('b', t('v_private')), h('small', t('v_private_t'))))),
      h('sav-radio', { value: 'link' }, h('span.acc', icon('globe'), h('span', h('b', t('v_link')), h('small', t('v_link_t'))))));
    access.addEventListener('change', () => call('share.visibility', { visibility: access.value, role: d.linkRole }));
    const linkRole = select(null, ROLES(), d.linkRole, (v) => call('share.visibility', { visibility: 'link', role: v }), { 'aria-label': t('a_access'), class: 'rolesel' });

    // what who only reads may do (from the editor: they are settings of the document)
    const s = W.settings?.();
    const viewers = s ? h('section', h('h3', t('sh_viewers')), ...[['noComments', 'sh_comments'], ['noDownload', 'sh_download'], ['noCopy', 'sh_copy']].map(([k, l]) => { const x = h('sav-switch', { checked: !s[k] || null }, t(l)); x.addEventListener('change', () => W.setSettings({ [k]: !x.checked })); return x; })) : null;

    // single-use links: as many as needed, each with an optional name
    const label = h('sav-input', { placeholder: t('once_label'), maxlength: 60, 'aria-label': t('once_label'), class: 'grow' }), once = select(null, ROLES(), 'viewer', null, { ...md, 'aria-label': t('a_access'), class: 'rolesel narrow' }), hours = select(null, HOURS(), '168', null, { ...md, 'aria-label': t('once_lasts'), class: 'rolesel narrow' });
    const make = async () => { const r = await call('invite.create', { role: once.value, hours: +hours.value, label: label.value.trim() }); if (r) { fresh = r.url; draw(r); } };
    const linkRow = (l) => {
      const dead = l.used || new Date(l.expires) < new Date();
      return h('div.person.lnk' + (dead ? '.dead' : ''), h('span.lic', icon(l.used ? 'circle-check' : 'timer')), h('div.pinfo', h('b', l.label || t('r_' + l.role)), h('small', l.used ? t('once_used', { name: l.by || '—', when: when(l.used) }) : dead ? t('once_dead') : t('once_until', { when: new Date(l.expires).toLocaleString() }), ' · ', t('r_' + l.role))), iconBtn('x', t('remove'), () => call('invite.remove', { id: l.id })));
    };

    put(body,
      h('section', h('h3', t('sh_people')), h('div.prow.inv', mail, role, primary(t('sh_invite'), { onclick: add })), notify),
      h('div.plist', person(d.owner, true), d.people.map((p) => person(p))),
      h('section', h('h3', t('sh_general')), access, d.visibility === 'link' ? h('div.prow.lr', h('span', t('sh_anyone')), linkRole) : null, h('div.linkrow', h('code', link), btn(t('copy_link'), { icon: 'link', size: 'sm', appearance: 'outline', onclick: () => copyText(link, t('link_copied')) }))),
      viewers,
      h('section', h('h3', t('once_title')), h('p.muted', t('once_text')), h('div.prow.inv', label, once, hours, btn(t('create'), { onclick: make })),
        fresh ? h('sav-alert', { variant: 'success', heading: t('once_ready') }, h('div.linkrow', h('code', fresh), btn(t('copy'), { size: 'sm', icon: 'copy', onclick: () => copyText(fresh, t('link_copied')) })), h('small', t('once_note'))) : null,
        (d.links || []).map(linkRow)));
  }
  try { draw(await api('share.get', undefined, { doc: pid })); } catch (e) { put(body, h('sav-alert', { variant: 'danger' }, errText(e))); }
}

export function reportDialog(pid) {
  const why = select(t('reason'), ['spam', 'phishing', 'illegal', 'other'].map((k) => [k, t('rep_' + k)]), 'spam', null, { size: 'md' }), note = h('sav-textarea', { label: t('rep_note'), rows: 3, maxlength: 1000 });
  dialog({ title: t('rep_title'), body: h('div.form', why, note), actions: [{ label: t('cancel') }, { label: t('rep_send'), primary: true, run: async () => { await api('report.add', { doc: pid, reason: why.value, note: note.value }); toast(t('rep_sent'), 'success'); } }] });
}
