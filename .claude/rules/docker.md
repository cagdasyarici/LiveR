---
description: Docker and deployment conventions
globs: ["docker/**", "Dockerfile*", "docker-compose*.yml"]
---

# Docker Rules

## Development
- Redis runs via Docker Compose: `docker compose -f docker/docker-compose.yml up redis`
- Dev server runs locally with ts-node/tsx for hot reload
- Dockerfile.dev includes volume mounts for live code changes

## Production Build
- Multi-stage Dockerfile: build stage (compile TS) → production stage (run JS)
- Use node:20-alpine as base image
- Run as non-root user (liverelay:1001)
- Include HEALTHCHECK in Dockerfile
- Keep image size minimal — only copy dist/ and node_modules to production stage

## Docker Compose
- Services: liverelay, liverelay-2 (scaling demo), redis, dashboard
- Redis with appendonly persistence and 256MB memory limit
- Use service_healthy condition for depends_on
- Environment variables via .env file (never commit secrets)
