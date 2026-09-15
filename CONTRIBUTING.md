# Contributing

1. Copy `.env.example` to `.env`. Never commit secrets.
2. Use Node 22+.
3. Run `npm run lint`, `npm run typecheck`, `npm run test` before pushing.
4. All privileged Electron operations go through `apps/desktop/electron/preload.ts` allowlist — never expose `ipcRenderer` directly.
5. AI providers implement `AIProvider` in `apps/backend/src/ai/` — no hard-coded keys.
6. Realtime events must extend `SessionEvent` in `packages/shared/src/events.ts`.
