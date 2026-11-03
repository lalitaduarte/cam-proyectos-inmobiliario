// Definición ÚNICA de cada reporte. La usan la consulta en pantalla (JSON)
// y la exportación a Excel, para que ambas tengan las mismas filas (FUN-REP-02).
const v = require('../validar');
const { ErrorApp } = require('../errores');

const rangoFechas = (q) => {
  const desde = v.fecha(q.desde, 'desde', { opcional: true });
  const hasta = v.fecha(q.hasta, 'hasta', { opcional: true });
  if (desde && hasta && hasta < desde) throw new ErrorApp(400, 'La fecha "hasta" debe ser igual o posterior a "desde".');
  return { desde, hasta };
};

const REPORTES = {
  // Recaudo agrupado por mes de la fecha de pago. Registrado y verificado por separado (D2).
  recaudo: {
    titulo: 'Recaudo mensual',
    columnas: [
      { clave: 'mes', titulo: 'Mes', tipo: 'mes' },
      { clave: 'pagos_registrados', titulo: 'Pagos registrados', tipo: 'entero' },
      { clave: 'total_registrado', titulo: 'Total registrado', tipo: 'pesos' },
      { clave: 'pagos_verificados', titulo: 'Pagos verificados', tipo: 'entero' },
      { clave: 'total_verificado', titulo: 'Total verificado', tipo: 'pesos' },
    ],
    consulta(q) {
      const { desde, hasta } = rangoFechas(q);
      return {
        filtros: { desde, hasta },
        sql: `SELECT to_char(date_trunc('month', fecha_pago), 'YYYY-MM') AS mes,
                     count(*) AS pagos_registrados, sum(valor) AS total_registrado,
                     count(*) FILTER (WHERE estado = 'VERIFICADO') AS pagos_verificados,
                     COALESCE(sum(valor) FILTER (WHERE estado = 'VERIFICADO'), 0) AS total_verificado
                FROM pago
               WHERE estado <> 'ANULADO'
                 AND ($1::date IS NULL OR fecha_pago >= $1) AND ($2::date IS NULL OR fecha_pago <= $2)
               GROUP BY 1 ORDER BY 1`,
        valores: [desde, hasta],
      };
    },
  },

  // Historial de pagos con filtros.
  pagos: {
    titulo: 'Historial de pagos',
    columnas: [
      { clave: 'fecha_pago', titulo: 'Fecha del pago', tipo: 'fecha' },
      { clave: 'cedula', titulo: 'Cédula', tipo: 'texto' },
      { clave: 'nombre_completo', titulo: 'Propietario', tipo: 'texto' },
      { clave: 'semana_numero', titulo: 'Semana', tipo: 'entero' },
      { clave: 'numero_cuota', titulo: 'Cuota', tipo: 'entero' },
      { clave: 'valor', titulo: 'Valor', tipo: 'pesos' },
      { clave: 'estado', titulo: 'Estado', tipo: 'texto' },
      { clave: 'registrado_en', titulo: 'Registrado en el sistema', tipo: 'fechahora' },
      { clave: 'registrado_por_nombre', titulo: 'Registró', tipo: 'texto' },
      { clave: 'comprobante_numero', titulo: 'Comprobante', tipo: 'texto' },
    ],
    consulta(q) {
      const { desde, hasta } = rangoFechas(q);
      const estado = v.opcion(q.estado, 'estado', ['NO_VERIFICADO', 'VERIFICADO', 'ANULADO'], { opcional: true });
      const propietario = q.propietario_id ? v.id(q.propietario_id, 'propietario') : null;
      return {
        filtros: { desde, hasta, estado, propietario_id: propietario },
        sql: `SELECT * FROM v_pago_detalle
               WHERE ($1::date IS NULL OR fecha_pago >= $1) AND ($2::date IS NULL OR fecha_pago <= $2)
                 AND ($3::text IS NULL OR estado = $3) AND ($4::bigint IS NULL OR propietario_id = $4)
               ORDER BY fecha_pago, semana_numero, numero_cuota`,
        valores: [desde, hasta, estado, propietario],
      };
    },
  },

  // Pagos pendientes de verificación.
  'por-verificar': {
    titulo: 'Pagos pendientes de verificación',
    columnas: [
      { clave: 'fecha_pago', titulo: 'Fecha del pago', tipo: 'fecha' },
      { clave: 'cedula', titulo: 'Cédula', tipo: 'texto' },
      { clave: 'nombre_completo', titulo: 'Propietario', tipo: 'texto' },
      { clave: 'semana_numero', titulo: 'Semana', tipo: 'entero' },
      { clave: 'numero_cuota', titulo: 'Cuota', tipo: 'entero' },
      { clave: 'valor', titulo: 'Valor', tipo: 'pesos' },
      { clave: 'referencia', titulo: 'Referencia', tipo: 'texto' },
      { clave: 'registrado_en', titulo: 'Registrado en el sistema', tipo: 'fechahora' },
    ],
    consulta(q) {
      const { desde, hasta } = rangoFechas(q);
      return {
        filtros: { desde, hasta },
        sql: `SELECT * FROM v_pago_detalle
               WHERE estado = 'NO_VERIFICADO'
                 AND ($1::date IS NULL OR fecha_pago >= $1) AND ($2::date IS NULL OR fecha_pago <= $2)
               ORDER BY fecha_pago, semana_numero, numero_cuota`,
        valores: [desde, hasta],
      };
    },
  },

  // Saldos por adquisición (solo pagos verificados descuentan, D2).
  saldos: {
    titulo: 'Saldos por adquisición',
    columnas: [
      { clave: 'semana_numero', titulo: 'Semana', tipo: 'entero' },
      { clave: 'cedula', titulo: 'Cédula', tipo: 'texto' },
      { clave: 'nombre_completo', titulo: 'Propietario', tipo: 'texto' },
      { clave: 'fecha_adquisicion', titulo: 'Fecha de adquisición', tipo: 'fecha' },
      { clave: 'valor_accion', titulo: 'Valor de la acción', tipo: 'pesos' },
      { clave: 'numero_cuotas', titulo: 'Cuotas del plan', tipo: 'entero' },
      { clave: 'cuotas_pagadas', titulo: 'Cuotas pagadas (verificadas)', tipo: 'entero' },
      { clave: 'cuotas_por_verificar', titulo: 'Cuotas por verificar', tipo: 'entero' },
      { clave: 'cuotas_pendientes', titulo: 'Cuotas pendientes', tipo: 'entero' },
      { clave: 'total_registrado', titulo: 'Total registrado', tipo: 'pesos' },
      { clave: 'total_abonado', titulo: 'Total abonado (verificado)', tipo: 'pesos' },
      { clave: 'saldo', titulo: 'Saldo', tipo: 'pesos' },
      { clave: 'situacion_pago', titulo: 'Situación', tipo: 'texto' },
    ],
    consulta(q) {
      const situacion = v.opcion(q.situacion, 'situación', ['EN_CURSO', 'PAGADA'], { opcional: true });
      const propietario = q.propietario_id ? v.id(q.propietario_id, 'propietario') : null;
      return {
        filtros: { situacion, propietario_id: propietario },
        sql: `SELECT * FROM v_estado_cuenta
               WHERE estado_titularidad = 'VIGENTE'
                 AND ($1::text IS NULL OR situacion_pago = $1) AND ($2::bigint IS NULL OR propietario_id = $2)
               ORDER BY semana_numero`,
        valores: [situacion, propietario],
      };
    },
  },

  // Adquisiciones sin pago registrado en un mes (NO es "mora": no hay calendario, D6).
  'sin-pago': {
    titulo: 'Adquisiciones sin pago registrado en el mes',
    columnas: [
      { clave: 'semana_numero', titulo: 'Semana', tipo: 'entero' },
      { clave: 'cedula', titulo: 'Cédula', tipo: 'texto' },
      { clave: 'nombre_completo', titulo: 'Propietario', tipo: 'texto' },
      { clave: 'correo', titulo: 'Correo', tipo: 'texto' },
      { clave: 'cuotas_registradas', titulo: 'Cuotas registradas', tipo: 'entero' },
      { clave: 'cuotas_pagadas', titulo: 'Cuotas verificadas', tipo: 'entero' },
      { clave: 'saldo', titulo: 'Saldo', tipo: 'pesos' },
    ],
    consulta(q) {
      const anio = v.entero(q.anio, 'año', { min: 2000, max: 2100 });
      const mes = v.entero(q.mes, 'mes', { min: 1, max: 12 });
      return { filtros: { anio, mes }, sql: 'SELECT * FROM fn_sin_pago_en_mes($1, $2)', valores: [anio, mes] };
    },
  },

  // Estado de cuenta de una adquisición: plan de cuotas.
  'estado-cuenta': {
    titulo: 'Estado de cuenta: plan de cuotas',
    columnas: [
      { clave: 'numero_cuota', titulo: 'Cuota', tipo: 'entero' },
      { clave: 'valor_cuota', titulo: 'Valor de la cuota', tipo: 'pesos' },
      { clave: 'situacion_cuota', titulo: 'Situación', tipo: 'texto' },
      { clave: 'fecha_pago', titulo: 'Fecha del pago', tipo: 'fecha' },
      { clave: 'comprobante_numero', titulo: 'Comprobante', tipo: 'texto' },
    ],
    consulta(q) {
      const adq = v.id(q.adquisicion_id, 'adquisición');
      return {
        filtros: { adquisicion_id: adq },
        sql: 'SELECT * FROM v_plan_cuotas WHERE adquisicion_id = $1 ORDER BY numero_cuota',
        valores: [adq],
      };
    },
  },
};

function obtenerReporte(nombre) {
  const r = Object.prototype.hasOwnProperty.call(REPORTES, nombre) ? REPORTES[nombre] : null;
  if (!r) throw new ErrorApp(404, 'El reporte no existe.');
  return r;
}

module.exports = { REPORTES, obtenerReporte };
