# Security

- OAuth/session auth; Argon2id password hashing; 15-min JWT access + rotating 14-day refresh.
- TLS 1.3 everywhere. Rate limiting, Zod validation, parameterized ORM queries, React escaping + strict CSP.
- Electron: `contextIsolation: true`, `nodeIntegration: false`, IPC channel allowlist in preload, `safeStorage` for AI keys in main only.
- Secrets via env only. Audit log (`audit_logs`) for auth/session actions. Account/session/data deletion + export supported.

## What we never do

No anti-detection, no proctoring/EDR/AV evasion, no hiding from recruiters, no injection/tampering with third-party apps, no stealth persistence, no keylogging/cookie theft/covert capture.
