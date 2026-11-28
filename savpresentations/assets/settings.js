/** Settings for all the presentations of a person, and their account: one section at a time, chosen on the side. */
import {api, btn, dialog, go, h, icon, mobile, ok, oops, saveBlob, state, userSetting} from './core.js';
import {lang, setLang, t} from './i18n.js';
import {brand, credit, logout} from './auth.js';
import {applyMode} from './main.js';
import {formatPicker, userMenu} from './home.js';
import {THEMES} from './themes.js';
import {fontField} from './panels.js';

export function settingsScreen(app, q) {
    document.body.classList.add('setp');
    document.title = t('settings') + ' – SavPresentations';
    const u = state.user;
    const save = async (p, quiet) => {
        try {
            const r = await api('auth.settings', {settings: p});
            state.user = r.user;
            if (!quiet) ok(t('saved'));
        } catch (e) {
            oops(e);
        }
    };
    /** A line of a section: what it is on the left, the control on the right. */
    const row = (label, help, control) => h('div.srow', h('div.srow-t', h('b', label), help && h('small', help)), h('div.srow-c', control));
    const sw = (k, label, def, help) => row(label, help, h('sav-switch', {checked: userSetting(k, def), 'aria-label': label, onchange: (e) => save({[k]: e.target.checked})}));
    const pick = (k, def, options, onpick) => h('sav-select', { 'sheet-on-mobile': true, size: 'sm', value: userSetting(k, def), onchange: (e) => (onpick ? onpick(e.target.value) : save({[k]: e.target.value}))}, ...options.map(([v, l]) => h('option', {value: v}, l)));
    const section = (title, text, ...rows) => h('div.ssec', h('h2', title), text && h('p.muted', text), h('sav-card.scard', {appearance: 'outlined'}, h('div.srows', ...rows.filter(Boolean))));

    // account
    const name = h('sav-input', {size: 'sm', value: u.name, maxlength: 80, 'aria-label': t('name')});
    name.addEventListener('change', async () => {
        if (!name.value.trim()) return;
        try {
            state.user = (await api('auth.profile', {name: name.value})).user;
            ok(t('saved'));
        } catch (e) {
            oops(e);
        }
    });
    const cur = h('sav-input', {label: t('current_password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password'});
    const pw = h('sav-password', {label: t('new_password'), autocomplete: 'new-password', 'min-uppercase': 0, 'min-digits': 0, 'min-lowercase': 0, labels: t('pw_labels')});
    const password = () => dialog(t('change_password'), h('div.stack', u.hasPassword && cur, pw), [[t('cancel'), null, {appearance: 'outline', variant: 'neutral'}], [t('save'), async () => {
        state.user = (await api('auth.password', {current: cur.value, password: pw.value})).user;
        cur.value = pw.value = '';
        ok(t('saved'));
    }]], {width: '26rem'});

    // look and language
    const mode = h('sav-theme-choice', {value: userSetting('mode', 'auto'), appearance: 'buttons', size: 'sm', 'aria-label': t('appearance')});
    mode.addEventListener('change', (e) => {
        const v = e.detail?.value ?? mode.value;
        applyMode(v);
        save({mode: v}, true);
    });
    const langSel = h('sav-select', { 'sheet-on-mobile': true, size: 'sm', value: lang(), 'aria-label': t('language')}, h('option', {value: 'it'}, 'Italiano'), h('option', {value: 'en'}, 'English'));
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

    const SECTIONS = [
        ['account', 'user', t('account'), () => section(t('account'), u.email,
            row(t('name'), t('name_t'), name),
            row(t('password'), u.hasPassword ? t('password_t') : t('password_none_t'), btn(t('change_password'), password, {size: 'sm', appearance: 'outline', variant: 'neutral'})),
            window.Identity && row(t('sign_in_ways'), t('sign_in_ways_t'), btn(window.Identity.text('methods'), () => window.Identity.methods(), {size: 'sm', appearance: 'outline', variant: 'neutral', icon: 'shield'})),
            row(t('sign_out'), t('sign_out_t'), btn(t('sign_out'), logout, {size: 'sm', appearance: 'outline', variant: 'neutral', icon: 'log-out'})))],
        ['new', 'presentation', t('new_decks'), () => section(t('new_decks'), t('new_decks_t'),
            h('div.srow.wide', formatPicker(userSetting('format', '16-9'), (f) => save({format: f}))),
            row(t('theme_new'), null, pick('theme', 'paper', Object.entries(THEMES).map(([id, x]) => [id, x.name]))),
            row(t('font_head'), null, fontField(null, userSetting('head', ''), (v) => save({head: v}), false)),
            row(t('font_body'), null, fontField(null, userSetting('body', ''), (v) => save({body: v}), false)),
            row(t('transition'), null, pick('tr', 'fade', ['none', 'fade', 'slide', 'push', 'zoom'].map((v) => [v, t('tr_' + v)]))),
            sw('numbers', t('slide_numbers'), false))],
        ['editor', 'pencil', t('editor'), () => section(t('editor'), t('editor_t'),
            row(t('mode'), t('mode_simple_t'), h('sav-radio-group', {appearance: 'buttons', size: 'sm', value: userSetting('simple', false) ? 'simple' : 'adv', onchange: (e) => save({simple: e.currentTarget.value === 'simple'})}, h('sav-radio', {value: 'simple'}, t('mode_simple')), h('sav-radio', {value: 'adv'}, t('mode_adv')))),
            sw('snap', t('set_snap'), true, t('set_snap_t')), sw('guides', t('set_guides'), true), sw('grid', t('set_grid'), false), sw('notesBar', t('set_notes_bar'), true), sw('spell', t('set_spell'), true))],
        ['sharing', 'users', t('sharing'), () => section(t('sharing'), t('sharing_t'),
            row(t('access_new'), null, pick('access', 'private', [['private', t('access_private')], ['link', t('access_link')]])),
            row(t('link_role_new'), null, pick('linkRole', 'viewer', ['viewer', 'commenter', 'editor'].map((r) => [r, t('role_' + r)]))),
            sw('mailShare', t('mail_share'), true), sw('mailComments', t('mail_comments'), true))],
        ['look', 'palette', t('look_app'), () => section(t('look_app'), null, row(t('appearance'), null, mode), row(t('language'), null, langSel))],
        ['device', 'hard-drive', t('on_device'), () => section(t('on_device'), t('on_device_t'),
            row(t('offline_decks'), t('offline_decks_t'), btn(t('open_device'), () => go('?p=local'), {size: 'sm', appearance: 'outline', variant: 'neutral', icon: 'hard-drive'})))],
        ['data', 'shield', t('your_data'), () => section(t('your_data'), t('your_data_t'),
            row(t('export_data'), t('export_data_t'), btn(t('export_data'), async () => {
                try {
                    saveBlob(await (await fetch('api/?r=auth.export', {credentials: 'same-origin'})).blob(), 'savpresentations-data.json');
                } catch (e) {
                    oops(e);
                }
            }, {size: 'sm', appearance: 'outline', variant: 'neutral', icon: 'download'})),
            row(t('delete_account'), t('delete_account_short'), btn(t('delete_account'), deleteAccount, {size: 'sm', variant: 'danger', appearance: 'soft', icon: 'trash'})))],
    ];
    const want = q?.get('s') || 'account';
    const tabs = h('sav-tabs.stabs', {placement: mobile() ? null : 'start', active: SECTIONS.some((s) => s[0] === want) ? want : 'account'},
        ...SECTIONS.map(([k, ic, label, body]) => h('sav-tab', {name: k, label, icon: ic}, body())));
    tabs.addEventListener('sav-tab-show', (e) => history.replaceState(null, '', '?p=settings&s=' + e.detail.name));

    app.append(h('header.htop', brand(), h('div.spacer'), userMenu()),
        h('main.smain', h('div.hhead', h('sav-button', {icon: 'arrow-left', appearance: 'ghost', variant: 'neutral', onclick: () => go('./')}, t('home')), h('h1', t('settings'))), h('p.muted.ssub', t('settings_t')), tabs), credit());

    async function deleteAccount() {
        const f = u.hasPassword ? h('sav-input', {label: t('password'), type: 'password', 'password-toggle': true, autocomplete: 'current-password'}) : h('sav-input', {label: t('type_email', {email: u.email}), type: 'email'});
        const done = await dialog(t('delete_account'), h('div.stack', h('p', t('delete_account_t')), f), [[t('cancel'), null, {appearance: 'outline', variant: 'neutral'}], [t('delete_forever'), async () => {
            await api('auth.delete', u.hasPassword ? {password: f.value} : {email: f.value});
            return true;
        }, {variant: 'danger'}]], {width: '28rem'});
        if (done) {
            state.user = null;
            state.csrf = '';
            go('./');
        }
    }
    void icon;
}
