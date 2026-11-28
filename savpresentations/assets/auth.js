/** Landing page, sign-in, registration, email confirmation, new password. */
import { heroDeck } from './hero.js';
import {$, api, btn, errText, go, h, icon, isApp, ok, oops, state} from './core.js';
import {lang, setLang, t} from './i18n.js';
import {VERSION} from './version.js';
import {signedIn} from './main.js';
import {slideNode} from './render.js';
import {context} from './themes.js';
import {makeSlide} from './layouts.js';

export const logo = (size = 34) => h('img', {src: 'icons/favicon.svg', width: size, height: size, alt: ''});
export const brand = () => h('a.brand', {
    href: './',
    'data-go': true
}, logo(), h('span', 'Sav', h('b', 'Presentations')));
/** The footer, the same of SavDocuments: Privacy · Terms · Illerom · by Saverio Morelli, and the language on the right. */
export const credit = () => h('footer.credit', h('a', {href: 'privacy.php'}, 'Privacy'), h('a', {href: 'terms.php'}, t('terms_short')),
    h('a', {href: 'https://www.illerom.eu/', rel: 'noopener'}, 'Illerom'),
    h('span', lang() === 'it' ? 'di ' : 'by ', h('a.sign', {href: 'https://www.saveriomorelli.com/', rel: 'noopener'}, 'Saverio Morelli')),
    // the version: it leads to the page of the changes
    h('a.vlink', {href: '?p=changelog', 'data-go': true, title: t('changelog')}, 'v' + VERSION),
    h('span.grow'), langSwitch());
/** Italian or English: kept in this browser and, when signed in, in the account. */
async function useLang(l) {
    setLang(l);
    localStorage.setItem('sp-lang', l);
    if (state.user) {
        try {
            const r = await api('auth.profile', {lang: l});
            state.user = r.user;
        } catch { /* only the language */
        }
    }
    dispatchEvent(new PopStateEvent('popstate'));
}
export const langSwitch = () => {
    const c = h('sav-language-choice', { 'sheet-on-mobile': true, include: 'it-IT en-GB', value: lang() === 'it' ? 'it-IT' : 'en-GB', 'native-names': '', 'no-code': '', size: 'sm', 'aria-label': t('language'), class: 'langs'});
    c.addEventListener('change', () => { const l = String(c.value || '').slice(0, 2); if (l && l !== lang()) useLang(l); });
    return c;
};
export const langButton = () => h('sav-button', {
    appearance: 'ghost',
    variant: 'neutral',
    size: 'sm',
    icon: 'languages',
    label: lang() === 'it' ? 'English' : 'Italiano',
    class: 'langb',
    onclick: () => useLang(lang() === 'it' ? 'en' : 'it')
}, h('span.lbl', lang() === 'it' ? 'English' : 'Italiano'));

// the other apps of SavOffice are a button away on the first page too, as in every app of the suite
const topBar = (...right) => h('header.ltop', brand(), h('div.spacer'), langButton(), h('savoffice-apps', {current: 'savpresentations'}), ...right);

export function landing(app) {
    document.body.classList.add('landing');
    const demo = h('div.l-stage', {'aria-hidden': 'true'});
    const themes = ['aurora', 'editorial', 'bauhaus', 'cotton', 'ocean', 'playful', 'violet'];
    const slides = themes.map((id, i) => {
        const ctx = context({format: {w: 1280, h: 720}, theme: {id}, opts: {}});
        const {d} = makeSlide('cover', ctx, {title: t('l_slide' + (i + 1)), subtitle: 'SavPresentations'});
        // the part that shows above the next slide is the top one: the title goes there
        Object.values(d.els).forEach((e) => {
            if (e.role === 'title') Object.assign(e, {
                y: 44,
                h: 120,
                va: 'middle',
                size: 74
            }); else Object.assign(e, {y: 590, h: 50});
        });
        const n = slideNode(d, ctx, {mode: 'thumb'});
        const w = h('div.l-card', {style: `--i:${i}`}, h('div.l-in', n));
        return w;
    });
    demo.append(...slides);
    const fit = () => slides.forEach((w) => {
        w.querySelector('.sl').style.transform = `scale(${w.clientWidth / 1280})`;
    });
    const ro = new ResizeObserver(fit);
    slides.forEach((s) => ro.observe(s));
    const feat = (ic, k) => h('div.feat', icon(ic), h('h3', t('f_' + k)), h('p', t('f_' + k + '_t')));
    app.append(topBar(btn(t('sign_in'), () => go('?signin=login'), {appearance: 'outline', variant: 'neutral'})),
        h('main.lmain', h('section.hero', h('div.hero-t', h('h1', t('l_title')), h('p', t('l_text')), h('div.row', btn(t('l_cta'), () => go('?signin=register'), {size: 'lg'}), btn(t('sign_in'), () => go('?signin=login'), {
                size: 'lg',
                appearance: 'ghost',
                variant: 'neutral'
            })), h('small', t('l_small'), ' ', h('a', {href: '?p=local', 'data-go': true}, t('l_local')))), demo),
            h('section.feats', feat('users', 'live'), feat('layout-template', 'themes'), feat('images', 'search'), feat('shield', 'share'), feat('sticky-note', 'notes'), feat('download', 'files'))), credit());
    const stopDeck = heroDeck(demo, slides);
    return {
        leave: () => {
            ro.disconnect();
            stopDeck();
        }
    };
}

function shell(app, ...kids) {
    document.body.classList.add('authp');
    app.append(topBar(), h('main.amain', h('sav-card.acard', {appearance: 'elevated'}, ...kids)), credit());
}

const termsText = () => h('span', t('accept_1'), ' ', h('a', {
    href: 'terms.php',
    target: '_blank'
}, t('terms')), ' ', t('accept_2'), ' ', h('a', {
    href: 'privacy.php',
    target: '_blank'
}, t('privacy')), '. ', t('accept_3'));

function failedLogin(e) {
    const box = $('.aerr');
    const msg = e.code === 'blocked' && e.data.reason ? t('err_blocked_why', {reason: t('reason_' + e.data.reason)}) : errText(e);
    if (box) {
        box.replaceChildren(h('sav-alert', {variant: 'danger'}, msg));
        box.scrollIntoView({block: 'nearest'});
    } else oops(e);
}

export function authScreen(app, {mode = 'login', note = ''} = {}) {
    const register = mode === 'register', forgot = mode === 'forgot';
    const name = h('sav-input', {label: t('name'), autocomplete: 'name', maxlength: 80});
    const email = h('sav-input', {
        label: t('email'),
        type: 'email',
        autocomplete: 'username',
        inputmode: 'email',
        maxlength: 190
    });
    const pw = register ? h('sav-password', {
        label: t('password'),
        autocomplete: 'new-password',
        'min-uppercase': 0,
        'min-digits': 0,
        'min-lowercase': 0,
        labels: t('pw_labels')
    }) : h('sav-input', {
        label: t('password'),
        type: 'password',
        'password-toggle': true,
        autocomplete: 'current-password'
    });
    const terms = h('sav-checkbox', termsText());
    const submit = btn(forgot ? t('send_link') : register ? t('create_account') : t('sign_in'), () => send(), {
        block: true,
        size: 'lg'
    });
    const sav = forgot ? null : window.Identity?.button(state.config.savAccount) || null;
    const body = h('div.aform', {
            onkeydown: (e) => {
                if (e.key === 'Enter') send();
            }
        },
        h('h1', forgot ? t('forgot') : register ? t('register_title') : t('login_title')), note && h('sav-alert', note), h('div.aerr'),
        register && name, email, !forgot && pw, register && terms, submit,
        !forgot && sav && h('div.or', h('span', t('or'))), !forgot && sav,
        h('div.alinks', mode === 'login' || !mode ? [h('a', {
            href: '?signin=forgot',
            'data-go': true
        }, t('forgot_q')), h('a', {
            href: '?signin=register',
            'data-go': true
        }, t('no_account'))] : h('a', {href: '?signin=login', 'data-go': true}, t('have_account'))));
    const send = async () => {
        if (submit.loading) return;
        submit.loading = true;
        try {
            if (forgot) {
                await api('auth.forgot', {email: email.value, lang: lang()});
                body.replaceChildren(h('h1', t('check_mail')), h('p', t('forgot_sent')), h('div.alinks', h('a', {
                    href: '?signin=login',
                    'data-go': true
                }, t('sign_in'))));
            } else if (register) {
                await api('auth.register', {
                    name: name.value,
                    email: email.value,
                    password: pw.value,
                    acceptTerms: terms.checked,
                    lang: lang()
                });
                body.replaceChildren(h('div.bigicon', icon('mail')), h('h1', t('check_mail')), h('p', t('verify_sent', {email: email.value})), h('div.alinks', h('a', {
                    href: '?signin=login',
                    'data-go': true
                }, t('sign_in'))));
            } else signedIn(await api('auth.login', {email: email.value, password: pw.value}));
        } catch (e) {
            failedLogin(e);
        }
        submit.loading = false;
    };
    shell(app, body);
    setTimeout(() => (register ? name : email).focus?.(), 80);
}

export function confirmScreen(app) {
    shell(app, h('div.aform', h('div.bigicon', icon('mail')), h('h1', t('check_mail')), h('p', t('verify_sent', {email: state.user.email})), h('div.aerr'),
        btn(t('resend'), async (e) => {
            try {
                await api('auth.resend', {lang: lang()});
                ok(t('sent'));
            } catch (x) {
                oops(x);
            }
        }, {block: true}),
        btn(t('verified_done'), () => location.assign('./'), {
            block: true,
            appearance: 'outline',
            variant: 'neutral'
        }), btn(t('sign_out'), logout, {block: true, appearance: 'ghost', variant: 'neutral'})));
}

export function verifyScreen(app, token) {
    shell(app, h('div.aform', h('div.bigicon', icon('mail')), h('h1', t('verify_title')), h('p', t('verify_text')), h('div.aerr'), btn(t('verify_button'), async () => {
        try {
            history.replaceState(null, '', './');
            signedIn(await api('auth.verify', {token}));
            ok(t('verified'));
        } catch (e) {
            failedLogin(e);
        }
    }, {block: true, size: 'lg'})));
}

export function resetScreen(app, token) {
    const pw = h('sav-password', {
        label: t('new_password'),
        autocomplete: 'new-password',
        'min-uppercase': 0,
        'min-digits': 0,
        'min-lowercase': 0,
        labels: t('pw_labels')
    });
    shell(app, h('div.aform', h('h1', t('reset_title')), h('div.aerr'), pw, btn(t('save'), async () => {
        try {
            const r = await api('auth.reset', {token, password: pw.value});
            history.replaceState(null, '', './');
            signedIn(r);
        } catch (e) {
            failedLogin(e);
        }
    }, {block: true, size: 'lg'})));
}

export async function logout() {
    try {
        await api('auth.logout', {});
    } catch { /* the cookie goes anyway */
    }
    state.user = null;
    state.csrf = '';
    go('./');
}
