# Oliota frontend — Expenses, Calendar and Adedonha / STOP

One Express 4 application serves the existing Bootstrap 5 / jQuery Expense Manager at `/`, the existing calendar at `/elianeOrganizada`, and the independent Adedonha word game at **`/adedonha` and `/stop`**. Both game URLs load the same native JavaScript modules and share browser preferences. No framework migration or deployment is involved.

## Install and run

Use Node.js 22.12+ (validated with Node 24) and npm:

```sh
npm install
npm test
npm start
```

Open [Adedonha](http://localhost:3000/adedonha), [STOP](http://localhost:3000/stop), [Expenses](http://localhost:3000/) or [Calendar](http://localhost:3000/elianeOrganizada). Express uses `process.env.PORT || 3000`. Serve the game over HTTP because it uses ES modules and runtime configuration. Direct visits and reloads work on both aliases; missing game assets return 404 instead of expenses HTML.

The backend is a separate existing checkout, normally running at `http://localhost:3002`. Its public rules endpoints work without Firebase Admin credentials. Start that project independently if necessary; this frontend does not change it.

## Architecture

```text
server.js                    Express entry, route aliases, public runtime configuration
index.html, js/               Existing expenses UI and REST CRUD
elianeOrganizada/             Existing calendar, import and synchronization UI
adedonha/
  index.html, assets/         Game shell, vector favicon
  css/app.css, wheel.css     Responsive layout and interactive wheels
  js/config.js               Isolated Adedonha API/Firebase configuration
  js/api.js                  Token, timeout, retry and idempotency handling
  js/auth.js                 Named Firebase Web app, Google Auth, read-only Firestore
  js/state.js                Version reconciliation and serialized room mutations
  js/realtime.js             Room listener, polling, presence and ordered drafts
  js/rules.js, storage.js    Official rules, local scoring, scoped persistence
  js/app.js                  Navigation, accounts and local/online lifecycle
  js/ui/                     Menu, setup, letters, lobby, gameplay, review,
                             results, friends and Golden Wheel
tests/                       Node tests and explicit browser-only API/Auth fixtures
scripts/commands.mjs         Command hub and buildless module validation
```

The game uses the original Godot coral, yellow, teal, violet, pink and blue palette. Menu swipes rotate with inertia without activating options. Taps use the shortest angular path; labels stay upright. A three-second hold selects once; holding the letter wheel center selects a random letter pending confirmation. Friends and Profile have separate upper controls. Safe areas and reduced-motion preferences are respected.

Local games require no login, ad or room. Categories, letters, normalization and scoring come from `/config`, `/rules`, `/locales`, `/categories` and `/letters`. All ten backend locales and Portuguese aliases are supported, preserving PT-BR `TIME` versus PT-PT `CLUBE`. A versioned, previously fetched rules cache can be used for 24 hours during API outages. There is no independent production fallback list. Without valid rules the UI offers a retry. Local answers/progress survive reloads and remain separate from online rooms.

## API configuration

Set `ADEDONHA_API_BASE` before starting Express. `/adedonha/runtime-config.js` exposes only allowlisted public configuration with no cache. Localhost defaults to:

```text
http://localhost:3002/api/v1/adedonha
```

Other hosts default to the **planned production backend**:

```text
https://heroku-backend-nodejs-fd16668acdd6.herokuapp.com/api/v1/adedonha
```

Availability of the new production endpoints has not been confirmed. API failures are explicit. Existing expenses configuration stays in `js/config.js`; calendar configuration stays in `elianeOrganizada/js/config.js`.

## Google login and Firebase

The frontend includes the **public** Firebase Auth/Firestore configuration obtained from the existing Godot project's `data/online_config.json`, in `adedonha/public-firebase.json`. No Firebase Web appId is required by the Auth/Firestore modules used here. If a Firebase Web appId becomes available, it can be supplied through `ADEDONHA_FIREBASE_APP_ID` without changing the deployed code. `ADEDONHA_FIREBASE_*` environment variables override the public defaults.

The site must be registered in Firebase Authentication's **Authorized domains**, and Google must be enabled as a sign-in provider. Include `localhost` for local testing and `oliota.com` / `www.oliota.com` in production.

`/adedonha/runtime-config.js` returns public client configuration only, and no Admin credentials. REST uses Firebase **ID tokens**, never Google OAuth access tokens. A 401 forces one renewal; the application does not store tokens or purchase proofs.

Never expose Firebase Admin service-account keys in this checkout or browser configuration. The backend requires separate Admin credentials. Missing Web configuration disables online login with an explanation while local play and existing pages remain available. Logout cancels API work/listeners/timers, clears room state and UID-scoped caches, and signs out through Firebase. Public preferences/rules and local games remain.

## Multiplayer and protocol

The sibling backend's `docs/ADEDONHA_FRONTEND_INTEGRATION.md` is authoritative. Also inspected: `docs/ADEDONHA_BACKEND_HANDOFF_PT.md`, `docs/ADEDONHA_VALIDATION.md` and `data/adedonhaRules.json`. No backend or Godot files are modified here.

1. Google login loads/synchronizes `/me`, entitlements and request count.
2. Creation joins the creator and issues the real free ticket when applicable. Lobby distinguishes immutable creator (`owner`), current leader (`host`), participants and room-scoped premium benefits. Explicit leader departure can transfer leadership.
3. Every mutation uses REST. A single read-only Firestore listener watches `rooms/{code}` after membership. REST polling recovers listener outages. Foreground heartbeats run about every 25 seconds; presence becomes visually stale after 60 seconds.
4. Server `selected_letter` and confirmed `letter` determine play. Private draft recovery reads only `rooms/{code}/players/{uid}`. Increasing sequences, debounce and serialized writes prevent older local drafts replacing newer ones.
5. While playing, `/game` is polled about every second, including STOP's eight-second grace. Inputs remain editable during grace until final submission/deadline. Final submission explicitly freezes that player's answers.
6. Review shows one category at a time and every participant, including empty answers. Floating 0/5/10 controls submit `{votes:{'<uid>:<zeroBasedIndex>':{v,e}}}` with the current epoch (the actual API defines a missing epoch as zero). Suggestions are informational. Approval, locks, reopening and final points come from the server. Each participant confirms completion and can withdraw while review remains open. Only the leader can reopen words or force a category using explicit leader votes. `HOST_VOTE_MISSING` highlights pending items.
7. `/results` supplies consolidated scores. The leader advances or finishes the game. Finished/closed rooms cannot be reused. Reconnect follows token refresh → `/join` → `/game` → private draft restore → listener attachment.

All mutations carry `Idempotency-Key`. Uncertain retries preserve identical key/path/body; identical uncertain operations retain their key in memory for manual retry. Room writes are serialized and use current version/IDs. `STALE_VERSION` refreshes state, discards already-applied intents, rechecks validity, and sends a new operation/key. Queued old-room/old-round intents are rejected.

### Joining by room code

New participants join a lobby by five-character room code, without needing its current version. The backend validates authentication, capacity and membership atomically. Invitation links use `?room=ABCDE#join`. A version may still be supplied by other clients for optimistic locking, but the web client does not require one.

The existing Godot app still writes directly to Firestore. `ROOM_MIGRATION_REQUIRED` is displayed. Secure native/web interoperability requires native migration to the API and coordinated Firestore rules deployment; it is not declared complete.

## Friends, tickets and Golden Wheel

Friends uses paginated `items`/`next_cursor`, UID-scoped cache, pending requests first, confirmations and `/friends/requests/count` for the badge. Firestore inbox events refresh lists/count; manual refresh is available. Ordering is by document ID, not chronology.

Tickets are genuine room grants. `/tickets/status` includes `room_code`. When needed, the client uses `/tickets/intent`, `/tickets/redeem` with `source:'free'`, and `/tickets/:roomCode` verification. Existing, premium and shared grants are respected. No ad provider is enabled: no fake video, timer, reward or client watched claim is used.

The permanent Golden Wheel license comes from `/me/entitlements` and `/premium/status`. The cosmetic preview grants nothing. Native purchases associated with the same UID are recognized. **No web checkout exists**; purchase/restore proofs belong to the native store flow. Verification failures grant no benefits. Persisted shared benefits survive creator departure until `finished`/`closed`, without making guests individual purchasers.

Voice has no compatible signaling/audio backend. Lobby, gameplay and review show it unavailable. No remote listening is simulated. Optional real feedback uses `ADEDONHA_FEEDBACK_URL` (HTTPS); completed-game/dismissal counts stay locally. Reviews have no reward.

## Commands and tests

```sh
npm test                 # Routes, HTTP client, state, rules and drafts
npm run test:adedonha    # Focused game unit tests
npx playwright install chromium
npm run test:ui          # Browser tests with explicit API/Auth mocks
npm run build           # Module syntax and entry asset validation; no compilation
npm run lint
npm run format
npm run debug           # Express under Node inspector
npm run status
npm run logs            # Saved local log if supplied, otherwise live-output guidance
npm run help
```

`start`, `run` and `dev` use the same Express entry. The `install` lifecycle validates sources after npm installs dependencies. Existing scripts and `----` / `-----` / `------` separators remain. Normal gameplay always uses the configured REST/Firebase services. Browser mocks and the verbatim official rules fixture are test-only and never production fallbacks.

Browser checks cover wheel interaction, local play/reload/scoring, locales, unavailable services, drafts/STOP/review, epochs, leader-vote errors, collective confirmation/withdrawal, results, friends/logout and overflow at 360×800, 390×844, 768×1024, 1366×768 and 1920×1080. They do not certify physical mobile keyboards, real OAuth/Firestore permissions, stores or multiple physical clients. See `docs/ADEDONHA_VALIDATION.md` for executed checks and limitations.

## Heroku and existing services

`Procfile` remains `web: node server.js`. Deployment is manual and was **not executed**:

```sh
heroku login
git push heroku main
heroku open
```

Use the actual remote/branch (older checkouts may use `git push heroku master:main`). Configure public Web variables on the frontend and Admin credentials/CORS on the backend separately. Planned game routes: [oliota.com/adedonha](https://oliota.com/adedonha), [oliota.com/stop](https://oliota.com/stop). Existing example host: [heroku-frontend-nodejs-8bbe5ba4674a.herokuapp.com](https://heroku-frontend-nodejs-8bbe5ba4674a.herokuapp.com/).

Expenses retains REST add/edit/delete, AJAX updates and delete confirmations. Its Heroku backend `/api/v1/expenses` remains configured in `js/config.js`. The calendar, agenda editing, import/synchronization and backend configuration remain under `elianeOrganizada/`.

Official references: [Node.js](https://nodejs.org/en/docs), [Express](https://expressjs.com/en/4x/api.html), [Bootstrap](https://getbootstrap.com/docs/5.3/), [jQuery](https://api.jquery.com/), [Firebase Web setup](https://firebase.google.com/docs/web/setup), [Google authentication](https://firebase.google.com/docs/auth/web/google-signin), [Firestore listeners](https://firebase.google.com/docs/firestore/query-data/listen), [Playwright](https://playwright.dev/docs/intro), [Prettier](https://prettier.io/docs/), [Heroku](https://devcenter.heroku.com/articles/deploying-nodejs).

## Guest browser sessions and Node development

The web can play solo with a nickname or create/join rooms using a nickname and the existing 5-character code. Google is optional; its verified email is displayed instead of a nickname. Configure Firebase Authentication **Anonymous** and **Google** providers and publish compatible Firestore rules on `adedonha-stop`. Install and run with `npm ci` and `npm run dev` (nodemon). `nodemon` restarts the Express process if server files change; reload the browser for front-end JavaScript/CSS changes. See `docs/ANONYMOUS_ROOMS_PT.md`.
