// Formatos colombianos para PDF y Excel.
const pesos = (n) => `$${Math.round(Number(n || 0)).toLocaleString('es-CO').replace(/,/g, '.')}`;

// 'AAAA-MM-DD' -> 'DD/MM/AAAA'
const fecha = (iso) => {
  if (!iso) return '';
  const s = typeof iso === 'string' ? iso.slice(0, 10) : fechaHoraBogota(iso).slice(0, 10).split('/').reverse().join('-');
  const [a, m, d] = s.split('-');
  return `${d}/${m}/${a}`;
};

// Fecha y hora en la zona de Colombia: 'DD/MM/AAAA HH:MM'
const fechaHoraBogota = (valor) => {
  const d = valor instanceof Date ? valor : new Date(valor);
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};

module.exports = { pesos, fecha, fechaHoraBogota };
