# Baytos — Handoff to Team

Snapshot date: 2026-09-14. Written for whoever picks up the project next.
Read this end-to-end before touching anything.

## 1. What Baytos is

Baytos is a building/tenant expense platform. A building president (or
manager) sets up a building with its units, meters, tariffs, and shared
expenses; tenants join their unit via an 8-character invite code; each
billing period the system computes a `Bill` per unit (meter charges +
allocated shared expenses + project-fund contributions + arrears +
reimbursement credits) and tenants pay from the app.

Two apps, one repo:

- `backend/` — NestJS + Prisma + Postgres. Owns the billing engine,
  auth, invitations, meters, expenses, and payment scheduling.
- `web/` — Next.js 14 (App Router, `output: 'export'`) wrapped by
  Capacitor 8 to ship as native iOS and Android apps. Same static
  bundle serves both native shells; there is no browser-facing web
  deployment today.

Top-level docs:
- `README.md`, `HANDOFF.md`, `LAUNCH_GUIDE.md` — original project docs.
- `docker-compose.yml` — Postgres container.
- `baytos-app.html` — legacy single-file prototype, kept for reference.
- `claude-docs/*.md` — session-by-session task docs (list at the end
  of this file).

## 2. Current status

### Phase 0 — verified working (done)
Local dev stack recovered and confirmed: Postgres (docker), NestJS
backend on :4000, Next.js web on :3000, demo logins working, invite +
billing flows exercised against real data. See
`2026-09-07-recover-local-dev-after-intellij-crash.md`.

### Phase 1 — billing engine unit tests (done)
Jest wired into `backend/`, 16/16 tests passing. Covers meter charge
math, expense allocation (EQUAL / AREA / OWNERSHIP / CUSTOM), arrears
roll-forward, reimbursement credits, period/snapshot boundaries, and
immutability of `USED_IN_BILL` readings. See
`2026-09-07-billing-engine-unit-tests.md`.

### Phase 2 — Capacitor native wrap (iOS done, Android not started)
Web app converted to `output: 'export'` (16 static pages), query-string
routing (`?id=`) replaced dynamic segments, Capacitor 8 configured with
`appId: com.baytos.app`, both `web/ios/` and `web/android/` projects
scaffolded. `npx cap sync` copies `web/out/` into both native projects.
See `2026-09-10-capacitor-ios-android-scaffold.md`.

**iOS:** confirmed running in the iOS Simulator on Xcode 26.6 with real
backend data (demo login, buildings, bills all worked). No blockers.

**Join-flow bug found and fixed during iOS Simulator testing:** a
token-less tenant tapping "Join apartment" on `/tenant/join` was
silently bounced to `/` with no context. Fixed by routing the bounce
through `/?next=/tenant/join` and honoring `?next=` after any
successful auth transition. Root cause was a latent bug from Sep 3, not
a regression from the Capacitor refactor. See
`2026-09-10-tenant-invite-bounce-fix.md` — that doc's Verification
section explicitly flags that behavioral confirmation in the Simulator
(steps a and b) is still pending; the fix is present in the built
bundle but needs a manual click-through.

**Android:** **done (2026-10-05).** Built, installed and click-tested end to
end on a Pixel 9 emulator (Android 16) against the real backend — every manager
and tenant flow, including the tenant join-code flow whose verification was
pending. Two blockers had to be cleared first (mixed content blocked every API
call; the invite-code link was a raw `<a>` and unreachable on Android), plus
eight flows that could not be completed at all. See
`2026-10-05-android-bringup-fixes-and-whish-qr.md`.

## 3. What was next — Android (done 2026-10-05; see that date's entry)

In order:

1. **Install Android Studio.** `brew install --cask android-studio`
   (~1.5 GB DMG) or download from developer.android.com. The Homebrew
   install lands the `.app` at `/Applications/Android Studio.app` but
   does **not** install the SDK.
2. **Run Android Studio's first-launch SDK wizard.** This is a GUI
   step — open the app, accept licenses, let it download the SDK to
   `~/Library/Android/sdk` (~2-3 GB). Install at least one emulator
   image (Pixel 8 API 34 is a fine default).
3. **From `web/`, run:**
   ```
   npm install                     # if node_modules was cleaned
   npm run build                   # regenerate web/out/
   npx cap sync android            # copy web/out into android/app/src/main/assets/public
   npx cap open android            # opens Android Studio on web/android/
   ```
4. **Create/run an AVD** from Android Studio's Device Manager, then
   run the app on it.
5. **Click through the same flows already verified on iOS:**
   - Demo login as `president@demo.lb` → building dashboard, units,
     readings, expenses, billing, community.
   - Demo login as `tenant@demo.lb` → statement list, bill detail.
   - Tenant invite acceptance via `/tenant/join` (this is the flow
     with the recent fix — see the bounce-fix doc for what to check).

**Android-specific gotcha to plan for from the start:** the Android
emulator cannot reach `localhost:4000` — from inside the emulator,
`localhost` means the emulator itself. Use `http://10.0.2.2:4000` as
the host-machine alias. `NEXT_PUBLIC_API_URL` is inlined into the
static bundle at `npm run build` time, so you will need a separate
build (or a `.env.production` / `.env.local` swap) for the Android
emulator vs iOS Simulator vs physical devices. Full breakdown of the
URL matrix is in the "Static export + backend URL" section of
`2026-09-10-capacitor-ios-android-scaffold.md`.

## 4. Deliberately NOT started yet

Both of these are on the roadmap but intentionally deferred; do not
start them before Android is done unless the priorities change.

### Areeba payment integration
`backend/.env.example` has placeholders for both `STRIPE_*` and Areeba
config. Stripe is the current dev/test provider (`PAYMENT_PROVIDER=STRIPE`).
Areeba is the intended Lebanon-production gateway, but the exact
integration route (direct Areeba API vs. an aggregator, hosted checkout
vs. server-to-server) is **pending an internal decision**. Do not
prototype the integration until that decision lands — implementation
depends on which route is chosen and rework would be wasted.

### App store submission prep
Not started, comes after Android is verified running:
- App icons and splash screens (iOS + Android sets)
- Privacy policy URL (required by both stores)
- Push notifications (Apple Push Notification service, Firebase Cloud
  Messaging) — currently no push infrastructure exists
- Bundle ID review — currently `com.baytos.app`. If Baytos owns a
  specific domain, App Store / Play Store convention is reverse-DNS of
  that owned domain. Bundle ID is very painful to change after
  submission; confirm before the first TestFlight upload. Noted in the
  Capacitor scaffold doc.
- App Store Connect + Google Play Console accounts, signing certs,
  provisioning profiles.

## 5. Local dev environment quirks (save yourself re-discovery time)

### Postgres runs on host port 5434, not 5432
Ports 5432 and 5433 are already occupied by other local Postgres
instances on the original dev machine (5433 is an `erp-postgres`
container from an unrelated project). `docker-compose.yml` maps
`5434:5432` deliberately. **Check what's on 5432/5433 before assuming
the defaults are free** — running `docker ps` and `lsof -i :5432 -i
:5433 -i :5434` on the new machine will tell you immediately. If 5432
is free on your machine you *may* switch back, but every reference to
the DB port has to change together (compose file + `backend/.env`
`DATABASE_URL`).

### Demo logins (seeded by Prisma)
- `president@demo.lb` / `password123` — routes to the manager/admin
  building dashboard.
- `tenant@demo.lb` / `password123` — routes to the tenant app.

These accounts are created by the seed script and are the primary way
to exercise the app without generating invite codes by hand.

### backend/.env must be created from .env.example
`backend/.env` is **not** included in this zip (real secrets are
stripped). Steps for a fresh setup:

1. `cp backend/.env.example backend/.env`
2. Change `DATABASE_URL` port from `5432` to **`5434`** (the example
   file still points at 5432 — the working local value is 5434 per the
   docker-compose mapping).
3. Generate a fresh `JWT_SECRET` — 64 hex chars is the size the
   original used: `openssl rand -hex 32`.
4. `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` in the example are
   test-mode placeholders (`sk_test_xxx`, `whsec_xxx`). Replace with
   real test-mode keys from the Stripe dashboard when you actually
   need to hit Stripe. For most flows (login, buildings, billing
   compute, invitations) they can stay as placeholders.
5. Areeba fields stay empty until the integration decision above.

### Web env
`web/.env.local` is not shipped either. The one variable that matters
is `NEXT_PUBLIC_API_URL`. Default `http://localhost:4000` works for
`npm run dev` and for the iOS Simulator. See the URL matrix in the
Capacitor scaffold doc for Android emulator and physical device
values. Note: this URL is baked into `web/out/` at build time, so
after changing it you must re-run `npm run build && npx cap sync`.

### Bringing the stack up from scratch
1. `docker compose up -d` (from repo root) → Postgres on :5434.
2. `cd backend && npm install && npx prisma migrate deploy && npm run seed && npm run start:dev` → NestJS on :4000.
3. `cd web && npm install && npm run dev` → Next dev server on :3000.
4. For native shells: `npm run build && npx cap sync ios` (or `android`),
   then open in Xcode / Android Studio.

## 6. claude-docs so far

Everything in `claude-docs/` is prior investigation. Read the one
relevant to your area *before* starting so you don't re-discover the
same gotchas.

- `HANDOFF-TO-TEAM.md` — this file.
- `2026-09-07-recover-local-dev-after-intellij-crash.md` — how the
  local stack is wired (Postgres port, backend/.env contents, demo
  seed data), what to check when it stops working. **Read this first
  if the app won't start on your machine.**
- `2026-09-07-billing-engine-unit-tests.md` — Jest setup for backend,
  the 16 billing-engine tests, and full documentation of the billing
  compute flow (meter charges, expense allocation modes, arrears,
  reimbursements, period close). **Read this before changing anything
  in `backend/src/billing/`.**
- `2026-09-10-capacitor-ios-android-scaffold.md` — Capacitor 8 install,
  static export conversion, dynamic-segment → query-string routing
  refactor, Suspense-wrapper pattern, the `NEXT_PUBLIC_API_URL`
  device/emulator matrix. **Read this before touching routing or
  before running the Android build for the first time.**
- `2026-10-05-android-bringup-fixes-and-whish-qr.md` — Android bring-up on a
  second machine, the mixed-content and hard-navigation blockers, the overflow
  bug that also broke vertical scrolling, eight uncompletable flows, the inert
  ValidationPipe, and Whish QR payments. **Read this before any further Android
  or billing work** — it also lists what is still open.
- `2026-09-10-tenant-invite-bounce-fix.md` — the join-flow bug found
  during iOS Simulator testing and its fix (`?next=` redirect through
  `/`). Includes an explicit pending-verification note: the fix is in
  the bundle but the click-through on Simulator has not been done yet.
  **Read this before the first tenant-invite Simulator/emulator run.**
