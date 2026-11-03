-- =====================================================================
-- 02_tablas.sql
-- Proyecto CAM · Tablas, llaves, restricciones e índices.
-- Se ejecuta como cam_admin, sobre una base vacía (no borra nada:
-- si las tablas ya existen, se detiene con un mensaje).
--
-- Convenciones:
--   * Nombres en español, singular y minúscula.
--   * Llaves primarias "id" con IDENTITY (número automático).
--   * Dinero en NUMERIC(14,2) (equivalente de DECIMAL): sin errores de redondeo.
--   * Fechas de auditoría en timestamptz (fecha y hora con zona horaria);
--     fechas de negocio (pago, adquisición, check-in) en date.
--   * Las restricciones tienen nombre para que los errores sean entendibles.
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
SET search_path = cam;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'cam' AND tablename = 'pago') THEN
    RAISE EXCEPTION 'El esquema cam ya tiene tablas. Este script solo se ejecuta sobre una base vacía.';
  END IF;
END $$;

-- =====================================================================
-- PROPIETARIO: persona que adquiere una o varias semanas.
-- =====================================================================
CREATE TABLE propietario (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cedula           varchar(12)  NOT NULL,   -- texto: conserva ceros y no se usa en cálculos
  nombre_completo  varchar(120) NOT NULL,
  correo           varchar(254) NOT NULL,
  telefono         varchar(20),
  activo           boolean      NOT NULL DEFAULT true,
  creado_en        timestamptz  NOT NULL DEFAULT now(),
  creado_por       bigint,                  -- FK a usuario (se agrega más abajo)
  actualizado_en   timestamptz,
  actualizado_por  bigint,
  CONSTRAINT propietario_cedula_formato   CHECK (cedula ~ '^[0-9]{5,12}$'),
  CONSTRAINT propietario_nombre_minimo    CHECK (length(btrim(nombre_completo)) >= 3),
  CONSTRAINT propietario_correo_formato   CHECK (correo ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT propietario_telefono_formato CHECK (telefono IS NULL OR telefono ~ '^\+?[0-9 ]{7,20}$')
);
-- Unicidad (RN01). El correo se compara sin distinguir mayúsculas.
CREATE UNIQUE INDEX propietario_cedula_uq ON propietario (cedula);
CREATE UNIQUE INDEX propietario_correo_uq ON propietario (lower(correo));
COMMENT ON TABLE propietario IS 'Personas que adquieren semanas. No se eliminan si tienen historial; se desactivan.';

-- =====================================================================
-- USUARIO: cuentas de la APLICACIÓN (no son usuarios de PostgreSQL).
--   SECRETARIA  : entra con "login" + contraseña.
--   PROPIETARIO : entra con la cédula de su propietario + contraseña.
-- =====================================================================
CREATE TABLE usuario (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rol                 varchar(12)  NOT NULL,
  login               varchar(40),
  nombre              varchar(120),
  propietario_id      bigint REFERENCES propietario (id),
  password_hash       varchar(100) NOT NULL,
  debe_cambiar_clave  boolean      NOT NULL DEFAULT true,
  activo              boolean      NOT NULL DEFAULT true,
  intentos_fallidos   smallint     NOT NULL DEFAULT 0,
  bloqueado_hasta     timestamptz,
  ultimo_acceso       timestamptz,
  creado_en           timestamptz  NOT NULL DEFAULT now(),
  creado_por          bigint REFERENCES usuario (id),
  CONSTRAINT usuario_rol_valido CHECK (rol IN ('SECRETARIA', 'PROPIETARIO')),
  -- Una secretaria tiene login y nombre; un propietario se identifica por su ficha.
  CONSTRAINT usuario_rol_coherente CHECK (
       (rol = 'SECRETARIA'  AND login IS NOT NULL AND nombre IS NOT NULL AND propietario_id IS NULL)
    OR (rol = 'PROPIETARIO' AND login IS NULL AND propietario_id IS NOT NULL)),
  CONSTRAINT usuario_login_formato  CHECK (login IS NULL OR login ~ '^[a-z0-9._-]{3,40}$'),
  -- Solo se aceptan hash bcrypt: nunca contraseñas legibles (RNF-SEG-01).
  CONSTRAINT usuario_hash_bcrypt    CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
  CONSTRAINT usuario_intentos_ck    CHECK (intentos_fallidos >= 0)
);
CREATE UNIQUE INDEX usuario_login_uq       ON usuario (login);
CREATE UNIQUE INDEX usuario_propietario_uq ON usuario (propietario_id);  -- una cuenta por propietario
COMMENT ON TABLE usuario IS 'Cuentas de acceso a la aplicación. Contraseñas solo como hash bcrypt.';

ALTER TABLE propietario
  ADD CONSTRAINT propietario_creado_por_fk     FOREIGN KEY (creado_por)     REFERENCES usuario (id),
  ADD CONSTRAINT propietario_actualizado_por_fk FOREIGN KEY (actualizado_por) REFERENCES usuario (id);

-- =====================================================================
-- SEMANA: semana permanente de la vivienda (decisión D1).
-- El propietario adquiere "la semana N" para todos los años.
-- =====================================================================
CREATE TABLE semana (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero       smallint     NOT NULL,
  descripcion  varchar(200),
  activa       boolean      NOT NULL DEFAULT true,
  creado_en    timestamptz  NOT NULL DEFAULT now(),
  creado_por   bigint REFERENCES usuario (id),
  CONSTRAINT semana_numero_rango CHECK (numero BETWEEN 1 AND 52)
);
CREATE UNIQUE INDEX semana_numero_uq ON semana (numero);   -- RN02
COMMENT ON TABLE semana IS 'Semanas de uso de la vivienda turística (1 a 52), permanentes.';

-- =====================================================================
-- SEMANA_FECHA: calendario. Fechas reales de check-in y check-out
-- de cada semana en cada año. Las registra la secretaria.
-- =====================================================================
CREATE TABLE semana_fecha (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  semana_id      bigint   NOT NULL REFERENCES semana (id),
  anio           smallint NOT NULL,
  fecha_entrada  date     NOT NULL,
  fecha_salida   date     NOT NULL,
  nota           varchar(200),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  creado_por     bigint REFERENCES usuario (id),
  CONSTRAINT semana_fecha_anio_rango    CHECK (anio BETWEEN 2000 AND 2100),
  CONSTRAINT semana_fecha_salida_mayor  CHECK (fecha_salida > fecha_entrada),     -- RN02
  CONSTRAINT semana_fecha_una_por_anio  UNIQUE (semana_id, anio),
  -- Dos semanas no pueden ocupar los mismos días. El día de salida de una
  -- semana puede ser el de entrada de la siguiente (rango semiabierto [ ) ).
  CONSTRAINT semana_fecha_sin_traslape  EXCLUDE USING gist (daterange(fecha_entrada, fecha_salida, '[)') WITH &&)
);
COMMENT ON TABLE semana_fecha IS 'Calendario: fechas de check-in y check-out de cada semana por año.';

-- =====================================================================
-- PARAMETRO_ACCION: condiciones económicas vigentes (FUN-REP-01).
-- Nunca se modifica una fila: cada cambio crea una nueva. La vigente es
-- la de "vigente_desde" más reciente.
-- =====================================================================
CREATE TABLE parametro_accion (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  valor_accion   numeric(14,2) NOT NULL,
  numero_cuotas  smallint      NOT NULL,
  valor_cuota    numeric(14,2) NOT NULL,
  vigente_desde  timestamptz   NOT NULL DEFAULT now(),
  creado_por     bigint REFERENCES usuario (id),
  CONSTRAINT parametro_valor_positivo  CHECK (valor_accion > 0 AND valor_cuota > 0),
  CONSTRAINT parametro_cuotas_rango    CHECK (numero_cuotas BETWEEN 1 AND 120),
  -- Sin intereses: cuotas × valor de cuota = valor de la acción (decisión D7).
  CONSTRAINT parametro_coherente       CHECK (numero_cuotas * valor_cuota = valor_accion)
);
CREATE INDEX parametro_vigente_idx ON parametro_accion (vigente_desde DESC);
COMMENT ON TABLE parametro_accion IS 'Historial de condiciones de la acción. Las adquisiciones copian la vigente.';

-- =====================================================================
-- ADQUISICION: vincula un propietario con una semana (titularidad) y
-- guarda una COPIA de las condiciones económicas (RN09).
-- La situación de pago NO se guarda aquí: se calcula desde los pagos
-- (vista v_estado_cuenta). Terminar de pagar no libera la semana.
-- =====================================================================
CREATE TABLE adquisicion (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  propietario_id        bigint        NOT NULL REFERENCES propietario (id),
  semana_id             bigint        NOT NULL REFERENCES semana (id),
  fecha_adquisicion     date          NOT NULL,
  parametro_id          bigint        NOT NULL REFERENCES parametro_accion (id),
  valor_accion          numeric(14,2) NOT NULL,
  numero_cuotas         smallint      NOT NULL,
  valor_cuota           numeric(14,2) NOT NULL,
  estado_titularidad    varchar(12)   NOT NULL DEFAULT 'VIGENTE',
  fecha_fin_titularidad date,
  observacion           varchar(300),
  creado_en             timestamptz   NOT NULL DEFAULT now(),
  creado_por            bigint        NOT NULL REFERENCES usuario (id),
  CONSTRAINT adquisicion_valores_positivos CHECK (valor_accion > 0 AND valor_cuota > 0 AND numero_cuotas > 0),
  CONSTRAINT adquisicion_coherente         CHECK (numero_cuotas * valor_cuota = valor_accion),
  CONSTRAINT adquisicion_estado_valido     CHECK (estado_titularidad IN ('VIGENTE', 'TRANSFERIDA')),
  CONSTRAINT adquisicion_fin_coherente     CHECK ((estado_titularidad = 'VIGENTE') = (fecha_fin_titularidad IS NULL))
);
-- Una semana tiene como máximo UN titular vigente (RN03). Al ser un índice
-- único, PostgreSQL lo garantiza incluso con solicitudes simultáneas.
CREATE UNIQUE INDEX adquisicion_titular_vigente_uq ON adquisicion (semana_id) WHERE estado_titularidad = 'VIGENTE';
-- Búsquedas frecuentes: adquisiciones de un propietario (FUN-SEM-03).
CREATE INDEX adquisicion_propietario_idx ON adquisicion (propietario_id);
COMMENT ON TABLE adquisicion IS 'Titularidad de una semana con copia de sus condiciones económicas. Conserva historial.';

-- =====================================================================
-- PAGO: pago de UNA cuota completa de una adquisición (supuesto D5).
-- Estados: NO_VERIFICADO -> VERIFICADO; ANULADO conserva el historial (D4).
-- =====================================================================
CREATE TABLE pago (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adquisicion_id      bigint        NOT NULL REFERENCES adquisicion (id),
  numero_cuota        smallint      NOT NULL,
  valor               numeric(14,2) NOT NULL,
  fecha_pago          date          NOT NULL,              -- cuándo pagó el propietario
  referencia          varchar(80),                          -- p. ej. número de consignación
  estado              varchar(14)   NOT NULL DEFAULT 'NO_VERIFICADO',
  registrado_en       timestamptz   NOT NULL DEFAULT now(), -- cuándo se registró en el sistema
  registrado_por      bigint        NOT NULL REFERENCES usuario (id),
  verificado_en       timestamptz,
  verificado_por      bigint REFERENCES usuario (id),
  anulado_en          timestamptz,
  anulado_por         bigint REFERENCES usuario (id),
  motivo_anulacion    varchar(300),
  CONSTRAINT pago_cuota_positiva  CHECK (numero_cuota >= 1),
  CONSTRAINT pago_valor_positivo  CHECK (valor > 0),            -- RN04
  CONSTRAINT pago_estado_valido   CHECK (estado IN ('NO_VERIFICADO', 'VERIFICADO', 'ANULADO')),
  CONSTRAINT pago_verificacion_coherente CHECK ((verificado_en IS NULL) = (verificado_por IS NULL)),
  CONSTRAINT pago_anulacion_coherente CHECK (
    (estado = 'ANULADO') = (anulado_en IS NOT NULL AND anulado_por IS NOT NULL AND motivo_anulacion IS NOT NULL))
);
-- La misma cuota no puede estar dos veces en una adquisición (RN05), salvo
-- que el pago anterior esté ANULADO. Protege también ante concurrencia.
CREATE UNIQUE INDEX pago_cuota_unica_uq ON pago (adquisicion_id, numero_cuota) WHERE estado <> 'ANULADO';
-- Reportes de recaudo filtran por fecha de pago.
CREATE INDEX pago_fecha_idx ON pago (fecha_pago);
-- Panel: pagos pendientes de verificación.
CREATE INDEX pago_no_verificado_idx ON pago (registrado_en) WHERE estado = 'NO_VERIFICADO';
COMMENT ON TABLE pago IS 'Pagos de cuotas. No se eliminan: se anulan con motivo, usuario y fecha.';

-- =====================================================================
-- CONSECUTIVO_COMPROBANTE: contador sin saltos para numerar comprobantes.
-- Se bloquea la fila al emitir, así dos emisiones simultáneas no repiten número.
-- =====================================================================
CREATE TABLE consecutivo_comprobante (
  id      smallint PRIMARY KEY DEFAULT 1,
  ultimo  bigint   NOT NULL DEFAULT 0,
  CONSTRAINT consecutivo_una_fila CHECK (id = 1),
  CONSTRAINT consecutivo_positivo CHECK (ultimo >= 0)
);
INSERT INTO consecutivo_comprobante (id, ultimo) VALUES (1, 0);

-- =====================================================================
-- COMPROBANTE: soporte interno de un pago verificado (D3).
-- Guarda una "fotografía" de los datos al momento de emitir, para que
-- el comprobante no cambie si luego se edita el nombre del propietario.
-- =====================================================================
CREATE TABLE comprobante (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consecutivo           bigint        NOT NULL,
  numero                varchar(20)   NOT NULL,     -- CP-000001
  pago_id               bigint        NOT NULL REFERENCES pago (id),
  emitido_en            timestamptz   NOT NULL DEFAULT now(),
  emitido_por           bigint        NOT NULL REFERENCES usuario (id),
  -- Fotografía histórica
  empresa               varchar(120)  NOT NULL,
  emisor_nombre         varchar(120)  NOT NULL,
  propietario_cedula    varchar(12)   NOT NULL,
  propietario_nombre    varchar(120)  NOT NULL,
  propietario_correo    varchar(254)  NOT NULL,
  semana_numero         smallint      NOT NULL,
  numero_cuota          smallint      NOT NULL,
  numero_cuotas         smallint      NOT NULL,
  valor                 numeric(14,2) NOT NULL,
  fecha_pago            date          NOT NULL,
  total_abonado         numeric(14,2) NOT NULL,     -- verificado, incluido este pago
  cuotas_pendientes     smallint      NOT NULL,
  saldo                 numeric(14,2) NOT NULL,
  nota                  varchar(120)  NOT NULL DEFAULT 'Soporte interno de pago. No es factura electrónica.',
  CONSTRAINT comprobante_numero_formato CHECK (numero ~ '^CP-[0-9]{6,}$')
);
CREATE UNIQUE INDEX comprobante_pago_uq        ON comprobante (pago_id);      -- máximo uno por pago (RN06)
CREATE UNIQUE INDEX comprobante_numero_uq      ON comprobante (numero);
CREATE UNIQUE INDEX comprobante_consecutivo_uq ON comprobante (consecutivo);
COMMENT ON TABLE comprobante IS 'Comprobantes internos de pago. Inmutables una vez emitidos.';

-- =====================================================================
-- ENVIO_COMPROBANTE: cada intento REAL de envío por correo y su resultado.
-- Si no hay intentos, el comprobante está "pendiente de envío".
-- =====================================================================
CREATE TABLE envio_comprobante (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  comprobante_id  bigint       NOT NULL REFERENCES comprobante (id),
  correo_destino  varchar(254) NOT NULL,
  estado          varchar(10)  NOT NULL,
  detalle_error   varchar(500),
  intentado_en    timestamptz  NOT NULL DEFAULT now(),
  intentado_por   bigint       NOT NULL REFERENCES usuario (id),
  CONSTRAINT envio_estado_valido CHECK (estado IN ('ENVIADO', 'FALLIDO')),
  CONSTRAINT envio_error_coherente CHECK ((estado = 'FALLIDO') = (detalle_error IS NOT NULL))
);
CREATE INDEX envio_comprobante_idx ON envio_comprobante (comprobante_id, intentado_en DESC);

-- =====================================================================
-- OFERTA: publicación en la comunidad sobre una semana propia (RN10).
-- Publicar o cerrar una oferta NO cambia la titularidad.
-- =====================================================================
CREATE TABLE oferta (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adquisicion_id  bigint        NOT NULL REFERENCES adquisicion (id),
  tipo            varchar(12)   NOT NULL,
  precio          numeric(14,2),
  descripcion     varchar(1000) NOT NULL,
  estado          varchar(12)   NOT NULL DEFAULT 'ACTIVA',
  publicada_en    timestamptz   NOT NULL DEFAULT now(),
  publicada_por   bigint        NOT NULL REFERENCES usuario (id),
  cerrada_en      timestamptz,
  cerrada_por     bigint REFERENCES usuario (id),
  CONSTRAINT oferta_tipo_valido    CHECK (tipo IN ('VENTA', 'INTERCAMBIO')),
  CONSTRAINT oferta_precio_segun_tipo CHECK (
       (tipo = 'VENTA'       AND precio IS NOT NULL AND precio > 0)
    OR (tipo = 'INTERCAMBIO' AND precio IS NULL)),
  CONSTRAINT oferta_estado_valido  CHECK (estado IN ('ACTIVA', 'RETIRADA', 'CONCRETADA')),
  CONSTRAINT oferta_cierre_coherente CHECK ((estado = 'ACTIVA') = (cerrada_en IS NULL AND cerrada_por IS NULL)),
  CONSTRAINT oferta_descripcion_min CHECK (length(btrim(descripcion)) >= 5)
);
-- Una semana tiene como máximo una oferta activa a la vez.
CREATE UNIQUE INDEX oferta_activa_por_adquisicion_uq ON oferta (adquisicion_id) WHERE estado = 'ACTIVA';
-- Listado de ofertas activas ordenado por fecha (FUN-COM-02).
CREATE INDEX oferta_activas_idx ON oferta (publicada_en DESC) WHERE estado = 'ACTIVA';

-- =====================================================================
-- MENSAJE: conversación de una oferta (D9). Orden cronológico.
-- =====================================================================
CREATE TABLE mensaje (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oferta_id   bigint        NOT NULL REFERENCES oferta (id),
  autor_id    bigint        NOT NULL REFERENCES usuario (id),
  texto       varchar(1000) NOT NULL,
  enviado_en  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT mensaje_texto_no_vacio CHECK (length(btrim(texto)) >= 1)
);
CREATE INDEX mensaje_oferta_idx ON mensaje (oferta_id, enviado_en);

-- =====================================================================
-- AUDITORIA: registro de operaciones relevantes (RNF-AUD-01).
-- =====================================================================
CREATE TABLE auditoria (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ocurrido_en  timestamptz NOT NULL DEFAULT now(),
  usuario_id   bigint REFERENCES usuario (id),
  accion       varchar(40) NOT NULL,
  tabla        varchar(40) NOT NULL,
  registro_id  bigint,
  detalle      jsonb
);
CREATE INDEX auditoria_registro_idx ON auditoria (tabla, registro_id);
CREATE INDEX auditoria_fecha_idx    ON auditoria (ocurrido_en DESC);

-- =====================================================================
-- SESION: sesiones de inicio de sesión del backend (formato connect-pg-simple).
-- Guardarlas en la base permite que sobrevivan a reinicios del servidor.
-- =====================================================================
CREATE TABLE sesion (
  sid     varchar      NOT NULL PRIMARY KEY,
  sess    json         NOT NULL,
  expire  timestamp(6) NOT NULL
);
CREATE INDEX sesion_expire_idx ON sesion (expire);
