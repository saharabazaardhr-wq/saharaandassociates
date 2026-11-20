/* Install as a desktop app and work offline (live website only). */
(function () {
  if (!/^https?:$/.test(location.protocol)) return;
  if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  const btn = document.getElementById('installBtn'); let ev = null;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ev = e; if (btn && !standalone) btn.hidden = false; });
  window.addEventListener('appinstalled', () => { if (btn) btn.hidden = true; ev = null; });
  if (btn) btn.addEventListener('click', async () => { if (!ev) return; ev.prompt(); try { await ev.userChoice; } catch (e) { /* ignore */ } ev = null; btn.hidden = true; });
})();
