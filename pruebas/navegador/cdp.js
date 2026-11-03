// Control mínimo de Chrome "headless" (sin ventana) mediante el protocolo DevTools.
// Usa un perfil TEMPORAL: no toca el perfil, contraseñas ni historial del usuario.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function abrirNavegador(puerto = 9333) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'cam-chrome-'));
  const proceso = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
    '--lang=es-CO', '--window-size=1366,900', 'about:blank',
  ], { stdio: 'ignore' });
  let lista;
  for (let i = 0; i < 60; i += 1) {
    try { lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json(); if (lista.some((t) => t.type === 'page')) break; } catch { /* inicia */ }
    await espera(250);
  }
  const pagina = lista.find((t) => t.type === 'page');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((ok, falla) => { ws.onopen = ok; ws.onerror = falla; });

  let id = 0;
  const pendientes = new Map();
  const oyentes = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) {
      const { ok, falla } = pendientes.get(m.id);
      pendientes.delete(m.id);
      if (m.error) falla(new Error(m.error.message)); else ok(m.result);
    } else if (m.method) oyentes.forEach((f) => f(m));
  };
  const enviar = (method, params = {}) => new Promise((ok, falla) => {
    id += 1;
    pendientes.set(id, { ok, falla });
    ws.send(JSON.stringify({ id, method, params }));
  });

  // Errores de la página: excepciones de JavaScript, console.error y violaciones de seguridad (CSP).
  const errores = [];
  oyentes.push((m) => {
    if (m.method === 'Runtime.exceptionThrown') errores.push(`Excepción: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errores.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errores.push(`Log: ${m.params.entry.text} ${m.params.entry.url || ''}`);
  });
  await enviar('Page.enable');
  await enviar('Runtime.enable');
  await enviar('Log.enable');

  // Evalúa código en la página y devuelve el resultado.
  async function evaluar(expresion) {
    const r = await enviar('Runtime.evaluate', { expression: expresion, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }

  // Espera hasta que una condición (expresión JS) sea verdadera.
  async function esperarQue(expresion, descripcion, ms = 8000) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if (await evaluar(`(() => { try { return !!(${expresion}); } catch { return false; } })()`)) return;
      await espera(100);
    }
    const texto = await evaluar('document.body.innerText.slice(0, 1500)');
    throw new Error(`Tiempo agotado esperando: ${descripcion}\n--- Texto visible ---\n${texto}`);
  }

  const lit = (s) => JSON.stringify(s);
  const api = {
    errores,
    evaluar,
    esperarQue,
    async ir(url) {
      await enviar('Page.navigate', { url });
      await esperarQue('document.readyState === "complete"', 'carga de la página');
    },
    esperarTexto: (t, ms) => esperarQue(`document.body.innerText.includes(${lit(t)})`, `texto "${t}"`, ms),
    textoVisible: () => evaluar('document.body.innerText'),
    // Clic en el botón o enlace VISIBLE cuyo texto es exactamente "texto" (dentro de "dentro").
    async clic(texto, dentro = 'body') {
      const expr = `(() => {
        const el = [...document.querySelectorAll(${lit(dentro)} + ' button, ' + ${lit(dentro)} + ' a')]
          .find((e) => e.textContent.trim() === ${lit(texto)} && e.offsetParent !== null && !e.disabled);
        if (el) { el.click(); return true; } return false; })()`;
      await esperarQue(expr, `botón "${texto}"`);
    },
    async escribir(selector, valor) {
      await esperarQue(`document.querySelector(${lit(selector)})`, `campo ${selector}`);
      await evaluar(`(() => { const e = document.querySelector(${lit(selector)}); e.focus(); e.value = ${lit(valor)};
        e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    },
    // Selecciona en un <select> la opción cuyo texto contiene "parte".
    async elegir(selector, parte) {
      await esperarQue(`[...(document.querySelector(${lit(selector)})?.options || [])].some((o) => o.textContent.includes(${lit(parte)}))`, `opción "${parte}" en ${selector}`);
      await evaluar(`(() => { const s = document.querySelector(${lit(selector)});
        s.value = [...s.options].find((o) => o.textContent.includes(${lit(parte)})).value;
        s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    },
    async enviarFormulario(selector) {
      await evaluar(`document.querySelector(${lit(selector)}).requestSubmit()`);
    },
    async tamano(ancho, alto, movil = false) {
      await enviar('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: movil });
    },
    // Captura de la página completa con el ANCHO actual fijo: se agranda solo el alto
    // de la ventana (no se usa captureBeyondViewport, que altera el tamaño de la vista).
    async captura(archivo, ancho, altoVentana, altoMaximo = 6000) {
      const alto = await evaluar('document.documentElement.scrollHeight');
      await enviar('Emulation.setDeviceMetricsOverride', { width: ancho, height: Math.min(alto, altoMaximo), deviceScaleFactor: 1, mobile: false });
      await espera(200);
      const r = await enviar('Page.captureScreenshot', { format: 'png' });
      await enviar('Emulation.setDeviceMetricsOverride', { width: ancho, height: altoVentana, deviceScaleFactor: 1, mobile: false });
      fs.writeFileSync(archivo, Buffer.from(r.data, 'base64'));
    },
    // Fuerza modo claro u oscuro (prefers-color-scheme).
    modo: (esquema) => enviar('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: esquema }] }),
    // ¿Hay desplazamiento horizontal? (no debe haberlo en celular)
    // Devuelve false o la lista de elementos que sobresalen por la derecha.
    desbordaHorizontal: () => evaluar(`(() => {
      const W = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth <= W + 1) return false;
      const todos = [...document.querySelectorAll('body *')].map((e) => [e, e.getBoundingClientRect()]).filter(([, b]) => b.right > W + 1 && b.width > 0);
      const raices = todos.filter(([e]) => !todos.some(([o]) => o !== e && o.contains(e)));
      return raices.slice(0, 5).map(([e, b]) => e.tagName.toLowerCase() + '.' + String(e.className).replace(/ /g, '.') + ' ancho=' + Math.round(b.width) + ' derecha=' + Math.round(b.right) + ' «' + e.textContent.trim().slice(0, 40) + '»').join(' | ') || ('scrollWidth=' + document.documentElement.scrollWidth + ' W=' + W);
    })()`),
    async cerrar() {
      try { ws.close(); } catch { /* nada */ }
      proceso.kill();
      await espera(500);
      try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* Chrome puede tardar en soltar archivos */ }
    },
  };
  return api;
}

module.exports = { abrirNavegador, espera };
