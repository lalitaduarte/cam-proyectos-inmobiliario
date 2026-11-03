# Diccionario de datos — CAM

Generado automáticamente desde la base `cam_db` (PostgreSQL, esquema `cam`) el 3 de noviembre de 2026, con `npm.cmd run diccionario`.
Las descripciones están guardadas en la propia base (`sql/07_comentarios.sql`). Diagrama: [diagrama_er.md](diagrama_er.md).

**Contenido:** 14 tablas, 10 vistas, 23 funciones.

Convenciones: *Obligatorio* = la columna no admite valores vacíos (NOT NULL). Los valores en pesos usan `numeric(14,2)`.
Las fechas y horas (`timestamptz`) se muestran en la zona America/Bogota.

## Índice

- [adquisicion](#adquisicion) — Titularidad de una semana con copia de sus condiciones económicas. Conserva historial.
- [auditoria](#auditoria) — Bitácora de operaciones: quién hizo qué y cuándo (RNF-AUD-01).
- [comprobante](#comprobante) — Comprobantes internos de pago. Inmutables una vez emitidos.
- [consecutivo_comprobante](#consecutivo_comprobante) — Contador de una sola fila para numerar comprobantes sin repetir ni dejar saltos.
- [envio_comprobante](#envio_comprobante) — Intentos de envío de comprobantes por correo, con su resultado. No se modifica.
- [mensaje](#mensaje) — Conversación sobre una oferta. Muestra el nombre del autor, nunca su cédula ni su correo (D9).
- [oferta](#oferta) — Ofertas de venta o intercambio de semanas publicadas en la comunidad.
- [pago](#pago) — Pagos de cuotas. No se eliminan: se anulan con motivo, usuario y fecha.
- [parametro_accion](#parametro_accion) — Historial de condiciones de la acción (valor, cuotas). La más reciente es la vigente. No se modifica.
- [propietario](#propietario) — Personas que adquieren semanas de la vivienda turística (datos personales, Ley 1581 de 2012).
- [semana](#semana) — Semanas de uso de la vivienda turística (1 a 52), permanentes (D1).
- [semana_fecha](#semana_fecha) — Calendario: fechas reales de entrada y salida de cada semana en cada año.
- [sesion](#sesion) — Sesiones abiertas de la aplicación (connect-pg-simple). Permiten reiniciar el servidor sin cerrar sesiones.
- [usuario](#usuario) — Cuentas de acceso a la aplicación: secretarias y propietarios.

Vistas: [v_comprobante_detalle](#v_comprobante_detalle), [v_estado_cuenta](#v_estado_cuenta), [v_mensaje_detalle](#v_mensaje_detalle), [v_oferta_detalle](#v_oferta_detalle), [v_pago_detalle](#v_pago_detalle), [v_panel](#v_panel), [v_plan_cuotas](#v_plan_cuotas), [v_recaudo_mensual](#v_recaudo_mensual), [v_semana_titular](#v_semana_titular), [v_totales_adquisicion](#v_totales_adquisicion)

## Tablas

### adquisicion

Titularidad de una semana con copia de sus condiciones económicas. Conserva historial.

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | bigint | Sí | identidad (automático) | Identificador interno. |
| `propietario_id` | bigint | Sí | — | Propietario titular. |
| `semana_id` | bigint | Sí | — | Semana adquirida. Solo un titular VIGENTE por semana. |
| `fecha_adquisicion` | date | Sí | — | Fecha de la adquisición; no puede ser futura. |
| `parametro_id` | bigint | Sí | — | Condiciones vigentes cuando se creó la adquisición. |
| `valor_accion` | numeric(14,2) | Sí | — | Copia del valor de la acción: cambios posteriores de parámetros no la afectan. |
| `numero_cuotas` | smallint | Sí | — | Copia del número de cuotas pactado. |
| `valor_cuota` | numeric(14,2) | Sí | — | Copia del valor de cuota pactado. |
| `estado_titularidad` | character varying(12) | Sí | 'VIGENTE'::character varying | VIGENTE o TRANSFERIDA. La situación de pago no se guarda: se calcula (v_estado_cuenta). |
| `fecha_fin_titularidad` | date | No | — | Fecha en que dejó de ser vigente (solo TRANSFERIDA). |
| `observacion` | character varying(300) | No | — | Observación opcional. |
| `creado_en` | timestamp with time zone | Sí | now() | Fecha y hora de registro. |
| `creado_por` | bigint | Sí | — | Usuario que asignó la semana. |

**Reglas en la base:**

- Validación (CHECK) `adquisicion_coherente`: `CHECK ((((numero_cuotas)::numeric * valor_cuota) = valor_accion))`
- Validación (CHECK) `adquisicion_estado_valido`: `CHECK (((estado_titularidad)::text = ANY ((ARRAY['VIGENTE'::character varying, 'TRANSFERIDA'::character varying])::text[])))`
- Validación (CHECK) `adquisicion_fin_coherente`: `CHECK ((((estado_titularidad)::text = 'VIGENTE'::text) = (fecha_fin_titularidad IS NULL)))`
- Validación (CHECK) `adquisicion_valores_positivos`: `CHECK (((valor_accion > (0)::numeric) AND (valor_cuota > (0)::numeric) AND (numero_cuotas > 0)))`
- Llave foránea `adquisicion_creado_por_fkey`: `FOREIGN KEY (creado_por) REFERENCES usuario(id)`
- Llave foránea `adquisicion_parametro_id_fkey`: `FOREIGN KEY (parametro_id) REFERENCES parametro_accion(id)`
- Llave foránea `adquisicion_propietario_id_fkey`: `FOREIGN KEY (propietario_id) REFERENCES propietario(id)`
- Llave foránea `adquisicion_semana_id_fkey`: `FOREIGN KEY (semana_id) REFERENCES semana(id)`
- Llave primaria `adquisicion_pkey`: `PRIMARY KEY (id)`
- Índice `adquisicion_propietario_idx`: `INDEX adquisicion_propietario_idx ON cam.adquisicion (propietario_id)`
- Índice `adquisicion_titular_vigente_uq`: `UNIQUE INDEX adquisicion_titular_vigente_uq ON cam.adquisicion (semana_id) WHERE ((estado_titularidad)::text = 'VIGENTE'::text)`
- Trigger `adquisicion_proteger` → `tg_adquisicion_proteger()`

### auditoria

Bitácora de operaciones: quién hizo qué y cuándo (RNF-AUD-01).

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | bigint | Sí | identidad (automático) | Identificador interno. |
| `ocurrido_en` | timestamp with time zone | Sí | now() | Fecha y hora de la operación. |
| `usuario_id` | bigint | No | — | Usuario que la realizó. |
| `accion` | character varying(40) | Sí | — | Operación (p. ej. CREAR, REGISTRAR, VERIFICAR, ANULAR, EMITIR), junto con la tabla afectada. |
| `tabla` | character varying(40) | Sí | — | Tabla afectada. |
| `registro_id` | bigint | No | — | Identificador del registro afectado. |
| `detalle` | jsonb | No | — | Datos adicionales de la operación (JSON). |

**Reglas en la base:**

- Llave foránea `auditoria_usuario_id_fkey`: `FOREIGN KEY (usuario_id) REFERENCES usuario(id)`
- Llave primaria `auditoria_pkey`: `PRIMARY KEY (id)`
- Índice `auditoria_fecha_idx`: `INDEX auditoria_fecha_idx ON cam.auditoria (ocurrido_en DESC)`
- Índice `auditoria_registro_idx`: `INDEX auditoria_registro_idx ON cam.auditoria (tabla, registro_id)`

### comprobante

Comprobantes internos de pago. Inmutables una vez emitidos.

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | bigint | Sí | identidad (automático) | Identificador interno. |
| `consecutivo` | bigint | Sí | — | Número consecutivo sin saltos. Único. |
| `numero` | character varying(20) | Sí | — | Número visible, formato CP-000001. Único. |
| `pago_id` | bigint | Sí | — | Pago soportado. Máximo un comprobante por pago; solo pagos verificados (D3). |
| `emitido_en` | timestamp with time zone | Sí | now() | Fecha y hora de emisión. |
| `emitido_por` | bigint | Sí | — | Usuario que emitió. |
| `empresa` | character varying(120) | Sí | — | Fotografía: razón social de la empresa al emitir. |
| `emisor_nombre` | character varying(120) | Sí | — | Fotografía: nombre de quien emitió. |
| `propietario_cedula` | character varying(12) | Sí | — | Fotografía: cédula del propietario al emitir. |
| `propietario_nombre` | character varying(120) | Sí | — | Fotografía: nombre del propietario al emitir. |
| `propietario_correo` | character varying(254) | Sí | — | Fotografía: correo del propietario al emitir. |
| `semana_numero` | smallint | Sí | — | Fotografía: número de semana. |
| `numero_cuota` | smallint | Sí | — | Fotografía: cuota pagada. |
| `numero_cuotas` | smallint | Sí | — | Fotografía: total de cuotas del plan. |
| `valor` | numeric(14,2) | Sí | — | Fotografía: valor pagado. |
| `fecha_pago` | date | Sí | — | Fotografía: fecha del pago. |
| `total_abonado` | numeric(14,2) | Sí | — | Fotografía: total verificado al emitir. |
| `cuotas_pendientes` | smallint | Sí | — | Fotografía: cuotas pendientes al emitir. |
| `saldo` | numeric(14,2) | Sí | — | Fotografía: saldo al emitir. |
| `nota` | character varying(120) | Sí | 'Soporte interno de pago. No es factura electrónica.'::character varying | Leyenda del comprobante (no es factura electrónica). |

**Reglas en la base:**

- Validación (CHECK) `comprobante_numero_formato`: `CHECK (((numero)::text ~ '^CP-[0-9]{6,}$'::text))`
- Llave foránea `comprobante_emitido_por_fkey`: `FOREIGN KEY (emitido_por) REFERENCES usuario(id)`
- Llave foránea `comprobante_pago_id_fkey`: `FOREIGN KEY (pago_id) REFERENCES pago(id)`
- Llave primaria `comprobante_pkey`: `PRIMARY KEY (id)`
- Índice `comprobante_consecutivo_uq`: `UNIQUE INDEX comprobante_consecutivo_uq ON cam.comprobante (consecutivo)`
- Índice `comprobante_numero_uq`: `UNIQUE INDEX comprobante_numero_uq ON cam.comprobante (numero)`
- Índice `comprobante_pago_uq`: `UNIQUE INDEX comprobante_pago_uq ON cam.comprobante (pago_id)`
- Trigger `comprobante_inmutable` → `tg_inmutable()`

### consecutivo_comprobante

Contador de una sola fila para numerar comprobantes sin repetir ni dejar saltos.

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | smallint | Sí | 1 | Siempre 1 (una sola fila). |
| `ultimo` | bigint | Sí | 0 | Último número de comprobante emitido. |

**Reglas en la base:**

- Validación (CHECK) `consecutivo_positivo`: `CHECK ((ultimo >= 0))`
- Validación (CHECK) `consecutivo_una_fila`: `CHECK ((id = 1))`
- Llave primaria `consecutivo_comprobante_pkey`: `PRIMARY KEY (id)`

### envio_comprobante

Intentos de envío de comprobantes por correo, con su resultado. No se modifica.

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | bigint | Sí | identidad (automático) | Identificador interno. |
| `comprobante_id` | bigint | Sí | — | Comprobante enviado. |
| `correo_destino` | character varying(254) | Sí | — | Correo al que se intentó enviar. |
| `estado` | character varying(10) | Sí | — | Resultado del intento: ENVIADO o FALLIDO. |
| `detalle_error` | character varying(500) | No | — | Motivo del fallo, si lo hubo. |
| `intentado_en` | timestamp with time zone | Sí | now() | Fecha y hora del intento. |
| `intentado_por` | bigint | Sí | — | Usuario que lo intentó. |

**Reglas en la base:**

- Validación (CHECK) `envio_error_coherente`: `CHECK ((((estado)::text = 'FALLIDO'::text) = (detalle_error IS NOT NULL)))`
- Validación (CHECK) `envio_estado_valido`: `CHECK (((estado)::text = ANY ((ARRAY['ENVIADO'::character varying, 'FALLIDO'::character varying])::text[])))`
- Llave foránea `envio_comprobante_comprobante_id_fkey`: `FOREIGN KEY (comprobante_id) REFERENCES comprobante(id)`
- Llave foránea `envio_comprobante_intentado_por_fkey`: `FOREIGN KEY (intentado_por) REFERENCES usuario(id)`
- Llave primaria `envio_comprobante_pkey`: `PRIMARY KEY (id)`
- Índice `envio_comprobante_idx`: `INDEX envio_comprobante_idx ON cam.envio_comprobante (comprobante_id, intentado_en DESC)`
- Trigger `envio_inmutable` → `tg_inmutable()`

### mensaje

Conversación sobre una oferta. Muestra el nombre del autor, nunca su cédula ni su correo (D9).

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | bigint | Sí | identidad (automático) | Identificador interno. |
| `oferta_id` | bigint | Sí | — | Oferta sobre la que se conversa (solo ofertas ACTIVAS reciben mensajes). |
| `autor_id` | bigint | Sí | — | Usuario que escribió. |
| `texto` | character varying(1000) | Sí | — | Contenido del mensaje. |
| `enviado_en` | timestamp with time zone | Sí | now() | Fecha y hora del mensaje. |

**Reglas en la base:**

- Validación (CHECK) `mensaje_texto_no_vacio`: `CHECK ((length(btrim((texto)::text)) >= 1))`
- Llave foránea `mensaje_autor_id_fkey`: `FOREIGN KEY (autor_id) REFERENCES usuario(id)`
- Llave foránea `mensaje_oferta_id_fkey`: `FOREIGN KEY (oferta_id) REFERENCES oferta(id)`
- Llave primaria `mensaje_pkey`: `PRIMARY KEY (id)`
- Índice `mensaje_oferta_idx`: `INDEX mensaje_oferta_idx ON cam.mensaje (oferta_id, enviado_en)`
- Trigger `mensaje_oferta_activa` → `tg_mensaje_oferta_activa()`

### oferta

Ofertas de venta o intercambio de semanas publicadas en la comunidad.

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | bigint | Sí | identidad (automático) | Identificador interno. |
| `adquisicion_id` | bigint | Sí | — | Semana ofertada (adquisición vigente del propietario). Una oferta ACTIVA por adquisición. |
| `tipo` | character varying(12) | Sí | — | VENTA (con precio) o INTERCAMBIO (sin precio). |
| `precio` | numeric(14,2) | No | — | Precio de venta, mayor que 0. Nulo en intercambios. |
| `descripcion` | character varying(1000) | Sí | — | Texto de la oferta. |
| `estado` | character varying(12) | Sí | 'ACTIVA'::character varying | ACTIVA, RETIRADA o CONCRETADA. Concretar no transfiere la titularidad. |
| `publicada_en` | timestamp with time zone | Sí | now() | Fecha y hora de publicación. |
| `publicada_por` | bigint | Sí | — | Usuario que publicó. |
| `cerrada_en` | timestamp with time zone | No | — | Fecha y hora en que se retiró o concretó. |
| `cerrada_por` | bigint | No | — | Usuario que la cerró. |

**Reglas en la base:**

- Validación (CHECK) `oferta_cierre_coherente`: `CHECK ((((estado)::text = 'ACTIVA'::text) = ((cerrada_en IS NULL) AND (cerrada_por IS NULL))))`
- Validación (CHECK) `oferta_descripcion_min`: `CHECK ((length(btrim((descripcion)::text)) >= 5))`
- Validación (CHECK) `oferta_estado_valido`: `CHECK (((estado)::text = ANY ((ARRAY['ACTIVA'::character varying, 'RETIRADA'::character varying, 'CONCRETADA'::character varying])::text[])))`
- Validación (CHECK) `oferta_precio_segun_tipo`: `CHECK (((((tipo)::text = 'VENTA'::text) AND (precio IS NOT NULL) AND (precio > (0)::numeric)) OR (((tipo)::text = 'INTERCAMBIO'::text) AND (precio IS NULL))))`
- Validación (CHECK) `oferta_tipo_valido`: `CHECK (((tipo)::text = ANY ((ARRAY['VENTA'::character varying, 'INTERCAMBIO'::character varying])::text[])))`
- Llave foránea `oferta_adquisicion_id_fkey`: `FOREIGN KEY (adquisicion_id) REFERENCES adquisicion(id)`
- Llave foránea `oferta_cerrada_por_fkey`: `FOREIGN KEY (cerrada_por) REFERENCES usuario(id)`
- Llave foránea `oferta_publicada_por_fkey`: `FOREIGN KEY (publicada_por) REFERENCES usuario(id)`
- Llave primaria `oferta_pkey`: `PRIMARY KEY (id)`
- Índice `oferta_activa_por_adquisicion_uq`: `UNIQUE INDEX oferta_activa_por_adquisicion_uq ON cam.oferta (adquisicion_id) WHERE ((estado)::text = 'ACTIVA'::text)`
- Índice `oferta_activas_idx`: `INDEX oferta_activas_idx ON cam.oferta (publicada_en DESC) WHERE ((estado)::text = 'ACTIVA'::text)`

### pago

Pagos de cuotas. No se eliminan: se anulan con motivo, usuario y fecha.

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | bigint | Sí | identidad (automático) | Identificador interno. |
| `adquisicion_id` | bigint | Sí | — | Adquisición a la que corresponde la cuota. |
| `numero_cuota` | smallint | Sí | — | Cuota pagada, de 1 al número de cuotas pactado. No se repite (salvo pagos anulados). |
| `valor` | numeric(14,2) | Sí | — | Valor pagado; debe ser igual al valor de cuota pactado (D5: un pago = una cuota). |
| `fecha_pago` | date | Sí | — | Fecha en que el propietario pagó; no futura ni anterior a la adquisición. |
| `referencia` | character varying(80) | No | — | Referencia bancaria o del recibo (opcional). |
| `estado` | character varying(14) | Sí | 'NO_VERIFICADO'::character varying | NO_VERIFICADO (al registrarse), VERIFICADO (dinero confirmado) o ANULADO (error, con motivo). |
| `registrado_en` | timestamp with time zone | Sí | now() | Fecha y hora de registro en el sistema (la fija el servidor, RN13). |
| `registrado_por` | bigint | Sí | — | Usuario que registró el pago (RNF-AUD-01). |
| `verificado_en` | timestamp with time zone | No | — | Fecha y hora de la verificación. |
| `verificado_por` | bigint | No | — | Usuario que verificó. |
| `anulado_en` | timestamp with time zone | No | — | Fecha y hora de la anulación. |
| `anulado_por` | bigint | No | — | Usuario que anuló. |
| `motivo_anulacion` | character varying(300) | No | — | Motivo obligatorio de la anulación (D4). |

**Reglas en la base:**

- Validación (CHECK) `pago_anulacion_coherente`: `CHECK ((((estado)::text = 'ANULADO'::text) = ((anulado_en IS NOT NULL) AND (anulado_por IS NOT NULL) AND (motivo_anulacion IS NOT NULL))))`
- Validación (CHECK) `pago_cuota_positiva`: `CHECK ((numero_cuota >= 1))`
- Validación (CHECK) `pago_estado_valido`: `CHECK (((estado)::text = ANY ((ARRAY['NO_VERIFICADO'::character varying, 'VERIFICADO'::character varying, 'ANULADO'::character varying])::text[])))`
- Validación (CHECK) `pago_valor_positivo`: `CHECK ((valor > (0)::numeric))`
- Validación (CHECK) `pago_verificacion_coherente`: `CHECK (((verificado_en IS NULL) = (verificado_por IS NULL)))`
- Llave foránea `pago_adquisicion_id_fkey`: `FOREIGN KEY (adquisicion_id) REFERENCES adquisicion(id)`
- Llave foránea `pago_anulado_por_fkey`: `FOREIGN KEY (anulado_por) REFERENCES usuario(id)`
- Llave foránea `pago_registrado_por_fkey`: `FOREIGN KEY (registrado_por) REFERENCES usuario(id)`
- Llave foránea `pago_verificado_por_fkey`: `FOREIGN KEY (verificado_por) REFERENCES usuario(id)`
- Llave primaria `pago_pkey`: `PRIMARY KEY (id)`
- Índice `pago_cuota_unica_uq`: `UNIQUE INDEX pago_cuota_unica_uq ON cam.pago (adquisicion_id, numero_cuota) WHERE ((estado)::text <> 'ANULADO'::text)`
- Índice `pago_fecha_idx`: `INDEX pago_fecha_idx ON cam.pago (fecha_pago)`
- Índice `pago_no_verificado_idx`: `INDEX pago_no_verificado_idx ON cam.pago (registrado_en) WHERE ((estado)::text = 'NO_VERIFICADO'::text)`
- Trigger `pago_proteger` → `tg_pago_proteger()`
- Trigger `pago_validar` → `tg_pago_validar()`

### parametro_accion

Historial de condiciones de la acción (valor, cuotas). La más reciente es la vigente. No se modifica.

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | bigint | Sí | identidad (automático) | Identificador interno. |
| `valor_accion` | numeric(14,2) | Sí | — | Valor total de la acción en pesos (p. ej. 18.000.000). |
| `numero_cuotas` | smallint | Sí | — | Número de cuotas (p. ej. 24). |
| `valor_cuota` | numeric(14,2) | Sí | — | Valor de cada cuota; cuotas × valor = valor de la acción (D7). |
| `vigente_desde` | timestamp with time zone | Sí | now() | Desde cuándo rigen estas condiciones para adquisiciones nuevas. |
| `creado_por` | bigint | No | — | Usuario que fijó las condiciones. |

**Reglas en la base:**

- Validación (CHECK) `parametro_coherente`: `CHECK ((((numero_cuotas)::numeric * valor_cuota) = valor_accion))`
- Validación (CHECK) `parametro_cuotas_rango`: `CHECK (((numero_cuotas >= 1) AND (numero_cuotas <= 120)))`
- Validación (CHECK) `parametro_valor_positivo`: `CHECK (((valor_accion > (0)::numeric) AND (valor_cuota > (0)::numeric)))`
- Llave foránea `parametro_accion_creado_por_fkey`: `FOREIGN KEY (creado_por) REFERENCES usuario(id)`
- Llave primaria `parametro_accion_pkey`: `PRIMARY KEY (id)`
- Índice `parametro_vigente_idx`: `INDEX parametro_vigente_idx ON cam.parametro_accion (vigente_desde DESC)`
- Trigger `parametro_inmutable` → `tg_inmutable()`

### propietario

Personas que adquieren semanas de la vivienda turística (datos personales, Ley 1581 de 2012).

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | bigint | Sí | identidad (automático) | Identificador interno. |
| `cedula` | character varying(12) | Sí | — | Cédula de ciudadanía, solo dígitos, guardada como texto para no perder ceros. Única. |
| `nombre_completo` | character varying(120) | Sí | — | Nombres y apellidos. |
| `correo` | character varying(254) | Sí | — | Correo para enviar comprobantes. Único sin distinguir mayúsculas. |
| `telefono` | character varying(20) | No | — | Teléfono de contacto (opcional). |
| `activo` | boolean | Sí | true | Falso = no inicia sesión ni publica ofertas; conserva adquisiciones e historial (D13). |
| `creado_en` | timestamp with time zone | Sí | now() | Fecha y hora de registro (la fija el servidor). |
| `creado_por` | bigint | No | — | Usuario (secretaria) que lo registró. |
| `actualizado_en` | timestamp with time zone | No | — | Fecha y hora de la última modificación. |
| `actualizado_por` | bigint | No | — | Usuario que hizo la última modificación. |

**Reglas en la base:**

- Validación (CHECK) `propietario_cedula_formato`: `CHECK (((cedula)::text ~ '^[0-9]{5,12}$'::text))`
- Validación (CHECK) `propietario_correo_formato`: `CHECK (((correo)::text ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text))`
- Validación (CHECK) `propietario_nombre_minimo`: `CHECK ((length(btrim((nombre_completo)::text)) >= 3))`
- Validación (CHECK) `propietario_telefono_formato`: `CHECK (((telefono IS NULL) OR ((telefono)::text ~ '^\+?[0-9 ]{7,20}$'::text)))`
- Llave foránea `propietario_actualizado_por_fk`: `FOREIGN KEY (actualizado_por) REFERENCES usuario(id)`
- Llave foránea `propietario_creado_por_fk`: `FOREIGN KEY (creado_por) REFERENCES usuario(id)`
- Llave primaria `propietario_pkey`: `PRIMARY KEY (id)`
- Índice `propietario_cedula_uq`: `UNIQUE INDEX propietario_cedula_uq ON cam.propietario (cedula)`
- Índice `propietario_correo_uq`: `UNIQUE INDEX propietario_correo_uq ON cam.propietario (lower((correo)::text))`

### semana

Semanas de uso de la vivienda turística (1 a 52), permanentes (D1).

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | bigint | Sí | identidad (automático) | Identificador interno. |
| `numero` | smallint | Sí | — | Número de la semana, de 1 a 52. Único. |
| `descripcion` | character varying(200) | No | — | Texto descriptivo opcional (p. ej. temporada). |
| `activa` | boolean | Sí | true | Falso = la semana no se ofrece para nuevas adquisiciones. |
| `creado_en` | timestamp with time zone | Sí | now() | Fecha y hora de creación. |
| `creado_por` | bigint | No | — | Usuario que la creó. |

**Reglas en la base:**

- Validación (CHECK) `semana_numero_rango`: `CHECK (((numero >= 1) AND (numero <= 52)))`
- Llave foránea `semana_creado_por_fkey`: `FOREIGN KEY (creado_por) REFERENCES usuario(id)`
- Llave primaria `semana_pkey`: `PRIMARY KEY (id)`
- Índice `semana_numero_uq`: `UNIQUE INDEX semana_numero_uq ON cam.semana (numero)`

### semana_fecha

Calendario: fechas reales de entrada y salida de cada semana en cada año.

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | bigint | Sí | identidad (automático) | Identificador interno. |
| `semana_id` | bigint | Sí | — | Semana a la que pertenecen las fechas. |
| `anio` | smallint | Sí | — | Año del calendario. Una sola pareja de fechas por semana y año. |
| `fecha_entrada` | date | Sí | — | Fecha de check-in. |
| `fecha_salida` | date | Sí | — | Fecha de check-out; posterior a la entrada. Las semanas no se traslapan. |
| `nota` | character varying(200) | No | — | Observación opcional. |
| `creado_en` | timestamp with time zone | Sí | now() | Fecha y hora de registro. |
| `creado_por` | bigint | No | — | Usuario que registró las fechas. |

**Reglas en la base:**

- Validación (CHECK) `semana_fecha_anio_rango`: `CHECK (((anio >= 2000) AND (anio <= 2100)))`
- Validación (CHECK) `semana_fecha_salida_mayor`: `CHECK ((fecha_salida > fecha_entrada))`
- Llave foránea `semana_fecha_creado_por_fkey`: `FOREIGN KEY (creado_por) REFERENCES usuario(id)`
- Llave foránea `semana_fecha_semana_id_fkey`: `FOREIGN KEY (semana_id) REFERENCES semana(id)`
- Llave primaria `semana_fecha_pkey`: `PRIMARY KEY (id)`
- Único `semana_fecha_una_por_anio`: `UNIQUE (semana_id, anio)`
- Exclusión `semana_fecha_sin_traslape`: `EXCLUDE USING gist (daterange(fecha_entrada, fecha_salida, '[)'::text) WITH &&)`

### sesion

Sesiones abiertas de la aplicación (connect-pg-simple). Permiten reiniciar el servidor sin cerrar sesiones.

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `sid` | character varying | Sí | — | Identificador aleatorio de la sesión (va en la cookie cam.sid). |
| `sess` | json | Sí | — | Datos de la sesión: usuario, rol y nombre. |
| `expire` | timestamp(6) without time zone | Sí | — | Vencimiento de la sesión (8 horas). |

**Reglas en la base:**

- Llave primaria `sesion_pkey`: `PRIMARY KEY (sid)`
- Índice `sesion_expire_idx`: `INDEX sesion_expire_idx ON cam.sesion (expire)`

### usuario

Cuentas de acceso a la aplicación: secretarias y propietarios.

| Columna | Tipo | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|---|
| `id` | bigint | Sí | identidad (automático) | Identificador interno. |
| `rol` | character varying(12) | Sí | — | SECRETARIA (administración) o PROPIETARIO (solo comunidad). |
| `login` | character varying(40) | No | — | Nombre de usuario de la secretaria. Los propietarios ingresan con su cédula. |
| `nombre` | character varying(120) | No | — | Nombre mostrado de la secretaria. |
| `propietario_id` | bigint | No | — | Propietario dueño de la cuenta (solo rol PROPIETARIO). Una cuenta por propietario. |
| `password_hash` | character varying(100) | Sí | — | Contraseña cifrada con bcrypt. Nunca se guarda la contraseña legible (RNF-SEG-01). |
| `debe_cambiar_clave` | boolean | Sí | true | Verdadero = la contraseña es temporal y debe cambiarse en el próximo ingreso (D12). |
| `activo` | boolean | Sí | true | Falso = la cuenta no puede iniciar sesión. |
| `intentos_fallidos` | smallint | Sí | 0 | Intentos de ingreso fallidos seguidos. A los 5 la cuenta se bloquea 15 minutos. |
| `bloqueado_hasta` | timestamp with time zone | No | — | Fin del bloqueo temporal por intentos fallidos. |
| `ultimo_acceso` | timestamp with time zone | No | — | Fecha y hora del último ingreso correcto. |
| `creado_en` | timestamp with time zone | Sí | now() | Fecha y hora de creación de la cuenta. |
| `creado_por` | bigint | No | — | Usuario que creó la cuenta. |

**Reglas en la base:**

- Validación (CHECK) `usuario_hash_bcrypt`: `CHECK (((password_hash)::text ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'::text))`
- Validación (CHECK) `usuario_intentos_ck`: `CHECK ((intentos_fallidos >= 0))`
- Validación (CHECK) `usuario_login_formato`: `CHECK (((login IS NULL) OR ((login)::text ~ '^[a-z0-9._-]{3,40}$'::text)))`
- Validación (CHECK) `usuario_rol_coherente`: `CHECK (((((rol)::text = 'SECRETARIA'::text) AND (login IS NOT NULL) AND (nombre IS NOT NULL) AND (propietario_id IS NULL)) OR (((rol)::text = 'PROPIETARIO'::text) AND (login IS NULL) AND (propietario_id IS NOT NULL))))`
- Validación (CHECK) `usuario_rol_valido`: `CHECK (((rol)::text = ANY ((ARRAY['SECRETARIA'::character varying, 'PROPIETARIO'::character varying])::text[])))`
- Llave foránea `usuario_creado_por_fkey`: `FOREIGN KEY (creado_por) REFERENCES usuario(id)`
- Llave foránea `usuario_propietario_id_fkey`: `FOREIGN KEY (propietario_id) REFERENCES propietario(id)`
- Llave primaria `usuario_pkey`: `PRIMARY KEY (id)`
- Índice `usuario_login_uq`: `UNIQUE INDEX usuario_login_uq ON cam.usuario (login)`
- Índice `usuario_propietario_uq`: `UNIQUE INDEX usuario_propietario_uq ON cam.usuario (propietario_id)`

## Vistas

Consultas guardadas que usa la aplicación. No almacenan datos: se calculan al consultarlas.

### v_comprobante_detalle

Comprobantes con su estado de envío: ENVIADO, FALLIDO o PENDIENTE (sin intentos), y el último intento.

Columnas: `id`, `consecutivo`, `numero`, `pago_id`, `emitido_en`, `emitido_por`, `empresa`, `emisor_nombre`, `propietario_cedula`, `propietario_nombre`, `propietario_correo`, `semana_numero`, `numero_cuota`, `numero_cuotas`, `valor`, `fecha_pago`, `total_abonado`, `cuotas_pendientes`, `saldo`, `nota`, `estado_envio`, `ultimo_intento`

### v_estado_cuenta

Estado de cuenta por adquisición: abonado (solo verificados, D2), cuotas pagadas y pendientes, saldo y situación EN_CURSO / PAGADA.

Columnas: `adquisicion_id`, `propietario_id`, `cedula`, `nombre_completo`, `correo`, `semana_id`, `semana_numero`, `fecha_adquisicion`, `estado_titularidad`, `valor_accion`, `numero_cuotas`, `valor_cuota`, `cuotas_registradas`, `cuotas_pagadas`, `cuotas_por_verificar`, `cuotas_pendientes`, `cuotas_sin_registrar`, `total_registrado`, `total_abonado`, `saldo`, `situacion_pago`

### v_mensaje_detalle

Mensajes con nombre del autor y su rol. Sin cédula ni correo (Ley 1581).

Columnas: `mensaje_id`, `oferta_id`, `autor_id`, `autor_rol`, `autor_nombre`, `texto`, `enviado_en`

### v_oferta_detalle

Ofertas con semana y nombre del oferente. Sin cédula ni correo (Ley 1581).

Columnas: `oferta_id`, `adquisicion_id`, `propietario_id`, `autor_nombre`, `semana_numero`, `tipo`, `precio`, `descripcion`, `estado`, `publicada_en`, `cerrada_en`, `total_mensajes`

### v_pago_detalle

Pagos con propietario, semana, usuarios que registraron o verificaron y comprobante.

Columnas: `pago_id`, `adquisicion_id`, `propietario_id`, `cedula`, `nombre_completo`, `semana_numero`, `numero_cuota`, `numero_cuotas`, `valor`, `fecha_pago`, `referencia`, `estado`, `registrado_en`, `registrado_por_nombre`, `verificado_en`, `verificado_por_nombre`, `anulado_en`, `anulado_por_nombre`, `motivo_anulacion`, `comprobante_id`, `comprobante_numero`, `estado_envio`

### v_panel

Indicadores del panel principal, calculados (ninguna cifra fija).

Columnas: `propietarios_activos`, `propietarios_registrados`, `semanas_total`, `semanas_con_titular`, `cuotas_plan_total`, `cuotas_pagadas_verificadas`, `cuotas_registradas`, `pagos_por_verificar`, `total_registrado`, `total_verificado`, `saldo_por_cobrar`, `comprobantes_por_enviar`, `ofertas_activas`

### v_plan_cuotas

Plan de cuotas de cada adquisición: cada cuota con su pago y estado, o pendiente.

Columnas: `adquisicion_id`, `numero_cuota`, `valor_cuota`, `pago_id`, `fecha_pago`, `estado_pago`, `situacion_cuota`, `comprobante_numero`

### v_recaudo_mensual

Recaudo agrupado por mes de pago, registrado y verificado por separado.

Columnas: `mes`, `pagos_registrados`, `total_registrado`, `pagos_verificados`, `total_verificado`

### v_semana_titular

Semanas con su titular vigente (si lo hay) y su disponibilidad: DISPONIBLE o CON_TITULAR.

Columnas: `semana_id`, `numero`, `descripcion`, `activa`, `adquisicion_id`, `propietario_id`, `titular_cedula`, `titular_nombre`, `fecha_adquisicion`, `disponibilidad`

### v_totales_adquisicion

Totales por adquisición: pagos registrados y verificados (base de los demás cálculos).

Columnas: `adquisicion_id`, `cuotas_registradas`, `cuotas_verificadas`, `total_registrado`, `total_verificado`

## Funciones

Las operaciones de negocio son funciones *SECURITY DEFINER*: se ejecutan con los permisos del dueño (`cam_admin`), validan las reglas y bloquean las filas que modifican. Así el usuario de la aplicación (`cam_app`) no necesita permiso para modificar directamente pagos, comprobantes ni ofertas.

| Función | Parámetros | Devuelve | Seguridad |
|---|---|---|---|
| `fn_anular_pago` | p_usuario_id bigint, p_pago_id bigint, p_motivo text | void | SECURITY DEFINER |
| `fn_auditar` | p_usuario_id bigint, p_accion text, p_tabla text, p_registro_id bigint, p_detalle jsonb | void | SECURITY DEFINER |
| `fn_bloquear_pago` | p_pago_id bigint | pago | SECURITY DEFINER |
| `fn_cerrar_oferta` | p_usuario_id bigint, p_oferta_id bigint, p_nuevo_estado text | void | SECURITY DEFINER |
| `fn_crear_adquisicion` | p_usuario_id bigint, p_propietario_id bigint, p_semana_id bigint, p_fecha_adquisicion date, p_observacion text | bigint | SECURITY DEFINER |
| `fn_eliminar_oferta` | p_usuario_id bigint, p_oferta_id bigint | void | SECURITY DEFINER |
| `fn_eliminar_propietario` | p_usuario_id bigint, p_propietario_id bigint | void | SECURITY DEFINER |
| `fn_emitir_comprobante` | p_usuario_id bigint, p_pago_id bigint | bigint | SECURITY DEFINER |
| `fn_enviar_mensaje` | p_usuario_id bigint, p_oferta_id bigint, p_texto text | bigint | SECURITY DEFINER |
| `fn_exigir_usuario` | p_usuario_id bigint, p_rol text | usuario | SECURITY DEFINER |
| `fn_nuevo_parametro` | p_usuario_id bigint, p_valor_accion numeric, p_numero_cuotas integer, p_valor_cuota numeric | bigint | SECURITY DEFINER |
| `fn_pesos` | p numeric | text | normal |
| `fn_publicar_oferta` | p_usuario_id bigint, p_adquisicion_id bigint, p_tipo text, p_precio numeric, p_descripcion text | bigint | SECURITY DEFINER |
| `fn_registrar_envio` | p_usuario_id bigint, p_comprobante_id bigint, p_correo text, p_estado text, p_detalle_error text | bigint | SECURITY DEFINER |
| `fn_registrar_pago` | p_usuario_id bigint, p_adquisicion_id bigint, p_numero_cuota integer, p_valor numeric, p_fecha_pago date, p_referencia text | bigint | SECURITY DEFINER |
| `fn_revertir_verificacion` | p_usuario_id bigint, p_pago_id bigint, p_motivo text | void | SECURITY DEFINER |
| `fn_sin_pago_en_mes` | p_anio integer, p_mes integer | TABLE(adquisicion_id bigint, cedula character varying, nombre_completo character varying, correo character varying, semana_numero smallint, cuotas_pagadas bigint, cuotas_registradas bigint, saldo numeric) | SECURITY DEFINER |
| `fn_verificar_pago` | p_usuario_id bigint, p_pago_id bigint | void | SECURITY DEFINER |
| `tg_adquisicion_proteger` | — | trigger | normal |
| `tg_inmutable` | — | trigger | normal |
| `tg_mensaje_oferta_activa` | — | trigger | normal |
| `tg_pago_proteger` | — | trigger | normal |
| `tg_pago_validar` | — | trigger | normal |
