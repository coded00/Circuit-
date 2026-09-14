// Driver for Circuit (Next.js web app). Run under headless Chromium via
// Playwright since `chromium-cli` isn't installed in this environment —
// this is the same nav/wait-for/screenshot/click/fill/console vocabulary,
// hand-rolled with `playwright` (pinned in this dir's own package.json so
// ESM `import "playwright"` resolves — Node's ESM loader does NOT honor
// NODE_PATH/npx's temp install the way CommonJS `require` does).
//
// REPL driver: run it, type commands at the `driver>` prompt, or pipe a
// heredoc of commands on stdin (see SKILL.md). Designed for tmux
// send-keys/capture-pane iteration, same shape as the Electron REPL
// pattern in run-skill-generator's examples/electron.md.
import { chromium } from "playwright";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";

const APP_DIR = path.resolve(import.meta.dirname, "../../.."); // .claude/skills/run-circuit -> circuit/
const SHOT_DIR = process.env.SCREENSHOT_DIR || "/tmp/circuit-shots";
fs.mkdirSync(SHOT_DIR, { recursive: true });

const BASE_URL = process.env.CIRCUIT_BASE_URL || "http://localhost:3000";
const VIEWPORTS = {
  desktop: { width: 1440, height: 950 },
  mobile: { width: 390, height: 844 },
};

let browser = null;
let contexts = {}; // viewport name -> BrowserContext
let pages = {}; // viewport name -> Page
let currentViewport = "desktop";
const consoleErrors = [];

function page() {
  return pages[currentViewport];
}

async function ensureContext(viewport) {
  if (!browser) browser = await chromium.launch();
  if (!contexts[viewport]) {
    contexts[viewport] = await browser.newContext({ viewport: VIEWPORTS[viewport] });
    const p = await contexts[viewport].newPage();
    p.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(`[${viewport}] ${msg.text()}`);
    });
    p.on("pageerror", (err) => consoleErrors.push(`[${viewport}:pageerror] ${err.message}`));
    pages[viewport] = p;
  }
  return pages[viewport];
}

const COMMANDS = {
  async viewport(name) {
    name = (name || "").trim();
    if (!VIEWPORTS[name]) return console.log("usage: viewport <desktop|mobile>");
    await ensureContext(name);
    // share cookies from whichever context already has a session
    const other = name === "desktop" ? "mobile" : "desktop";
    if (contexts[other]) {
      const cookies = await contexts[other].cookies();
      if (cookies.length) await contexts[name].addCookies(cookies);
    }
    currentViewport = name;
    console.log("viewport ->", name, VIEWPORTS[name]);
  },

  async nav(urlPath) {
    const p = await ensureContext(currentViewport);
    const url = (urlPath || "/").startsWith("http") ? urlPath : BASE_URL + (urlPath || "/");
    await p.goto(url, { waitUntil: "networkidle" });
    console.log("nav ->", url);
  },

  async ss(name) {
    const p = page();
    if (!p) return console.log("ERROR: nav first");
    const f = path.join(SHOT_DIR, (name || `ss-${currentViewport}-${Date.now()}`) + ".png");
    await p.screenshot({ path: f });
    console.log("screenshot:", f);
  },

  // Accepts a CSS selector, or chromium-cli-style `text=Foo`.
  async click(sel) {
    const p = page();
    if (!p) return console.log("ERROR: nav first");
    const locator = sel.startsWith("text=") ? p.getByText(sel.slice(5), { exact: false }) : p.locator(sel);
    await locator.first().click();
    console.log("click", sel, "-> OK");
  },

  async fill(args) {
    const p = page();
    if (!p) return console.log("ERROR: nav first");
    const [sel, ...rest] = args.split(" ");
    await p.fill(sel, rest.join(" "));
    console.log("fill", sel, "-> OK");
  },

  async press(key) {
    const p = page();
    if (p) await p.keyboard.press(key);
  },

  async "wait-for"(sel) {
    const p = page();
    if (!p) return console.log("ERROR: nav first");
    const locator = sel.startsWith("text=") ? p.getByText(sel.slice(5), { exact: false }) : p.locator(sel);
    try {
      await locator.first().waitFor({ timeout: 10_000 });
      console.log("found:", sel);
    } catch {
      console.log("TIMEOUT:", sel);
    }
  },

  async text(sel) {
    const p = page();
    if (!p) return console.log("ERROR: nav first");
    console.log(await (sel ? p.locator(sel).first() : p.locator("body")).innerText());
  },

  // Circuit-specific: signup is a client-side router.push()+refresh(), not
  // a full navigation — waitForLoadState("networkidle") after the click
  // resolves BEFORE the redirect lands. Use waitForURL instead (see
  // SKILL.md Gotchas). Only #emailOrPhone/#password exist on this form.
  async signup(args) {
    const p = page();
    if (!p) return console.log("ERROR: nav first");
    const [email, pass] = (args || "").split(" ");
    const useEmail = email || `driver-check-${Date.now()}@example.com`;
    const usePass = pass || "TestPassword123!";
    await p.goto(BASE_URL + "/signup", { waitUntil: "networkidle" });
    await p.fill("#emailOrPhone", useEmail);
    await p.fill("#password", usePass);
    await Promise.all([
      p.waitForURL((u) => !u.pathname.startsWith("/signup"), { timeout: 15_000 }),
      p.click('button[type="submit"]'),
    ]);
    await p.waitForLoadState("networkidle");
    console.log("signed up:", useEmail, "-> now at", p.url());
  },

  "console-errors"() {
    console.log(consoleErrors.length ? consoleErrors.join("\n") : "(none)");
  },

  async quit() {
    if (browser) await browser.close().catch(() => {});
    browser = null;
    contexts = {};
    pages = {};
  },

  help() {
    console.log("commands:", Object.keys(COMMANDS).join(", "));
  },
};

// Plain process.stdin (unlike the Electron REPL pattern this is adapted
// from, nothing here steals stdin, so the `/dev/stdin` fd workaround
// isn't needed — and on macOS it caused an immediate EOF/close when
// stdin was a piped heredoc rather than a tty).
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "driver> " });

// Commands run async (page.goto, clicks, ...). readline's 'line' event
// fires for every buffered line as soon as it arrives (e.g. a whole
// heredoc piped to stdin) WITHOUT waiting for a prior async handler to
// finish, so naive `rl.on('line', async ...)` runs every command
// concurrently and races (a `nav` can execute before the `viewport` above
// it has finished creating the page). Chain onto one promise so each line
// only starts once the previous one's command has fully resolved.
//
// Second gotcha, specific to piping a heredoc (as opposed to an
// interactive tty): stdin hits EOF and readline fires 'close' as soon as
// all lines have been *handed to the 'line' event*, which is WAY before
// this queue has actually finished running them (each command is async
// and slow — launching a browser, navigating, etc). The 'close' handler
// below must await the same queue before exiting, or the process dies
// mid-command with zero output — which is exactly what happened the
// first time this driver was tested against a heredoc.
let queue = Promise.resolve();
rl.on("line", (line) => {
  queue = queue.then(async () => {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    if (!cmd) return;
    const fn = COMMANDS[cmd];
    if (!fn) {
      console.log("unknown:", cmd, "- try: help");
      return;
    }
    try {
      await fn(rest.join(" "));
    } catch (e) {
      console.log("ERROR:", e.message);
    }
    if (cmd === "quit") rl.close();
    else if (!rl.closed) rl.prompt();
  });
});
rl.on("close", async () => {
  await queue.catch(() => {}); // let every already-queued command finish first
  await COMMANDS.quit();
  process.exit(0);
});

console.log("circuit driver -", APP_DIR, "- 'help' for commands, 'nav /' to start");
rl.prompt();
