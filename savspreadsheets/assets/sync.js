/**
 * Saving and working together. The changes of the grid wait in a queue, leave every second or so and come back with what
 * the others did. The server numbers every group of changes and the last one that reaches it wins: a change of someone
 * else is applied here unless a change of this browser to the same cell came after it (or has not left yet). What is not
 * saved yet is also kept in this browser, so nothing is lost without a connection.
 */
import { api } from './store.js';

const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

export class Sync {
  /** apply(ops): shows the changes of the others (already filtered) in the grid. */
  constructor({ pid, rev, role, stamp, apply, on }) {
    Object.assign(this, { pid, rev, role, stamp, apply, on });
    this.client = hex(6);
    this.queue = [];
    this.flying = null;
    this.block = '';
    this.people = [];
    this.key = 'savspreadsheets-unsaved-' + pid;
    this.vis = () => this.tick(0);
    document.addEventListener('visibilitychange', this.vis);
    this.online = () => this.tick(0);
    addEventListener('online', this.online);
    this.tick(1500);
  }
  get pending() { return this.queue.length > 0 || !!this.flying; }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.vis);
    removeEventListener('online', this.online);
  }
  /** Changes left here by a page that closed before saving: given back to be applied again. */
  recover() {
    let old = [];
    try { old = JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { /* unreadable */ }
    localStorage.removeItem(this.key);
    return Array.isArray(old) ? old : [];
  }
  push(ops) {
    for (const o of ops) {
      const last = this.queue.at(-1);
      if (o.t === 'cells' && last?.t === 'cells' && last.s === o.s) { last.m = { ...last.m, ...o.m }; continue; }
      if (o.t === 'settings' || o.t === 'title') this.queue = this.queue.filter((q) => q.t !== o.t);
      this.queue.push(structuredClone(o));
    }
    this.remember();
    this.on.state('saving');
    this.tick(900);
  }
  remember() {
    const all = [...(this.flying || []), ...this.queue];
    try { if (all.length) localStorage.setItem(this.key, JSON.stringify(all)); else localStorage.removeItem(this.key); } catch { /* full */ }
  }
  tick(ms) {
    if (this.stopped) return;
    const at = Date.now() + ms;
    if (this.timer && this.at <= at && this.at > Date.now() - 50) return;
    clearTimeout(this.timer);
    this.at = at;
    this.timer = setTimeout(() => this.run(), ms);
  }
  next() { return this.queue.length ? 900 : document.hidden ? 40000 : this.people.length ? 2000 : 7000; }
  /** The cells (and parts of sheets) this browser changed and the server has not confirmed yet. */
  static keys(ops) {
    const cells = new Set(), props = new Set(), shifted = new Set();
    for (const o of ops || []) {
      if (o.t === 'cells') for (const k in o.m) cells.add(o.s + '!' + k);
      else if (o.t === 'sheet') for (const k in o.p) props.add(o.id + '.' + k);
      else if (o.t === 'shift') shifted.add(o.s);
      else if (o.t === 'settings' || o.t === 'title') props.add(o.t);
    }
    return { cells, props, shifted };
  }
  async run() {
    this.timer = null;
    if (this.stopped || this.busy) return;
    if (this.on.busy?.()) { this.tick(500); return; }
    this.busy = true;
    // big pastes go in parts, so a request never grows too much
    let size = 0, n = 0;
    for (; n < this.queue.length && n < 500; n++) { size += this.queue[n].t === 'cells' ? Object.keys(this.queue[n].m).length : 1; if (size > 40000 && n) break; }
    const ops = this.queue.splice(0, n);
    this.flying = ops.length ? ops : null;
    try {
      const d = await api('doc.sync', { doc: this.pid, client: this.client, rev: this.rev, block: this.block, ops });
      if (this.stopped) return;
      const sent = Sync.keys(ops);
      this.flying = null;
      this.fails = 0;
      if (d.role !== this.role) { this.role = d.role; this.on.role(d.role); return; }
      if (d.reload) { this.remember(); this.on.reload(); return; }
      const waiting = Sync.keys(this.queue);
      let again = false, rules = false;
      // what the rules of a sheet or a protected range did not allow comes back as it is on the server
      const back = (d.refused || []).filter((o) => o.t === 'cells');
      if (back.length) { this.apply(back); this.on.refused?.(); }
      if ((d.refused || []).some((o) => o.t === 'reload')) { this.on.refused?.(); this.remember(); this.on.reload(true); return; }
      for (const b of d.news || []) {
        const later = b.rev > (d.mine || 0); // came after the own changes of this round
        const out = [];
        for (const o of b.ops) {
          if (o.t === 'reload') { rules = true; continue; }
          if (o.t === 'cells') {
            const m = {};
            let any = false;
            for (const [k, c] of Object.entries(o.m)) { const id = o.s + '!' + k; if (waiting.cells.has(id) || (sent.cells.has(id) && !later)) continue; m[k] = c; any = true; }
            if (any) out.push({ ...o, m });
          } else if (o.t === 'sheet') {
            const p = {};
            for (const [k, v] of Object.entries(o.p)) { const id = o.id + '.' + k; if (waiting.props.has(id) || (sent.props.has(id) && !later)) continue; p[k] = v; }
            if (Object.keys(p).length) out.push({ ...o, p });
          } else if ((o.t === 'settings' || o.t === 'title') && (waiting.props.has(o.t) || (sent.props.has(o.t) && !later))) continue;
          else {
            // rows or columns moved by someone else while own cells of that sheet were on the way: read it all again after
            if (o.t === 'shift' && ([...waiting.cells].some((x) => x.startsWith(o.s + '!')) || ([...sent.cells].some((x) => x.startsWith(o.s + '!')) && !later))) again = true;
            out.push(o);
          }
        }
        if (out.length) this.apply(out);
      }
      this.rev = d.rev;
      this.people = d.people || [];
      this.on.people(this.people);
      if (d.stamp !== this.stamp) { this.stamp = d.stamp; this.on.comments(); }
      this.remember();
      this.on.state(this.queue.length ? 'saving' : 'saved');
      if (rules || (again && !this.queue.length)) { this.on.reload(true); return; }
    } catch (e) {
      if (this.stopped) return;
      if (this.flying) { this.queue = [...this.flying, ...this.queue]; this.flying = null; }
      if (['network', 'server', 'rate_limited'].includes(e.code)) {
        this.fails = (this.fails || 0) + 1;
        this.on.state(e.code === 'network' ? 'offline' : 'saving');
        this.busy = false;
        this.tick(Math.min(30000, 2000 * this.fails));
        return;
      }
      this.on.error(e);
      this.stop();
      return;
    } finally {
      this.busy = false;
    }
    this.tick(this.next());
  }
  async flush() {
    for (let i = 0; i < 30 && (this.pending || this.busy) && !this.stopped; i++) {
      clearTimeout(this.timer);
      this.timer = null;
      if (this.busy) await new Promise((r) => setTimeout(r, 120)); else await this.run();
    }
  }
}
