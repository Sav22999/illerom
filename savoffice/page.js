/*
 * SavOffice — the only script of the page of the suite (index.php, which runs no inline script): on a Mac it shows the
 * download of SavOffice for Mac (#mac), for Apple silicon or Intel. Without it the page is complete, only without that box.
 */
// SavOffice for Mac: only on a Mac (an iPad says "Macintosh" too, but it has a touch screen). Apple silicon or Intel from
// the graphics chip the browser reports ("Apple M…" / "Intel…"); unknown: Apple silicon, the other one is one click away
(() => {
  const box = document.getElementById('mac');
  if (!box) return;
  const ua = navigator.userAgent || '';
  const mac = (navigator.userAgentData?.platform === 'macOS' || /Macintosh|Mac OS X/.test(ua)) && !/iPhone|iPad|iPod/.test(ua) && (navigator.maxTouchPoints || 0) < 2;
  if (!mac) return;
  let intel = false;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) || '');
    intel = /Intel|AMD|Radeon/i.test(gpu) && !/Apple M\d|Apple GPU/i.test(gpu);
  } catch { /* Apple silicon */ }
  const get = box.querySelector('.mac-get'), other = box.querySelector('.mac-other');
  const [mine, theirs] = intel ? [box.dataset.intel, box.dataset.arm] : [box.dataset.arm, box.dataset.intel];
  get.setAttribute('href', mine);
  get.textContent = get.dataset[intel ? 'lIntel' : 'lArm'];
  other.href = theirs;
  other.textContent = other.dataset[intel ? 'lIntel' : 'lArm'];
  box.hidden = false;
})();
