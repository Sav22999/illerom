/**
 * SavNewsletters — the app: accounts, groups and their tabs, the review of proposals, the master admin.
 *
 * Routes (hash):  #/                     my groups
 *                 #/g/ID[/TAB]           a group: newsletters, subscribers, templates, members, share, settings
 *                 #/g/ID/n/NID           a newsletter: the editor while it is a draft, otherwise its page (preview, review)
 *                 #/g/ID/t/TID           a template of the group in the editor
 *                 #/account              profile, password, delete the account
 *                 #/master[/g/ID]        master admin of the whole platform
 * The newsletter editor is assets/editor.js; texts are in assets/i18n.js.
 */

import {getLang, setLang, t, UI_LANGS} from './i18n.js?v=25';
import {
    alert,
    api,
    atLeast,
    badge,
    btn,
    check,
    confirmDialog,
    copyBox,
    drop,
    empty,
    errText,
    failToast,
    field,
    fmtDate,
    h,
    ico,
    icon,
    iconBtn,
    input,
    LANG_NAMES,
    modal,
    partsIn,
    primary,
    put,
    rank,
    registerAppIcons,
    relTime,
    ROLES,
    S,
    select,
    textarea,
    toast
} from './ui.js?v=25';
import {editorView, previewDialog, slotDialog} from './editor.js?v=25';
import {registerIcons} from './icons.js?v=25';
import {heroDeck} from './hero.js?v=25';
import {openSavnew, pickSavnew, saveSavnew} from './files.js?v=25';
import {CHANGES, VERSION} from './version.js?v=25';

const app = document.getElementById('app');
const STATUS_ORDER = ['pending', 'scheduled', 'sending', 'draft', 'rejected', 'expired', 'sent', 'failed', 'cancelled'];
let cache = {group: null, groups: null};

// ---------------------------------------------------------------- boot

// SavAccount: joining an account that already exists, new accounts, ways of signing in (../identity/)
if (window.Identity) Identity.setup({
    name: 'SavNewsletters',
    lang: getLang,
    accent: '#C2307A',
    accept: 'acceptTerms',
    acceptUrl: () => 'terms.php?lang=' + getLang(),
    body: () => ({lang: getLang()}),
});

async function boot() {
    registerIcons();
    registerAppIcons();
    // the colours of SavComponents follow the system, as the rest of the app (light or dark)
    window.Sav?.setMode?.('auto');
    try {
        S.config = await api('auth.config');
    } catch (e) {
        return fatal(errText(e));
    }
    if (!S.config.installed) return fatal(t('not_installed'));
    const q = new URLSearchParams(location.search);
    const verify = q.get('verify');
    if (verify) {
        history.replaceState(null, '', location.pathname + location.hash);
        return verifyScreen(verify);
    }
    try {
        const me = await api('auth.me');
        setUser(me.user, me.csrf);
    } catch (e) {
        return fatal(errText(e));
    }
    route();
    // a .savnew opened with the Android app: {name, data} in base64, once
    const pend = S.user && S.user.verified && window.SavNewslettersAndroid && window.SavNewslettersAndroid.pendingFile && window.SavNewslettersAndroid.pendingFile();
    if (pend) {
        try {
            const f = JSON.parse(pend);
            openFromDevice(new File([Uint8Array.from(atob(f.data), (x) => x.charCodeAt(0))], f.name));
        } catch (e) { /* not a file */
        }
    }
    // the shell, to install it as an app (sw.js)
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

function setUser(user, csrf) {
    S.user = user;
    if (csrf) S.csrf = csrf;
    if (user && user.lang && user.lang !== getLang()) setLang(user.lang);
}

function fatal(msg) {
    put(app, h('div.wait', h('sav-card.auth', h('div.stack', h('sav-empty-state', {icon: 'cloud-off', heading: 'SavNewsletters', text: msg})))));
}

window.addEventListener('hashchange', route);

let leaveLanding = null;

function route() {
    document.title = 'SavNewsletters';
    commands(); // the search of actions (⌘J / Ctrl+J): the screen adds its own
    leaveLanding?.();
    leaveLanding = null;
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts[0] === 'changelog') return changelogPage();
    if (!S.user) {
        // a newsletter or a group opened from a link (SavCalendar, an email): there again after signing in
        if (parts[0] === 'g') sessionStorage.setItem('savnewsletters-next', location.hash);
        return landing(parts[0] === 'signin' || parts[0] === 'signup' ? parts[0] : parts[0] === 'g' ? 'signin' : '');
    }
    if (!S.user.verified) return pendingScreen();
    const next = sessionStorage.getItem('savnewsletters-next');
    if (next) {
        sessionStorage.removeItem('savnewsletters-next');
        if (next !== location.hash) return go(next);
    }
    if (parts[0] === 'signin' || parts[0] === 'signup' || parts[0] === 'welcome') return go('#/');
    if (parts[0] === 'g' && parts[1]) {
        if (parts[2] === 'n' && parts[3]) return newsletterPage(Number(parts[1]), Number(parts[3]));
        if (parts[2] === 't' && parts[3]) return templatePage(Number(parts[1]), Number(parts[3]));
        return groupPage(Number(parts[1]), parts[2] || 'newsletters');
    }
    if (parts[0] === 'account') return accountPage();
    if (parts[0] === 'master' && S.user.master) return parts[1] === 'g' && parts[2] ? masterGroup(Number(parts[2])) : masterPage();
    return dashboard();
}

function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
}

// ---------------------------------------------------------------- frame (as in the other apps of SavOffice)

async function useLang(l) {
    if (l === getLang()) return;
    setLang(l);
    if (S.user) {
        try {
            setUser((await api('auth.profile', {lang: l})).user);
        } catch (e) { /* only the app language */
        }
    }
    route();
}

/** The language of the account page and of the footer: the two languages of the app, with their own names. */
function langSwitch() {
    const c = h('sav-language-choice', {
        include: 'it-IT en-GB', value: getLang() === 'it' ? 'it-IT' : 'en-GB', 'native-names': '', 'no-code': '', size: 'sm',
        'aria-label': t('language'), class: 'langs'
    });
    c.addEventListener('change', () => {
        const l = String(c.value || '').slice(0, 2);
        if (UI_LANGS.includes(l)) useLang(l);
    });
    return c;
}

/** The language in the bar of the first page: a button with the other language, as in SavDocuments. */
function langButton() {
    const other = getLang() === 'it' ? 'en' : 'it', label = other === 'it' ? 'Italiano' : 'English';
    return h('sav-button', {icon: 'languages', appearance: 'ghost', variant: 'neutral', size: 'sm', label, onclick: () => useLang(other)}, h('span.lbl', label));
}

function credit() {
    return h('footer.credit',
        h('a', {href: 'terms.php?lang=' + getLang(), target: '_blank'}, t('terms')),
        h('a', {href: 'https://www.illerom.eu/', rel: 'noopener'}, 'Illerom'),
        h('span', getLang() === 'it' ? 'di ' : 'by ', h('a.sig', {href: 'https://www.saveriomorelli.com/', target: '_blank', rel: 'noopener'}, 'Saverio Morelli')),
        h('a.vlink', {href: '#/changelog', title: t('changelog')}, 'v' + VERSION),
        h('span.grow'), langSwitch());
}

function brand(to = '#/') {
    return h('a.brand', {href: to}, h('img', {src: 'icons/favicon.svg', width: 38, height: 38, alt: ''}), h('span', 'Sav', h('b', 'Newsletters')));
}

/** The other apps of SavOffice (assets/savoffice/ of the site): nothing when the switcher is not there. */
function officeApps() {
    return h('savoffice-apps', {current: 'savnewsletters'});
}

function userMenu() {
    const u = S.user;
    const av = h('sav-avatar', {label: u.name, title: u.name, button: '', style: 'background:hsl(' + hue(u.name) + ' 48% 38%);color:#fff;border-radius:50%;--sav-avatar-size:36px', slot: 'trigger'});
    // the picture of SavAccount, once it has really loaded (a service disconnected there keeps the initials)
    if (u.picture) { const im = new Image(); im.onload = () => av.setAttribute('image', u.picture); im.src = u.picture; }
    const items = [
        ['user', t('account'), () => go('#/account')],
        u.master ? ['shield', t('master'), () => go('#/master')] : null,
        '-',
        ['log-out', t('logout'), logout],
    ].filter(Boolean);
    const d = h('sav-dropdown', {placement: 'bottom-end', label: u.name, 'sheet-on-mobile': true}, av,
        h('sav-menu-label', u.email),
        items.map((i, n) => i === '-' ? h('sav-divider') : h('sav-menu-item', {value: String(n)}, h('sav-icon', {name: i[0], slot: 'prefix'}), i[1])));
    d.addEventListener('sav-select', (e) => {
        const i = items[+e.detail.value];
        if (i && i[2]) setTimeout(i[2], 20);
    });
    return d;
}

function hue(n) {
    return [...(n || '')].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 360, 7);
}

function initials(name) {
    return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

/**
 * Every page once signed in, as the home of SavDocuments, SavPresentations and SavSchedules: the bar on top, a side
 * menu (a button to start, the groups, the account) and the page. side: {current: 'home' | 'g:ID' | 'account' | 'master',
 * action: a node for the button on top of the menu}.
 */
/** What's new: the versions and what changed in each, newest first. The version in the footer leads here; no account needed. */
function changelogPage() {
    const it = getLang() === 'it';
    const day = (d) => new Date(d + 'T12:00:00').toLocaleDateString(getLang(), {day: 'numeric', month: 'long', year: 'numeric'});
    const body = h('div.chlog',
        h('div.shd', h('sav-button', {icon: 'arrow-left', appearance: 'ghost', size: 'sm', href: S.user ? '#/' : '#/welcome'}, t('back')), h('h1', t('changelog'))),
        h('p.muted', t('changelog_t', {v: VERSION})),
        h('div.vlist', CHANGES.map((c) => h('section.vcard',
            h('div.vhead', h('sav-badge', {variant: c.v === VERSION ? 'primary' : 'neutral', appearance: 'soft', pill: true}, 'v' + c.v), c.v === VERSION ? h('small.vnow', t('current_v')) : null, h('span.grow'), h('time', {datetime: c.date}, day(c.date))),
            h('ul', c.items.map((x) => h('li', x[it ? 1 : 0])))))));
    if (S.user && S.user.verified) shell(body, {current: 'changelog'});
    else {
        put(app, h('div.authp', h('header.ltop', brand('#/welcome'), h('div.spacer'), langButton(), officeApps()), h('main.chlog-out', body), credit()));
        window.scrollTo(0, 0);
    }
    document.title = t('changelog') + ' – SavNewsletters';
}

/**
 * The search of actions (⌘J or Ctrl+J, the same in every app of SavOffice: ../assets/savoffice/savoffice.js): what this
 * screen can do, as groups [label, [[icon, label, run or '#/address', shortcut, description]…]], then the pages of the app.
 */
function commands(...groups) {
    const item = ([ic, label, to, shortcut, description]) => ({icon: ic ? ico(ic) : '', label, shortcut, description, run: typeof to === 'function' ? to : () => go(to)});
    const pages = S.user ? [['layout-grid', t('my_groups'), '#/'], ['user', t('account'), '#/account'], S.user.master ? ['shield', t('master'), '#/master'] : null, ['sparkles', t('changelog'), '#/changelog'], ['log-out', t('logout'), () => logout()]]
        : [['', t('sign_in'), '#/signin'], ['sparkles', t('changelog'), '#/changelog']];
    window.SavOffice?.commands([...groups.filter(Boolean).map(([label, list]) => ({label, items: list.filter(Boolean).map(item)})), {label: 'SavNewsletters', items: pages.filter(Boolean).map(item)}]);
}

function shell(content, side = {}) {
    const main = h('main.hmain', content);
    const nav = h('nav.hside', {'aria-label': t('my_groups')});
    put(app, h('div.home', h('header.htop', brand(), side.search ? h('div.hsearch', side.search) : null, h('div.spacer'), officeApps(), userMenu()), h('div.hbody', nav, main), credit()));
    drawSide(nav, side);
    if (!cache.groups) api('group.list').then((r) => {
        cache.groups = r.groups;
        if (document.body.contains(nav)) drawSide(nav, side);
    }).catch(() => {
    });
    window.scrollTo(0, 0);
    return main;
}

function drawSide(nav, side) {
    const cur = side.current || 'home';
    const item = (value, ic, label, extra) => {
        const x = h('sav-menu-item', {value}, ic, label, extra || null);
        if (value === cur) x.setAttribute('current', '');
        return x;
    };
    const dot = (g) => h('span.gdot', {slot: 'prefix', style: '--g:' + (g.accent || 'var(--sav-color-primary)'), 'aria-hidden': 'true'}, (g.name || '?')[0].toUpperCase());
    const groups = cache.groups || [];
    const menu = h('sav-menu', {label: t('my_groups'), selectable: true},
        item('home', icon('layout-grid', {slot: 'prefix'}), t('my_groups')),
        groups.length ? h('sav-menu-label', t('groups')) : null,
        groups.map((g) => item('g:' + g.id, dot(g), g.name, g.pending ? h('sav-badge', {slot: 'suffix', variant: 'warning', appearance: 'soft', pill: true, title: t('n_to_review', {n: g.pending})}, String(g.pending)) : null)),
        h('sav-divider'),
        item('account', icon('user', {slot: 'prefix'}), t('account')),
        S.user.master ? item('master', icon('shield', {slot: 'prefix'}), t('master')) : null);
    menu.addEventListener('sav-select', (ev) => {
        const v = ev.detail.value;
        go(v === 'home' ? '#/' : v === 'account' ? '#/account' : v === 'master' ? '#/master' : '#/g/' + v.slice(2));
    });
    put(nav, side.action || primary(t('new_l'), {icon: 'plus', size: 'lg', block: true, class: 'newbtn', onclick: createGroup}), menu);
}

function loading() {
    return h('div.wait', h('sav-spinner', {style: 'font-size:2rem', label: t('loading')}));
}

/** The error of a page that could not be loaded, with the way back. */
function failPage(e, back = '#/', side = {}) {
    shell(h('div.wait', empty('circle-alert', errText(e), '', btn(t('back'), {icon: 'back', href: back}))), side);
}

async function logout() {
    try {
        await api('auth.logout', {});
    } catch (e) { /* signed out anyway */
    }
    S.user = null;
    S.csrf = '';
    go('#/welcome');
}

// ---------------------------------------------------------------- sign in / sign up

function signedIn(r) {
    setUser(r.user, r.csrf);
    route();
}

/** The card to sign in or create an account (its own page: #/signin, #/signup), as in SavSchedules. */
function authCard(mode) {
    const box = h('sav-card.auth');
    const inner = h('div.stack');
    box.append(inner);
    const draw = () => {
        const err = h('sav-alert', {variant: 'danger', hidden: true});
        const showErr = (e) => {
            err.textContent = errText(e);
            err.hidden = false;
        };
        const name = h('sav-input', {label: t('your_name'), maxlength: 80, autocomplete: 'name'});
        const email = h('sav-input', {label: t('email'), type: 'email', maxlength: 190, autocomplete: 'email', help: mode === 'signup' ? t('email_fixed') : null});
        const pw = h('sav-input', {label: t('password'), type: 'password', 'password-toggle': true, autocomplete: mode === 'signup' ? 'new-password' : 'current-password', help: mode === 'signup' ? t('password_hint') : null});
        const terms = h('sav-checkbox', {}, t('accept_terms_pre') + ' ', h('a', {href: 'terms.php?lang=' + getLang(), target: '_blank'}, t('terms_link')));
        const submit = h('sav-button', {variant: 'primary', appearance: 'solid', block: true}, t(mode === 'signup' ? 'create_account' : 'sign_in'));
        const run = async () => {
            if (submit.loading) return;
            submit.loading = true;
            err.hidden = true;
            try {
                if (mode === 'signup') {
                    if (!terms.checked) throw {code: 'terms_required'};
                    await api('auth.register', {name: name.value, email: email.value, password: pw.value, acceptTerms: true, lang: getLang()});
                    put(inner, h('sav-empty-state', {icon: 'mail', heading: t('check_inbox'), text: t('check_inbox_text', {email: email.value})},
                        h('sav-button', {appearance: 'outline', variant: 'neutral', href: '#/signin'}, t('back_to_login'))));
                } else signedIn(await api('auth.login', {email: email.value, password: pw.value}));
            } catch (e) {
                showErr(e);
            } finally {
                submit.loading = false;
            }
        };
        submit.addEventListener('click', run);
        const form = h('div.form', mode === 'signup' ? name : null, email, pw, mode === 'signup' ? terms : null, err, submit);
        form.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.localName === 'sav-input') run();
        });
        const seg = h('sav-radio-group', {appearance: 'buttons', size: 'sm', value: mode, 'aria-label': t('sign_in'), class: 'segm wide'},
            h('sav-radio', {value: 'signin'}, t('sign_in')), h('sav-radio', {value: 'signup'}, t('create_account')));
        seg.addEventListener('change', () => go('#/' + seg.value));
        const sav = window.Identity ? Identity.button(S.config.savAccount) : null;
        put(inner, seg, form,
            !S.config.mailReady && mode === 'signup' ? h('p.muted.small', t('mail_not_ready')) : null,
            sav ? [h('sav-divider', t('or')), sav,
                h('p.muted.small.center', t('google_terms'), ' ', h('a', {href: 'terms.php?lang=' + getLang(), target: '_blank'}, t('terms_link')))] : null);
    };
    draw();
    return box;
}

/** Small newsletters for the fan of the first page: drawn, not real, the same in both themes. */
function fanPages() {
    const bar = (title) => h('div.lp-bar', h('i.lp-dot'), h('b', title));
    const lines = (...w) => w.map((x) => h('i.lp-line', {style: 'width:' + x + '%'}));
    const issue = h('div.lp', h('div.lp-hero', h('b', t('lp_issue'))), h('strong.lp-h', t('lp_title')), lines(92, 84, 60), h('div.lp-btn', t('lp_read')), h('div.lp-foot', lines(70)));
    const blocks = h('div.lp', bar(t('lp_blocks')), ['heading', 'text', 'image', 'button', 'card'].map((b, i) => h('div.lp-block' + (i === 2 ? '.on' : ''), h('sav-icon', {name: ['type', 'align-left', 'image', 'mouse-pointer-click', 'square'][i]}), h('span', t('lp_b_' + b)))));
    const review = h('div.lp.lp-done', h('div.lp-check', h('sav-icon', {name: 'check'})), h('b', t('lp_approved')), h('div.lp-ticket', h('small', t('lp_when')), h('strong', '10:30'), h('i')));
    const langs = h('div.lp', bar(t('lp_audience')), [['it', 62], ['en', 38], ['fr', 14], ['de', 9]].map(([l, w], i) => h('div.lp-lang', h('em', l.toUpperCase()), h('div.lp-r', h('span', {style: 'width:' + w + '%'})), i === 0 ? h('i.lp-star') : null)));
    const week = h('div.lp', bar(t('lp_plan')), h('div.lp-month', Array.from({length: 28}, (_, i) => h('span' + ([4, 11, 18].includes(i) ? '.on' : '') + (i === 25 ? '.best' : '')))));
    return [langs, week, blocks, review, issue];
}

/**
 * The first page, as in SavDocuments, SavPresentations and SavSchedules: a bar with the language and "Sign in", the
 * title with the two buttons, a fan of small newsletters that open up and come forward under the pointer, six features
 * and how it works. Signing in and creating an account have a page of their own (#/signin, #/signup).
 */
function landing(mode) {
    const top = (...right) => h('header.ltop', brand('#/welcome'), h('div.spacer'), langButton(), officeApps(), ...right);
    if (mode === 'signin' || mode === 'signup') {
        put(app, h('div.authp', top(), h('main.amain', h('div.stack.aw', authCard(mode))), credit()));
        return;
    }
    const stage = h('div.l-stage', {'aria-hidden': 'true'});
    const cards = fanPages().map((p, i) => h('div.l-card', {style: '--i:' + i}, p));
    stage.append(...cards);
    const feat = (ic, k) => h('div.feat', h('sav-icon', {name: ic}), h('h3', t(k)), h('p', t(k + '_text')));
    const step = (n, k) => h('li', h('span.num', String(n)), h('div', h('strong', t(k)), h('span.muted', t(k + '_text'))));
    const btn = (label, href, primary) => h('sav-button', {variant: primary ? 'primary' : 'neutral', appearance: primary ? 'solid' : 'ghost', size: 'lg', href}, label);
    put(app, h('div.landing', top(h('sav-button', {appearance: 'outline', variant: 'neutral', size: 'sm', href: '#/signin'}, t('sign_in'))),
        h('main.lmain',
            h('section.hero', h('div.hero-t', h('h1', t('hero_title')), h('p', t('hero_lead')),
                h('div.prow', btn(t('l_cta'), '#/signup', true), btn(t('sign_in'), '#/signin')), h('small', t('l_small'))), stage),
            h('section.feats', feat('layout-template', 'feat_editor'), feat('badge-check', 'feat_review'), feat('users', 'feat_roles'),
                feat('languages', 'feat_langs'), feat('code', 'feat_widget'), feat('calendar-days', 'feat_calendar')),
            h('section.how', h('h2', t('how_title')), h('ol.steps', step(1, 'how_1'), step(2, 'how_2'), step(3, 'how_3')))),
        credit()));
    leaveLanding = heroDeck(stage, cards);
}

const centered = (...kids) => put(app, h('div.authp', h('header.ltop', brand('#/welcome'), h('div.spacer'), langButton(), officeApps()),
    h('main.amain', h('sav-card.auth.aw', h('div.stack', kids))), credit()));

function verifyScreen(token) {
    const btn = h('sav-button', {variant: 'primary', appearance: 'solid', icon: 'check'}, t('confirm_email'));
    btn.addEventListener('click', async () => {
        if (btn.loading) return;
        btn.loading = true;
        try {
            const r = await api('auth.verify', {token});
            setUser(r.user, r.csrf);
            toast(t('verified_ok'));
            go('#/');
        } catch (e) {
            centered(h('sav-empty-state', {icon: 'circle-x', heading: t('link_expired'), text: errText(e)},
                h('sav-button', {appearance: 'outline', variant: 'neutral', href: './'}, t('back_to_login'))));
        } finally {
            btn.loading = false;
        }
    });
    centered(h('sav-empty-state', {icon: 'mail', heading: t('confirm_email_title'), text: t('confirm_email_text')}, btn));
}

function pendingScreen() {
    const resend = h('sav-button', {variant: 'primary', appearance: 'solid', icon: 'send'}, t('resend_link'));
    resend.addEventListener('click', async () => {
        if (resend.loading) return;
        resend.loading = true;
        try {
            await api('auth.resend', {lang: getLang()});
            toast(t('link_sent'));
        } catch (e) {
            failToast(e);
        } finally {
            resend.loading = false;
        }
    });
    const out = h('sav-button', {appearance: 'outline', variant: 'neutral', onclick: logout}, t('logout'));
    centered(h('sav-empty-state', {icon: 'mail', heading: t('check_inbox'), text: t('pending_text', {email: S.user.email})},
        h('div.prow.wrap', resend, out)), !S.user.mailReady ? h('p.muted.small.center', t('mail_not_ready')) : null);
}

// ---------------------------------------------------------------- .savnew files (assets/files.js)

/** A .savnew becomes a new draft of the group, then the editor opens on it. */
async function importInto(g, file) {
    toast(t('opening_savnew'));
    try {
        const n = await openSavnew(file, g);
        toast(t('savnew_opened'));
        go('#/g/' + g.id + '/n/' + n.id);
    } catch (e) {
        failToast(e);
    }
}

/** A .savnew opened from the files of the device (installed app): into which group, when there are several. */
async function openFromDevice(file) {
    let groups;
    try {
        groups = (await api('group.list')).groups.filter((x) => x.status === 'active' && atLeast(x.role, 'moderator'));
    } catch (e) {
        return failToast(e);
    }
    if (!groups.length) return toast(t('savnew_no_group'), 'err');
    if (groups.length === 1) return importInto(await loadGroup(groups[0].id), file);
    let pick = String(groups[0].id);
    const sel = select(groups.map((x) => [String(x.id), x.name]), pick, {onchange: (ev) => { pick = ev.target.value; }});
    modal(t('open_savnew'), [h('p.muted', t('savnew_pick_group', {name: file.name})), field(t('group'), sel)], [
        {label: t('cancel')},
        {label: t('open'), primary: true, icon: 'upload', onclick: async () => importInto(await loadGroup(Number(pick)), file)},
    ]);
}

{ const take = async (p) => {
    const f = p.files && p.files[0];
    if (!f) return;
    const file = await f.getFile();
    // after signing in, if needed: the app boots first
    const wait = () => S.user && S.user.verified ? openFromDevice(file) : setTimeout(wait, 500);
    wait();
};
  window.launchQueue?.setConsumer(take);
  window.SavOffice?.fromDrive?.(take); // a file opened from SavDrive (?savdrive=<id>), given like a file of the device
}

// ---------------------------------------------------------------- shared pieces

const ROLE_VARIANT = {owner: 'primary', admin: 'primary', publisher: 'success', moderator: 'warning', user: 'neutral'};
const roleBadge = (r) => badge(t('role_' + r), ROLE_VARIANT[r] || 'neutral', {class: 'role'});
const ST_VARIANT = {draft: 'neutral', pending: 'warning', scheduled: 'primary', sending: 'primary', sent: 'success', rejected: 'danger', expired: 'neutral', cancelled: 'neutral', failed: 'danger'};
const SUB_VARIANT = {active: 'success', pending: 'warning', unsubscribed: 'neutral'};

function statusChip(st) {
    return badge(t('st_' + st), ST_VARIANT[st] || 'neutral', {class: 'status'});
}

function stat(label, value, ic) {
    return h('sav-stat', {label, value: String(value), icon: ico(ic)});
}

/** A page title with what goes next to it (buttons). */
const pageHead = (title, sub, ...right) => h('div.hhead', h('div.hhead-t', h('h1', title), sub ? h('p.muted', sub) : null), h('div.spacer'), ...right);

/** A card of settings, as in SavSchedules: icon and title, an optional line, then its fields. */
const scard = (ic, title, text, ...kids) => h('sav-card.scard', h('div.shead', icon(ic), h('h3', title)), text ? h('p.muted.small', text) : null, h('div.form', kids));

/** Cards to choose among a few, each one a small drawing (look and typeface of the subscription page): sav-radio-group with
    appearance="cards" (SavComponents 1.1.1). options: [[value, drawing, label, title]] */
function cardChoice(options, value, onPick, cls = '') {
    const g = h('sav-radio-group.cchoice' + (cls ? '.' + cls : ''), {appearance: 'cards', value});
    for (const [v, art, label, title] of options) g.append(h('sav-radio', {value: v, title: title || null}, h('span.copt-art', {slot: 'media'}, art), label));
    g.addEventListener('change', () => onPick(g.value));
    return g;
}

/**
 * Templates to start from, as choice cards: [{id, name, desc, doc, star}]. Several groups (the group's own, the built-in
 * ones) make one choice: picking in one empties the others.
 */
function tplChoice(items, chosen, label, onPick) {
    const g = h('sav-radio-group.tchoice', {appearance: 'cards', value: items.some((x) => x.id === chosen) ? chosen : '', label});
    for (const x of items) g.append(h('sav-radio', {value: x.id}, h('span', {slot: 'media'}, tplThumb(x.doc)), x.name, x.desc ? h('span', {slot: 'description'}, x.desc) : null, x.star || null));
    g.addEventListener('change', () => {
        if (!g.value) return;
        onPick(g.value);
        g.parentElement && g.parentElement.querySelectorAll('sav-radio-group.tchoice').forEach((o) => {
            if (o !== g) o.value = '';
        });
    });
    return g;
}

// ---------------------------------------------------------------- dashboard

async function dashboard() {
    shell(loading());
    let groups;
    try {
        groups = (await api('group.list')).groups;
        cache.groups = groups;
    } catch (e) {
        return failPage(e);
    }
    const card = (g) => h('sav-card.gcard', {
            interactive: true, role: 'link', tabindex: 0, style: '--g:' + (g.accent || 'var(--sav-color-primary)'),
            onclick: () => go('#/g/' + g.id), onkeydown: (ev) => {
                if (ev.key === 'Enter' && ev.target === ev.currentTarget) go('#/g/' + g.id);
            }
        },
        h('div.gthumb', h('span.gdot.big', g.name[0].toUpperCase()), h('div.gbadges', roleBadge(g.role),
            g.status === 'disabled' ? badge(t('group_disabled'), 'danger', {icon: 'ban'}) : !g.sendingReady && atLeast(g.role, 'admin') ? badge(t('setup_sending'), 'warning', {icon: 'mail'}) : null)),
        h('div.ginfo', h('b', g.name), g.description ? h('small', g.description) : null,
            h('div.gnums',
                h('span', icon('users'), ' ', t('n_subscribers', {n: g.subscribers})),
                g.pending ? h('span.hl', icon('review'), ' ', t('n_to_review', {n: g.pending})) : null,
                g.scheduled ? h('span', icon('calendar'), ' ', t('n_scheduled', {n: g.scheduled})) : null)));
    // as in SavDocuments and SavPresentations: the title (with a search on top), the box to start a new one, then "Recent"
    const quick = h('sav-card.quick', {appearance: 'elevated'}, h('div.qhead', h('h2', t('start_group'))),
        h('div.qrow', h('sav-card.qt', {interactive: true, role: 'button', tabindex: 0, onclick: createGroup, onkeydown: (ev) => {
            if (ev.key === 'Enter') createGroup();
        }}, h('div.qpic', icon('plus')), h('div', h('strong', t('new_group')), h('small.muted', t('new_group_text'))))));
    const openFile = async () => { const f = await pickSavnew(); if (f) openFromDevice(f); };
    let q = '';
    const box = h('div');
    const draw = () => {
        const shown = groups.filter((g) => !q || (g.name + ' ' + (g.description || '')).toLowerCase().includes(q));
        put(box, pageHead(q ? t('results_for', {q}) : t('my_groups'), null, groups.length ? btn(t('open_file'), {size: 'sm', icon: 'file-up', appearance: 'outline', variant: 'neutral', onclick: openFile}) : null),
            q ? null : quick,
            shown.length ? [q ? null : h('h2', t('recent')), h('div.grid', shown.map(card))] : q ? empty('search', t('nothing_found'), '') : h('p.muted.small', t('invite_note')));
    };
    const search = h('sav-input', {type: 'search', placeholder: t('search_my_groups'), clearable: true, pill: true, 'aria-label': t('search_my_groups')}, icon('search', {slot: 'prefix'}));
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
    search.addEventListener('sav-clear', () => { q = ''; draw(); });
    shell(box, {current: 'home', search});
    draw();
    commands([t('new_group'), [['plus', t('new_group'), () => createGroup()], ['file-up', t('open_file'), () => openFile()]]],
        [t('my_groups'), groups.map((g) => ['users', g.name, '#/g/' + g.id, null, t('n_subscribers', {n: g.subscribers})])]);
}

/** The languages subscribers can choose: chips, at least one stays on. */
function langChips(selected, onChange) {
    const box = h('sav-chip-group.langchips', {'aria-label': t('sub_langs')});
    const draw = () => put(box, S.config.langs.map((l) => {
        const on = selected.includes(l);
        const c = h('sav-chip', {selectable: true, selected: on, variant: on ? 'primary' : 'neutral'}, LANG_NAMES[l] || l);
        c.addEventListener('click', () => {
            if (selected.includes(l)) {
                if (selected.length > 1) selected.splice(selected.indexOf(l), 1);
            } else selected.push(l);
            draw();
            if (onChange) onChange(selected);
        });
        return c;
    }));
    draw();
    return box;
}

function timezones() {
    try {
        return Intl.supportedValuesOf('timeZone');
    } catch (e) {
        return ['Europe/Rome', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'UTC'];
    }
}

const tzSelect = (value) => select(timezones().map((z) => [z, z.replace(/_/g, ' ')]), value, {searchable: true});

function createGroup() {
    const name = input({maxlength: 80, placeholder: t('group_name_ph'), autofocus: true});
    const slug = input({maxlength: 40, placeholder: 'my-newsletter'});
    const desc = input({maxlength: 300, placeholder: t('group_desc_ph')});
    const langs = [S.config.langs.includes(getLang()) ? getLang() : 'en'];
    const tz = tzSelect(Intl.DateTimeFormat().resolvedOptions().timeZone || S.config.timezone);
    let touched = false;
    let timer;
    name.addEventListener('input', () => {
        if (touched) return;
        clearTimeout(timer);
        timer = setTimeout(async () => {
            if (!name.value.trim()) return;
            try {
                slug.value = (await api('group.slug', null, 'name=' + encodeURIComponent(name.value))).slug;
            } catch (e) { /* typed by hand */
            }
        }, 300);
    });
    slug.addEventListener('input', () => {
        touched = true;
    });
    modal(t('new_group'), h('div.form',
        field(t('group_name'), name), field(t('group_slug'), slug, t('group_slug_hint')), field(t('group_desc'), desc),
        field(t('sub_langs'), langChips(langs), t('sub_langs_hint')), field(t('timezone'), tz, t('timezone_hint'))), [
        {label: t('cancel')},
        {
            label: t('create'), primary: true, icon: 'plus', onclick: async () => {
                try {
                    const r = await api('group.create', {name: name.value, slug: slug.value, description: desc.value, langs, timezone: tz.value});
                    cache.groups = null;
                    go('#/g/' + r.group.id + '/settings');
                    toast(t('group_created'));
                } catch (e) {
                    failToast(e);
                    return false;
                }
            }
        },
    ]);
}

// ---------------------------------------------------------------- group page

const TABS = [
    ['newsletters', 'mail', 'user'], ['subscribers', 'users', 'publisher'], ['templates', 'layout', 'moderator'],
    ['members', 'user', 'user'], ['share', 'code', 'user'], ['settings', 'settings', 'admin'],
];

async function loadGroup(id) {
    const g = (await api('group.get', null, 'group=' + id)).group;
    cache.group = g;
    return g;
}

/** The button on top of the side menu inside a group: a new newsletter, for who can write. */
function groupAction(g) {
    return atLeast(g.role, 'moderator') && g.status === 'active'
        ? primary(t('new_newsletter'), {icon: 'plus', size: 'lg', block: true, class: 'newbtn', onclick: () => newNewsletter(g)})
        : null;
}

async function groupPage(id, tab) {
    shell(loading(), {current: 'g:' + id});
    let g;
    try {
        g = await loadGroup(id);
    } catch (e) {
        return failPage(e, '#/', {current: 'g:' + id});
    }
    document.title = g.name + ' · SavNewsletters';
    const tabs = TABS.filter(([, , min]) => atLeast(g.role, min));
    if (!tabs.some(([k]) => k === tab)) tab = 'newsletters';
    const body = h('div.tab-body', loading());
    const bar = h('sav-tabs.gtabs', {active: tab, label: g.name},
        tabs.map(([k, ic]) => h('sav-tab', {name: k, label: t('tab_' + k), icon: ico(ic), active: k === tab ? true : null}, k === tab ? body : null)));
    bar.addEventListener('sav-tab-show', (ev) => {
        if (ev.target !== bar || !ev.detail || ev.detail.name === tab) return;
        go('#/g/' + g.id + '/' + ev.detail.name);
    });
    shell([
        h('div.ghead', {style: '--g:' + (g.page.accent || 'var(--sav-color-primary)')},
            h('span.gdot.big', g.name[0].toUpperCase()),
            h('div.ghead-t', h('h1', g.name), h('div.prow.wrap-start', roleBadge(g.role), h('span.muted.small', t('n_subscribers', {n: g.subscribers.active}))))),
        g.status === 'disabled' ? alert(t('group_disabled_long'), 'danger', {icon: 'ban'}) : null,
        !g.sendingReady && g.status === 'active' ? alert(atLeast(g.role, 'admin')
            ? h('span', t('setup_sending_long'), ' ', h('a', {href: '#/g/' + g.id + '/settings'}, t('open_settings'))) : t('sending_not_ready'), 'warning', {icon: 'mail'}) : null,
        bar,
    ], {current: 'g:' + g.id, action: groupAction(g)});
    commands([g.name, [atLeast(g.role, 'moderator') && g.status === 'active' ? ['plus', t('new_newsletter'), () => newNewsletter(g)] : null, ...tabs.map(([k, ic]) => [ic, t('tab_' + k), '#/g/' + g.id + '/' + k])]],
        [t('my_groups'), (cache.groups || []).filter((x) => x.id !== g.id).map((x) => ['users', x.name, '#/g/' + x.id])]);
    const views = {newsletters: tabNewsletters, subscribers: tabSubscribers, templates: tabTemplates, members: tabMembers, share: tabShare, settings: tabSettings};
    try {
        await views[tab](g, body);
    } catch (e) {
        put(body, empty('circle-alert', errText(e), ''));
    }
}

/**
 * What can be done to a newsletter without opening it: delete a draft, move or unschedule a scheduled one, change the
 * time of a proposal. Sent ones have no actions: subscribers already received them.
 */
function nlActions(g, n, refresh) {
    const mine = n.authorId === S.user.id;
    const pub = atLeast(g.role, 'publisher');
    const mod = atLeast(g.role, 'moderator') && g.status === 'active';
    const out = [];
    const run = async (route, extra, msg) => {
        try {
            await api(route, {id: n.id, ...extra});
            toast(msg);
            refresh();
        } catch (e) {
            failToast(e);
        }
    };
    if (mod && ((n.status === 'scheduled' && pub) || (n.status === 'pending' && (mine || pub)))) {
        out.push(['calendar', t(n.status === 'scheduled' ? 'reschedule' : 'change_time'), async () => {
            const when = n.scheduledAt || n.proposedAt;
            const pick = await slotDialog(g, {title: t('reschedule_title'), action: t('save'), initial: when ? partsIn(when, g.timezone) : null});
            if (pick) run('nl.reschedule', {date: pick.date, time: pick.time}, t('rescheduled_ok'));
        }]);
    }
    if (mod && n.status === 'scheduled' && pub) out.push(['undo', t('unschedule'), () => run('nl.withdraw', {}, t('withdrawn_ok'))]);
    out.push(['download', t('download_savnew'), async () => saveSavnew((await api('nl.get', null, 'id=' + n.id)).newsletter)]);
    if (mod && ['draft', 'rejected', 'expired', 'cancelled'].includes(n.status) && (mine || pub)) {
        out.push('-', ['trash', t('delete'), async () => {
            if (await confirmDialog(t('delete_nl_title'), t('delete_nl_text_named', {subject: n.subject || t('untitled')}), t('delete'), true)) run('nl.delete', {}, t('deleted_ok'));
        }, {danger: true}]);
    }
    return out;
}

function nlRow(g, n, refresh) {
    const when = n.status === 'sent' ? n.sentAt : n.scheduledAt || n.proposedAt;
    const open = () => go('#/g/' + g.id + '/n/' + n.id);
    const more = drop(h('sav-button', {icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true}), nlActions(g, n, refresh));
    return h('sav-card.nlc', {
            interactive: true, role: 'link', tabindex: 0, onclick: open, onkeydown: (ev) => {
                if (ev.key === 'Enter' && ev.target === ev.currentTarget) open();
            }
        },
        h('div.nlc-main', h('b', n.subject || t('untitled')), h('small', [n.author ? t('by', {name: n.author}) : null, n.lang ? LANG_NAMES[n.lang] || n.lang : t('all_langs')].filter(Boolean).join(' · '))),
        h('div.nlc-when', when ? [h('span', fmtDate(when, g.timezone)), ['pending', 'scheduled'].includes(n.status) ? h('small', relTime(when)) : null] : h('small', t('updated', {when: fmtDate(n.updatedAt, g.timezone)}))),
        h('div.nlc-num', n.status === 'sent' || n.status === 'sending' ? [h('b', String(n.sent)), h('small', ' / ' + n.total)] : null),
        statusChip(n.status), more);
}

async function tabNewsletters(g, body) {
    const list = (await api('nl.list', null, 'group=' + g.id)).newsletters;
    const by = {};
    for (const n of list) (by[n.status] = by[n.status] || []).push(n);
    const sections = [
        ['pending', atLeast(g.role, 'publisher') ? 'sec_review' : 'sec_pending'], ['scheduled', 'sec_scheduled'], ['sending', 'sec_sending'],
        ['draft', 'sec_drafts'], ['rejected', 'sec_rejected'], ['expired', 'sec_expired'], ['sent', 'sec_sent'], ['failed', 'sec_failed'], ['cancelled', 'sec_cancelled'],
    ];
    const c = g.subscribers;
    const writer = atLeast(g.role, 'moderator') && g.status === 'active';
    const openFile = btn(t('open_savnew'), {
        icon: 'upload', size: 'sm', title: t('open_savnew_hint'), onclick: async () => {
            const f = await pickSavnew();
            if (f) importInto(g, f);
        }
    });
    put(body,
        h('div.stats',
            stat(t('stat_active'), c.active, 'users'), stat(t('stat_pending'), c.pending, 'clock'),
            stat(t('stat_scheduled'), (by.scheduled || []).length + (by.sending || []).length, 'calendar'), stat(t('stat_sent'), (by.sent || []).length, 'send')),
        h('div.hhead.sub', h('h2', t('tab_newsletters')), h('div.spacer'), writer ? [openFile, primary(t('new_newsletter'), {icon: 'plus', size: 'sm', onclick: () => newNewsletter(g)})] : null),
        !list.length ? empty('mail', t('no_newsletters'), t(writer ? 'no_newsletters_text' : 'no_newsletters_user'),
            writer ? primary(t('new_newsletter'), {icon: 'plus', onclick: () => newNewsletter(g)}) : null) : null,
        sections.filter(([st]) => by[st]).map(([st, title]) => h('section.nl-section' + (st === 'pending' && atLeast(g.role, 'publisher') ? '.hl' : ''),
            h('h3', t(title), ' ', badge(String(by[st].length), st === 'pending' ? 'warning' : 'neutral')),
            h('div.rows', by[st].map((n) => nlRow(g, n, () => groupPage(g.id, 'newsletters')))))));
}

/** Built-in templates with this user's favourites first (in the order they were starred). */
function sortedBuiltin(builtin, favs) {
    const rank = (id) => (favs.includes(id) ? favs.indexOf(id) : 1000);
    return [...builtin].sort((a, b) => rank(a.id) - rank(b.id) || builtin.indexOf(a) - builtin.indexOf(b));
}

/** The star that marks a built-in template as a favourite of the signed-in user (sav-favourite-button, as in SavDocuments). */
function favStar(id, favs, onChange) {
    const on = favs.includes(id);
    const b = h('sav-favourite-button.starb', {icon: 'star', appearance: 'ghost', size: 'sm', label: t(on ? 'fav_remove' : 'fav_add'), pressed: on, onclick: (ev) => ev.stopPropagation(), onkeydown: (ev) => ev.stopPropagation()});
    b.addEventListener('change', async (ev) => {
        try {
            const r = await api('tpl.fav', {id, on: !!(ev.detail && ev.detail.pressed)});
            favs.splice(0, favs.length, ...r.favorites);
            setTimeout(onChange, 250);
        } catch (e) {
            failToast(e);
        }
    });
    return b;
}

/** A template as a card: its drawing, its name, a line, then what goes in the footer. */
function tplCard(id, name, desc, doc, o = {}) {
    const c = h('sav-card.tcard' + (o.on ? '.on' : ''), {
            interactive: o.pick ? true : null, role: o.pick ? 'radio' : null, tabindex: o.pick ? 0 : null, 'aria-checked': o.pick ? String(!!o.on) : null, 'data-id': id,
            onclick: o.pick ? () => o.pick(id) : null, onkeydown: o.pick ? (ev) => {
                if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === ev.currentTarget) {
                    ev.preventDefault();
                    o.pick(id);
                }
            } : null
        },
        tplThumb(doc), h('div.tinfo', h('div', h('b', name), desc ? h('small', desc) : null), o.star || null), o.foot ? h('div.tfoot', o.foot) : null);
    return c;
}

async function newNewsletter(g) {
    const r = await api('tpl.list', null, 'group=' + g.id);
    const favs = r.favorites || [];
    let chosen = r.own.length ? String(r.own[0].id) : (favs[0] || 'b:blank');
    const lang = g.langs.length > 1 ? select([['', t('all_langs')], ...g.langs.map((l) => [l, LANG_NAMES[l] || l])], '') : null;
    const subject = input({maxlength: 200, placeholder: t('subject_ph'), autofocus: true});
    const box = h('div.tpl-picker');
    const pick = (id) => {
        chosen = id;
    };
    const draw = () => put(box,
        r.own.length ? tplChoice(r.own.map((o) => ({id: String(o.id), name: o.name, desc: o.author ? t('by', {name: o.author}) : '', doc: o.doc})), chosen, t('own_templates'), pick)
            : [h('sav-label', {appearance: 'plain', case: 'normal', variant: 'neutral'}, t('own_templates')), h('p.muted.small', t('no_templates_short'))],
        tplChoice(sortedBuiltin(r.builtin, favs).map((b) => ({id: b.id, name: b.name, desc: b.description, doc: b.doc, star: favStar(b.id, favs, draw)})), chosen, t('builtin_templates'), pick));
    draw();
    modal(t('new_newsletter'), h('div.form', field(t('subject'), subject), lang ? field(t('audience'), lang, t('audience_hint')) : null, box), [
        {label: t('cancel')},
        {
            label: t('start_writing'), primary: true, icon: 'chev', onclick: async () => {
                try {
                    const n = (await api('nl.create', {group: g.id, template: chosen, subject: subject.value, lang: lang ? lang.value : null})).newsletter;
                    go('#/g/' + g.id + '/n/' + n.id);
                } catch (e) {
                    failToast(e);
                    return false;
                }
            }
        },
    ], {wide: true});
}

/** A tiny drawing of a template: its colours and the shape of its blocks. */
function tplThumb(doc) {
    const th = doc.theme || {};
    const rows = (doc.blocks || []).slice(0, 7).map((b) => h('i.tb-' + (b.type === 'social' ? 'netlinks' : b.type), {style: {background: ['button'].includes(b.type) ? th.accent : null}}));
    return h('div.tpl-thumb', {style: {background: th.bg}}, h('div', {style: {background: th.card, '--a': th.accent}}, rows));
}

// ---------------------------------------------------------------- newsletter page (not editable: preview and review)

async function newsletterPage(gid, nid) {
    // it opens the editor most of the time (a page of its own): only the spinner meanwhile
    put(app, loading());
    let g, r;
    try {
        [g, r] = await Promise.all([cache.group && cache.group.id === gid ? cache.group : loadGroup(gid), api('nl.get', null, 'id=' + nid)]);
    } catch (e) {
        return failPage(e, '#/g/' + gid, {current: 'g:' + gid});
    }
    const n = r.newsletter;
    document.title = (n.subject || t('untitled')) + ' · SavNewsletters';
    if (r.canEdit && g.status === 'active') {
        put(app, h('div.editor-root'));
        editorView(app.firstChild, {group: g, nl: n, role: g.role, onBack: () => go('#/g/' + g.id), onChange: () => newsletterPage(gid, nid)});
        return;
    }
    const frame = h('iframe.preview-frame.inline', {title: n.subject, sandbox: 'allow-same-origin allow-popups allow-popups-to-escape-sandbox', referrerpolicy: 'no-referrer'});
    api('nl.preview', null, 'id=' + n.id).then((p) => {
        frame.srcdoc = p.html;
    }).catch(failToast);
    const mine = n.authorId === S.user.id;
    const pub = atLeast(g.role, 'publisher');
    const act = async (route, extra = {}, msg = '') => {
        await api(route, {id: n.id, ...extra});
        if (msg) toast(msg);
        newsletterPage(gid, nid);
    };
    const reschedule = async () => {
        const pick = await slotDialog(g, {title: t('reschedule_title'), action: t('save'), initial: partsIn(n.scheduledAt || n.proposedAt, g.timezone)});
        if (pick) await act('nl.reschedule', {date: pick.date, time: pick.time}, t('rescheduled_ok'));
    };
    const B = (label, ic, onclick, o = {}) => btn(label, {icon: ic, block: true, onclick, ...o});
    const buttons = [];
    if (n.status === 'pending' && pub) {
        buttons.push(B(t('approve'), 'check', async () => {
            if (await confirmDialog(t('approve_title'), t('approve_text', {when: fmtDate(n.proposedAt, g.timezone)}), t('approve'))) await act('nl.approve', {}, t('approved_ok'));
        }, {variant: 'primary', appearance: 'solid'}));
        buttons.push(B(t('approve_other'), 'calendar', async () => {
            const pick = await slotDialog(g, {title: t('approve_other_title'), action: t('approve'), initial: null});
            if (pick) await act('nl.approve', {date: pick.date, time: pick.time}, t('approved_ok'));
        }));
        buttons.push(B(t('reject'), 'x', () => {
            const note = textarea({rows: 3, maxlength: 500, placeholder: t('reject_note_ph')});
            modal(t('reject_title'), h('div.form', h('p', t('reject_text')), field(t('reject_note'), note)), [{label: t('cancel')}, {
                label: t('reject'), danger: true, onclick: async () => {
                    try {
                        await act('nl.reject', {note: note.value}, t('rejected_ok'));
                    } catch (e) {
                        failToast(e);
                        return false;
                    }
                }
            }]);
        }, {variant: 'danger', appearance: 'outline'}));
    }
    if (n.status === 'pending' && (mine || pub) && atLeast(g.role, 'moderator')) {
        buttons.push(B(t('withdraw'), 'undo', () => act('nl.withdraw', {}, t('withdrawn_ok'))));
        buttons.push(B(t('change_time'), 'calendar', reschedule));
    }
    if (n.status === 'scheduled' && pub) {
        buttons.push(B(t('reschedule'), 'calendar', reschedule));
        buttons.push(B(t('unschedule'), 'undo', () => act('nl.withdraw', {}, t('withdrawn_ok'))));
        buttons.push(B(t('cancel_nl'), 'ban', async () => {
            if (await confirmDialog(t('cancel_nl_title'), t('cancel_nl_text'), t('cancel_nl'), true)) await act('nl.cancel', {}, t('cancelled_ok'));
        }, {variant: 'danger', appearance: 'outline'}));
    }
    if (atLeast(g.role, 'moderator') && g.status === 'active' && !['sent', 'sending'].includes(n.status)) buttons.push(B(t('duplicate'), 'dup', async () => {
        const d = (await api('nl.duplicate', {id: n.id})).newsletter;
        go('#/g/' + g.id + '/n/' + d.id);
    }, {appearance: 'ghost'}));
    buttons.push(B(t('download_savnew'), 'download', async () => saveSavnew(n.doc ? n : (await api('nl.get', null, 'id=' + n.id)).newsletter), {appearance: 'ghost'}));
    if (n.status === 'cancelled' && (mine || pub)) buttons.push(B(t('delete'), 'trash', async () => {
        if (await confirmDialog(t('delete_nl_title'), t('delete_nl_text'), t('delete'), true)) {
            await api('nl.delete', {id: n.id});
            go('#/g/' + g.id);
        }
    }, {appearance: 'ghost', variant: 'danger'}));
    const facts = [
        [t('status'), statusChip(n.status)],
        [t('author'), n.author || '—'],
        [t('audience'), n.lang ? LANG_NAMES[n.lang] || n.lang : t('all_langs')],
        n.proposedAt ? [t('proposed_for'), fmtDate(n.proposedAt, g.timezone)] : null,
        n.scheduledAt ? [t('scheduled_for'), fmtDate(n.scheduledAt, g.timezone)] : null,
        n.reviewer ? [t('reviewed_by'), n.reviewer + (n.reviewedAt ? ' · ' + fmtDate(n.reviewedAt, g.timezone) : '')] : null,
        n.reviewNote ? [t('review_note'), h('em', n.reviewNote)] : null,
        n.sentAt ? [t('sent_on'), fmtDate(n.sentAt, g.timezone)] : null,
        ['sending', 'sent', 'failed'].includes(n.status) ? [t('delivered'), t('delivered_n', {sent: n.sent, total: n.total, failed: n.failed})] : null,
    ].filter(Boolean);
    shell([
        h('sav-breadcrumb', h('sav-breadcrumb-item', {href: '#/g/' + g.id}, g.name), h('sav-breadcrumb-item', n.subject || t('untitled'))),
        pageHead(n.subject || t('untitled'), n.preheader || null),
        h('div.nl-detail',
            h('div.nl-preview', frame),
            h('sav-card.nl-side',
                n.status === 'pending' && pub ? alert(t('review_banner'), 'warning', {icon: 'review'}) : null,
                n.status === 'pending' && !pub ? alert(t('waiting_banner'), 'primary', {icon: 'clock'}) : null,
                n.status === 'sending' ? alert(t('sending_banner', {rate: g.ratePerHour}), 'primary', {icon: 'clock'}) : null,
                n.status === 'sent' ? alert(t('sent_banner'), 'success', {icon: 'check'}) : null,
                h('dl.facts', facts.map(([k, v]) => [h('dt', k), h('dd', v)])),
                ['sending', 'sent'].includes(n.status) && n.total ? h('sav-progress-bar', {value: Math.round(100 * (n.sent + n.failed) / n.total), label: t('delivered')}) : null,
                h('div.stack', buttons))),
    ], {current: 'g:' + g.id, action: groupAction(g)});
}

// ---------------------------------------------------------------- subscribers

async function tabSubscribers(g, body) {
    const state = {status: 'active', lang: '', q: '', page: 0};
    const table = h('div.tbl');
    const pager = h('div.pager');
    const counts = g.subscribers;
    const statusSel = select([['active', t('st_sub_active')], ['pending', t('st_sub_pending')], ['unsubscribed', t('st_sub_unsubscribed')], ['', t('all')]], 'active', {
        size: 'sm', 'aria-label': t('status'), onchange: (ev) => {
            state.status = ev.target.value;
            state.page = 0;
            load();
        }
    });
    const langSel = g.langs.length > 1 ? select([['', t('all_langs')], ...g.langs.map((l) => [l, LANG_NAMES[l] || l])], '', {
        size: 'sm', 'aria-label': t('lang'), onchange: (ev) => {
            state.lang = ev.target.value;
            state.page = 0;
            load();
        }
    }) : null;
    let timer;
    const search = input({
        type: 'search', size: 'sm', placeholder: t('search_email'), 'aria-label': t('search_email'), oninput: (ev) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                state.q = ev.target.value;
                state.page = 0;
                load();
            }, 300);
        }
    });
    search.prepend(icon('search', {slot: 'prefix'}));
    const admin = atLeast(g.role, 'admin');

    async function load() {
        put(table, loading());
        try {
            const r = await api('sub.list', null, new URLSearchParams({group: g.id, ...state}).toString());
            if (!r.subscribers.length) {
                put(pager);
                return put(table, empty('users', t('no_subscribers'), ''));
            }
            put(table, h('sav-table', {hover: true}, h('table',
                h('thead', h('tr', [t('email'), t('lang'), t('browser'), t('source'), t('since'), t('status'), admin ? '' : null].filter((x) => x !== null).map((c) => h('th', c)))),
                h('tbody', r.subscribers.map((s) => h('tr',
                    h('td', h('strong', s.email), s.reason && s.status === 'unsubscribed' ? h('div.muted.small', t('reason') + ': ' + reasonText(s.reason)) : null),
                    h('td', LANG_NAMES[s.lang] || s.lang, s.browserLang && s.browserLang !== s.lang ? h('div.muted.small', t('browser_lang') + ': ' + s.browserLang) : null),
                    h('td', s.browser || '—'), h('td', t('src_' + s.source)),
                    h('td', fmtDate(s.confirmedAt || s.createdAt, g.timezone, false)),
                    h('td', badge(t('st_sub_' + s.status), SUB_VARIANT[s.status]), s.unsubscribedAt ? h('div.muted.small', fmtDate(s.unsubscribedAt, g.timezone, false)) : null),
                    admin ? h('td.num', iconBtn('trash', t('erase'), async () => {
                        if (!(await confirmDialog(t('erase_title'), t('erase_text', {email: s.email}), t('erase'), true))) return;
                        await api('sub.remove', {group: g.id, id: s.id}).catch(failToast);
                        load();
                    }, '.danger-ico')) : null))))));
            const pg = r.total > r.pageSize ? h('sav-pagination', {total: r.total, 'page-size': r.pageSize, page: state.page + 1, size: 'sm'}) : null;
            if (pg) pg.addEventListener('sav-page', (ev) => {
                state.page = ev.detail.page - 1;
                load();
            });
            put(pager, h('span.muted.small', t('n_results', {n: r.total})), h('div.spacer'), pg);
        } catch (e) {
            put(table, alert(errText(e), 'danger'));
        }
    }

    const byLang = Object.entries(counts.byLang).sort((a, b) => b[1] - a[1]);
    put(body,
        h('div.stats', stat(t('stat_active'), counts.active, 'users'), stat(t('stat_pending'), counts.pending, 'clock'), stat(t('stat_unsub'), counts.unsubscribed, 'ban')),
        byLang.length > 1 ? h('sav-card.langchart', h('sav-chart-bar', {
            label: t('stat_active'), orientation: 'horizontal', 'show-values': true, 'no-legend': true, height: String(40 + byLang.length * 34),
            data: JSON.stringify({labels: byLang.map(([l]) => LANG_NAMES[l] || l), series: [{name: t('stat_active'), values: byLang.map(([, n]) => n)}]})
        })) : null,
        h('div.hhead.sub', h('h2', t('tab_subscribers')), h('div.spacer'), admin ? [
            g.status === 'active' ? btn(t('import_csv'), {icon: 'upload', size: 'sm', onclick: () => importDialog(g)}) : null,
            btn(t('export_csv'), {icon: 'download', size: 'sm', href: 'api/?r=sub.export&group=' + g.id, download: ''})] : null),
        h('div.filters', statusSel, langSel, search),
        table, pager,
        h('p.muted.small', t('subscribers_note')));
    load();
}

/** CSV text -> rows of cells. Comma, semicolon or tab (the most frequent in the first line), quotes as in RFC 4180. */
function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (c === '"') quoted = false; else cell += c;
        } else if (c === '"') quoted = true;
        else if (c === delim) {
            row.push(cell);
            cell = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else cell += c;
    }
    if (cell !== '' || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''));
}

/** Rows of a CSV -> [{email, lang}]: uses the "email" and "lang/language/lingua" columns of a header, else any cell with an @. */
function csvSubscribers(rows) {
    if (!rows.length) return [];
    const head = rows[0].map((x) => x.toLowerCase());
    const ei = head.findIndex((x) => /^e-?mail/.test(x) || x === 'indirizzo email');
    const li = head.findIndex((x) => ['lang', 'language', 'lingua', 'locale'].includes(x));
    const data = ei >= 0 ? rows.slice(1) : rows;
    return data.map((r) => ({email: ei >= 0 ? r[ei] || '' : r.find((x) => x.includes('@')) || '', lang: li >= 0 ? r[li] || '' : ''})).filter((x) => x.email !== '');
}

/** Import subscribers from a CSV file (sav-dropzone): they skip the confirmation email, so the admin declares they agreed. */
function importDialog(g) {
    let rows = [];
    const zone = h('sav-dropzone', {accept: '.csv,text/csv,text/plain', 'max-size': '2000000', help: t('import_format')});
    const info = h('p.muted.small');
    const consent = check(t('import_consent'), false, null, {help: t('import_consent_hint')});
    const lang = g.langs.length > 1 ? select(g.langs.map((l) => [l, LANG_NAMES[l] || l]), g.langs[0]) : null;
    const result = h('div');
    const read = async (f) => {
        if (!f) return;
        if (f.size > 2_000_000) return toast(t('err_import_too_big'), 'err');
        rows = csvSubscribers(parseCsv(await f.text()));
        put(info, h('strong', f.name), ' · ', t('import_found', {n: rows.length}),
            rows.length ? h('span', ' · ', rows.slice(0, 3).map((r) => r.email).join(', '), rows.length > 3 ? '…' : '') : null);
    };
    zone.addEventListener('change', () => read(zone.files && zone.files[0]));
    zone.addEventListener('sav-drop', (ev) => read(ev.detail && ev.detail.files ? ev.detail.files[0] : zone.files && zone.files[0]));
    modal(t('import_title'), h('div.form', h('p', t('import_text')), zone, info, lang ? field(t('import_lang'), lang, t('import_lang_hint')) : null, consent, result), [
        {label: t('close'), onclick: () => groupPage(g.id, 'subscribers')},
        {
            label: t('import_go'), primary: true, icon: 'upload', onclick: async () => {
                if (!rows.length) return put(result, alert(t('err_import_empty'), 'danger')) && false;
                if (!consent.checked) return put(result, alert(t('err_consent_required'), 'danger')) && false;
                try {
                    const x = (await api('sub.import', {group: g.id, rows, consent: true, lang: lang ? lang.value : null})).report;
                    put(result, alert(t('import_details', {added: x.added, confirmed: x.confirmed, already: x.already, unsub: x.unsubscribed, invalid: x.invalid}), 'success', {heading: t('import_done', {n: x.added + x.confirmed})}));
                    rows = [];
                } catch (e) {
                    put(result, alert(errText(e), 'danger'));
                }
                return false;
            }
        },
    ]);
}

function reasonText(r) {
    const [code, ...rest] = r.split(': ');
    const known = ['too_many', 'not_relevant', 'never', 'other', 'one-click'];
    return (known.includes(code) ? t('reason_' + code.replace('-', '_')) : code) + (rest.length ? ': ' + rest.join(': ') : '');
}

// ---------------------------------------------------------------- templates

async function tabTemplates(g, body) {
    const r = await api('tpl.list', null, 'group=' + g.id);
    const favs = r.favorites || [];
    const builtinGrid = h('div.grid.tpls');
    const pub = atLeast(g.role, 'publisher');
    const writer = atLeast(g.role, 'moderator') && g.status === 'active';
    const useTpl = async (id) => {
        const n = (await api('nl.create', {group: g.id, template: String(id)})).newsletter;
        go('#/g/' + g.id + '/n/' + n.id);
    };
    /** A group template made from a built-in one (or another group template), opened in the editor. */
    const newTemplate = async (name, doc) => {
        const res = await api('tpl.save', {group: g.id, name, doc});
        go('#/g/' + g.id + '/t/' + res.id);
    };
    const pickBase = () => {
        let chosen = r.builtin[0].id;
        const all = [...r.builtin.map((b) => ({id: b.id, name: b.name, desc: b.description, doc: b.doc})),
            ...r.own.map((o) => ({id: String(o.id), name: o.name, desc: o.author ? t('by', {name: o.author}) : '', doc: o.doc}))];
        const name = input({maxlength: 80, placeholder: t('template_name'), autofocus: true});
        const grid = tplChoice(all, chosen, t('start_from'), (id) => {
            chosen = id;
        });
        modal(t('new_template'), h('div.form', field(t('template_name'), name), grid), [
            {label: t('cancel')},
            {
                label: t('create'), primary: true, icon: 'plus', onclick: async () => {
                    const base = all.find((x) => x.id === chosen);
                    try {
                        await newTemplate(name.value.trim() || base.name, base.doc);
                    } catch (e) {
                        failToast(e);
                        return false;
                    }
                }
            },
        ], {wide: true});
    };
    const ownFoot = (o) => writer ? [
        btn(t('use'), {icon: 'plus', size: 'sm', onclick: () => useTpl(o.id)}),
        btn(t('edit'), {icon: 'layout', size: 'sm', appearance: 'ghost', href: '#/g/' + g.id + '/t/' + o.id}),
        h('div.spacer'),
        (pub || o.author === S.user.name) ? iconBtn('trash', t('delete'), async () => {
            if (!(await confirmDialog(t('delete_tpl_title'), t('delete_tpl_text', {name: o.name}), t('delete'), true))) return;
            await api('tpl.delete', {group: g.id, id: o.id}).catch(failToast);
            groupPage(g.id, 'templates');
        }, '.danger-ico') : null] : null;
    put(body,
        h('div.hhead.sub', h('h2', t('tab_templates')), h('div.spacer'), writer ? primary(t('new_template'), {icon: 'plus', size: 'sm', onclick: pickBase}) : null),
        h('p.muted', t('templates_text')),
        h('h3.sub-title', t('own_templates')),
        r.own.length ? h('div.grid.tpls', r.own.map((o) => tplCard(String(o.id), o.name, (o.author ? t('by', {name: o.author}) + ' · ' : '') + fmtDate(o.updatedAt, g.timezone, false), o.doc, {foot: ownFoot(o)})))
            : empty('layout', t('no_templates'), '', writer ? btn(t('new_template'), {icon: 'plus', onclick: pickBase}) : null),
        h('h3.sub-title', t('builtin_templates')),
        builtinGrid);
    drawBuiltin();

    function drawBuiltin() {
        put(builtinGrid, sortedBuiltin(r.builtin, favs).map((b) => tplCard(b.id, b.name, b.description, b.doc, {
            star: favStar(b.id, favs, drawBuiltin),
            foot: writer ? [btn(t('use'), {icon: 'plus', size: 'sm', onclick: () => useTpl(b.id)}), btn(t('customize'), {icon: 'palette', size: 'sm', appearance: 'ghost', onclick: () => newTemplate(b.name, b.doc)})] : null
        })));
    }
}

/** A group template in the editor (template mode: no subject, no sending). */
async function templatePage(gid, tid) {
    put(app, loading());
    let g, r;
    try {
        [g, r] = await Promise.all([cache.group && cache.group.id === gid ? cache.group : loadGroup(gid), api('tpl.list', null, 'group=' + gid)]);
    } catch (e) {
        return failPage(e, '#/g/' + gid + '/templates', {current: 'g:' + gid});
    }
    const tpl = r.own.find((o) => o.id === tid);
    if (!tpl || !atLeast(g.role, 'moderator') || g.status !== 'active') return failPage({code: 'not_found'}, '#/g/' + gid + '/templates', {current: 'g:' + gid});
    document.title = tpl.name + ' · SavNewsletters';
    put(app, h('div.editor-root'));
    editorView(app.firstChild, {group: g, tpl: {id: tpl.id, name: tpl.name, doc: tpl.doc}, role: g.role, onBack: () => go('#/g/' + gid + '/templates')});
}

// ---------------------------------------------------------------- members

async function tabMembers(g, body) {
    const r = await api('member.list', null, 'group=' + g.id);
    const admin = atLeast(g.role, 'admin');
    const owner = g.role === 'owner';
    const assignable = owner ? ['user', 'moderator', 'publisher', 'admin'] : ['user', 'moderator', 'publisher'];
    const rows = r.members.map((m) => {
        const self = m.id === S.user.id;
        const editable = admin && !self && m.role !== 'owner' && (owner || rank(m.role) < rank('admin'));
        const roleCell = editable ? select([...assignable.map((x) => [x, t('role_' + x)]), ...(owner ? [['owner', t('make_owner')]] : [])], m.role, {
            size: 'sm', 'aria-label': t('role'), onchange: async (ev) => {
                const el = ev.target;
                const v = el.value;
                if (v === 'owner' && !(await confirmDialog(t('transfer_title'), t('transfer_text', {name: m.name}), t('transfer'), true))) {
                    el.value = m.role;
                    return;
                }
                try {
                    await api('member.role', {group: g.id, user: m.id, role: v});
                    toast(t('saved'));
                    if (v === 'owner') groupPage(g.id, 'members');
                } catch (e) {
                    failToast(e);
                    el.value = m.role;
                }
            }
        }) : roleBadge(m.role);
        return h('tr', h('td', h('div.who', h('sav-avatar', {label: m.name, style: 'background:hsl(' + hue(m.name) + ' 48% 38%);color:#fff;border-radius:50%;--sav-avatar-size:34px'}),
                h('div', h('strong', m.name + (self ? ' (' + t('you') + ')' : '')), h('div.muted.small', m.email)))),
            h('td', roleCell), h('td.muted.small', fmtDate(m.since, g.timezone, false)),
            h('td.num', editable ? iconBtn('trash', t('remove'), async () => {
                if (!(await confirmDialog(t('remove_member_title'), t('remove_member_text', {name: m.name}), t('remove'), true))) return;
                await api('member.remove', {group: g.id, user: m.id}).catch(failToast);
                groupPage(g.id, 'members');
            }, '.danger-ico') : null));
    });
    const email = input({type: 'email', placeholder: 'name@example.com', label: t('add_member')});
    const role = select(assignable.map((x) => [x, t('role_' + x)]), 'moderator', {label: t('role')});
    const add = primary(t('add'), {
        icon: 'plus', onclick: async () => {
            const res = await api('member.add', {group: g.id, email: email.value, role: role.value});
            toast(t(res.joined ? 'member_added' : 'invite_sent'));
            groupPage(g.id, 'members');
        }
    });
    email.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') add.click();
    });
    put(body,
        h('div.hhead.sub', h('h2', t('tab_members'))),
        admin && g.status === 'active' ? h('sav-card.add-member', h('div.add-row', email, role, add)) : null,
        h('sav-table', {hover: true}, h('table', h('tbody', rows))),
        r.invites.length ? [h('h3.sub-title', t('invites')), h('p.muted.small', t('invites_text')), h('sav-table', h('table', h('tbody', r.invites.map((i) => h('tr',
            h('td', h('strong', i.email)), h('td', roleBadge(i.role)), h('td.muted.small', fmtDate(i.since, g.timezone, false)),
            h('td.num', iconBtn('x', t('cancel_invite'), async () => {
                await api('invite.cancel', {group: g.id, id: i.id}).catch(failToast);
                groupPage(g.id, 'members');
            })))))))] : null,
        h('h3.sub-title', t('roles_title')),
        h('div.roles-grid', ROLES.map((x) => h('sav-card.role-card' + (x === g.role ? '.on' : ''), roleBadge(x), h('p.small', t('role_' + x + '_text'))))),
        g.role !== 'owner' ? h('p', btn(t('leave'), {
            icon: 'logout', appearance: 'ghost', variant: 'danger', onclick: async () => {
                if (!(await confirmDialog(t('leave_title'), t('leave_text', {group: g.name}), t('leave'), true))) return;
                await api('group.leave', {group: g.id});
                cache.groups = null;
                go('#/');
            }
        })) : null);
}

// ---------------------------------------------------------------- share (links and widget)

function tabShare(g, body) {
    const embed = `<div data-savnewsletters="${g.slug}"></div>\n<script src="${g.links.widget}" async></script>`;
    const frame = h('iframe.widget-preview', {src: 'subscribe.php?embed=1&g=' + encodeURIComponent(g.slug), title: t('widget_preview')});
    window.addEventListener('message', function onMsg(ev) {
        if (!document.body.contains(frame)) return window.removeEventListener('message', onMsg);
        if (ev.source === frame.contentWindow && ev.data && (ev.data.savnewsletters || ev.data.opennewsletter) === 'height') frame.style.height = ev.data.height + 'px';
    });
    put(body,
        h('div.hhead.sub', h('h2', t('tab_share'))),
        !g.sendingReady ? alert(t('share_not_ready'), 'warning', {icon: 'mail'}) : null,
        h('div.sgrid',
            scard('link', t('subscribe_link'), t('subscribe_link_text'), copyBox(g.links.subscribe, false, g.links.subscribe),
                g.langs.length > 1 ? h('p.muted.small', t('lang_param'), ' ', h('code', '&lang=' + g.langs[1])) : null),
            scard('ban', t('unsubscribe_link'), t('unsubscribe_link_text'), copyBox(g.links.unsubscribe, false, g.links.unsubscribe))),
        scard('code', t('widget'), t('widget_text'), h('div.split', h('div.form', copyBox(embed, true), h('p.muted.small', t('widget_attrs'))), h('div.widget-stage', frame))));
}

// ---------------------------------------------------------------- settings (admins)

function tabSettings(g, body) {
    const admin = atLeast(g.role, 'admin');
    const saveBtn = (fn, label = t('save')) => primary(label, {
        icon: 'save', onclick: async () => {
            await fn();
            toast(t('saved'));
        }
    });
    const refresh = (r) => {
        cache.group = r.group;
        cache.groups = null;
        Object.assign(g, r.group);
    };

    // general
    const name = input({value: g.name, maxlength: 80});
    const slug = input({value: g.slug, maxlength: 40});
    const desc = input({value: g.description, maxlength: 300});
    const langs = [...g.langs];
    const tz = tzSelect(g.timezone);
    const general = scard('settings', t('general'), null, field(t('group_name'), name), field(t('group_slug'), slug, t('group_slug_change')), field(t('group_desc'), desc),
        field(t('sub_langs'), langChips(langs), t('sub_langs_hint')), field(t('timezone'), tz, t('timezone_hint')),
        h('div.prow', saveBtn(async () => {
            refresh(await api('group.update', {group: g.id, name: name.value, slug: slug.value, description: desc.value, langs, timezone: tz.value}));
            groupPage(g.id, 'settings');
        })));

    // sending (SMTP): the password never comes back from the server
    const s = g.smtp || {};
    const host = input({value: s.host || '', placeholder: 'smtp.example.com'});
    const port = input({type: 'number', value: s.port || 465, min: 1, max: 65535});
    const enc = select([['ssl', 'SSL/TLS (465)'], ['tls', 'STARTTLS (587)'], ['none', t('enc_none')]], s.encryption || 'ssl', {
        onchange: () => {
            if (!port.value || ['465', '587', '25'].includes(String(port.value))) port.value = String({ssl: 465, tls: 587, none: 25}[enc.value]);
        }
    });
    const user = input({value: s.user || '', autocomplete: 'off'});
    const pass = input({type: 'password', autocomplete: 'new-password', placeholder: s.hasPassword ? t('password_kept') : ''});
    const from = input({type: 'email', value: g.fromEmail, placeholder: 'news@example.com'});
    const fromName = input({value: g.fromName || g.name, maxlength: 80});
    const reply = input({type: 'email', value: g.replyTo || '', placeholder: t('optional')});
    const rate = input({type: 'number', min: 10, max: 5000, step: 10, value: g.ratePerHour || 200});
    const sending = scard('mail', t('sending'), t('sending_text'),
        g.sendingReady ? alert(h('span', t('sending_from', {email: g.fromEmail}), g.smtpCheckedAt ? h('span.muted', ' · ' + t('tested_on', {when: fmtDate(g.smtpCheckedAt, g.timezone)})) : null), 'success', {icon: 'check'}) : null,
        h('div.grid2', field(t('from_email'), from), field(t('from_name'), fromName)), field(t('reply_to'), reply),
        h('div.grid3', field(t('smtp_host'), host), field(t('smtp_enc'), enc), field(t('smtp_port'), port)),
        h('div.grid2', field(t('smtp_user'), user), field(t('smtp_password'), pass, t('smtp_password_hint'))),
        field(t('rate_per_hour'), rate, t('rate_hint')),
        h('div.prow.wrap-start',
            saveBtn(async () => {
                refresh(await api('group.smtp', {
                    group: g.id, host: host.value, encryption: enc.value, port: Number(port.value), user: user.value, password: pass.value,
                    fromEmail: from.value, fromName: fromName.value, replyTo: reply.value, ratePerHour: Number(rate.value)
                }));
                groupPage(g.id, 'settings');
            }),
            g.sendingReady ? btn(t('smtp_test'), {icon: 'send', onclick: () => smtpTestDialog(g, refresh)}) : null,
            g.sendingReady ? btn(t('smtp_clear'), {
                icon: 'trash', appearance: 'ghost', variant: 'danger', onclick: async () => {
                    if (!(await confirmDialog(t('smtp_clear_title'), t('smtp_clear_text'), t('smtp_clear'), true))) return;
                    refresh(await api('group.smtpClear', {group: g.id}));
                    groupPage(g.id, 'settings');
                }
            }) : null),
        h('p.muted.small', icon('shield'), ' ', t('smtp_privacy')));

    // subscription page and widget
    const p = {...g.page};
    const pv = h('iframe.widget-preview', {title: t('page_preview')});
    // live preview: the unsaved settings go to the page in the URL (it accepts them only from the group's admins)
    let pvTimer;
    const reloadPv = () => {
        clearTimeout(pvTimer);
        pvTimer = setTimeout(() => {
            const data = btoa(unescape(encodeURIComponent(JSON.stringify(p))));
            pv.src = 'subscribe.php?embed=1&g=' + encodeURIComponent(g.slug) + '&lang=' + getLang() + '&preview=' + encodeURIComponent(data);
        }, 350);
    };
    window.addEventListener('message', function onMsg(ev) {
        if (!document.body.contains(pv)) return window.removeEventListener('message', onMsg);
        if (ev.source === pv.contentWindow && ev.data && (ev.data.savnewsletters || ev.data.opennewsletter) === 'height') pv.style.height = ev.data.height + 'px';
    });
    /** A field of the page bound to p[k]: text fields while typing, choices when they change. */
    const bind = (k, el, prop = 'value') => {
        const live = /^sav-(input|textarea|color-picker)$/.test(el.localName);
        el.addEventListener(live ? 'input' : 'change', () => {
            p[k] = prop === 'checked' ? el.checked : el.value;
            reloadPv();
        });
        if (live) el.addEventListener('change', () => {
            p[k] = el.value;
            reloadPv();
        });
        return el;
    };
    const logoBox = h('div.logo-box');
    const drawLogo = () => put(logoBox,
        p.logo ? h('img', {src: p.logo.startsWith('img:') ? 'api/?r=img&id=' + p.logo.slice(4) : p.logo, alt: ''}) : h('span.muted.small', t('no_logo')),
        logoUpload(g, (src) => {
            p.logo = src;
            drawLogo();
            reloadPv();
        }),
        p.logo ? iconBtn('trash', t('delete'), () => {
            p.logo = '';
            drawLogo();
            reloadPv();
        }, '.danger-ico') : null);
    drawLogo();
    const accent = bind('accent', h('sav-color-picker', {value: p.accent, swatches: '#C2307A,#0E8A6A,#E2553B,#D97706,#2563EB,#5B3DF5,#111827'}));
    const pageSec = h('sav-card.scard.wide', h('div.shead', icon('palette'), h('h3', t('page_custom'))), h('p.muted.small', t('page_custom_text')),
        h('div.split',
            h('div.form',
                field(t('page_title'), bind('title', input({value: p.title, maxlength: 120, placeholder: t('sub_title_default', {group: g.name})}))),
                field(t('page_intro'), bind('intro', textarea({rows: 3, maxlength: 600, placeholder: g.description || t('sub_intro_default')}, p.intro))),
                h('div.grid2', field(t('page_button'), bind('button', input({value: p.button, maxlength: 40, placeholder: t('subscribe')}))), field(t('accent'), accent)),
                field(t('page_success'), bind('success', input({value: p.success, maxlength: 400, placeholder: t('page_success_ph')}))),
                field(t('page_style'), stylePicker(p.style, (v) => {
                    p.style = v;
                    reloadPv();
                })),
                field(t('logo'), logoBox),
                field(t('page_font'), fontPicker(p.font || 'inter', (v) => {
                    p.font = v;
                    reloadPv();
                })),
                h('div.grid2', field(t('page_theme'), bind('theme', select([['light', t('theme_light')], ['dark', t('theme_dark')], ['auto', t('theme_auto')]], p.theme))),
                    field(t('page_shape'), bind('shape', select([['round', t('shape_round')], ['soft', t('shape_soft')], ['square', t('shape_square')]], p.shape)))),
                bind('showLang', check(t('show_lang'), p.showLang, null, {switch: true}), 'checked'),
                bind('showCount', check(t('show_count'), p.showCount, null, {switch: true}), 'checked'),
                h('div.prow', saveBtn(async () => {
                    refresh(await api('group.page', {group: g.id, page: p}));
                    reloadPv();
                }))),
            h('div.preview-col', h('sav-label', {appearance: 'plain', case: 'normal', variant: 'neutral'}, t('page_preview')), h('div.widget-stage', pv))));
    reloadPv();

    // terms
    const terms = textarea({rows: 8, maxlength: 20000, placeholder: t('terms_ph'), resize: 'vertical'}, g.terms);
    const termsSec = scard('shield', t('group_terms'), t('group_terms_text'), terms, h('div.prow', saveBtn(async () => refresh(await api('group.terms', {group: g.id, terms: terms.value})))));

    // danger zone
    const danger = g.role === 'owner' ? scard('trash', t('danger'), t('danger_text'), h('div.prow', btn(t('delete_group'), {
        icon: 'trash', variant: 'danger', appearance: 'solid', onclick: () => {
            const c = input({placeholder: g.name});
            modal(t('delete_group'), h('div.form', h('p', t('delete_group_text', {name: g.name})), field(t('type_name'), c)), [{label: t('cancel')}, {
                label: t('delete_group'), danger: true, onclick: async () => {
                    try {
                        await api('group.delete', {group: g.id, confirm: c.value});
                        cache.groups = null;
                        go('#/');
                        toast(t('group_deleted'));
                    } catch (e) {
                        failToast(e);
                        return false;
                    }
                }
            }]);
        }
    }))) : null;
    if (danger) danger.classList.add('danger-card');

    put(body, h('div.hhead.sub', h('h2', t('tab_settings'))), admin ? [h('div.sgrid', sending, general), pageSec, h('div.sgrid', termsSec, danger)] : null);
}

/**
 * Typefaces of the subscription page and widget (PAGE_FONTS in lib/groups.php): key, name, CSS family used to draw
 * the card (the "ON …" families are declared in app.css and downloaded only when a card shows them).
 */
const PAGE_FONTS = [
    ['inter', 'Inter + Poppins', 'Poppins, Inter, sans-serif'], ['poppins', 'Poppins', 'Poppins, sans-serif'],
    ['montserrat', 'Montserrat', '"ON Montserrat", sans-serif'], ['opensans', 'Open Sans', '"ON Open Sans", sans-serif'],
    ['sourcesans', 'Source Sans 3', '"ON Source Sans", sans-serif'], ['lora', 'Lora', '"ON Lora", Georgia, serif'],
    ['playfair', 'Playfair Display', '"ON Playfair", Georgia, serif'],
    ['system', 'System', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'],
    ['georgia', 'Georgia', 'Georgia, "Times New Roman", serif'], ['mono', 'Monospace', 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace'],
];

/** Typeface cards: each one is written in its own font, so it is seen before choosing. */
function fontPicker(value, onPick) {
    return cardChoice(PAGE_FONTS.map(([k, name, family]) => [k, h('span.font-sample', {style: {fontFamily: family}}, 'Aa'), h('span', {style: {fontFamily: family}}, name), name]), value, onPick, 'fonts');
}

/** The five looks of the subscription page and widget, as small drawings. */
function stylePicker(value, onPick) {
    return cardChoice(['card', 'minimal', 'outline', 'bold', 'compact'].map((st) => [st, h('span.style-art.art-' + st, h('i'), h('i'), h('b')), t('style_' + st)]), value, onPick, 'styles');
}

/** "Verify it works": a real email from the group's outgoing address to an address of the admin's choice. */
function smtpTestDialog(g, refresh) {
    const to = input({type: 'email', value: S.user.email, autocomplete: 'email', autofocus: true});
    const result = h('div');
    modal(t('smtp_test_title'), h('div.form', h('p.muted', t('smtp_test_text', {from: g.fromEmail})), field(t('smtp_test_to'), to), result), [
        {label: t('close')},
        {
            label: t('smtp_test_send'), primary: true, icon: 'send', onclick: async () => {
                put(result, h('div.prow', h('sav-spinner'), h('span.muted', t('smtp_test_sending'))));
                try {
                    const r = await api('group.smtpTest', {group: g.id, to: to.value.trim()});
                    refresh(r);
                    put(result, alert(t('smtp_test_ok_hint'), 'success', {heading: t('smtp_test_ok', {email: r.to})}));
                } catch (e) {
                    put(result, alert(h('span', errText(e), e.detail ? h('code.small', ' ' + e.detail) : null), 'danger', {heading: t('smtp_test_failed')}));
                }
                return false; // stays open: the result is shown here
            }
        },
    ]);
}

function logoUpload(g, onDone) {
    const file = h('input', {type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true});
    const b = btn(t('upload'), {icon: 'upload', size: 'sm', onclick: () => file.click()});
    file.addEventListener('change', async () => {
        const f = file.files[0];
        if (!f) return;
        b.loading = true;
        try {
            const data = await new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(1, 600 / img.width);
                    const c = document.createElement('canvas');
                    c.width = Math.round(img.width * scale);
                    c.height = Math.round(img.height * scale);
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    res(c.toDataURL('image/png'));
                };
                img.onerror = rej;
                img.src = URL.createObjectURL(f);
            });
            onDone((await api('img.upload', {group: g.id, data})).src);
        } catch (e) {
            failToast(e.code ? e : {code: 'image_invalid'});
        } finally {
            b.loading = false;
            file.value = '';
        }
    });
    return h('span', b, file);
}

// ---------------------------------------------------------------- account

function accountPage() {
    const u = S.user;
    const name = input({value: u.name, maxlength: 80});
    const cur = input({type: 'password', autocomplete: 'current-password'});
    const pw = input({type: 'password', autocomplete: 'new-password', minlength: 8});
    const del = scard('trash', t('delete_account'), t('delete_account_text'), h('div.prow', btn(t('delete_account'), {
        icon: 'trash', variant: 'danger', appearance: 'solid', onclick: () => {
            const p = input({type: 'password'});
            modal(t('delete_account'), h('div.form', h('p', t('delete_account_confirm')), u.hasPassword ? field(t('password'), p) : null), [{label: t('cancel')}, {
                label: t('delete_account'), danger: true, onclick: async () => {
                    try {
                        await api('auth.delete', {password: p.value});
                        S.user = null;
                        go('#/');
                    } catch (e) {
                        failToast(e);
                        return false;
                    }
                }
            }]);
        }
    })));
    del.classList.add('danger-card');
    shell([
        pageHead(t('account'), u.email),
        h('div.sgrid',
            scard('user', t('profile'), null,
                field(t('email'), input({value: u.email, disabled: true}), t('email_fixed')),
                field(t('your_name'), name),
                field(t('app_lang'), langSwitch()),
                h('div.prow.wrap-start', primary(t('save'), {
                    icon: 'save', onclick: async () => {
                        setUser((await api('auth.profile', {name: name.value, lang: getLang()})).user);
                        toast(t('saved'));
                    }
                }), window.Identity ? btn(Identity.text('methods'), {icon: 'shield', onclick: Identity.methods}) : null),
                null),
            scard('shield', t(u.hasPassword ? 'change_password' : 'set_password'), u.hasPassword ? null : t('set_password_text'),
                u.hasPassword ? field(t('current_password'), cur) : null,
                field(t('new_password'), pw, t('password_hint')),
                h('div.prow', primary(t('save'), {
                    icon: 'save', onclick: async () => {
                        setUser((await api('auth.password', {current: cur.value, password: pw.value})).user);
                        cur.value = pw.value = '';
                        toast(t('saved'));
                    }
                }))),
            del),
    ], {current: 'account'});
}

// ---------------------------------------------------------------- master admin

async function masterPage() {
    shell(loading(), {current: 'master'});
    let r;
    try {
        r = await api('master.overview');
    } catch (e) {
        return failPage(e, '#/', {current: 'master'});
    }
    const q = input({type: 'search', size: 'sm', placeholder: t('search_groups'), 'aria-label': t('search_groups')});
    q.prepend(icon('search', {slot: 'prefix'}));
    const tbody = h('tbody');
    const draw = () => {
        const v = String(q.value || '').toLowerCase();
        const rows = r.groups.filter((g) => !v || (g.name + ' ' + g.slug + ' ' + (g.ownerEmail || '')).toLowerCase().includes(v));
        if (!rows.length) return put(tbody, emptyRow(8, v ? t('no_results') : t('no_groups')));
        put(tbody, rows.map((g) => h('tr', {class: 'click', onclick: () => go('#/master/g/' + g.id)},
            h('td', h('strong', g.name), h('div.muted.small', g.slug)), h('td', g.owner || '—', h('div.muted.small', g.ownerEmail || '')),
            h('td', g.fromEmail ? h('span.mono.small', g.fromEmail) : h('span.muted.small', t('not_configured'))),
            h('td.num', String(g.members)), h('td.num', String(g.subscribers)), h('td.num', String(g.sent)), h('td.num', String(g.upcoming)),
            h('td', badge(t('gst_' + g.status), g.status === 'active' ? 'success' : 'danger')))));
    };
    q.addEventListener('input', draw);
    q.addEventListener('sav-clear', draw);
    draw();
    shell([
        pageHead(t('master_title'), t('master_text')),
        h('div.stats', stat(t('m_users'), r.totals.users, 'user'), stat(t('m_groups'), r.totals.groups, 'layout'), stat(t('stat_active'), r.totals.subscribers, 'users'), stat(t('m_sent'), r.totals.sent, 'send')),
        h('div.filters', q),
        h('sav-table', {hover: true, sortable: true}, h('table', h('thead', h('tr', [t('group'), t('owner'), t('from_email'), t('m_members'), t('m_subs'), t('m_nl_sent'), t('m_upcoming'), t('status')].map((c, i) => h('th', {class: i >= 3 && i <= 6 ? 'num' : null}, c)))), tbody)),
    ], {current: 'master'});
}

async function masterGroup(id) {
    shell(loading(), {current: 'master'});
    let r;
    try {
        r = await api('master.group', null, 'group=' + id);
    } catch (e) {
        return failPage(e, '#/master', {current: 'master'});
    }
    const g = r.group;
    const toggle = btn(t(g.status === 'active' ? 'suspend' : 'reactivate'), {
        icon: g.status === 'active' ? 'ban' : 'check', variant: g.status === 'active' ? 'danger' : 'primary', appearance: g.status === 'active' ? 'outline' : 'solid', onclick: async () => {
            const to = g.status === 'active' ? 'disabled' : 'active';
            if (to === 'disabled' && !(await confirmDialog(t('suspend_title'), t('suspend_text', {name: g.name}), t('suspend'), true))) return;
            await api('master.status', {group: g.id, status: to});
            masterGroup(id);
        }
    });
    const facts = [[t('group_slug'), g.slug], [t('status'), badge(t('gst_' + g.status), g.status === 'active' ? 'success' : 'danger')], [t('from_email'), g.fromEmail ? h('span.mono', g.fromEmail) : t('not_configured')],
        [t('from_name'), g.fromName || '—'], [t('sub_langs'), g.langs.map((l) => LANG_NAMES[l] || l).join(', ')], [t('timezone'), g.timezone],
        [t('created'), fmtDate(g.createdAt, g.timezone, false)], [t('subscribe_link'), h('a', {href: g.links.subscribe, target: '_blank'}, g.links.subscribe)]];
    shell([
        h('sav-breadcrumb', h('sav-breadcrumb-item', {href: '#/master'}, t('master')), h('sav-breadcrumb-item', g.name)),
        pageHead(g.name, g.description, toggle),
        alert(t('master_smtp_note'), 'protected', {icon: 'shield'}),
        h('div.stats', stat(t('stat_active'), g.subscribers.active, 'users'), stat(t('stat_pending'), g.subscribers.pending, 'clock'), stat(t('stat_unsub'), g.subscribers.unsubscribed, 'ban'), stat(t('m_members'), r.members.length, 'user')),
        h('div.sgrid',
            scard('settings', t('general'), null, h('dl.facts', facts.map(([k, v]) => [h('dt', k), h('dd', v)]))),
            scard('user', t('tab_members'), null, r.members.length ? h('sav-table', h('table', h('tbody', r.members.map((m) => h('tr', h('td', h('strong', m.name), h('div.muted.small', m.email)), h('td', roleBadge(m.role))))))) : h('p.muted.small', t('no_members'))),
            scard('ban', t('unsub_reasons'), null, r.reasons.length ? h('ul.reasons', r.reasons.map((x) => h('li', h('span', reasonText(x.unsub_reason)), h('strong', String(x.n))))) : h('p.muted.small', t('no_reasons')))),
        h('h2', t('tab_newsletters')),
        r.newsletters.length ? h('div.rows', r.newsletters.map((n) => h('sav-card.nlc', {
                interactive: true, role: 'button', tabindex: 0, onclick: async () => {
                    try {
                        previewDialog((await api('master.preview', null, 'id=' + n.id)).html, n.subject);
                    } catch (e) {
                        failToast(e);
                    }
                }
            }, h('div.nlc-main', h('b', n.subject || t('untitled')), h('small', n.author ? t('by', {name: n.author}) : '')),
            h('div.nlc-when', h('span', fmtDate(n.sentAt || n.scheduledAt || n.proposedAt || n.updatedAt, g.timezone))), h('div.nlc-num', n.total ? h('b', n.sent + '/' + n.total) : null), statusChip(n.status), h('span')))) : empty('mail', t('no_newsletters'), ''),
        h('h2', t('tab_subscribers')),
        r.subscribers.length ? h('sav-table', {hover: true}, h('table', h('thead', h('tr', [t('email'), t('lang'), t('browser'), t('source'), t('since'), t('status')].map((c) => h('th', c)))),
                h('tbody', r.subscribers.map((s) => h('tr', h('td', s.email, s.reason && s.status === 'unsubscribed' ? h('div.muted.small', reasonText(s.reason)) : null), h('td', LANG_NAMES[s.lang] || s.lang), h('td', s.browser || '—'),
                    h('td', t('src_' + s.source)), h('td', fmtDate(s.createdAt, g.timezone, false)), h('td', badge(t('st_sub_' + s.status), SUB_VARIANT[s.status])))))))
            : empty('users', t('no_subscribers'), ''),
    ], {current: 'master'});
}

/** A table row that says the list is empty (instead of a bare header that looks like it is still loading). */
function emptyRow(cols, text) {
    return h('tr', h('td.empty-cell', {colspan: cols}, text));
}

boot();
