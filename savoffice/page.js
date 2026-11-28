/*
 * SavOffice — the only script of the page of the suite (index.php, which runs no inline script): it shows the download of
 * SavOffice for the visitor's computer (#desk): Mac (Apple silicon or Intel), Windows, Linux (.deb or .rpm). On phones and
 * tablets, or a system it does not know, nothing: the page is complete without that box.
 */
(() => {
  const box = document.getElementById('desk');
  if (!box) return;
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || '';
  const touchOnly = (navigator.maxTouchPoints || 0) >= 2 && !matchMedia('(pointer: fine)').matches;
  // an iPad says "Macintosh" too, but it has a touch screen; Android and ChromeOS say "Linux"
  const os = /iPhone|iPad|iPod|Android|CrOS/.test(ua) || platform === 'Android' || platform === 'Chrome OS' ? ''
    : platform === 'macOS' || /Macintosh|Mac OS X/.test(ua) ? ((navigator.maxTouchPoints || 0) < 2 ? 'mac' : '')
    : platform === 'Windows' || /Windows NT/.test(ua) ? 'win'
    : (platform === 'Linux' || /Linux|X11/.test(ua)) && !touchOnly ? 'linux' : '';
  if (!os) return;
  const part = box.querySelector(`.desk-os[data-os="${os}"]`);
  if (!part) return;

  // the second choice of the system: Intel (from the graphics chip the browser reports: "Apple M…" / "Intel…"; unknown:
  // Apple silicon) or .rpm (the browsers of Fedora, openSUSE… often name it); the other one stays one click away
  let second = false;
  if (os === 'mac') {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) || '');
      second = /Intel|AMD|Radeon/i.test(gpu) && !/Apple M\d|Apple GPU/i.test(gpu);
    } catch { /* Apple silicon */ }
  } else if (os === 'linux') {
    second = /Fedora|Red Hat|CentOS|Rocky|AlmaLinux|SUSE|Mageia/i.test(ua);
  }
  const get = part.querySelector('.desk-get'), other = part.querySelector('.desk-other');
  if (second && get && other) {
    const [mine, theirs] = os === 'mac' ? [box.dataset.intel, box.dataset.arm] : [box.dataset.rpm, box.dataset.deb];
    get.setAttribute('href', mine);
    get.textContent = get.dataset.lB;
    other.href = theirs;
    other.textContent = other.dataset.lB;
  }
  part.hidden = false;
  part.querySelector('h2').id = 'desk-h'; // the name of the box (aria-labelledby): the title of the part shown
  for (const h of box.querySelectorAll('.desk-os[hidden] h2')) h.removeAttribute('id');
  box.hidden = false;
})();
