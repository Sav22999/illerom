/** What's new: the versions of SavDiagrams and what changed in each, newest first. The version in the footer leads here; no account needed. */
import { btn, h, put } from './ui.js';
import { getLang, t } from './i18n.js';
import { S } from './store.js';
import { brand, credit, go, langButton, userMenu } from './account.js';
import { CHANGES, VERSION } from './version.js';

export function changelogScreen(root, name) {
  const it = getLang() === 'it', day = (d) => new Date(d + 'T12:00:00').toLocaleDateString(getLang(), { day: 'numeric', month: 'long', year: 'numeric' });
  put(root, h('div.home.setp', h('header.htop', brand(S.user ? '#/' : '#/welcome'), h('div.spacer'), S.user ? userMenu() : [langButton(), btn(t('sign_in'), { appearance: 'outline', href: '#/signin' })]),
    h('main.smain.chlog', h('div.shd', btn(t('home'), { icon: 'arrow-left', appearance: 'ghost', onclick: () => go(S.user ? '#/' : '#/welcome') }), h('h1', t('changelog'))), h('p.muted', t('changelog_t', { v: VERSION })),
      h('div.vlist', CHANGES.map((c) => h('section.vcard', h('div.vhead', h('sav-badge', { variant: c.v === VERSION ? 'primary' : 'neutral', appearance: 'soft', pill: true }, 'v' + c.v), c.v === VERSION ? h('small.vnow', t('current_v')) : null, h('span.grow'), h('time', { datetime: c.date }, day(c.date))), h('ul', c.items.map((x) => h('li', x[it ? 1 : 0]))))))), credit()));
  document.title = t('changelog') + ' – ' + name;
}
