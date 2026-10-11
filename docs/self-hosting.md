# Running Circuit on your own server

Circuit was built to deploy on Vercel, which does two things for free that
a self-hosted server has to set up itself: **calling the scheduled sweep**
and **running migrations over a direct database connection**. This page
covers both, plus the update routine.

## 1. Environment (`.env` on the server)

On top of the usual values (see `.env.example`), make sure these are set:

| Variable | What it's for |
| --- | --- |
| `DATABASE_URL` | The app's database connection. With Neon this is the **pooled** URL (host contains `-pooler`). |
| `DIRECT_URL` | Used only by `prisma migrate`. With Neon: the same URL with `-pooler` removed from the host. With a plain Postgres (no pooler): exactly the same as `DATABASE_URL`. |
| `CRON_SECRET` | Shared secret for the sweep. Generate one with `openssl rand -base64 32`. |
| `TRUSTED_PROXY_SECRET` | Only behind Cloudflare — see "The reverse proxy" below. |
| `NEXT_PUBLIC_APP_URL` | The site's public address (used in share links). |
| `PORT` | Only if the app doesn't run on 3000. |

### The reverse proxy, and how the app learns a visitor's IP

Rate limits on the routes anyone can call without signing in key on the
caller's address. No header can be trusted by itself — a caller can send any
of them — so `getClientIp` (`src/lib/rateLimit.ts`) decides like this:

1. **If `TRUSTED_PROXY_SECRET` is set and the request carries it** in
   `x-circuit-proxy-secret`, the app believes the header named by
   `TRUSTED_PROXY_IP_HEADER` (default `cf-connecting-ip`). This is the precise
   path, and the one to use behind Cloudflare: have Cloudflare inject the
   header with a Transform Rule (*Set static* → `x-circuit-proxy-secret`), and
   a caller who reaches the app directly cannot forge the address, because
   they don't have the secret.
2. **Otherwise it takes the last entry of `X-Forwarded-For`** — the address
   your proxy appended. So the proxy must append, not overwrite with a
   caller-supplied chain. Caddy does this by default; with nginx use
   `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, **not**
   `$remote_addr`.
3. **With neither, it is `"unknown"`** and every such request shares one
   bucket. Coarse, but it over-limits rather than under-limits.

The last-entry rule assumes exactly one proxy in front. Behind Cloudflare
*and* a local proxy the chain's last entry is Cloudflare's edge, not the
visitor — which is the case step 1 exists for.

Without `DIRECT_URL`, `npx prisma migrate deploy` stops with
"Environment variable not found: DIRECT_URL". Through a pooler it can also
hang with "Timed out trying to acquire a postgres advisory lock" — that's
why migrations connect directly.

## 2. The scheduled sweep (required)

Every couple of minutes something must call `/api/cron/sweep`. It:

- closes registration at the deadline and starts the bracket, round
  robin, Swiss or lobby (otherwise a tournament only starts if its cap
  fills);
- auto-accepts a result the other player never answered;
- escalates disputes the organizer didn't rule on in time;
- settles organizer revenue after the settlement window;
- checks with Paystack on withdrawals and prize payouts still processing
  after 30 minutes, and refunds entry fees paid after the player left.

`scripts/cron-sweep.mjs` does the call (it reads `CRON_SECRET` and talks to
`http://localhost:$PORT`, so it never leaves the machine). Pick **one** of:

**A. cron (Linux / macOS)** — `crontab -e`, then add (use your real path):

```cron
*/2 * * * * cd /path/to/circuit && /usr/bin/env node --env-file=.env scripts/cron-sweep.mjs >> logs/sweep.log 2>&1
```

(Create the `logs` folder first. Use the full path to `node` if cron can't
find it — `which node` shows it.)

**B. a long-running process** (pm2, Docker, or anywhere without cron):

```bash
pm2 start "node --env-file=.env scripts/cron-sweep.mjs --every 120" --name circuit-sweep
```

Check it's working with a one-off run from the Circuit folder:

```bash
npm run sweep
```

It prints `[sweep] … ok in …ms` on success. `HTTP 401` means the app and
the runner don't have the same `CRON_SECRET`; "couldn't reach" means the
app isn't running on that port (set `SWEEP_URL` if it's elsewhere).

## 3. Updating to a new version

From the Circuit folder:

```bash
git pull
npm install
npx prisma migrate deploy
npm run build
```

Then restart the app (and the sweep process, if you used option B).

If `migrate deploy` ever reports the advisory-lock timeout anyway (an
earlier run left the lock behind), release it and run it again:

```bash
npx prisma db execute --schema prisma/schema.prisma --stdin <<< "select pg_terminate_backend(pid) from pg_locks where locktype='advisory' and objid=72707369 and granted;"
```
