/**
 * The queue: what plays next, in order. Drag to change the order (SavComponents sav-sortable, also with the keyboard),
 * the menu of each episode takes it away; the episode in the player is shown above it.
 */
import { btn, confirm, empty, h, put } from './ui.js';
import { t } from './i18n.js';
import { EPS, S, api, keep } from './store.js';
import { commands } from './account.js';
import { frame, head, section } from './shell.js';
import { epRow } from './eps.js';
import { current } from './player.js';

export function queueScreen(root) {
  const box = h('div.qbody');
  const clear = btn(t('clear_queue'), { size: 'sm', icon: 'trash', variant: 'danger', appearance: 'soft', onclick: async () => {
    if (!(await confirm(t('clear_queue'), t('clear_queue_t'), t('clear_queue')))) return;
    const r = await api('pod.queue_set', { ids: [] });
    S.queue = keep(r.queue);
    window.dispatchEvent(new CustomEvent('pod-queue'));
  } });
  const main = frame(root, 'queue', head(t('nav_queue'), clear), h('p.muted.qnote', t('queue_t')), box);
  document.title = t('nav_queue') + ' – SavPodcasts';
  commands();

  function draw() {
    if (!main.isConnected) { removeEventListener('pod-queue', draw); removeEventListener('pod-player', drawNow); return; }
    clear.hidden = !S.queue.length;
    const now = current();
    const sort = h('sav-sortable.qlist', { grip: true, handle: 'grip', 'aria-label': t('up_next') }, S.queue.map((e) => epRow(e, { podcast: true })));
    sort.addEventListener('sav-sort', save);
    put(box, now ? [section(t('now_playing')), h('div.eplist.qnow', epRow(EPS.get(now.id) || now, { podcast: true }))] : null,
      section(t('up_next')), S.queue.length ? sort : empty('list-music', t('queue_empty'), t('queue_empty_t')));
  }
  let shown = current()?.id;
  const drawNow = () => { if (current()?.id !== shown) { shown = current()?.id; draw(); } };
  async function save(e) {
    const ids = [...e.currentTarget.querySelectorAll('.ep')].map((n) => +n.dataset.ep);
    if (ids.join() === S.queue.map((x) => x.id).join()) return;
    S.queue = ids.map((id) => S.queue.find((x) => x.id === id)).filter(Boolean);
    const r = await api('pod.queue_set', { ids });
    S.queue = keep(r.queue);
    window.dispatchEvent(new CustomEvent('pod-queue'));
  }
  addEventListener('pod-queue', draw);
  addEventListener('pod-player', drawNow);
  draw();
}
