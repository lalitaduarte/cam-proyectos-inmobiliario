#!/usr/bin/env bash
# =====================================================================
# ejecutar_pruebas_bd.sh
# Ejecuta TODAS las pruebas de base de datos sobre cam_test (nunca cam_db):
#   1. Reconstruye cam_test desde los scripts (prueba de "ejecución limpia").
#   2. Pruebas de reglas y permisos como cam_app.
#   3. Pruebas de triggers como cam_admin.
#   4. Pruebas de concurrencia (varias conexiones al mismo tiempo).
#   5. Resumen y archivo de evidencia en pruebas/evidencias/.
# Uso (Git Bash):  bash pruebas/bd/ejecutar_pruebas_bd.sh
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . <(tr -d '\r' < .env); set +a
export PGCLIENTENCODING=UTF8   # los scripts están en UTF-8

PSQL="${PSQL:-/c/Program Files/PostgreSQL/18/bin/psql.exe}"
DB="$CAM_TEST_DB"
[ "$DB" = "cam_test" ] || { echo "CAM_TEST_DB debe ser cam_test"; exit 1; }

como_admin() { PGPASSWORD="$CAM_ADMIN_PASSWORD" "$PSQL" -h "$PGHOST" -p "$PGPORT" -U "$CAM_ADMIN_USER" -d "$DB" -X -q -v ON_ERROR_STOP=1 "$@"; }
como_app()   { PGPASSWORD="$CAM_APP_PASSWORD"   "$PSQL" -h "$PGHOST" -p "$PGPORT" -U "$CAM_APP_USER"   -d "$DB" -X -q -v ON_ERROR_STOP=1 "$@"; }
# El SQL se envía por la entrada estándar (UTF-8). Con -c, Windows convierte
# las tildes a otra codificación y PostgreSQL las rechaza.
valor()      { printf '%s\n' "$1" | como_app -tA | tr -d '\r'; }
sql_app()    { printf '%s\n' "$1" | como_app "${@:2}"; }

mkdir -p pruebas/evidencias
EVID="pruebas/evidencias/bd_$(date +%Y-%m-%d_%H%M).txt"
TMP="$(mktemp -d)"

echo "== 1. Reconstruyendo cam_test desde los scripts SQL"
como_admin -f pruebas/bd/preparar_pruebas.sql > "$TMP/preparar.txt"

echo "== 2. Pruebas de reglas y permisos (cam_app)"
como_app -f pruebas/bd/pruebas_app.sql > /dev/null
como_app -f pruebas/bd/pruebas_transferencias.sql > /dev/null

echo "== 3. Pruebas de triggers (cam_admin)"
como_admin -f pruebas/bd/pruebas_admin.sql > /dev/null

echo "== 4. Pruebas de concurrencia"
SEC=$(valor "SELECT id FROM cam.usuario WHERE login='secretaria'")
ADQ=$(valor "SELECT a.id FROM cam.adquisicion a JOIN cam.semana s ON s.id=a.semana_id WHERE s.numero=2")
INICIO=$(valor "SELECT to_char(clock_timestamp() + interval '3 seconds', 'YYYY-MM-DD HH24:MI:SS.MS')")

# 4.1 Diez conexiones registran la MISMA cuota (15) en el mismo instante.
for i in $(seq 1 10); do
  ( como_app -tA -c "SELECT pg_sleep_until('$INICIO'); SELECT cam.fn_registrar_pago($SEC, $ADQ, 15, 750000, current_date, 'CONC-$i')" \
      > "$TMP/c1_$i.out" 2> "$TMP/c1_$i.err" || true ) &
done
# 4.2 Cinco conexiones asignan la MISMA semana libre (4) a propietarios distintos.
for i in $(seq 1 5); do
  P=$(valor "SELECT id FROM cam.propietario WHERE activo ORDER BY id OFFSET $((i-1)) LIMIT 1")
  ( como_app -tA -c "SELECT pg_sleep_until('$INICIO'); SELECT cam.fn_crear_adquisicion($SEC, $P, (SELECT id FROM cam.semana WHERE numero=4), current_date)" \
      > "$TMP/c2_$i.out" 2> "$TMP/c2_$i.err" || true ) &
done
wait
OK1=$( (grep -lE '^[0-9]+$' "$TMP"/c1_*.out || true) | wc -l)
E1=$( (cat "$TMP"/c1_*.err | grep -cE 'ya tiene un pago|llave duplicada|duplicate key') || true)
N1=$(valor "SELECT count(*) FROM cam.pago WHERE adquisicion_id=$ADQ AND numero_cuota=15 AND estado<>'ANULADO'")
OK2=$( (grep -lE '^[0-9]+$' "$TMP"/c2_*.out || true) | wc -l)
N2=$(valor "SELECT count(*) FROM cam.adquisicion a JOIN cam.semana s ON s.id=a.semana_id WHERE s.numero=4 AND a.estado_titularidad='VIGENTE'")
sql_app "SELECT pruebas.afirma('Z01 Concurrencia: 10 registros simultáneos de la misma cuota -> 1 éxito, 9 rechazos', $OK1=1 AND $E1=9 AND $N1=1, 'éxitos=$OK1 rechazos=$E1 filas=$N1')" > /dev/null
sql_app "SELECT pruebas.afirma('Z02 Concurrencia: 5 asignaciones simultáneas de la misma semana -> 1 titular', $OK2=1 AND $N2=1, 'éxitos=$OK2 titulares=$N2')" > /dev/null

# 4.3 Comprobantes: 8 pagos verificados distintos emitidos a la vez + 2 intentos sobre el mismo pago.
como_app -tA -c "SELECT cam.fn_verificar_pago($SEC, cam.fn_registrar_pago($SEC, $ADQ, k, 750000, current_date, 'CONC-CP')) FROM generate_series(16, 23) k" > /dev/null
INICIO=$(valor "SELECT to_char(clock_timestamp() + interval '3 seconds', 'YYYY-MM-DD HH24:MI:SS.MS')")
ANTES=$(valor "SELECT count(*) FROM cam.comprobante")
for k in $(seq 16 23); do
  ( como_app -tA -c "SELECT pg_sleep_until('$INICIO'); SELECT cam.fn_emitir_comprobante($SEC, (SELECT id FROM cam.pago WHERE adquisicion_id=$ADQ AND numero_cuota=$k AND estado<>'ANULADO'))" \
      > "$TMP/c3_$k.out" 2> "$TMP/c3_$k.err" || true ) &
done
for r in 1 2; do
  ( como_app -tA -c "SELECT pg_sleep_until('$INICIO'); SELECT cam.fn_emitir_comprobante($SEC, (SELECT id FROM cam.pago WHERE adquisicion_id=$ADQ AND numero_cuota=16 AND estado<>'ANULADO'))" \
      > "$TMP/c3_dup$r.out" 2> "$TMP/c3_dup$r.err" || true ) &
done
wait
DESPUES=$(valor "SELECT count(*) FROM cam.comprobante")
UNICOS=$(valor "SELECT count(DISTINCT numero) = count(*) AND max(consecutivo) - min(consecutivo) + 1 = count(*) FROM cam.comprobante")
sql_app "SELECT pruebas.afirma('Z03 Concurrencia: 10 emisiones simultáneas (8 pagos distintos) -> 8 comprobantes, números únicos y sin saltos', $((DESPUES-ANTES))=8 AND '$UNICOS'='t', 'nuevos=$((DESPUES-ANTES)) unicos_sin_saltos=$UNICOS')" > /dev/null

# 4.4 Bloqueo visible: la sesión A registra la cuota 24 y tarda 3 s en confirmar;
#     la sesión B intenta lo mismo 1 s después, ESPERA y luego es rechazada.
( como_app -tA -c "BEGIN; SELECT cam.fn_registrar_pago($SEC, $ADQ, 24, 750000, current_date, 'CONC-A'); SELECT pg_sleep(3); COMMIT;" > "$TMP/c4_a.out" 2>&1 || true ) &
sleep 1
T0=$(date +%s%N)
como_app -tA -c "SELECT cam.fn_registrar_pago($SEC, $ADQ, 24, 750000, current_date, 'CONC-B')" > "$TMP/c4_b.out" 2>&1 || true
T1=$(date +%s%N)
wait
ESPERA=$(( (T1 - T0) / 1000000 ))
RECHAZO=$(grep -c 'ya tiene un pago' "$TMP/c4_b.out" || true)
sql_app "SELECT pruebas.afirma('Z04 Bloqueo: la segunda sesión espera a la primera (≈2 s) y luego recibe CA409', $ESPERA>=1500 AND $RECHAZO=1, 'espera_ms=$ESPERA rechazo=$RECHAZO')" > /dev/null

echo "== 5. Resultados"
{
  echo "PRUEBAS DE BASE DE DATOS · CAM · $(date '+%Y-%m-%d %H:%M:%S')"
  echo "Servidor: $(valor 'SELECT version()')"
  echo "Base: $DB (reconstruida desde sql/ejecutar_todo.sql)"
  echo
  sql_app "SELECT n AS \"#\", CASE WHEN ok THEN 'PASA' ELSE 'FALLA' END AS resultado, caso, detalle FROM pruebas.resultado ORDER BY n"
  sql_app "SELECT format('TOTAL: %s pruebas · %s pasan · %s fallan', count(*), count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) FROM pruebas.resultado" -tA
} | tr -d '\r' | tee "$EVID"
echo "Evidencia guardada en: $EVID"
rm -rf "$TMP"
