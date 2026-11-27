/*
 * SavOffice — the only script of the page of the suite (index.php, which runs no inline script): the chips of SavComponents
 * above the list show only the apps of one kind. Without it every app is shown, which is fine too.
 */
(() => {
  const kinds = document.getElementById('kinds'), cards = document.querySelectorAll('#cards > .card');
  if (!kinds || !cards.length) return;
  const show = () => {
    const k = kinds.value || 'all';
    for (const c of cards) c.hidden = k !== 'all' && c.dataset.kind !== k;
  };
  kinds.addEventListener('change', show);
  customElements.whenDefined('sav-chip-group').then(show);
})();
