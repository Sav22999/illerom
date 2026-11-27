/** Entry point: who is signed in, which screen to show. */
import {$, get, go, h, state} from './core.js';
import {lang, setLang, t} from './i18n.js';
import {fontFaces} from './themes.js';

document.head.append(h('style', fontFaces()));
const app = $('#app');
let current = null;

export function applyMode(mode) {
    const m = mode || state.user?.settings?.mode || localStorage.getItem('sp-mode') || 'auto';
    localStorage.setItem('sp-mode', m);
    document.documentElement.classList.remove('sav-theme-light', 'sav-theme-dark', 'sav-theme-auto');
    document.documentElement.classList.add('sav-theme-' + m);
}

export async function signedIn(data) {
    state.user = data.user;
    state.csrf = data.csrf;
    setLang(data.user.lang);
    applyMode();
    // back to what one was opening before signing in (a shared presentation, a single-use link)
    const back = sessionStorage.getItem('sp-back');
    sessionStorage.removeItem('sp-back');
    go(back || './');
}

async function route() {
    const q = new URLSearchParams(location.search);
    if (current?.leave) await current.leave();
    current = null;
    // the search of actions (⌘J / Ctrl+J): the pages of the app; the home and the editor add their own
    window.SavOffice?.commands(state.user ? [{label: 'SavPresentations', items: [{icon: 'layout-grid', label: t('my_decks'), run: () => go('./')}, {icon: 'settings', label: t('settings'), run: () => go('?p=settings')}, {icon: 'sparkles', label: t('changelog'), run: () => go('?p=changelog')}]}] : []);
    document.body.className = 'sav-base';
    app.textContent = '';
    document.querySelectorAll('body > sav-dialog').forEach((d) => d.hide?.());
    document.title = 'SavPresentations';
    const u = state.user;
    const need = () => {
        sessionStorage.setItem('sp-back', location.pathname + location.search);
    };
    const show = async (mod, fn, ...a) => {
        const m = await mod;
        current = (await m[fn](app, ...a)) || null;
    };
    if (q.get('verify')) return show(import('./auth.js'), 'verifyScreen', q.get('verify'));
    if (q.get('reset')) return show(import('./auth.js'), 'resetScreen', q.get('reset'));
    if (u && !u.verified) return show(import('./auth.js'), 'confirmScreen');
    if (q.get('join')) {
        if (!u) {
            need();
            return show(import('./auth.js'), 'authScreen', {note: t('join_sign_in')});
        }
        return show(import('./share.js'), 'joinScreen', q.get('join'));
    }
    if (q.get('speaker')) return show(import('./speaker.js'), 'speakerScreen', q.get('speaker'));
    if (q.get('d')) return show(import('./editor.js'), 'deckScreen', q.get('d'), q);
    // presentations kept only in this browser: no account needed
    if (q.get('p') === 'local') return show(import('./home.js'), 'localHome');
    if (q.get('l')) return show(import('./editor.js'), 'deckScreen', '', q);
    // the page of the changes is open to everybody
    if (q.get('p') === 'changelog') return show(import('./changelog.js'), 'changelogScreen');
    if (q.get('signin') || (!u && q.get('p'))) {
        if (u) return go('./');
        return show(import('./auth.js'), 'authScreen', {mode: q.get('signin')});
    }
    if (!u) return show(import('./auth.js'), 'landing');
    if (q.get('p') === 'settings') return show(import('./settings.js'), 'settingsScreen', q);
    if (q.get('p') === 'admin' && u.master) return show(import('./admin.js'), 'adminScreen', q);
    return show(import('./home.js'), 'homeScreen', q);
}

addEventListener('popstate', () => route().catch(failed));
document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[data-go]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    go(a.getAttribute('href'));
});

function failed(e) {
    console.error(e);
    app.textContent = '';
    app.append(h('div.center', h('sav-empty-state', {
        heading: t('err_server'),
        text: t('try_again_text'),
        icon: 'cloud-off'
    }, h('sav-button', {onclick: () => location.reload()}, t('try_again')))));
}

(async () => {
    setLang(localStorage.getItem('sp-lang') || navigator.language);
    applyMode();
    try {
        const [cfg, me] = await Promise.all([get('auth.config'), get('auth.me')]);
        state.config = cfg;
        if (me.user) {
            state.user = me.user;
            state.csrf = me.csrf;
            setLang(me.user.lang);
            applyMode();
        }
        // who was signed in, for when the next visit has no connection
        if (me.user) localStorage.setItem('sp-me', JSON.stringify(me.user)); else localStorage.removeItem('sp-me');
    } catch (e) {
        if (!e.network) return failed(e);
        try { state.user = JSON.parse(localStorage.getItem('sp-me') || 'null'); } catch { state.user = null; }
        state.offline = true;
    }
    // back online: the session key again, so the changes made meanwhile can leave
    addEventListener('online', async () => { try { const m = await get('auth.me'); if (m.user) { state.user = m.user; state.csrf = m.csrf; } state.offline = false; } catch { /* still off */ } });
    // signing in with SavAccount, or joining it to an account: the shared library of the projects (../identity)
    window.Identity?.setup({
        name: 'SavPresentations',
        lang,
        accent: '#6d3bef',
        accept: 'acceptTerms',
        acceptUrl: 'terms.php',
        body: () => ({lang: lang()})
    });
    if (new URLSearchParams(location.search).has('sav')) history.replaceState(null, '', './');
    // signed in by leaving the page (SavAccount): on to what was being opened
    const back = sessionStorage.getItem('sp-back');
    if (state.user?.verified && back) {
        sessionStorage.removeItem('sp-back');
        history.replaceState(null, '', back);
    }
    await route();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {
    });
    // a .savpre file opened from the computer (installed app)
    // … or with the Android app
    const pend = state.user?.verified && window.SavPresentationsAndroid?.pendingFile?.();
    if (pend) {
        const f = JSON.parse(pend), bytes = Uint8Array.from(atob(f.data), (x) => x.charCodeAt(0));
        (await import('./files.js')).openFile(new File([bytes], f.name));
    }
    { const take = async (p) => {
        if (!p.files?.length || !state.user) return;
        const f = await p.files[0].getFile();
        (await import('./files.js')).openFile(f);
    };
      window.launchQueue?.setConsumer(take);
      window.SavOffice?.fromDrive?.(take); // a file opened from SavDrive (?savdrive=<id>), given like a file of the device
    }
})().catch(failed);
export {lang};
