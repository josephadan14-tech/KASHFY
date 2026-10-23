#!/usr/bin/env bash
# Restaura un respaldo. BORRA los datos actuales. Uso:  ./scripts/restaurar.sh ruta/al/respaldo.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."

ARCHIVO="${1:?Uso: ./scripts/restaurar.sh ruta/al/respaldo.sql.gz}"
[ -f "$ARCHIVO" ] || { echo "No existe el archivo $ARCHIVO"; exit 1; }
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

echo "ATENCION: esto BORRA los datos actuales y los reemplaza por los del respaldo."
read -r -p "Escribe RESTAURAR para continuar: " respuesta
[ "$respuesta" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

$COMPOSE stop backend
$COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
gunzip -c "$ARCHIVO" | $COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' > /dev/null
$COMPOSE start backend
echo "Restauración terminada."
