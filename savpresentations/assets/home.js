/** Home: presentations, folders, templates, shared ones, trash. */
import {
    ago,
    api,
    btn,
    confirmBox, copyText, saveBlob, fileName, toast,
    dialog,
    fmtBytes,
    get,
    go,
    h,
    icon,
    iconBtn,
    item,
    mobile,
    ok,
    oops,
    pickFile,
    promptBox,
    state,
    tile,
    userSetting
} from './core.js';
import {t} from './i18n.js';
import {brand, credit, logout} from './auth.js';
import {fluidThumb, mediaUrl} from './render.js';
import {context, FORMATS} from './themes.js';
import {fixSlide} from './model.js';
import {fromTemplate, TEMPLATES, TPL_CATS, tplName} from './templates.js';
import {textDialog} from './features.js';
import {downloadAs, openFile} from './files.js';
import {shareDialog} from './share.js';

export function userMenu() {
    const u = state.user;
    const av = h('sav-avatar', {
        'auto-text': true,
        slot: 'trigger',
        label: u.name,
        button: true,
        style: `--size:36px;background:${u.color};color:#fff;border-radius:50%`
    });
    // the picture of SavAccount, once it has really loaded (a service disconnected there keeps the initials)
    if (u.picture) { const im = new Image(); im.onload = () => av.setAttribute('image', u.picture); im.src = u.picture; }
    const d = h('sav-dropdown', {
            placement: 'bottom-end',
            'sheet-on-mobile': true,
            label: u.name
        }, av,
        h('sav-menu-label', u.email), item('settings', 'settings', t('settings')), u.master && item('admin', 'shield', t('admin')), h('sav-divider'), item('out', 'log-out', t('sign_out')));
    d.addEventListener('sav-select', (e) => ({
        settings: () => go('?p=settings'),
        admin: () => go('?p=admin'),
        out: logout
    })[e.detail.value]?.());
    // the apps of SavOffice next to the avatar
    return h('span.umenu', h('savoffice-apps', {current: 'savpresentations'}), d);
}

const metaCtx = (c) => context({format: c.format, theme: {colors: {}, fonts: {}, ...c.theme}, opts: {}});

export async function homeScreen(app, q) {
    document.body.classList.add('home');
    let data, view = q.get('v') || 'recent', folder = +(q.get('f') || 0), mode = userSetting('view', 'grid'),
        search = '', sort = 'updated';
    const main = h('main.hmain'), side = h('nav.hside', {'aria-label': t('home')});
    let bnavEl = null; // the bar at the bottom (phones and tablets), drawn again with the side
    const searchBox = h('sav-input', {
        type: 'search',
        placeholder: t('search_decks'),
        clearable: true,
        pill: true,
        oninput: (e) => {
            search = e.target.value.trim().toLowerCase();
            draw();
        },
        'onsav-clear': () => {
            search = '';
            draw();
        }
    }, icon('search', {slot: 'prefix'}));
    app.append(h('header.htop', brand(), h('div.hsearch', searchBox), h('div.spacer'), userMenu()), h('div.hbody', side, main), credit());

    let kept = null; // offline: the presentations with a copy on this device
    const load = async () => {
        const L = await import('./local.js');
        try {
            data = await get('home.list');
            L.cache.set('home', data);
            kept = null;
            state.offline = false;
            // the recent ones are copied ahead, so they open also without a connection
            setTimeout(() => L.warm([...data.decks, ...data.shared].filter((d) => d.status === 'active').sort((a, b) => (a.updated < b.updated ? 1 : -1)), get, mediaUrl), 1500);
        } catch (e) {
            data = e.network && (await L.cache.get('home'));
            if (!data) throw e;
            state.offline = true;
            kept = await L.cache.decks();
        }
        draw();
    };
    const onLine = () => load().catch(() => {});
    addEventListener('online', onLine);
    const set = (v, f = 0) => {
        view = v;
        folder = f;
        history.replaceState(null, '', v === 'recent' ? './' : `?v=${v}${f ? '&f=' + f : ''}`);
        draw();
    };

    const stars = () => new Set(userSetting('stars', []));

    async function star(uid) {
        const l = stars();
        l.has(uid) ? l.delete(uid) : l.add(uid);
        try {
            const r = await api('auth.settings', {settings: {stars: [...l]}});
            state.user = r.user;
            draw();
        } catch (e) {
            oops(e);
        }
    }

    function drawSide() {
        const it = (v, ic, label, n) => h('sav-menu-item', {
            value: v,
            current: view === v && !folder
        }, icon(ic, {slot: 'prefix'}), label, n ? h('sav-badge', {
            slot: 'suffix',
            appearance: 'soft',
            variant: 'neutral',
            pill: true
        }, String(n)) : null);
        const branch = (parent) => data.folders.filter((f) => f.parent === parent).map((f) => h('sav-tree-item', {
            label: f.name,
            value: f.id,
            icon: 'folder',
            'icon-open': 'folder-open',
            selected: folder === f.id,
            expanded: open(f.id),
            'data-folder': f.id
        }, ...branch(f.id)));
        const open = (id) => {
            for (let f = data.folders.find((x) => x.id === folder); f; f = data.folders.find((x) => x.id === f.parent)) if (f.id === id) return true;
            return false;
        };
        const menu = h('sav-menu', {
            label: t('home'),
            selectable: true
        }, it('recent', 'layout-grid', t('my_decks')), it('starred', 'star', t('starred'), stars().size), it('shared', 'users', t('shared'), data.shared.length), it('templates', 'layout-template', t('templates')), it('local', 'hard-drive', t('local_title')), it('trash', 'trash', t('trash'), data.decks.filter((d) => d.status === 'trashed').length));
        menu.addEventListener('sav-select', (e) => (e.detail.value === 'local' ? go('?p=local') : set(e.detail.value)));
        const tree = h('sav-tree', {label: t('folders'), selectable: true}, ...branch(null));
        // phones and tablets: the views, then the presentations of this device and the folders, in the bar at the bottom of
        // SavOffice; the ones that do not fit under "More" (an action sheet). The menu on the side is left out.
        const nb = window.SavOffice?.bottomNav?.({
            label: t('home'), current: view === 'folder' ? 'f' + folder : view,
            items: [...[['recent', 'layout-grid', 'my_decks'], ['starred', 'star', 'starred'], ['shared', 'users', 'shared'], ['templates', 'layout-template', 'templates'], ['trash', 'trash', 'trash']].map(([v, ic, l]) => ({value: v, icon: ic, label: t(l), run: () => set(v)})),
                {value: 'local', icon: 'hard-drive', label: t('local_title'), run: () => go('?p=local')}, ...data.folders.filter((f) => !f.parent).map((f) => ({value: 'f' + f.id, icon: 'folder', label: f.name, run: () => set('folder', f.id)}))],
        });
        if (nb) { if (bnavEl?.isConnected) bnavEl.replaceWith(nb); else app.append(nb); bnavEl = nb; }
        tree.addEventListener('sav-select', (e) => set('folder', +e.detail.value));
        side.replaceChildren(h('sav-button', {
                icon: 'plus',
                block: true,
                size: 'lg',
                class: 'newbtn',
                onclick: () => newDialog(folder || 0, data)
            }, t('new')), menu,
            h('div.navh', h('sav-label', {
                appearance: 'plain',
                case: 'normal',
                variant: 'neutral'
            }, t('folders')), iconBtn('folder-plus', t('new_folder'), () => newFolder(), {size: 'sm'})), data.folders.length ? tree : h('small.muted.nofold', t('folders_hint')),
            h('div.quota', h('sav-progress-bar', {
                value: data.unlimited ? 0 : Math.min(100, data.used / data.quota * 100), // unlimited: the space of SavOffice has no limit
                style: '--height:6px',
                label: t('space')
            }), h('small', t('space_used', {a: fmtBytes(data.used), b: data.unlimited ? '∞' : fmtBytes(data.quota)}))));
        for (const el of tree.querySelectorAll('[data-folder]')) drop(el, +el.dataset.folder);
        drop(menu.firstChild, 0);
    }

    function drop(el, id) {
        el.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('text/sp-deck')) {
                e.preventDefault();
                e.stopPropagation();
                el.classList.add('over');
            }
        });
        el.addEventListener('dragleave', () => el.classList.remove('over'));
        el.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.classList.remove('over');
            const uid = e.dataTransfer.getData('text/sp-deck');
            if (uid) try {
                await api('deck.move', {d: uid, folder: id});
                ok(t('moved'));
                load();
            } catch (x) {
                oops(x);
            }
        });
    }

    async function newFolder() {
        const name = await promptBox(t('new_folder'), t('name'), '', t('create'), 80);
        if (name) try {
            await api('folder.create', {name, parent: folder});
            load();
        } catch (e) {
            oops(e);
        }
    }

    function draw() {
        if (!data) return;
        drawSide();
        // the search of actions (⌘J / Ctrl+J, ../assets/savoffice/savoffice.js): new, the views and folders, the presentations, the pages
        const cmd = (icon, label, run, description) => ({icon, label, run, description});
        window.SavOffice?.commands([
            {label: t('new'), items: [cmd('plus', t('new_deck'), () => newDialog(folder, data)), ...TEMPLATES.map((x) => cmd('presentation', tplName(x), () => newDialog(0, data, x), t('tc_' + x.cat))), cmd('file-up', t('open_file'), async () => { const [file] = await pickFile('.savpre,.pptx,.ppt,.odp,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/vnd.oasis.opendocument.presentation'); if (file) openFile(file, folder); })]},
            {label: t('home'), items: [['recent', 'layout-grid', 'my_decks'], ['starred', 'star', 'starred'], ['shared', 'users', 'shared'], ['templates', 'layout-template', 'templates'], ['trash', 'trash', 'trash']].map(([v, ic, k]) => cmd(ic, t(k), () => set(v))).concat(cmd('hard-drive', t('local_title'), () => go('?p=local')), data.folders.map((f) => cmd('folder', f.name, () => set('folder', f.id), t('folders'))))},
            {label: t('recent'), items: [...data.decks.filter((d) => d.status === 'active'), ...data.shared].slice(0, 80).map((d) => cmd('presentation', d.title, () => go('?d=' + d.uid), d.owner || ''))},
            {label: 'SavPresentations', items: [cmd('settings', t('settings'), () => go('?p=settings')), cmd('sparkles', t('changelog'), () => go('?p=changelog')), cmd('log-out', t('sign_out'), () => logout())]},
        ]);
        const f = data.folders.find((x) => x.id === folder);
        let list = view === 'shared' ? data.shared : view === 'starred' ? [...data.decks, ...data.shared].filter((d) => d.status === 'active' && stars().has(d.uid)) : view === 'trash' ? data.decks.filter((d) => d.status === 'trashed') : view === 'templates' ? data.decks.filter((d) => d.template && d.status !== 'trashed') : data.decks.filter((d) => d.status !== 'trashed' && !d.template && (search ? true : view === 'folder' ? d.folder === folder : true));
        if (search) list = [...(view === 'trash' ? list : [...list, ...(view === 'recent' ? data.shared : [])])].filter((d) => (d.title + ' ' + d.owner).toLowerCase().includes(search));
        list = [...list].sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : a[sort] < b[sort] ? 1 : -1));
        const subs = view === 'folder' ? data.folders.filter((x) => x.parent === folder) : [];
        const title = view === 'folder' ? f?.name || t('folders') : t({
            recent: 'my_decks',
            starred: 'starred',
            shared: 'shared',
            templates: 'templates',
            trash: 'trash'
        }[view]);
        document.title = title + ' – SavPresentations';
        const viewBtn = iconBtn(mode === 'grid' ? 'list' : 'layout-grid', mode === 'grid' ? t('view_list') : t('view_grid'), () => {
            mode = mode === 'grid' ? 'list' : 'grid';
            api('auth.settings', {settings: {view: mode}}).then((r) => (state.user = r.user)).catch(() => {
            });
            draw();
        });
        const sortMenu = h('sav-dropdown', {placement: 'bottom-end'}, h('sav-button', {
            slot: 'trigger',
            appearance: 'ghost',
            variant: 'neutral',
            size: 'sm',
            caret: true
        }, t('sort_' + sort)), ...['updated', 'created', 'title'].map((s) => item(s, null, t('sort_' + s))));
        sortMenu.addEventListener('sav-select', (e) => {
            sort = e.detail.value;
            draw();
        });
        const fromText = btn(t('from_text'), () => textDialog(t('from_text'), async (slides) => {
            const meta = fromTemplate(TEMPLATES[0], {
                    theme: userSetting('theme') || 'violet',
                    format: userSetting('format', '16-9')
                }).meta, first = Object.values(slides[0].d.els).find((e) => e.html),
                title = (first?.html || '').replace(/<[^>]+>/g, '').trim().slice(0, 100) || t('untitled');
            const r = await api('deck.create', {
                title,
                folder,
                meta,
                slides: slides.map((x, i) => ({...x, pos: i + 1}))
            });
            go('?d=' + r.uid);
        }, () => context(fromTemplate(TEMPLATES[0], {
            theme: userSetting('theme') || 'violet',
            format: userSetting('format', '16-9')
        }).meta)), {icon: 'sparkles', appearance: 'outline', variant: 'neutral', size: 'sm'});
        const head = h('div.hhead', h('h1', title), view === 'folder' && folderMenu(f), h('div.spacer'), view !== 'templates' && sortMenu, view !== 'templates' && viewBtn, fromText, btn(t('open_file'), async () => {
            const [file] = await pickFile('.savpre,.pptx,.ppt,.odp,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/vnd.oasis.opendocument.presentation');
            if (file) openFile(file, folder);
        }, {icon: 'file-up', appearance: 'outline', variant: 'neutral', size: 'sm'}));
        const body = [];
        if (state.offline) body.push(h('sav-alert.offbar', {variant: 'warning', heading: t('offline_title_s')}, t('offline_bar')));
        if (view === 'recent' && !search) body.push(h('sav-card.quick', {appearance: 'elevated'}, h('div.qhead', h('h2', t('start_new')), btn(t('all_templates'), () => set('templates'), {
            size: 'sm',
            appearance: 'ghost',
            'icon-end': 'arrow-right'
        })), h('div.qrow', ...['blank', 'launch', 'talk', 'business', 'portfolio', 'lesson', 'event', 'cards'].slice(0, mobile() ? 6 : 8).map((id) => TEMPLATES.find((x) => x.id === id)).map((x) => tplCard(x, () => newDialog(0, data, x))))));
        if (view === 'templates') body.push(...TPL_CATS.flatMap((c) => [h('h2', t('tc_' + c)), h('div.grid.tpls', ...TEMPLATES.filter((x) => x.cat === c).map((x) => tplCard(x, () => newDialog(0, data, x))))]), h('h2', t('my_templates')), !list.length && h('p.muted', t('my_templates_hint')));
        if (view === 'recent' && !search && list.length) body.push(h('h2', t('recent')));
        if (subs.length) body.push(h('div.folders', ...subs.map((x) => {
            const el = h('sav-button', {
                appearance: 'outline',
                variant: 'neutral',
                size: 'lg',
                icon: 'folder',
                onclick: () => set('folder', x.id)
            }, x.name);
            drop(el, x.id);
            return el;
        })));
        if (list.length) body.push(h(`div.${mode === 'grid' || view === 'templates' ? 'grid' : 'rows'}`, ...list.map(card)));
        else if (view !== 'templates') body.push(h('sav-empty-state', {
            heading: t(view === 'trash' ? 'trash_is_empty' : 'empty_' + view),
            text: search ? t('empty_search') : t(view === 'trash' ? 'trash_is_empty_t' : 'empty_' + view + '_t'),
            icon: view === 'trash' ? 'trash' : view === 'shared' ? 'users' : 'presentation'
        }, view !== 'trash' && view !== 'shared' && btn(t('new'), () => newDialog(folder, data), {icon: 'plus'})));
        if (view === 'trash' && list.length) head.append(btn(t('empty_trash'), async () => {
            if (!(await confirmBox(t('empty_trash'), t('empty_trash_t', {n: list.length}), t('delete_forever')))) return;
            try {
                for (const d of list) await api('deck.purge', {d: d.uid});
            } catch (e) {
                oops(e);
            }
            load();
        }, {variant: 'danger', appearance: 'outline', size: 'sm'}));
        main.replaceChildren(head, ...body.filter(Boolean));
    }

    function folderMenu(f) {
        if (!f) return null;
        const d = h('sav-dropdown', h('sav-button', {
            slot: 'trigger',
            icon: 'ellipsis',
            appearance: 'ghost',
            variant: 'neutral',
            size: 'sm',
            square: true,
            label: t('more')
        }), item('new', 'folder-plus', t('new_folder')), item('ren', 'pencil', t('rename')), item('del', 'trash', t('delete'), {variant: 'danger'}));
        d.addEventListener('sav-select', async (e) => {
            try {
                if (e.detail.value === 'new') return newFolder();
                if (e.detail.value === 'ren') {
                    const n = await promptBox(t('rename'), t('name'), f.name, t('save'), 80);
                    if (n) await api('folder.rename', {id: f.id, name: n});
                }
                if (e.detail.value === 'del') {
                    if (!(await confirmBox(t('delete_folder'), t('delete_folder_t', {name: f.name}), t('delete')))) return;
                    await api('folder.delete', {id: f.id});
                    set(f.parent ? 'folder' : 'recent', f.parent || 0);
                }
                load();
            } catch (x) {
                oops(x);
            }
        });
        return d;
    }

    function card(d) {
        const open = () => (d.status === 'trashed' ? toastTrash(d) : kept && !kept.has(d.uid) ? toast(t('offline_missing'), 'warning') : go('?d=' + d.uid));
        const menu = cardMenu(d);
        const th = h('div.cthumb', d.first ? fluidThumb(fixSlide(d.first), metaCtx(d), {
            index: 0,
            count: d.slides
        }) : null, d.status === 'suspended' && h('sav-badge.cbadge', {variant: 'danger'}, t('suspended')), d.access === 'link' && d.status === 'active' && h('sav-icon.cglobe', {
            name: 'globe',
            label: t('access_link'),
            title: t('access_link')
        }), d.shared > 0 && h('sav-icon.cglobe.second', {name: 'users', label: t('shared'), title: t('shared')}));
        const fav = stars().has(d.uid);
        const c = tile(d.title, (e) => {
            if (!e.target.closest?.('sav-dropdown, .starb')) open();
        }, {
            class: 'card' + (kept && !kept.has(d.uid) ? ' away' : ''),
            title: kept && !kept.has(d.uid) ? t('offline_missing') : null,
            draggable: d.role === 'owner'
        }, th, h('div.cinfo', h('div', h('b', d.title), h('small', d.role === 'owner' ? '' : d.owner + ' · ', t('n_slides', {n: d.slides}), ' · ', ago(d.updated))), d.status === 'active' ? h('sav-favourite-button.starb', {
            // the favourite button of SavComponents, as in SavDocuments and SavSchedules: the star fills when it is on
            icon: 'star',
            appearance: 'ghost',
            size: 'sm',
            label: t('starred'),
            pressed: fav,
            class: fav ? 'on' : '',
            onclick: (e) => e.stopPropagation(),
            onkeydown: (e) => e.stopPropagation(),
            onchange: (e) => {
                e.currentTarget.classList.toggle('on', !!e.detail?.pressed);
                setTimeout(() => star(d.uid), 300);
            }
        }) : '', menu));
        c.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/sp-deck', d.uid);
            e.dataTransfer.effectAllowed = 'move';
        });
        return c;
    }

    async function toastTrash(d) {
        if (await confirmBox(t('in_trash'), t('in_trash_t'), t('restore'), false)) try {
            await api('deck.restore', {d: d.uid});
            load();
        } catch (e) {
            oops(e);
        }
    }

    function cardMenu(d) {
        const own = d.role === 'owner', tr = d.status === 'trashed';
        const m = h('sav-dropdown', {
                placement: 'bottom-end',
                'sheet-on-mobile': true,
                label: d.title
            }, h('sav-button', {
                slot: 'trigger',
                icon: 'ellipsis-vertical',
                appearance: 'ghost',
                variant: 'neutral',
                size: 'sm',
                square: true,
                label: t('more')
            }),
            ...(tr ? [item('restore', 'rotate-cw', t('restore')), item('purge', 'trash', t('delete_forever'), {variant: 'danger'})] : [item('open', 'presentation', t('open')), own && item('share', 'share-2', t('share')), (own || d.role === 'editor') && item('rename', 'pencil', t('rename')), item('copy', 'copy', t('duplicate')), own && item('move', 'folder', t('move_to')),
                own && item('tpl', 'layout-template', d.template ? t('not_template') : t('make_template')), item('dl', 'download', t('download')), h('sav-divider'), own ? item('trash', 'trash', t('move_trash'), {variant: 'danger'}) : item('leave', 'log-out', t('leave'), {variant: 'danger'})]));
        m.addEventListener('sav-select', async (e) => {
            try {
                switch (e.detail.value) {
                    case 'open':
                        return go('?d=' + d.uid);
                    case 'share':
                        return shareDialog(d.uid, d.title);
                    case 'rename': {
                        const n = await promptBox(t('rename'), t('title'), d.title);
                        if (!n) return;
                        await api('deck.rename', {d: d.uid, title: n});
                        break;
                    }
                    case 'copy':
                        await api('deck.duplicate', {d: d.uid, title: t('copy_of', {title: d.title})});
                        break;
                    case 'move': {
                        const to = await pickFolder(d.folder);
                        if (to === null) return;
                        await api('deck.move', {d: d.uid, folder: to});
                        break;
                    }
                    case 'tpl':
                        await api('deck.template', {d: d.uid, on: !d.template});
                        ok(d.template ? t('saved') : t('template_saved'));
                        break;
                    case 'dl':
                        return downloadAs(d.uid);
                    case 'trash':
                        await api('deck.trash', {d: d.uid});
                        ok(t('in_trash'));
                        break;
                    case 'restore':
                        await api('deck.restore', {d: d.uid});
                        break;
                    case 'purge':
                        if (!(await confirmBox(t('delete_forever'), t('delete_forever_t', {title: d.title}), t('delete_forever')))) return;
                        await api('deck.purge', {d: d.uid});
                        break;
                    case 'leave':
                        if (!(await confirmBox(t('leave'), t('leave_t', {title: d.title}), t('leave')))) return;
                        await api('deck.leave', {d: d.uid});
                        break;
                }
                load();
            } catch (x) {
                oops(x);
            }
        });
        return m;
    }

    function pickFolder(cur) {
        const sel = h('sav-select', {
            label: t('folder'),
            value: String(cur || 0)
        }, h('option', {value: '0'}, t('no_folder')), ...data.folders.map((f) => h('option', {value: f.id}, path(data.folders, f))));
        return dialog(t('move_to'), sel, [[t('cancel'), null, {
            appearance: 'outline',
            variant: 'neutral'
        }], [t('move'), () => ({v: +sel.value})]], {width: '26rem'}).then((r) => (r ? r.v : null));
    }

    // a file dropped anywhere opens it
    const over = (e) => {
        if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const dropped = (e) => {
        const f = e.dataTransfer?.files?.[0];
        if (f && /\.(savpre|pptx)$/i.test(f.name)) {
            e.preventDefault();
            openFile(f, folder);
        }
    };
    addEventListener('dragover', over);
    addEventListener('drop', dropped);
    main.append(h('div.center', h('sav-spinner')));
    try {
        await load();
    } catch (e) {
        oops(e);
    }
    return {
        leave: () => {
            removeEventListener('dragover', over);
            removeEventListener('drop', dropped);
            removeEventListener('online', onLine);
        }
    };
}

const path = (all, f) => {
    const p = all.find((x) => x.id === f.parent);
    return (p ? path(all, p) + ' / ' : '') + f.name;
};

export function tplCard(x, onclick) {
    const {meta, slides} = fromTemplate(x);
    return tile(tplName(x), onclick, {
        class: 'tpl',
        'data-tpl': x.id
    }, x.id === 'blank' ? h('div.thumb.blankt', icon('plus')) : h('div.tthumb', fluidThumb(slides[0].d, context(meta))), h('span', tplName(x)));
}

/** New presentation: name, template (or blank), format, folder. Enter creates it at once. */
export async function newDialog(folder, data, tpl = TEMPLATES[0]) {
    const name = h('sav-input', {label: t('deck_name'), placeholder: t('untitled'), maxlength: 150});
    let format = userSetting('format', '16-9');
    let touched = false;
    if (tpl.format) format = tpl.format;
    const formats = formatPicker(format, (f) => {
        format = f;
        touched = true;
    });
    const sel = data.folders.length ? h('sav-select', {
        label: t('folder'),
        value: String(folder || 0)
    }, h('option', {value: '0'}, t('no_folder')), ...data.folders.map((f) => h('option', {value: f.id}, path(data.folders, f)))) : null;
    const mine = (data.decks || []).filter((d) => d.template && d.status === 'active');
    let chosen = tpl;
    const cards = [];
    const mark = () => cards.forEach(([c, x]) => c.classList.toggle('on', x === chosen));
    const row = h('div.tplpick', ...TEMPLATES.map((x) => {
        const c = tplCard(x, () => {
            chosen = x;
            mark();
            if (x.format && !touched) {
                format = x.format;
                formats.value = x.format;
            }
        });
        cards.push([c, x]);
        return c;
    }), ...mine.map((d) => {
        const c = tile(d.title, () => {
            chosen = d;
            mark();
        }, {class: 'tpl'}, h('div.tthumb', fluidThumb(fixSlide(d.first), metaCtx(d))), h('span', d.title));
        cards.push([c, d]);
        return c;
    }));
    mark();
    let dlg;
    const create = async () => {
        const title = name.value.trim() || t('untitled');
        let uid;
        if (chosen.uid) uid = (await api('deck.duplicate', {d: chosen.uid, title})).uid;
        else {
            const fonts = {};
            if (userSetting('head')) fonts.head = userSetting('head');
            if (userSetting('body')) fonts.body = userSetting('body');
            const d = fromTemplate(chosen, {
                format,
                theme: chosen.id === 'blank' ? userSetting('theme') || undefined : undefined,
                fonts: chosen.id === 'blank' ? fonts : {},
                opts: {tr: userSetting('tr', 'fade'), numbers: userSetting('numbers', false)}
            });
            uid = (await api('deck.create', {title, folder: sel ? +sel.value : 0, ...d})).uid;
        }
        go('?d=' + uid);
    };
    name.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            try {
                await create();
                dlg.close(true);
            } catch (x) {
                oops(x);
            }
        }
    });
    const body = h('div.newdlg', h('div.two', name, sel), h('label.lbl', t('template')), row, formats);
    const p = dialog(t('new_deck'), body, [[t('cancel'), null, {
        appearance: 'outline',
        variant: 'neutral'
    }], [t('create'), create, {icon: 'plus'}]], {width: '54rem', ref: (d) => (dlg = d)});
    setTimeout(() => {
        name.focus();
        row.querySelector('.on')?.scrollIntoView({block: 'nearest', inline: 'center'});
    }, 200);
    return p;
}

export function formatPicker(value, onpick) {
    const g = h('sav-chip-group', {
        label: t('format'),
        required: true,
        value,
        class: 'formats'
    }, ...Object.entries(FORMATS).map(([id, [w, hh]]) => {
        const k = 18 / Math.max(w, hh);
        return h('sav-chip', {value: id, selected: id === value}, h('i.ratio', {
            slot: 'prefix',
            style: `width:${w * k}px;height:${hh * k}px`
        }), t('fmt_' + id));
    }));
    g.addEventListener('change', (e) => onpick(e.detail?.value || g.value));
    return g;
}


// ------------------------------------------------------------------ presentations of this device

/** The list of the presentations kept in this browser: for whoever has no account, or no connection. */
export async function localHome(app) {
    document.body.classList.add('home');
    const L = await import('./local.js');
    document.title = t('local_title') + ' – SavPresentations';
    const main = h('main.hmain.localmain');
    app.append(h('header.htop', brand(), h('div.spacer'), state.user ? userMenu() : btn(t('sign_in'), () => go('?signin=login'), {appearance: 'outline', variant: 'neutral'})), main, credit());
    const create = async (x) => { const {meta, slides} = fromTemplate(x, {theme: userSetting('theme') || undefined, format: userSetting('format') || undefined}), id = L.newId(); await L.local.save({id, title: x.id === 'blank' ? t('untitled') : tplName(x), meta, slides, created: new Date().toISOString()}); go('?l=' + id); };
    async function draw() {
        const list = await L.local.list();
        for (const d of list) await L.loadUrls(L.mediaOf(d));
        const card = (d) => {
            const m = h('sav-dropdown', {placement: 'bottom-end', label: d.title}, h('sav-button', {slot: 'trigger', icon: 'ellipsis-vertical', appearance: 'ghost', variant: 'neutral', size: 'sm', square: true, label: t('more')}),
                item('open', 'presentation', t('open')), item('rename', 'pencil', t('rename')), state.user && item('move', 'cloud-upload', t('move_to_account')), h('sav-divider'), item('del', 'trash', t('delete_forever'), {variant: 'danger'}));
            m.addEventListener('sav-select', async (e) => {
                try {
                    if (e.detail.value === 'open') return go('?l=' + d.id);
                    if (e.detail.value === 'rename') { const n = await promptBox(t('rename'), t('title'), d.title, t('save'), 150); if (n) { await L.local.save({...d, title: n}); draw(); } }
                    if (e.detail.value === 'move') { const uid = await moveToAccount(d.id); if (uid) go('?d=' + uid); }
                    if (e.detail.value === 'del' && (await confirmBox(t('delete_forever'), t('local_delete_t', {title: d.title}), t('delete_forever')))) { await L.local.remove(d.id); draw(); }
                } catch (x) { oops(x); }
            });
            const first = [...(d.slides || [])].sort((a, b) => a.pos - b.pos)[0];
            return tile(d.title, (e) => { if (!e.target.closest?.('sav-dropdown')) go('?l=' + d.id); }, {class: 'card'}, h('div.cthumb', first ? fluidThumb(fixSlide(structuredClone(first.d)), context(d.meta), {index: 0, count: d.slides.length}) : null),
                h('div.cinfo', h('div', h('b', d.title), h('small', t('n_slides', {n: d.slides.length}), ' · ', ago(d.updated))), m));
        };
        main.replaceChildren(
            h('div.hhead', state.user && h('sav-button', {icon: 'arrow-left', appearance: 'ghost', variant: 'neutral', onclick: () => go('./')}, t('home')), h('h1', t('local_title')), h('div.spacer'),
                btn(t('open_file'), async () => { const [f] = await pickFile('.savpre,.pptx,.ppt,.odp,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/vnd.oasis.opendocument.presentation'); if (f) openFile(f, 0, true); }, {icon: 'file-up', appearance: 'outline', variant: 'neutral', size: 'sm'})),
            h('sav-alert', {variant: 'neutral', icon: 'hard-drive'}, t('local_intro'), state.user ? '' : ' ' + t('local_intro_guest')),
            h('sav-card.quick', {appearance: 'elevated'}, h('div.qhead', h('h2', t('start_new'))), h('div.qrow', ...['blank', 'launch', 'talk', 'business', 'portfolio', 'lesson', 'event', 'cards'].map((id) => TEMPLATES.find((x) => x.id === id)).filter(Boolean).map((x) => tplCard(x, () => create(x).catch(oops))))),
            list.length ? h('div', h('h2', t('recent')), h('div.grid', ...list.map(card))) : h('sav-empty-state', {heading: t('local_none'), text: t('local_none_t'), icon: 'hard-drive'}));
    }
    await draw();
}

/** A presentation of this device goes to the account (its pictures and videos too); here it is removed. Resolves with its uid. */
export async function moveToAccount(id) {
    const L = await import('./local.js'), d = await L.local.get(id);
    if (!d) return null;
    let dlg;
    dialog('', h('div.center', h('sav-spinner'), h('p', t('moving'))), [], {persistent: true, width: '22rem', ref: (x) => (dlg = x)});
    try {
        const {uploadPicture, uploadVideo} = await import('./core.js'), was = state.local, map = {};
        state.local = '';
        try {
            for (const m of L.mediaOf(d)) {
                const x = await L.local.media(m);
                if (!x) continue;
                const f = new File([x.blob], x.name || 'media', {type: x.blob.type});
                map['l:' + m] = x.video ? (await uploadVideo(f)).src : (await uploadPicture(f)).src;
            }
        } finally { state.local = was; }
        const slides = JSON.parse(JSON.stringify(d.slides).replace(/"l:([a-z0-9]{12})"/g, (k) => JSON.stringify(map[k.slice(1, -1)] || '')));
        const r = await api('deck.create', {title: d.title, meta: d.meta, slides});
        await L.local.remove(id);
        ok(t('moved_to_account'));
        return r.uid;
    } catch (e) { oops(e); return null; } finally { dlg.close(); }
}
