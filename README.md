# CAM Proyectos Inmobiliarios — Semanas, pagos y comunidad

Aplicación web para **CAM Proyectos Inmobiliario S.A.S.**, que vende semanas de uso de una vivienda turística, pagaderas en cuotas. Reemplaza el control manual de la secretaria:

- **Propietarios y semanas**: 52 semanas permanentes con calendario anual, y asignación de semanas a propietarios.
- **Pagos de cuotas**: registro, verificación y anulación con historial. Sin cuotas duplicadas, aunque dos personas registren al mismo tiempo.
- **Comprobantes** en PDF, con numeración consecutiva sin saltos (CP-000001…).
- **Estado de cuenta** y **reportes de recaudo**, exportables a Excel con las mismas filas que la pantalla.
- **Comunidad de propietarios**: ofertas de venta o intercambio de semanas y conversación. Protege la cédula y el correo, según la Ley 1581 de 2012.

Proyecto integrador, asignatura **Motores de Base de Datos**, Unidades Tecnológicas de Santander (UTS).
Equipo: Juan Steven Gómez Díaz, Luis Alejandro Gómez Eugenio, David Santiago Jaimes Campo y José Alejandro Hurtado Mantilla.
Docente: Laura Cristina Duarte Quintero.

## Tecnología

| Capa | Herramienta |
|---|---|
| Base de datos | **PostgreSQL 18**. Reglas en la propia base: restricciones, índices únicos parciales, funciones transaccionales con bloqueo de filas y triggers |
| Backend | **Node.js 22 + Express 5**, conectado con `pg`. Sesiones guardadas en PostgreSQL, contraseñas con bcrypt, PDF con pdfkit y Excel con exceljs |
| Frontend | HTML, CSS y JavaScript sin frameworks. Diseño adaptable a celular, modo claro y oscuro |
| Publicación (Etapa 6) | **Render** (servidor web, HTTPS) + **Neon** (PostgreSQL administrado) |

## Inicio rápido (Windows, PowerShell)

```powershell
npm.cmd install
Copy-Item .env.example .env      # luego complete .env (ver docs/instalacion.md)
npm.cmd run bd:instalar          # base con datos de DEMOSTRACIÓN
npm.cmd start                    # http://localhost:3100
```

Ingreso de demostración: secretaria `secretaria` / `CamDemo2026!`; propietario `900000101` / `Propietario2026!`. **Solo para la demostración local.**

## Documentación

| Documento | Para quién |
|---|---|
| [docs/instalacion.md](docs/instalacion.md) | Instalar, configurar, ejecutar y probar |
| [docs/manual_secretaria.md](docs/manual_secretaria.md) | Manual de la secretaria (administración) |
| [docs/manual_propietario.md](docs/manual_propietario.md) | Manual del propietario (comunidad) |
| [docs/respaldo_restauracion.md](docs/respaldo_restauracion.md) | Copias de seguridad y recuperación |
| [docs/diagrama_er.md](docs/diagrama_er.md) | Diagrama entidad-relación |
| [docs/diccionario_datos.md](docs/diccionario_datos.md) | Diccionario de datos: tablas, columnas, reglas, vistas y funciones |
| [docs/trazabilidad_requisitos.md](docs/trazabilidad_requisitos.md) | Cada requisito con su implementación, prueba y estado |
| [PLAN.md](PLAN.md) | Bitácora del proyecto: decisiones, contradicciones resueltas y etapas |

## Estructura

```
CAM/
├─ sql/          Scripts numerados 00–07 + ejecutar_todo.sql (script maestro)
├─ src/          Backend: servidor, rutas de la API, seguridad, PDF, Excel, reportes
├─ public/       Frontend: index.html, estilos, pantallas (js/vistas/)
├─ scripts/      Instalación de la base, cuenta de secretaria, respaldo, restauración, diccionario
├─ pruebas/      bd/ (SQL), api/ (HTTP), navegador/ (Chrome), volumen/ y evidencias/
├─ docs/         Manuales, diagrama, diccionario, trazabilidad
├─ documentos/   Documentos de requisitos del equipo
└─ .env.example  Plantilla de configuración (sin secretos)
```

## Pruebas (última ejecución: 2026-11-03)

| Batería | Resultado |
|---|---|
| Base de datos (reglas, permisos, triggers, concurrencia) | 106/106 |
| Backend (API HTTP) | 56/56 |
| Navegador (computador y celular, claro y oscuro) | 15/15 |
| Volumen: 200 propietarios y 1.248 cuotas | 3/3 (consultas < 0,5 s; Excel de 1.249 filas en 2,4 s) |
| Respaldo y restauración | 13/13 tablas idénticas |

## Seguridad

- Los secretos solo están en `.env`, que está excluido de Git.
- El backend usa el usuario de base `cam_app`, con permisos mínimos, y se niega a conectarse como superusuario.
- Los permisos se comprueban en el servidor en cada solicitud.
- Las contraseñas se guardan con bcrypt; hay bloqueo temporal por intentos fallidos y contraseñas temporales que obligan a cambiarse.
- Protección contra solicitudes desde otros sitios (CSRF), política de seguridad de contenido (CSP) y cookies `HttpOnly`.
