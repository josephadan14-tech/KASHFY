#!/usr/bin/env bash
# Respaldo de la base de datos. Uso:  ./scripts/respaldo.sh
# Variables opcionales:
#   DESTINO=/ruta/respaldos        (por defecto ~/respaldos)
#   DIAS_A_CONSERVAR=14            (borra respaldos más viejos)
#   RCLONE_DESTINO=remoto:carpeta  (copia además a un almacenamiento externo con rclone)
set -euo pipefail
cd "$(dirname "$0")/.."

DESTINO="${DESTINO:-$HOME/respaldos}"
DIAS="${DIAS_A_CONSERVAR:-14}"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

mkdir -p "$DESTINO"
ARCHIVO="$DESTINO/prestamos_$(date +%Y%m%d_%H%M%S).sql.gz"

$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "$ARCHIVO"

# Un respaldo casi vacío significa que algo falló
if [ "$(stat -c%s "$ARCHIVO")" -lt 1000 ]; then
  echo "ERROR: el respaldo salió sospechosamente pequeño, se descarta." >&2
  rm -f "$ARCHIVO"
  exit 1
fi

if [ -n "${RCLONE_DESTINO:-}" ]; then
  rclone copy "$ARCHIVO" "$RCLONE_DESTINO"
fi

find "$DESTINO" -name 'prestamos_*.sql.gz' -mtime +"$DIAS" -delete
echo "Respaldo listo: $ARCHIVO"
