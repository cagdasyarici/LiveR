---
description: Code style and TypeScript conventions for LiveRelay
globs: ["src/**/*.ts", "client/**/*.ts", "tests/**/*.ts"]
---

# Code Style Rules

## TypeScript
- Strict mode enabled — never disable strict checks
- No `any` — use `unknown` and narrow with type guards
- Prefer `interface` for object shapes, `type` for unions/intersections
- Use `readonly` where mutation is not needed
- Explicit return types on exported functions

## Naming
- Files: PascalCase for classes (`ConnectionManager.ts`), camelCase for utilities (`idGenerator.ts`)
- Classes/Interfaces: PascalCase
- Functions/variables: camelCase
- Constants: UPPER_SNAKE_CASE
- Enum members: UPPER_SNAKE_CASE

## Imports
- Use named imports, avoid default exports
- Group imports: node builtins → external packages → internal modules
- Use relative paths for internal imports

## Error Handling
- Never swallow errors silently
- Use typed error codes from `src/protocol/errors.ts`
- Log errors with pino logger including context
- WebSocket errors → send error frame to client, then close if fatal
- Redis errors → log and attempt reconnection

## Async
- Always handle promise rejections
- Use async/await over raw promises
- Set timeouts on external calls (Redis, JWT verify)
