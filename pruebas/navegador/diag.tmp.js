const a = require('../api/ayuda'); const { abrirNavegador } = require('./cdp');
(async () => {
  const srv = await a.iniciarServidor(3198); const nav = await abrirNavegador(9334);
  try {
    await nav.ir(srv.base);
    await nav.evaluar(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:'secretaria',clave:'CamDemo2026!'})})`);
    for (const ruta of ['#/panel','#/propietarios']) {
      await nav.tamano(1366, 900, false);
      await nav.ir(srv.base + '/' + ruta); await new Promise(r => setTimeout(r, 1200));
      await nav.tamano(390, 844, false); await new Promise(r => setTimeout(r, 400));
      const r = await nav.evaluar(`(() => { const W = document.documentElement.clientWidth;
        const todos = [...document.querySelectorAll('body *')].map(e => [e, e.getBoundingClientRect()]).filter(([e, b]) => b.right > W + 1 && b.width > 0);
        const raices = todos.filter(([e]) => !todos.some(([o]) => o !== e && o.contains(e)));
        return { scroll: document.documentElement.scrollWidth, W, culpables: raices.slice(0, 8).map(([e, b]) => e.tagName.toLowerCase() + '.' + String(e.className).replace(/ /g,'.') + ' w=' + Math.round(b.width) + ' right=' + Math.round(b.right)) }; })()`);
      console.log(ruta, JSON.stringify(r, null, 1));
    }
  } finally { await nav.cerrar(); await a.detenerServidor(srv); }
})();
