/** Permissions of the single pages: what each person can do on each of them. Only the owner sets them; the server applies them. */
import {api, dialog, get, h, icon, ok, oops} from './core.js';
import {t} from './i18n.js';

const ROLES = ['none', 'viewer', 'commenter', 'editor'];
export const pageName = (deck, s) => s.d.name || t('page') + ' ' + (deck.index(s.sid) + 1);

/** start = the pages chosen at the beginning. */
export function pageRulesDialog(ed, start) {
    const deck = ed.deck, order = deck.order();
    let pages = start?.length ? [...start] : [ed.sid], rules = [], share = null;
    const body = h('div.stack', h('sav-spinner'));
    const who = h('sav-select', { 'sheet-on-mobile': true,
        label: t('pages'),
        multiple: true,
        searchable: order.length > 8,
        'select-all': true,
        'select-all-label': t('all_pages'),
        'clear-all-label': t('no_pages'),
        'max-chips': 6
    }, ...order.map((s) => h('option', {value: s.sid, selected: pages.includes(s.sid)}, pageName(deck, s))));
    who.value = pages;
    who.addEventListener('change', () => {
        pages = Array.isArray(who.value) ? who.value : String(who.value).split(',').filter(Boolean);
        draw();
    });
    const list = h('div.people.prules');

    /** The rule of someone on the chosen pages: the same on all of them, '' (none) or 'mixed'. */
    const ruleOf = (w) => {
        const set = new Set(pages.map((sid) => rules.find((r) => r.sid === sid && r.who === w)?.role || ''));
        return set.size === 1 ? [...set][0] : 'mixed';
    };
    const save = async (w, role) => {
        try {
            await api('page.rule', {d: deck.uid, pages, who: w, role});
            rules = rules.filter((r) => !(r.who === w && pages.includes(r.sid)));
            if (role) for (const sid of pages) rules.push({sid, who: w, role});
            deck.ruled = new Set(rules.map((r) => r.sid));
            ed.drawStrip();
            ok(t('saved'));
            draw();
        } catch (e) {
            oops(e);
            load();
        }
    };
    const line = (w, name, sub, role, color) => {
        const v = ruleOf(w), sel = h('sav-select', { 'sheet-on-mobile': true,
                size: 'sm',
                class: 'rolesel wide',
                value: v || 'same',
                disabled: !pages.length,
                onchange: (e) => save(w, e.target.value === 'same' ? '' : e.target.value)
            },
            ...(v === 'mixed' ? [h('option', {
                value: 'mixed',
                disabled: true
            }, t('mixed'))] : []), h('option', {
                value: 'same',
                'data-description': role ? t('role_' + role) : t('as_role')
            }, t('as_deck')), ...ROLES.map((r) => h('option', {value: r}, r === 'none' ? t('no_access') : t('role_' + r))));
        return h('div.person', w === '*' ? h('span.lic', icon('users')) : h('sav-avatar', {
            label: name,
            'auto-text': true,
            style: `--size:34px;background:${color || '#8a93ab'};color:#fff;border-radius:50%`
        }), h('div.pinfo', h('b', name), h('small', sub)), sel);
    };

    function draw() {
        if (!share) return;
        list.replaceChildren(line('*', t('everyone'), share.access === 'link' ? t('everyone_link') : t('everyone_t')),
            ...share.members.map((m) => line('u:' + m.id, m.name, m.email + ' · ' + t('role_' + m.role), m.role, m.color)), ...share.invites.map((m) => line('e:' + m.email, m.email, t('pending_invite') + ' · ' + t('role_' + m.role), m.role)));
    }

    async function load() {
        try {
            [share, {rules}] = await Promise.all([get('share.get', {d: deck.uid}), get('page.rules', {d: deck.uid})]);
            body.replaceChildren(h('p.muted', t('page_rules_t')), who, list, !share.members.length && !share.invites.length ? h('sav-alert', t('page_rules_alone')) : '');
            draw();
        } catch (e) {
            oops(e);
        }
    }

    load();
    return dialog(t('page_rules'), body, [[t('done'), true]], {width: '40rem'});
}
