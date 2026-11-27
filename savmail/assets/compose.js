/**
 * Writing a message: new, reply, reply to all, forward, or a draft opened again. From any connected mailbox; to, cc and
 * bcc as chips; a small toolbar for the text (bold, italic, underline, lists, quote, link); attachments up to 20 MB in all
 * (a forward keeps the ones of the original, read again by the server). The draft is kept in the Drafts of the mailbox
 * every half minute while something changes, and when the window closes without sending.
 * The text is sent as HTML and as plain text; the server cleans the HTML again before it leaves.
 */
import { btn, confirm, h, icon, iconBtn, put, select, toast, errText, K } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api } from './store.js';

const MAX = 20 * 1024 * 1024;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtAddr = (p) => p.name ? `${p.name} <${p.email}>` : p.email;
/** "Ada <ada@x.it>" or "ada@x.it" → {name, email} */
const parseAddr = (s) => { const m = String(s).trim().match(/^(.*?)\s*<([^<>]+)>$/); return m ? { name: m[1].replace(/^"|"$/g, '').trim(), email: m[2].trim() } : { name: '', email: String(s).trim() }; };
const prefix = (p, s) => (new RegExp('^\\s*' + p + '\\s*:', 'i').test(s || '') ? s : `${p === 'fwd' ? 'Fwd' : 'Re'}: ${s || ''}`).trim();

function readFile(f) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
}

export function composeDialog(o) {
  const own = new Set(S.accounts.map((a) => a.email.toLowerCase()));
  let a = S.accounts.find((x) => x.id === o.a) || S.accounts[0];
  const m = o.msg || null, mode = o.mode || 'new';
  let draftUid = mode === 'draft' ? m.uid : 0, dirty = false, sent = false, saving = null, files = [];
  let fwd = mode === 'forward' && m?.atts?.length ? { f: m.f, uid: m.uid, parts: m.atts.map((x) => x.part), list: [...m.atts] } : null;

  // ---------------------------------------------------------------- who
  let to = [], cc = [], subject = '';
  if (mode === 'reply' || mode === 'all') {
    const back = m.replyTo?.length ? m.replyTo : [m.from];
    to = back.filter((p) => p?.email);
    if (own.has(m.from?.email?.toLowerCase()) && m.to?.length) to = m.to; // replying to what I sent: to the same people
    if (mode === 'all') {
      const seen = new Set(to.map((p) => p.email.toLowerCase()));
      for (const p of m.to || []) if (!seen.has(p.email.toLowerCase()) && !own.has(p.email.toLowerCase())) { to.push(p); seen.add(p.email.toLowerCase()); }
      cc = (m.cc || []).filter((p) => !seen.has(p.email.toLowerCase()) && !own.has(p.email.toLowerCase()));
    }
    subject = prefix('re', m.subject);
    // the reply leaves from the mailbox the message was sent to
    const mine = [...(m.to || []), ...(m.cc || [])].find((p) => own.has(p.email.toLowerCase()));
    if (mine) a = S.accounts.find((x) => x.email.toLowerCase() === mine.email.toLowerCase()) || a;
  } else if (mode === 'forward') subject = prefix('fwd', m.subject);
  else if (mode === 'draft') { to = m.to || []; cc = m.cc || []; subject = m.subject || ''; }
  if (o.to) to = String(o.to).split(/[,;]/).map(parseAddr).filter((p) => p.email);

  // ---------------------------------------------------------------- the text
  const sig = (acc) => acc.signature ? `<div class="ml-sig"><br>-- <br>${acc.signature}</div>` : '';
  const quoteHead = (msg) => t('wrote', { date: msg.date ? new Date(msg.date).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' }) : '', who: esc(fmtAddr(msg.from || { email: '' })) });
  let body = '<p><br></p>';
  if (mode === 'reply' || mode === 'all') body = `<p><br></p>${sig(a)}<div class="ml-quote"><p>${quoteHead(m)}</p><blockquote type="cite">${m.html || esc(m.text)}</blockquote></div>`;
  else if (mode === 'forward') body = `<p><br></p>${sig(a)}<div class="ml-quote"><p>---------- ${esc(t('fwd_head'))} ----------<br>${esc(t('from'))}: ${esc(fmtAddr(m.from))}<br>${esc(t('date'))}: ${esc(m.date ? new Date(m.date).toLocaleString(getLang()) : '')}<br>${esc(t('subject'))}: ${esc(m.subject)}<br>${esc(t('to'))}: ${esc((m.to || []).map(fmtAddr).join(', '))}</p>${m.html || esc(m.text)}</div>`;
  else if (mode === 'draft') body = m.html || esc(m.text);
  else body = `<p><br></p>${sig(a)}`;

  // ---------------------------------------------------------------- the fields
  const chips = (label, list) => { const c = h('sav-chip-input.addr', { label, size: 'sm', separators: ', ; enter', placeholder: t('addr_hint') }); c.value = list.map(fmtAddr); c.addEventListener('change', () => { dirty = true; }); c.addEventListener('keydown', (e) => e.stopPropagation()); return c; };
  const fromSel = select(t('from'), S.accounts.map((x) => [x.id, x.name ? `${x.name} <${x.email}>` : x.email]), a.id, (v) => { const old = a; a = S.accounts.find((x) => x.id === v) || a; swapSig(old, a); dirty = true; }, { class: 'cfrom' });
  const toF = chips(t('to'), to), ccF = chips(t('cc'), cc), bccF = chips(t('bcc'), []);
  const subj = h('sav-input.csubj', { label: t('subject'), size: 'sm', value: subject, maxlength: 900 });
  subj.addEventListener('input', () => { dirty = true; });
  subj.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); ed.focus(); } });
  const showCc = !!cc.length;
  ccF.hidden = !showCc; bccF.hidden = true;
  const ccBtn = btn(t('cc_bcc'), { size: 'sm', appearance: 'ghost', class: 'ccbtn', hidden: showCc, onclick: () => { ccF.hidden = false; bccF.hidden = false; ccBtn.hidden = true; ccF.focus?.(); } });

  const ed = h('div.editor', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('message'), spellcheck: 'true', lang: getLang(), html: body });
  ed.addEventListener('input', () => { dirty = true; });
  ed.addEventListener('keydown', (e) => { e.stopPropagation(); if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); } });
  const swapSig = (from, toAcc) => { const s = ed.querySelector('.ml-sig'); if (s) { if (toAcc.signature) s.innerHTML = `<br>-- <br>${toAcc.signature}`; else s.remove(); } else if (toAcc.signature) ed.querySelector('.ml-quote')?.insertAdjacentHTML('beforebegin', sig(toAcc)); };

  const cmd = (c, v) => { ed.focus(); document.execCommand(c, false, v); dirty = true; };
  const link = () => { const u = prompt(t('link_address'), 'https://'); if (u && /^(https?:|mailto:)/i.test(u)) cmd('createLink', u); };
  const bar = h('div.cbar',
    iconBtn('bold', t('bold'), () => cmd('bold'), { kbd: 'Mod+B' }), iconBtn('italic', t('italic'), () => cmd('italic'), { kbd: 'Mod+I' }), iconBtn('underline', t('underline'), () => cmd('underline'), { kbd: 'Mod+U' }),
    h('span.tsep'), iconBtn('list', t('list_bullet'), () => cmd('insertUnorderedList')), iconBtn('list-ordered', t('list_number'), () => cmd('insertOrderedList')), iconBtn('quote', t('quote'), () => cmd('formatBlock', 'blockquote')),
    iconBtn('link', t('link'), link), iconBtn('remove-formatting', t('clear_format'), () => cmd('removeFormat')),
    h('span.spacer'), iconBtn('paperclip', t('attach'), () => pickFiles()));
  const attList = h('div.catts');
  const drawAtts = () => {
    const total = files.reduce((s, f) => s + f.size, 0);
    put(attList,
      ...(fwd?.list || []).map((x) => h('span.cfile', icon('paperclip'), h('span', x.name), h('small', size(x.size)), iconBtn('x', t('remove'), () => { fwd.list = fwd.list.filter((y) => y !== x); fwd.parts = fwd.list.map((y) => y.part); drawAtts(); }))),
      ...files.map((f) => h('span.cfile', icon('paperclip'), h('span', f.name), h('small', size(f.size)), iconBtn('x', t('remove'), () => { files = files.filter((y) => y !== f); dirty = true; drawAtts(); }))),
      total > MAX ? h('sav-alert', { variant: 'danger' }, t('err_attachments_big')) : null);
  };
  const size = (n) => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const pickFiles = () => { const i = h('input', { type: 'file', multiple: true }); i.addEventListener('change', () => { files.push(...i.files); dirty = true; drawAtts(); }); i.click(); };
  ed.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); ed.classList.add('drop'); } });
  ed.addEventListener('dragleave', () => ed.classList.remove('drop'));
  ed.addEventListener('drop', (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); ed.classList.remove('drop'); files.push(...e.dataTransfer.files); dirty = true; drawAtts(); });
  drawAtts();

  // ---------------------------------------------------------------- sending and drafts
  const err = h('sav-alert.cerr', { variant: 'danger', hidden: true });
  const addrs = (f) => [...f.value, ...(f.text?.trim() ? [f.text.trim()] : [])].map(parseAddr).filter((p) => p.email);
  const payload = async () => {
    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > MAX) throw Object.assign(new Error(), { code: 'attachments_big' });
    const clone = ed.cloneNode(true);
    clone.querySelectorAll('img[data-held]').forEach((i) => i.remove());
    return {
      a: a.id, to: addrs(toF), cc: addrs(ccF), bcc: addrs(bccF), subject: subj.value, html: clone.innerHTML, text: ed.innerText,
      atts: await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type || 'application/octet-stream', data: await readFile(f) }))),
      fwd: fwd && fwd.parts.length ? { f: fwd.f, uid: fwd.uid, parts: fwd.parts } : null,
      inReplyTo: (mode === 'reply' || mode === 'all') ? m.messageId : mode === 'draft' ? m.inReplyTo : '',
      references: (mode === 'reply' || mode === 'all') ? `${m.references || ''} ${m.messageId || ''}`.trim() : mode === 'draft' ? m.references : '',
      replyUid: (mode === 'reply' || mode === 'all' || mode === 'forward') ? m.uid : 0, replyFolder: m?.f || '', forward: mode === 'forward', draftUid,
    };
  };
  const saveDraft = async (quiet) => {
    if (saving) return saving;
    saving = (async () => {
      try { const r = await api('ml.draft', await payload()); draftUid = r.uid || 0; dirty = false; if (!quiet) toast(t('draft_saved'), 'success'); }
      catch (e) { if (!quiet) { err.textContent = errText(e); err.hidden = false; } }
      finally { saving = null; }
    })();
    return saving;
  };
  const sendBtn = h('sav-button', { slot: 'footer', variant: 'primary', appearance: 'solid', icon: 'send', title: K('Mod+Enter') }, t('send'));
  async function send() {
    if (sendBtn.loading) return;
    err.hidden = true;
    const p = await payload().catch((e) => { err.textContent = errText(e); err.hidden = false; return null; });
    if (!p) return;
    if (!p.to.length && !p.cc.length && !p.bcc.length) { err.textContent = t('err_no_recipients'); err.hidden = false; toF.focus?.(); return; }
    if (!p.subject.trim() && !await confirm(t('no_subject_q'), t('no_subject_t'), t('send'), false)) return;
    sendBtn.loading = true;
    try {
      await saving;
      const r = await api('ml.send', p);
      sent = true;
      toast(t(r.warn ? 'sent_warn' : 'sent_ok'), r.warn ? 'warning' : 'success');
      o.sent?.();
      d.hide();
    } catch (e) {
      put(err, h('b', errText(e)), e.data?.server ? h('code.srv', e.data.server) : null);
      err.hidden = false;
    } finally { sendBtn.loading = false; }
  }
  sendBtn.addEventListener('click', send);
  const draftBtn = h('sav-button', { slot: 'footer', appearance: 'outline', variant: 'neutral', icon: 'file-pen' }, t('save_draft'));
  draftBtn.addEventListener('click', async () => { draftBtn.loading = true; await saveDraft(false); draftBtn.loading = false; });
  const discard = h('sav-button', { slot: 'footer', appearance: 'ghost', variant: 'danger', icon: 'trash' }, t('discard'));
  discard.addEventListener('click', async () => {
    if ((dirty || draftUid) && !await confirm(t('discard_q'), t('discard_t'), t('discard'))) return;
    if (draftUid) { const drafts = a.special?.drafts; if (drafts) api('ml.delete', { a: a.id, f: drafts, uids: [draftUid], forever: true }).catch(() => {}); }
    sent = true; // nothing to keep
    d.hide();
  });

  const title = { new: t('new_message'), reply: t('reply'), all: t('reply_all'), forward: t('forward'), draft: t('draft') }[mode];
  const d = h('sav-dialog.compose.keep', { label: title, style: '--width:min(54rem, calc(100vw - 2rem))', 'sheet-on-mobile': true },
    h('div.cform', S.accounts.length > 1 ? fromSel : null, h('div.crow', toF, ccBtn), ccF, bccF, subj, bar, ed, attList, err),
    discard, draftBtn, sendBtn);
  document.body.append(d);
  const timer = setInterval(() => { if (dirty && !sent && !sendBtn.loading) saveDraft(true); }, 30000);
  d.addEventListener('sav-request-close', (e) => { if (dirty && !sent && e.detail?.source === 'overlay') e.preventDefault(); });
  d.addEventListener('sav-after-hide', (e) => {
    if (e.target !== d) return;
    clearInterval(timer);
    // closed without sending: what was written stays as a draft
    if (dirty && !sent) saveDraft(true).then(() => toast(t('draft_kept'), 'neutral'));
    d.remove();
  });
  customElements.whenDefined('sav-dialog').then(() => { d.show(); setTimeout(() => { if (!to.length) toF.focus?.(); else { ed.focus(); const r = document.createRange(); r.setStart(ed, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); } }, 120); });
  return d;
}
