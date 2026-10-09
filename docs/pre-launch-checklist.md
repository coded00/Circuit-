# Circuit — pre-launch checklist (self-hosted)

For launching Circuit on your own server. [self-hosting.md](self-hosting.md)
has the full setup (sweep runner, direct DB URL, update routine); this page
is the go/no-go list to run through before real players and real money.

Tick every box. Anything marked **money** must pass before entry fees,
withdrawals or prizes are switched on.

---

## 1. The server

- [ ] **HTTPS on the public address.** Login cookies are `Secure` in
      production, so over plain `http://` nobody can stay signed in.
- [ ] **A reverse proxy in front of the app** (Caddy, nginx, or a
      Cloudflare Tunnel) that terminates HTTPS and passes the visitor's
      address in `X-Forwarded-For`. Rate limits (sign-in, sign-up, uploads)
      key on that header. Without it every visitor shares one limit, and a
      few failed logins lock everyone out. Don't expose port 3000 directly.
      The rate limiter reads the **last** entry of the chain, which is the
      address your proxy saw — so the proxy must **append** (`Caddy`'s
      default; nginx's `$proxy_add_x_forwarded_for`, *not*
      `proxy_set_header X-Forwarded-For $remote_addr`), never pass a
      caller-supplied value through untouched.
- [ ] **`TRUSTED_PROXY_SECRET` set, if you front the app with Cloudflare.**
      Cloudflare puts the visitor's real address in `CF-Connecting-IP` and
      overwrites anything the client sent — but only for traffic that went
      through Cloudflare. Anything that can reach the app directly could
      send that header itself, so the app believes it only when the request
      also carries the secret. Have Cloudflare inject a static header
      (Transform Rules → *Set static* → `x-circuit-proxy-secret`) with the
      same value, and set `TRUSTED_PROXY_SECRET` to it. Generate one with
      `openssl rand -base64 32`. Without it, Cloudflare-fronted deployments
      fall back to `X-Forwarded-For` — which, behind Cloudflare *and* a
      local proxy, names the Cloudflare edge rather than the visitor, so
      every visitor shares one limit.
- [ ] **The app restarts on its own** after a crash or reboot (pm2,
      systemd, or Docker `restart: unless-stopped`). It runs as
      `npm run build` then `npm start`.
- [ ] **The server clock is correct** (NTP on). Registration deadlines,
      report windows and settlement all run on it.

## 2. Environment (`.env` on the server)

`.env.example` lists every variable. For launch:

| Variable | Needed? | Notes |
| --- | :---: | --- |
| `DATABASE_URL` | **Yes** | Neon: the pooled URL (host has `-pooler`). |
| `DIRECT_URL` | **Yes** | For migrations. Neon: same URL without `-pooler`. Plain Postgres: same as `DATABASE_URL`. |
| `JWT_SECRET` | **Yes** | `openssl rand -base64 32`. Signs sessions and proof-file links. Changing it signs everyone out. |
| `NEXT_PUBLIC_APP_URL` | **Yes** | The public `https://` address. Used in payment callbacks, emails and share links. Rebuild after changing it. |
| `CRON_SECRET` | **Yes** | `openssl rand -base64 32`. The sweep runner and the app must share it. |
| `PAYSTACK_SECRET_KEY` | **Yes (money)** | `sk_live_…` for launch, `sk_test_…` while testing. Also verifies webhooks. There's no public key. Checkout is hosted by Paystack. |
| `RESEND_API_KEY` | **Yes** | Password-reset and notification emails, and it is what signup needs to issue a session — see the signup step below. Without it nothing is sent at all, and nobody can reset a password or verify an address. The fallback logs who the email was for and its subject, never the message itself: reset and verification links are in there, and a log is not a private place. |
| `REQUIRE_VERIFIED_EMAIL` | Optional | Players must verify their email before paid entry, staking, withdrawing or claiming a prize. Turns on by itself once `RESEND_API_KEY` is set; `true` / `false` forces it. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | If Google sign-in is on | The redirect URI in Google Cloud must be `https://<domain>/api/auth/google/callback`. |
| `YOUTUBE_API_KEY` | Optional | Videos on the homepage and admin Content page. |
| `ONESIGNAL_API_KEY` / `NEXT_PUBLIC_ONESIGNAL_APP_ID` | Optional | Browser push. In-app notifications work without it. |
| `SENTRY_DSN` | Recommended | Error alerts, including the money alerts below. Without it, errors only reach the server log. |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | Optional | Product analytics. |
| `R2_*` / `S3_*` | Optional | Proof screenshots go to `storage/proof/` on the server's disk unless a bucket is set. That's fine on one server; just back the folder up (§6). |
| `FLUTTERWAVE_*` | No | Paystack is the only provider in use. |

- [ ] Every **Yes** above is set. Open `https://<domain>/api/health`: signed
      out it says `"healthy"` and nothing more, which is all an uptime monitor
      needs and all anyone else gets (security audit #16 — it used to describe
      the deployment to whoever asked).
- [ ] **Sign in as the admin, then reload it.** A staff session gets the rest:
      the database `"connected"`, and `paystack` and `resend` `true`. This is
      the step that catches a variable you set with a typo in its name — the
      app is running, but it can't see the key.
- [ ] Also worth a glance while you're there: `cronSecret` should be `true`.
      `false` means `/api/cron/sweep` refuses everyone, so the sweep in §4 is
      not running.

## 3. Database

- [ ] `npx prisma migrate deploy` has run against production, and
      `npx prisma migrate status` says **"Database schema is up to date!"**
- [ ] Automated backups are on. Neon: check the history retention window
      on the project. Plain Postgres: a nightly `pg_dump` kept off the
      server.

## 4. The sweep (required)

Something must call `/api/cron/sweep` every 2 minutes. `scripts/cron-sweep.mjs`
does it; set it up with cron or pm2 as shown in
[self-hosting.md §2](self-hosting.md#2-the-scheduled-sweep-required). Without
the sweep:

- tournaments don't start at their deadline;
- unanswered results aren't auto-accepted;
- disputes don't escalate;
- organizer revenue isn't settled;
- **money** stuck transfers and late payments aren't reconciled (§5).

Checks:

- [ ] `npm run sweep` prints `[sweep] … ok in …ms`. `HTTP 401` means the
      `CRON_SECRET` values don't match.
- [ ] Wait 5 minutes, then check the sweep log (cron: `logs/sweep.log`;
      pm2: `pm2 logs circuit-sweep`). It should have fired about twice.

## 5. Paystack (money)

**Webhook.** In Paystack: **Settings → API Keys & Webhooks**. Set the live
webhook URL to:

```
https://<domain>/api/webhooks/paystack
```

Paystack sends every event to that one URL. Circuit acts on these and
ignores the rest:

| Event | What Circuit does |
| --- | --- |
| `charge.success` | Confirms the entry fee or wallet deposit (re-checked with Paystack first). A payment that lands after the player withdrew, or after they started a new checkout, is refunded automatically. |
| `transfer.success` | Marks the withdrawal or prize payout complete. |
| `transfer.failed`, `transfer.reversed` | Withdrawal: the money goes back into the player's wallet. Prize: the payout reopens so the winner can claim again. Both are told. |
| `refund.processed`, `refund.failed` | Marks the entry-fee refund done or failed. A failed refund appears on the admin Overview under **Refunds that failed** and needs a person. |

Each event is applied once, even if Paystack retries it. If a webhook never
arrives, the sweep asks Paystack about any transfer still processing after
30 minutes — and if one is *still* unsettled a day later, the sweep raises
**"Money stuck: transfers still pending after a day"** rather than leaving it
to be noticed. Turn that alert on in Sentry (below).

Flutterwave is legacy and read-only here — `FLUTTERWAVE_SECRET_KEY` is
unset, so its webhook route refuses everything and no new charge or
transfer is ever created on it. If you ever re-enable it, its webhook
handles charges and transfers; its refunds have no webhook to subscribe
to and still settle through the sweep, like any missed webhook.

**Account set-up:**

- [ ] **Transfers are enabled** on the Paystack account (a business
      verification step). Withdrawals and prize payouts need it.
- [ ] **Transfer OTP is turned off** (Settings → Preferences). With OTP
      on, every payout waits for a code nobody enters and stays
      "Processing".
- [ ] **The Paystack balance is funded.** Transfers come from the
      balance, not from incoming charges that haven't settled yet.

**Test-mode run-through** (with `sk_test_…` and the test webhook URL set
the same way; Paystack's test cards are on its docs site):

- [ ] Link a bank account on `/account`. It should show the verified
      account name.
- [ ] Pay an entry fee on a ₦500 tournament. It shows **Confirmed**, and
      `/admin/finance` shows the entry fee **Complete**.
- [ ] Fund the wallet, then withdraw. The withdrawal ends **Complete** in
      `/admin/finance` (not stuck on Processing).
- [ ] Finish a tournament with a prize, then claim it as the winner. The
      payout ends **Complete**.
- [ ] Cancel a paid tournament. The entry fee shows a **Refund** row.
- [ ] Only after all of that: swap in `sk_live_…`, set the live webhook
      URL, and do one real ₦100 deposit and withdrawal.

## 6. Backups beyond the database

- [ ] `storage/proof/` (match proof screenshots) is backed up, unless an
      R2/S3 bucket is configured.
- [ ] A copy of the production `.env` is stored somewhere safe, off the
      server. Losing `JWT_SECRET` signs everyone out and breaks existing
      proof links.

## 7. Accounts and admin

- [ ] Your own account is **Super Admin** (admin → Settings → Admin
      users). A second staff member is a Moderator or Super Admin, so
      disputes don't wait on one person.
- [ ] Test and seed accounts are removed or suspended.
- [ ] The platform fee and maintenance mode are set in admin → Settings.

## 8. Smoke test on the live site

- [ ] Sign up with email. With `RESEND_API_KEY` set, signup **does not sign
      you in** — it ends on "Check your email". That is deliberate: the same
      screen is shown whether or not the address was already registered, so
      nobody can use signup to discover who has an account. Open the link in
      the email, log in, and you should land in the first-run flow. Google
      sign-in is unaffected, because Google has already verified the address.
- [ ] Sign out, then reset the password. The reset email arrives.
- [ ] Google sign-in works (if enabled).
- [ ] Create a free tournament, register two accounts, and let the
      deadline pass. Within about 2 minutes the sweep starts the bracket.
      Report a result from one side, dispute it from the other, then rule
      it in admin → Disputes.
- [ ] Upload a proof screenshot and open it as the other player. It loads.
- [ ] Admin Overview shows **All clear** once the test is tidied up.

## 8b. Marketplace (if it is switched on)

- [ ] Migrations applied through `20261005100000_listing_delivery_url`
      (listings, orders, featured picks, instant-download links).
- [ ] Only staff can sell for now. Stock it from admin → Marketplace; the
      nine placeholder products from development are removed.
- [ ] **Order emails** (receipt, delivered, refunded) need `RESEND_API_KEY`.
      Without it nothing is sent, and the fallback names only the recipient
      and the subject — the body carries the instant-download link.
- [ ] Instant-download ebooks: the file is hosted outside Circuit and the
      link is only ever revealed to people who bought it, but a buyer can
      still see where it points. Host files somewhere that lets you expire
      or rotate links, and change the link in admin if one leaks.
- [ ] Buy one item with a test account, deliver it from admin → Marketplace
      → Orders, then refund it. The wallet balance returns and the buyer's
      download stops.

## After launch

- [ ] Check admin **Overview → Needs attention** daily. **Refunds that
      failed**, and payouts or withdrawals processing for more than a day,
      are real money waiting on someone.
- [ ] If Sentry is set, turn on alerts for these messages: "Withdrawal
      succeeded after it was marked failed", "Entry-fee refund failed at
      the provider", "Paystack webhook rejected: invalid signature", and
      "Money stuck: transfers still pending after a day".
