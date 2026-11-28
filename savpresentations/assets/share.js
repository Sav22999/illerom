/** Sharing: who can open a presentation, invitations, single-use links; reports. */
import {ago, api, btn, copyText, dialog, get, go, h, icon, iconBtn, ok, oops, state} from './core.js';
import {t} from './i18n.js';

const ROLES = ['viewer', 'commenter', 'editor'];
const roleSelect = (value, onchange, attrs) => h('sav-select', { 'sheet-on-mobile': true,
    value,
    size: 'sm',
    class: 'rolesel',
    label: null, ...attrs,
    onchange: (e) => onchange?.(e.target.value)
}, ...ROLES.map((r) => h('option', {value: r}, t('role_' + r))));
export const deckUrl = (uid) => new URL('?d=' + uid, location.origin + location.pathname).href;

/**
 * ed: the editor, when opened from there (what viewers can do, permissions of single pages). As in SavDocuments: people
 * first, then who else can open it in one choice, then the links that work once; separated by lines, with Done at the end.
 */
export async function shareDialog(uid, title, ed = null) {
    const body = h('div.share', h('div.center', h('sav-spinner')));
    const p = dialog(t('share_title', {title}), body, [[t('done'), true]], {width: '38rem', class: 'sharedlg'});
    const run = (action, data, msg) => api(action, {d: uid, ...data}).then(async (r) => { if (msg) ok(msg); await load(); return r; }).catch(oops);
    let fresh = '';
    async function load() {
        let s;
        try { s = await get('share.get', {d: uid}); } catch (e) { body.replaceChildren(h('sav-alert', {variant: 'danger'}, t('err_' + e.code))); return; }
        const owner = s.role === 'owner';
        // people: invite, then everyone with their own permission
        const email = h('sav-input', {type: 'email', placeholder: t('invite_email'), inputmode: 'email', class: 'grow', 'aria-label': t('invite_email')});
        const role = roleSelect('viewer', null, {size: 'md'}), notify = h('sav-checkbox', {checked: true}, t('invite_notify'));
        const invite = async () => { if (!email.value.trim()) return email.focus(); await run('share.invite', {email: email.value, role: role.value, notify: notify.checked}, t('invited')); };
        email.addEventListener('keydown', (e) => { if (e.key === 'Enter') invite(); });
        const person = (m, pend) => h('div.person', h('sav-avatar', {'auto-text': true, label: m.name || m.email, style: `--size:34px;background:${m.color || '#8a93ab'};color:#fff;border-radius:50%`}),
            h('div.pinfo', h('b', m.name || m.email), h('small', pend ? t('pending_invite') : m.email)),
            m.owner ? h('sav-badge', {appearance: 'soft', variant: 'primary'}, t('owner')) : owner ? roleSelect(m.role, (v) => run('share.role', {...(pend ? {email: m.email} : {user: m.id}), role: v}, t('saved'))) : h('span.muted', t('role_' + m.role)),
            owner && !m.owner && iconBtn('x', t('remove'), () => run('share.remove', pend ? {email: m.email} : {user: m.id}), {size: 'sm'}));
        // who else: one choice (nobody, or anyone with the link with a permission)
        const general = s.access === 'link' ? 'link-' + s.linkRole : 'private';
        const access = h('sav-select', { 'sheet-on-mobile': true, value: general, class: 'grow', disabled: !owner, 'aria-label': t('general_access'), onchange: (e) => { const [a, r] = e.target.value.split('-'); run('share.access', {access: a, role: r || s.linkRole}, t('saved')); }},
            h('option', {value: 'private'}, t('access_only_people')), ...ROLES.map((r) => h('option', {value: 'link-' + r}, t('access_link_' + r))));
        // what who only looks can do: settings of the presentation, changed from the editor
        const viewers = ed?.deck.canEdit && h('div.vsw', ...[['comments', 'opt_comments'], ['download', 'opt_download'], ['copy', 'opt_copy']].map(([k, l]) => h('sav-switch', {checked: ed.deck.meta.opts[k] !== false, onchange: (e) => ed.deck.do({k: 'deck.set', p: {opts: {[k]: e.target.checked}}})}, t(l))));
        // links that work once: as many as needed, each with a name, a permission and a duration
        const lrole = roleSelect('viewer', null, {size: 'md'}), hours = h('sav-select', { 'sheet-on-mobile': true, size: 'md', value: '168', class: 'rolesel', 'aria-label': t('link_valid')}, ...[[1, 'h1'], [24, 'h24'], [168, 'd7'], [720, 'd30']].map(([v, k]) => h('option', {value: v}, t('exp_' + k))));
        const label = h('sav-input', {placeholder: t('link_label'), maxlength: 60, class: 'grow', 'aria-label': t('link_label')});
        const make = async () => { try { const r = await api('share.link', {d: uid, role: lrole.value, hours: +hours.value, label: label.value}); fresh = r.url; await load(); copyText(r.url); } catch (e) { oops(e); } };
        const linkRow = (l) => {
            const dead = l.used || new Date(l.expires) < new Date();
            return h('div.person.lnk', {class: dead ? 'dead' : ''}, h('span.lic', icon(l.used ? 'circle-check' : 'timer')), h('div.pinfo', h('b', l.label || t('role_' + l.role)),
                h('small', l.used ? t('link_used_by', {name: l.by || '—', when: ago(l.used)}) : dead ? t('link_dead') : t('link_until', {when: new Date(l.expires).toLocaleString()}), ' · ', t('role_' + l.role))),
                owner && iconBtn('x', t('remove'), () => run('share.unlink', {id: l.id}), {size: 'sm'}));
        };
        const sep = () => h('sav-divider');
        body.replaceChildren(
            owner ? h('div.row.inv', email, role, btn(t('invite'), invite, {icon: 'user-plus'})) : h('sav-alert', t('share_owner_only')),
            owner && notify,
            h('div.people', person({...s.owner, owner: 1}), ...s.members.map((m) => person(m)), ...s.invites.map((m) => person(m, true))),
            sep(),
            h('section', h('h3', t('general_access')), h('div.row.acc2', h('span.accic', icon(s.access === 'link' ? 'globe' : 'lock')), access), h('p.muted', t(s.access === 'link' ? 'access_link_t' : 'access_only_people_t')),
                btn(t('copy_link'), () => copyText(deckUrl(uid)), {icon: 'link', appearance: 'outline', variant: 'neutral', block: true})),
            viewers && sep(), viewers && h('section', h('h3', t('viewers')), viewers),
            ed && owner && sep(), ed && owner && h('section', h('div.row', h('div.grow', h('h3', t('page_rules')), h('p.muted', t('page_rules_share_t'))), btn(t('manage'), () => import('./pages.js').then((m) => m.pageRulesDialog(ed)), {size: 'sm', icon: 'key-round', appearance: 'outline', variant: 'neutral'}))),
            owner && sep(),
            owner && h('section', h('h3', t('single_links')), h('p.muted', t('single_links_t')), h('div.row.inv', label), h('div.row.inv', lrole, hours, btn(t('create_link'), make, {icon: 'link', appearance: 'outline', variant: 'neutral'})),
                fresh && h('div.row.inv', h('sav-input', {value: fresh, readonly: true, class: 'grow', 'aria-label': t('link_ready')}), btn(t('copy'), () => copyText(fresh), {icon: 'copy', appearance: 'outline', variant: 'neutral'})), fresh && h('small.muted', t('link_once')),
                s.links.length ? h('sav-details', {summary: t('links_made', {n: s.links.length}), appearance: 'plain'}, h('div', ...s.links.map(linkRow))) : null));
    }
    load();
    return p;
}

/** The page of a single-use link: it is used up only after a press, so previews in chats do not burn it. */
export function joinScreen(app, token) {
    document.body.classList.add('authp');
    const b = btn(t('join_button'), async () => {
        b.loading = true;
        try {
            const r = await api('share.accept', {token});
            go('?d=' + r.uid);
        } catch (e) {
            oops(e);
            b.loading = false;
            box.replaceChildren(h('sav-empty-state', {
                heading: t('join_bad'),
                text: t('err_' + e.code),
                icon: 'link-2'
            }, btn(t('home'), () => go('./'))));
        }
    }, {size: 'lg', block: true});
    const box = h('div.aform', h('div.bigicon', icon('link')), h('h1', t('join_title')), h('p', t('join_text', {email: state.user.email})), b);
    app.append(h('main.amain', h('sav-card.acard', {appearance: 'elevated'}, box)));
}

export function reportDialog(uid) {
    const reason = h('sav-select', { 'sheet-on-mobile': true,
        label: t('report_reason'),
        value: 'spam'
    }, ...['spam', 'phishing', 'abuse', 'illegal', 'copyright', 'other'].map((r) => h('option', {value: r}, t('reason_' + r))));
    const note = h('sav-textarea', {label: t('report_note'), rows: 3, maxlength: 1000});
    return dialog(t('report'), h('div.stack', h('p.muted', t('report_t')), reason, note), [[t('cancel'), null, {
        appearance: 'outline',
        variant: 'neutral'
    }], [t('send'), async () => {
        await api('report.create', {d: uid, reason: reason.value, note: note.value});
        ok(t('report_sent'));
    }]], {width: '28rem'});
}
