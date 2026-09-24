# Circuit — Immediate Pre-Launch & Production Deployment Checklist

This runbook covers the exact steps required to deploy Circuit from source into production on Vercel with a hosted PostgreSQL database (Neon, Supabase, or Railway) and Cloudflare R2 object storage.

---

## 1. Production Architecture Overview

```
                          ┌──────────────────────────┐
                          │   Client Browser / PWA   │
                          └─────────────┬────────────┘
                                        │ HTTPS
                                        ▼
                          ┌──────────────────────────┐
                          │     Vercel Platform      │
                          │   - Next.js App Router   │
                          │   - Standalone Output    │
                          │   - Vercel Cron (Sweep)  │
                          └───────┬───────────┬──────┘
                                  │           │
         ┌────────────────────────┼───────────┼────────────────────────┐
         │                        │           │                        │
         ▼                        ▼           ▼                        ▼
┌──────────────────┐    ┌─────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   PostgreSQL     │    │  Cloudflare R2  │ │  Paystack / FW   │ │ Sentry / PostHog │
│ (Supabase/Neon)  │    │  (Match Proofs) │ │  (Payments)      │ │ (Observability)  │
└──────────────────┘    └─────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## 2. Environment Variables Matrix

Configure these in **Vercel Project Settings > Environment Variables** (or `.env.production`):

| Variable | Required? | Source / Description |
| :--- | :---: | :--- |
| `DATABASE_URL` | **YES** | Postgres connection pooling URI with `?pgbouncer=true` or direct connection string. |
| `JWT_SECRET` | **YES** | Generate via `openssl rand -base64 32`. Signs player session cookies and storage tokens. |
| `NEXT_PUBLIC_APP_URL` | **YES** | Production domain with HTTPS, e.g. `https://circuit.gg`. |
| `CRON_SECRET` | **YES** | Generate via `openssl rand -base64 32`. Vercel Cron uses this to authenticate sweeps. |
| `PAYSTACK_SECRET_KEY` | **YES** | Paystack Live Secret Key (`sk_live_...`). Required for entry fees & transfers. Checkout is server-initiated hosted checkout (src/lib/payments/paystack.ts), not a client-side inline popup — there's no public key anywhere in the code. |
| `FLUTTERWAVE_SECRET_KEY` | **YES** | Flutterwave Live Secret Key (`FLWSECK_LIVE-...`). Same server-initiated-checkout reasoning as Paystack above — no public key used. |
| `FLUTTERWAVE_SECRET_HASH`| **YES** | Shared secret configured in Flutterwave Dashboard under Webhooks. |
| `R2_BUCKET` | **YES** | Name of Cloudflare R2 bucket (e.g. `circuit-proofs-prod`). |
| `R2_ACCOUNT_ID` | **YES** | Cloudflare Account ID from dashboard. |
| `R2_ENDPOINT` | **YES** | `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`. |
| `R2_ACCESS_KEY_ID` | **YES** | R2 API Token with Object Read & Write permissions. |
| `R2_SECRET_ACCESS_KEY` | **YES** | R2 API Secret. |
| `RESEND_API_KEY` | **YES** | Resend API key for password reset transactional emails. |
| `ONESIGNAL_API_KEY` | Optional | REST API Key for web browser push notifications. |
| `NEXT_PUBLIC_ONESIGNAL_APP_ID` | Optional | OneSignal App ID exposed to browser client. |
| `SENTRY_DSN` | Optional | Sentry ingest DSN for zero-overhead error reporting. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional | PostHog project API key for PRD §17 event tracking. |

---

## 3. Webhook Registration

### Paystack Webhook
1. Go to **Paystack Dashboard > Settings > Preferences > API Configuration**.
2. Set the **Webhook URL** to:
   ```
   https://<your-domain>/api/webhooks/paystack
   ```
3. Enable event types: `charge.success`, `transfer.success`, `transfer.failed`, `transfer.reversed`.

### Flutterwave Webhook
1. Go to **Flutterwave Dashboard > Settings > Webhooks**.
2. Set the **URL** to:
   ```
   https://<your-domain>/api/webhooks/flutterwave
   ```
3. Set the **Secret Hash** and copy this exact string into `FLUTTERWAVE_SECRET_HASH` in your environment.

---

## 4. Automated Match Sweeper (Vercel Cron)

**Requires a paid Vercel plan.** Vercel's Hobby (free) tier only allows
Cron Jobs to run once per day — `*/2 * * * *` needs Pro or above. On
Hobby, Vercel silently accepts this `vercel.json` at deploy time but
only actually fires it once daily, well short of what bracket
progression, auto-accept, dispute escalation, and organizer-revenue
settlement all need. Confirm the project's Vercel plan before relying on
this.

Circuit includes `vercel.json` configured to sweep matches every 2 minutes:
```json
{
  "crons": [
    {
      "path": "/api/cron/sweep",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

### Verification:
1. After deploying to Vercel, navigate to **Project > Settings > Cron Jobs**.
2. Verify `/api/cron/sweep` is listed with schedule `*/2 * * * *`.
3. To trigger manually from terminal:
   ```bash
   curl -i -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/sweep
   ```
4. Verify response:
   ```json
   {
     "success": true,
     "durationMs": 42,
     "timestamp": "2026-09-20T...",
     "checked": 0,
     "autoCompleted": 0,
     "abandoned": 0,
     "penalized": 0
   }
   ```

---

## 5. Storage Verification (Cloudflare R2)

To verify that your R2 credentials and bucket permissions are working:
```bash
npm run test:storage
```
Expected output:
```
====================================================
   Circuit Storage Verification Diagnostic Tool     
====================================================

[Config Check]
  Driver:           Cloudflare R2 / AWS S3
  Bucket:           circuit-proofs-prod
...
  1. Storing synthetic proof (210 bytes)...
     ✓ Stored successfully.
  2. Reading proof back by reference...
     ✓ Retrieved 210 bytes.
     ✓ SHA-256 integrity match verified.
     ✓ Content-Type verified: text/plain

====================================================
   STORAGE TEST PASSED: Storage is production-ready! 
====================================================
```

---

## 6. Pre-Launch Smoke Testing Sequence

Run these 5 checks immediately after deploying:

1. **Health Check Endpoint**:
   ```bash
   curl -s https://<your-domain>/api/health
   ```
   Must return HTTP 200 with `"status": "healthy"` and `"database": {"status": "connected"}`.

2. **Database Migrations Check**:
   ```bash
   npx prisma migrate status
   ```
   Must report "Database schema is up to date!" — not a specific
   migration count (that number only grows as the schema evolves and
   goes stale the moment it does; the real go/no-go signal is whether
   anything is still pending).

3. **Super Admin Access**:
   - Access `https://<your-domain>/admin`.
   - Log in with your Super Admin account.
   - Verify tournament approval, dispute ruling, and audit logs are accessible.

4. **Bank Account Linking Test**:
   - Navigate to `/account`.
   - Choose a Nigerian bank (e.g., GTBank, Access Bank).
   - Enter a test 10-digit NUBAN number.
   - Click "Verify & Link Bank Account".
   - Confirm verified name displays and Paystack recipient code is assigned.

5. **End-to-End Escrow Registration**:
   - Create a test tournament with entry fee ₦500.
   - Register a test player and complete payment via Paystack checkout popup.
   - Verify tournament participant count increases and Escrow status transitions to `HELD`.
