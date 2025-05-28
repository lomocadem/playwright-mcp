# Docker Setup for Playwright MCP Development

This document explains how to use the Docker Compose setup for local development with Redis and PostgreSQL.

## Quick Start

### 1. Start Database Services Only

For most development scenarios, you'll want to run Redis and PostgreSQL in Docker while running the Playwright MCP server locally:

```bash
# Start Redis and PostgreSQL
docker-compose up -d redis postgres

# Check service status
docker-compose ps
```

### 2. Start with Admin Tools

To include database administration tools (pgAdmin and Redis Commander):

```bash
# Start databases with admin tools
docker-compose --profile admin up -d

# Access admin interfaces:
# - pgAdmin: http://localhost:8080 (admin@playwright-mcp.local / admin)
# - Redis Commander: http://localhost:8081
```

### 3. Full Containerized Development

To run everything in containers including the Playwright MCP server:

```bash
# Build and start all services
docker-compose --profile full up -d

# View logs
docker-compose logs -f playwright-mcp
```

## Environment Configuration

### Local Development (Recommended)

When running the MCP server locally with containerized databases:

1. Use the default `.env` file settings:
   ```env
   REDIS_HOST=localhost
   POSTGRES_HOST=localhost
   ```

2. Start your local server:
   ```bash
   npm run build
   node cli.js
   ```

### Containerized Development

When running everything in containers, the Docker Compose file automatically sets:
- `REDIS_HOST=redis`
- `POSTGRES_HOST=postgres`

## Database Access

### PostgreSQL

- **Host**: localhost
- **Port**: 5432
- **Database**: playwright_mcp
- **Username**: postgres
- **Password**: postgres

Connection string: `postgresql://postgres:postgres@localhost:5432/playwright_mcp`

### Redis

- **Host**: localhost
- **Port**: 6379
- **Database**: 0
- **Password**: (none)

Connection string: `redis://localhost:6379/0`

## Data Persistence

All database data is stored in Docker volumes:
- `redis_data`: Redis data and AOF files
- `postgres_data`: PostgreSQL database files
- `pgadmin_data`: pgAdmin configuration

Data persists between container restarts and system reboots.

## Useful Commands

### Service Management

```bash
# Start specific services
docker-compose up -d redis postgres

# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes all data)
docker-compose down -v

# Restart a service
docker-compose restart postgres

# View service logs
docker-compose logs -f redis
```

### Database Operations

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d playwright_mcp

# Connect to Redis CLI
docker-compose exec redis redis-cli

# Backup PostgreSQL database
docker-compose exec postgres pg_dump -U postgres playwright_mcp > backup.sql

# Restore PostgreSQL database
docker-compose exec -T postgres psql -U postgres playwright_mcp < backup.sql
```

### Health Checks

```bash
# Check service health
docker-compose ps

# Test database connections
docker-compose exec postgres pg_isready -U postgres
docker-compose exec redis redis-cli ping
```

## Troubleshooting

### Port Conflicts

If you have existing Redis or PostgreSQL installations:

1. Stop local services:
   ```bash
   # macOS with Homebrew
   brew services stop redis
   brew services stop postgresql

   # Linux with systemd
   sudo systemctl stop redis
   sudo systemctl stop postgresql
   ```

2. Or change ports in `docker-compose.yml`:
   ```yaml
   ports:
     - "6380:6379"  # Redis on port 6380
     - "5433:5432"  # PostgreSQL on port 5433
   ```

### Permission Issues

If you encounter permission issues:

```bash
# Fix volume permissions
docker-compose down
docker volume rm playwright-mcp_postgres_data playwright-mcp_redis_data
docker-compose up -d
```

### Connection Issues

1. Ensure services are healthy:
   ```bash
   docker-compose ps
   ```

2. Check logs for errors:
   ```bash
   docker-compose logs postgres
   docker-compose logs redis
   ```

3. Test connections:
   ```bash
   # Test PostgreSQL
   docker-compose exec postgres pg_isready -U postgres

   # Test Redis
   docker-compose exec redis redis-cli ping
   ```

## Development Workflow

### Recommended Setup

1. Start databases:
   ```bash
   docker-compose up -d redis postgres
   ```

2. Run MCP server locally:
   ```bash
   npm run build
   node cli.js --host localhost --port 3000
   ```

3. The server will automatically connect to the containerized databases using the `.env` configuration.

### Database Schema

The Playwright MCP server will automatically create the required database schema on first connection. You can also manually initialize it by running the database initialization tools provided in the codebase.

## Production Considerations

This Docker Compose setup is designed for development. For production:

1. Use proper secrets management instead of hardcoded passwords
2. Configure proper backup strategies
3. Use production-grade PostgreSQL and Redis configurations
4. Implement proper monitoring and logging
5. Consider using managed database services

## Admin Interface Access

### pgAdmin (PostgreSQL)

1. Access: http://localhost:8080
2. Login: admin@playwright-mcp.local / admin
3. Add server connection:
   - Host: postgres
   - Port: 5432
   - Database: playwright_mcp
   - Username: postgres
   - Password: postgres

### Redis Commander

1. Access: http://localhost:8081
2. No login required
3. Automatically connected to the Redis instance
