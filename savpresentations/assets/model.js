/**
 * The presentation in memory: content, changes ("ops"), undo, and the synchronisation with the server.
 * Ops are the ones described in lib/decks.php; a change is applied here at once and sent a moment later. The server
 * numbers every op and all the browsers apply them in that order, then again their own ones not yet confirmed: everyone
 * ends up with the same presentation.
 */
import {api, uid} from './core.js';

const round8 = (v) => Math.round(v * 1e8) / 1e8;
const clone = (o) => (o === undefined ? undefined : structuredClone(o));

export class Deck extends EventTarget {
    constructor(data, role) {
        super();
        this.uid = data.uid;
        this.role = role;
        this.title = data.title;
        this.meta = data.meta;
        this.seq = data.seq;
        this.owner = data.owner;
        this.access = data.access;
        this.status = data.status;
        this.perms = data.perms && !Array.isArray(data.perms) ? data.perms : {};
        this.ruled = new Set(data.ruled || []);
        this.limited = !!data.limited;
        this.meta.theme.colors ||= {};
        this.meta.theme.fonts ||= {};
        if (Array.isArray(this.meta.theme.colors)) this.meta.theme.colors = {};
        if (Array.isArray(this.meta.theme.fonts)) this.meta.theme.fonts = {};
        this.slides = new Map();
        for (const s of data.slides) this.slides.set(s.sid, {sid: s.sid, pos: s.pos, d: fixSlide(s.d)});
        this.undoStack = [];
        this.redoStack = [];
        this.client = uid();
        this.pending = [];
        this.inflight = [];
        this.people = [];
        this.state = {};
    }

    get canEdit() {
        return (this.role === 'owner' || this.role === 'editor') && this.status === 'active';
    }

    /** Some page can be changed. */
    get canWrite() {
        return this.canEdit || (this.status === 'active' && Object.values(this.perms).includes('editor'));
    }

    get saved() {
        return !this.pending.length && !this.inflight.length;
    }

    /** What can be done on a page (the server checks it again). */
    pageRole(sid) {
        return this.role === 'owner' ? 'owner' : this.perms[sid] || this.role;
    }

    canEditPage(sid) {
        const r = this.pageRole(sid);
        return (r === 'owner' || r === 'editor') && this.status === 'active';
    }

    canCommentPage(sid) {
        return this.pageRole(sid) !== 'viewer' && this.meta.opts.comments !== false;
    }

    allowed(op) {
        if (op.k === 'deck.set') return this.canEdit;
        if (op.k === 'slide.add') return this.canEdit;
        if (op.k === 'slide.del' || op.k === 'slide.move') return this.canEdit && this.canEditPage(op.s);
        return this.canEditPage(op.s);
    }

    order() {
        return [...this.slides.values()].sort((a, b) => a.pos - b.pos || (a.sid < b.sid ? -1 : 1));
    }

    index(sid) {
        return this.order().findIndex((s) => s.sid === sid);
    }

    slide(sid) {
        return this.slides.get(sid);
    }

    el(sid, id) {
        return this.slides.get(sid)?.d.els[id];
    }

    /** Changes the copy in memory. Returns the op that undoes it (or null when it did nothing). */
    apply(op) {
        const s = this.slides.get(op.s), k = op.k;
        if (k === 'page.rules') return null;
        if (k === 'deck.set') {
            const inv = {k, p: {}};
            for (const key of Object.keys(op.p)) {
                if (key === 'title') {
                    inv.p.title = this.title;
                    this.title = op.p.title;
                } else if (key === 'opts') {
                    inv.p.opts = {};
                    for (const o of Object.keys(op.p.opts)) inv.p.opts[o] = clone(this.meta.opts[o]) ?? '';
                    this.meta.opts = {...this.meta.opts, ...op.p.opts};
                } else {
                    inv.p[key] = clone(this.meta[key]);
                    this.meta[key] = clone(op.p[key]);
                    if (key === 'theme') for (const f of ['colors', 'fonts']) if (!this.meta.theme[f] || Array.isArray(this.meta.theme[f])) this.meta.theme[f] = {};
                }
            }
            return inv;
        }
        if (k === 'slide.add') {
            this.slides.set(op.s, {sid: op.s, pos: op.pos, d: fixSlide(clone(op.d))});
            return {k: 'slide.del', s: op.s};
        }
        if (!s) return null;
        if (k === 'slide.del') {
            this.slides.delete(op.s);
            return {k: 'slide.add', s: op.s, pos: s.pos, d: clone(s.d)};
        }
        if (k === 'slide.move') {
            const inv = {k, s: op.s, pos: s.pos};
            s.pos = op.pos;
            return inv;
        }
        if (k === 'slide.set') {
            const inv = {k, s: op.s, p: {}};
            for (const f of Object.keys(op.p)) {
                inv.p[f] = clone(s.d[f]) ?? null;
                if (op.p[f] === null) delete s.d[f]; else s.d[f] = clone(op.p[f]);
            }
            return inv;
        }
        const el = s.d.els[op.e];
        if (k === 'el.add') {
            s.d.els[op.e] = clone(op.el);
            return el ? {k: 'el.add', s: op.s, e: op.e, el: clone(el)} : {k: 'el.del', s: op.s, e: op.e};
        }
        if (!el) return null;
        if (k === 'el.del') {
            delete s.d.els[op.e];
            return {k: 'el.add', s: op.s, e: op.e, el: clone(el)};
        }
        if (k === 'el.set') {
            const inv = {k, s: op.s, e: op.e, p: {}};
            for (const f of Object.keys(op.p)) {
                inv.p[f] = clone(el[f]) ?? null;
                if (op.p[f] === null) delete el[f]; else el[f] = clone(op.p[f]);
            }
            return inv;
        }
        return null;
    }

    /** A change made here. merge: a name; consecutive changes with the same name undo together (dragging, typing). */
    do(ops, merge = '') {
        ops = (Array.isArray(ops) ? ops : [ops]).filter((op) => op && this.allowed(op));
        const inv = [];
        for (const op of ops) {
            const i = this.apply(op);
            if (i) inv.unshift(i);
        }
        if (!inv.length) return;
        const last = this.undoStack[this.undoStack.length - 1];
        if (merge && last && last.merge === merge && Date.now() - last.at < 1500) {
            last.inv = [...inv, ...last.inv];
            last.at = Date.now();
        } else {
            this.undoStack.push({inv, merge, at: Date.now()});
            if (this.undoStack.length > 200) this.undoStack.shift();
        }
        this.redoStack = [];
        this.queue(ops);
        this.emit('change', {ops, local: true});
    }

    step(from, to) {
        const it = from.pop();
        if (!it) return;
        const inv = [];
        for (const op of it.inv) {
            const i = this.apply(op);
            if (i) inv.unshift(i);
        }
        to.push({inv, merge: '', at: 0});
        this.queue(it.inv);
        this.emit('change', {ops: it.inv, local: true, undo: true});
    }

    undo() {
        if (this.canWrite) this.step(this.undoStack, this.redoStack);
    }

    redo() {
        if (this.canWrite) this.step(this.redoStack, this.undoStack);
    }

    queue(ops) {
        for (const op of ops) {
            // moving or typing makes many small changes of the same thing: only the latest values are sent
            let same = null;
            if (op.k === 'el.set') for (let i = this.pending.length - 1; i >= 0 && i > this.pending.length - 60; i--) {
                const p = this.pending[i];
                if (p.k === 'el.set' && p.s === op.s && p.e === op.e) {
                    same = p;
                    break;
                }
                if (p.k !== 'el.set' && p.s === op.s) break;
            }
            if (same) same.p = {...same.p, ...clone(op.p)};
            else this.pending.push(clone(op));
        }
        this.keep();
        this.emit('status');
        clearTimeout(this.flushT);
        this.flushT = setTimeout(() => this.sync(), 350);
    }

    /** Unsent changes survive a closed page or a lost connection. */
    keep() {
        try {
            const all = [...this.inflight, ...this.pending];
            if (all.length) localStorage.setItem('sp-pending-' + this.uid, JSON.stringify(all)); else localStorage.removeItem('sp-pending-' + this.uid);
        } catch { /* storage full or off: the changes are still in memory */
        }
    }

    restore() {
        try {
            const ops = JSON.parse(localStorage.getItem('sp-pending-' + this.uid) || '[]');
            if (!ops.length || !this.canWrite) return;
            for (const op of ops) this.apply(op);
            this.pending.push(...ops);
        } catch { /* nothing to restore */
        }
    }

    emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, {detail}));
    }

    start() {
        this.restore();
        this.alive = true;
        this.onVis = () => this.schedule(document.hidden ? undefined : 50);
        document.addEventListener('visibilitychange', this.onVis);
        this.onOnline = () => this.sync();
        addEventListener('online', this.onOnline);
        this.onBye = () => navigator.sendBeacon?.('api/?r=deck.bye', new Blob([JSON.stringify({
            d: this.uid,
            client: this.client
        })], {type: 'application/json'}));
        addEventListener('pagehide', this.onBye);
        this.sync();
    }

    stop() {
        this.alive = false;
        clearTimeout(this.pollT);
        clearTimeout(this.flushT);
        document.removeEventListener('visibilitychange', this.onVis);
        removeEventListener('online', this.onOnline);
        removeEventListener('pagehide', this.onBye);
        if (!this.saved) this.sync();
        this.onBye();
    }

    /** Fast with other people, slow alone, very slow in the background. */
    schedule(ms) {
        if (!this.alive) return;
        clearTimeout(this.pollT);
        const wait = ms ?? (this.failed ? Math.min(30000, 2000 * 2 ** Math.min(this.failed, 4)) : document.hidden ? 20000 : this.people.length ? 1100 : 4000);
        this.pollT = setTimeout(() => this.sync(), wait);
    }

    setState(p) {
        const before = JSON.stringify(this.state);
        this.state = {...this.state, ...p};
        if (this.people.length && before !== JSON.stringify(this.state)) {
            clearTimeout(this.stateT);
            this.stateT = setTimeout(() => this.sync(), 150);
        }
    }

    async sync() {
        if (this.busy) {
            this.again = true;
            return;
        }
        this.busy = true;
        clearTimeout(this.pollT);
        // what failed goes again first, with the same content (ops can be applied twice without harm)
        this.inflight = [...this.inflight, ...this.pending.splice(0, Math.max(0, 200 - this.inflight.length))];
        this.emit('status');
        try {
            const r = await api('deck.sync', {
                d: this.uid,
                client: this.client,
                since: this.seq,
                ops: this.inflight,
                state: this.state
            });
            const had = this.failed;
            this.failed = 0;
            this.inflight = [];
            this.keep();
            if (r.role !== this.role) {
                this.role = r.role;
                this.emit('role');
            }
            if (r.denied) this.emit('denied');
            if (r.reload || r.denied) {
                this.emit('reload');
            } else if (r.ops.length) {
                // in the order of the server, own ones included; then the ones still to be sent, which are newer
                const foreign = r.ops.filter((o) => o.c !== this.client);
                for (const o of r.ops) this.apply(o.o);
                for (const op of this.pending) this.apply(op);
                if (foreign.length) this.emit('change', {ops: foreign.map((o) => o.o), local: false});
            }
            if (!r.reload) this.seq = r.seq;
            const names = (p) => p.map((x) => x.c + JSON.stringify(x.st)).join();
            const moved = names(this.people) !== names(r.people);
            this.people = r.people;
            if (moved) this.emit('people');
            if (this.cv !== undefined && this.cv !== r.cv) this.emit('comments');
            this.cv = r.cv;
            if (had) this.emit('online');
        } catch (e) {
            if (e.network || e.status >= 500 || e.status === 429) {
                this.failed = (this.failed || 0) + 1;
                this.emit('offline');
            } else if (e.status === 401 || e.status === 403 || e.status === 404 || e.status === 409) {
                this.emit('lost', e.code);
                this.alive = false;
            } else {
                this.inflight = [];
                this.keep();
                this.emit('refused', e.code);
            }
        }
        this.busy = false;
        this.emit('status');
        if (this.again || (this.pending.length && !this.failed)) {
            this.again = false;
            setTimeout(() => this.sync(), 60);
        } else this.schedule();
    }

    /** Where a slide goes so that it lands at the given place. */
    posAt(i, without) {
        let o = this.order().filter((s) => s.sid !== without);
        if (!o.length) return 1;
        if (i <= 0) return round8(o[0].pos - 1);
        if (i >= o.length) return round8(o[o.length - 1].pos + 1);
        if (Math.abs(o[i].pos - o[i - 1].pos) < 1e-5) {
            this.do(o.map((s, n) => ({k: 'slide.move', s: s.sid, pos: n + 1})));
            o = this.order().filter((s) => s.sid !== without);
        }
        return round8((o[i - 1].pos + o[i].pos) / 2);
    }
}

export function fixSlide(d) {
    d ||= {};
    if (!d.els || Array.isArray(d.els)) d.els = {};
    return d;
}
