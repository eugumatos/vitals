# Vitals — Backlog

## Tech Debt

- [ ] `main.ts` is 1160+ lines of repetitive IPC handlers. Refactor to adapter registry pattern (Sprint 4).
- [ ] No tests at all. Add unit tests for streak-engine and history-store at minimum.
- [ ] No error reporting/crash analytics (Sentry for self). Add in Sprint 4 with telemetry.
- [ ] Vercel OAuth token refresh not implemented — token will expire eventually with no auto-renewal.
- [ ] `electron-store` still used with `encryptionKey` for non-token data — the key is hardcoded but data is non-sensitive (preferences). Low risk but ugly.

## Refactors Planned

- [ ] Extract IPC handlers to adapter-registry pattern (Sprint 4 — T4.2).
- [ ] Consolidate polling logic — each adapter has slightly different poll/stop patterns.

## Edge Cases

- [ ] Rate limit (429) from any API — no exponential backoff yet (Sprint 2 — T2.4).
- [ ] Token expiration detection — generic error, no "needs reauth" state (Sprint 2).
- [ ] Multiple monitors — uses `screen.getPrimaryDisplay()`. If external monitor is primary, notch logic may behave unexpectedly.
- [ ] DST transitions — streak day boundary (4am cutoff) could shift during DST change. Recalculating from history each time mitigates this.
- [ ] Very long streaks (365+) — display truncation needed.

## Safe Area Audit (Sprint 0 — T0.4)

### Current Implementation

**Detection code:** `electron/main.ts:367-381` — `screen:geometry` IPC handler.

```typescript
const menuBarHeight = display.workArea.y - display.bounds.y; // 34px on notch Macs
const hasNotch = menuBarHeight > 24; // regular menu bar is ~24px
const notchWidth = hasNotch ? Math.round(screenWidth * 0.119) : 0;
```

**Consumer:** `src/store/useGeometryStore.ts` stores the geometry, and `src/components/Notch.tsx` uses `notchWidth` and `menuBarHeight` to position the shell.

### Findings

1. **Notch width formula `screenWidth * 0.119` is an approximation.** Real notch widths vary:
   - MacBook Pro 14" (2021-2024): ~204px on 1512 logical width → ratio 0.135
   - MacBook Pro 16" (2021-2024): ~204px on 1728 logical width → ratio 0.118
   - MacBook Air 15" M2/M3: ~204px on 1710 logical width → ratio 0.119
   - MacBook Air 13" M2/M3: ~204px on 1470 logical width → ratio 0.139
   - The fixed 0.119 ratio is **only accurate for 15" Air**. All other models get wrong width.

2. **The resting state currently extends BEYOND the notch** — it uses `notchWidth + 200` as shell width centered at screen center. The content (ZoneCIndicator) renders in the **right side** of this wider area, which is physically visible. However, no explicit safe-area checks exist — if content were placed in the center, it would be hidden behind the notch.

3. **The current `ZoneCIndicator` happens to work** because it uses `position: absolute; right: 10` — placing content in the visible zone to the right of the notch. This is accidental safety, not deliberate safe-area enforcement.

4. **No treatment for external monitors.** If primary display has no notch (`hasNotch: false`), `notchWidth: 0` — the resting state is 200px wide centered. This works fine (no notch to worry about).

5. **Expanded states grow downward** and use the full 580px width. The header (32px below menubar) is in visible area since it's below the notch. Content below that is fully safe. ✅

### Gaps to Address (Sprint 1)

- [ ] Replace hardcoded `0.119` ratio with model-aware detection (or better: use the physical notch area from `NSScreen` if accessible, else measure `menuBarHeight` more precisely — on notch Macs it's exactly 37px at 1x, and the notch occupies the center portion of that 37px bar).
- [ ] Add explicit safe-area zones to geometry store: `safeLeftEnd`, `safeRightStart` (X coordinates marking where visible area begins on each side of notch).
- [ ] RestingDisplay component must receive safe-area bounds and enforce content stays in visible zones.
- [ ] For non-notch Macs, safe area = full width (no restrictions needed beyond reasonable max-width).

## Ideas

- [ ] Raycast extension for quick streak check
- [ ] CLI companion `vitals status`
- [ ] Slack status auto-sync during deploys
- [ ] Linear/Notion integration for deploy linking
- [ ] Deploy sounds (opt-in, subtle)
- [ ] Pattern detection ("you deploy 3x more after 10pm")
