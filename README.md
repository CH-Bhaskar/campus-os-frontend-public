# Campus OS frontend

The starter app every team builds on. It comes with a themed app shell, Login and Register screens, and
**one folder per feature track**. Your team builds one track without touching shared code.

Stack: Vite, React 19, TypeScript, React Router 7, CSS Modules, Vitest + Testing Library, and Playwright.

## Participant setup

### Before you start

- **Node.js 24** (or 22.12+) and npm: check with `node -v`.
- **Git**, and a **GitHub account**.
- **Your participant code** from the organizers, e.g. `T07-P3-K7Q2-M9XD`. Each person gets their own code.
  Don't share it with teammates.

### 1. Fork the repo (one person per team)

One teammate does this:

1. Open https://github.com/achal-codes/campus-os-frontend-public and click **Fork** (top right).
2. Under **Owner**, pick your account or your team's organization. Name it something like `campus-os-team-07`.
3. Click **Create fork**.
4. In your fork, go to **Settings → Collaborators → Add people** and add each teammate's GitHub username.
   Teammates must accept the email invite before they can push.

### 2. Clone your team's fork (everyone)

Every teammate clones the **fork**, not the original repo:

```bash
git clone https://github.com/<owner>/<your-fork-name>.git
cd <your-fork-name>
```

### 3. Install dependencies

```bash
npm install
npx playwright install chromium   # once, for the E2E tests
```

`npm install` also sets up the git hooks and the AI-usage tracker (see [AI usage tracking](#ai-usage-tracking)).
Don't use `--ignore-scripts`, or the hooks won't be installed.

If it asks you to reload your editor windows, do that.

### 4. Register your machine

Run this once on each laptop with **your own** code:

```bash
npm run telemetry:register -- T07-P3-XXXX-XXXX
```

Read the notice it prints and answer `y`. You should see `Registered T07-P3 (team T07) ... Happy hacking!`.

**Until you register, `git commit` is blocked.** If you see "Commit blocked: this machine is not registered",
run the command above.

### 5. Run it

```bash
npm run dev    # http://localhost:5173
```

### 6. Create your team's track

One teammate runs this, commits and pushes. Everyone else pulls.

```bash
npm run new-track lost-and-found -- --team "Team 7"
git add src/tracks/lost-and-found
git commit -m "Add lost-and-found track"
git push
```

Use your track's name instead of `lost-and-found` (kebab-case). The track shows up on the home grid and at
`/tracks/lost-and-found`. Do all your work inside `src/tracks/<your-track>/`.

### Setup checklist

- [ ] `node -v` prints v22.12 or newer
- [ ] Cloned your team's fork (`git remote -v` shows the fork, not `achal-codes/campus-os-frontend-public`)
- [ ] `npm install` finished without errors
- [ ] `npm run telemetry:register -- <code>` printed "Registered"
- [ ] `npm run dev` opens the app at http://localhost:5173
- [ ] A test commit works: `git commit --allow-empty -m "setup check"`

### Troubleshooting

| Problem | Fix |
|---|---|
| `Commit blocked: this machine is not registered` | `npm run telemetry:register -- <your code>` |
| `"..." is not a valid participant code` | Check for typos. The format is `T07-P3-XXXX-XXXX` (letters and digits, uppercase). |
| Registered with the wrong code | `npm run telemetry:register -- <right code> --force` |
| `Permission denied` on `git push` | Accept the collaborator invite from your fork's owner, and check you cloned the fork. |
| Git hooks didn't run | Run `npm install` again (without `--ignore-scripts`). |

## Project layout

```
src/
  app/          App shell: routes, layouts, home grid             (organizers)
  core/         Auth (provider, guard, service) + track registry (organizers)
  theme/        Design tokens + light/dark ThemeProvider          (organizers)
  ui/           Shared components: Button, TextField, Card, ...   (organizers)
  features/     Login and Register screens                       (organizers)
  tracks/
    _template/  Copied by `npm run new-track`; never bundled
    example/    Reference track: screens, fake API, unit + E2E tests
    <your-id>/  ← your team works here
  test/         renderWithProviders / renderRoute helpers
e2e/            Core E2E specs, page objects, shared fixtures
```

### Track rules (enforced by `src/core/tracks/__tests__/boundaries.test.ts`)

1. Import only from `@/ui`, `@/theme`, `@/core`, npm packages and your own folder. Never import from another
   track or from `src/features`. Tests may also import `@/test`.
2. The track `id` is kebab-case and matches the folder name.
3. Style with theme tokens (`var(--color-primary)`, `var(--space-4)`, ...), never raw hex values.
4. Prefix test ids with your track id: `data-testid="lost-and-found-item"`.

## Commands

| Command | What it runs |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm test` | All Vitest unit/component tests |
| `npm run test:e2e` | Playwright E2E tests (starts the dev server itself) |
| `npm run test:track <id> [-- --e2e]` | Only one track's tests |
| `npm run lint` / `npm run typecheck` | oxlint / tsc |

## AI usage tracking

This repo records how AI tools are used while you build: which files each tool changed, line and token counts,
AI vs human lines per commit, and the prompts you send to AI coding tools in this repo. Your code itself is not
sent. Don't put passwords or personal data in prompts. Data goes only to the organizers' server.

Claude Code, Cursor, Gemini CLI, Antigravity and OpenCode work with no extra setup. For **Codex CLI**, trust the
project when prompted, then approve the hooks with `/hooks`. Questions? Ask an organizer.
