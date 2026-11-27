/**
 * The side of the calendar: a new event, the small month, own calendars, subscriptions, the layers of SavSchedules and
 * SavNewsletters, and the dialogs to add a calendar, subscribe to one, import a file and show SavCalendar elsewhere.
 *
 * Showing SavCalendar in other calendars: each calendar of one's own (or everything together, SavSchedules included) has
 * a private link to an .ics feed. Google Calendar, Outlook and Apple Calendar subscribe to it and read it again by
 * themselves; there it is read-only. Bringing other calendars here works the same way the other way round: their
 * private .ics link (a subscription, read again every few hours, read-only here) or a one-time copy from a file.
 */
import { btn, colorPop, confirm, copyText, dialog, drop, empty, fail, h, icon, iconBtn, primary, select, toast, toggle } from './ui.js';
import { t, getLang, when } from './i18n.js';
import { S, api, calById } from './store.js';
import { prefs, setPrefs } from './account.js';
import { addDays, keyParts, todayKey, weekday, dayLabel, monthLabel, LOCAL_TZ, ZONES } from './time.js';
import { readCalendarFile, saveCsv, saveIcs, saveSavcal } from './files.js';
import { firstDay } from './week.js';

const CAL_COLORS = ['#c93a2f', '#e0532f', '#c27a06', '#0f8a63', '#0b8494', '#1f56d1', '#6a2cf0', '#c2307a', '#4a5875', '#7a5c3e'];
const webcal = (u) => u.replace(/^https?:\/\//, 'webcal://');
const setCal = (c) => { const i = S.calendars.findIndex((x) => x.id === c.id); if (i >= 0) S.calendars[i] = c; else S.calendars.push(c); };

// ------------------------------------------------------------------ the small month

let miniMonth = null;
function mini(screen) {
  const tz = prefs().tz || LOCAL_TZ;
  let k = miniMonth && miniMonth.slice(0, 7) !== screen.day.slice(0, 7) && miniMonth.__keep ? miniMonth : screen.day;
  const box = h('div.mini');
  const draw = () => {
    const [y, m] = keyParts(k), first = `${y}-${String(m).padStart(2, '0')}-01`, ws = firstDay();
    const a = addDays(first, -((weekday(first) - ws + 7) % 7)), today = todayKey(tz);
    const shift = (n) => { const x = new Date(Date.UTC(y, m - 1 + n, 1)); k = x.toISOString().slice(0, 10); draw(); };
    box.replaceChildren(
      h('div.mini-h', h('b', monthLabel(k)), iconBtn('chevron-left', t('previous'), () => shift(-1)), iconBtn('chevron-right', t('next'), () => shift(1))),
      h('div.mini-g', Array.from({ length: 7 }, (_, i) => h('small', dayLabel(addDays(a, i), { weekday: 'narrow' }))),
        Array.from({ length: 42 }, (_, i) => { const d = addDays(a, i); return h('button' + (keyParts(d)[1] !== m ? '.out' : '') + (d === today ? '.today' : '') + (d === screen.day ? '.on' : ''), { type: 'button', onclick: () => { screen.drawer?.hide?.(); screen.go(d); } }, String(keyParts(d)[2])); })));
  };
  draw();
  return box;
}

// ------------------------------------------------------------------ the side

export function sidebar(screen) {
  const own = S.calendars.filter((c) => c.kind === 'local'), subs = S.calendars.filter((c) => c.kind === 'sub');
  const visible = async (c, v) => { c.visible = v; screen.redraw(); try { setCal((await api('cal.cal.save', { id: c.id, visible: v })).calendar); } catch (e) { fail(e); } };
  const row = (c) => {
    const cb = h('sav-checkbox.ccheck', { checked: c.visible || null, style: `--c:${c.color}`, 'aria-label': c.name });
    cb.addEventListener('change', () => visible(c, cb.checked));
    const items = c.kind === 'local'
      ? [['pencil', t('edit_calendar'), () => calendarDialog(c, screen)], ['rss', t('show_elsewhere'), () => feedDialog(c)], ['import', t('import_here'), () => importDialog(screen, c)], ['eye', t('only_this'), () => onlyThis(c, screen)], '-',
        { head: t('download') }, ['download', t('save_savcal'), () => saveSavcal(c.id)], ['calendar', t('save_ics'), () => saveIcs(c.id, c.name)], ['table-properties', t('save_csv'), () => saveCsv(c.id, prefs().tz || LOCAL_TZ)], '-',
        ['trash', t('delete_calendar'), () => deleteCalendar(c, screen), { danger: true, disabled: own.length < 2 }]]
      : [['refresh-cw', t('refresh_now'), async () => { try { setCal((await api('cal.refresh', { id: c.id })).calendar); toast(t('refreshed'), 'success'); } catch (e) { if (e.data?.calendar) setCal(e.data.calendar); fail(e); } screen.reload(); }], ['pencil', t('edit_calendar'), () => calendarDialog(c, screen)], ['eye', t('only_this'), () => onlyThis(c, screen)], ['link', t('copy_source'), () => copyText(c.url)], '-',
        { head: t('download_copy') }, ['download', t('save_savcal'), () => saveSavcal(c.id)], ['calendar', t('save_ics'), () => saveIcs(c.id, c.name)], '-', ['trash', t('unsubscribe'), () => deleteCalendar(c, screen), { danger: true }]];
    const more = drop(h('sav-button', { icon: 'ellipsis-vertical', label: t('more'), appearance: 'ghost', size: 'sm', square: true }), items, { placement: 'bottom-end' });
    const note = c.kind === 'sub' ? (c.error ? h('small.err', icon('circle-alert'), ' ', t('err_' + c.error)) : h('small.muted', c.refreshed ? t('updated_w', { w: when(c.refreshed) }) : '')) : c.feed ? h('small.muted', icon('rss'), ' ', t('shared_feed')) : null;
    return h('div.crow', cb, h('div.cname', h('span', c.name), note), c.kind === 'sub' ? h('sav-icon.lk', { name: 'lock', label: t('read_only') }) : null, more);
  };
  const layer = (key, label, ic, color, sub, link) => {
    const sw = h('sav-checkbox.ccheck', { checked: prefs()[key] !== false || null, style: `--c:${color}`, 'aria-label': label });
    sw.addEventListener('change', async () => { await setPrefs({ [key]: sw.checked }).catch(fail); screen.reload(); });
    return h('div.crow', sw, h('div.cname', h('span', label), sub ? h('small.muted', sub) : null), h('sav-icon.lk', { name: 'lock', label: t('read_only') }), link ? iconBtn('external-link', t('open'), () => { location.href = link; }) : null);
  };
  const add = drop(h('sav-button', { icon: 'plus', label: t('add_calendar'), appearance: 'ghost', size: 'sm', square: true }), [
    ['calendar-plus', t('new_calendar'), () => calendarDialog(null, screen)], ['rss', t('subscribe'), () => subscribeDialog(screen)], ['file-up', t('open_file'), () => importDialog(screen)]], { placement: 'bottom-end' });
  const proposals = toggle(t('show_proposals'), prefs().proposals !== false, async (v) => { await setPrefs({ proposals: v }).catch(fail); screen.reload(); });
  return h('div.side',
    h('div.sbtns', primary(t('new_event'), { icon: 'plus', size: 'lg', class: 'newbtn', onclick: () => { screen.drawer?.hide?.(); screen.newEvent(); } }),
      btn(t('find_date'), { icon: 'vote', title: t('find_date_t'), onclick: () => { screen.drawer?.hide?.(); screen.pick(); } })),
    mini(screen),
    h('div.shead', h('span', t('my_calendars')), add), own.map(row),
    subs.length ? [h('div.shead', h('span', t('subscriptions'))), subs.map(row)] : null,
    h('div.shead', h('span', t('from_office'))),
    layer('schedules', 'SavSchedules', 'vote', '#1f56d1', t('sch_layer_t'), S.schedulesUrl),
    prefs().schedules !== false ? h('div.subopt', proposals) : null,
    layer('newsletters', 'SavNewsletters', 'mail', '#c2307a', t('nl_layer_t'), null),
    layer('tasks', 'SavTasks', 'list-checks', '#0b7a87', t('task_layer_t'), S.tasksUrl),
    layer('forms', 'SavForms', 'hourglass', '#86329e', t('form_layer_t'), S.formsUrl),
    layer('birthdays', 'SavContacts', 'cake', '#4338ca', t('bday_layer_t'), '../savcontacts/'),
    h('div.sfoot', btn(t('sync'), { icon: 'refresh-cw', size: 'sm', appearance: 'outline', onclick: () => syncDialog(screen) })));
}

async function onlyThis(c, screen) {
  for (const x of S.calendars) x.visible = x.id === c.id;
  screen.redraw();
  await Promise.all(S.calendars.map((x) => api('cal.cal.save', { id: x.id, visible: x.visible }))).catch(fail);
}

async function deleteCalendar(c, screen) {
  const sub = c.kind === 'sub';
  if (!(await confirm(t(sub ? 'unsubscribe' : 'delete_calendar'), t(sub ? 'unsubscribe_t' : 'delete_calendar_t', { name: c.name, n: c.events }), t(sub ? 'unsubscribe' : 'delete')))) return;
  await api('cal.cal.delete', { id: c.id }).catch((e) => { fail(e); throw e; });
  S.calendars = S.calendars.filter((x) => x.id !== c.id);
  toast(t(sub ? 'unsubscribed' : 'deleted'), 'neutral');
  screen.reload();
}

// ------------------------------------------------------------------ a calendar

function calendarDialog(c, screen) {
  const name = h('sav-input', { label: t('name'), value: c?.name || '', maxlength: 120, autofocus: true });
  const descr = h('sav-input', { label: t('description'), value: c?.descr || '', maxlength: 500 });
  let color = c?.color || CAL_COLORS[S.calendars.length % CAL_COLORS.length];
  const zone = select(t('timezone'), ZONES.map((z) => [z, z.replace(/_/g, ' ')]), c?.tz || prefs().tz || LOCAL_TZ, null, { searchable: true, help: t('cal_tz_t') });
  for (const x of [name, descr]) x.addEventListener('keydown', (e) => e.stopPropagation());
  const sub = c?.kind === 'sub';
  dialog({ title: t(c ? 'edit_calendar' : 'new_calendar'), width: '28rem',
    body: h('div.form', name, h('div.cf', h('span.flabel', t('color')), colorPop(t('color'), color, (v) => { color = v; }, { list: CAL_COLORS })), sub ? null : descr, sub ? null : zone,
      sub ? h('sav-alert', { variant: 'neutral' }, icon('lock', { slot: 'icon' }), t('sub_note')) : null),
    actions: [{ label: t('cancel') }, { label: t(c ? 'save' : 'create'), primary: true, run: async () => {
      const r = await api('cal.cal.save', { id: c?.id, name: name.value, color, descr: descr.value, tz: zone.value });
      setCal(r.calendar);
      toast(t(c ? 'saved' : 'created'), 'success');
      screen.redraw();
    } }] });
}

// ------------------------------------------------------------------ bringing other calendars here

/** Where to find the private .ics link in the other calendars: steps the people can follow. */
const howTo = (k) => h('ol.howto', t(k).split('|').map((s) => h('li', s)));

function subscribeDialog(screen, url = '') {
  const link = h('sav-input', { label: t('sub_link'), value: url, placeholder: 'https://… .ics  ·  webcal://…', autofocus: true, help: t('sub_link_t') }, icon('link', { slot: 'prefix' }));
  const name = h('sav-input', { label: t('name_optional'), maxlength: 120 });
  let color = CAL_COLORS[(S.calendars.length + 3) % CAL_COLORS.length];
  for (const x of [link, name]) x.addEventListener('keydown', (e) => e.stopPropagation());
  const tabs = h('sav-tabs.howtabs', {}, h('sav-tab', { name: 'g', label: 'Google' }, howTo('how_google_in')), h('sav-tab', { name: 'o', label: 'Outlook' }, howTo('how_outlook_in')), h('sav-tab', { name: 'a', label: 'Apple iCloud' }, howTo('how_apple_in')), h('sav-tab', { name: 'x', label: t('other') }, howTo('how_other_in')));
  dialog({ title: t('subscribe'), width: '34rem',
    body: h('div.form', h('p.muted', t('subscribe_t')), link, h('div.prow.end', name, h('div.cf', h('span.flabel', t('color')), colorPop(t('color'), color, (v) => { color = v; }, { list: CAL_COLORS }))),
      h('sav-alert', { variant: 'neutral', appearance: 'soft' }, icon('lock', { slot: 'icon' }), t('sub_readonly')), h('sav-details.pfold', { summary: t('where_link'), appearance: 'plain' }, tabs)),
    actions: [{ label: t('cancel') }, { label: t('subscribe_btn'), primary: true, icon: 'rss', run: async () => {
      const r = await api('cal.subscribe', { url: link.value.trim(), name: name.value.trim(), color, tz: prefs().tz || LOCAL_TZ });
      setCal(r.calendar);
      toast(t('subscribed_n', { n: r.count }), 'success');
      screen.reload();
    } }] });
}

/** A file opened from the device (double click on a .savcal, or "Open with"): straight to the import dialog. */
export const openFile = (screen, file) => importDialog(screen, null, file);

export function importDialog(screen, into = null, given = null) {
  const own = S.calendars.filter((c) => c.kind === 'local');
  let file = null;
  const target = select(t('import_into'), [['', t('new_calendar_file')], ...own.map((c) => [c.id, c.name])], into?.id || '', null);
  const ACCEPT = '.savcal,.ics,.ical,text/calendar,' + 'application/vnd.savcalendar.calendar+zip';
  const zone = h('sav-dropzone', { accept: ACCEPT, label: t('drop_ics'), 'max-files': 1 });
  const fileIn = h('input', { type: 'file', accept: ACCEPT, hidden: true });
  const chosen = h('p.muted.small');
  const take = (f) => { if (!f) return; if (f.size > 6e6) return fail({ code: 'file_big' }); file = f; chosen.textContent = `${f.name} · ${Math.max(1, Math.round(f.size / 1024))} KB`; };
  zone.addEventListener('sav-change', (e) => take(e.detail?.files?.[0] || zone.files?.[0]));
  zone.addEventListener('change', () => take(zone.files?.[0]));
  fileIn.addEventListener('change', () => take(fileIn.files[0]));
  const tabs = h('sav-tabs.howtabs', {}, h('sav-tab', { name: 'g', label: 'Google' }, howTo('how_google_file')), h('sav-tab', { name: 'o', label: 'Outlook' }, howTo('how_outlook_file')), h('sav-tab', { name: 'a', label: 'Apple' }, howTo('how_apple_file')));
  if (given) take(given);
  dialog({ title: t('import_file'), width: '32rem',
    body: h('div.form', h('p.muted', t('import_t')), zone, h('div', btn(t('choose_file'), { size: 'sm', icon: 'file-up', onclick: () => fileIn.click() }), fileIn), chosen, target, h('sav-details.pfold', { summary: t('where_file'), appearance: 'plain' }, tabs)),
    actions: [{ label: t('cancel') }, { label: t('import_btn'), primary: true, icon: 'import', run: async () => {
      if (!file) throw Object.assign(new Error(), { code: 'no_file' });
      const f = await readCalendarFile(file);
      const r = await api('cal.import', { ...(f.savcal ? { savcal: f.savcal } : { ics: f.ics }), id: target.value || undefined, name: target.value ? undefined : f.name, tz: prefs().tz || LOCAL_TZ });
      setCal(r.calendar);
      toast(t('imported_n', { n: r.added, u: r.updated }), 'success');
      screen.reload();
    } }] });
}

// ------------------------------------------------------------------ showing SavCalendar elsewhere

/** The private link of one calendar (or of everything: c = null): on, off, new; and how to add it to the others. */
function feedBox(c, onchange) {
  const box = h('div.feedbox');
  const draw = (url) => {
    const off = !url;
    box.replaceChildren(
      off ? h('div.prow.wrap', h('p.muted.grow', t(c ? 'feed_off' : 'feed_all_off')), primary(t('feed_on'), { size: 'sm', icon: 'rss', onclick: () => act('on') }))
        : h('div.stack', h('div.linkrow', h('code', url), btn(t('copy'), { size: 'sm', icon: 'copy', onclick: () => copyText(url, t('link_copied')) })),
          h('div.prow.wrap', btn(t('open_webcal'), { size: 'sm', icon: 'calendar-plus', href: webcal(url) }), btn(t('feed_google'), { size: 'sm', icon: 'external-link', href: 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal(url)), target: '_blank', rel: 'noopener' }),
            btn(t('feed_outlook'), { size: 'sm', icon: 'external-link', href: 'https://outlook.live.com/calendar/0/addfromweb?url=' + encodeURIComponent(url) + '&name=' + encodeURIComponent(c?.name || 'SavCalendar'), target: '_blank', rel: 'noopener' })),
          h('sav-alert', { variant: 'warning', appearance: 'soft' }, icon('lock', { slot: 'icon' }), t('feed_private')),
          h('div.prow.wrap', btn(t('feed_reset'), { size: 'sm', appearance: 'ghost', icon: 'rotate-ccw', onclick: async () => { if (await confirm(t('feed_reset'), t('feed_reset_t'), t('feed_reset'), true)) act('reset'); } }), btn(t('feed_stop'), { size: 'sm', appearance: 'ghost', variant: 'danger', icon: 'x', onclick: async () => { if (await confirm(t('feed_stop'), t('feed_stop_t'), t('feed_stop'), true)) act('off'); } }))));
  };
  const act = async (action) => {
    try {
      const r = await api('cal.feed', { id: c ? c.id : 'all', action });
      if (c) { setCal(r.calendar); draw(r.calendar.feed); } else { S.feed = r.feed; draw(r.feed); }
      onchange?.();
    } catch (e) { fail(e); }
  };
  draw(c ? c.feed : S.feed);
  return box;
}
const howOut = () => h('sav-tabs.howtabs', {}, h('sav-tab', { name: 'g', label: 'Google' }, howTo('how_google_out')), h('sav-tab', { name: 'o', label: 'Outlook' }, howTo('how_outlook_out')), h('sav-tab', { name: 'a', label: 'Apple' }, howTo('how_apple_out')), h('sav-tab', { name: 'x', label: t('other') }, howTo('how_other_out')));

function feedDialog(c) {
  dialog({ title: t('show_elsewhere') + ' · ' + c.name, width: '34rem', body: h('div.form', h('p.muted', t('feed_t')), feedBox(c), h('sav-details.pfold', { summary: t('how_add'), appearance: 'plain' }, howOut()), h('p.muted.small', t('feed_delay'))), actions: [{ label: t('close'), primary: true }] });
}

/** Everything about the other calendars in one place: show SavCalendar there, bring them here. */
export function syncDialog(screen) {
  const own = S.calendars.filter((c) => c.kind === 'local');
  const out = h('div.form', h('p.muted', t('sync_out_t')), h('h3', t('feed_all')), h('p.muted.small', t('feed_all_t')), feedBox(null),
    h('h3', t('feed_each')), h('div.stack', own.map((c) => h('div.crow.feedrow', h('i.cdot', { style: `--c:${c.color}` }), h('div.cname', h('span', c.name), h('small.muted', c.feed ? t('shared_feed') : t('not_shared'))), btn(c.feed ? t('manage') : t('feed_on'), { size: 'sm', onclick: () => { d.hide(); feedDialog(calById(c.id)); } })))),
    h('sav-details.pfold', { summary: t('how_add'), appearance: 'plain' }, howOut()), h('p.muted.small', t('feed_delay')));
  const inn = h('div.form', h('p.muted', t('sync_in_t')),
    h('div.choice2', h('sav-card.ch', h('div.stack', h('b', icon('rss'), ' ', t('subscribe')), h('small.muted', t('subscribe_short')), btn(t('subscribe_btn'), { size: 'sm', onclick: () => { d.hide(); subscribeDialog(screen); } }))),
      h('sav-card.ch', h('div.stack', h('b', icon('import'), ' ', t('import_file')), h('small.muted', t('import_short')), btn(t('import_btn'), { size: 'sm', onclick: () => { d.hide(); importDialog(screen); } })))),
    h('sav-alert', { variant: 'neutral', appearance: 'soft' }, icon('info', { slot: 'icon' }), t('two_way_note')));
  const tabs = h('sav-tabs', {}, h('sav-tab', { name: 'out', label: t('sync_out'), icon: 'rss' }, out), h('sav-tab', { name: 'in', label: t('sync_in'), icon: 'import' }, inn));
  const d = dialog({ title: t('sync'), width: '38rem', body: tabs, actions: [{ label: t('close'), primary: true }] });
}

void empty; void getLang;
