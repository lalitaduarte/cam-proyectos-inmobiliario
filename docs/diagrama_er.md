# Diagrama entidad-relación — CAM

Modelo implementado en PostgreSQL (esquema `cam`). Fuente: [`sql/02_tablas.sql`](../sql/02_tablas.sql).

![Diagrama entidad-relación de CAM](diagrama_er.png)

> Imagen generada a partir del código Mermaid de abajo: [`diagrama_er.png`](diagrama_er.png) y, en alta calidad, [`diagrama_er.svg`](diagrama_er.svg) (se abre con el navegador). Se comprobó que cada columna del diagrama existe en la base `cam_db` (2026-11-03). Si cambia el modelo, el código Mermaid también se ve dibujado en GitHub o en VS Code (Ctrl+Shift+V con la extensión *Markdown Preview Mermaid Support*).

```mermaid
erDiagram
    PROPIETARIO ||--o| USUARIO : "tiene cuenta"
    PROPIETARIO ||--o{ ADQUISICION : "adquiere"
    SEMANA ||--o{ ADQUISICION : "es adquirida en"
    SEMANA ||--o{ SEMANA_FECHA : "tiene fechas por año"
    PARAMETRO_ACCION ||--o{ ADQUISICION : "condiciones copiadas a"
    ADQUISICION ||--o{ PAGO : "recibe"
    PAGO ||--o| COMPROBANTE : "soportado por"
    COMPROBANTE ||--o{ ENVIO_COMPROBANTE : "intentos de envío"
    ADQUISICION ||--o{ OFERTA : "se oferta en"
    OFERTA ||--o{ MENSAJE : "conversación"
    USUARIO ||--o{ MENSAJE : "escribe"
    USUARIO ||--o{ PAGO : "registra / verifica / anula"
    USUARIO ||--o{ COMPROBANTE : "emite"
    USUARIO ||--o{ AUDITORIA : "realiza"

    PROPIETARIO {
        bigint id PK
        varchar cedula UK "solo dígitos, texto"
        varchar nombre_completo
        varchar correo UK "sin distinguir mayúsculas"
        varchar telefono "opcional"
        boolean activo
    }
    USUARIO {
        bigint id PK
        varchar rol "SECRETARIA | PROPIETARIO"
        varchar login UK "solo secretaria"
        bigint propietario_id FK,UK "solo propietario"
        varchar password_hash "bcrypt"
        boolean debe_cambiar_clave
        boolean activo
    }
    SEMANA {
        bigint id PK
        smallint numero UK "1 a 52, permanente"
        boolean activa
    }
    SEMANA_FECHA {
        bigint id PK
        bigint semana_id FK
        smallint anio "UK con semana_id"
        date fecha_entrada
        date fecha_salida "mayor que entrada; sin traslapes"
    }
    PARAMETRO_ACCION {
        bigint id PK
        numeric valor_accion
        smallint numero_cuotas
        numeric valor_cuota "cuotas x valor = acción"
        timestamptz vigente_desde
    }
    ADQUISICION {
        bigint id PK
        bigint propietario_id FK
        bigint semana_id FK "1 VIGENTE por semana"
        date fecha_adquisicion
        bigint parametro_id FK
        numeric valor_accion "copia"
        smallint numero_cuotas "copia"
        numeric valor_cuota "copia"
        varchar estado_titularidad "VIGENTE | TRANSFERIDA"
    }
    PAGO {
        bigint id PK
        bigint adquisicion_id FK
        smallint numero_cuota "UK con adquisición si no ANULADO"
        numeric valor "= valor_cuota"
        date fecha_pago "cuándo pagó"
        varchar estado "NO_VERIFICADO | VERIFICADO | ANULADO"
        timestamptz registrado_en "cuándo se registró"
        bigint registrado_por FK
        bigint verificado_por FK
        bigint anulado_por FK
    }
    COMPROBANTE {
        bigint id PK
        varchar numero UK "CP-000001"
        bigint consecutivo UK "sin saltos"
        bigint pago_id FK,UK "máximo 1 por pago"
        timestamptz emitido_en
        bigint emitido_por FK
        varchar propietario_nombre "fotografía histórica"
        numeric saldo "fotografía histórica"
    }
    ENVIO_COMPROBANTE {
        bigint id PK
        bigint comprobante_id FK
        varchar correo_destino
        varchar estado "ENVIADO | FALLIDO"
    }
    OFERTA {
        bigint id PK
        bigint adquisicion_id FK "1 ACTIVA por adquisición"
        varchar tipo "VENTA | INTERCAMBIO"
        numeric precio "VENTA mayor que 0; INTERCAMBIO nulo"
        varchar estado "ACTIVA | RETIRADA | CONCRETADA"
    }
    MENSAJE {
        bigint id PK
        bigint oferta_id FK "solo ofertas ACTIVA"
        bigint autor_id FK
        varchar texto
        timestamptz enviado_en
    }
    AUDITORIA {
        bigint id PK
        bigint usuario_id FK
        varchar accion
        varchar tabla
        bigint registro_id
        jsonb detalle
    }
```

Tablas de apoyo que no aparecen en el diagrama: `consecutivo_comprobante` (contador de una sola fila para numerar comprobantes sin saltos) y `sesion` (sesiones de inicio de sesión del backend).

## Cómo leer las relaciones

| Símbolo | Significado |
|---|---|
| `\|\|--o{` | uno a muchos (puede haber cero) |
| `\|\|--o\|` | uno a cero o uno |
| PK | llave primaria |
| FK | llave foránea |
| UK | valor único |

## Reglas que el diagrama no muestra por sí solo

- **Un titular vigente por semana**: índice único parcial `adquisicion_titular_vigente_uq` sobre `semana_id` donde `estado_titularidad = 'VIGENTE'`.
- **Una cuota no se paga dos veces**: índice único parcial `pago_cuota_unica_uq` sobre `(adquisicion_id, numero_cuota)` donde `estado <> 'ANULADO'`.
- **La situación de pago no se guarda, se calcula** en la vista `v_estado_cuenta`. Solo los pagos verificados descuentan el saldo (decisión D2).
- **Inmutables**: `comprobante`, `parametro_accion` y `envio_comprobante` no se modifican. `pago` y `adquisicion` no se eliminan (triggers).
