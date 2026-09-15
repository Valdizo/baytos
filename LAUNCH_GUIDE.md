# Baytos Launch Guide

How to run the platform locally, take a real test payment with Stripe, and what to do to go live in Lebanon with Areeba.

---

## 1. Prerequisites

- Node.js 20+ and npm
- Docker Desktop (for PostgreSQL) — or a local PostgreSQL 16
- A free Stripe account (test mode) — https://dashboard.stripe.com/register
- Stripe CLI for webhooks — https://docs.stripe.com/stripe-cli

No mobile tooling needed: the tenant app is a mobile-first web app (PWA) served by the same Next.js project — it runs in any phone browser and installs to the home screen.

## 2. Start the backend

```bash
cd baytos
docker compose up -d                 # starts PostgreSQL on :5432

cd backend
cp .env.example .env                 # then edit .env (see below)
npm install
npx prisma migrate dev --name init   # creates the database schema
npx prisma generate
npx ts-node prisma/seed.ts           # demo building + tenants + readings
npm run dev                          # API on http://localhost:4000
```

Edit `backend/.env`:
- `JWT_SECRET` — any long random string
- `STRIPE_SECRET_KEY` — from Stripe Dashboard → Developers → API keys → **Secret key** (`sk_test_...`)
- `STRIPE_WEBHOOK_SECRET` — created in step 4 below

## 3. Start the web app (manager portal + tenant app)

```bash
cd web
npm install
npm run dev                          # http://localhost:3000
```

Create `web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_STRIPE_PK=pk_test_your_publishable_key
```

Sign in with `president@demo.lb` / `password123` for the manager portal. Tenants who sign in land on the mobile app at `/tenant` automatically. The seed gives you Cedar Residence with 4 apartments, meters, this month's readings, one pending expense, an open proposal and an elevator project fund. Go to **Billing → Preview** and you'll see every apartment's draft statement; **Close period** issues the bills.

## 4. Stripe test payments (do this before touching the mobile app)

1. In Stripe Dashboard (test mode), copy your **Publishable key** (`pk_test_...`) and **Secret key** (`sk_test_...`).
2. Put the secret key in `backend/.env`, restart the backend.
3. Put the publishable key in `web/.env.local` as `NEXT_PUBLIC_STRIPE_PK`, restart `npm run dev`.
4. Forward webhooks so the backend hears about payment results:

```bash
stripe login
stripe listen --forward-to localhost:4000/v1/webhooks/payments/stripe
```

The CLI prints a `whsec_...` value — put it in `backend/.env` as `STRIPE_WEBHOOK_SECRET` and restart. Keep `stripe listen` running while you test.

Test card: `4242 4242 4242 4242`, any future expiry, any CVC.
To test 3-D Secure / "requires action": `4000 0027 6000 3184`.
To test declines: `4000 0000 0000 0002`.

## 5. Use the tenant app on a real phone

On your computer it's simply http://localhost:3000/tenant. To use it on your phone (same Wi-Fi):

1. Find your computer's LAN IP (e.g. `192.168.1.20` — `ipconfig` on Windows, `ifconfig`/System Settings on Mac).
2. In `web/.env.local` set `NEXT_PUBLIC_API_URL=http://192.168.1.20:4000` and restart `npm run dev`.
3. On the phone, open `http://192.168.1.20:3000` in the browser and sign in as the tenant.
4. Browser menu → **Add to Home Screen** — Baytos installs with its own icon and opens full-screen like a native app.

Once deployed (§9), tenants just visit your real URL — no LAN setup, and card entry runs over proper HTTPS.

Tenant flow to test end-to-end:
1. Web: on **Apartments**, click **Invite tenant** on a unit → copy the 8-character code.
2. Phone: register a new account → **Join apartment** with the code (or use the seeded `tenant@demo.lb`).
3. Phone: **Card** tab → Add payment method → enter the 4242 test card in the Stripe form → turn autopay on, set a cap (e.g. $300).
4. Web: enter readings, add an expense, open **Billing**, preview, **Close period**.
5. The tenant's bill is issued and autopay charges the saved card (if under the cap). Watch `stripe listen` confirm `payment_intent.succeeded`, and the bill flips to **paid** on both apps.
6. Phone: open the statement and tap any line — it shows previous/current reading, rate, and fixed fees.

## 6. Going live in Lebanon: Areeba (or Tap)

**Stripe does not support Lebanon-domiciled merchant accounts**, so Stripe here is your test/dev rail and your future-expansion rail (Gulf, Europe). For production collections in Lebanon you need a licensed local PSP — Areeba first, Tap Payments as the alternative.

The code is already structured for this: `backend/src/payments/psp.interface.ts` defines the only two operations the platform ever needs from a PSP (`createSetupSession` for tokenizing a card, `chargeSavedMethod` for merchant-initiated autopay). `areeba.adapter.ts` is the skeleton you fill in once you have Areeba's merchant technical pack. Nothing else in the platform changes; you flip `PAYMENT_PROVIDER=AREEBA` in `.env`.

### Send Areeba this RFP before writing any code

Ask for written answers on:
1. Card tokenization without the PAN touching your server (hosted checkout page or SDK)?
2. Official iOS/Android SDK?
3. Recurring **merchant-initiated transactions** on a saved token (this is autopay)?
4. What initial customer-initiated transaction establishes consent?
5. 3-D Secure handling and the "action required" flow?
6. Can each **building** be its own merchant/sub-merchant, with settlement going to the building's account (not yours)?
7. Split settlement / application fee so your commission is paid by the PSP, not held by you?
8. What KYC documents does a building committee/president need to onboard as a merchant?
9. Signed webhooks? Idempotency support? Settlement reports/APIs?
10. Pricing (MDR + fixed fees) and the sandbox/certification process.

### The two rules that keep you out of regulated-payments territory

1. **Money settles directly from the PSP to the building's account.** Your platform records the transaction and takes its fee through the PSP (application fee) or bills the building a SaaS subscription. You never collect tenants' money into your own account and redistribute it.
2. **Project funds are a ledger, not a wallet.** The elevator fund's balance is derived from contributions that settled to the building's account; you display it, you don't hold it.

Banque du Liban's January 2026 framework (Basic Decision 13790) regulates electronic-payment providers, and the April 2026 circular caps merchant discount rates — before charging real cards, have Lebanese payments counsel confirm your specific commission structure with the PSP you sign. Budget roughly $5k–$25k for this legal work; it is the single highest-leverage spend before launch.

### Go/no-go gates before real autopay

- Written PSP approval of the platform/commission model
- Tokenization confirmed: no PAN/CVV ever reaches your backend (already enforced in code)
- Versioned autopay mandate with per-charge cap (already implemented)
- Idempotent charging + signed webhooks + replay protection (already implemented for Stripe; replicate for Areeba)
- Refund flow tested in sandbox
- Privacy notice mapped to Lebanon's Law 81/2018
- External penetration test

## 7. Business model reminder

Start with **SaaS-first**: ~$15/month per building + ~$0.75/active apartment. Add the 0.5–1% transaction commission only once the PSP contractually supports an application-fee structure. Don't model 2.9% Stripe-style fees in your Lebanese business plan — get the real MDR quote from Areeba.

## 8. What's deliberately NOT in this MVP (build next, in order)

1. **Photo uploads to S3** — readings/receipts accept a `photoUrl`; wire an S3-compatible bucket (AWS S3, Cloudflare R2) with pre-signed upload URLs.
2. **Notifications** — Web Push (works from the installed PWA on Android; iOS 16.4+ supports it for installed PWAs) plus WhatsApp/SMS for "bill issued" and "payment failed" — in Lebanon, WhatsApp is usually the channel that actually gets read.
3. **Arabic UI + RTL layouts** — the schema is bilingual-ready (`nameAr`, `titleAr`); add i18n catalogs before public launch.
4. **Double-entry ledger + reconciliation screens** — the blueprint's Phase 3; current model tracks bills/payments correctly but a real ledger should come before large volumes.
5. **Meter OCR** — photo → number (AWS Textract / Google Vision), always human-confirmed.
6. **EDL integration** — treat as a partnership track, never an MVP dependency. Manual EDL readings already work as a tracked meter type.

## 9. Deploying

- **Backend**: any Node host (Railway, Render, AWS ECS). Set env vars, run `prisma migrate deploy`. Use managed PostgreSQL (RDS/Neon) with daily backups + PITR.
- **Web**: Vercel (`web/`), set `NEXT_PUBLIC_API_URL` to your API URL.
- **Tenant app**: nothing extra — it ships with the web deploy at `yourdomain.com/tenant`, and tenants add it to their home screen. If you later want store presence, wrap the same URL with Capacitor or build a native app against the same API — every endpoint the tenant app uses is plain REST.
- Separate staging and production databases; never test with real cards outside Stripe test mode / Areeba sandbox.
