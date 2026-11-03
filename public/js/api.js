// Comunicación con el backend. Todas las pantallas usan estas funciones.

export class ErrorApi extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

export async function api(metodo, ruta, cuerpo) {
  let r;
  try {
    r = await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, 'No hay conexión con el servidor. Revise su internet e intente de nuevo.');
  }
  const esJson = (r.headers.get('content-type') || '').includes('application/json');
  const datos = esJson ? await r.json() : null;
  if (!r.ok) {
    if (r.status === 401 && !ruta.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('cam:sesion-vencida'));
    }
    throw new ErrorApi(r.status, (datos && datos.error) || `Error ${r.status}`);
  }
  return datos;
}

export const obtener = (ruta) => api('GET', ruta);
export const enviar = (ruta, cuerpo = {}) => api('POST', ruta, cuerpo);
export const actualizar = (ruta, cuerpo = {}) => api('PUT', ruta, cuerpo);
export const modificar = (ruta, cuerpo = {}) => api('PATCH', ruta, cuerpo);
export const eliminar = (ruta) => api('DELETE', ruta);

// Arma "?a=1&b=2" omitiendo los valores vacíos.
export function parametros(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// Descarga un archivo generado por el servidor (Excel o PDF).
export async function descargar(ruta, nombrePorDefecto) {
  let r;
  try {
    r = await fetch(`/api${ruta}`, { credentials: 'same-origin' });
  } catch {
    throw new ErrorApi(0, 'No hay conexión con el servidor.');
  }
  if (!r.ok) {
    const d = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
    throw new ErrorApi(r.status, (d && d.error) || 'No se pudo generar el archivo.');
  }
  const disp = r.headers.get('content-disposition') || '';
  const nombre = (disp.match(/filename="([^"]+)"/) || [])[1] || nombrePorDefecto;
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { filas: r.headers.get('x-filas') };
}
