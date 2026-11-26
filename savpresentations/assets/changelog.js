/** What's new: the versions of the app and what changed in each, newest first. The version in the footer leads here; no account needed. */
import {btn, go, h, state} from './core.js';
import {lang, t} from './i18n.js';
import {brand, credit, langButton} from './auth.js';
import {userMenu} from './home.js';
import {CHANGES, VERSION} from './version.js';

export function changelogScreen(app) {
    document.body.classList.add('setp');
    const it = lang() === 'it', day = (d) => new Date(d + 'T12:00:00').toLocaleDateString(lang(), {day: 'numeric', month: 'long', year: 'numeric'});
    app.append(h('header.htop', brand(), h('div.spacer'), ...(state.user ? [userMenu()] : [langButton(), btn(t('sign_in'), () => go('?signin=login'), {appearance: 'outline', variant: 'neutral'})])),
        h('main.smain.chlog', h('div.hhead', h('sav-button', {icon: 'arrow-left', appearance: 'ghost', variant: 'neutral', onclick: () => go('./')}, t('home')), h('h1', t('changelog'))), h('p.muted.ssub', t('changelog_t', {v: VERSION})),
            h('div.vlist', ...CHANGES.map((c) => h('section.vcard', h('div.vhead', h('sav-badge', {variant: c.v === VERSION ? 'primary' : 'neutral', appearance: 'soft', pill: true}, 'v' + c.v), c.v === VERSION && h('small.vnow', t('current_v')), h('span.grow'), h('time', {datetime: c.date}, day(c.date))), h('ul', ...c.items.map((x) => h('li', x[it ? 1 : 0]))))))), credit());
    document.title = t('changelog') + ' – SavPresentations';
}
