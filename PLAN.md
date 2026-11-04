# PLAN — Aplicación web CAM Proyectos Inmobiliario SAS

Proyecto integrador UTS. Motores de Base de Datos. Docente: Laura Cristina Duarte Quintero.
Equipo: Juan Steven Gómez Díaz, Luis Alejandro Gómez Eugenio, David Santiago Jaimes Campo, José Alejandro Hurtado Mantilla.

Estados usados en este documento:
- **Implementado**: el código o script existe.
- **Probado**: se ejecutó y se comprobó el resultado (con evidencia).
- **Pendiente**: aún no se ha hecho o falta una decisión.

---

## 1. Estado de la Etapa 1 (revisión y preparación)

Fecha de revisión: 2026-11-03.

| Tarea | Estado | Observación |
|---|---|---|
| Leer documentos del equipo | Probado | 2 documentos leídos completos, incluidas tablas e imágenes (sección 3) |
| Revisar herramientas instaladas | Probado | Sección 2 |
| Detectar motor de base de datos | Probado | No existe MySQL. Hay 5 versiones de PostgreSQL funcionando |
| Elegir motor | **Decidido** | PostgreSQL + Render + Neon (docente, 2026-11-03) |
| Revisar puertos | Probado | 3000 ocupado por Node (Fercho). Se reserva 3100 para CAM |
| Repositorio propio | Implementado y probado | `git init` en la carpeta CAM. `.env` ignorado, comprobado con `git check-ignore` |
| Contradicciones y reglas pendientes | Implementado | Secciones 4 y 6 |

---

## 2. Herramientas encontradas en el equipo

### 2.1. Herramientas de desarrollo

| Herramienta | Versión | Estado |
|---|---|---|
| Node.js | 22.20.0 | Lista |
| npm | 10.9.3 | Lista. En PowerShell se usa `npm.cmd` |
| Git | 2.55.0 | Lista |
| Python | 3.9.1 | Disponible. No es necesaria para el proyecto |
| MySQL | — | No instalado (ya no se necesita) |

### 2.2. PostgreSQL instalado (servicios de Windows, todos en ejecución)

| Versión | Puerto | Uso en CAM |
|---|---|---|
| 9.4 | 5433 | No se toca |
| 13 | 5432 | No se toca |
| 14 | 5434 | No se toca |
| 17 | 5435 | No se toca |
| **18** | **5436** | **CAM en desarrollo local** |

- El `psql` que aparece primero en el PATH es la versión 14. Con el servidor 18 se usarán las herramientas de `C:\Program Files\PostgreSQL\18\bin\`. Es obligatorio para las copias de seguridad: `pg_dump` 14 no puede respaldar un servidor 18.
- No hay credenciales guardadas. La primera conexión requiere la contraseña de `postgres`, que conoce la docente. No se comparte en el chat.

### 2.3. Aislamiento respecto a Fercho

- Fercho está en `C:\Proyectos Integradores\Fercho` y su servidor Node usa el puerto **3000**. No se leyeron ni modificaron sus archivos.
- CAM usará: carpeta propia, repositorio Git propio, bases `cam_db` (trabajo) y `cam_test` (pruebas), roles `cam_admin` y `cam_app`, archivo `.env` propio y puerto **3100**.

### 2.4. Publicación (condiciones a verificar en páginas oficiales en la Etapa 6)

- **Render (gratuito)**: el servidor web se apaga tras 15 minutos sin uso y tarda cerca de un minuto en volver a encender. El PostgreSQL gratuito de Render vence a los 30 días, por eso la base va en Neon.
- **Neon (gratuito)**: sin tarjeta y sin vencimiento. Se reporta de 0,5 a 1 GB por proyecto. La base se suspende sin uso y se reactiva sola.
- El volumen de CAM (menos de 5.000 cuotas incluso con 200 propietarios) es muy pequeño frente a esos límites.

---

## 3. Documentos leídos

| Documento | Abreviatura | Contenido útil |
|---|---|---|
| `Plantilla_diligenciada_CAM.docx` | [PL] | Caso, alcance de pagos, roles, reglas RN01–RN14, estados, modelo de 10 tablas, vistas, procedimientos, datos de referencia, ejemplo de comprobante, rutas de API, pantallas, pruebas CP01–CP15, pendientes |
| `Actividad_2_proyecto_integrado2_MySQL.docx` | [A2] | 23 requisitos funcionales, 13 no funcionales, supuestos, ciclo de vida incremental (3 incrementos), EDT y responsables |

No se entregó `Descripcion_problema_APA7_con_fuentes21.docx` ([DP]), que [PL] cita para el problema y los objetivos. No bloquea el diseño: [PL] y [A2] repiten lo esencial.

Según el encargo, **no se reutilizan** el enlace publicado (`cam-facturacion-1.onrender.com`), el repositorio ni los scripts mencionados. Los documentos solo sirven como fuente de requisitos.

### 3.1. Requisitos que se adoptan de los documentos

- Acción de $18.000.000 en 24 cuotas de $750.000, parametrizable (FUN-REP-01, RN09). Las condiciones **se copian** a cada adquisición.
- 52 semanas de la vivienda. Cada una con número, check-in y check-out (FUN-SEM-01).
- Una semana tiene un solo titular vigente. Un propietario puede tener varias semanas (RN03).
- Cuota en el rango 1..N del plan. Valor > 0. Una cuota no se registra dos veces (RN04, RN05).
- Todo pago nace **NO VERIFICADO**. La secretaria lo pasa a **VERIFICADO** (FUN-PAG-03).
- Máximo un comprobante por pago. Número único y consecutivo, con formato de ejemplo **`CP-000124`** (RN06).
- Un pago con comprobante no se modifica ni se elimina (RN07).
- Envío de comprobante con estados PENDIENTE / ENVIADO / FALLIDO, guardando el correo de destino y el resultado (FUN-CMP-02).
- Ofertas de VENTA (precio > 0) o INTERCAMBIO (sin precio), solo sobre semanas propias vigentes (RN10). Estados ACTIVA / RETIRADA / CONCRETADA (RN11).
- La secretaria también puede consultar ofertas, enviar mensajes y cerrar o eliminar ofertas ([PL] tabla de roles, FUN-COM-04).
- El usuario y la fecha de registro los determina el servidor (RN13). Zona horaria America/Bogota (RN14).
- Auditoría de quién registra, verifica y emite (RNF-AUD-01).
- Aviso de tratamiento de datos personales, Ley 1581 de 2012 (RNF-SEG-03).
- Rendimiento: consultas ≤ 3 s y exportación de 1.248 filas < 10 s (RNF-REN-01/02). Prueba con 200 propietarios (RNF-ESC-01).
- Copia de respaldo y restauración comprobada antes de la entrega (RNF-FIA-02).
- Scripts numerados que corren desde cero, más un script maestro (RNF-MAN-01). Nombres de [A2]: `01_esquemas`, `02_tablas`, `03_roles_privilegios`, `04_insercion_datos`, `05_consultas`, más vistas y procedimientos.
- El propietario **no** consulta su estado de cuenta en la aplicación; lo recibe de la secretaria ([A2] Supuestos).
- Desarrollo en 3 incrementos: (1) núcleo de recaudo, (2) soportes y control, (3) comunidad.

---

## 4. Contradicciones encontradas y cómo se resuelven

| # | Contradicción | Resolución |
|---|---|---|
| C1 | Motor: [PL] y [A2] corregido dicen MySQL 8. Las imágenes de [A2] dicen PostgreSQL. El encargo dice MySQL y también Render + Neon + PostgreSQL | **PostgreSQL** (decidido por la docente) |
| C2 | Lenguaje: la figura "Diseño" de [A2] dice **Java**. [PL] habla de Node.js | **Node.js** (encargo) |
| C3 | [A2] habla de 50 propietarios × 24 = **1.200 cuotas**. [PL] habla de 52 adquisiciones = **1.248 cuotas** | Se usa 52 adquisiciones = 1.248 cuotas. La cantidad de propietarios no determina la de cuotas |
| C4 | Ingreso del propietario **solo con cédula** (FUN-SEG-02) | **Cédula + contraseña** (encargo). La cédula identifica, la contraseña protege |
| C5 | Saldo = valor − **pagos registrados**, verificados o no (RN08) | Resuelta en D2: solo los pagos **verificados** descuentan saldo |
| C6 | Estado de la adquisición VIGENTE / TRANSFERIDA / **PAGADA** mezcla titularidad con situación financiera. Además, una adquisición PAGADA dejaría de ser "vigente" | Se separan: **titularidad** (VIGENTE / TRANSFERIDA) y **situación de pago** (calculada desde los pagos). Terminar de pagar no libera la semana |
| C7 | "Número de semana único" con una sola pareja de fechas, pero las fechas reales cambian cada año | Resuelta en D1: semana permanente con calendario de fechas por año |
| C8 | Anular pagos por **eliminación física** (FUN-PAG-05) contra la exigencia de auditoría (RNF-AUD-01) | Resuelta en D4: anulación lógica con historial |
| C9 | Comprobante para cualquier pago registrado. El ejemplo muestra un pago VERIFICADO | Resuelta en D3: comprobante solo para pagos verificados |
| C10 | "Recaudo mensual: propietarios con cuota pendiente en el mes" (FUN-EDC-02) suena a mora, pero su criterio es "sin pago registrado en ese periodo" | Se muestra como **"Adquisiciones sin pago registrado en el mes"**. No se llama "vencida". La mora queda pendiente de calendario (D6) |
| C11 | RNF-SEG-02 pide que "el rol de propietario" no consulte la tabla de pagos. Los propietarios **no** son usuarios de base de datos | Se cumple en dos niveles: el backend responde 403, y `cam_app` es el único usuario técnico, con privilegios mínimos |
| C12 | El procedimiento de transferencia figura en [PL] pero su política de saldos está "por confirmar" | **Resuelta el 2026-11-04 con D16**: el nuevo titular asume el saldo. Implementado (sección 14) |

---

## 5. Alcance de la primera versión

- **Una** vivienda turística dividida en semanas.
- Roles: **SECRETARIA** (administradora) y **PROPIETARIO**.
- Módulos: inicio de sesión, panel, propietarios, semanas, adquisiciones, pagos, comprobantes (PDF e impresión), estado de cuenta, recaudo y reportes (Excel), parámetros, comunidad (ofertas y mensajes).
- Fuera de alcance: facturación electrónica DIAN, integración bancaria, intereses de mora, pagos en línea, abonos parciales. (Las transferencias de titularidad se agregaron el 2026-11-04, decisión D16.)

### Arquitectura propuesta
- **Backend**: Node.js + Express. Conexión con `pg`. Sesiones con cookie segura guardadas en PostgreSQL. Contraseñas con `bcrypt`. PDF con `pdfkit`. Excel con `exceljs`.
- **Frontend**: HTML, CSS y JavaScript sin framework, servidos por el mismo Express. Es un solo servicio en Render, sin problemas de dominios cruzados.
- **Base de datos**: PostgreSQL 18 local y Neon en publicación. Scripts numerados en `sql/`.
- **Permisos**: verificados en cada ruta del backend según el rol de la sesión.
- **Operaciones críticas** (registrar pago, emitir comprobante, asignar semana) en **funciones/procedimientos transaccionales** con bloqueo de filas. La unicidad se refuerza con **índices únicos** (incluidos índices parciales), de modo que dos solicitudes simultáneas no puedan duplicar datos.

### Estructura de carpetas prevista
```
CAM/
├─ documentos/        Documentos del equipo (requisitos)
├─ sql/               Scripts numerados y comentados + script maestro
├─ src/               Backend (rutas, servicios, middleware)
├─ public/            Frontend (páginas, estilos, scripts)
├─ pruebas/           Pruebas automáticas y evidencias
├─ docs/              Diagrama ER, manuales, instalación, respaldo
├─ .env.example       Configuración de ejemplo (sin secretos)
└─ PLAN.md
```

---

## 6. Decisiones del negocio

### 6.1. Indispensables antes de crear las tablas

| # | Pregunta | Propuesta | Respuesta |
|---|---|---|---|
| D1 | ¿Qué adquiere el propietario? | Una **semana permanente** (número 1–52, la misma cada año). Las fechas de check-in y check-out se registran **por año** en un calendario; nunca se inventan | **Aprobada** (2026-11-03) |
| D2 | ¿Los pagos no verificados descuentan saldo? | **No.** Saldo oficial = valor − pagos verificados. Se muestran por separado "registrado" y "verificado" | **Aprobada** (2026-11-03) |
| D3 | ¿Comprobante solo para pagos verificados? | **Sí** | **Aprobada** (2026-11-03) |
| D4 | ¿Cómo se anula un pago erróneo? | **Anulación lógica**: el pago queda en el historial con motivo, usuario y fecha, y la cuota vuelve a quedar libre. Solo si no tiene comprobante | **Aprobada** (2026-11-03) |

### 6.2. Se aplicará la propuesta salvo indicación contraria

| # | Tema | Propuesta |
|---|---|---|
| D5 | Un pago = una cuota completa | Supuesto del prototipo (igual que [PL]). Pendiente de validar con CAM |
| D6 | Calendario de cuotas y mora | No se implementa el reporte de mora hasta definir la fecha de vencimiento de cada cuota |
| D7 | Parámetros coherentes | Se exige número de cuotas × valor de cuota = valor de la acción (24 × 750.000 = 18.000.000), porque no hay intereses |
| D8 | Número de comprobante | `CP-000001`, consecutivo único que no se reinicia (formato de [PL]) |
| D9 | Mensajes | Una conversación por oferta, visible para propietarios y secretaria. Muestra nombre del autor, fecha y hora; **nunca** cédula ni correo (Ley 1581) |
| D10 | Eliminar ofertas | Solo si no tienen mensajes. Si tienen, se **retiran** |
| D11 | Correo | Primera versión: descarga e impresión. El estado de envío se registra **solo** si el envío se intenta de verdad. El correo real se configura después, con un servicio de pruebas |
| D12 | Contraseña inicial del propietario | La secretaria asigna una contraseña temporal. El propietario debe cambiarla en su primer ingreso |
| D13 | Propietario inactivo | No inicia sesión ni publica ofertas. Conserva adquisiciones e historial |
| D14 | Varias secretarias | Se permiten varias cuentas con el mismo rol. Cada operación registra quién la hizo |
| D15 | Revertir verificación | Solo si el pago no tiene comprobante. Queda registrado quién revirtió y cuándo |
| D16 | Cambio de titular (cesión, venta, intercambio) | **Aprobada por la docente (2026-11-04)**: el **nuevo titular asume el saldo**. Los pagos hechos quedan en el historial del titular anterior y cuentan para el plan; ninguna cuota se cobra dos veces. Solo la secretaria lo registra, con soporte obligatorio |

---

## 7. Datos de demostración (plan)

- Nombres ficticios marcados (p. ej. "DEMO – Ana Pérez"). Correos `@ejemplo.test`, dominio reservado que no puede recibir mensajes reales.
- Un conjunto pequeño para recorrer todos los módulos. Después, un conjunto grande de 50 propietarios y 52 adquisiciones (1.248 cuotas) y otro de 200 propietarios para rendimiento.
- Solo se afirmará que se reproducen las cifras de [PL] (330 cuotas pagadas, 13 sin verificar, 30 comprobantes sin enviar, 4 ofertas activas) si se comprueba con consultas.
- Las pruebas usarán la base separada `cam_test`, que se puede recrear sin afectar `cam_db`.

---

## 8. Etapas

| Etapa | Contenido | Estado |
|---|---|---|
| 1. Revisión y preparación | Herramientas, puertos, motor, documentos, PLAN.md | **Completa** (D1–D4 aprobadas) |
| 2. Base de datos | Modelo, scripts, roles, datos ficticios, pruebas SQL, diagrama ER | **Completa** (sección 10) |
| 3. Backend | Conexión, autenticación, permisos, operaciones, reportes | **Completa** (sección 11) |
| 4. Frontend | Pantallas conectadas, diseño para celular | **Completa** (sección 12) |
| 5. Validación y documentación | Pruebas, manuales, respaldo y restauración | **Completa** (sección 13) |
| 6. Publicación | Render + Neon, HTTPS, prueba desde otro dispositivo | **En curso** (publicada en https://cam-proyectos.onrender.com) |
| Ampliación | Cambio de titular (D16) y pantalla de auditoría | **Implementada y probada en local** (sección 14) |

---

## 9. Registro de comprobaciones de la Etapa 1

| Comprobación | Resultado |
|---|---|
| `node --version`, `npm.cmd --version`, `git --version` | v22.20.0 / 10.9.3 / 2.55.0 |
| Búsqueda de MySQL (PATH, Program Files, servicios) | No encontrado |
| Servicios PostgreSQL | 9.4, 13, 14, 17, 18 en ejecución, inicio automático |
| Puertos en uso | 3000 (Node, Fercho), 5432–5436 (PostgreSQL), 1521 y 8080 (Oracle TNS) |
| Conexión a PostgreSQL 18 sin contraseña | Rechazada (correcto: el servidor exige contraseña) |
| `git check-ignore -v .env` | Ignorado por `.gitignore` línea 2 |
| `.env.example` | No ignorado (se subirá como plantilla) |
| Lectura de documentos | 2 .docx: texto, 17 tablas y 6 imágenes revisadas |

---

## 10. Etapa 2 — Base de datos (2026-11-03)

### 10.1. Qué se construyó

| Archivo | Contenido | Estado |
|---|---|---|
| `sql/00_crear_base_y_roles.sql` | Roles `cam_admin` y `cam_app` (sin superusuario), bases `cam_db` y `cam_test`, zona horaria America/Bogota. No destructivo | Implementado y ejecutado |
| `sql/01_esquemas.sql` | Esquemas `cam` y `ext`, extensión pgcrypto | Implementado y ejecutado |
| `sql/02_tablas.sql` | 14 tablas, llaves, CHECK, índices únicos (incluidos los parciales) y exclusión de fechas | Implementado y ejecutado |
| `sql/03_vistas.sql` | 10 vistas: estado de cuenta, plan de cuotas, pagos, recaudo, semanas, ofertas, mensajes, comprobantes y panel | Implementado y ejecutado |
| `sql/04_funciones.sql` | 18 funciones: 13 operaciones de negocio transaccionales con bloqueo de filas, 1 reporte y 4 auxiliares. Además, 7 triggers de protección | Implementado y ejecutado |
| `sql/05_roles_privilegios.sql` | Permisos mínimos de `cam_app` | Implementado y ejecutado |
| `sql/06_datos_demo.sql` | Datos FICTICIOS: 1 secretaria, 8 propietarios, 52 semanas, calendario 2027 de ejemplo, 9 adquisiciones, 54 pagos (1 anulado), 11 comprobantes, 4 ofertas, 5 mensajes | Implementado y ejecutado |
| `sql/ejecutar_todo.sql` | Script maestro (01 a 06; con `-v sin_demo=1` omite los datos demo) | Probado en base vacía |
| `pruebas/bd/` | 106 pruebas automáticas y el programa que las ejecuta | Probado: 106/106 |
| `docs/diagrama_er.md` | Diagrama entidad-relación (Mermaid) | Implementado. **Pendiente** verlo dibujado |

### 10.2. Decisiones de diseño tomadas en esta etapa

- **Titularidad separada de la situación de pago.** La adquisición solo guarda VIGENTE o TRANSFERIDA. "PAGADA" o "EN_CURSO" se calcula en `v_estado_cuenta`.
- **Pagos:** no se editan ni se eliminan. Un error se corrige anulando (con motivo) y registrando de nuevo. Revertir una verificación solo es posible sin comprobante, y queda en la auditoría.
- **Comprobantes:** guardan una "fotografía" (nombre, cédula, semana, saldo) al emitirse. Así no cambian si luego se edita el propietario. La numeración sale de un contador bloqueado: no se repite ni deja saltos.
- **Concurrencia:** doble protección. Bloqueo de la fila (`FOR UPDATE`) dentro de la función, más índice único en la tabla.
- **Una oferta activa por semana.** Una oferta con mensajes no se elimina, solo se retira (D10).
- **Comunidad y Ley 1581:** las vistas de ofertas y mensajes no incluyen cédula ni correo.
- **Calendario:** las semanas no pueden traslaparse entre sí (restricción de exclusión con rangos de fechas).
- **"Sin pago en el mes"** (`fn_sin_pago_en_mes`) se distingue de "vencida". La mora sigue pendiente (D6).
- **Codificación:** todos los scripts incluyen `\encoding UTF8`. En Windows, `psql` lee los archivos como WIN1252 y dañaba las tildes. Se detectó y corrigió durante las pruebas.

### 10.3. Pruebas ejecutadas

Evidencia: `pruebas/evidencias/bd_2026-11-03_0200.txt`. **106 pruebas, 106 pasan, 0 fallan.** Cubren:

| Grupo | Casos | Qué demuestra |
|---|---|---|
| P | 5 | Cédula y correo duplicados, formatos, cédula guardada como texto |
| S | 5 | Fechas inválidas, traslapes, semana repetida o fuera de rango |
| A | 7 | Semana con titular, propietario inactivo, fecha futura, permisos, copia de condiciones |
| G | 13 | Pago válido, cuota repetida, fuera del plan, importe incorrecto, cero, negativo, fecha futura, permisos |
| V, K, N | 15 | Verificación, comprobante solo para pagos verificados, comprobante duplicado, bloqueo de cambios con comprobante, fotografía histórica, envío fallido, anulación con historial |
| E | 6 | Estado de cuenta 10 cuotas = $7.500.000 / 14 / $10.500.000; los no verificados no bajan el saldo; una adquisición pagada conserva su titular |
| R | 7 | Cambiar parámetros no altera adquisiciones ni pagos anteriores |
| C | 16 | Oferta sobre semana ajena, reglas de precio, oferta duplicada, ofertas ajenas, mensajes en ofertas cerradas, concretar no transfiere |
| D, U | 9 | Eliminación de propietarios, hash obligatorio, privilegios mínimos de `cam_app` |
| T | 6 | Reportes y panel coinciden con cálculos independientes; auditoría |
| X | 13 | Triggers protegen aunque se escriba directamente como dueño de las tablas |
| Z | 4 | Concurrencia real: 10 registros simultáneos de la misma cuota → 1; 5 asignaciones simultáneas de la misma semana → 1; 10 emisiones simultáneas → números únicos sin saltos; la segunda sesión espera ~2,5 s y es rechazada |

Cómo repetirlas (Git Bash, desde la carpeta CAM): `bash pruebas/bd/ejecutar_pruebas_bd.sh`. Solo reconstruye `cam_test`; nunca toca `cam_db`.

### 10.4. Pendiente de la base de datos

- Persistencia tras reiniciar el servicio de PostgreSQL (se probará con la aplicación en la Etapa 5).
- Conjunto de volumen (50 propietarios / 52 adquisiciones / 1.248 cuotas y 200 propietarios) para medir rendimiento (RNF-REN, RNF-ESC). Etapa 5.
- Respaldo y restauración con `pg_dump` 18. Etapa 5.
- Ver el diagrama ER dibujado y, si se requiere, exportarlo como imagen.
- Adaptar el script 00 para Neon (allí no existe el superusuario `postgres`). Etapa 6.
- Contraseñas DEMO conocidas (`CamDemo2026!`, `Propietario2026!`): **no** publicar con ellas.

---

## 11. Etapa 3 — Backend (2026-11-03)

### 11.1. Qué se construyó

Node.js 22 + Express 5. Dependencias (8): `express`, `express-session`, `connect-pg-simple` (sesiones en PostgreSQL), `pg`, `bcryptjs`, `pdfkit` (PDF), `exceljs` (Excel) y `helmet` (cabeceras de seguridad). Sin `dotenv`: Node lee `.env` con `--env-file-if-exists`.

| Archivo | Contenido |
|---|---|
| `src/server.js` | Arranque. Verifica usuario, esquema y zona horaria de la base antes de aceptar visitas. Puerto 3100 |
| `src/app.js` | Seguridad, sesiones, rutas y permisos por rol en cada grupo de rutas |
| `src/config.js` | Configuración desde `.env`. Se niega a conectarse como `postgres` o `cam_admin` |
| `src/db.js` | Pool de conexiones, consultas con parámetros y transacciones |
| `src/seguridad.js` | `exigirSesion`, `exigirRol`, protección CSRF (mismo origen + JSON) |
| `src/errores.js` | Traduce errores de la base (CA400/403/404/409, únicos, CHECK) a mensajes claros sin exponer SQL |
| `src/validar.js` | Validación de textos, enteros, montos, fechas y contraseñas |
| `src/rutas/*.js` | auth, propietarios, semanas, adquisiciones, pagos y comprobantes, panel/reportes/parámetros, comunidad |
| `src/servicios/` | PDF del comprobante, Excel, definición única de reportes, formatos colombianos |

### 11.2. Rutas (API)

| Grupo | Rutas principales | Rol |
|---|---|---|
| Sesión | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/sesion`, `POST /api/auth/cambiar-clave` | Público / con sesión |
| Panel | `GET /api/panel` | SECRETARIA |
| Propietarios | `GET/POST /api/propietarios`, `GET/PUT/DELETE /api/propietarios/:id`, `PATCH …/:id/estado`, `POST …/:id/restablecer-clave` | SECRETARIA |
| Semanas | `GET/POST /api/semanas`, `GET /api/semanas/disponibles`, `GET/PUT /api/semanas/:id`, `POST /api/semanas/:id/fechas`, `PUT/DELETE /api/semanas/fechas/:id` | SECRETARIA |
| Adquisiciones / estado de cuenta | `GET/POST /api/adquisiciones`, `GET /api/adquisiciones/:id` | SECRETARIA |
| Pagos | `GET/POST /api/pagos`, `POST /api/pagos/:id/verificar`, `…/revertir-verificacion`, `…/anular`, `…/comprobante` | SECRETARIA |
| Comprobantes | `GET /api/comprobantes`, `GET /api/comprobantes/:id`, `GET …/:id/pdf`, `POST …/:id/enviar` (responde 503: correo no configurado) | SECRETARIA |
| Reportes | `GET /api/reportes/{recaudo, pagos, por-verificar, saldos, sin-pago, estado-cuenta}` y `…/excel` con los mismos filtros | SECRETARIA |
| Parámetros | `GET/POST /api/parametros` | SECRETARIA |
| Comunidad | `GET/POST /api/ofertas`, `GET /api/ofertas/mias`, `GET/DELETE /api/ofertas/:id`, `POST …/:id/cerrar`, `GET/POST …/:id/mensajes` | PROPIETARIO y SECRETARIA |
| Salud | `GET /api/salud` | Público |

### 11.3. Seguridad implementada

- Contraseñas con bcrypt. Mismo mensaje y tiempo de respuesta si el usuario no existe. Bloqueo de 15 min tras 5 intentos fallidos.
- Ingreso del propietario con cédula + contraseña. La contraseña temporal obliga a cambiarla antes de usar la aplicación.
- Sesión nueva en cada ingreso. Cookie `HttpOnly` y `SameSite=Lax` (y `Secure` en producción). Sesiones guardadas en PostgreSQL. El cierre de sesión destruye la sesión en la base.
- Permisos comprobados en el servidor en cada ruta. El usuario que registra lo toma el servidor de la sesión e ignora lo que envíe el navegador.
- CSRF: se rechazan solicitudes con `Origin` de otro sitio y cuerpos que no sean JSON.
- Cabeceras de seguridad (CSP sin scripts externos ni en línea).
- Los registros (logs) muestran solo método, ruta, estado y duración, nunca cuerpos ni contraseñas.

### 11.4. Pruebas ejecutadas

Evidencia: `pruebas/evidencias/api_2026-11-03_0222.txt`. **56 pruebas, 56 pasan.** Cómo repetirlas (PowerShell, carpeta CAM): `npm.cmd test`. Usan `cam_test` y nunca `cam_db`, que se comprobó intacta después.

- Acceso correcto e incorrecto, bloqueo, propietario inactivo, contraseña temporal, cierre de sesión (la cookie vieja deja de servir), cookies seguras, CSRF.
- Permisos por rol: el propietario recibe 403 en 8 rutas administrativas.
- Propietario con cédula o correo duplicado, semana con fechas inválidas o cruzadas, semana con titular.
- Pago válido (usuario y fecha del servidor), cuota repetida, fuera del plan, importe incorrecto, cero, negativo, fecha futura.
- **8 solicitudes HTTP simultáneas** de la misma cuota → 1 registrada. **5 emisiones simultáneas** del mismo comprobante → 1.
- Verificación, comprobante solo verificado, PDF válido, datos del comprobante, bloqueo de cambios con comprobante. El correo no se marca como enviado.
- Estado de cuenta ($7.500.000 / 14 / $10.500.000). Pagos sin verificar aparte. Dos semanas = dos planes.
- Conservación de condiciones históricas al cambiar parámetros.
- **Exportación coherente**: 8 combinaciones de reporte y filtros con las mismas filas y encabezados en pantalla y en Excel.
- Comunidad: semana ajena, reglas de precio, ofertas ajenas, mensajes en ofertas retiradas o concretadas, visibilidad, concretar no transfiere.
- **Persistencia**: se detiene el servidor, se inicia uno nuevo y la misma sesión y los datos siguen disponibles.

Error real encontrado por las pruebas y corregido: la exportación del estado de cuenta fallaba (500) porque Excel no admite ":" en el nombre de la hoja.

### 11.5. Pendiente

- `npm audit`: 9 avisos moderados, todos en dependencias internas de `exceljs` (`minimatch`, `uuid`). No reciben datos del usuario. Se revisará si hay una versión corregida antes de publicar.
- Correo real (D11). Mientras no exista, el indicador "comprobantes pendientes de envío" solo crecerá. **Pregunta para CAM**: ¿se necesita registrar "entregado personalmente" como alternativa?
- Pantallas (Etapa 4).

---

## 12. Etapa 4 — Frontend (2026-11-03)

### 12.1. Qué se construyó

HTML, CSS y JavaScript sin frameworks, servidos por el mismo Express (`public/`). Es una aplicación de una sola página con direcciones `#/…`.

| Archivo | Contenido |
|---|---|
| `public/index.html` | Página base |
| `public/css/estilos.css` | Diseño adaptable (menú lateral en computador, desplegable en celular; tablas convertidas en tarjetas), modo claro y oscuro, impresión |
| `public/js/api.js` | Conexión con el backend, manejo de errores y de sesión vencida, descargas |
| `public/js/ui.js` | Componentes: tablas, formularios, diálogos de confirmación, avisos, protección contra doble envío, formatos COP y fechas |
| `public/js/app.js` | Inicio de sesión (con aviso Ley 1581), menú por rol, navegación |
| `public/js/vistas/` | panel, propietarios, semanas, adquisiciones, pagos, comprobantes, estado de cuenta, reportes, parámetros, comunidad, cambio de contraseña |

### 12.2. Criterios aplicados

- **Seguridad**: los datos se insertan siempre como texto (nunca como HTML). La política CSP no permite scripts ni estilos externos o en línea.
- **Mensajes** de carga, éxito, error y listas vacías en todas las pantallas.
- **Confirmación** antes de registrar, verificar, anular o revertir pagos, emitir comprobantes, asignar semanas (en dos pasos), cambiar parámetros, activar o desactivar propietarios, retirar o concretar ofertas y eliminar registros.
- **Doble envío**: el botón se desactiva mientras la operación está en curso. El servidor también lo impide (probado con solicitudes simultáneas).
- **Estados con texto + color** (nunca solo color).
- **Gráfico** de recaudo (columnas apiladas verificado / sin verificar). Paleta validada para daltonismo en modo claro y oscuro, con leyenda, valores al pasar el cursor o enfocar, y tabla alternativa.
- **Contraseña temporal** mostrada en un diálogo que no se cierra solo.
- **Excel = pantalla**: la exportación usa los filtros de la última consulta mostrada. Si se cambia un filtro, hay que volver a consultar antes de exportar.

### 12.3. Pruebas ejecutadas

Evidencia: `pruebas/evidencias/navegador_2026-11-03_0309.txt` y 18 capturas en `pruebas/evidencias/capturas/`. **15 pruebas, 15 pasan.** Chrome real sin ventana, perfil temporal, contra `cam_test` (`cam_db` comprobada intacta).

Recorrido: ingreso incorrecto y correcto → panel con cifras → registrar propietario (cédula duplicada rechazada; contraseña temporal) → asignar semana en dos pasos → pago con importe incorrecto rechazado → registrar, verificar y emitir comprobante → PDF → estado de cuenta ($7.500.000 / 14 / $10.500.000) → reporte y exportación a Excel → fechas de semana inválidas y válidas → parámetros → comunidad (secretaria) → cerrar sesión (la API responde 401) → propietario: menú solo de comunidad, ruta de pagos redirigida y API 403 → publicar venta (precio 0 rechazado), conversar, retirar (titularidad intacta) → propietario nuevo obligado a cambiar la contraseña temporal → **ningún error de JavaScript ni violación de seguridad** en la consola. En celular (390 px) se comprobó que ninguna pantalla se desplaza horizontalmente.

Problemas encontrados en la revisión visual y corregidos:
1. Eje del gráfico con valores no redondos ($3,8 M) → divisiones de 1, 2, 2,5 o 5.
2. Meses del gráfico en dos líneas → mes en una línea y año solo en enero o en el primer mes.
3. Lista de pagos de 300 filas en celular → 50 más recientes, con aviso de usar filtros.
4. La barra superior desbordaba el ancho del teléfono (453 px) → nombre del usuario en el menú y columnas limitadas al ancho. Este fallo no se veía en un primer método de medición, que fue corregido.
5. Un aviso de la sesión anterior seguía visible tras cerrar sesión → se limpian al salir. Los avisos se cierran al tocarlos.

### 12.4. Pendiente

- Prueba en un **teléfono real** (Etapa 6, con el enlace publicado).
- Revisión por la docente y el equipo del lenguaje de las pantallas.

---

## 13. Etapa 5 — Validación y documentación (2026-11-03)

### 13.1. Qué se hizo

| Entregable | Archivo | Estado |
|---|---|---|
| Revisión de requisitos (23 FUN, 13 RNF, CP01–CP15) | `docs/trazabilidad_requisitos.md` | Implementado |
| Prueba de volumen (200 propietarios, 52 adquisiciones, 1.248 cuotas) | `pruebas/volumen/` · `npm.cmd run test:volumen` | Probado: 3/3 |
| Respaldo con `pg_dump` 18 | `scripts/respaldar.js` · `npm.cmd run respaldar` | Probado |
| Restauración comprobada en `cam_test` | `scripts/probar_restauracion.js` · `npm.cmd run probar-restauracion` | Probado: 13/13 tablas idénticas |
| Procedimiento de restauración de emergencia | `docs/respaldo_restauracion.md` | Probado en una base temporal (después eliminada) |
| Persistencia tras reiniciar PostgreSQL | `scripts/persistencia.js` · `npm.cmd run persistencia -- antes / despues` | Probado (2026-11-03 09:05): servicio reiniciado por la docente, 12/12 tablas idénticas y la aplicación se recuperó sola |
| Instalación simplificada | `scripts/instalar_bd.js` (`npm.cmd run bd:instalar [-- --sin-demo]`), `scripts/crear_secretaria.js` | Probado: instalación limpia en `cam_test` desde PowerShell |
| Descripciones en la base | `sql/07_comentarios.sql` (incluido en `ejecutar_todo.sql`, aplicado a `cam_db`; no modifica datos) | Implementado |
| Diccionario de datos generado desde la base | `scripts/diccionario.js` → `docs/diccionario_datos.md` | Implementado |
| Diagrama ER dibujado | `docs/diagrama_er.png` y `.svg` | Implementado; cada columna comparada con `cam_db` |
| Manuales | `docs/manual_secretaria.md`, `docs/manual_propietario.md` | Implementados; botones y mensajes comparados con el código |
| Instalación | `docs/instalacion.md`, `README.md` | Implementados |

### 13.2. Resultados

- **Rendimiento** (peor de 3 intentos): consultas entre 16 y 461 ms (meta 3 s); Excel de 1.249 filas en 2,4 s (meta 10 s), con las mismas filas que la pantalla, comprobado abriendo el archivo.
- **Restauración**: 13/13 tablas idénticas (filas + huella md5); 10 vistas, 23 funciones y 7 triggers; permisos de `cam_app` restaurados. La aplicación funcionó sobre la copia.
- **Regresión** tras agregar el script 07: BD 106/106, API 56/56, navegador 15/15.
- `cam_db` intacta: 8 propietarios, 54 pagos, 9 usuarios.

### 13.3. Hallazgos y decisiones de esta etapa

1. **RNF-ESC-01 pide 4.800 cuotas.** Una vivienda de 52 semanas admite como máximo 1.248 cuotas vigentes. Se probó con 200 propietarios y las 1.248 cuotas. Las 4.800 exigirían varias viviendas, que están fuera del alcance.
2. **Instalación sin datos DEMO** dejaba la base sin secretaria, sin semanas y sin parámetros. Se agregó `crear-secretaria`, que crea esas tres cosas solo si faltan.
3. `npm.cmd` en Windows maneja mal los argumentos entre comillas. El nombre de la secretaria se escribe sin comillas, aunque también funciona con ellas desde PowerShell.
4. **`npm audit`**: 9 avisos moderados en dependencias internas de `exceljs` 4.4.0, que es su versión más reciente. No son explotables en CAM. La "corrección" automática bajaría a `exceljs` 3.4.0, así que no se aplica. Detalle en la trazabilidad.
5. PostgreSQL 18 aloja **otras 19 bases** ajenas a CAM. Por eso el reinicio del servicio lo hace la docente, sabiendo que esas bases se desconectan unos segundos.

### 13.4. Pendiente

- Abrir un Excel exportado en **Microsoft Excel** (RNF-POR-01).
- Medir con una usuaria real el registro de un pago en menos de 2 minutos (RNF-USA-01).
- Revisión del texto del aviso de privacidad por parte de CAM.
- Primer commit en Git (con autorización).
- Etapa 6: publicación, disponibilidad, respaldo en Neon y prueba desde un teléfono real.

---

## 14. Ampliación — Cambio de titular y auditoría (2026-11-04)

Solicitud de la docente: auditar las ventas y cesiones entre propietarios, ver los pagos pendientes y consultar el historial.

### 14.1. Lo que ya existía (comprobado en el código)
- **Pagos pendientes**: estado de cuenta por adquisición (cuotas pagadas, pendientes y saldo) y reporte "sin pago registrado en el mes".
- **Historial de pagos**: los pagos no se borran; las anulaciones guardan motivo, usuario y fecha.
- **Auditoría**: la tabla `auditoria` ya registraba las operaciones, pero no había pantalla para consultarla.

### 14.2. Qué se construyó
| Pieza | Detalle |
|---|---|
| `sql/08_transferencias_auditoria.sql` | Script **incremental** (se puede repetir; no borra datos). Columnas `origen` y `adquisicion_anterior_id` en `adquisicion`; función `fn_transferir_titularidad`; vistas `v_adquisicion_linaje`, `v_historial_titulares` y `v_auditoria_detalle`; las vistas de saldo suman los pagos de toda la cadena de titulares. Lo llama `ejecutar_todo.sql` |
| Regla en la base | Solo la secretaria; no con pagos sin verificar; fecha no futura ni anterior a la adquisición o a los pagos del titular actual; soporte obligatorio; el titular anterior queda TRANSFERIDA; las ofertas activas se cierran; los pagos de titulares anteriores ya no se anulan ni se revierten; una titularidad transferida no se reabre (trigger) |
| API | `POST /api/adquisiciones/:id/transferir`; `GET /api/adquisiciones/:id` devuelve titulares y pagos anteriores; filtro `titularidad`; `GET /api/auditoria` (filtros por fecha, acción y usuario; 50 por página; solo secretaria) |
| Pantallas | Botón **Cambiar titular** (dos pasos con resumen) en Adquisiciones y Estado de cuenta; tabla de titulares de la semana; pagos de titulares anteriores; menú **Auditoría** |
| Auditoría adicional | Los cambios del calendario de semanas (crear, editar y quitar fechas) ahora quedan registrados |

### 14.3. Pruebas
| Batería | Resultado | Evidencia |
|---|---|---|
| BD | **139/139** (30 nuevas: TT01–TT30 y X14–X16) | `bd_2026-11-04_1123.txt` |
| API | **66/66** (10 nuevas) | `api_2026-11-04_1143.txt` |
| Navegador | **17/17** (2 nuevas, con capturas 12, 13 y 14 en computador y celular) | `navegador_2026-11-04_1143.txt` |
| Volumen | **3/3**; panel 555 ms, estado de cuenta 23 ms (meta 3 s) | `volumen_2026-11-04_1140.txt` |

Observación: en una ejecución de la batería API, la prueba de comprobantes falló una vez con "fetch failed" (conexión cortada); no se repitió en tres ejecuciones siguientes. Se deja anotada como intermitente.

### 14.4. Aplicación a las bases
- `cam_db` local: respaldo `cam_db_2026-11-04_1134.dump` y script 08 aplicado; se conservaron las 9 adquisiciones y los 54 pagos.
- Neon (producción): pendiente de autorización, junto con la publicación del código.

### 14.5. Pendiente
- Mora (D6): sigue requiriendo la fecha de vencimiento de cada cuota.
