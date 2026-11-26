/** Sharing a schedule: its link, a QR code to print or project, an email from one's own mail app. */
import { btn, copyText, dialog, h, icon } from './ui.js';
import { t } from './i18n.js';
import { qr } from './qr.js';
import { download, fileName } from './files.js';

export const publicUrl = (id) => new URL('#/s/' + id, location.href.split('#')[0]).href;

function qrSvg(text, px = 6) {
  const m = qr(text), n = m.length, q = 4, size = (n + q * 2) * px;
  let d = '';
  m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${(x + q) * px} ${(y + q) * px}h${px}v${px}h-${px}z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#141b2b"/></svg>`;
}

export function shareDialog(s) {
  const url = publicUrl(s.id), svg = qrSvg(url);
  const who = s.settings.access === 'account' ? t('share_account') : t('share_open');
  const mail = `mailto:?subject=${encodeURIComponent(s.title)}&body=${encodeURIComponent(t(s.kind === 'slots' ? 'mail_slots' : 'mail_poll', { t: s.title }) + '\n\n' + url)}`;
  dialog({
    title: t('share_title'), width: '34rem', body: h('div.share',
      h('div.linkrow', h('code', url), btn(t('copy'), { icon: 'copy', size: 'sm', variant: 'primary', appearance: 'solid', onclick: () => copyText(url, t('link_copied')) })),
      h('sav-alert', { variant: s.closed ? 'warning' : 'neutral' }, icon(s.settings.access === 'account' ? 'lock' : 'globe', { slot: 'icon' }), s.closed ? t('share_closed') : who),
      h('div.qrbox', h('div.qr', { html: svg }), h('div.stack', h('strong', t('qr_title')), h('span.muted.small', t('qr_text')),
        h('div.prow.wrap', btn(t('qr_download'), { icon: 'download', size: 'sm', onclick: () => download(new Blob([svg], { type: 'image/svg+xml' }), fileName(s.title, 'svg')) }),
          btn(t('send_email'), { icon: 'mail', size: 'sm', href: mail }), btn(t('open'), { icon: 'external-link', size: 'sm', href: url, target: '_blank' }))))),
    actions: [{ label: t('done'), primary: true }],
  });
}
