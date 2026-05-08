# LiveRelay Deployment Guide

## Quick Start (Docker Compose)

```bash
# Clone and start everything
cd liverelay
docker compose -f docker/docker-compose.yml up -d

# Check health
curl http://localhost:3001/api/health
```

Services:
- **liverelay** — Instance 1 on port 3001
- **liverelay-2** — Instance 2 on port 3002 (scaling demo)
- **redis** — Redis 7 on port 6379
- **dashboard** — Monitoring UI on port 8080

## Development Setup

```bash
# Start Redis only
docker compose -f docker/docker-compose.yml up redis -d

# Run server locally with hot reload
JWT_SECRET=dev-secret API_KEY=dev-key npm run dev
```

Or use the full dev compose:
```bash
docker compose -f docker/docker-compose.dev.yml up
```

## Environment Variables

See `.env.example` for all configuration options. Required:
- `JWT_SECRET` — Secret key for JWT verification
- `API_KEY` — Server-to-server API key

## Production Checklist

- [ ] Set strong `JWT_SECRET` and `API_KEY` values
- [ ] Set `NODE_ENV=production`
- [ ] Configure Redis password (`REDIS_PASSWORD`)
- [ ] Set appropriate rate limits
- [ ] Enable metrics (`METRICS_ENABLED=true`)
- [ ] Configure log level (`LOG_LEVEL=info`)
- [ ] Set up health check monitoring
- [ ] Configure firewall (only expose ports 3001, 8080)
