# Desktop Command Hub

From the frontend root on Windows:

```cmd
apply-command-hub.cmd
npm run hub
```

Double-click `open-command-hub.cmd` as an alternative.

The **Local server** section starts `npm start` or `npm run dev`, shows the live process status, and provides **Stop server**. It controls only processes launched by this instance of the desktop window, not other services running on port 3000. The server can run while tests, build, Git status, and deployment execute independently. Closing the window prompts to terminate running child processes.

The **Deployment** section has a complete pipeline (tests, build, GitHub, Heroku) and separate GitHub/Heroku actions. The **Cancel task** button aborts the current workflow and its child process tree. Authentication actions launch the Heroku or Firebase CLI; web browser sign-in may be required.

Output is collected from child processes into the right-side console panel. Windows console encoding is set to UTF-8. The interface uses ASCII-only labels to avoid broken accents on machines with mismatched PowerShell encoding.

CLI alternatives: `npm start`, `npm run dev`, `npm test`, `npm run build`, `npm run lint`, `npm run status`, `npm run heroku:login`, `npm run firebase:login`, and `npm run deploy -- "commit message"`.
