#!/usr/bin/env bash
# ESG OS — Database Backup Script
# Usage: ./scripts/db-backup.sh [backup|restore|list]
#
# Backs up the esg-os database to a timestamped file.
# Stores backups in ./backups/ directory.
# Restores from a specified backup file.

set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://postgres:esg@localhost:5432/esg-os}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

case "${1:-backup}" in
  backup)
    BACKUP_FILE="$BACKUP_DIR/esg-os_${TIMESTAMP}.sql.gz"
    echo "[backup] Starting backup to $BACKUP_FILE ..."

    # Use Docker if the DB is in a container
    if docker inspect esg_db >/dev/null 2>&1; then
      docker exec esg_db pg_dump -U postgres -d esg-os --clean --if-exists | gzip > "$BACKUP_FILE"
    else
      pg_dump "$DB_URL" --clean --if-exists | gzip > "$BACKUP_FILE"
    fi

    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[backup] Done: $BACKUP_FILE ($SIZE)"
    echo "[backup] To restore: ./scripts/db-backup.sh restore $BACKUP_FILE"
    ;;

  restore)
    RESTORE_FILE="${2:-}"
    if [ -z "$RESTORE_FILE" ]; then
      echo "Usage: ./scripts/db-backup.sh restore <backup-file>"
      echo "Available backups:"
      ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "  No backups found in $BACKUP_DIR/"
      exit 1
    fi

    if [ ! -f "$RESTORE_FILE" ]; then
      echo "[restore] File not found: $RESTORE_FILE"
      exit 1
    fi

    echo "[restore] WARNING: This will overwrite the current database!"
    echo "[restore] Restoring from $RESTORE_FILE ..."

    if docker inspect esg_db >/dev/null 2>&1; then
      gunzip -c "$RESTORE_FILE" | docker exec -i esg_db psql -U postgres -d esg-os
    else
      gunzip -c "$RESTORE_FILE" | psql "$DB_URL"
    fi

    echo "[restore] Done. Run 'pnpm db:verify' to confirm schema integrity."
    ;;

  list)
    echo "Available backups in $BACKUP_DIR:"
    ls -lhtr "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "  No backups found."
    ;;

  *)
    echo "Usage: ./scripts/db-backup.sh [backup|restore|list]"
    exit 1
    ;;
esac
