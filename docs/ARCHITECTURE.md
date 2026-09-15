# Architecture

## Process model

- **Electron main** (`apps/desktop/electron/`): tray, windows, audio orchestration, screen capture, safeStorage for API keys, auto-updater. Never sends secrets to renderer.
- **Renderer** (`apps/desktop/src/`): React SPA, `contextIsolation: true`, `nodeIntegration: false`. All privileged ops via `window.aiAssistant` preload bridge.
- **Backend** (`apps/backend/`): Fastify REST (`/auth`, `/sessions`, `/ai`, `/resume`, `/job-descriptions`, `/settings`), WebSocket realtime server, AI provider abstraction, Prisma/PostgreSQL, Redis ephemeral state.
- **Web** (`apps/web/`): dashboard SPA (Vite + React Router + TanStack Query).

## Data flow

```
Mic / System Audio (WASAPI loopback, user-granted)
 → AudioWorklet 16kHz PCM + RMS VAD
 → TranscriptionProvider (Deepgram/Groq/Local)
 → Question detection (debounced classifier)
 → AI orchestrator (OpenAI/Anthropic/Gemini/Ollama)
 → Floating panel (streaming) + WS → Backend → PostgreSQL
```

## Windows specifics

- Tray kept alive via `window-all-closed → preventDefault`.
- Icons: ICO multi-resolution per state (READY/LISTENING/PROCESSING/PAUSED/ERROR/OFFLINE).
- Auto-launch: `app.setLoginItemSettings({ openAtLogin })` → HKCU Run key, user-toggle only.
- Audio: WASAPI loopback via native addon where available; fallback to mic-only. Normalize to 16kHz/16-bit/mono.
- Screen: `setDisplayMediaRequestHandler` (main) + `getDisplayMedia` (renderer), `WDA_EXCLUDEFROMCAPTURE` only to exclude own overlay from capture — display-layer, not evasion.
- Multi-monitor/DPI: `screen` module enumeration, `display-metrics-changed`, `devicePixelRatio`-aware layout.

## Realtime

Typed `SessionEvent` union in `packages/shared`. WS reconnect with exponential backoff + local buffering. Circuit breaker per AI provider (5 failures → open, 30s half-open).
