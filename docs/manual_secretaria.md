# Manual de la secretaria — CAM Proyectos Inmobiliarios

Este manual explica cómo usar la aplicación con el rol **Secretaria** (administración). La secretaria registra propietarios, asigna semanas, registra y verifica pagos, emite comprobantes, consulta estados de cuenta y reportes, y supervisa la comunidad.

> En la versión de demostración, el usuario es `secretaria` y la contraseña es `CamDemo2026!`. Estos datos son públicos y **no deben usarse en la versión publicada**.

## Contenido

1. [Ingresar y salir](#1-ingresar-y-salir)
2. [Panel principal](#2-panel-principal)
3. [Propietarios](#3-propietarios)
4. [Semanas y calendario](#4-semanas-y-calendario)
5. [Adquisiciones: asignar una semana](#5-adquisiciones-asignar-una-semana)
6. [Pagos de cuotas](#6-pagos-de-cuotas)
7. [Comprobantes](#7-comprobantes)
8. [Estado de cuenta](#8-estado-de-cuenta)
9. [Recaudo y reportes (Excel)](#9-recaudo-y-reportes-excel)
10. [Parámetros de la acción](#10-parámetros-de-la-acción)
11. [Comunidad](#11-comunidad)
12. [Preguntas frecuentes y mensajes de error](#12-preguntas-frecuentes-y-mensajes-de-error)
13. [Cambio de titular (venta, cesión o intercambio)](#13-cambio-de-titular-venta-cesión-o-intercambio)
14. [Auditoría](#14-auditoría)

---

## 1. Ingresar y salir

1. Abra la dirección de la aplicación en el navegador (Chrome, Edge, Firefox o el navegador del celular).
2. En **Usuario o cédula** escriba su usuario. En **Contraseña** escriba su contraseña.
3. Presione **Ingresar**.

- Si los datos son incorrectos, aparece *"Usuario o contraseña incorrectos"*. Por seguridad, el mensaje no dice cuál de los dos falló.
- Tras **5 intentos fallidos** seguidos, la cuenta se bloquea **15 minutos**.
- La sesión dura 8 horas. Si vence, la aplicación lo avisa y pide ingresar de nuevo.
- Para salir, presione **Cerrar sesión** (arriba a la derecha, también en el celular).

**En el celular:** el menú de la izquierda se convierte en un botón **Menú**, y las tablas se muestran como tarjetas.

## 2. Panel principal

Es la primera pantalla. Todas sus cifras se calculan en el momento a partir de los datos guardados:

- **Propietarios registrados** (y cuántos están activos) y **Semanas con titular actual** (de 52).
- **Cuotas pagadas (verificadas)** y **Pagos pendientes de verificación**. Esta tarjeta se resalta si hay pagos por revisar.
- **Total registrado** (verificados o no) y **Total verificado** (dinero cuya recepción usted confirmó). Solo lo verificado descuenta saldos.
- **Saldo por cobrar**, **Comprobantes pendientes de envío** y **Ofertas activas en la comunidad**.
- **Gráfico de recaudo** de los últimos 12 meses, con la parte verificada y la parte sin verificar. Al pasar el cursor sobre una columna se ven los valores. El botón **Ver los datos en tabla** muestra las mismas cifras como tabla.
- **Últimos pagos registrados**.

## 3. Propietarios

Menú **Propietarios**.

### Registrar un propietario
1. Presione **Registrar propietario**.
2. Complete **Cédula** (solo números, sin puntos), **Nombre completo**, **Correo electrónico** y, si lo tiene, **Teléfono**.
3. En **Contraseña temporal** aparece una contraseña generada. Puede usarla o escribir otra (mínimo 8 caracteres, con letras y números). **Generar otra** crea una nueva.
4. Presione **Registrar**.
5. La aplicación muestra la contraseña temporal en una ventana que **no se cierra sola**. Anótela y entréguela al propietario personalmente. El propietario deberá cambiarla en su primer ingreso.

Si la cédula o el correo ya existen, aparece un aviso y no se guarda nada.

### Consultar y editar
- Use **Buscar** (cédula o nombre) y el filtro **Estado** (activos o inactivos).
- Al abrir un propietario se ven sus datos y sus **semanas adquiridas**, con las cuotas pagadas, lo abonado, el saldo y la situación de cada una.
- **Editar propietario** cambia el nombre, el correo y el teléfono. Los pagos y comprobantes ya emitidos **no cambian**: el comprobante conserva los datos del día en que se emitió.
- **Restablecer contraseña** asigna una nueva contraseña temporal, por ejemplo si el propietario olvidó la suya.

### Desactivar o eliminar
- **Desactivar**: el propietario ya no puede ingresar ni publicar ofertas. Conserva sus semanas e historial. **Activar** lo revierte.
- **Eliminar** solo es posible si el propietario **no tiene adquisiciones**, es decir, si fue registrado por error. En cualquier otro caso, desactívelo.

## 4. Semanas y calendario

Menú **Semanas**. La vivienda tiene **52 semanas permanentes**: la semana 10 es la misma todos los años. Lo que cambia cada año son sus fechas.

1. Elija el **Año del calendario**.
2. En cada semana, **Registrar fechas** (o **Editar fechas**) pide la **Fecha de entrada** (check-in) y la **Fecha de salida** (check-out).
3. **Quitar fechas** borra las fechas de ese año. Pide confirmación.

Reglas: la salida debe ser posterior a la entrada, y las fechas de una semana no pueden cruzarse con las de otra. El filtro **Mostrar** permite ver todas las semanas, solo las disponibles o solo las que tienen titular.

## 5. Adquisiciones: asignar una semana

Menú **Adquisiciones**. Una *adquisición* es el vínculo entre un propietario y una semana, con su plan de pagos.

1. Presione **Asignar semana**.
2. Elija el **Propietario** (debe estar activo) y una **Semana disponible**. Indique la **Fecha de adquisición** (no puede ser futura).
3. Presione **Asignar**. La aplicación muestra un resumen: propietario, semana y condiciones (por ejemplo $18.000.000 en 24 cuotas de $750.000). Revíselo y confirme.

- Una semana tiene **un solo titular**. Un propietario puede tener **varias semanas**.
- Las condiciones vigentes en ese momento **se copian** a la adquisición. Si después se cambian los parámetros, esta adquisición conserva las suyas.
- La lista se puede filtrar con **Buscar**, **Titularidad** (titulares actuales o anteriores) y **Situación de pago** (en curso o pagada).
- Si la semana se vende, se cede o se intercambia, use **Cambiar titular** (sección 13).

## 6. Pagos de cuotas

Menú **Pagos de cuotas**. Todo pago **nace sin verificar**, y solo descuenta el saldo cuando se **verifica**.

### Registrar un pago
1. En **1. Seleccione la adquisición**, escriba la cédula, el nombre o la semana en **Buscar** y elija la adquisición.
2. Aparece la cuadrícula de cuotas: las pagadas, las pendientes de verificar y las libres.
3. Presione **Registrar un pago**. Elija la **Cuota** (solo aparecen las que no tienen pago), confirme la **Fecha del pago** y, si la tiene, escriba la **Referencia** (número de consignación o recibo). El **Valor** es el de la cuota pactada: un pago cubre una cuota completa.
4. Presione **Registrar pago** y confirme.

La aplicación rechaza, con un mensaje claro: una cuota que ya tiene pago, una cuota fuera del plan (por ejemplo la 25), un valor distinto al de la cuota, y una fecha futura o anterior a la adquisición.

### Verificar, anular y revertir
En **2. Pagos registrados**, cada pago tiene sus acciones:
- **Verificar pago**: confírmelo cuando el dinero esté en la cuenta de CAM. Desde ese momento descuenta el saldo.
- **Anular pago**: para un pago registrado por error. Pide un **motivo**. El pago no se borra: queda en el historial como ANULADO, con quién lo anuló y cuándo, y la cuota queda libre para registrarla de nuevo.
- **Revertir verificación**: devuelve un pago verificado a "sin verificar". También pide un motivo.
- **Emitir comprobante**: ver la sección 7.

Un pago **con comprobante** no se puede anular ni revertir. La aplicación lo bloquea y explica el motivo. Los filtros **Estado**, **Pagados desde** y **Hasta** ayudan a encontrar pagos. Se muestran los 50 más recientes.

## 7. Comprobantes

- Se emiten desde **Pagos de cuotas** con **Emitir comprobante**, solo para pagos **verificados**.
- Cada pago tiene **máximo un comprobante**. El número es consecutivo, no se repite y no deja saltos: CP-000001, CP-000002…
- El comprobante guarda una "fotografía" de los datos del momento: nombre, cédula, semana, cuota, valor, abonado y saldo.

En el menú **Comprobantes**:
- **Ver / imprimir** abre el PDF en otra pestaña. Desde allí se imprime con Ctrl+P.
- **Descargar PDF** guarda el archivo para enviarlo por WhatsApp o correo desde su cuenta.
- **Enviar por correo**: *todavía no está configurado*. La aplicación lo informa y **no** marca el comprobante como enviado, porque el correo no salió de verdad.

El comprobante es un **soporte interno de pago**. No es una factura electrónica.

## 8. Estado de cuenta

Menú **Estado de cuenta**.
1. Busque y elija el propietario y la semana.
2. Se muestran el **valor de la acción**, el **total abonado** (solo pagos verificados), las **cuotas pagadas y pendientes** y el **saldo**. Debajo aparece el detalle de las 24 cuotas.
3. Si hay pagos sin verificar, un aviso indica cuántos son y cuánto suman. Esos pagos aún no descuentan el saldo.
4. **Exportar a Excel** descarga el estado de cuenta para entregarlo al propietario.
5. Al final aparecen los **titulares de la semana**: quién la tuvo, desde y hasta cuándo, y cómo la recibió. Si la semana cambió de titular, también se ven los **pagos de titulares anteriores**.

Ejemplo: con 10 cuotas verificadas de $750.000 se muestran **$7.500.000 abonados, 14 cuotas pendientes y un saldo de $10.500.000**.

## 9. Recaudo y reportes (Excel)

Menú **Recaudo y reportes**. Elija una pestaña, ajuste los filtros y presione **Consultar**:

| Reporte | Para qué sirve |
|---|---|
| **Recaudo mensual** | Total registrado y verificado de cada mes |
| **Pendientes de verificación** | Pagos registrados que aún no se han verificado |
| **Saldos** | Abonado, cuotas pendientes y saldo de cada adquisición |
| **Sin pago en el mes** | Adquisiciones en curso sin ningún pago registrado en el mes elegido. No significa "en mora": aún no se ha definido la fecha de vencimiento de cada cuota |
| **Historial de pagos** | Todos los pagos, con filtros por fecha, estado y propietario |

**Exportar a Excel** descarga **exactamente las mismas filas** de la consulta mostrada. Si cambia un filtro, presione **Consultar** de nuevo antes de exportar. El botón se desactiva hasta que lo haga.

## 10. Parámetros de la acción

Menú **Parámetros**. Muestra las condiciones vigentes y su historial.

1. En **Nuevas condiciones**, escriba el **Valor de la acción**, el **Número de cuotas** y el **Valor de cada cuota**. Las tres cifras deben cuadrar: cuotas × valor de cuota = valor de la acción.
2. Presione **Guardar nuevas condiciones** y confirme.

Las nuevas condiciones solo se aplican a las **adquisiciones nuevas**. Las adquisiciones y pagos anteriores **no cambian**.

## 11. Comunidad

Menú **Comunidad**. La secretaria ve todas las ofertas de los propietarios y puede:
- Filtrar por **Tipo** (venta o intercambio), **Estado** y **Publicadas desde**.
- Presionar **Ver conversación** en una oferta y escribir en ella. Sus mensajes aparecen como "(CAM)".
- En una oferta activa: **Retirar**, **Marcar concretada** o **Eliminar**. El botón **Eliminar** solo aparece si la oferta no tiene mensajes; si los tiene, se retira.

**Importante:** marcar una oferta como concretada **no cambia el titular** de la semana. Cuando la venta se formalice, regístrela con **Cambiar titular** (sección 13); al hacerlo, la oferta se cierra sola.

En la comunidad, los propietarios ven solo el **nombre** de los demás, nunca su cédula ni su correo (Ley 1581 de 2012).

## 12. Preguntas frecuentes y mensajes de error

| Situación | Qué hacer |
|---|---|
| *"La cuota N ya tiene un pago registrado"* | Revise el historial de esa adquisición. Si el pago anterior fue un error, anúlelo y registre de nuevo |
| *"El pago tiene comprobante…"* | Un pago con comprobante no se modifica. Es la regla de seguridad de los soportes |
| No aparece una semana en "Semana disponible" | Ya tiene titular. Consúltela en **Semanas** |
| Un propietario dice que no puede ingresar | Revise que esté **activo**. Si olvidó la contraseña, use **Restablecer contraseña**. Si escribió mal 5 veces, debe esperar 15 minutos |
| El botón queda en "Guardando…" | Espere. El botón se desactiva para evitar registros duplicados |
| *"La sesión terminó"* | Ingrese de nuevo. Lo que ya se guardó no se pierde |
| La aplicación tarda cerca de un minuto en abrir | En la versión publicada gratuita, el servidor se "duerme" tras 15 minutos sin uso. El primer ingreso lo despierta |
| *"El titular actual tiene N pago(s) sin verificar"* | Antes de cambiar el titular, verifique o anule esos pagos en **Pagos de cuotas** |
| *"La cuota N ya la pagó un titular anterior"* | Esa cuota ya está paga. El nuevo titular solo paga las cuotas pendientes |

## 13. Cambio de titular (venta, cesión o intercambio)

Úselo cuando un propietario vende, cede (por ejemplo, por donación o herencia) o intercambia su semana.

**Regla de CAM:** el **nuevo titular asume el saldo**. Las cuotas que ya pagó el titular anterior cuentan como pagadas y no se vuelven a cobrar. El nuevo titular paga solo las que faltan.

1. Si el nuevo titular no está registrado, regístrelo primero en **Propietarios**.
2. En **Adquisiciones** (o en el **Estado de cuenta** de la semana), presione **Cambiar titular**.
3. Elija el **Nuevo titular**, el **Tipo** (venta, cesión, intercambio u otro), la **Fecha** del documento y el **Soporte** (por ejemplo, "Contrato de compraventa del 03/11/2026").
4. Presione **Revisar**. La aplicación muestra quién deja de ser titular, quién lo será y el saldo que asume.
5. Presione **Confirmar cambio de titular**. **No se puede deshacer.**

Qué pasa después:
- El titular anterior queda como **Transferida**, con fecha de fin. Su estado de cuenta se conserva como historial y ya no admite pagos.
- El nuevo titular tiene un estado de cuenta nuevo, con el mismo plan y las cuotas ya pagadas marcadas como **"Pagada (tit. anterior)"**.
- Si la semana tenía una oferta activa en la comunidad, se cierra.
- Queda registrado en la **Auditoría**: quién lo hizo, cuándo, de quién a quién, el saldo asumido y el soporte.

Antes de cambiar el titular, todos los pagos registrados deben estar **verificados o anulados**.

## 14. Auditoría

Menú **Auditoría**. Muestra quién hizo cada operación y cuándo, en hora de Colombia: ingresos, cambios de contraseña, propietarios, semanas y fechas, parámetros, asignaciones, pagos (registro, verificación, anulación y reversión), comprobantes, ofertas y cambios de titular.

- Filtre por **Desde**, **Hasta**, **Acción** y **Usuario**. Se muestran 50 registros por página, del más reciente al más antiguo.
- Es de **solo lectura**: nadie puede editarla ni borrarla desde la aplicación.
