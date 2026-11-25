/** Home: presentations, folders, templates, shared ones, trash. */
import {
    ago,
    api,
    btn,
    confirmBox,
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
import {fluidThumb} from './render.js';
import {context, FORMATS} from './themes.js';
import {fixSlide} from './model.js';
import {fromTemplate, TEMPLATES, TPL_CATS, tplName} from './templates.js';
import {textDialog} from './features.js';
import {downloadAs, openFile} from './files.js';
import {shareDialog} from './share.js';

export function userMenu() {
    const u = state.user;
    const d = h('sav-dropdown', {
            placement: 'bottom-end',
            'sheet-on-mobile': true,
            label: u.name
        }, h('sav-avatar', {
            'auto-text': true,
            slot: 'trigger',
            label: u.name,
            button: true,
            style: `--size:36px;background:${u.color};color:#fff;border-radius:50%`
        }),
        h('sav-menu-label', u.email), item('settings', 'settings', t('settings')), u.master && item('admin', 'shield', t('admin')), h('sav-divider'), item('out', 'log-out', t('sign_out')));
    d.addEventListener('sav-select', (e) => ({
        settings: () => go('?p=settings'),
        admin: () => go('?p=admin'),
        out: logout
    })[e.detail.value]?.());
    return d;
}

const metaCtx = (c) => context({format: c.format, theme: {colors: {}, fonts: {}, ...c.theme}, opts: {}});

export async function homeScreen(app, q) {
    document.body.classList.add('home');
    let data, view = q.get('v') || 'recent', folder = +(q.get('f') || 0), mode = userSetting('view', 'grid'),
        search = '', sort = 'updated';
    const main = h('main.hmain'), side = h('nav.hside', {'aria-label': t('home')});
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

    const load = async () => {
        data = await get('home.list');
        draw();
    };
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
        }, it('recent', 'layout-grid', t('my_decks')), it('starred', 'star', t('starred'), stars().size), it('shared', 'users', t('shared'), data.shared.length), it('templates', 'layout-template', t('templates')), it('trash', 'trash', t('trash'), data.decks.filter((d) => d.status === 'trashed').length));
        menu.addEventListener('sav-select', (e) => set(e.detail.value));
        const tree = h('sav-tree', {label: t('folders'), selectable: true}, ...branch(null));
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
                value: Math.min(100, data.used / data.quota * 100),
                style: '--height:6px',
                label: t('space')
            }), h('small', t('space_used', {a: fmtBytes(data.used), b: fmtBytes(data.quota)}))));
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
        const head = h('div.hhead', h('h1', title), view === 'folder' && folderMenu(f), h('div.spacer'), sortMenu, viewBtn, fromText, btn(t('open_file'), async () => {
            const [file] = await pickFile('.savpre,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation');
            if (file) openFile(file, folder);
        }, {icon: 'file-up', appearance: 'outline', variant: 'neutral', size: 'sm'}));
        const body = [];
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
        const open = () => (d.status === 'trashed' ? toastTrash(d) : go('?d=' + d.uid));
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
            class: 'card',
            draggable: d.role === 'owner'
        }, th, h('div.cinfo', h('div', h('b', d.title), h('small', d.role === 'owner' ? '' : d.owner + ' · ', t('n_slides', {n: d.slides}), ' · ', ago(d.updated))), d.status === 'active' ? h('sav-button.starb', {
            icon: 'star',
            appearance: 'ghost',
            variant: fav ? 'warning' : 'neutral',
            size: 'sm',
            square: true,
            label: t('starred'),
            'aria-pressed': String(fav),
            class: fav ? 'on' : '',
            onclick: (e) => {
                e.stopPropagation();
                star(d.uid);
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
