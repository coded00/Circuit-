# Circuit: dependency triage

Written 2026-10-11, against a clean `npm ci` on `main`, and **re-checked
later the same day** after five dependency PRs landed (#40, #41, #42,
#43 — `next` 16.4.0, `react` 19.3.0, `jose` 6, `eslint` 10,
`framer-motion` 14). Re-run it the same way — see "Re-running this" at
the end. Everything below is a claim about the tree as it stood at that
commit, and dependency trees rot.

`npm audit` reports **8 high, 0 critical**, down from 11. Three were
fixable without breaking anything and have been. The other eight cannot
be fixed at all right now, for reasons that are all upstream, and are
recorded here so that the next person does not re-derive them from a red
CI badge.

The re-check is the part worth reading twice. Those five PRs replaced
most of the tree — including the whole ESLint chain this document blames
for five of the eight — and the audit came back with **the same eight,
from the same two root advisories, and the same two bogus downgrades on
offer**. Nothing cleared and nothing new appeared. So these conclusions
survived a large upgrade rather than holding only for the tree they were
written against.

## What the three that were fixed actually were

Taken by a plain `npm audit fix`, which is the only form of that command
this repo should ever run. It moved 11 to 8.

| Package | From | To | Where it lives |
|---|---|---|---|
| `sharp` | 0.35.4 | 0.35.5 | **Runtime** — `storePublicImage` (`src/lib/uploads.ts`) |
| `source-map-js` | 1.2.1 | 1.2.2 | Build — postcss, via Tailwind and Next |
| `brace-expansion` | 1.1.18 and 5.0.9 | 1.1.21 and 5.0.12 | Dev — the ESLint chain, two copies |

`sharp` is the only one of the eleven that sits in the request path, and
it is worth being precise about why its advisory
([GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w),
a librsvg flaw) is nonetheless close to unreachable here. It has exactly
two call sites, and both are safe for the same reason:

- `storePublicImage` (`src/lib/uploads.ts`), on upload.
- `/api/images/[ref]` — unauthenticated, and the one that resizes on
  demand. This is where a remote risk would actually live, and it reads
  only what upload already accepted.

librsvg is sharp's SVG renderer, and SVG never reaches sharp: every upload
is typed from its own first bytes by `sniffImageType`
(`src/lib/imageSniff.ts`), which returns only PNG, JPEG, GIF or WebP and
explicitly refuses SVG because it can carry script. Anything in storage
therefore already passed that check, which is what makes the
unauthenticated route safe to serve from. `next/image` — the other thing
that would hand sharp a file — is not used anywhere in `src/`.

So the bump is a free patch rather than a fix for an open door, and it
was still worth taking: it costs nothing and it is one less thing to
reason about.

Note that this one is a *transitive* dependency of `next`. Nothing in
`package.json` declares it, which matters for the section below.

## The eight that cannot be fixed

All eight are **dev and build only**. None ships in the production
bundle. Every one of the advisories is a denial-of-service triggered by
crafted input, and in each case the input would be our own source or our
own `prisma` config, not anything a player can send.

### The ESLint chain — five of the eight

`eslint-config-next` and `@next/eslint-plugin-next` (both 16.4.0,
on `eslint` 10.12.0), with `fast-glob` and `micromatch` flagged only
because they carry `braces`. This section was written against 16.3.8 on
`eslint` 9 and re-checked after both moved — the chain is unchanged:
`braces` 3.0.3 → `micromatch` 4.0.8 → `fast-glob` 3.3.1 →
`@next/eslint-plugin-next` → `eslint-config-next`. Upgrading the whole
lint stack changed nothing about it.

- `braces` is vulnerable at `<=3.0.3`, and **3.0.3 is the newest version
  published**. There is no patched release to move to. This is why npm
  reports its vulnerable range as `*`.
- `@next/eslint-plugin-next` is vulnerable at `>=14.3.0-canary.0` — that
  is every version since 14.3 went to canary. Again, no patched release.

So this one waits on Next. It will clear when they ship a plugin that
drops the old `fast-glob` chain.

### The Prisma CLI — three of the eight

`prisma` and `@prisma/config` (both 6.19.3), with `deepmerge-ts` flagged
because `@prisma/config` depends on the 7.x line and the advisory covers
`<8.0.0`.

- `@prisma/config` is vulnerable at `6.13.0-dev.1 - 8.1.0-dev.4`. Every
  version anyone would actually install is inside that range.

`@prisma/client` — the part that runs in production — is **not** flagged.
This is the CLI: migrations and `prisma generate`. It waits on Prisma.

## TypeScript stays on 5, and that is not this repo's decision

`typescript` is `^5` in `package.json` and has to stay there for now.
Dependabot opened the bump to TypeScript 7
([#44](https://github.com/Circuit-OurCircuit/circuit/pull/44)) and it was
closed, because `eslint-config-next` depends on `typescript-eslint`,
which hard-refuses TS 7.0 and exits 2:

```
Error: typescript-eslint does not support TS 7.0.
    at .../eslint-config-next/node_modules/typescript-eslint/dist/index.js:52:11
```

Nothing on this side makes that PR green. The `package-lock.json`
conflict a rebase would have cleared was incidental — the lint step dies
on the same line either way. It waits on `typescript-eslint` supporting
TS 7 (tracked in `typescript-eslint/typescript-eslint#10940`, aimed at
TS >= 7.1) and on `eslint-config-next` picking that release up.
Dependabot will open a fresh PR when it does, so closing cost nothing.

Recorded here because it is the same shape as the eight above: a
toolchain upgrade that reads as routine in a PR list and is in fact
blocked upstream, with no signal on our side except a red check.

## Do not run `npm audit fix --force`

This is the reason it is worth writing all of the above down. For the
eight, npm does offer a fix, and it is a downgrade:

- `eslint-config-next@14.2.35` — Next 14's lint config, on a Next 16 app
- `prisma@6.12.0` — a Prisma CLI older than the `@prisma/client` at 6.19.3
  it has to match

Both are marked `isSemVerMajor: true` and appear only under `--force`.
Never take them. They would replace eight dev-only advisories that cannot
be triggered with a broken lint setup and a CLI that disagrees with the
client about migrations.

Re-checked on the refreshed tree, and it is still exactly these two —
same targets, same `isSemVerMajor: true`, all eight advisory entries
pointing at one or the other. A `--force` that was wrong before is no
more right for having survived an upgrade.

## Dependabot: what it will and will not do here

Alerts are on (see `.github/dependabot.yml` and the repository's
security settings), so these eight are visible under **Security →
Dependabot alerts** rather than hidden.

The weekly version-update config will **not** clear the three that were
fixed by hand, and would not have found them: it only updates what
`package.json` declares, and `sharp`, `source-map-js` and
`brace-expansion` are all transitive. Automated *security* updates are a
different mechanism — those can reach an indirect dependency — so they
are the only thing that would have caught the `sharp` bump on its own.

That is the argument for turning them on. The cost is bounded: for the
eight above there is no compatible patched version for Dependabot to move
to, so it has nothing to open, and it does not propose downgrades.

**What it has actually done so far.** The first batch arrived 2026-10-11:
five PRs — one group of twelve minor and patch updates, plus majors for
`jose`, `framer-motion`, `eslint` and `typescript`. Four merged; the
`typescript` one was closed (see above). It did not touch `sharp`,
`source-map-js` or `brace-expansion` — all three are still at the
versions the manual fix left them at, which is the prediction in the
paragraph above holding up in practice.

Worth noting from that batch: the majors arrive looking like the group
does. The group PR is genuinely routine, but its green check and its
"minor and patch" title sit in the same list as a `jose` major that
touches session signing. Read the majors.

## Re-running this

```
npm ci                 # a clean tree; the audit reads package-lock.json
npm audit              # the summary
npm audit fix          # non-forced only — see above
npm audit              # what is left
```

Then check the remaining ones the same way: does a patched version exist
at all, and does the flag sit in production or in the toolchain. The
answer for all eight above is "no, and in the toolchain", and the moment
it changes is the moment Next or Prisma ships a release.

Re-read this after a batch of dependency PRs lands, not on a schedule.
Both of the things this document warns about — the eight, and the
`--force` downgrades — were re-checked after five such PRs and came back
identical, which is the useful kind of boring. The one thing that *did*
move was a version number in a heading, and that is the sort of drift
that makes a stale document worse than none.
