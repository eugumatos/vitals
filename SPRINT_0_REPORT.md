# Sprint 0 Report — Limpeza e Fundação

## ✅ Tarefas Concluídas

### T0.1 — Migrar tokens para safeStorage
- Created `electron/secure-store.ts` — tokens are now encrypted via Electron's `safeStorage` API (backed by macOS Keychain).
- Updated `electron/store.ts` — `getToken`, `setToken`, `removeToken`, `getAllTokenStatus` now delegate to secure-store.
- Migration logic: on first run, reads tokens from old electron-store (hardcoded `encryptionKey`), re-encrypts via safeStorage, deletes from old store. Marked with `.tokens-migrated` flag file.
- Fallback: if `safeStorage.isEncryptionAvailable()` returns false (rare edge case), stores as base64 with warning log.
- `electron-store` remains for non-sensitive data (preferences, watched repos, license info).

### T0.2 — Dead code decisions
| Item | Decision | Action |
|---|---|---|
| `electron/adapters/chrome.ts` | Delete | ✅ Removed |
| `notification-manager.ts` | Keep (needed Sprint 2) | ✅ Confirmed not imported yet — will plug in Sprint 2 |
| `posthog.ts` / `segment.ts` | Keep deleted | ✅ Confirmed already gone from filesystem |
| `states/Settings.tsx` (inline) | Delete | ✅ Removed — never imported in Notch.tsx. `SettingsApp.tsx` (separate window) is the active implementation |
| `src/store/types.js` + `.js.map` | Delete | ✅ Removed accidental compile artifacts |

### T0.3 — Deploy history persistence (SQLite)
- Created `electron/history-store.ts` using `better-sqlite3`.
- DB file: `~/Library/Application Support/vitals/history.db`.
- Schema versioned via `_migrations` table.
- APIs implemented:
  - `addDeploy(event)` — upserts (handles re-polling same deploy)
  - `getDeploysSince(sinceIso)` — for streak calculation
  - `getDeploysByDay(dateStr, cutoffHour)` — for day-specific queries
  - `getAllSuccessfulDeploys()` — last 400 days, for streak
  - `getDeployCountsByDay(days)` — for future heatmap
  - `deployExists(id, provider)` — deduplication check
  - `closeHistoryDb()` — graceful shutdown
- WAL mode enabled for concurrent reads.
- `better-sqlite3` added to package.json + electron-builder config (asarUnpack for native module).

### T0.4 — Safe Area Audit
- Full findings documented in `BACKLOG.md` under "Safe Area Audit" section.
- Key finding: the `0.119` ratio is only accurate for 15" Air. Other models (14" Pro, 13" Air) get wrong notch width.
- Current implementation works *accidentally* because ZoneCIndicator uses `position: absolute; right: 10` — content lands in the safe zone by luck, not by design.
- Gaps documented for Sprint 1 implementation.

### T0.5 — BACKLOG.md
- Created at project root with sections: Tech Debt, Refactors Planned, Edge Cases, Safe Area Audit, Ideas.

## 💡 Decisões técnicas tomadas

1. **safeStorage file format:** JSON file (`secure-tokens.json`) with base64-encoded encrypted buffers. Chosen over SQLite or individual keychain entries for simplicity and atomic reads.
2. **Migration is one-way:** after migrating, old tokens are deleted from electron-store. No rollback path — safeStorage is strictly better.
3. **better-sqlite3 WAL mode:** enables concurrent reads during polling without blocking writes.
4. **history-store is synchronous API:** better-sqlite3 is sync by design, which is fine for the main process (no renderer blocking). This simplifies the streak calculation significantly.

## 📋 Items adicionados ao BACKLOG.md

- Renderer TS errors (pre-existing `window.vitals` type conflict between App.tsx and ActivationApp.tsx)
- Safe area gaps (5 items)
- Rate limiting, token refresh, multi-monitor edge cases

## ⏭️ Pré-requisitos para Sprint 1

- All clear. Foundation is in place:
  - `history-store.ts` ready to receive deploy events from polling
  - Safe area gaps documented — Sprint 1 will implement proper detection
  - Tokens secure — adapters work unchanged (same `getToken`/`setToken` API)
