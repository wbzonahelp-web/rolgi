#!/bin/bash
#
# Rolgi Deployment Script
# Автоматический деплой проекта на production сервер
#
# Usage: ./deploy.sh [environment]
# environment: production|staging (default: production)
#

set -e  # Exit on error

# ============================================================
# CONFIGURATION
# ============================================================

ENVIRONMENT="${1:-production}"
PROJECT_NAME="rolgi"
GIT_REPO="https://github.com/wbzonahelp-web/rolgi.git"
GIT_BRANCH="main"

# Server configuration
SERVER_HOST="${DEPLOY_HOST:-158.69.195.140}"
SERVER_USER="${DEPLOY_USER:-sshauto}"
SERVER_PORT="${DEPLOY_PORT:-22}"

# Deployment paths
DEPLOY_DIR="/home/sshauto/apps/${PROJECT_NAME}"
BACKUP_DIR="/home/sshauto/backups/${PROJECT_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================
# FUNCTIONS
# ============================================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v ssh &> /dev/null; then
        log_error "ssh not found. Please install OpenSSH client."
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        log_error "git not found. Please install git."
        exit 1
    fi
    
    log_info "✓ All dependencies found"
}

create_remote_dirs() {
    log_info "Creating remote directories..."
    
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST << EOF
        mkdir -p ${DEPLOY_DIR}
        mkdir -p ${BACKUP_DIR}
        mkdir -p ${DEPLOY_DIR}/logs
        mkdir -p ${DEPLOY_DIR}/data
EOF
    
    log_info "✓ Remote directories created"
}

backup_current_deployment() {
    log_info "Backing up current deployment..."
    
    BACKUP_NAME="${PROJECT_NAME}_$(date +%Y%m%d_%H%M%S).tar.gz"
    
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST << EOF
        if [ -d "${DEPLOY_DIR}/webapp" ]; then
            cd ${DEPLOY_DIR}
            tar -czf ${BACKUP_DIR}/${BACKUP_NAME} webapp/ 2>/dev/null || true
            echo "✓ Backup created: ${BACKUP_NAME}"
            
            # Keep only last 5 backups
            cd ${BACKUP_DIR}
            ls -t ${PROJECT_NAME}_*.tar.gz | tail -n +6 | xargs -r rm
        else
            echo "No previous deployment to backup"
        fi
EOF
    
    log_info "✓ Backup completed"
}

deploy_code() {
    log_info "Deploying code from GitHub..."
    
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST << EOF
        cd ${DEPLOY_DIR}
        
        # Clone or pull repository
        if [ -d "webapp/.git" ]; then
            echo "Pulling latest changes..."
            cd webapp
            git fetch origin
            git reset --hard origin/${GIT_BRANCH}
            git pull origin ${GIT_BRANCH}
        else
            echo "Cloning repository..."
            rm -rf webapp
            git clone -b ${GIT_BRANCH} ${GIT_REPO} webapp
        fi
        
        echo "✓ Code deployed successfully"
EOF
    
    log_info "✓ Code deployment completed"
}

install_dependencies() {
    log_info "Installing dependencies..."
    
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST << 'EOF'
        cd ${DEPLOY_DIR}/webapp
        
        # Install Node.js dependencies
        if [ -f "package.json" ]; then
            echo "Installing Node.js dependencies..."
            npm ci --production
            echo "✓ Node.js dependencies installed"
        fi
        
        # Install Admin Panel dependencies
        if [ -d "admin-panel" ] && [ -f "admin-panel/package.json" ]; then
            echo "Installing Admin Panel dependencies..."
            cd admin-panel
            npm ci
            npm run build
            cd ..
            echo "✓ Admin Panel built"
        fi
EOF
    
    log_info "✓ Dependencies installed"
}

setup_environment() {
    log_info "Setting up environment variables..."
    
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST << 'EOF'
        cd ${DEPLOY_DIR}/webapp
        
        # Create .env from .env.example if not exists
        if [ ! -f ".env" ] && [ -f ".env.example" ]; then
            echo "Creating .env from template..."
            cp .env.example .env
            echo "⚠ ВАЖНО: Отредактируйте файл .env с правильными значениями"
        fi
        
        # Set proper permissions
        chmod 600 .env 2>/dev/null || true
        
        echo "✓ Environment setup completed"
EOF
    
    log_warn "Don't forget to configure .env file on the server!"
}

setup_database() {
    log_info "Setting up database..."
    
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST << 'EOF'
        cd ${DEPLOY_DIR}/webapp
        
        # Run migrations
        if [ -f "migrations/run-migrations.js" ]; then
            echo "Running database migrations..."
            node migrations/run-migrations.js
            echo "✓ Migrations completed"
        fi
EOF
    
    log_info "✓ Database setup completed"
}

setup_pm2() {
    log_info "Setting up PM2 process manager..."
    
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST << 'EOF'
        cd ${DEPLOY_DIR}/webapp
        
        # Install PM2 globally if not exists
        if ! command -v pm2 &> /dev/null; then
            echo "Installing PM2..."
            npm install -g pm2
        fi
        
        # Stop existing processes
        pm2 delete rolgi-api 2>/dev/null || true
        pm2 delete rolgi-ws 2>/dev/null || true
        
        # Start API server
        pm2 start server.js --name rolgi-api \
            --max-memory-restart 1G \
            --instances 2 \
            --exec-mode cluster
        
        # Save PM2 configuration
        pm2 save
        
        # Setup PM2 startup script
        pm2 startup || true
        
        echo "✓ PM2 configured"
EOF
    
    log_info "✓ PM2 setup completed"
}

setup_nginx() {
    log_info "Setting up Nginx..."
    
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST << 'EOF'
        # Create Nginx configuration
        sudo tee /etc/nginx/sites-available/rolgi > /dev/null << 'NGINX_CONF'
server {
    listen 80;
    server_name rolgi.example.com;  # Change this to your domain

    # API endpoints
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # GraphQL
    location /graphql {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Admin Panel (if served separately)
    location /admin {
        root /home/sshauto/apps/rolgi/webapp/admin-panel/dist;
        try_files $uri $uri/ /index.html;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000;
        access_log off;
    }
}
NGINX_CONF

        # Enable site
        sudo ln -sf /etc/nginx/sites-available/rolgi /etc/nginx/sites-enabled/
        
        # Test and reload Nginx
        sudo nginx -t && sudo systemctl reload nginx
        
        echo "✓ Nginx configured"
EOF
    
    log_info "✓ Nginx setup completed"
}

health_check() {
    log_info "Performing health check..."
    
    sleep 5  # Wait for services to start
    
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST << 'EOF'
        # Check if API is responding
        HEALTH_URL="http://localhost:3000/health"
        
        for i in {1..10}; do
            if curl -sf $HEALTH_URL > /dev/null; then
                echo "✓ Health check passed"
                exit 0
            fi
            echo "Waiting for API to start... ($i/10)"
            sleep 2
        done
        
        echo "✗ Health check failed"
        exit 1
EOF
    
    if [ $? -eq 0 ]; then
        log_info "✓ Health check passed"
    else
        log_error "Health check failed!"
        exit 1
    fi
}

show_deployment_info() {
    log_info "Deployment completed successfully! 🎉"
    echo ""
    echo "=========================================="
    echo "  Deployment Information"
    echo "=========================================="
    echo "Environment:     $ENVIRONMENT"
    echo "Server:          $SERVER_HOST"
    echo "Deploy Dir:      $DEPLOY_DIR/webapp"
    echo "Backup Dir:      $BACKUP_DIR"
    echo ""
    echo "Services:"
    echo "  API Server:    http://$SERVER_HOST:3000"
    echo "  WebSocket:     ws://$SERVER_HOST:3000/ws"
    echo "  GraphQL:       http://$SERVER_HOST:3000/graphql"
    echo "  Health Check:  http://$SERVER_HOST:3000/health"
    echo "  Metrics:       http://$SERVER_HOST:3000/metrics"
    echo ""
    echo "Useful commands:"
    echo "  pm2 status         - Check process status"
    echo "  pm2 logs rolgi-api - View API logs"
    echo "  pm2 restart all    - Restart all services"
    echo "  pm2 monit          - Monitor processes"
    echo ""
    echo "=========================================="
}

rollback() {
    log_warn "Rolling back to previous deployment..."
    
    ssh -p $SERVER_PORT $SERVER_USER@$SERVER_HOST << 'EOF'
        cd ${BACKUP_DIR}
        LATEST_BACKUP=$(ls -t ${PROJECT_NAME}_*.tar.gz | head -1)
        
        if [ -n "$LATEST_BACKUP" ]; then
            echo "Restoring from: $LATEST_BACKUP"
            cd ${DEPLOY_DIR}
            rm -rf webapp
            tar -xzf ${BACKUP_DIR}/${LATEST_BACKUP}
            
            cd webapp
            npm ci --production
            pm2 restart all
            
            echo "✓ Rollback completed"
        else
            echo "✗ No backups found!"
            exit 1
        fi
EOF
    
    log_info "✓ Rollback completed"
}

# ============================================================
# MAIN EXECUTION
# ============================================================

main() {
    echo ""
    echo "=========================================="
    echo "  Rolgi Deployment Script"
    echo "  Environment: $ENVIRONMENT"
    echo "=========================================="
    echo ""
    
    # Check if rollback flag is set
    if [ "$2" == "--rollback" ]; then
        rollback
        exit 0
    fi
    
    # Execute deployment steps
    check_dependencies
    create_remote_dirs
    backup_current_deployment
    deploy_code
    install_dependencies
    setup_environment
    setup_database
    setup_pm2
    health_check
    show_deployment_info
}

# Trap errors and perform cleanup
trap 'log_error "Deployment failed! Use --rollback to restore previous version."' ERR

# Run main function
main "$@"
