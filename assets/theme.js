// the chosen theme, before the first paint
try {
  const m = localStorage.getItem('illerom-theme');
  if (m === 'light' || m === 'dark') document.documentElement.classList.replace('sav-theme-auto', 'sav-theme-' + m);
} catch (e) {}
