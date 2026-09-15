# AI Interview Assistant

Transparent, permission-based AI interview practice platform. Windows system-tray desktop app + web dashboard + Node.js backend.

> **Product boundaries:** No anti-detection, no proctoring evasion, no stealth behavior, no tampering with third-party assessment apps, no credential theft or covert capture. All audio/screen capture is explicit, permission-gated, and visibly indicated.

## Monorepo

```
/apps/desktop    Electron + React + TypeScript (tray app, floating panel)
/apps/web        React + Vite dashboard
/apps/backend   Fastify REST + WebSocket + AI abstraction + PostgreSQL
/packages/shared Shared types + realtime event contracts + validation
/packages/ui     Reusable React components
/packages/types  Re-export barrel (see packages/shared)
/infrastructure  Docker Compose, migrations reference, CI configs
/docs            ARCHITECTURE, SECURITY, PRIVACY
```

## Quick start

```bash
cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up -d  # postgres + redis
npm install
npm run dev:backend   # Fastify :3001 + WS :3002
npm run dev:web       # Vite :5173
npm run dev:desktop   # Electron (requires display; on Windows: tray app)
```

## Commands

| Command | Purpose |
|---|---|
| `npm install` | install all workspaces |
| `npm run dev` | dev all workspaces |
| `npm run build` | build all workspaces |
| `npm run test` | unit + integration tests |
| `npm run lint` | eslint |
| `npm run typecheck` | tsc --noEmit per workspace |
| `npm run e2e` | Playwright web E2E |
| `npm run package:windows` | electron-builder NSIS (run on Windows) |

## Docs

- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/PRIVACY.md`
- `CONTRIBUTING.md`

# OA-crack
