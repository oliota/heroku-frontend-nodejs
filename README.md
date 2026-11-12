# Oliota Frontend

Main Node.js / Express frontend for **Oliota**, including the Adedonha – STOP game, the expense manager, and the calendar. This repository publishes to the existing GitHub repository and Heroku app `heroku-frontend-nodejs`.

## Desktop Command Hub (Windows)

Open the management window from the project root:

```powershell
npm install
node scripts/install-command-hub.mjs
npm run hub
```

The desktop window provides **Install**, **Start server**, **Stop server**, **Development**, **Tests**, **Build**, **Lint**, **Git status**, **Heroku login**, **Firebase login**, **Publish GitHub**, **Publish Heroku**, and **Publish all**. It displays each step, real-time terminal output, a progress indicator, a Cancel task button, and a separate Stop server button. The server remains running while you perform tests or inspect Git status. Closing the window offers to stop the processes it started.

**Publish all** prompts for a Git commit message and confirmation, then runs tests → build → GitHub commit/push → Heroku deployment. Execution stops if a stage fails. Review `Git status` before publishing: GitHub publication stages all non-ignored changes. The GUI requires Windows PowerShell 5.1 and Windows Forms, already included with Windows 10/11. Heroku CLI and Git must be installed; Firebase CLI is fetched through `npx` if needed. The GUI is a local developer utility, not part of the deployed website.

The first run needs `apply-command-hub.cmd` (or `node scripts/install-command-hub.mjs`) if `npm run hub` is missing. `open-command-hub.cmd` opens the window without relying on the npm script.

## Quick start

Requires [Node.js](https://nodejs.org/en) (22.12+ recommended), npm, and [Git](https://git-scm.com/).

```powershell
npm install
node scripts/install-command-hub.mjs
npm run hub
```

Or run without the GUI:

```powershell
npm start
npm run dev
npm test
npm run build
npm run deploy -- "feat: update frontend"
```

Run the frontend at `http://localhost:3000` (default). Local pages:

| Application | Local URL | Production URL |
| --- | --- | --- |
| Oliota frontend | http://localhost:3000/ | https://oliota.com/ |
| Adedonha – STOP | http://localhost:3000/adedonha | https://oliota.com/adedonha |
| STOP alias | http://localhost:3000/stop | https://oliota.com/stop |
| Calendar | http://localhost:3000/elianeOrganizada | https://oliota.com/elianeOrganizada |

Production URLs require the configured domain and Heroku service to be available. The frontend serves JavaScript browser modules directly; `npm run build` validates sources and assets without bundling them.

## Services and configuration

The game uses a separate backend API (locally `http://localhost:3002/api/v1/adedonha`), plus Google authentication through Firebase Web SDK. The frontend can be used locally without Firebase Admin credentials. Configure public Firebase Web values with `ADEDONHA_FIREBASE_*` environment variables, as described in `.env.example`. Do not commit private keys, secrets, or the Firebase Admin service-account JSON.

GUI **Heroku login** and **Firebase login** authenticate your developer CLI accounts, not players signing into the game. See the [Heroku CLI guide](https://devcenter.heroku.com/articles/heroku-cli), [Firebase CLI guide](https://firebase.google.com/docs/cli), and [Express documentation](https://expressjs.com/).

## Testing, development and deployment

| Command | Purpose |
| --- | --- |
| `npm run hub` | Open the desktop management window |
| `npm start` / `npm run dev` | Run / watch the local server |
| `npm test` / `npm run test:ui` | Node unit tests / Playwright browser tests |
| `npm run build` / `npm run lint` | Validate assets / check sources |
| `npm run format` / `npm run debug` | Format / inspect the server |
| `npm run status` / `npm run heroku:logs` | Git state / live Heroku logs |
| `npm run heroku:login` / `npm run firebase:login` | Authenticate CLIs |
| `npm run deploy` | Test, build, commit, push GitHub and deploy Heroku |
| `npm run help` / `npm run list` | Command help / native npm scripts |

A direct CLI deploy, from the repository root:

```powershell
npm run deploy -- "fix: update frontend"
```

The deploy uses GitHub remote `origin` and the existing Heroku app `heroku-frontend-nodejs`. It does not create a new app. See [Command Hub guide](docs/COMMAND_HUB.md) and [validation notes](docs/ADEDONHA_VALIDATION.md).

## Structure

- `server.js`: Express routing, runtime configuration, and static assets.
- `index.html`, `js/`: main Oliota expense frontend.
- `elianeOrganizada/`: calendar frontend.
- `adedonha/`: Adedonha / STOP interface and native browser modules.
- `scripts/`: CLI workflows and Windows desktop Command Hub.
- `tests/`: Node and browser tests.
- `docs/`: protocol, validation, and developer reference.

The backend and Godot projects are separate repositories and are not deployed by this frontend.
