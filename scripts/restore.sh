#!/bin/bash

# Rolgi Database Restore Script v6.0.0
# 
# Восстанавливает базу данных из резервной копии
# с поддержкой:
# - Автоматического выбора последнего backup
# - Восстановления из конкретного файла
# - Предварительной проверки
# - Подтверждения пользователя

set -e

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-rolgi_v6}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v pg_restore &> /dev/null; then
        log_error "pg_restore not found. Please install PostgreSQL client tools."
        exit 1
    fi

    if ! command -v psql &> /dev/null; then
        log_error "psql not found. Please install PostgreSQL client tools."
        exit 1
    fi

    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi
}

# List available backups
list_backups() {
    log_info "Available backups:"
    echo ""

    local backups=($(find "$BACKUP_DIR" -name "${DB_NAME}_*.dump*" -type f | sort -r))

    if [[ ${#backups[@]} -eq 0 ]]; then
        log_warn "No backups found in $BACKUP_DIR"
        exit 1
    fi

    local i=1
    for backup in "${backups[@]}"; do
        local filename=$(basename "$backup")
        local size=$(du -h "$backup" | cut -f1)
        local date=$(stat -c %y "$backup" | cut -d'.' -f1)
        
        echo "$i) $filename"
        echo "   Size: $size"
        echo "   Date: $date"
        echo ""
        
        ((i++))
    done
}

# Get latest backup
get_latest_backup() {
    local latest=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.dump*" -type f | sort -r | head -1)

    if [[ -z "$latest" ]]; then
        log_error "No backups found"
        exit 1
    fi

    echo "$latest"
}

# Confirm action
confirm_restore() {
    local backup_file=$1

    log_warn "==================================="
    log_warn "WARNING: This will DROP and RECREATE the database!"
    log_warn "All current data will be LOST!"
    log_warn "==================================="
    log_info "Database: $DB_NAME"
    log_info "Backup file: $(basename $backup_file)"
    log_warn "==================================="

    read -p "Are you ABSOLUTELY sure you want to continue? (type 'yes' to confirm): " confirmation

    if [[ "$confirmation" != "yes" ]]; then
        log_info "Restore cancelled by user"
        exit 0
    fi
}

# Drop and recreate database
recreate_database() {
    log_info "Dropping existing database..."

    export PGPASSWORD="$DB_PASSWORD"

    # Terminate existing connections
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres <<SQL
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = '$DB_NAME'
          AND pid <> pg_backend_pid();
SQL

    # Drop database
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"

    log_info "Creating new database..."

    # Create database
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"

    unset PGPASSWORD
}

# Restore from backup
restore_backup() {
    local backup_file=$1

    log_info "Restoring from backup: $(basename $backup_file)"

    export PGPASSWORD="$DB_PASSWORD"

    # Check if compressed
    if [[ "$backup_file" == *.gz ]]; then
        log_info "Decompressing and restoring..."
        gunzip -c "$backup_file" | pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl
    else
        pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl "$backup_file"
    fi

    unset PGPASSWORD

    if [[ $? -eq 0 ]]; then
        log_info "Restore completed successfully!"
        return 0
    else
        log_error "Restore failed!"
        return 1
    fi
}

# Verify restore
verify_restore() {
    log_info "Verifying restored database..."

    export PGPASSWORD="$DB_PASSWORD"

    local table_count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")

    unset PGPASSWORD

    log_info "Found $table_count tables in restored database"

    if [[ $table_count -gt 0 ]]; then
        log_info "Database verification passed"
        return 0
    else
        log_warn "Database verification failed - no tables found"
        return 1
    fi
}

# Main execution
main() {
    local backup_file="$1"

    log_info "==================================="
    log_info "Rolgi Database Restore v6.0.0"
    log_info "==================================="

    check_prerequisites

    # If no file specified, show list and use latest
    if [[ -z "$backup_file" ]]; then
        list_backups

        log_info "No backup file specified. Using latest backup..."
        backup_file=$(get_latest_backup)
        log_info "Selected: $(basename $backup_file)"
    else
        if [[ ! -f "$backup_file" ]]; then
            log_error "Backup file not found: $backup_file"
            exit 1
        fi
    fi

    confirm_restore "$backup_file"

    local start_time=$(date +%s)

    log_info "Starting restore process..."

    recreate_database

    if restore_backup "$backup_file"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        verify_restore

        log_info "==================================="
        log_info "Restore completed in ${duration}s!"
        log_info "==================================="
        exit 0
    else
        log_error "==================================="
        log_error "Restore failed!"
        log_error "==================================="
        exit 1
    fi
}

# Show usage
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    echo "Rolgi Database Restore v6.0.0"
    echo ""
    echo "Usage:"
    echo "  $0                          # Restore from latest backup"
    echo "  $0 <backup-file>            # Restore from specific backup file"
    echo ""
    echo "Examples:"
    echo "  $0"
    echo "  $0 backups/rolgi_v6_20260130_120000.dump.gz"
    echo ""
    exit 0
fi

# Run main function
main "$@"
