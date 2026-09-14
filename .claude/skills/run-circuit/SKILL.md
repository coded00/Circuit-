---
name: run-circuit
description: Build, run, and drive Circuit (the Next.js tournament/Battle platform). Use when asked to start Circuit, run its dev server, take a screenshot of its UI, sign up/log in and check a page, or verify a frontend change actually renders.
---

Circuit is a Next.js (App Router) + Prisma/Postgres web app — there's no
desktop window and `chromium-cli` isn't installed in this environment, so
it's driven via `.claude/skills/run-circuit/driver.mjs`, a small
Playwright-based REPL (same nav/click/fill/screenshot vocabulary
`chromium-cli` would give you, hand-rolled because that tool isn't
available here). All paths below are relative to the repo root
(`/Users/solomonodetunde/Dev/circuit`).

## Prerequisites

Node (tested on v24.19.0) and a reachable Postgres database. No OS
packages needed — this is a plain web app, not Electron, so no
xvfb/libgtk/etc.

`.env` at the repo root must have `DATABASE_URL` (Postgres) and
`JWT_SECRET` set at minimum — both are already present in this repo's
`.env` (a Neon Postgres instance with real test data already in it:
tournaments/battles named things like "Paid Test Cup", "Test Game A/B").
Payment keys (`PAYSTACK_*`/`FLUTTERWAVE_*`) are also already set but
aren't needed just to browse/sign up.

## Setup

```bash
npm install                 # repo root — app deps
npx prisma generate         # repo root — Prisma client (needed once, or after a schema change)

cd .claude/skills/run-circuit
npm install --no-save       # installs this skill's own local `playwright` — see Gotchas for why
npx playwright install chromium   # one-time per machine (~140MB); caches in ~/Library/Caches/ms-playwright
```

## Run (agent path)

1. Start the dev server in the background and wait for it to actually respond (macOS has no GNU `timeout`, so poll manually):

```bash
cd /Users/solomonodetunde/Dev/circuit
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill   # free the port if a previous run is still up
(npm run dev > /tmp/circuit-dev.log 2>&1 &)
i=0; until curl -sf http://localhost:3000 >/dev/null 2>&1 || [ $i -ge 40 ]; do sleep 1; i=$((i+1)); done
curl -sf http://localhost:3000 >/dev/null && echo "SERVER UP" || (echo "SERVER FAILED"; tail -50 /tmp/circuit-dev.log)
```

2. Drive it by piping commands to the driver (one-shot) or running it interactively:

```bash
cd /Users/solomonodetunde/Dev/circuit
SCREENSHOT_DIR=/tmp/circuit-shots node .claude/skills/run-circuit/driver.mjs <<'EOF'
viewport desktop
nav /
ss home-desktop
viewport mobile
nav /
ss home-mobile
signup
viewport desktop
nav /
ss home-loggedin
console-errors
quit
EOF
```

Screenshots land in `$SCREENSHOT_DIR` (default `/tmp/circuit-shots`) as
`<name>.png`. **Always actually look at the screenshot** — a page can
render its shell while a data fetch fails silently.

For iterative work, drop the heredoc and run it as a real REPL (or under
tmux `send-keys`/`capture-pane` if you need to interleave with other
shell output):

```bash
node .claude/skills/run-circuit/driver.mjs
driver> nav /battles
driver> ss battles
```

| command | what it does |
|---|---|
| `viewport <desktop\|mobile>` | switch context (1440×950 / 390×844); shares cookies with the other viewport so a `signup`/`login` on one carries over |
| `nav <path>` | goto `http://localhost:3000<path>` (or a full URL), waits for network-idle |
| `ss [name]` | screenshot the current page to `$SCREENSHOT_DIR/<name>.png` |
| `click <selector>` | Playwright locator click; `text=Foo` does a text-match instead of a CSS selector |
| `fill <selector> <text>` | fill an input |
| `press <key>` | keyboard press (e.g. `Enter`) |
| `wait-for <selector>` | wait up to 10s for an element (same `text=` support as `click`) |
| `text [selector]` | print an element's (or the whole page's) innerText — quick way to verify content without a screenshot |
| `signup [email] [password]` | fills and submits `/signup` (defaults to a generated email); see Gotchas for why this isn't just `click` + `wait-for` |
| `console-errors` | print every `console.error`/uncaught page error seen so far across both viewports |
| `quit` | close the browser |

3. Stop the server when done: `lsof -ti:3000 -sTCP:LISTEN | xargs -r kill`.

## Run (human path)

```bash
npm run dev   # repo root
```

Open `http://localhost:3000`. Ctrl-C to stop. Sign up (email/password
only — no OAuth exists) to see the logged-in nav (sidebar's "More"
section, avatar menu, dashboard).

## Test

There's no automated test suite in this repo (no `test` script in
`package.json`) — the closest things to a correctness check are:

```bash
npx tsc --noEmit   # type-check
npx eslint src     # lint
```

Both should be clean before calling a frontend change done.

## Gotchas

- **Node's ESM loader ignores `NODE_PATH`.** `npx playwright ...` fetches
  the package into a throwaway npx cache that plain `node --input-type
  driver.mjs` (or `import "playwright"` from a `.mjs` file) can't resolve
  — you get `ERR_MODULE_NOT_FOUND` even though `npx playwright
  --version` works fine. Fix: `playwright` is a real local dependency of
  *this skill directory* (its own tiny `package.json`), not the app —
  that's why `driver.mjs` imports cleanly.
- **macOS has no `timeout`/`gtimeout` by default.** Don't script a wait
  loop around it. Poll manually (`until curl ...; do sleep 1; done` with
  a manual counter), as shown above.
- **Signup is a client-side `router.push()` + `router.refresh()`, not a
  full navigation.** If you `click` the submit button and then
  `waitForLoadState("networkidle")`, it resolves *before* the redirect
  actually lands — you'll screenshot the still-on-`/signup` page and
  think the flow is broken. The driver's `signup` command instead does
  `waitForURL(u => !u.pathname.startsWith("/signup"))` racing against the
  click. Apply the same pattern to any other client-side-nav flow you
  drive by hand.
- **Two elements on the homepage both render the text "More".** The
  sidebar's own "More" disclosure (`AppSidebar`/`MoreMenu`) and the
  disabled "Connect Your Accounts" row's overflow button. A bare
  `click text=More` is ambiguous — scope it, e.g. `click aside >>
  text=More` to hit the sidebar one specifically.
- **`/dashboard`, `/staff/*` etc. redirect to `/login` for a guest.**
  That's correct auth-gating, not a bug — `signup` first if you need to
  see them.

## Troubleshooting

- **`browserType.launch: Executable doesn't exist ...`**: Chromium
  wasn't downloaded on this machine yet. Run `npx playwright install
  chromium` inside `.claude/skills/run-circuit/` (see Setup).
- **Driver prints the startup banner then exits with zero output** when
  you pipe it a heredoc: this was a real bug hit and fixed while building
  this skill (readline's `close` event fires as soon as heredoc stdin
  hits EOF, which is *before* the queued async commands actually finish
  running — the fix, already in `driver.mjs`, is awaiting the same
  command queue inside the `close` handler before exiting). If you see
  this again after editing the driver, you likely reintroduced that
  race — check the comment above the `rl.on("close", ...)` handler.
