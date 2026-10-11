# Security policy

Circuit moves real money — wallets, escrow on every staked Battle, payouts
and withdrawals. A hole in it costs players cash they cannot get back,
so reports are genuinely welcome and we would rather hear about a
suspicion than not.

## Reporting a vulnerability

**Email `security@circuitvrse.co`.**

Please do not open a public GitHub issue, and do not raise it as a
player-support ticket — a report that arrives in a support queue is a
report that sits there, and support cannot triage it anyway.

Include what you can of:

- what you found, and where,
- the steps that reproduce it,
- what someone could actually do with it — the impact matters more than
  the finding, because it tells us how fast to move,
- how to reach you.

What happens next:

- We acknowledge the report. If you have not heard back in a week, assume
  we missed it and send it again.
- We tell you whether we think it is real, and if we disagree, why.
- We tell you when it is fixed, or if it will not be, and why not.

We will credit you when we fix it, unless you would rather we didn't. There
is **no bug bounty** — please do not expect payment, and do not spend time
on a report you are counting on being paid for.

## What to test against

Your own accounts and your own money. Use Paystack's test mode rather than
live keys. Do not read, change or exfiltrate another player's account,
data or money — if you can, that is the finding; stop, take a screenshot,
and report it.

## In scope

- The Circuit web app and the API behind it.
- **Money**: balances, escrow, stakes, payouts, refunds, withdrawals, and
  anything that lets a wallet change without a matching ledger entry.
- **Access control**: players reaching staff or Super Admin surfaces,
  one account reaching another's data, or a signed-out visitor reaching
  anything private.
- **Auth**: sessions, password reset, Google sign-in, and anything that
  lets a session outlive a logout, a ban or a suspension.
- Personal data about players, including anything that leaks an email
  address, phone number or date of birth to someone who should not have it.

## Out of scope

- Reports from an automated scanner with no demonstrated impact attached.
- Missing hardening headers, cookie flags or DNS records where you cannot
  show what breaks without them.
- Rate limiting, volumetric DoS, or load — say so only if you can show a
  specific endpoint where the limit is absent rather than merely high.
- Anything in a third party. **Paystack**, **Resend**, **Google**,
  **OneSignal**, **AWS** and the analytics and error providers all have
  their own disclosure programmes; report it there and we will help where
  we can.
- Social engineering of Circuit staff, or of anyone else.
- Anything that needs a compromised device, browser extension, or an
  account you were given rather than one you obtained.

## Good faith

<!-- The paragraph below is a legal commitment and has not been through
     the review docs/circuit-strategy.md §10 requires. It needs that
     check before this file is made public — it is the one part of this
     document that is not just describing how we work. -->

If you follow this policy — report privately, stay off other people's
accounts and money, and give us a reasonable chance to fix it before
saying anything publicly — we will not pursue legal action against you
over the research itself, and we will say so publicly if anyone asks.
