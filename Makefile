# Rolgi SStats Analytics Platform v6.0.0
# Makefile for development and deployment tasks

.PHONY: help install setup dev test lint format clean docker-build docker-up docker-down db-init db-migrate validate deploy-staging deploy-prod

# Default target
.DEFAULT_GOAL := help

# Colors for output
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(CYAN)Rolgi SStats Analytics Platform v6.0.0$(NC)"
	@echo "$(GREEN)Available commands:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(NC) %s\n", $$1, $$2}'

# ======================
# DEVELOPMENT
# ======================

install: ## Install npm dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	npm install

setup: ## Complete project setup (install + db init + preflight)
	@echo "$(GREEN)Setting up project...$(NC)"
	npm install
	@echo "$(YELLOW)Copying .env.example to .env (edit it with your settings)$(NC)"
	cp -n .env.example .env || true
	@echo "$(GREEN)Setup complete! Edit .env and run 'make db-init' to initialize database.$(NC)"

dev: ## Start development server with hot-reload
	@echo "$(GREEN)Starting development server...$(NC)"
	npm run dev

start: ## Start production server
	@echo "$(GREEN)Starting production server...$(NC)"
	npm start

# ======================
# TESTING
# ======================

test: ## Run all tests
	@echo "$(GREEN)Running tests...$(NC)"
	npm test

test-unit: ## Run unit tests only
	@echo "$(GREEN)Running unit tests...$(NC)"
	npm run test:unit

test-coverage: ## Run tests with coverage report
	@echo "$(GREEN)Running tests with coverage...$(NC)"
	npm run test:coverage

lint: ## Run linter
	@echo "$(GREEN)Running linter...$(NC)"
	npm run lint

lint-fix: ## Run linter and auto-fix issues
	@echo "$(GREEN)Running linter with auto-fix...$(NC)"
	npm run lint:fix

format: ## Format code with Prettier
	@echo "$(GREEN)Formatting code...$(NC)"
	npm run format

# ======================
# VALIDATION
# ======================

preflight: ## Run pre-flight checks
	@echo "$(GREEN)Running pre-flight checks...$(NC)"
	npm run preflight

validate: ## Validate all components
	@echo "$(GREEN)Validating all components...$(NC)"
	npm run validate:all

validate-schema: ## Validate database schema lock
	@echo "$(GREEN)Validating schema lock...$(NC)"
	npm run db:schema:verify

validate-endpoints: ## Validate API endpoints
	@echo "$(GREEN)Validating endpoints...$(NC)"
	npm run api:endpoints:validate

# ======================
# DATABASE
# ======================

db-init: ## Initialize database (create DB + apply schema)
	@echo "$(GREEN)Initializing database...$(NC)"
	@echo "$(YELLOW)Creating database rolgi_v6...$(NC)"
	-psql -U postgres -c "CREATE DATABASE rolgi_v6;"
	@echo "$(GREEN)Applying schema...$(NC)"
	psql -U postgres -d rolgi_v6 -f src/database/schema/postgres/001_init.sql
	@echo "$(GREEN)Creating schema lock...$(NC)"
	npm run db:schema:update
	@echo "$(GREEN)Database initialized successfully!$(NC)"

db-reset: ## Drop and recreate database (WARNING: destroys all data!)
	@echo "$(RED)WARNING: This will destroy all data!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "$(YELLOW)Dropping database...$(NC)"; \
		psql -U postgres -c "DROP DATABASE IF EXISTS rolgi_v6;"; \
		$(MAKE) db-init; \
	else \
		echo "$(GREEN)Cancelled.$(NC)"; \
	fi

db-backup: ## Backup database to file
	@echo "$(GREEN)Creating database backup...$(NC)"
	@mkdir -p backups
	pg_dump -U postgres -d rolgi_v6 -F c -f backups/rolgi_v6_$$(date +%Y%m%d_%H%M%S).dump
	@echo "$(GREEN)Backup created in backups/$(NC)"

db-restore: ## Restore database from latest backup
	@echo "$(GREEN)Restoring database from latest backup...$(NC)"
	@LATEST=$$(ls -t backups/*.dump | head -1); \
	if [ -z "$$LATEST" ]; then \
		echo "$(RED)No backup files found!$(NC)"; \
		exit 1; \
	fi; \
	echo "$(YELLOW)Restoring from $$LATEST$(NC)"; \
	psql -U postgres -c "DROP DATABASE IF EXISTS rolgi_v6;"; \
	psql -U postgres -c "CREATE DATABASE rolgi_v6;"; \
	pg_restore -U postgres -d rolgi_v6 $$LATEST; \
	echo "$(GREEN)Restore complete!$(NC)"

db-test: ## Test database connection
	@echo "$(GREEN)Testing database connection...$(NC)"
	npm run db:pool:health

# ======================
# DOCKER
# ======================

docker-build: ## Build Docker image
	@echo "$(GREEN)Building Docker image...$(NC)"
	docker build -t rolgi:6.0.0 -t rolgi:latest .

docker-up: ## Start Docker stack
	@echo "$(GREEN)Starting Docker stack...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)Stack started! Check logs with 'make docker-logs'$(NC)"

docker-down: ## Stop Docker stack
	@echo "$(YELLOW)Stopping Docker stack...$(NC)"
	docker-compose down

docker-restart: ## Restart Docker stack
	@echo "$(YELLOW)Restarting Docker stack...$(NC)"
	docker-compose restart

docker-logs: ## View Docker logs
	@echo "$(GREEN)Viewing Docker logs (Ctrl+C to exit)...$(NC)"
	docker-compose logs -f

docker-ps: ## Show running Docker containers
	@echo "$(GREEN)Docker containers:$(NC)"
	docker-compose ps

docker-clean: ## Clean Docker volumes and images
	@echo "$(RED)WARNING: This will remove all Docker volumes and images!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v; \
		docker system prune -af; \
		echo "$(GREEN)Docker cleanup complete!$(NC)"; \
	else \
		echo "$(GREEN)Cancelled.$(NC)"; \
	fi

# ======================
# SCHEDULED JOBS
# ======================

jobs-start: ## Start scheduled jobs
	@echo "$(GREEN)Starting scheduled jobs...$(NC)"
	node src/jobs/scheduled-jobs.js start

jobs-status: ## Show scheduled jobs status
	@echo "$(GREEN)Scheduled jobs status:$(NC)"
	node src/jobs/scheduled-jobs.js status

jobs-run: ## Run specific job manually (usage: make jobs-run JOB=load_live_games)
	@if [ -z "$(JOB)" ]; then \
		echo "$(RED)Error: JOB parameter required$(NC)"; \
		echo "$(YELLOW)Usage: make jobs-run JOB=load_live_games$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)Running job: $(JOB)$(NC)"
	node src/jobs/scheduled-jobs.js run $(JOB)

# ======================
# UTILITIES
# ======================

clean: ## Clean node_modules and temporary files
	@echo "$(YELLOW)Cleaning project...$(NC)"
	rm -rf node_modules
	rm -rf coverage
	rm -rf dist
	rm -rf *.log
	@echo "$(GREEN)Clean complete!$(NC)"

reinstall: clean install ## Clean and reinstall dependencies

health: ## Check system health
	@echo "$(GREEN)Checking system health...$(NC)"
	curl -f http://localhost:3000/health || echo "$(RED)Server not running$(NC)"

metrics: ## Show system metrics
	@echo "$(GREEN)System metrics:$(NC)"
	curl -s http://localhost:3000/metrics | jq '.' || curl -s http://localhost:3000/metrics

logs: ## View application logs
	@echo "$(GREEN)Application logs:$(NC)"
	tail -f logs/app.log 2>/dev/null || echo "$(YELLOW)No log file found. Logs may be in stdout.$(NC)"

# ======================
# DEPLOYMENT
# ======================

deploy-staging: ## Deploy to staging environment
	@echo "$(CYAN)Deploying to staging...$(NC)"
	@echo "$(YELLOW)This would deploy to staging environment$(NC)"
	# Add your staging deployment commands here

deploy-prod: ## Deploy to production environment
	@echo "$(CYAN)Deploying to production...$(NC)"
	@echo "$(RED)WARNING: Deploying to PRODUCTION!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "$(GREEN)Starting production deployment...$(NC)"; \
		# Add your production deployment commands here \
	else \
		echo "$(GREEN)Cancelled.$(NC)"; \
	fi

# ======================
# RELEASE
# ======================

version: ## Show current version
	@echo "$(CYAN)Current version:$(NC)"
	@node -p "require('./package.json').version"

release: ## Create a new release (usage: make release VERSION=6.1.0)
	@if [ -z "$(VERSION)" ]; then \
		echo "$(RED)Error: VERSION parameter required$(NC)"; \
		echo "$(YELLOW)Usage: make release VERSION=6.1.0$(NC)"; \
		exit 1; \
	fi
	@echo "$(CYAN)Creating release v$(VERSION)...$(NC)"
	npm version $(VERSION)
	git push origin main --tags
	@echo "$(GREEN)Release v$(VERSION) created!$(NC)"

# ======================
# DOCUMENTATION
# ======================

docs: ## Open API documentation in browser
	@echo "$(GREEN)Opening API documentation...$(NC)"
	@open http://localhost:3000/docs 2>/dev/null || xdg-open http://localhost:3000/docs 2>/dev/null || echo "$(YELLOW)Please open http://localhost:3000/docs in your browser$(NC)"

# ======================
# CI/CD
# ======================

ci: lint test validate ## Run CI pipeline locally
	@echo "$(GREEN)CI pipeline completed successfully!$(NC)"

cd: docker-build docker-up ## Run CD pipeline locally
	@echo "$(GREEN)CD pipeline completed successfully!$(NC)"
