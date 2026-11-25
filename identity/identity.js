/*
 * Sign in with SavAccount, and the questions of identity.php: "this address already has an account, is it yours?", the
 * end of a new account, the ways of signing in. Shared by the projects with accounts: each one calls Identity.setup().
 */
window.Identity = (() => {
  'use strict';
  const TEXT = {
    it: {
      sav_button: 'Continua con SavAccount', or_sav: 'SavAccount', google: 'Google', savaccount: 'SavAccount', password: 'Email e password',
      link_title: 'Hai già un account', link_pw: 'Con {email} ti sei registrato con email e password. Inserisci la password di {app} per collegare {p}: poi potrai accedere in entrambi i modi.',
      link_other: 'Con {email} accedi già a {app} con {m}. Conferma che sei tu per collegare {p}: poi potrai accedere in entrambi i modi.', link_none: 'Esiste già un account {app} con {email}. Conferma che sei tu per collegare {p}.',
      pw_label: 'Password di {app}', join: 'Collega e accedi', cancel: 'Annulla', use_code: 'Ricevi un codice via email', use_pw: 'Usa la password', forgot: 'Non ricordi la password? Ricevi un codice via email',
      code_text: 'Abbiamo mandato un codice a {email}. Vale 15 minuti; se non lo vedi, guarda nello spam.', code_label: 'Codice di 6 cifre', resend: 'Manda un altro codice', sent: 'Codice inviato.', confirm_with: 'Conferma con {p}',
      signup_title: 'Crea il tuo account {app}', signup_text: 'Accederai con {p} come {email}.', username: 'Username', invite: 'Codice invito (facoltativo)', privacy_a: 'Ho letto e accetto ', privacy_b: 'l’informativa sulla privacy', terms_b: 'i termini', create: 'Crea account', must_accept: 'Per continuare devi accettare.',
      methods: 'Metodi di accesso', methods_text: 'I modi in cui puoi accedere a {app}. Ne deve restare sempre almeno uno.', set: 'Impostata', not_set: 'Non impostata', linked: 'Collegato', not_linked: 'Non collegato', link: 'Collega', unlink: 'Scollega', close: 'Chiudi', unlink_sure: 'Scollegare {p}? Non potrai più usarlo per accedere a {app}.',
      r_connected: 'SavAccount è collegato: da ora puoi usarlo per accedere.', r_linked: 'Account collegati.', r_cancelled: 'Accesso con SavAccount annullato.', r_failed: 'SavAccount non ha confermato l’accesso. Riprova.', r_expired: 'La richiesta è scaduta. Riprova.', r_taken: 'Questo account è già collegato a un altro profilo di {app}.', r_other: 'Questo indirizzo appartiene a un profilo già collegato a un altro account dello stesso tipo.', r_mismatch: 'Non è lo stesso account: accedi a SavAccount con quello collegato a {app}.', r_disabled: 'Questo account è stato disattivato.',
      e_bad_password: 'Password non corretta.', e_bad_code: 'Codice non corretto o scaduto.', e_link_expired: 'La richiesta è scaduta o ci sono stati troppi tentativi. Ricomincia l’accesso.', e_rate_limited: 'Troppi tentativi. Aspetta qualche minuto e riprova.', e_identity_taken: 'Questo account è già collegato a un altro profilo.', e_identity_other: 'Il profilo è già collegato a un altro account dello stesso tipo.', e_identity_mismatch: 'Non è lo stesso account Google.', e_last_method: 'È l’unico modo che hai per accedere: prima imposta una password o collega un altro account.', e_username_taken: 'Questo username è già in uso.', e_username_invalid: 'Questo username non è valido.', e_username_required: 'Scegli uno username.', e_disabled: 'Questo account è stato disattivato.', e_network: 'Connessione assente. Riprova.', e_mail_off: 'Al momento non è possibile inviare email.', e_server: 'Qualcosa non ha funzionato. Riprova.',
    },
    en: {
      sav_button: 'Continue with SavAccount', or_sav: 'SavAccount', google: 'Google', savaccount: 'SavAccount', password: 'Email and password',
      link_title: 'You already have an account', link_pw: 'You signed up with {email} using an email and password. Enter your {app} password to link {p}: you can then sign in either way.',
      link_other: 'You already sign in to {app} as {email} with {m}. Confirm it is you to link {p}: you can then sign in either way.', link_none: 'There is already a {app} account with {email}. Confirm it is you to link {p}.',
      pw_label: '{app} password', join: 'Link and sign in', cancel: 'Cancel', use_code: 'Get a code by email', use_pw: 'Use the password', forgot: 'Forgot your password? Get a code by email',
      code_text: 'We sent a code to {email}. It works for 15 minutes; if you don’t see it, check your spam.', code_label: '6-digit code', resend: 'Send another code', sent: 'Code sent.', confirm_with: 'Confirm with {p}',
      signup_title: 'Create your {app} account', signup_text: 'You will sign in with {p} as {email}.', username: 'Username', invite: 'Invite code (optional)', privacy_a: 'I have read and accept ', privacy_b: 'the privacy policy', terms_b: 'the terms', create: 'Create account', must_accept: 'You need to accept to continue.',
      methods: 'Sign-in methods', methods_text: 'The ways you can sign in to {app}. At least one must always remain.', set: 'Set', not_set: 'Not set', linked: 'Linked', not_linked: 'Not linked', link: 'Link', unlink: 'Unlink', close: 'Close', unlink_sure: 'Unlink {p}? You will no longer be able to use it to sign in to {app}.',
      r_connected: 'SavAccount is linked: from now on you can use it to sign in.', r_linked: 'Accounts linked.', r_cancelled: 'SavAccount sign-in cancelled.', r_failed: 'SavAccount did not confirm the sign-in. Try again.', r_expired: 'The request has expired. Try again.', r_taken: 'This account is already linked to another {app} profile.', r_other: 'This address belongs to a profile already linked to another account of the same kind.', r_mismatch: 'That is a different account: sign in to SavAccount with the one linked to {app}.', r_disabled: 'This account has been disabled.',
      e_bad_password: 'Wrong password.', e_bad_code: 'Wrong or expired code.', e_link_expired: 'The request has expired or there were too many attempts. Start signing in again.', e_rate_limited: 'Too many attempts. Wait a few minutes and try again.', e_identity_taken: 'This account is already linked to another profile.', e_identity_other: 'The profile is already linked to another account of the same kind.', e_identity_mismatch: 'That is a different Google account.', e_last_method: 'This is your only way to sign in: set a password or link another account first.', e_username_taken: 'This username is already taken.', e_username_invalid: 'This username is not valid.', e_username_required: 'Choose a username.', e_disabled: 'This account has been disabled.', e_network: 'No connection. Try again.', e_mail_off: 'Emails cannot be sent right now.', e_server: 'Something went wrong. Try again.',
    },
  };
  const base = document.currentScript ? new URL('.', document.currentScript.src).href : '/identity/';
  const cfg = { name: document.title, lang: () => document.documentElement.lang, accept: 'acceptPrivacy', acceptUrl: 'privacy.html', accent: '', onAccent: '', google: null, username: null, invite: null, body: () => ({}) };
  const t = (k, v = {}) => ((TEXT[String(cfg.lang()).slice(0, 2)] || TEXT.en)[k] || k).replace(/\{(\w+)\}/g, (m, x) => (x === 'app' ? cfg.name : v[x] ?? m));
  const name = (p) => t(p);
  const errText = (e) => { const s = t('e_' + e.code); return s === 'e_' + e.code ? e.message || t('e_server') : s; };

  // what came back from SavAccount: taken from the address at once, before the app looks at it
  const here = new URL(location.href);
  const arrival = here.searchParams.get('sav');
  if (arrival !== null) { here.searchParams.delete('sav'); history.replaceState(history.state, '', here.pathname + here.search + here.hash); }

  async function call(route, body) {
    const headers = { Accept: 'application/json', 'X-Lang': String(cfg.lang()).slice(0, 2) };
    const init = { method: body ? 'POST' : 'GET', headers, credentials: 'same-origin', cache: 'no-store' };
    if (body) {
      headers['Content-Type'] = 'application/json';
      if (/^auth\.methods/.test(route) || body.mode === 'connect') {
        const me = await call('auth.me');
        if (me.csrf) headers['X-CSRF-Token'] = me.csrf;
      }
      init.body = JSON.stringify(body);
    }
    let r, d;
    try { r = await fetch('api/index.php?r=' + route, init); d = await r.json(); } catch (e) { throw Object.assign(new Error(), { code: r ? 'server' : 'network' }); }
    if (!r.ok || d.ok === false) throw Object.assign(new Error(typeof d.message === 'string' ? d.message : ''), { code: d.error || 'server', data: d });
    return d;
  }

  // ---------- the dialog
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v); }
    n.append(...kids.flat().filter((x) => x !== null && x !== undefined && x !== false));
    return n;
  };
  const dark = () => {
    for (let n = document.body; n; n = n.parentElement) {
      const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
      if (m && (m.length < 4 || +m[3] > .5)) return (m[0] * 299 + m[1] * 587 + m[2] * 114) / 1000 < 128;
    }
    return matchMedia('(prefers-color-scheme: dark)').matches;
  };
  function open(title, onclose) {
    const body = el('div', { class: 'idl-body' });
    const h = el('h2', { id: 'idl-title' }, title);
    const d = el('dialog', { class: 'idl' + (dark() ? ' idl-dark' : ''), 'aria-labelledby': 'idl-title' }, h, body);
    if (cfg.accent) d.style.setProperty('--idl-accent', cfg.accent);
    if (cfg.onAccent) d.style.setProperty('--idl-on-accent', cfg.onAccent);
    document.body.append(d);
    d.addEventListener('close', () => { d.remove(); onclose?.(); });
    // keys and clicks stay in the dialog: some projects listen on the whole page
    for (const ev of ['keydown', 'keyup', 'pointerdown', 'click']) d.addEventListener(ev, (e) => e.stopPropagation());
    d.showModal();
    return { d, body, title: (s) => { h.textContent = s; }, close: () => d.close() };
  }
  const button = (label, onclick, kind = '') => el('button', { type: 'button', class: 'idl-b ' + kind, onclick }, label);
  const message = () => el('p', { class: 'idl-msg', role: 'alert', hidden: true });
  const say = (m, text, good) => { m.hidden = !text; m.textContent = text || ''; m.classList.toggle('good', !!good); };
  const field = (label, input, hint) => el('label', { class: 'idl-f' }, el('span', {}, label), input, hint ? el('small', {}, hint) : null);
  async function busy(b, f) { b.disabled = true; try { return await f(); } finally { b.disabled = false; } }

  function note(text) {
    const w = open(cfg.name);
    w.body.append(el('p', {}, text), el('div', { class: 'idl-row' }, button(t('close'), () => w.close(), 'main')));
  }

  // ---------- an address that already has an account
  function link(info) {
    const p = name(info.provider);
    let done = false;
    const w = open(t('link_title'), () => { if (!done) call('auth.link.cancel', {}).catch(() => {}); });
    const m = message();
    const stop = button(t('cancel'), () => w.close());
    const finish = async (b, body) => {
      say(m, '');
      try { await busy(b, () => call('auth.link', { ...cfg.body(), ...(cfg.invite ? { inviteCode: cfg.invite() } : {}), ...body })); done = true; location.reload(); } catch (e) {
        if (e.code === 'link_expired') { w.body.replaceChildren(el('p', {}, errText(e)), el('div', { class: 'idl-row' }, button(t('close'), () => w.close(), 'main'))); return; }
        say(m, errText(e));
      }
    };
    const others = (skip) => {
      const list = [];
      for (const o of ['google', 'savaccount']) {
        if (!info.methods[o] || o === info.provider) continue;
        if (o === 'savaccount') list.push(button(t('confirm_with', { p: name(o) }), () => { done = true; start('confirm').catch((e) => { done = false; say(m, errText(e)); }); }));
        else if (cfg.google) { const slot = el('div', { class: 'idl-google' }); list.push(slot); setTimeout(() => cfg.google(slot, (credential) => finish(stop, { method: 'google', credential })), 0); }
      }
      if (skip !== 'password' && info.methods.password) list.push(button(t('use_pw'), withPassword, 'plain'));
      if (skip !== 'code' && info.methods.code) list.push(button(skip === 'password' ? t('forgot') : t('use_code'), sendCode, 'plain'));
      return list;
    };
    function withPassword() {
      const pw = el('input', { type: 'password', autocomplete: 'current-password', required: true });
      const go = el('button', { type: 'submit', class: 'idl-b main' }, t('join'));
      w.body.replaceChildren(el('p', {}, t('link_pw', { email: info.email, p })),
        el('form', { onsubmit: (e) => { e.preventDefault(); if (pw.value) finish(go, { method: 'password', password: pw.value }); } },
          el('input', { type: 'email', autocomplete: 'username', value: info.email, readonly: true, hidden: true }), field(t('pw_label'), pw), m, el('div', { class: 'idl-row' }, stop, go)),
        ...others('password'));
      pw.focus();
    }
    async function sendCode() {
      say(m, '');
      try { await call('auth.link.code', {}); } catch (e) { say(m, errText(e)); if (!m.isConnected) w.body.append(m); return; }
      const c = el('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, pattern: '[0-9 ]*', required: true });
      const go = el('button', { type: 'submit', class: 'idl-b main' }, t('join'));
      w.body.replaceChildren(el('p', {}, t('code_text', { email: info.email })),
        el('form', { onsubmit: (e) => { e.preventDefault(); if (c.value.trim()) finish(go, { method: 'code', code: c.value }); } }, field(t('code_label'), c), m, el('div', { class: 'idl-row' }, stop, go)),
        button(t('resend'), async () => { try { await call('auth.link.code', {}); say(m, t('sent'), true); } catch (e) { say(m, errText(e)); } }, 'plain'), ...others('code'));
      c.focus();
    }
    if (info.methods.password) return withPassword();
    const has = ['google', 'savaccount'].filter((o) => info.methods[o] && o !== info.provider).map(name).join(', ');
    w.body.replaceChildren(el('p', {}, has ? t('link_other', { email: info.email, p, m: has }) : t('link_none', { email: info.email, p })), ...others(''), m, el('div', { class: 'idl-row' }, stop));
  }

  // ---------- a new account that came from SavAccount
  function signup(info) {
    const w = open(t('signup_title'));
    const m = message();
    const user = cfg.username ? el('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: 30, required: true, value: info.suggest || '' }) : null;
    const inv = cfg.invite && cfg.inviteField ? el('input', { type: 'text', maxlength: 12, autocapitalize: 'characters', value: cfg.invite() || '' }) : null;
    const ok = el('input', { type: 'checkbox' });
    const go = el('button', { type: 'submit', class: 'idl-b main' }, t('create'));
    w.body.append(el('p', {}, t('signup_text', { p: name(info.provider), email: info.email })),
      el('form', { novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        if (!ok.checked) return say(m, t('must_accept'));
        say(m, '');
        try {
          await busy(go, () => call('auth.sav', { ...cfg.body(), [cfg.accept]: true, ...(user ? { username: user.value.trim() } : {}), inviteCode: inv ? inv.value : cfg.invite ? cfg.invite() : '' }));
          location.reload();
        } catch (x) { if (x.code === 'link_needed') { w.close(); link(x.data.link); } else say(m, errText(x)); }
      } }, user ? field(t('username'), user, cfg.username[String(cfg.lang()).slice(0, 2)] || cfg.username.en) : null, inv ? field(t('invite'), inv) : null,
      el('label', { class: 'idl-c' }, ok, el('span', {}, t('privacy_a'), el('a', { href: typeof cfg.acceptUrl === 'function' ? cfg.acceptUrl() : cfg.acceptUrl, target: '_blank', rel: 'noopener' }, t(cfg.accept === 'acceptTerms' ? 'terms_b' : 'privacy_b')))),
      m, el('div', { class: 'idl-row' }, button(t('cancel'), () => { call('auth.link.cancel', {}).catch(() => {}); w.close(); }), go)));
    (user || ok).focus();
  }

  // ---------- the ways of signing in, from the profile
  async function methods() {
    let d;
    try { d = await call('auth.methods'); } catch (e) { return note(errText(e)); }
    const w = open(t('methods'));
    const m = message();
    const draw = () => {
      const row = (p, on, act) => el('div', { class: 'idl-m' }, el('div', {}, el('b', {}, name(p)), el('small', {}, p === 'password' ? (on ? t('set') : t('not_set')) : on ? t('linked') : t('not_linked'))), act || '');
      const un = (p) => button(t('unlink'), async (e) => {
        if (!e.currentTarget.dataset.sure) { e.currentTarget.dataset.sure = '1'; return say(m, t('unlink_sure', { p: name(p) })); }
        try { d = await call('auth.methods.unlink', { provider: p }); say(m, ''); draw(); } catch (x) { say(m, errText(x)); }
      });
      let google = null;
      if (!d.google && d.available.google && cfg.google) { google = el('div', { class: 'idl-google' }); setTimeout(() => cfg.google(google, async (credential) => { try { d = await call('auth.methods.link', { provider: 'google', credential }); say(m, ''); draw(); } catch (x) { say(m, errText(x)); } }), 0); }
      w.body.replaceChildren(el('p', {}, t('methods_text')), row('password', d.password),
        d.google || d.available.google ? row('google', d.google, d.google ? un('google') : null) : null, google,
        d.savaccount || available(d.available.savaccount) ? row('savaccount', d.savaccount, d.savaccount ? un('savaccount') : button(t('link'), () => start('connect').catch((x) => say(m, errText(x))))) : null,
        m, el('div', { class: 'idl-row' }, button(t('close'), () => w.close(), 'main')));
      w.body.querySelectorAll(':scope > *').forEach((n) => { if (n.nodeType === 3) n.remove(); });
    };
    draw();
  }

  // ---------- SavAccount
  /** Not inside the Android apps published before SavAccount: there its page would open outside the app. */
  const available = (on) => !!on && !(/App\/Android/.test(navigator.userAgent) && !/ SavAccount\b/.test(navigator.userAgent));
  async function start(mode) { location.href = (await call('auth.sav.start', { mode })).url; }
  function savButton(enabled) {
    if (!available(enabled)) return null;
    const b = el('button', { type: 'button', class: 'idl-sav' + (dark() ? ' idl-dark' : '') }, el('img', { src: base + 'savaccount.svg', alt: '', width: 20, height: 20 }), t('sav_button'));
    b.addEventListener('click', () => busy(b, () => start('login')).catch((e) => note(errText(e))));
    return b;
  }

  async function arrive() {
    if (arrival === null || arrival === 'in') return;
    if (arrival === 'link' || arrival === 'signup') {
      try { const d = await call('auth.link'); if (d.link) return link(d.link); if (d.signup) return signup(d.signup); } catch (e) { return note(errText(e)); }
      return note(t('r_expired'));
    }
    const s = t('r_' + arrival);
    if (s !== 'r_' + arrival) note(s);
  }

  return {
    setup(o) { Object.assign(cfg, o); if (document.readyState === 'complete') arrive(); else addEventListener('load', arrive, { once: true }); },
    button: savButton, link, methods, start,
    /** For the error of a Google sign-in: true when it has been handled here. */
    handle(e) { const d = e && (e.data || e); if (d && d.error === 'link_needed' && d.link) { link(d.link); return true; } return false; },
    text: (k) => t(k),
  };
})();
