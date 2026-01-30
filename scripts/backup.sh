#!/bin/bash

# Rolgi Database Backup Script v6.0.0
# 
# Создаёт резервную копию базы данных PostgreSQL
# с поддержкой:
# - Полных дампов
# - Сжатия
# - Ротации старых бэкапов
# - S3/Cloud storage upload (optional)
# - Email уведомлений

set -e

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-rolgi_v6}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESS="${COMPRESS:-true}"
S3_BUCKET="${S3_BUCKET:-}"
NOTIFY_EMAIL="${NOTIFY_EMAIL:-}"

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

    if ! command -v pg_dump &> /dev/null; then
        log_error "pg_dump not found. Please install PostgreSQL client tools."
        exit 1
    fi

    if [[ "$COMPRESS" == "true" ]] && ! command -v gzip &> /dev/null; then
        log_warn "gzip not found. Compression will be disabled."
        COMPRESS="false"
    fi

    if [[ -n "$S3_BUCKET" ]] && ! command -v aws &> /dev/null; then
        log_warn "AWS CLI not found. S3 upload will be skipped."
        S3_BUCKET=""
    fi
}

# Create backup directory
create_backup_dir() {
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_info "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
}

# Generate backup filename
generate_filename() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local filename="${DB_NAME}_${timestamp}"

    if [[ "$COMPRESS" == "true" ]]; then
        echo "${filename}.dump.gz"
    else
        echo "${filename}.dump"
    fi
}

# Create database backup
create_backup() {
    local filename=$1
    local filepath="${BACKUP_DIR}/${filename}"

    log_info "Creating backup: $filename"

    export PGPASSWORD="$DB_PASSWORD"

    if [[ "$COMPRESS" == "true" ]]; then
        pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -F c --no-owner --no-acl | gzip > "$filepath"
    else
        pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -F c --no-owner --no-acl -f "$filepath"
    fi

    unset PGPASSWORD

    if [[ $? -eq 0 ]]; then
        local size=$(du -h "$filepath" | cut -f1)
        log_info "Backup created successfully: $filepath ($size)"
        return 0
    else
        log_error "Backup failed!"
        return 1
    fi
}

# Upload to S3
upload_to_s3() {
    local filepath=$1

    if [[ -z "$S3_BUCKET" ]]; then
        return 0
    fi

    log_info "Uploading to S3: s3://${S3_BUCKET}/backups/"

    if aws s3 cp "$filepath" "s3://${S3_BUCKET}/backups/" --storage-class STANDARD_IA; then
        log_info "Uploaded to S3 successfully"
    else
        log_warn "S3 upload failed"
    fi
}

# Rotate old backups
rotate_backups() {
    log_info "Rotating old backups (retention: ${RETENTION_DAYS} days)..."

    local deleted=0

    find "$BACKUP_DIR" -name "${DB_NAME}_*.dump*" -type f -mtime +${RETENTION_DAYS} | while read file; do
        log_info "Deleting old backup: $(basename $file)"
        rm -f "$file"
        ((deleted++))
    done

    if [[ $deleted -gt 0 ]]; then
        log_info "Deleted $deleted old backup(s)"
    else
        log_info "No old backups to delete"
    fi
}

# Send notification
send_notification() {
    local status=$1
    local message=$2

    if [[ -z "$NOTIFY_EMAIL" ]]; then
        return 0
    fi

    local subject="[Rolgi] Backup ${status}"

    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "$subject" "$NOTIFY_EMAIL"
        log_info "Notification sent to $NOTIFY_EMAIL"
    else
        log_warn "mail command not found. Email notification skipped."
    fi
}

# Main execution
main() {
    log_info "==================================="
    log_info "Rolgi Database Backup v6.0.0"
    log_info "==================================="
    log_info "Database: $DB_NAME"
    log_info "Host: $DB_HOST:$DB_PORT"
    log_info "Backup directory: $BACKUP_DIR"
    log_info "Compression: $COMPRESS"
    log_info "Retention: $RETENTION_DAYS days"
    log_info "==================================="

    check_prerequisites
    create_backup_dir

    local filename=$(generate_filename)
    local filepath="${BACKUP_DIR}/${filename}"

    local start_time=$(date +%s)

    if create_backup "$filename"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        log_info "Backup completed in ${duration}s"

        upload_to_s3 "$filepath"
        rotate_backups

        send_notification "SUCCESS" "Backup completed successfully in ${duration}s\nFile: $filename"

        log_info "==================================="
        log_info "Backup process completed successfully!"
        log_info "==================================="
        exit 0
    else
        send_notification "FAILED" "Backup failed!\nDatabase: $DB_NAME"

        log_error "==================================="
        log_error "Backup process failed!"
        log_error "==================================="
        exit 1
    fi
}

# Run main function
main "$@"
