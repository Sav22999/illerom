/**
 * What can be done from anywhere: save an article (also from the bookmarklet, the share menu of the phone, a file opened
 * from SavDrive), follow a feed, import a list from Pocket, Instapaper, OPML or .savrea; the texts still to be read after an
 * import; and the two sister apps an article can go to (SavTasks, SavNotes).
 */
import { btn, dialog, errText, fail, h, select, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api, setCounts } from './store.js';
import { go } from './account.js';

const isUrl = (s) => /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test((s || '').trim());

/** Saves an address; returns the article (or null). */
export async function saveUrl(url, o = {}) {
  const r = await api('rd.save', { url: url.trim(), title: o.title || '', tags: o.tags || [], source: o.source || 'url', item: o.item || null });
  setCounts(r);
  dispatchEvent(new CustomEvent('rd-saved', { detail: r.article }));
  if (!o.quiet) toast(t(r.existing ? 'saved_again' : r.article.status === 'failed' ? 'saved_noread' : 'saved'), r.article.status === 'failed' ? 'warning' : 'success');
  return r.article;
}

export function saveDialog(value = '') {
  const url = h('sav-input', { label: t('url'), placeholder: t('url_ph'), type: 'url', value, autofocus: true, inputmode: 'url', autocomplete: 'off' });
  const tags = h('sav-input', { label: t('save_tags'), help: t('save_tags_help'), autocomplete: 'off' });
  dialog({ title: t('save_article'), width: '30rem', body: h('div.form', h('p.muted.small', t('save_t')), url, tags), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, icon: 'bookmark-plus', run: async () => {
    if (!isUrl(url.value)) throw Object.assign(new Error(), { code: 'bad_url' });
    const a = await saveUrl(url.value, { tags: tags.value.split(',').map((x) => x.trim()).filter(Boolean) });
    if (a) go('#/a/' + a.id);
  } }] });
  // an address on the clipboard is offered at once
  if (!value && navigator.clipboard?.readText && document.hasFocus()) navigator.clipboard.readText().then((x) => { if (isUrl(x) && !url.value) url.value = x.trim(); }).catch(() => {});
}

/** Folders the feeds are in, as options. */
const folders = () => [...new Set(S.subs.map((f) => f.folder).filter(Boolean))].sort();

/** A folder chosen among the ones there are, or a new one. */
export function folderPicker(value = '') {
  const NEW = '__new__';
  const box = h('div.stack');
  const name = h('sav-input', { label: t('folder_name'), maxlength: 80, hidden: true });
  const sel = select(t('folder'), [['', t('no_folder')], ...folders().map((f) => [f, f]), [NEW, t('new_folder')]], value, (v) => { name.hidden = v !== NEW; if (v === NEW) setTimeout(() => name.focus(), 50); }, { size: 'md' });
  box.append(sel, name);
  box.value = () => (sel.value === NEW ? name.value.trim() : sel.value);
  return box;
}

export function addFeed(value = '') {
  const url = h('sav-input', { label: t('feed_url'), help: t('feed_url_help'), placeholder: 'https://…', type: 'url', value, autofocus: true, autocomplete: 'off', inputmode: 'url' });
  const fp = folderPicker();
  dialog({ title: t('add_feed'), width: '30rem', body: h('div.form', url, fp), actions: [{ label: t('cancel') }, { label: t('add'), primary: true, icon: 'rss', run: async () => {
    const r = await api('rd.feeds.add', { url: url.value.trim(), folder: fp.value() });
    setCounts(r);
    toast(t('feed_added', { t: r.feed?.title || '' }), 'success');
    if (r.feed) go('#/feeds/f/' + r.feed.id);
  } }] });
}

/** A file of the device, as text. */
export const pickFile = (accept) => new Promise((res) => { const i = h('input', { type: 'file', accept, hidden: true }); i.addEventListener('change', () => { res(i.files[0] || null); i.remove(); }); document.body.append(i); i.click(); });

/** Imports a file: kind pocket | instapaper | savrea | opml. */
export async function importFile(kind, file) {
  if (!file) return;
  const data = await file.text();
  if (kind === 'opml') {
    const r = await api('rd.opml.import', { opml: data });
    setCounts(r);
    toast(r.added ? t('opml_done', { n: r.added }) : t('opml_none'), 'success');
    refreshFeeds(true);
    return r;
  }
  toast(t('import_reading'), 'neutral', { duration: 2500 });
  const r = await api('rd.import', { kind, data });
  setCounts(r);
  toast(kind === 'savrea' ? t('imported_savrea', { n: r.added, s: r.skipped, f: r.feeds }) : t('imported_n', { n: r.added, s: r.skipped }), 'success', { duration: 7000 });
  dispatchEvent(new CustomEvent('rd-saved'));
  readPending();
  if (r.feeds) refreshFeeds(true);
  return r;
}

const KIND_OF = (name) => (/\.savrea$/i.test(name) ? 'savrea' : /\.(opml|xml)$/i.test(name) ? 'opml' : /\.html?$/i.test(name) ? 'pocket' : null);

export function importDialog() {
  const kind = select(t('import_title'), [['pocket', t('imp_pocket')], ['instapaper', t('imp_instapaper')], ['opml', t('import_opml')], ['savrea', t('imp_savrea')]], 'pocket', (v) => { help.textContent = t({ pocket: 'imp_pocket_t', instapaper: 'imp_instapaper_t', opml: 'import_opml_t', savrea: 'imp_savrea_t' }[v]); }, { size: 'md' });
  const help = h('p.muted.small', t('imp_pocket_t'));
  dialog({ title: t('import_title'), width: '30rem', body: h('div.form', kind, help), actions: [{ label: t('cancel') }, { label: t('choose_file'), primary: true, icon: 'file-up', run: async () => {
    const k = kind.value;
    const f = await pickFile(k === 'opml' ? '.opml,.xml,text/xml,text/x-opml' : k === 'savrea' ? '.savrea,application/json' : k === 'pocket' ? '.csv,.html,.htm,text/csv,text/html' : '.csv,text/csv');
    if (!f) return false;
    await importFile(k === 'pocket' && /\.html?$/i.test(f.name) ? 'pocket' : k, f);
  } }] });
}

/** The texts still to be read after an import, a few at a time, while the app is open (tools/refresh.php does it from cron too). */
let reading = false;
export async function readPending() {
  if (reading || !S.counts.pending) return;
  reading = true;
  try {
    for (let i = 0; i < 400; i++) {
      const r = await api('rd.fetch_pending', {});
      setCounts(r);
      dispatchEvent(new CustomEvent('rd-pending'));
      if (!r.pending || !document.hasFocus?.() && i > 20) break;
    }
  } catch { /* later, or from cron */ } finally { reading = false; }
}

/** The feeds that are old, brought up to date (the server reads ~12 at a time). */
let refreshing = null;
export function refreshFeeds(force = false) {
  if (refreshing) return refreshing;
  if (!force && !S.subs.length) return Promise.resolve(null);
  refreshing = (async () => {
    let updated = 0;
    try {
      for (let i = 0; i < 20; i++) {
        const r = await api('rd.feeds.refresh', {});
        updated += r.updated;
        setCounts(r);
        if (r.checked < 12) break;
      }
      dispatchEvent(new CustomEvent('rd-feeds'));
    } finally { refreshing = null; }
    return updated;
  })();
  return refreshing;
}

/**
 * An address given to the app: ?save=<url>&title= (the bookmarklet, any link), or the share menu of the phone (Web Share
 * Target: ?share=1&url=&text=&title=, the address often comes inside the text). Saved, then opened.
 */
export async function savedFromAddress() {
  const p = new URLSearchParams(location.search);
  if (!p.has('save') && !p.has('share')) return false;
  const title = p.get('title') || '';
  let url = p.get('save') || p.get('url') || '';
  if (!url) url = ((p.get('text') || '') + ' ' + title).match(/https?:\/\/\S+/)?.[0] || '';
  history.replaceState(null, '', location.pathname + location.hash);
  if (!url) { toast(t('share_none'), 'warning'); return false; }
  toast(t('saving'), 'neutral', { duration: 2500 });
  try { const a = await saveUrl(url, { title, source: p.has('share') ? 'share' : 'bookmarklet' }); if (a) go('#/a/' + a.id); return true; } catch (e) { fail(e); return false; }
}

/** The address of the bookmarklet: it opens this app with the page it is pressed on. */
export function bookmarklet() {
  const app = new URL('./', location.href).href;
  return `javascript:(function(){window.open('${app}?save='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank','noopener')})();`;
}

// ------------------------------------------------------------------ the sister apps (same account, same site)

/** A POST to the API of another app of the account (its CSRF token from its auth.me). */
async function sister(app, route, body) {
  const base = new URL(`../${app}/api/`, location.href).href;
  const me = await fetch(base + '?r=auth.me', { cache: 'no-store', credentials: 'same-origin' }).then((r) => r.json()).catch(() => null);
  if (!me?.user || !me.csrf) throw Object.assign(new Error(), { code: 'other_app', app });
  const r = await fetch(base + '?r=' + route, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrf, 'X-Lang': getLang() }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw Object.assign(new Error(d.error), { code: d.error || 'server' });
  return d;
}
const sisterFail = (e, name) => (e.code === 'other_app' ? toast(t('other_app_off', { app: name }), 'warning') : fail(e));

/** An article to read becomes a task of SavTasks (in its inbox), with the address and the time it takes in the notes. */
export async function toTasks(a) {
  try {
    await sister('savtasks', 'tasks.task.save', { title: t('to_tasks_title', { t: a.title }).slice(0, 255), notes: [a.url, a.words ? t('min_read', { n: Math.max(1, Math.round(a.words / (S.prefs?.wpm || 230))) }) : ''].filter(Boolean).join('\n'), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    toast(t('task_made'), 'success', { action: btn(t('open_tasks'), { size: 'sm', appearance: 'ghost', href: '../savtasks/', target: '_blank' }) });
  } catch (e) { sisterFail(e, 'SavTasks'); }
}

/** A notebook of SavNotes for an article: its title, its address, its note and highlights as typed text on lined paper. */
export async function toNotes(a, highlights = []) {
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const doc = [`<p><b>${esc(a.title)}</b></p>`, `<p>${esc(a.url)}</p>`, a.note ? `<p>${esc(a.note)}</p>` : '', ...highlights.map((x) => `<p>“${esc(x.quote)}”${x.note ? ' — ' + esc(x.note) : ''}</p>`), '<p><br></p>'].join('');
  try {
    const r = await sister('savnotes', 'nb.create', { title: a.title.slice(0, 120), lang: getLang(), sheets: [{ id: 's' + Date.now().toString(36), pat: 'lines', doc, items: [] }] });
    const id = r.notebook?.id;
    toast(t('notes_made'), 'success', { action: btn(t('open_notes'), { size: 'sm', appearance: 'ghost', href: '../savnotes/' + (id ? '#/n/' + id : ''), target: '_blank' }) });
  } catch (e) { sisterFail(e, 'SavNotes'); }
}

export { errText };
