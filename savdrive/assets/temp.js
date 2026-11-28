/**
 * Temporary files ("File temporaneo", as with WeTransfer): a link that works for a while and then stops, by itself.
 *   tempDialog()        files uploaded only for the link (New → Temporary file): deleted for real when the link ends
 *   tempDialog({items}) files and folders already in the drive (their menu): when the link ends only the link goes
 *   tempView()          the place "Temporary" of the side menu: the links that still work, time left, downloads, copy,
 *                       extend, revoke
 *   tempPage()          #/t/<token>: the page of who receives it, without an account (lib/temp.php on the server)
 */
import { btn, bytes, confirm, copyText, dialog, empty, errText, fail, h, icon, iconBtn, primary, put, segmented, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api, upload } from './store.js';
import { brand, credit, langButton, reportDialog, userMenu } from './account.js';
import { duration, kindOf } from './drive.js';

export const tempLink = (tok) => new URL(`#/t/${tok}`, location.href.split('#')[0]).href;
const tmpUrl = (r, tok, k, i) => `api/?r=${r}&t=${encodeURIComponent(tok)}${k ? '&k=' + encodeURIComponent(k) : ''}${i ? '&i=' + i : ''}`;

/** How long until a moment, short: "45 min", "5 h 20 min", "3 days". */
export function timeLeft(iso) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  if (s <= 0) return t('temp_ended');
  if (s < 3600) return t('temp_min', { n: Math.max(1, Math.floor(s / 60)) });
  if (s < 10 * 3600) { const hh = Math.floor(s / 3600), mm = Math.round((s % 3600) / 60); return mm ? t('temp_h_min', { h: hh, m: mm }) : t('temp_h', { n: hh }); }
  if (s < 48 * 3600) return t('temp_h', { n: Math.round(s / 3600) });
  return t('temp_days', { n: Math.round(s / 86400) });
}
const fullDate = (iso) => new Date(iso).toLocaleString(getLang(), { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The expiry: 1 hour, 1 day, 7 days, 30 days or a date and time. read() → {expires} | {at} (throws when the date is not good). */
function expiryField(value = '7d') {
  let pick = value;
  const at = h('sav-date-picker', { mode: 'datetime', label: t('temp_at'), value: localInput(new Date(Date.now() + 3 * 86400000)), min: localInput(new Date()), 'sheet-on-mobile': true, size: 'sm', hidden: true });
  const seg = segmented(t('temp_expires'), pick, [['1h', '=' + t('temp_1h'), t('temp_1h')], ['1d', '=' + t('temp_1d'), t('temp_1d')], ['7d', '=' + t('temp_7d'), t('temp_7d')], ['30d', '=' + t('temp_30d'), t('temp_30d')], ['date', '=' + t('temp_date'), t('temp_date')]],
    (v) => { pick = v; at.hidden = v !== 'date'; }, { show: true, class: 'texp' });
  return {
    node: h('div.stack', seg, at),
    read() {
      if (pick !== 'date') return { expires: pick };
      const d = new Date(String(at.value || ''));
      if (!at.value || Number.isNaN(+d) || +d < Date.now() + 60000) throw Object.assign(new Error('temp_expiry'), { code: 'temp_expiry' });
      return { at: d.toISOString() };
    },
  };
}

/** Password, limit of downloads, notice at each download, message: what the link asks of who receives it. */
function optionsForm() {
  const exp = expiryField();
  const pass = h('sav-password', { 'no-meter': true, label: t('temp_password'), placeholder: t('optional'), autocomplete: 'new-password', size: 'sm', maxlength: 200 });
  const limitOn = h('sav-switch', { size: 'sm' }, t('temp_limit'));
  const limit = h('sav-number-input', { label: t('temp_limit_n'), value: 1, min: 1, max: 100000, step: 1, size: 'sm', hidden: true });
  limitOn.addEventListener('change', () => { limit.hidden = !limitOn.checked; });
  const notify = h('sav-switch', { size: 'sm' }, t('temp_notify'));
  const msg = h('sav-textarea', { label: t('temp_message'), placeholder: t('temp_message_ph'), rows: 2, maxlength: 1000, size: 'sm' });
  return {
    node: h('div.form.topts', exp.node, pass, h('div.stack', limitOn, limit), h('div.stack', notify, S.config.mailReady === false ? h('small.muted', t('temp_notify_off')) : null), msg),
    read() {
      const p = String(pass.value || '');
      if (p && p.length < 4) throw Object.assign(new Error('temp_password'), { code: 'temp_password' });
      const n = parseInt(String(limit.value), 10);
      if (limitOn.checked && !(n >= 1)) throw Object.assign(new Error('temp_max'), { code: 'temp_max' });
      return { ...exp.read(), password: p || null, maxDownloads: limitOn.checked ? n : null, notify: notify.checked, message: String(msg.value || '').trim() };
    },
  };
}

/** The buttons at the bottom of a dialog, changed from step to step. */
function footer(d, buttons) {
  d.querySelectorAll(':scope > [slot="footer"]').forEach((b) => b.remove());
  for (const b of buttons.filter(Boolean)) { b.slot = 'footer'; d.append(b); }
}

/** What the link gives and how long, as the dialog shows it once the link is made. */
function linkResult(link) {
  const url = tempLink(link.token);
  const facts = [
    [icon('clock'), t('temp_expires_at', { date: fullDate(link.expires) })],
    link.password ? [icon('lock'), t('temp_with_password')] : null,
    link.maxDownloads ? [icon('download'), t('temp_max_n', { n: link.maxDownloads })] : null,
    link.notify ? [icon('bell'), t('temp_notify_on')] : null,
  ].filter(Boolean);
  return h('div.form', h('div.tdone', h('span.tdoneic', icon('check')), h('div', h('b', t('temp_ready')), h('small.muted', `${link.title} · ${bytes(link.size)}`))),
    h('div.linkrow', h('code', url), btn(t('copy'), { icon: 'copy', size: 'sm', onclick: () => copyText(url, t('link_copied')) })),
    h('ul.tfacts', facts.map(([ic, txt]) => h('li', ic, h('span', txt)))),
    link.mode === 'upload' ? h('p.muted.small', t('temp_upload_note')) : h('p.muted.small', t('temp_drive_note')));
}

/**
 * Makes a temporary link. items: files and folders of the drive (their menu), or nothing: files chosen here and uploaded
 * only for the link (in pieces, as every upload). onDone(answer): the list and the space can be drawn again.
 */
export function tempDialog({ items = null, files: initial = [], onDone } = {}) {
  const drive = !!items?.length, files = [];
  const opts = optionsForm(), box = h('div.form');
  let link = null, finished = false, abort = null;
  const free = () => (S.user && S.user.quota < 1e18 ? Math.max(0, (S.user.quota || 0) - (S.user.used || 0)) : Infinity);

  const list = h('div.tfiles'), total = h('small.muted');
  const drawFiles = () => {
    const sum = files.reduce((n, f) => n + f.size, 0);
    put(list, files.map((f, i) => h('div.tfile', h('span.tic', { style: `--fc:${kindOf({ name: f.name, mime: f.type }).c}` }, icon(kindOf({ name: f.name, mime: f.type }).ic)), h('span.tname', { title: f.name }, f.name), h('small.muted', bytes(f.size)),
      iconBtn('x', t('remove'), () => { files.splice(i, 1); drawFiles(); }))));
    put(total, files.length ? t('temp_total', { n: files.length, size: bytes(sum) }) + (sum > free() ? ' · ' + t('err_quota_file', { free: bytes(free()) }) : '') : t('temp_none'));
    total.classList.toggle('qwarn', sum > free());
  };
  const add = (fs) => { for (const f of fs) if (!files.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) files.push(f); drawFiles(); };
  const zone = h('sav-dropzone', { multiple: true, label: t('temp_drop'), help: t('temp_drop_help') });
  zone.addEventListener('change', (e) => { add([...(e.detail?.files || zone.files || [])]); zone.clear?.(); });

  const what = drive ? h('div.tfiles', items.map((x) => h('div.tfile', h('span.tic', { style: `--fc:${kindOf(x).c}` }, icon(kindOf(x).ic)), h('span.tname', { title: x.name }, x.name), h('small.muted', x.kind === 'folder' ? t('folder_l') : bytes(x.size)))))
    : h('div.stack', zone, list, total);

  const d = dialog({ title: drive ? t('temp_link_title') : t('temp_new_title'), width: '34rem', body: box, cls: 'tdlg',
    onclose: () => { abort?.abort(); if (link && !finished) api('temp.revoke', { id: link.id }).catch(() => {}); } });

  const create = async () => {
    let o;
    try { o = opts.read(); } catch (e) { return toast(errText(e), 'danger'); }
    if (!drive && !files.length) return toast(t('temp_none'), 'danger');
    try {
      link = (await api('temp.create', { mode: drive ? 'drive' : 'upload', ids: drive ? items.map((x) => x.id) : undefined, ...o })).link;
    } catch (e) { return fail(e); }
    if (drive) { finished = true; showDone(link); onDone?.({ link }); return; }
    await send();
  };

  // the files travel one after the other, in pieces; the link starts working when the last one has arrived
  const send = async () => {
    abort = new AbortController();
    const sum = files.reduce((n, f) => n + f.size, 0), bar = h('sav-progress-bar', { value: 0, max: sum || 1, 'aria-label': t('temp_uploading') }), line = h('small.muted'), now = h('b');
    const t0 = Date.now();
    put(box, h('div.form', h('div.tdone', h('span.tdoneic.run', icon('upload')), h('div', now, line)), bar));
    footer(d, [btn(t('cancel'), { onclick: () => d.hide() })]);
    let base = 0;
    try {
      for (const [i, f] of files.entries()) {
        now.textContent = t('temp_sending', { i: i + 1, n: files.length, name: f.name });
        const r = await upload(f, null, { temp: link.id, signal: abort.signal, onProgress: (b) => {
          const sent = base + b, secs = (Date.now() - t0) / 1000;
          bar.value = sent;
          line.textContent = `${bytes(sent)} / ${bytes(sum)}` + (secs > 3 && sent ? ' · ' + t('up_left', { t: duration(((sum - sent) / sent) * secs) }) : '');
        } });
        base += f.size;
        if (r.used !== undefined && S.user) { S.user.used = r.used; S.user.quota = r.quota; }
      }
      const r = await api('temp.finish', { id: link.id });
      finished = true;
      link = r.link;
      showDone(link);
      onDone?.(r);
    } catch (e) {
      if (e.code === 'aborted') return;
      api('temp.revoke', { id: link.id }).catch(() => {});
      link = null;
      toast(e.code === 'quota' ? t('err_quota_file', { free: bytes(Math.max(0, (e.data?.quota || 0) - (e.data?.used || 0))) }) : errText(e), 'danger');
      showForm();
    }
  };

  const showDone = (l) => {
    put(box, linkResult(l));
    footer(d, [btn(t('temp_see_all'), { onclick: () => { d.hide(); location.hash = '#/temp'; } }), primary(t('done'), { onclick: () => d.hide() })]);
  };
  const showForm = () => {
    put(box, h('p.muted.small', drive ? t('temp_drive_intro') : t('temp_upload_intro')), what, h('sav-divider'), opts.node);
    footer(d, [btn(t('cancel'), { onclick: () => d.hide() }), primary(t('temp_create'), { icon: 'link', onclick: create })]);
  };
  add(initial);
  showForm();
  return d;
}

/** A new expiry for a link that still works. */
function extendDialog(link, onDone) {
  const exp = expiryField('1d');
  dialog({ title: t('temp_extend') + ': ' + link.title, width: '30rem', body: h('div.form', h('p.muted.small', t('temp_extend_t', { date: fullDate(link.expires) })), exp.node),
    actions: [{ label: t('cancel') }, { label: t('temp_extend'), primary: true, run: async () => { const r = await api('temp.extend', { id: link.id, ...exp.read() }); toast(t('temp_extended', { date: fullDate(r.link.expires) }), 'success'); onDone?.(); } }] });
}

/**
 * The place "Temporary" of the drive: head and body are those of the drive; reload draws the drive again; space(answer)
 * gives it the space used (the files of the links count until they end).
 */
export async function tempView({ head, body, reload, space }) {
  const newBtn = primary(t('temp_new'), { icon: 'plus', size: 'sm', onclick: () => tempDialog({ onDone: (r) => { space?.(r); reload(); } }) });
  put(head, h('h1', t('temp')), h('span.grow'), newBtn);
  put(body, h('div.dwait', h('sav-spinner', { style: 'font-size:2rem' })));
  let r;
  try { r = await api('temp.list'); } catch (e) { put(body, empty('cloud-off', errText(e), '', btn(t('retry'), { onclick: () => tempView({ head, body, reload, space }) }))); return; }
  space?.(r);
  const note = h('sav-alert.tnote', { variant: 'neutral' }, t('temp_note'));
  if (!r.links.length) {
    put(body, note, h('div.dempty', empty('clock', t('temp_empty'), t('temp_empty_t'), h('div.prow.wrap.cen', primary(t('temp_new'), { icon: 'upload', onclick: () => newBtn.click() })))));
    return;
  }
  const revoke = async (l) => {
    if (!(await confirm(t('temp_revoke'), t(l.mode === 'upload' ? 'temp_revoke_upload' : 'temp_revoke_drive', { name: l.title }), t('temp_revoke')))) return;
    try { const x = await api('temp.revoke', { id: l.id }); space?.(x); toast(t('temp_revoked'), 'neutral'); reload(); } catch (e) { fail(e); }
  };
  const card = (l) => {
    const k = l.items.length === 1 ? kindOf(l.items[0]) : { ic: 'send', c: '#0a6fb0' }, soon = Date.parse(l.expires) - Date.now() < 3600000;
    const url = tempLink(l.token);
    return h('div.tcard', { role: 'listitem' },
      h('span.tic.tcic', { style: `--fc:${k.c}` }, icon(k.ic)),
      h('div.tmain', h('b.tname', { title: l.items.map((x) => x.name).join('\n') }, l.title),
        h('small.muted', [bytes(l.size), l.files > 1 ? t('temp_files_n', { n: l.files }) : null, t(l.mode === 'upload' ? 'temp_mode_upload' : 'temp_mode_drive')].filter(Boolean).join(' · ')),
        h('div.tstate',
          h('sav-badge', { variant: soon ? 'warning' : 'neutral', appearance: 'soft', pill: true, title: fullDate(l.expires) }, icon('clock'), t('temp_left', { t: timeLeft(l.expires) })),
          h('sav-badge', { variant: 'neutral', appearance: 'soft', pill: true }, icon('download'), l.maxDownloads ? t('temp_dl_of', { n: l.downloads, max: l.maxDownloads }) : t('temp_dl', { n: l.downloads })),
          l.password ? h('span.tflag', { title: t('temp_with_password') }, icon('lock')) : null,
          l.notify ? h('span.tflag', { title: t('temp_notify_on') }, icon('bell')) : null,
          l.message ? h('span.tflag', { title: l.message }, icon('message-circle')) : null)),
      h('div.tact',
        btn(t('copy_link'), { icon: 'copy', size: 'sm', class: 'tcopy', onclick: () => copyText(url, t('link_copied')) }),
        iconBtn('external', t('temp_open'), () => window.open(url, '_blank', 'noopener')),
        iconBtn('clock', t('temp_extend'), () => extendDialog(l, reload)),
        iconBtn('x-circle', t('temp_revoke'), () => revoke(l))));
  };
  put(body, note, h('div.tlist', { role: 'list' }, r.links.map(card)));
}

// ------------------------------------------------------------------ the page of who receives it

/** #/t/<token>: names, sizes, expiry, "Download"; for many files a ZIP or one by one. No account needed. */
export async function tempPage(root, tok) {
  const top = () => h('header.htop', brand(S.user ? '#/' : '#/welcome'), h('div.spacer'), S.user ? userMenu() : langButton());
  const keyName = 'savdrive-tk-' + tok;
  let key = '';
  try { key = sessionStorage.getItem(keyName) || ''; } catch { /* private mode */ }
  put(root, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' })));
  document.title = 'SavDrive';
  let f;
  try { f = await api('tmp.info', undefined, { t: tok, k: key || undefined }); } catch {
    put(root, h('div.home.tpub', top(), h('main.tpm', h('sav-card.tbox', { appearance: 'elevated' }, empty('link-2-off', t('temp_gone'), t('temp_gone_t')))), credit()));
    document.title = t('temp_gone') + ' – SavDrive';
    return;
  }
  if (f.locked) {
    const pass = h('sav-password', { 'no-meter': true, label: t('temp_password'), autocomplete: 'current-password', autofocus: true });
    const err = h('small.qwarn', { hidden: true });
    const open = primary(t('temp_unlock'), { icon: 'lock', block: true, onclick: async () => {
      try {
        const r = await api('tmp.unlock', { t: tok, password: String(pass.value || '') });
        try { sessionStorage.setItem(keyName, r.key); } catch { /* private mode */ }
        tempPage(root, tok);
      } catch (e) { err.textContent = errText(e); err.hidden = false; }
    } });
    pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') open.click(); });
    put(root, h('div.home.tpub', top(), h('main.tpm', h('sav-card.tbox', { appearance: 'elevated' }, h('div.form.tlock', h('span.tbig', icon('lock')), h('h1', t('temp_locked')), h('p.muted', t('temp_locked_t')), pass, err, open))), credit()));
    document.title = t('temp_locked') + ' – SavDrive';
    return;
  }
  const one = f.items.length === 1 ? f.items[0] : null;
  const name = one ? one.name : t('temp_n_files', { n: f.files });
  const dl = (href, fname) => { const a = h('a', { href, download: fname || '' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => refresh(), 2500); };
  const refresh = async () => { try { const g = await api('tmp.info', undefined, { t: tok, k: key || undefined }); if (g.left !== f.left) tempPage(root, tok); } catch { tempPage(root, tok); } };
  const k = one ? kindOf(one) : { ic: 'send', c: '#0a6fb0' };
  const main = one
    ? primary(one.kind === 'folder' ? t('temp_download_zip') : t('download'), { icon: 'download', size: 'lg', block: true, onclick: () => dl(tmpUrl('tmp.get', tok, key, one.id), one.kind === 'folder' ? one.name + '.zip' : one.name) })
    : f.zip ? primary(t('temp_download_all'), { icon: 'download', size: 'lg', block: true, onclick: () => dl(tmpUrl('tmp.zip', tok, key)) }) : null;
  const rows = !one || one.kind === 'folder' ? h('div.tplist', f.items.map((x) => {
    const kk = kindOf(x);
    return h('div.tprow', h('span.tic', { style: `--fc:${kk.c}` }, icon(kk.ic)), h('div.tpn', h('b', { title: x.name }, x.name), h('small.muted', x.kind === 'folder' ? `${t('temp_files_n', { n: x.files })} · ${bytes(x.size)}` : bytes(x.size))),
      one ? null : iconBtn('download', x.kind === 'folder' ? t('temp_download_zip') : t('download'), () => dl(tmpUrl('tmp.get', tok, key, x.id), x.kind === 'folder' ? x.name + '.zip' : x.name)));
  })) : null;
  put(root, h('div.home.tpub', top(), h('main.tpm',
    h('sav-card.tbox', { appearance: 'elevated' },
      h('div.thead', h('span.tbig', { style: `--fc:${k.c}` }, icon(k.ic)), h('div.tht', h('h1', { title: name }, name), h('p.muted', `${bytes(f.size)} · ${t('temp_from', { name: f.owner })}`))),
      f.message ? h('blockquote.tmsg', h('small.muted', t('temp_message_from', { name: f.owner })), h('p', f.message)) : null,
      h('ul.tfacts', h('li', icon('clock'), h('span', { title: fullDate(f.expires) }, t('temp_expires_in', { t: timeLeft(f.expires), date: fullDate(f.expires) }))),
        f.left !== null ? h('li', icon('download'), h('span', t('temp_left_dl', { n: f.left }))) : null),
      main, !one && !f.zip ? h('p.muted.small', t('zip_too_big')) : null, rows,
      h('div.tfoot', h('p.muted.small', t('temp_page_note')), btn(t('rep_link'), { icon: 'flag', appearance: 'ghost', size: 'sm', title: t('rep_link'), onclick: () => reportDialog(tok) })))), credit()));
  document.title = name + ' – SavDrive';
}
