/** Sharing a document, and reporting one. */
import { btn, copyText, dialog, errText, face, fail, h, icon, iconBtn, primary, put, select, toast } from './ui.js';
import { t } from './i18n.js';
import { api } from './store.js';

const ROLES = () => [['viewer', t('r_viewer')], ['commenter', t('r_commenter')], ['editor', t('r_editor')]];

export async function shareDialog({ pid }) {
  const body = h('div.form', h('sav-spinner'));
  dialog({ title: t('sh_title'), width: '37rem', body, actions: [{ label: t('done'), primary: true }] });
  const link = `${location.origin}${location.pathname}#/d/${pid}`, md = { size: 'md' };
  const draw = (d) => {
    const mail = h('sav-input', { type: 'email', placeholder: t('sh_add'), 'aria-label': t('sh_add') }), role = select(null, ROLES(), 'viewer', null, { ...md, 'aria-label': t('a_access') }), notify = h('sav-checkbox', { checked: true }, t('sh_notify'));
    const add = async () => { if (!mail.value.trim()) return; draw(await api('share.add', { doc: pid, email: mail.value.trim(), role: role.value, notify: notify.checked })); };
    mail.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add().catch(fail); } });
    const vis = (v, r) => api('share.visibility', { doc: pid, visibility: v, role: r }).then(draw).catch(fail), once = select(null, ROLES(), 'viewer', null, { ...md, 'aria-label': t('a_access') }), out = h('div');
    put(body, h('div.prow.wrap', h('div.grow', mail), h('div.w9', role), primary(t('sh_invite'), { icon: 'user-plus', onclick: add })), notify,
      h('div.plist', h('div.person', face(d.owner.name), h('div.grow', h('strong', d.owner.name), h('span.muted.small', d.owner.email)), h('sav-badge', { appearance: 'soft', variant: 'primary', pill: true }, t('r_owner'))), d.people.map((p) => h('div.person', face(p.name || p.email), h('div.grow', h('strong', p.name || p.email), h('span.muted.small', p.pending ? t('pending') : p.email)), h('div.w9', select(null, ROLES(), p.role, (v) => api('share.role', { doc: pid, id: p.id, role: v }).catch(fail), { 'aria-label': t('a_access') })), iconBtn('x', t('remove'), () => api('share.remove', { doc: pid, id: p.id }).then(draw))))),
      h('sav-divider'), h('h3', t('sh_general')),
      h('div.prow', h('span.vis', icon(d.visibility === 'link' ? 'globe' : 'lock')), h('div.grow', select(null, [['private', t('v_private')], ['link', t('v_link')]], d.visibility, (v) => vis(v, d.linkRole), { ...md, 'aria-label': t('sh_general') })), d.visibility === 'link' ? h('div.w9', select(null, ROLES(), d.linkRole, (v) => vis('link', v), { ...md, 'aria-label': t('a_access') })) : null), h('p.muted.small', t(d.visibility === 'link' ? 'v_link_t' : 'v_private_t')), btn(t('copy_link'), { icon: 'link-2', size: 'sm', onclick: () => copyText(link, t('link_copied')) }),
      h('sav-divider'), h('h3', t('once_title')), h('p.muted.small', t('once_text')), h('div.prow.wrap', h('div.w9', once), btn(t('once_make'), { icon: 'link', onclick: async () => { const r = await api('invite.create', { doc: pid, role: once.value }); put(out, h('div.prow', h('div.grow', h('sav-input', { value: r.url, readonly: true, 'aria-label': t('once_title') })), btn(t('copy'), { icon: 'copy', onclick: () => copyText(r.url, t('link_copied')) }))); } })), out);
  };
  try { draw(await api('share.get', undefined, { doc: pid })); } catch (e) { put(body, h('p', errText(e))); }
}

export function reportDialog(pid) {
  const why = select(t('reason'), ['spam', 'phishing', 'illegal', 'other'].map((k) => [k, t('rep_' + k)]), 'spam', null, { size: 'md' }), note = h('sav-textarea', { label: t('rep_note'), rows: 3, maxlength: 1000 });
  dialog({ title: t('rep_title'), body: h('div.form', why, note), actions: [{ label: t('cancel') }, { label: t('rep_send'), primary: true, run: async () => { await api('report.add', { doc: pid, reason: why.value, note: note.value }); toast(t('rep_sent'), 'success'); } }] });
}
