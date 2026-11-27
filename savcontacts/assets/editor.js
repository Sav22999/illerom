/**
 * Writing a contact: a large dialog (a sheet on phones). The name on top next to the photo, then every list with its own
 * rows (a label and a value, as many as needed), the birthday (the year can be left out), groups, notes.
 */
import { ask, btn, dialog, h, iconBtn, select, toggle } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api } from './store.js';
import { LABELS, avatar, fullName, labelText } from './people.js';

const blank = { prefix: '', first: '', middle: '', last: '', suffix: '', nickname: '', company: '', department: '', title: '', birthday: '', notes: '', emails: [], phones: [], addresses: [], urls: [], groups: [], favorite: false, photo: null };

/** An image as a square JPEG of 512 px at most (from its middle), as a data: URL. */
async function shrink(file) {
  if (!/^image\//.test(file.type || '')) throw Object.assign(new Error(), { code: 'photo_type' });
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(Object.assign(new Error(), { code: 'photo_type' })); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight), size = Math.min(512, side);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, size, size);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return cv.toDataURL('image/jpeg', 0.86);
  } finally { URL.revokeObjectURL(url); }
}

/** Opens the editor; resolves with the contact saved, or null. o: {groups, favorite} for a new one. */
export function openEditor(c0, o = {}) {
  return new Promise((done) => {
    const c = structuredClone(c0 || { ...blank, groups: o.groups || [], favorite: !!o.favorite });
    let photo; // undefined: as it is · '': taken away · data: URL: the new one
    let saved = null;
    const inp = (k, label, o2 = {}) => { const i = h('sav-input', { label, value: c[k] || '', size: 'sm', maxlength: o2.max || 100, autocomplete: 'off', ...o2.attrs }); i.addEventListener('input', () => { c[k] = i.value; if (/first|last|company/.test(k)) paintPic(); }); return i; };

    // ---- photo and name
    const pic = h('div.edpic');
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const paintPic = () => {
      const a = avatar({ ...c, photo: photo === '' ? null : c.photo, first: c.first || '', last: c.last || '' }, 84);
      if (photo) a.setAttribute('image', photo);
      a.setAttribute('title', t('change_photo'));
      a.addEventListener('click', () => file.click());
      const cam = iconBtn('camera', t('change_photo'), () => file.click(), { class: 'edcam', appearance: 'solid', variant: 'neutral' });
      const del = (photo || (c.photo && photo !== '')) ? iconBtn('x', t('remove_photo'), () => { photo = ''; paintPic(); }, { class: 'edcam', style: 'right:auto;left:-.3rem' }) : null;
      pic.replaceChildren(a, cam, del || '', file);
    };
    file.addEventListener('change', async () => { const f = file.files?.[0]; file.value = ''; if (!f) return; try { photo = await shrink(f); paintPic(); } catch (e) { err(e); } });
    const moreName = !!(c.prefix || c.middle || c.suffix || c.nickname);
    const extra = h('div.grid2', { hidden: !moreName }, inp('prefix', t('prefix'), { max: 40 }), inp('middle', t('middle')), inp('suffix', t('suffix'), { max: 40 }), inp('nickname', t('nickname')));
    const moreBtn = btn(t('more_name'), { size: 'sm', appearance: 'ghost', icon: 'chevron-down', class: 'edmore', hidden: moreName, onclick: () => { extra.hidden = false; moreBtn.hidden = true; } });
    const first = inp('first', t('first'), { attrs: { autofocus: true, autocomplete: 'off' } });
    const top = h('div.edtop', pic, h('div.edname', h('div.grid2', first, inp('last', t('last'))), moreBtn));

    // ---- lists: [label] [value] [×]
    const labelSel = (kind, x) => {
      const opts = [...LABELS[kind]];
      if (!opts.includes(x.label)) opts.push(x.label);
      const s = select(null, [...opts.map((l) => [l, labelText(l)]), ['*', t('l_custom')]], x.label, async (v) => {
        if (v !== '*') { x.label = v; return; }
        const w = await ask(t('label'), t('label'), opts.includes(x.label) && LABELS[kind].includes(x.label) ? '' : x.label, t('ok'));
        if (w) x.label = w.slice(0, 40);
        drawList(kind);
      }, { 'aria-label': t('label') });
      return s;
    };
    const boxes = {};
    const keyType = { emails: 'email', phones: 'tel', urls: 'url' };
    const drawList = (kind) => {
      const box = boxes[kind];
      const rows = c[kind].map((x, i) => {
        const rm = iconBtn('x', t('remove'), () => { c[kind].splice(i, 1); drawList(kind); });
        if (kind === 'addresses') {
          const f = (k, label, attrs = {}) => { const el = h(k === 'street' ? 'sav-textarea' : 'sav-input', { label, value: x[k] || '', size: 'sm', rows: k === 'street' ? 2 : null, ...attrs }); el.addEventListener('input', () => { x[k] = el.value; }); return el; };
          return h('div.edaddr', h('div.edhead', labelSel(kind, x), rm), f('street', t('street')), h('div.grid3', f('code', t('code')), f('city', t('city')), f('region', t('region'))), f('country', t('country')));
        }
        const v = h('sav-input', { value: x.value, size: 'sm', type: keyType[kind], placeholder: t(kind), 'aria-label': t(kind), inputmode: kind === 'phones' ? 'tel' : null });
        v.addEventListener('input', () => { x.value = v.value; });
        return h('div.edrow', labelSel(kind, x), v, rm);
      });
      const add = btn(t({ emails: 'add_email', phones: 'add_phone', addresses: 'add_address', urls: 'add_url' }[kind]), { size: 'sm', appearance: 'ghost', icon: 'plus', onclick: () => {
        c[kind].push(kind === 'addresses' ? { label: 'home', street: '', city: '', region: '', code: '', country: '' } : { label: LABELS[kind][0], value: '' });
        drawList(kind);
        (kind === 'addresses' ? [...box.querySelectorAll('.edaddr')].pop()?.querySelector('sav-textarea') : box.querySelectorAll('sav-input')[c[kind].length - 1])?.focus?.();
      } });
      box.replaceChildren(...rows, h('div', add));
    };
    const listSec = (kind, ic) => { boxes[kind] = h('div.edsec'); drawList(kind); return h('div.edsec', h('span.flabel', h('sav-icon', { name: ic }), t(kind)), boxes[kind]); };

    // ---- birthday: day, month, year (optional)
    const b = c.birthday || '';
    const bd = { d: b ? String(+b.slice(-2)) : '', m: b ? String(+b.slice(-5, -3)) : '', y: b && b[0] !== '-' ? b.slice(0, 4) : '' };
    const months = Array.from({ length: 12 }, (_, i) => [String(i + 1), new Date(2000, i, 1).toLocaleDateString(getLang(), { month: 'long' })]);
    const daySel = select(t('day_l'), [['', '—'], ...Array.from({ length: 31 }, (_, i) => [String(i + 1), String(i + 1)])], bd.d, (v) => { bd.d = v; });
    const monSel = select(t('month_l'), [['', '—'], ...months], bd.m, (v) => { bd.m = v; });
    const year = h('sav-input', { label: t('year_opt'), value: bd.y, size: 'sm', inputmode: 'numeric', maxlength: 4 });
    year.addEventListener('input', () => { bd.y = year.value.replace(/\D/g, ''); });
    const bday = h('div.edsec', h('span.flabel', h('sav-icon', { name: 'cake' }), t('birthday')), h('div.edbday', daySel, monSel, year));

    // ---- groups, favourite, notes
    const chips = S.groups.map((g) => { const ch = h('sav-chip', { value: g.id, selected: c.groups.includes(g.id), size: 'sm' }, h('span.gdot', { slot: 'prefix', style: `--g:${g.color}` }), g.name); ch.addEventListener('change', () => { c.groups = ch.selected ? [...new Set([...c.groups, g.id])] : c.groups.filter((x) => x !== g.id); }); return ch; });
    const groups = chips.length ? h('div.edsec', h('span.flabel', h('sav-icon', { name: 'tag' }), t('groups')), h('div.edgroups', chips)) : null;
    const notes = h('sav-textarea', { label: t('notes'), value: c.notes || '', size: 'sm', rows: 3, maxlength: 5000, resize: 'auto' });
    notes.addEventListener('input', () => { c.notes = notes.value; });
    const fav = toggle(t('favorite'), c.favorite, (v) => { c.favorite = v; });

    const body = h('div.ed', top, extra,
      h('div.grid3', inp('company', t('company'), { max: 160 }), inp('title', t('job'), { max: 160 }), inp('department', t('department'), { max: 160 })),
      listSec('emails', 'mail'), listSec('phones', 'phone'), listSec('addresses', 'map-pin'), listSec('urls', 'globe'), bday, groups, notes, fav);
    body.addEventListener('keydown', (e) => e.stopPropagation());
    paintPic();

    let dlg;
    const err = (e) => { const a = dlg?.querySelector('.dlg-err'); if (a) { a.textContent = t('err_' + (e.code || 'server')); a.hidden = false; } };
    dlg = dialog({ title: c0 ? t('edit_contact') : t('new_contact'), width: '42rem', cls: 'edlg', body, onclose: () => done(saved), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
      let birthday = '';
      if (bd.d && bd.m) birthday = bd.y && bd.y.length === 4 ? `${bd.y}-${bd.m.padStart(2, '0')}-${bd.d.padStart(2, '0')}` : `--${bd.m.padStart(2, '0')}-${bd.d.padStart(2, '0')}`;
      const payload = { id: c0?.id, ...Object.fromEntries(['prefix', 'first', 'middle', 'last', 'suffix', 'nickname', 'company', 'department', 'title', 'notes'].map((k) => [k, (c[k] || '').trim()])),
        birthday, favorite: c.favorite, groups: c.groups,
        emails: c.emails.filter((x) => x.value.trim()), phones: c.phones.filter((x) => x.value.trim()), urls: c.urls.filter((x) => x.value.trim()),
        addresses: c.addresses.filter((a) => [a.street, a.city, a.region, a.code, a.country].some((v) => (v || '').trim())) };
      if (photo !== undefined) payload.photo = photo;
      const r = await api('con.contact.save', payload);
      saved = r.contact;
    } }] });
    // Enter in a one-line field saves (the dialog of ui.js does it for sav-input)
    dlg.setAttribute('aria-label', c0 ? fullName(c0) : t('new_contact'));
  });
}
