# Adedonha frontend — local validation

Validated on 10 November 2026. No deployment was performed. Backend and Godot source files were read but not modified.

## Executed checks

- `npm install`: completed; package lock updated. Playwright and Prettier are development dependencies. Compatible `npm audit fix` updated vulnerable Express transitive dependencies; the final audit reports zero known vulnerabilities.
- `npm test`: 15 passing tests, no failures or skipped tests. Covers original routes and equivalent game routes/assets, HTTP envelope/auth/idempotency, uncertain-write replay, version reconciliation, stale rounds, current-epoch review, local scoring, all official locales, rules-cache expiration, ordered/retried drafts, read-only listeners, timer polling, 25-second heartbeat and listener cleanup.
- `npm run test:ui`: browser tests with explicitly intercepted test-only REST and Firebase Auth modules. Production code has no mock switch. Covers menu drag/tap/hold and upright text, local settings/locales/letter confirmation, answers/reload/STOP/scoring, unavailable API/Firebase/checkout, online creation and stale writes, draft debounce, editable STOP grace, final submission, self/blank votes, unanimous locking, reopening with incremented epoch, missing leader votes, collective completion/withdrawal, consolidated results, account logout/cache isolation, friends confirmations and badge updates, free-ticket intent/redeem, reconnect and verified/shared premium.
- Responsive checks: 360×800, 390×844, 768×1024, 1366×768 and 1920×1080. Checks cover home, setup, rotated letter wheel, gameplay and results; the full online review test also runs at 360×800. Wheel overflow and full-width pulsing-letter overflow discovered during QA were corrected.
- `npm run format`, `npm run lint`, `npm run build`: completed. Build verifies native module syntax and referenced entry assets; no compilation is needed.
- `npm start`: Express started on port 3000. Both game aliases were opened in the browser. Existing `/` and `/elianeOrganizada` were checked by HTTP alongside the game aliases. Original expenses/calendar source and `Procfile` were preserved.
- Actual backend HTTP checks at `localhost:3002/api/v1/adedonha`: `/health`, `/config`, `/rules`, `/categories?locale=pt`, `/categories?locale=pt_PT`, `/letters?locale=zh` and `/locales` returned 200. Health explicitly reported `firebase: unavailable` and `database_checked: false`.
- Manual browser inspection used actual public backend rules, with desktop and mobile captures. A complete local round selected and confirmed C, accepted Caio/Cinza/Caju, and displayed 30 points. Local configuration showed official Portuguese categories and letters.

## External verification limits

No real Google sign-in, Firebase Auth/Firestore permissions/transactions, multiple-device multiplayer, store purchase/refund or rewarded-ad integration was certified. The backend has no configured Firebase Admin credentials in the running local health check; Web Firebase public app values must also be supplied. The provided browser mocks verify frontend protocol/interactions, not the availability of those external services. Physical mobile keyboards and OS notification/orientation interruptions were not exercised on a phone.

Voice transmission, a web ad provider and web checkout have no compatible backend implementation. The UI explicitly reports their absence and never grants fake rewards, licenses or listening status. Native store purchase/restore remains in the native app; Web only recognizes the same UID's verified license.

Production Adedonha endpoint deployment remains unconfirmed. Candidate Firestore rules require coordinated native migration and real/emulator security validation. Existing Godot clients still write directly to Firestore; they cannot securely join API-authoritative games until migrated.

## Contract discrepancy found

New members must supply a current room `version` to `/join`, but room/game GET requires prior membership and ticket status supplies no version. The existing API therefore cannot support first-time code-only discovery. The frontend includes the current version in the leader's freshly copied invitation and allows manual version entry. Concurrent heartbeats/mutations can stale an invitation; a fresh invitation is required. Existing-member reconnection omits the version. No backend endpoint or authority bypass was invented.

Review epoch handling follows the actual backend: an absent `review.epochs[key]` means zero, while an existing epoch is always sent unchanged. Empty answers require explicit votes; native legacy auto-approval is intentionally not applied.

## Files

Created: `adedonha/index.html`, `adedonha/assets/icon.svg`, `adedonha/css/{app,wheel}.css`, `adedonha/js/{api,app,auth,config,realtime,rules,state,storage}.js`, `adedonha/js/ui/{dialogs,dom,friends,gameplay,home,letter-wheel,lobby,premium,results,review,setup,wheel}.js`, `.env.example`, `scripts/commands.mjs`, `playwright.config.js`, `tests/adedonha.test.js`, `tests/routes.test.js`, `tests/browser/{game.spec,mock-api}.js`, the official test-only rules fixture, and this document.

Modified: `server.js`, `package.json`, `package-lock.json`, `.gitignore`, `README.md`. The original expenses/calendar implementation and `Procfile` were not edited. No commit, push or deploy was performed.
