/**
 * Saving and working together. The operations of the editor wait in a queue, leave every second or so and come back with
 * what the others did. When two people change the same block the two changes are merged; if they overlap, the last one
 * stays. What is not saved yet is also kept in this browser, so nothing is lost without a connection.
 */
import {api} from './store.js';
import {merge3} from './editor.js';

const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

export class Sync {
    constructor({pid, rev, role, editor, stamp, on}) {
        Object.assign(this, {pid, rev, role, editor, stamp, on});
        this.client = hex(6);
        this.queue = [];
        this.flying = null;
        this.block = '';
        this.people = [];
        this.key = 'savdocuments-unsaved-' + pid;
        this.vis = () => {
            if (!document.hidden) this.tick(0); else this.tick(0);
        };
        document.addEventListener('visibilitychange', this.vis);
        this.online = () => this.tick(0);
        addEventListener('online', this.online);
        this.tick(1500);
    }

    get pending() {
        return this.queue.length > 0 || !!this.flying;
    }

    stop() {
        this.stopped = true;
        clearTimeout(this.timer);
        document.removeEventListener('visibilitychange', this.vis);
        removeEventListener('online', this.online);
    }

    /** Changes left here by a page that closed before saving. */
    recover() {
        let old = [];
        try {
            old = JSON.parse(localStorage.getItem(this.key) || '[]');
        } catch { /* unreadable */
        }
        const ed = this.editor;
        const ops = old.filter((o) => (o.t === 'set' ? ed.blocks.has(o.id) && ed.blocks.get(o.id).h !== o.h : o.t === 'ins' ? !ed.blocks.has(o.id) : false));
        for (const o of ops) if (o.t === 'set' && o.base !== undefined && o.base !== ed.blocks.get(o.id).base) {
            const m = merge3(o.base, o.h, ed.blocks.get(o.id).h);
            if (m) o.h = m;
        }
        if (!ops.length) {
            localStorage.removeItem(this.key);
            return false;
        }
        ed.apply(ops);
        this.push(ops);
        return true;
    }

    push(ops) {
        for (const o of ops) {
            if (o.t === 'set') {
                const i = this.queue.findIndex((q) => (q.t === 'set' || q.t === 'ins') && q.id === o.id);
                if (i >= 0 && !this.queue.slice(i + 1).some((q) => q.id === o.id)) {
                    this.queue[i] = {...this.queue[i], h: o.h};
                    continue;
                }
            }
            if (o.t === 'del') this.queue = this.queue.filter((q) => !(q.t === 'set' && q.id === o.id));
            if (o.t === 'settings' || o.t === 'title') this.queue = this.queue.filter((q) => q.t !== o.t);
            this.queue.push({...o});
        }
        this.remember();
        this.on.state('saving');
        this.tick(1100);
    }

    remember() {
        const all = [...(this.flying || []), ...this.queue].filter((o) => o.t === 'set' || o.t === 'ins').map((o) => ({
            ...o,
            base: this.editor.blocks.get(o.id)?.base
        }));
        try {
            if (all.length) localStorage.setItem(this.key, JSON.stringify(all)); else localStorage.removeItem(this.key);
        } catch { /* full */
        }
    }

    tick(ms) {
        if (this.stopped) return;
        const at = Date.now() + ms;
        if (this.timer && this.at <= at && this.at > Date.now() - 50) return;
        clearTimeout(this.timer);
        this.at = at;
        this.timer = setTimeout(() => this.run(), ms);
    }

    next() {
        return this.queue.length ? 1100 : document.hidden ? 40000 : this.people.length ? 2200 : 7000;
    }

    async run() {
        this.timer = null;
        if (this.stopped || this.busy) return;
        this.busy = true;
        if (this.editor.composing) {
            this.busy = false;
            this.tick(600);
            return;
        }
        this.editor.scan();
        const ops = this.queue.splice(0, 1500);
        this.flying = ops.length ? ops : null;
        const ed = this.editor;
        try {
            const d = await api('doc.sync', {
                doc: this.pid,
                client: this.client,
                rev: this.rev,
                block: this.block,
                ops: ops.map((o) => (o.t === 'set' ? {...o, v: ed.blocks.get(o.id)?.v || 0} : o))
            });
            if (this.stopped) return;
            this.flying = null;
            this.fails = 0;
            if (d.role !== this.role) {
                this.role = d.role;
                this.on.role(d.role);
                return;
            }
            if (d.reload) {
                this.on.reload();
                return;
            }
            const sent = new Map(ops.filter((o) => o.t === 'set' || o.t === 'ins').map((o) => [o.id, o.h]));
            for (const a of d.applied) {
                const b = ed.blocks.get(a.id);
                if (b && (a.t === 'set' || a.t === 'ins')) {
                    b.v = a.v;
                    b.base = sent.get(a.id) ?? b.base;
                }
            }
            for (const r of d.refused) this.reconcile(r.id, r.h, r.v, true); // before the changes of the others, or they would cover the own one
            this.receive(d.ops);
            this.rev = d.rev;
            this.people = d.people;
            this.on.people(d.people);
            if (d.stamp !== this.stamp) {
                this.stamp = d.stamp;
                this.on.comments();
            }
            this.remember();
            this.on.state(this.queue.length ? 'saving' : 'saved');
        } catch (e) {
            if (this.stopped) return;
            if (this.flying) {
                this.queue = [...this.flying, ...this.queue];
                this.flying = null;
            }
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

    receive(list) {
        const ed = this.editor, now = [];
        if (!list?.length) return;
        ed.scan();
        const mine = new Set(this.queue.filter((q) => q.t === 'set').map((q) => q.id));
        for (const o of list) {
            if (o.t === 'set') {
                const b = ed.blocks.get(o.id);
                if (!b) continue;
                if (mine.has(o.id)) {
                    this.reconcile(o.id, o.h, o.v, false);
                    continue;
                }
                if (b.v >= o.v) continue;
                now.push(o);
                b.v = o.v;
                b.base = o.h;
            } else if (o.t === 'del' && mine.has(o.id)) { // deleted by someone while it is being written: it comes back when saved
                continue;
            } else if (o.t === 'title') {
                now.push(o);
                this.on.title(o.title);
            } else now.push(o);
        }
        if (now.length) ed.apply(now);
    }

    /** The server has another version of a block that changed here too. */
    reconcile(id, theirs, v, requeue) {
        const ed = this.editor, b = ed.blocks.get(id);
        if (!b) return;
        const h = merge3(b.base, b.h, theirs) ?? b.h;
        b.v = v;
        b.base = theirs;
        if (h !== b.h) ed.apply([{t: 'set', id, h}]);
        const q = this.queue.find((x) => x.t === 'set' && x.id === id);
        if (q) q.h = h;
        else if (requeue && h !== theirs) this.queue.push({t: 'set', id, h});
    }

    async flush() {
        this.editor.scan();
        for (let i = 0; i < 20 && (this.pending || this.busy) && !this.stopped; i++) {
            clearTimeout(this.timer);
            this.timer = null;
            if (this.busy) await new Promise((r) => setTimeout(r, 120)); else await this.run();
        }
    }
}
