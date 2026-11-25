/** Settings for all the presentations of a person, and their account. */
import {api, btn, dialog, go, h, icon, ok, oops, saveBlob, state, userSetting} from './core.js';
import {lang, setLang, t} from './i18n.js';
import {brand, credit, logout} from './auth.js';
import {applyMode} from './main.js';
import {formatPicker, userMenu} from './home.js';
import {THEMES} from './themes.js';
import {fontField} from './panels.js';

export function settingsScreen(app) {
    document.body.classList.add('setp');
    const save = async (p, quiet) => {
        try {
            const r = await api('auth.settings', {settings: p});
            state.user = r.user;
            if (!quiet) ok(t('saved'));
        } catch (e) {
            oops(e);
        }
    };
    const sw = (k, label, def, help) => h('sav-switch', {
        checked: userSetting(k, def),
        help,
        onchange: (e) => save({[k]: e.target.checked})
    }, label);
    const card = (title, ic, ...kids) => h('sav-card.scard', {appearance: 'elevated'}, h('div.shead', {slot: 'header'}, icon(ic), h('strong', title)), h('div.stack', ...kids));
    const u = state.user;

    const name = h('sav-input', {label: t('name'), value: u.name, maxlength: 80});
    const langSel = h('sav-select', {
        label: t('language'),
        value: lang()
    }, h('option', {value: 'it'}, 'Italiano'), h('option', {value: 'en'}, 'English'));
    langSel.addEventListener('change', async () => {
        try {
            const r = await api('auth.profile', {lang: langSel.value});
            state.user = r.user;
            setLang(r.user.lang);
            localStorage.setItem('sp-lang', r.user.lang);
            dispatchEvent(new PopStateEvent('popstate'));
        } catch (e) {
            oops(e);
        }
    });
    const mode = h('sav-theme-choice', {
        value: userSetting('mode', 'auto'),
        appearance: 'buttons',
        label: t('appearance')
    });
    mode.addEventListener('change', (e) => {
        const v = e.detail?.value ?? mode.value;
        applyMode(v);
        save({mode: v}, true);
    });

    const theme = h('sav-select', {
        label: t('theme_new'),
        value: userSetting('theme', 'paper'),
        onchange: (e) => save({theme: e.target.value})
    }, ...Object.entries(THEMES).map(([id, x]) => h('option', {value: id}, x.name)));
    const tr = h('sav-select', {
        label: t('transition'),
        value: userSetting('tr', 'fade'),
        onchange: (e) => save({tr: e.target.value})
    }, ...['none', 'fade', 'slide', 'push', 'zoom'].map((v) => h('option', {value: v}, t('tr_' + v))));
    const acc = h('sav-select', {
        label: t('access_new'),
        value: userSetting('access', 'private'),
        onchange: (e) => save({access: e.target.value})
    }, h('option', {value: 'private'}, t('access_private')), h('option', {value: 'link'}, t('access_link')));
    const role = h('sav-select', {
        label: t('link_role_new'),
        value: userSetting('linkRole', 'viewer'),
        onchange: (e) => save({linkRole: e.target.value})
    }, ...['viewer', 'commenter', 'editor'].map((r) => h('option', {value: r}, t('role_' + r))));

    const cur = h('sav-input', {
        label: t('current_password'),
        type: 'password',
        'password-toggle': true,
        autocomplete: 'current-password'
    }), pw = h('sav-password', {
        label: t('new_password'),
        autocomplete: 'new-password',
        'min-uppercase': 0,
        'min-digits': 0,
        'min-lowercase': 0,
        labels: t('pw_labels')
    });

    app.append(h('header.htop', brand(), h('div.spacer'), userMenu()), h('main.smain', h('div.hhead', h('sav-button', {
            icon: 'arrow-left',
            appearance: 'ghost',
            variant: 'neutral',
            onclick: () => go('./')
        }, t('home')), h('h1', t('settings'))),
        h('p.muted', t('settings_t')),
        h('div.sgrid',
            card(t('new_decks'), 'presentation', formatPicker(userSetting('format', '16-9'), (f) => save({format: f})), h('div.two', theme, tr), h('div.two', fontField(t('font_head'), userSetting('head', ''), (v) => save({head: v}), false), fontField(t('font_body'), userSetting('body', ''), (v) => save({body: v}), false)), sw('numbers', t('slide_numbers'), false)),
            card(t('sharing'), 'users', acc, role, sw('mailShare', t('mail_share'), true), sw('mailComments', t('mail_comments'), true)),
            card(t('editor'), 'pencil', sw('simple', t('mode_simple_set'), false, t('mode_simple_t')), sw('snap', t('set_snap'), true, t('set_snap_t')), sw('guides', t('set_guides'), true), sw('grid', t('set_grid'), false), sw('spell', t('set_spell'), true)),
            card(t('look_app'), 'palette', h('div.lbl', t('appearance')), mode, langSel),
            card(t('account'), 'user', h('p.muted', u.email), name, btn(t('save'), async () => {
                try {
                    const r = await api('auth.profile', {name: name.value});
                    state.user = r.user;
                    ok(t('saved'));
                } catch (e) {
                    oops(e);
                }
            }, {size: 'sm'}),
                window.Identity && btn(window.Identity.text('methods'), () => window.Identity.methods(), {
                    icon: 'shield',
                    appearance: 'outline',
                    variant: 'neutral',
                    size: 'sm'
                }), h('div.lbl', t('password')), u.hasPassword && cur, pw, btn(t('change_password'), async () => {
                    try {
                        const r = await api('auth.password', {current: cur.value, password: pw.value});
                        state.user = r.user;
                        cur.value = pw.value = '';
                        ok(t('saved'));
                    } catch (e) {
                        oops(e);
                    }
                }, {size: 'sm', appearance: 'outline', variant: 'neutral'})),
            card(t('your_data'), 'shield', h('p.muted', t('your_data_t')), btn(t('export_data'), async () => {
                try {
                    const r = await fetch('api/?r=auth.export', {credentials: 'same-origin'});
                    saveBlob(await r.blob(), 'savpresentations-data.json');
                } catch (e) {
                    oops(e);
                }
            }, {
                icon: 'download',
                appearance: 'outline',
                variant: 'neutral'
            }), btn(t('sign_out'), logout, {
                icon: 'log-out',
                appearance: 'outline',
                variant: 'neutral'
            }), btn(t('delete_account'), deleteAccount, {
                icon: 'trash',
                variant: 'danger',
                appearance: 'soft'
            })))), credit());

    async function deleteAccount() {
        const f = u.hasPassword ? h('sav-input', {
            label: t('password'),
            type: 'password',
            'password-toggle': true,
            autocomplete: 'current-password'
        }) : h('sav-input', {label: t('type_email', {email: u.email}), type: 'email'});
        const done = await dialog(t('delete_account'), h('div.stack', h('p', t('delete_account_t')), f), [[t('cancel'), null, {
            appearance: 'outline',
            variant: 'neutral'
        }], [t('delete_forever'), async () => {
            await api('auth.delete', u.hasPassword ? {password: f.value} : {email: f.value});
            return true;
        }, {variant: 'danger'}]], {width: '28rem'});
        if (done) {
            state.user = null;
            state.csrf = '';
            go('./');
        }
    }
}
