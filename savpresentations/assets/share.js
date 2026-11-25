/** Sharing: who can open a presentation, invitations, single-use links; reports. */
import { state, api, get, h, icon, btn, iconBtn, item, go, oops, ok, ago, dialog, confirmBox, copyText } from './core.js';
import { t } from './i18n.js';

const ROLES = ['viewer', 'commenter', 'editor'];
const roleSelect = (value, onchange, attrs) => h('sav-select', { value, size: 'sm', class: 'rolesel', label: null, ...attrs, onchange: (e) => onchange?.(e.target.value) }, ...ROLES.map((r) => h('option', { value: r }, t('role_' + r))));
export const deckUrl = (uid) => new URL('?d=' + uid, location.origin + location.pathname).href;

export async function shareDialog(uid, title) {
  const body = h('div.share', h('div.center', h('sav-spinner')));
  const p = dialog(t('share_title', { title }), body, [], { width: '38rem', class: 'sharedlg' });
  const run = (action, data, msg) => api(action, { d: uid, ...data }).then(async (r) => { if (msg) ok(msg); await load(); return r; }).catch(oops);
  async function load() {
    let s;
    try { s = await get('share.get', { d: uid }); } catch (e) { body.replaceChildren(h('sav-alert', { variant: 'danger' }, t('err_' + e.code))); return; }
    const owner = s.role === 'owner';
    // people
    const email = h('sav-input', { type: 'email', placeholder: t('invite_email'), inputmode: 'email', class: 'grow' });
    const role = roleSelect('viewer');
    const notify = h('sav-checkbox', { checked: true }, t('invite_notify'));
    const invite = async () => { if (!email.value.trim()) return email.focus(); const r = await run('share.invite', { email: email.value, role: role.value, notify: notify.checked }, t('invited')); return r; };
    email.addEventListener('keydown', (e) => { if (e.key === 'Enter') invite(); });
    const person = (m, pend) => h('div.person', h('sav-avatar', { 'auto-text': true, label: m.name || m.email, style: `--size:34px;background:${m.color || '#8a93ab'};color:#fff;border-radius:50%` }), h('div.pinfo', h('b', m.name || m.email), h('small', pend ? t('pending_invite') : m.email)),
      m.owner ? h('span.muted', t('owner')) : owner ? roleSelect(m.role, (v) => run('share.role', { ...(pend ? { email: m.email } : { user: m.id }), role: v }, t('saved'))) : h('span.muted', t('role_' + m.role)),
      owner && !m.owner && iconBtn('x', t('remove'), () => run('share.remove', pend ? { email: m.email } : { user: m.id }), { size: 'sm' }));
    // general access
    const access = h('sav-radio-group', { value: s.access, class: 'access', onchange: (e) => run('share.access', { access: e.target.value, role: linkRole.value }, t('saved')) },
      h('sav-radio', { value: 'private', disabled: !owner }, h('span.acc', icon('lock'), h('span', h('b', t('access_private')), h('small', t('access_private_t'))))), h('sav-radio', { value: 'link', disabled: !owner }, h('span.acc', icon('globe'), h('span', h('b', t('access_link')), h('small', t('access_link_t'))))));
    const linkRole = roleSelect(s.linkRole, (v) => run('share.access', { access: 'link', role: v }, t('saved')), { disabled: !owner });
    // single-use links
    const lrole = roleSelect('viewer'), hours = h('sav-select', { size: 'sm', value: '24', class: 'rolesel' }, ...[[1, 'h1'], [24, 'h24'], [168, 'd7'], [720, 'd30']].map(([v, k]) => h('option', { value: v }, t('exp_' + k)))), label = h('sav-input', { size: 'sm', placeholder: t('link_label'), maxlength: 60, class: 'grow' });
    const fresh = h('div');
    const make = async () => { try { const r = await api('share.link', { d: uid, role: lrole.value, hours: +hours.value, label: label.value }); await load(); const f = body.querySelector('.fresh'); f.replaceChildren(h('sav-alert', { variant: 'success', heading: t('link_ready') }, h('div.linkrow', h('code', r.url), btn(t('copy'), () => copyText(r.url), { size: 'sm', icon: 'copy' })), h('small', t('link_once')))); copyText(r.url); } catch (e) { oops(e); } };
    const linkRow = (l) => { const dead = l.used || new Date(l.expires) < new Date(); return h('div.person.lnk', { class: dead ? 'dead' : '' }, h('span.lic', icon(l.used ? 'circle-check' : 'timer')), h('div.pinfo', h('b', l.label || t('role_' + l.role)), h('small', l.used ? t('link_used_by', { name: l.by || '—', when: ago(l.used) }) : dead ? t('link_dead') : t('link_until', { when: new Date(l.expires).toLocaleString() }), ' · ', t('role_' + l.role))), owner && iconBtn('x', t('remove'), () => run('share.unlink', { id: l.id }), { size: 'sm' })); };
    body.replaceChildren(
      owner ? h('section', h('h3', t('people')), h('div.row.inv', email, role, btn(t('invite'), invite)), notify) : h('sav-alert', t('share_owner_only')),
      h('div.people', person({ ...s.owner, owner: 1 }), ...s.members.map((m) => person(m)), ...s.invites.map((m) => person(m, true))),
      h('section', h('h3', t('general_access')), access, s.access === 'link' && h('div.row.lr', h('span', t('anyone_can')), linkRole), h('div.linkrow', h('code', deckUrl(uid)), btn(t('copy_link'), () => copyText(deckUrl(uid)), { size: 'sm', icon: 'link', appearance: 'outline' }))),
      owner && h('section', h('h3', t('single_links')), h('p.muted', t('single_links_t')), h('div.row.inv', label, lrole, hours, btn(t('create'), make, { size: 'sm' })), h('div.fresh', fresh), ...s.links.map(linkRow)));
  }
  load();
  return p;
}

/** The page of a single-use link: it is used up only after a press, so previews in chats do not burn it. */
export function joinScreen(app, token) {
  document.body.classList.add('authp');
  const b = btn(t('join_button'), async () => {
    b.loading = true;
    try { const r = await api('share.accept', { token }); go('?d=' + r.uid); } catch (e) { oops(e); b.loading = false; box.replaceChildren(h('sav-empty-state', { heading: t('join_bad'), text: t('err_' + e.code), icon: 'link-2' }, btn(t('home'), () => go('./')))); }
  }, { size: 'lg', block: true });
  const box = h('div.aform', h('div.bigicon', icon('link')), h('h1', t('join_title')), h('p', t('join_text', { email: state.user.email })), b);
  app.append(h('main.amain', h('sav-card.acard', { appearance: 'elevated' }, box)));
}

export function reportDialog(uid) {
  const reason = h('sav-select', { label: t('report_reason'), value: 'spam' }, ...['spam', 'phishing', 'abuse', 'illegal', 'copyright', 'other'].map((r) => h('option', { value: r }, t('reason_' + r))));
  const note = h('sav-textarea', { label: t('report_note'), rows: 3, maxlength: 1000 });
  return dialog(t('report'), h('div.stack', h('p.muted', t('report_t')), reason, note), [[t('cancel'), null, { appearance: 'outline', variant: 'neutral' }], [t('send'), async () => { await api('report.create', { d: uid, reason: reason.value, note: note.value }); ok(t('report_sent')); }]], { width: '28rem' });
}
