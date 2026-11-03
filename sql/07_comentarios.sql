-- =====================================================================
-- 07_comentarios.sql
-- Descripción de cada tabla, vista y columna, GUARDADA EN LA BASE
-- (COMMENT ON). Con ella se genera el diccionario de datos
-- (npm.cmd run diccionario -> docs/diccionario_datos.md).
-- No crea, modifica ni borra datos: se puede ejecutar las veces que se quiera.
-- Se ejecuta como cam_admin (dueño de los objetos).
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
SET search_path = cam;

-- ---------------------------------------------------------------- propietario
COMMENT ON TABLE  propietario IS 'Personas que adquieren semanas de la vivienda turística (datos personales, Ley 1581 de 2012).';
COMMENT ON COLUMN propietario.id              IS 'Identificador interno.';
COMMENT ON COLUMN propietario.cedula          IS 'Cédula de ciudadanía, solo dígitos, guardada como texto para no perder ceros. Única.';
COMMENT ON COLUMN propietario.nombre_completo IS 'Nombres y apellidos.';
COMMENT ON COLUMN propietario.correo          IS 'Correo para enviar comprobantes. Único sin distinguir mayúsculas.';
COMMENT ON COLUMN propietario.telefono        IS 'Teléfono de contacto (opcional).';
COMMENT ON COLUMN propietario.activo          IS 'Falso = no inicia sesión ni publica ofertas; conserva adquisiciones e historial (D13).';
COMMENT ON COLUMN propietario.creado_en       IS 'Fecha y hora de registro (la fija el servidor).';
COMMENT ON COLUMN propietario.creado_por      IS 'Usuario (secretaria) que lo registró.';
COMMENT ON COLUMN propietario.actualizado_en  IS 'Fecha y hora de la última modificación.';
COMMENT ON COLUMN propietario.actualizado_por IS 'Usuario que hizo la última modificación.';

-- ---------------------------------------------------------------- usuario
COMMENT ON TABLE  usuario IS 'Cuentas de acceso a la aplicación: secretarias y propietarios.';
COMMENT ON COLUMN usuario.id                 IS 'Identificador interno.';
COMMENT ON COLUMN usuario.rol                IS 'SECRETARIA (administración) o PROPIETARIO (solo comunidad).';
COMMENT ON COLUMN usuario.login              IS 'Nombre de usuario de la secretaria. Los propietarios ingresan con su cédula.';
COMMENT ON COLUMN usuario.nombre             IS 'Nombre mostrado de la secretaria.';
COMMENT ON COLUMN usuario.propietario_id     IS 'Propietario dueño de la cuenta (solo rol PROPIETARIO). Una cuenta por propietario.';
COMMENT ON COLUMN usuario.password_hash      IS 'Contraseña cifrada con bcrypt. Nunca se guarda la contraseña legible (RNF-SEG-01).';
COMMENT ON COLUMN usuario.debe_cambiar_clave IS 'Verdadero = la contraseña es temporal y debe cambiarse en el próximo ingreso (D12).';
COMMENT ON COLUMN usuario.activo             IS 'Falso = la cuenta no puede iniciar sesión.';
COMMENT ON COLUMN usuario.intentos_fallidos  IS 'Intentos de ingreso fallidos seguidos. A los 5 la cuenta se bloquea 15 minutos.';
COMMENT ON COLUMN usuario.bloqueado_hasta    IS 'Fin del bloqueo temporal por intentos fallidos.';
COMMENT ON COLUMN usuario.ultimo_acceso      IS 'Fecha y hora del último ingreso correcto.';
COMMENT ON COLUMN usuario.creado_en          IS 'Fecha y hora de creación de la cuenta.';
COMMENT ON COLUMN usuario.creado_por         IS 'Usuario que creó la cuenta.';

-- ---------------------------------------------------------------- semana
COMMENT ON TABLE  semana IS 'Semanas de uso de la vivienda turística (1 a 52), permanentes (D1).';
COMMENT ON COLUMN semana.id          IS 'Identificador interno.';
COMMENT ON COLUMN semana.numero      IS 'Número de la semana, de 1 a 52. Único.';
COMMENT ON COLUMN semana.descripcion IS 'Texto descriptivo opcional (p. ej. temporada).';
COMMENT ON COLUMN semana.activa      IS 'Falso = la semana no se ofrece para nuevas adquisiciones.';
COMMENT ON COLUMN semana.creado_en   IS 'Fecha y hora de creación.';
COMMENT ON COLUMN semana.creado_por  IS 'Usuario que la creó.';

-- ---------------------------------------------------------------- semana_fecha
COMMENT ON TABLE  semana_fecha IS 'Calendario: fechas reales de entrada y salida de cada semana en cada año.';
COMMENT ON COLUMN semana_fecha.id            IS 'Identificador interno.';
COMMENT ON COLUMN semana_fecha.semana_id     IS 'Semana a la que pertenecen las fechas.';
COMMENT ON COLUMN semana_fecha.anio          IS 'Año del calendario. Una sola pareja de fechas por semana y año.';
COMMENT ON COLUMN semana_fecha.fecha_entrada IS 'Fecha de check-in.';
COMMENT ON COLUMN semana_fecha.fecha_salida  IS 'Fecha de check-out; posterior a la entrada. Las semanas no se traslapan.';
COMMENT ON COLUMN semana_fecha.nota          IS 'Observación opcional.';
COMMENT ON COLUMN semana_fecha.creado_en     IS 'Fecha y hora de registro.';
COMMENT ON COLUMN semana_fecha.creado_por    IS 'Usuario que registró las fechas.';

-- ---------------------------------------------------------------- parametro_accion
COMMENT ON TABLE  parametro_accion IS 'Historial de condiciones de la acción (valor, cuotas). La más reciente es la vigente. No se modifica.';
COMMENT ON COLUMN parametro_accion.id            IS 'Identificador interno.';
COMMENT ON COLUMN parametro_accion.valor_accion  IS 'Valor total de la acción en pesos (p. ej. 18.000.000).';
COMMENT ON COLUMN parametro_accion.numero_cuotas IS 'Número de cuotas (p. ej. 24).';
COMMENT ON COLUMN parametro_accion.valor_cuota   IS 'Valor de cada cuota; cuotas × valor = valor de la acción (D7).';
COMMENT ON COLUMN parametro_accion.vigente_desde IS 'Desde cuándo rigen estas condiciones para adquisiciones nuevas.';
COMMENT ON COLUMN parametro_accion.creado_por    IS 'Usuario que fijó las condiciones.';

-- ---------------------------------------------------------------- adquisicion
COMMENT ON COLUMN adquisicion.id                    IS 'Identificador interno.';
COMMENT ON COLUMN adquisicion.propietario_id        IS 'Propietario titular.';
COMMENT ON COLUMN adquisicion.semana_id             IS 'Semana adquirida. Solo un titular VIGENTE por semana.';
COMMENT ON COLUMN adquisicion.fecha_adquisicion     IS 'Fecha de la adquisición; no puede ser futura.';
COMMENT ON COLUMN adquisicion.parametro_id          IS 'Condiciones vigentes cuando se creó la adquisición.';
COMMENT ON COLUMN adquisicion.valor_accion          IS 'Copia del valor de la acción: cambios posteriores de parámetros no la afectan.';
COMMENT ON COLUMN adquisicion.numero_cuotas         IS 'Copia del número de cuotas pactado.';
COMMENT ON COLUMN adquisicion.valor_cuota           IS 'Copia del valor de cuota pactado.';
COMMENT ON COLUMN adquisicion.estado_titularidad    IS 'VIGENTE o TRANSFERIDA. La situación de pago no se guarda: se calcula (v_estado_cuenta).';
COMMENT ON COLUMN adquisicion.fecha_fin_titularidad IS 'Fecha en que dejó de ser vigente (solo TRANSFERIDA).';
COMMENT ON COLUMN adquisicion.observacion           IS 'Observación opcional.';
COMMENT ON COLUMN adquisicion.creado_en             IS 'Fecha y hora de registro.';
COMMENT ON COLUMN adquisicion.creado_por            IS 'Usuario que asignó la semana.';

-- ---------------------------------------------------------------- pago
COMMENT ON COLUMN pago.id               IS 'Identificador interno.';
COMMENT ON COLUMN pago.adquisicion_id   IS 'Adquisición a la que corresponde la cuota.';
COMMENT ON COLUMN pago.numero_cuota     IS 'Cuota pagada, de 1 al número de cuotas pactado. No se repite (salvo pagos anulados).';
COMMENT ON COLUMN pago.valor            IS 'Valor pagado; debe ser igual al valor de cuota pactado (D5: un pago = una cuota).';
COMMENT ON COLUMN pago.fecha_pago       IS 'Fecha en que el propietario pagó; no futura ni anterior a la adquisición.';
COMMENT ON COLUMN pago.referencia       IS 'Referencia bancaria o del recibo (opcional).';
COMMENT ON COLUMN pago.estado           IS 'NO_VERIFICADO (al registrarse), VERIFICADO (dinero confirmado) o ANULADO (error, con motivo).';
COMMENT ON COLUMN pago.registrado_en    IS 'Fecha y hora de registro en el sistema (la fija el servidor, RN13).';
COMMENT ON COLUMN pago.registrado_por   IS 'Usuario que registró el pago (RNF-AUD-01).';
COMMENT ON COLUMN pago.verificado_en    IS 'Fecha y hora de la verificación.';
COMMENT ON COLUMN pago.verificado_por   IS 'Usuario que verificó.';
COMMENT ON COLUMN pago.anulado_en       IS 'Fecha y hora de la anulación.';
COMMENT ON COLUMN pago.anulado_por      IS 'Usuario que anuló.';
COMMENT ON COLUMN pago.motivo_anulacion IS 'Motivo obligatorio de la anulación (D4).';

-- ---------------------------------------------------------------- consecutivo_comprobante
COMMENT ON TABLE  consecutivo_comprobante IS 'Contador de una sola fila para numerar comprobantes sin repetir ni dejar saltos.';
COMMENT ON COLUMN consecutivo_comprobante.id     IS 'Siempre 1 (una sola fila).';
COMMENT ON COLUMN consecutivo_comprobante.ultimo IS 'Último número de comprobante emitido.';

-- ---------------------------------------------------------------- comprobante
COMMENT ON COLUMN comprobante.id                 IS 'Identificador interno.';
COMMENT ON COLUMN comprobante.consecutivo        IS 'Número consecutivo sin saltos. Único.';
COMMENT ON COLUMN comprobante.numero             IS 'Número visible, formato CP-000001. Único.';
COMMENT ON COLUMN comprobante.pago_id            IS 'Pago soportado. Máximo un comprobante por pago; solo pagos verificados (D3).';
COMMENT ON COLUMN comprobante.emitido_en         IS 'Fecha y hora de emisión.';
COMMENT ON COLUMN comprobante.emitido_por        IS 'Usuario que emitió.';
COMMENT ON COLUMN comprobante.empresa            IS 'Fotografía: razón social de la empresa al emitir.';
COMMENT ON COLUMN comprobante.emisor_nombre      IS 'Fotografía: nombre de quien emitió.';
COMMENT ON COLUMN comprobante.propietario_cedula IS 'Fotografía: cédula del propietario al emitir.';
COMMENT ON COLUMN comprobante.propietario_nombre IS 'Fotografía: nombre del propietario al emitir.';
COMMENT ON COLUMN comprobante.propietario_correo IS 'Fotografía: correo del propietario al emitir.';
COMMENT ON COLUMN comprobante.semana_numero      IS 'Fotografía: número de semana.';
COMMENT ON COLUMN comprobante.numero_cuota       IS 'Fotografía: cuota pagada.';
COMMENT ON COLUMN comprobante.numero_cuotas      IS 'Fotografía: total de cuotas del plan.';
COMMENT ON COLUMN comprobante.valor              IS 'Fotografía: valor pagado.';
COMMENT ON COLUMN comprobante.fecha_pago         IS 'Fotografía: fecha del pago.';
COMMENT ON COLUMN comprobante.total_abonado      IS 'Fotografía: total verificado al emitir.';
COMMENT ON COLUMN comprobante.cuotas_pendientes  IS 'Fotografía: cuotas pendientes al emitir.';
COMMENT ON COLUMN comprobante.saldo              IS 'Fotografía: saldo al emitir.';
COMMENT ON COLUMN comprobante.nota               IS 'Leyenda del comprobante (no es factura electrónica).';

-- ---------------------------------------------------------------- envio_comprobante
COMMENT ON TABLE  envio_comprobante IS 'Intentos de envío de comprobantes por correo, con su resultado. No se modifica.';
COMMENT ON COLUMN envio_comprobante.id             IS 'Identificador interno.';
COMMENT ON COLUMN envio_comprobante.comprobante_id IS 'Comprobante enviado.';
COMMENT ON COLUMN envio_comprobante.correo_destino IS 'Correo al que se intentó enviar.';
COMMENT ON COLUMN envio_comprobante.estado         IS 'Resultado del intento: ENVIADO o FALLIDO.';
COMMENT ON COLUMN envio_comprobante.detalle_error  IS 'Motivo del fallo, si lo hubo.';
COMMENT ON COLUMN envio_comprobante.intentado_en   IS 'Fecha y hora del intento.';
COMMENT ON COLUMN envio_comprobante.intentado_por  IS 'Usuario que lo intentó.';

-- ---------------------------------------------------------------- oferta
COMMENT ON TABLE  oferta IS 'Ofertas de venta o intercambio de semanas publicadas en la comunidad.';
COMMENT ON COLUMN oferta.id             IS 'Identificador interno.';
COMMENT ON COLUMN oferta.adquisicion_id IS 'Semana ofertada (adquisición vigente del propietario). Una oferta ACTIVA por adquisición.';
COMMENT ON COLUMN oferta.tipo           IS 'VENTA (con precio) o INTERCAMBIO (sin precio).';
COMMENT ON COLUMN oferta.precio         IS 'Precio de venta, mayor que 0. Nulo en intercambios.';
COMMENT ON COLUMN oferta.descripcion    IS 'Texto de la oferta.';
COMMENT ON COLUMN oferta.estado         IS 'ACTIVA, RETIRADA o CONCRETADA. Concretar no transfiere la titularidad.';
COMMENT ON COLUMN oferta.publicada_en   IS 'Fecha y hora de publicación.';
COMMENT ON COLUMN oferta.publicada_por  IS 'Usuario que publicó.';
COMMENT ON COLUMN oferta.cerrada_en     IS 'Fecha y hora en que se retiró o concretó.';
COMMENT ON COLUMN oferta.cerrada_por    IS 'Usuario que la cerró.';

-- ---------------------------------------------------------------- mensaje
COMMENT ON TABLE  mensaje IS 'Conversación sobre una oferta. Muestra el nombre del autor, nunca su cédula ni su correo (D9).';
COMMENT ON COLUMN mensaje.id         IS 'Identificador interno.';
COMMENT ON COLUMN mensaje.oferta_id  IS 'Oferta sobre la que se conversa (solo ofertas ACTIVAS reciben mensajes).';
COMMENT ON COLUMN mensaje.autor_id   IS 'Usuario que escribió.';
COMMENT ON COLUMN mensaje.texto      IS 'Contenido del mensaje.';
COMMENT ON COLUMN mensaje.enviado_en IS 'Fecha y hora del mensaje.';

-- ---------------------------------------------------------------- auditoria
COMMENT ON TABLE  auditoria IS 'Bitácora de operaciones: quién hizo qué y cuándo (RNF-AUD-01).';
COMMENT ON COLUMN auditoria.id          IS 'Identificador interno.';
COMMENT ON COLUMN auditoria.ocurrido_en IS 'Fecha y hora de la operación.';
COMMENT ON COLUMN auditoria.usuario_id  IS 'Usuario que la realizó.';
COMMENT ON COLUMN auditoria.accion      IS 'Operación (p. ej. CREAR, REGISTRAR, VERIFICAR, ANULAR, EMITIR), junto con la tabla afectada.';
COMMENT ON COLUMN auditoria.tabla       IS 'Tabla afectada.';
COMMENT ON COLUMN auditoria.registro_id IS 'Identificador del registro afectado.';
COMMENT ON COLUMN auditoria.detalle     IS 'Datos adicionales de la operación (JSON).';

-- ---------------------------------------------------------------- sesion
COMMENT ON TABLE  sesion IS 'Sesiones abiertas de la aplicación (connect-pg-simple). Permiten reiniciar el servidor sin cerrar sesiones.';
COMMENT ON COLUMN sesion.sid    IS 'Identificador aleatorio de la sesión (va en la cookie cam.sid).';
COMMENT ON COLUMN sesion.sess   IS 'Datos de la sesión: usuario, rol y nombre.';
COMMENT ON COLUMN sesion.expire IS 'Vencimiento de la sesión (8 horas).';

-- ---------------------------------------------------------------- vistas
COMMENT ON VIEW v_totales_adquisicion IS 'Totales por adquisición: pagos registrados y verificados (base de los demás cálculos).';
COMMENT ON VIEW v_estado_cuenta       IS 'Estado de cuenta por adquisición: abonado (solo verificados, D2), cuotas pagadas y pendientes, saldo y situación EN_CURSO / PAGADA.';
COMMENT ON VIEW v_plan_cuotas         IS 'Plan de cuotas de cada adquisición: cada cuota con su pago y estado, o pendiente.';
COMMENT ON VIEW v_comprobante_detalle IS 'Comprobantes con su estado de envío: ENVIADO, FALLIDO o PENDIENTE (sin intentos), y el último intento.';
COMMENT ON VIEW v_pago_detalle        IS 'Pagos con propietario, semana, usuarios que registraron o verificaron y comprobante.';
COMMENT ON VIEW v_recaudo_mensual     IS 'Recaudo agrupado por mes de pago, registrado y verificado por separado.';
COMMENT ON VIEW v_semana_titular      IS 'Semanas con su titular vigente (si lo hay) y su disponibilidad: DISPONIBLE o CON_TITULAR.';
COMMENT ON VIEW v_oferta_detalle      IS 'Ofertas con semana y nombre del oferente. Sin cédula ni correo (Ley 1581).';
COMMENT ON VIEW v_mensaje_detalle     IS 'Mensajes con nombre del autor y su rol. Sin cédula ni correo (Ley 1581).';
COMMENT ON VIEW v_panel               IS 'Indicadores del panel principal, calculados (ninguna cifra fija).';
