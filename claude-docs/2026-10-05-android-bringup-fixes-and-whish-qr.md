# Android bring-up, flow fixes, and Whish QR payments

Picked the project up from the handoff doc on a different machine, got Android
running end to end, then fixed everything that turned up — including flows that
could not be completed at all — and added Whish Money QR payments.

## Task

1. Verify the machine's tooling, install what was missing, bring the local stack up.
2. Get Android working end to end (iOS was already done elsewhere; untouched here).
3. Re-test every flow already verified on iOS, especially the tenant join-code fix.
4. Fix every issue found, make the layout adapt to any screen size.
5. Add Whish payments: each building admin uploads a QR tenants pay through.

## Machine notes (this machine, not the one in the Capacitor scaffold doc)

- Android Studio **was already installed** (2026.1, direct install, not brew) but had
  never been launched. The SDK wizard installed platform **37 only**; this project
  compiles against 36, so command-line tools, `platforms;android-36` and
  `system-images;android-36;default;arm64-v8a` were added separately.
- **`registry.npmjs.org` is unreachable** on this machine. TCP connects, the TLS
  Client Hello goes out, nothing comes back. github.com and dl.google.com are fine.
  The machine was on an **iPhone hotspot** (`172.20.10.x`), which is the likely cause.
  npm reports this as the useless `Exit handler never called!` — recognise it.
  Both installs used `--registry=https://registry.yarnpkg.com` (npm's own CDN alias;
  `package-lock.json` integrity still enforced).
- Gradle needs JDK 17+; `JAVA_HOME` here is Corretto 11. Use
  `JAVA_HOME=~/Library/Java/JavaVirtualMachines/corretto-21.0.11/Contents/Home`
  for `./gradlew`. Android Studio's own builds are fine (bundled JBR).
- **The `android-37.0` system image segfaults the emulator** (exit 139; `avdmanager`
  misparses the `37.0` versioned image as "API 0"). The working AVD is `baytos_p9`
  — Pixel 9 hardware on the **android-36** arm64 image, which is stable.
- Ports: 5432 is taken on this machine, 5433/5434 free, so the compose mapping
  (`5434:5432`) works unchanged. The handoff doc's note about 5433 is machine-specific.

## Files changed

### New
- `web/app/building/settings/page.tsx` — building settings: Whish QR upload,
  recipient name, and the meter-rate (tariff) table + form.
- `backend/prisma/migrations/20260922180415_whish_qr_and_flow_fixes/` —
  `Building.whishQrData`, `Building.whishRecipient`.
- `.gitignore` — the repo had no git history at all; initialised it this session.

### Modified — frontend
- `web/app/page.tsx` — the invite-code link was a raw `<a>`; now `next/link`.
- `web/app/globals.css` — table stacking (container query), overflow containment,
  touch targets, `.auth` grid fix, Whish QR styles.
- `web/components/Shell.tsx` — Settings nav entry; copies each ledger table's `<th>`
  text onto its cells as `data-label` for the stacked phone layout.
- `web/app/building/units/page.tsx` — remove meter, end tenancy, invite manager,
  `OTHER` meter type, error banner.
- `web/app/building/readings/page.tsx` — optional reading date (baselines).
- `web/app/building/billing/page.tsx` — surface open-period errors, "open next month".
- `web/app/building/community/page.tsx` — close a vote, mark a project fund funded/completed.
- `web/app/tenant/bill/page.tsx` — "Or pay with Whish" QR block.
- `web/capacitor.config.ts` + `web/android/app/src/debug/AndroidManifest.xml` (new) —
  see "Android could not talk to the backend at all" below.

### Modified — backend
- `auth.service.ts`, `buildings.service.ts`, `meters.service.ts`,
  `community.service.ts`, `billing.service.ts` — input guards, P2002 → 400,
  reading ceiling, vacancy and duplicate-meter guards, building settings,
  `endMembership`, `removeMeter`, period label handling.
- `buildings.controller.ts`, `meters.controller.ts` — new routes.

## The two Android blockers

### 1. Android could not talk to the backend at all

Capacitor serves the bundle from `https://localhost` on Android, so every call to
the plain-HTTP dev backend was blocked as mixed content:

```
Mixed Content: The page at 'https://localhost/' was loaded over HTTPS,
but requested an insecure resource 'http://10.0.2.2:4000/v1/auth/login'.
This request has been blocked.
```

Login failed, nothing loaded, no flow was testable. Fixed with
`android: { allowMixedContent: true }` in `capacitor.config.ts`, plus
`usesCleartextTraffic` in a **debug-only** `AndroidManifest.xml` so release builds
keep Android's default cleartext block. Both are dev-only; drop them once the
backend is HTTPS.

### 2. The tenant could never reach the join screen

`app/page.tsx:75` used `<a href="/tenant/join">`. A plain anchor triggers a **hard
navigation**, and Capacitor's asset loader answers every hard-navigated path with
the root `index.html` — so the app reboots on the landing page. The user is still
signed in with a valid token but sees the sign-in form.

The `?next=` fix from `2026-09-10-tenant-invite-bounce-fix.md` is correct and is
still in `app/tenant/join/page.tsx:14` — it simply never got a chance to run,
because that page was unreachable. **The pending verification in that doc is now
done**: the join flow was click-tested end to end four times (units 2A, 2B, and
Marina Towers 1A/1B), membership + `MoveInSnapshot` confirmed each time.

Any `<a href>` to an in-app path has this problem. `components/Shell.tsx:31`
(sign-out) is the same shape but harmless, since landing on `/` is what it wants.

## The overflow bug was not cosmetic

Reported as "the view goes off screen when adding an apartment". Measured on
device: the page was **713px wide in a 412px viewport**. The cause chain:

1. `.ledger` tables are ~740px and had no scroll container, so the overflow
   propagated up through `main.content` and `.shell` and the **whole page** moved.
2. Worse — when a page is wider than the viewport, the **Android WebView inflates
   its layout viewport height by the same ratio**. Measured on five pages, exact:

```
innerHeight = viewportHeight × (pageWidth ÷ viewportWidth)

page         pageW  predicted  measured
dashboard     412        852       852
billing       500       1034      1034
readings      639       1321      1321
units         762       1576      1574
```

Vertical scrolling is then capped at `documentHeight − innerHeight`. On Apartments
that left **722px of content with 0px of scroll** — the "Add apartment" form was
unreachable by swipe *and* by `window.scrollTo()`.

**Fix, in two stages.** First `main.content { min-width: 0; overflow-x: auto }` at
every width — that stopped the page overflow and restored vertical scrolling, but
the table was still clipped behind a sideways scroll. Then the real fix: a
**container query** (`@container (max-width: 780px)`) that stacks each row into a
labelled card. Keyed to the content column, not the screen — at 1024px the 232px
rail leaves ~790px, so a screen-width breakpoint would still have clipped.
Verified 320–1600px: zero cut-off at every width; below ~1100px it stacks, above
it stays a real table.

Labels come from `data-label`, set in `Shell.tsx` from each table's own `<th>`
text — rather than hand-editing 55 `<td>`s across 6 files, and new tables get it free.

## Flows that could not be completed (all now fixed)

| Flow | Why it was impossible |
|---|---|
| Set meter rates | **No UI existed at all.** Only the seed script ever wrote tariffs, so any building created in the app billed $0.00 forever. |
| Baseline reading | Readings were always stamped "now", so the first period had nothing to subtract from. |
| Reopen after closing a month | Label came from the clock; `@@unique([buildingId,label])` rejected a second one; `openPeriod()` had no try/catch so the 500 was **silent** and the button looked dead. |
| Close a vote | `POST /proposals/:id/close` existed, no UI. Votes ran forever. |
| Complete a project fund | `PATCH /projects/:id/status` existed, no UI. Collected past target indefinitely. |
| Remove a meter | **Zero `@Delete` endpoints in the whole API** (24 models). |
| Tenant moves out | `BuildingMembership.endDate` was read in three `where` clauses and **never written**. |
| Invite a manager | `invite()` took a role; the UI always sent `TENANT`. |

## Validation was registered but inert

`main.ts:11` registers `ValidationPipe({ whitelist: true, transform: true })`, so
the API *looks* validated. **No DTO class in `src/` carries a class-validator
decorator**, so the pipe has no metadata and silently does nothing. The only real
checks were three hand-written `if`s in services.

Result: **8 endpoints returned 500 on a blank field** (buildings, meters, tariffs,
proposals, projects, maintenance, invitations/accept, auth/register). Users saw a
red "Internal server error" for an empty input. Fixed with explicit guards matching
the three that already existed, rather than introducing a parallel DTO layer.

Also fixed: duplicate unit number leaked Prisma's P2002 as a 500; meter readings
had **no upper bound** (1e12 accepted) — and since issued bills are immutable, one
typo becomes a permanently wrong statement. Now rejected above 100× the last
verified reading.

## Data-integrity guards added

- **One meter of each type per apartment.** Nothing enforced this; a test building
  had accumulated 3× HOT_WATER and 2× GENERATOR on one unit. Once a tariff exists
  that bills three times.
- **One active tenant per apartment.** Neither `invite()` nor `acceptInvitation()`
  checked occupancy, so a unit could accumulate tenants who all saw the same bills
  — and with `endDate` never written, that was irreversible.

## Whish Money QR payments

`Building.whishQrData` holds a `data:` URL; `whishRecipient` is the account name
shown under it. A QR is a few tens of KB, so storing the data URL avoids an object
store entirely — the image is read in the browser with `FileReader` and PATCHed to
`/v1/buildings/:id/settings`. Backend validates the data-URL prefix and caps at
~300KB.

The tenant statement renders "Or pay with Whish" with the QR, the exact amount and
the recipient name, plus "Check the name above matches before you send."

**Settlement happens outside the app** — Whish pays the building directly, so the
bill cannot auto-reconcile. The copy says "marked paid once <building> confirms it".
A manager-side "mark as paid" action is the obvious next piece and does not exist yet.

## Demo data (created through the app's own UI, not the database)

Two buildings seeded with the supplied QR codes, then driven entirely through the
app's screens — rates, meters, readings, expense, period open/close, invites, joins.

- **Marina Towers** — admin `whish@demo.lb` / `password123`
  - Rates: GENERATOR $0.45/kWh + $5.00 fixed; COLD_WATER $1.75/m³
  - Unit 1A — `maya@demo.lb` — **$324.40** (generator $98.15, water $68.25,
    cleaning $45.00, **previous unpaid balance $113.00**)
  - Unit 1B — `karim@demo.lb` — **$284.10**
  - All passwords `password123`
- **Olive Court** — same admin, QR uploaded, deliberately left empty so the setup
  flow can be walked from scratch.

Note: closing the October period **voided** 1A's unpaid September bill and rolled
its balance forward as an arrears line — correct, and worth knowing before anyone
reports the void as a bug.

## Still open

- **No building switcher.** `buildingId` comes only from `?id=`, and a hard
  navigation to that URL fails on Android (see blocker 2). A president of two
  buildings can only reach the first. This blocks the multi-building manager the
  pricing model targets.
- **No notifications of any kind** — no email, SMS, push or WhatsApp anywhere in
  the backend. Bills are issued into silence.
- **`OVERDUE` and `PARTIALLY_PAID` are dead statuses** — both in the enum, both
  queried, **never written**. There is no scheduler in the backend, so a due date
  passes and nothing happens.
- **Payment is all-or-nothing** — `payBill()` takes no amount.
- **Arrears are computed but never displayed** — no debtors/ageing view anywhere.
- **No recurring expenses**; `photoUrl` exists on readings and expenses but nothing
  uploads; single currency per building.

## Verification

- Pixel 9 emulator, Android 16 (SDK 36), against NestJS :4000 and Postgres :5434.
- 13 screens × 5 widths (320–1024px): zero page overflow, zero clipped text, full
  vertical reach, no touch target under 44px.
- All 11 write endpoints return 400 on blank input (was 8 × 500).
- Backend typecheck clean; the 16 billing-engine tests still pass.
- Billing maths re-checked against issued bills: unit 1B, 388 kWh × $0.45 + $5.00
  = $179.60; water 34 m³ × $1.75 = $59.50; +$45.00 cleaning = **$284.10**.

Two things nearly filed as bugs that were **tooling artifacts**, checked before
reporting: a page that "could not scroll" was a stale WebView window (a clean
relaunch showed normal numbers), and taps that "did not register" were off by 63px
because `adb shell input tap` uses screen coordinates while `getBoundingClientRect`
is viewport-relative — the Android status bar.

## Git

The repo had **no git history**. Initialised this session with the baseline
committed *before* any of this work, so `git diff 58957df` shows everything that
changed. `.claude-flow/` tooling state is ignored.
