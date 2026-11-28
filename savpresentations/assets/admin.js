/** Panel of the master admins: numbers, people (block, unblock, delete), presentations, reports, log. */
import {ago, api, btn, confirmBox, dialog, fmtBytes, get, h, icon, item, ok, oops} from './core.js';
import {t} from './i18n.js';
import {brand, credit} from './auth.js';
import {userMenu} from './home.js';
import {context} from './themes.js';
import {fluidThumb} from './render.js';
import {fixSlide} from './model.js';

const REASONS = ['spam', 'phishing', 'abuse', 'illegal', 'copyright', 'other'];

export async function adminScreen(app, q) {
    document.body.classList.add('admin');
    document.title = t('admin') + ' – SavPresentations';
    let tab = q.get('t') || 'overview';
    const body = h('div.abody'),
        tabs = h('sav-menu.atabs', {orientation: 'horizontal', selectable: true, label: t('admin')});
    const TABS = [['overview', 'layout-grid'], ['users', 'users'], ['decks', 'presentation'], ['reports', 'flag'], ['log', 'list']];
    let open = 0;
    app.append(h('header.htop', brand(), h('sav-badge', {
        variant: 'warning',
        appearance: 'soft'
    }, t('admin')), h('div.spacer'), userMenu()), h('main.smain.wide', tabs, body), credit());
    const drawTabs = () => tabs.replaceChildren(...TABS.map(([k, ic]) => h('sav-menu-item', {
        value: k,
        current: tab === k
    }, icon(ic, {slot: 'prefix'}), t('ad_' + k), k === 'reports' && open ? h('sav-badge', {
        slot: 'suffix',
        variant: 'danger',
        pill: true
    }, String(open)) : null)));
    tabs.addEventListener('sav-select', (e) => set(e.detail.value));
    const set = (k, opt) => {
        tab = k;
        history.replaceState(null, '', '?p=admin&t=' + k);
        drawTabs();
        body.replaceChildren(h('div.center', h('sav-spinner')));
        screens[k](opt).catch(oops);
    };
    const table = (heads, rows) => h('sav-table', {
        hover: true,
        class: 'atable'
    }, h('table', h('thead', h('tr', ...heads.map((x) => h('th', x)))), h('tbody', ...rows)));
    const td = (...k) => h('td', ...k);

    const screens = {
        async overview() {
            const o = await get('admin.overview');
            open = o.reports;
            drawTabs();
            const stat = (label, value, ic, caption) => h('sav-stat', {
                label,
                value: String(value),
                icon: ic,
                appearance: 'card',
                caption
            });
            const chart = h('sav-chart-line', {
                height: 220,
                label: t('last_30'),
                smooth: true,
                data: JSON.stringify({
                    labels: o.series.map((s) => s.day.slice(8) + '/' + s.day.slice(5, 7)),
                    series: [{name: t('new_users'), values: o.series.map((s) => s.users)}, {
                        name: t('new_decks'),
                        values: o.series.map((s) => s.decks)
                    }]
                })
            });
            body.replaceChildren(h('div.stats', stat(t('ad_users'), o.users, 'users', t('n_unverified', {n: o.unverified})), stat(t('active7'), o.active7, 'user'), stat(t('online'), o.online, 'globe'), stat(t('ad_decks'), o.decks, 'presentation', t('n_public', {n: o.public})), stat(t('slides'), o.slides, 'layout-grid'), stat(t('pictures'), o.media, 'images', fmtBytes(o.bytes)), stat(t('blocked'), o.blocked, 'ban', t('n_suspended', {n: o.suspended})), stat(t('ad_reports'), o.reports, 'flag')), h('sav-card', {appearance: 'elevated'}, h('strong', {slot: 'header'}, t('last_30')), chart));
        },
        async users(opt = {}) {
            let f = opt.f || '', page = 0, text = opt.q || '';
            const list = h('div'), search = h('sav-input', {
                type: 'search',
                placeholder: t('search_users'),
                clearable: true,
                value: text
            }, icon('search', {slot: 'prefix'}));
            let deb;
            search.addEventListener('input', () => {
                clearTimeout(deb);
                deb = setTimeout(() => {
                    text = search.value;
                    page = 0;
                    load();
                }, 300);
            });
            const filt = h('sav-chip-group', {
                required: true, label: t('filter'), value: f, onchange: (e) => {
                    f = e.detail?.value ?? '';
                    if (f === 'all') f = '';
                    page = 0;
                    load();
                }
            }, ...['all', 'blocked', 'unverified'].map((v) => h('sav-chip', {
                value: v,
                size: 'sm',
                selected: (f || 'all') === v
            }, t('fl_' + v))));
            body.replaceChildren(h('div.afilter', search, filt), list);
            const load = async () => {
                const r = await get('admin.users', {q: text, f, page});
                list.replaceChildren(table([t('name'), t('status'), t('ad_decks'), t('space'), t('ad_reports'), t('last_seen'), ''], r.users.map((u) => h('tr', td(h('b', u.name), h('br'), h('small', u.email)), td(u.status === 'blocked' ? h('sav-badge', {variant: 'danger'}, t('blocked') + ' · ' + t('reason_' + (u.reason || 'other'))) : u.master ? h('sav-badge', {variant: 'primary'}, t('admin')) : u.verified ? h('sav-badge', {
                    variant: 'success',
                    appearance: 'soft'
                }, t('active')) : h('sav-badge', {
                    variant: 'warning',
                    appearance: 'soft'
                }, t('unverified')), u.note && h('small.muted', ' ' + u.note)), td(h('sav-button', {
                    appearance: 'link',
                    size: 'sm',
                    onclick: () => set('decks', {owner: u.id, label: u.email})
                }, String(u.decks))), td(fmtBytes(u.bytes)), td(String(u.reports)), td(ago(u.seen)), td(u.master ? '' : userMenuOf(u, load))))), r.users.length ? '' : h('p.muted.hint', t('no_results')), pager(page, r.more, (p) => {
                    page = p;
                    load();
                }));
            };
            await load();
        },
        async decks(opt = {}) {
            let f = opt.f || '', page = 0, text = opt.q || '', owner = opt.owner || 0;
            const list = h('div'), search = h('sav-input', {
                type: 'search',
                placeholder: t('search_all_decks'),
                clearable: true,
                value: text
            }, icon('search', {slot: 'prefix'}));
            let deb;
            search.addEventListener('input', () => {
                clearTimeout(deb);
                deb = setTimeout(() => {
                    text = search.value;
                    page = 0;
                    load();
                }, 300);
            });
            const filt = h('sav-chip-group', {
                required: true, label: t('filter'), value: f || 'all', onchange: (e) => {
                    f = e.detail?.value ?? '';
                    if (f === 'all') f = '';
                    page = 0;
                    load();
                }
            }, ...['all', 'public', 'reported', 'suspended'].map((v) => h('sav-chip', {
                value: v,
                size: 'sm',
                selected: (f || 'all') === v
            }, t('fl_' + v))));
            body.replaceChildren(h('div.afilter', search, filt, owner ? h('sav-tag', {
                removable: true,
                'onsav-remove': () => set('decks')
            }, opt.label || '#' + owner) : null), h('p.muted', t('ad_private_t')), list);
            const load = async () => {
                const r = await get('admin.decks', {q: text, f, page, owner});
                list.replaceChildren(table([t('title'), t('owner'), t('access'), t('slides'), t('ad_reports'), t('updated'), ''], r.decks.map((d) => h('tr', td(h('b', d.title), d.status !== 'active' && [' ', h('sav-badge', {
                    variant: d.status === 'suspended' ? 'danger' : 'neutral',
                    appearance: 'soft'
                }, t(d.status === 'suspended' ? 'suspended' : 'trash'))], d.note && h('small.muted', ' ' + d.note)), td(d.owner, h('br'), h('small', d.email)), td(t(d.access === 'link' ? 'access_link' : 'access_private'), d.members ? h('small.muted', ' · ' + t('n_people', {n: d.members})) : ''), td(String(d.slides)), td(String(d.reports)), td(ago(d.updated)), td(deckMenu(d, load))))), r.decks.length ? '' : h('p.muted.hint', t('no_results')), pager(page, r.more, (p) => {
                    page = p;
                    load();
                }));
            };
            await load();
        },
        async reports(opt = {}) {
            const closed = opt.closed || false, r = await get('admin.reports', {f: closed ? 'closed' : 'open'});
            const again = () => set('reports', opt);
            body.replaceChildren(h('div.afilter', h('sav-switch', {
                checked: closed,
                onchange: (e) => set('reports', {closed: e.target.checked})
            }, t('show_closed'))), r.reports.length ? h('div.replist', ...r.reports.map((x) => h('sav-card', {appearance: 'outlined'}, h('div.rep', h('div.repi', h('sav-badge', {variant: x.reason === 'phishing' || x.reason === 'illegal' ? 'danger' : 'warning'}, t('reason_' + x.reason)), h('b', x.title), h('small', x.owner.name + ' · ' + x.owner.email + (x.owner.status === 'blocked' ? ' · ' + t('blocked') : '')), x.note && h('p', x.note), h('small.muted', t('reported_by', {
                    who: x.reporter || t('guest'),
                    when: ago(x.at)
                }))),
                h('div.repa', btn(t('look_at'), () => view(x.uid), {
                    size: 'sm',
                    icon: 'eye',
                    appearance: 'outline',
                    variant: 'neutral'
                }), x.deckStatus === 'suspended' ? btn(t('unsuspend'), () => deckDo(x.uid, 'restore', again), {
                    size: 'sm',
                    appearance: 'outline'
                }) : btn(t('suspend'), () => suspend(x.uid, again), {
                    size: 'sm',
                    variant: 'warning',
                    appearance: 'soft'
                }), x.owner.status === 'active' && btn(t('block_owner'), () => blockDialog(x.owner, again, x.reason), {
                    size: 'sm',
                    variant: 'danger',
                    appearance: 'soft',
                    icon: 'ban'
                }), btn(closed ? t('reopen') : t('close_report'), async () => {
                    try {
                        await api('admin.report', {id: x.id, close: !closed});
                        again();
                    } catch (e) {
                        oops(e);
                    }
                }, {size: 'sm', icon: 'check'})))))) : h('sav-empty-state', {
                heading: t('no_reports'),
                icon: 'circle-check'
            }));
        },
        async log() {
            const r = await get('admin.log');
            body.replaceChildren(table([t('when'), t('who'), t('action'), t('target'), t('note')], r.log.map((x) => h('tr', td(new Date(x.at).toLocaleString()), td(x.by), td(t('log_' + x.action)), td(x.target), td(x.note)))));
        },
    };
    const pager = (page, more, to) => (page || more ? h('div.pager', btn(t('prev'), () => to(page - 1), {
        disabled: !page,
        size: 'sm',
        appearance: 'outline',
        variant: 'neutral'
    }), h('span', String(page + 1)), btn(t('next'), () => to(page + 1), {
        disabled: !more,
        size: 'sm',
        appearance: 'outline',
        variant: 'neutral'
    })) : null) || '';

    function userMenuOf(u, load) {
        const m = h('sav-dropdown', { 'sheet-on-mobile': true, placement: 'bottom-end'}, h('sav-button', {
            slot: 'trigger',
            icon: 'ellipsis-vertical',
            appearance: 'ghost',
            variant: 'neutral',
            size: 'sm',
            square: true,
            label: t('more')
        }), item('decks', 'presentation', t('see_decks')), u.status === 'blocked' ? item('unblock', 'circle-check', t('unblock')) : item('block', 'ban', t('block'), {variant: 'danger'}), item('signout', 'log-out', t('force_signout')), h('sav-divider'), item('delete', 'trash', t('delete_account'), {variant: 'danger'}));
        m.addEventListener('sav-select', async (e) => {
            try {
                const v = e.detail.value;
                if (v === 'decks') return set('decks', {owner: u.id, label: u.email});
                if (v === 'block') return blockDialog(u, load);
                if (v === 'unblock') {
                    if (!(await confirmBox(t('unblock'), t('unblock_t', {name: u.name}), t('unblock'), false))) return;
                    await api('admin.user', {id: u.id, do: 'unblock', notify: true});
                }
                if (v === 'signout') {
                    await api('admin.user', {id: u.id, do: 'signout'});
                    ok(t('done'));
                }
                if (v === 'delete') {
                    const f = h('sav-input', {label: t('type_email', {email: u.email}), type: 'email'});
                    if (!(await dialog(t('delete_account'), h('div.stack', h('p', t('ad_delete_t')), f), [[t('cancel'), null, {
                        appearance: 'outline',
                        variant: 'neutral'
                    }], [t('delete_forever'), async () => {
                        await api('admin.user', {id: u.id, do: 'delete', confirm: f.value});
                        return true;
                    }, {variant: 'danger'}]], {width: '28rem'}))) return;
                }
                load();
            } catch (x) {
                oops(x);
            }
        });
        return m;
    }

    /** Blocking a person: they are signed out everywhere and nobody can open their presentations any more. */
    function blockDialog(u, done, why = 'spam') {
        const reason = h('sav-select', { 'sheet-on-mobile': true,
                label: t('block_reason'),
                value: why
            }, ...REASONS.map((r) => h('option', {value: r}, t('reason_' + r)))),
            note = h('sav-textarea', {label: t('block_note'), help: t('block_note_t'), rows: 2, maxlength: 500}),
            notify = h('sav-checkbox', {checked: true}, t('block_notify'));
        return dialog(t('block_title', {name: u.name}), h('div.stack', h('sav-alert', {variant: 'warning'}, t('block_t')), reason, note, notify), [[t('cancel'), null, {
            appearance: 'outline',
            variant: 'neutral'
        }], [t('block'), async () => {
            await api('admin.user', {
                id: u.id,
                do: 'block',
                reason: reason.value,
                note: note.value,
                notify: notify.checked
            });
            ok(t('done'));
            done();
        }, {variant: 'danger', icon: 'ban'}]], {width: '30rem'});
    }

    const deckDo = async (uid, what, done, note = '') => {
        try {
            await api('admin.deck', {d: uid, do: what, note});
            ok(t('done'));
            done();
        } catch (e) {
            oops(e);
        }
    };

    function suspend(uid, done) {
        const note = h('sav-textarea', {label: t('note'), rows: 2, maxlength: 300});
        return dialog(t('suspend'), h('div.stack', h('p', t('suspend_t')), note), [[t('cancel'), null, {
            appearance: 'outline',
            variant: 'neutral'
        }], [t('suspend'), () => deckDo(uid, 'suspend', done, note.value), {variant: 'danger'}]], {width: '28rem'});
    }

    function deckMenu(d, load) {
        const m = h('sav-dropdown', { 'sheet-on-mobile': true, placement: 'bottom-end'}, h('sav-button', {
            slot: 'trigger',
            icon: 'ellipsis-vertical',
            appearance: 'ghost',
            variant: 'neutral',
            size: 'sm',
            square: true,
            label: t('more')
        }), (d.access === 'link' || d.reports > 0) && item('view', 'eye', t('look_at')), d.status === 'suspended' ? item('restore', 'circle-check', t('unsuspend')) : item('suspend', 'ban', t('suspend'), {variant: 'danger'}), item('owner', 'user', t('see_owner')));
        m.addEventListener('sav-select', (e) => ({
            view: () => view(d.uid),
            restore: () => deckDo(d.uid, 'restore', load),
            suspend: () => suspend(d.uid, load),
            owner: () => set('users', {q: d.email})
        })[e.detail.value]?.());
        return m;
    }

    async function view(uid) {
        try {
            const r = await get('admin.view', {d: uid});
            r.meta.theme.colors ||= {};
            r.meta.theme.fonts ||= {};
            const ctx = context(r.meta);
            dialog(r.title, h('div.grid.aview', ...r.slides.map((s, i) => fluidThumb(fixSlide(s.d), ctx, {
                index: i,
                count: r.slides.length
            }))), [], {width: '64rem'});
        } catch (e) {
            oops(e);
        }
    }

    set(tab);
}
