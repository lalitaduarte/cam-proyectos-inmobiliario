# Trazabilidad de requisitos y evidencia de pruebas — CAM

Revisión del 3 de noviembre de 2026. Para cada requisito de los documentos del equipo, esta matriz indica **dónde quedó implementado**, **qué prueba lo comprueba** y su **estado**:

- **Cumplido**: implementado y comprobado con una prueba automática cuya evidencia está guardada.
- **Cumplido con ajuste**: se cumple con una decisión distinta a la del documento original, aprobada o justificada en `PLAN.md`.
- **Parcial**: una parte está pendiente; se explica cuál.
- **Pendiente**: aún no se puede comprobar; se indica cuándo se hará.

Fuentes: [A2] *Actividad 2* (requisitos FUN y RNF) y [PL] *Plantilla diligenciada* (casos de prueba CP01–CP15).

## Pruebas automáticas y evidencia

| Abreviatura | Batería | Resultado | Evidencia en `pruebas/evidencias/` |
|---|---|---|---|
| **BD** | Base de datos: reglas, permisos, triggers y concurrencia (`bash pruebas/bd/ejecutar_pruebas_bd.sh`) | **139/139** | `bd_2026-11-04_1123.txt` |
| **API** | Backend: solicitudes HTTP al servidor real (`npm.cmd test`) | **66/66** | `api_2026-11-04_1143.txt` |
| **NAV** | Recorrido en Chrome, en computador y celular (`npm.cmd run test:navegador`) | **17/17** | `navegador_2026-11-04_1143.txt` y `capturas/` |
| **VOL** | Volumen y rendimiento (`npm.cmd run test:volumen`) | **3/3** | `volumen_2026-11-04_1140.txt` |
| **PER** | Persistencia tras reiniciar el servicio PostgreSQL 18 (`npm.cmd run persistencia`) | 12/12 tablas idénticas; la aplicación se recuperó sola | `persistencia_2026-11-03_0905.txt` |
| **RES** | Respaldo y restauración (`npm.cmd run respaldar` y `npm.cmd run probar-restauracion`) | 13/13 tablas idénticas | `restauracion_2026-11-03_0609.txt` |

Todas las baterías se ejecutan sobre la base de pruebas `cam_test`, nunca sobre `cam_db`. Los números como "API 23" indican el número de la prueba dentro del archivo de evidencia. Las letras como "BD-G" indican el grupo de pruebas de base de datos.

## Requisitos funcionales [A2]

| Código | Requisito | Implementación | Prueba | Estado |
|---|---|---|---|---|
| FUN-SEG-01 | Autenticar a la secretaria | `src/rutas/auth.js`, contraseñas bcrypt, bloqueo tras 5 intentos | API 3, 4, 8, 9; NAV 1, 2 | Cumplido |
| FUN-SEG-02 | Propietario entra con cédula | Cédula **+ contraseña**, con contraseña temporal que debe cambiarse | API 5, 6, 7, 10; NAV 14 | Cumplido con ajuste (C4: la cédula sola no protege los datos) |
| FUN-SEG-03 | Restringir funciones por rol | `exigirRol` en cada ruta; menú por rol | API 2, 5; NAV 12 | Cumplido |
| FUN-PRO-01 | Registrar propietario; cédula única | `propietarios.js`; índice único | API 15, 16; BD-P; NAV 3 | Cumplido |
| FUN-PRO-02 | Consultar y actualizar propietarios | Búsqueda por cédula o nombre; edición; el comprobante guarda una "fotografía" de los datos | API 15, 17; BD-K | Cumplido |
| FUN-SEM-01 | Semanas con número, check-in y check-out | 52 semanas permanentes, con calendario por año (D1); fechas sin traslapes | API 18; BD-S; NAV 9 | Cumplido con ajuste (D1) |
| FUN-SEM-02 | Asignar semanas; un titular por semana | `fn_crear_adquisicion` e índice único parcial | API 20; BD-A, BD-Z; NAV 4 | Cumplido. Cambio de titular con `fn_transferir_titularidad` (D16: el nuevo titular asume el saldo): BD-TT01–TT30, X14–X16; API 57–62; NAV 12 |
| FUN-SEM-03 | Semanas por propietario | Detalle del propietario con sus adquisiciones | API 19, 31 | Cumplido |
| FUN-PAG-01 | Registrar pago con usuario que registra | `fn_registrar_pago`; usuario y fecha los fija el servidor | API 21; NAV 5 | Cumplido |
| FUN-PAG-02 | Rechazar cuota fuera de rango, valor no positivo y cuota repetida | Validación en la función más índice único | API 22, 23; BD-G, BD-Z | Cumplido |
| FUN-PAG-03 | Verificar pagos | `fn_verificar_pago`; listados separados | API 24, 30; NAV 5 | Cumplido |
| FUN-PAG-04 | Historial de pagos ordenado | Plan de cuotas ordenado por número; reporte de historial | API 29, 41; VOL | Cumplido |
| FUN-PAG-05 | Anular registros erróneos, salvo si tienen comprobante | Anulación con motivo e historial (D4); triggers impiden borrar | API 27, 28; BD-N, BD-X | Cumplido con ajuste (D4: anulación con historial, no borrado) |
| FUN-CMP-01 | Comprobante con número único, máximo uno por pago | `fn_emitir_comprobante`, consecutivo sin saltos, PDF | API 24, 25, 26; BD-K, BD-Z; NAV 6 | Cumplido |
| FUN-CMP-02 | Enviar comprobante por correo y registrar el estado | Tabla `envio_comprobante` lista; el envío **no** se simula | API 27 | **Parcial**: falta configurar un servicio de correo (D11). Mientras tanto, PDF para descargar o imprimir |
| FUN-EDC-01 | Estado de cuenta: 10 cuotas = $7.500.000 / 14 / $10.500.000 | `v_estado_cuenta` (solo pagos verificados, D2) | API 29, 30; BD-E; NAV 7 | Cumplido |
| FUN-EDC-02 | Recaudo mensual: sin pago en el mes y pagos sin verificar | `fn_sin_pago_en_mes` y reporte "por verificar" | API 40, 42 | Cumplido con ajuste (C10: se llama "sin pago en el mes", no "mora") |
| FUN-COM-01 | Publicar oferta propia; precio solo en venta | `fn_publicar_oferta` | API 47, 48, 55; BD-C; NAV 13 | Cumplido |
| FUN-COM-02 | Ofertas activas con filtros | Filtro por tipo y fecha; solo ofertas ACTIVAS | API 45, 46 | Cumplido |
| FUN-COM-03 | Mensajes en orden, con autor, fecha y hora | `fn_enviar_mensaje`; sin cédula ni correo | API 50, 51; NAV 13 | Cumplido |
| FUN-COM-04 | Retirar, cerrar o eliminar oferta | `fn_cerrar_oferta`, `fn_eliminar_oferta` (solo sin mensajes, D10) | API 49, 52, 53, 54 | Cumplido |
| FUN-REP-01 | Parametrizar condiciones sin alterar el histórico | `parametro_accion` inmutable; las condiciones se copian a cada adquisición | API 32; BD-R; NAV 10 | Cumplido |
| FUN-REP-02 | Exportar a Excel con las mismas filas que la pantalla | Definición única de cada reporte (`src/servicios/reportes.js`) | API 33–40, 44; VOL; NAV 8 | Cumplido |

## Requisitos no funcionales [A2]

| Código | Requisito | Evidencia | Estado |
|---|---|---|---|
| RNF-REN-01 | Consultas ≤ 3 s con el plan completo | VOL: 15 consultas con 200 propietarios y 1.248 cuotas. La más lenta, el panel, tardó 0,46 s | Cumplido (medido en local; se repetirá publicado en la Etapa 6) |
| RNF-REN-02 | Exportar 1.200 registros en < 10 s | VOL: 1.249 filas en 2,4 s; el Excel se abrió y se contaron las filas | Cumplido |
| RNF-SEG-01 | Contraseñas solo como hash | bcrypt; API 11; BD-U | Cumplido |
| RNF-SEG-02 | Mínimo privilegio; el propietario no consulta pagos | `cam_app` sin permisos para borrar ni modificar pagos (BD-U); propietario recibe 403 (API 5); el backend no se conecta como superusuario | Cumplido (C11) |
| RNF-SEG-03 | Ley 1581: aviso de privacidad y datos protegidos | Aviso en la pantalla de ingreso; las vistas de comunidad no incluyen cédula ni correo (API 45) | Cumplido. Falta que CAM revise el texto del aviso |
| RNF-AUD-01 | Quién y cuándo en cada pago, verificación y comprobante | Columnas `registrado_por`, `verificado_por`, `emitido_por` y tabla `auditoria`; pantalla **Auditoría** de solo lectura (`v_auditoria_detalle`) | API 21, 63–66; BD-T, TT24, TT28–TT30; NAV 13 | Cumplido |
| RNF-FIA-01 | Transacciones ACID; 100 % de datos inválidos rechazados | Funciones transaccionales con `FOR UPDATE`; CHECK, UNIQUE, FK y triggers | BD (106 pruebas, todos los casos negativos rechazados); API 22, 23 | Cumplido |
| RNF-FIA-02 | Respaldo periódico y restauración comprobada | `npm.cmd run respaldar` / `probar-restauracion`; procedimiento de emergencia probado | RES 13/13; [respaldo_restauracion.md](respaldo_restauracion.md) | Cumplido en local. La **copia diaria** depende de programar la tarea; el respaldo en Neon se hará en la Etapa 6 |
| RNF-DIS-01 | Disponibilidad ≥ 95 % | — | **Pendiente** (Etapa 6). Riesgo: el plan gratuito de Render se suspende tras 15 minutos sin uso y tarda cerca de un minuto en despertar |
| RNF-USA-01 | Interfaz en español; registrar un pago en < 2 min | Todo en español; un pago se registra en una sola pantalla, con confirmación (NAV 5) | **Pendiente** la medición con una usuaria real tras la capacitación |
| RNF-MAN-01 | Scripts numerados que corren desde cero | `sql/00`–`07` y `ejecutar_todo.sql`; las pruebas BD reconstruyen la base desde cero cada vez; instalación limpia probada | Cumplido (versionado en Git y publicado en GitHub) |
| RNF-POR-01 | MySQL 8; archivos abiertos sin errores en Excel | Motor: **PostgreSQL** (C1, decisión de la docente). Excel `.xlsx` generado con `exceljs` y releído sin errores | Cumplido con ajuste. **Pendiente**: abrir un archivo en Microsoft Excel |
| RNF-ESC-01 | 200 propietarios (4.800 cuotas) dentro de la meta de rendimiento | VOL con 200 propietarios | Cumplido con ajuste: una vivienda de 52 semanas admite como máximo 52 × 24 = **1.248 cuotas** vigentes. Las 4.800 cuotas supondrían ~200 semanas, es decir, varias viviendas, que están fuera del alcance (C3) |

## Casos de prueba [PL]

| Caso | Acción | Resultado esperado | Prueba | Resultado |
|---|---|---|---|---|
| CP01 | Secretaria con clave correcta e incorrecta | Panel / mensaje sin indicar el campo | API 3, 4; NAV 1, 2 | Aprobado |
| CP02 | Cédula inexistente | Rechazo | API 3, 6 | Aprobado |
| CP03 | Propietario abre Pagos | 403 | API 5; NAV 12 | Aprobado |
| CP04 | Cédula repetida | 409; un solo registro | API 16; NAV 3 | Aprobado |
| CP05 | Check-out anterior al check-in | 400; no se guarda | API 18; NAV 9 | Aprobado |
| CP06 | Cuota 5 dos veces | 409 | API 22; BD-G | Aprobado |
| CP07 | Cuota 25 o valor 0 | 400 | API 22 | Aprobado |
| CP08 | Eliminar pago con comprobante | 409 con el motivo | API 27; BD-X | Aprobado (la anulación también se bloquea) |
| CP09 | Dos comprobantes para el mismo pago | Segundo rechazado; números únicos | API 24; BD-Z (10 emisiones simultáneas) | Aprobado |
| CP10 | Estado de cuenta con 10 cuotas | $7.500.000 / 14 / $10.500.000 | API 29; NAV 7 | Aprobado |
| CP11 | Intercambio con precio; semana ajena | Ambas rechazadas | API 47, 48 | Aprobado |
| CP12 | Cambiar valor de cuota | Histórico sin cambios | API 32; BD-R | Aprobado |
| CP13 | Dos sesiones registran la misma cuota | Una éxito, otra 409 | API 23 (8 simultáneas); BD-Z (10 simultáneas) | Aprobado |
| CP14 | Otro computador y recargar: los datos persisten | Datos en la base | API 56 (reinicio del servidor y otro cliente); PER (reinicio de PostgreSQL) | Aprobado en local. **Pendiente**: probar desde otro dispositivo con el enlace publicado (Etapa 6) |
| CP15 | Exportar 1.248 registros | < 10 s; mismas filas | VOL (2,4 s; 1.249 filas) | Aprobado |

## Resultados de rendimiento (VOL)

Servidor real en el computador de desarrollo, con 200 propietarios, 52 adquisiciones, 1.248 cuotas y 489 comprobantes. Se tomó el **peor** tiempo de 3 intentos:

| Operación | Tiempo | Meta |
|---|---|---|
| Panel principal | 461 ms | 3 s |
| Historial completo de pagos (1.249 filas) | 95 ms | 3 s |
| Últimos 5.000 pagos | 138 ms | 3 s |
| Estado de cuenta individual | 16 ms | 3 s |
| Reporte de saldos | 24 ms | 3 s |
| Excel: historial de pagos (1.249 filas) | 2.353 ms | 10 s |
| Carga de las 1.248 cuotas mediante las funciones de negocio | 6,2 s | — |

## Riesgos y limitaciones conocidos

| Tema | Detalle | Tratamiento |
|---|---|---|
| Dependencias | `npm audit`: 9 avisos moderados, todos internos de `exceljs` 4.4.0, que es su última versión. `minimatch` (ReDoS con patrones) y `uuid` (solo en v3/v5/v6 con `buf`) | No son explotables en CAM: `exceljs` usa solo `uuid.v4`, y `minimatch` nunca recibe datos del usuario. La única "corrección" de npm baja a `exceljs` 3.4.0, que es peor. Se revisará al publicar |
| Correo | Sin servicio de correo configurado | Los comprobantes se entregan en PDF. No se marca como enviado lo que no salió |
| Cambio de titular | Implementado (D16) | Regla aprobada por la docente. Conviene que CAM la confirme con su procedimiento legal |
| Mora | No hay fecha de vencimiento por cuota | Se usa "sin pago en el mes" (D6) |
| Contraseñas DEMO | `CamDemo2026!` y `Propietario2026!` son públicas | La publicación se hará con `--sin-demo` y cuentas reales (Etapa 6) |
