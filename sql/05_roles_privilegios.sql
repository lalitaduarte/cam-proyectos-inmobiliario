-- =====================================================================
-- 05_roles_privilegios.sql
-- Proyecto CAM · Permisos del usuario técnico de la aplicación (cam_app).
-- Principio de mínimo privilegio (RNF-SEG-02):
--   * Puede LEER tablas y vistas.
--   * Puede ESCRIBIR directamente solo en catálogos sencillos
--     (propietarios, semanas, calendario, cuentas de usuario, sesiones).
--   * Las operaciones críticas (adquisiciones, pagos, comprobantes,
--     ofertas, mensajes) SOLO a través de las funciones del script 04.
--   * No puede crear, modificar ni borrar tablas.
-- Se ejecuta como cam_admin.
-- =====================================================================
\set ON_ERROR_STOP on
\encoding UTF8
SET search_path = cam;

-- Nadie fuera de cam_admin recibe permisos por omisión.
REVOKE ALL ON SCHEMA cam FROM PUBLIC;
REVOKE ALL ON SCHEMA ext FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA cam FROM PUBLIC;

GRANT USAGE ON SCHEMA cam TO cam_app;

-- ---------------------------------------------------------------------
-- Lectura de todas las tablas y vistas.
-- ---------------------------------------------------------------------
GRANT SELECT ON ALL TABLES IN SCHEMA cam TO cam_app;

-- ---------------------------------------------------------------------
-- Escritura directa en catálogos.
-- ---------------------------------------------------------------------
GRANT INSERT, UPDATE ON propietario TO cam_app;
GRANT INSERT, UPDATE ON semana TO cam_app;
GRANT INSERT, UPDATE, DELETE ON semana_fecha TO cam_app;
GRANT INSERT ON auditoria TO cam_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sesion TO cam_app;

-- Cuentas de usuario: puede crearlas y cambiar solo estas columnas.
-- (No puede cambiar el rol ni a qué propietario pertenece una cuenta).
GRANT INSERT ON usuario TO cam_app;
GRANT UPDATE (nombre, password_hash, debe_cambiar_clave, activo,
              intentos_fallidos, bloqueado_hasta, ultimo_acceso) ON usuario TO cam_app;

-- ---------------------------------------------------------------------
-- Operaciones de negocio: solo mediante funciones.
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION
  fn_pesos(numeric),
  fn_nuevo_parametro(bigint, numeric, int, numeric),
  fn_crear_adquisicion(bigint, bigint, bigint, date, text),
  fn_registrar_pago(bigint, bigint, int, numeric, date, text),
  fn_verificar_pago(bigint, bigint),
  fn_revertir_verificacion(bigint, bigint, text),
  fn_anular_pago(bigint, bigint, text),
  fn_emitir_comprobante(bigint, bigint),
  fn_registrar_envio(bigint, bigint, text, text, text),
  fn_eliminar_propietario(bigint, bigint),
  fn_publicar_oferta(bigint, bigint, text, numeric, text),
  fn_cerrar_oferta(bigint, bigint, text),
  fn_eliminar_oferta(bigint, bigint),
  fn_enviar_mensaje(bigint, bigint, text),
  fn_sin_pago_en_mes(int, int)
TO cam_app;

-- Comprobación: lista de permisos por tabla para cam_app.
SELECT table_name AS tabla, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS permisos
  FROM information_schema.role_table_grants
 WHERE grantee = 'cam_app' AND table_schema = 'cam'
 GROUP BY table_name ORDER BY table_name;
