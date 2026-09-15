# Baytos — Technical Handoff

For the engineering team taking this MVP to production. Read alongside README.md (architecture rules) and LAUNCH_GUIDE.md (run instructions, Stripe test flow, Areeba RFP, compliance gates).

## What this codebase is

A working MVP of a multi-building management and collections platform for Lebanon. The full product loop runs end-to-end today against Stripe test mode:

create building → add units → invite tenants (code + move-in meter snapshot) → meters & tariffs → readings (tenant submits, manager verifies, monotonic check) → shared expenses (equal/area/ownership/custom splits) → billing period preview → close period → immutable bills with per-line calculation proofs → tokenized card autopay with per-charge cap → webhooks settle payment status → maintenance / proposals & voting / project funds / reimbursement credits.

## Stack

| Layer | Tech | Location |
|---|---|---|
| API | NestJS 10 + Prisma 5 + PostgreSQL 16 | `backend/` |
| Manager portal | Next.js 14 (app router) | `web/` (desktop-first) |
| Tenant app | Same Next.js app, mobile-first PWA | `web/app/tenant/` |
| Tenant app (alt) | Single-file, zero-dependency HTML/JS | `baytos-app.html` (also served at `/app.html`) |
| DB dev env | docker-compose (Postgres) | `docker-compose.yml` |

The single-file app and the Next.js tenant app are equivalent clients over the same REST API — keep whichever fits your deployment; delete the other.

## Where the important logic lives

- `backend/prisma/schema.prisma` — the entire domain model. Read this first.
- `backend/src/billing/billing.service.ts` — the billing engine: meter charges from verified readings × tariffs, expense allocation with deterministic rounding, project-fund lines, arrears roll-forward (unpaid bills VOID into the next statement), reimbursement credits, immutable close in one transaction, then autopay scheduling.
- `backend/src/payments/` — PSP abstraction:
  - `psp.interface.ts` — the only two operations the platform needs from any PSP: `createSetupSession` (tokenize a card) and `chargeSavedMethod` (merchant-initiated charge on a token).
  - `stripe.adapter.ts` — complete reference implementation (SetupIntent, off-session PaymentIntent with idempotency keys, webhook signature verification).
  - `areeba.adapter.ts` — the skeleton to implement for Lebanese production. Same interface; flip `PAYMENT_PROVIDER=AREEBA` in env when done. LAUNCH_GUIDE §6 has the exact RFP questions to send Areeba first — do not start this integration before their merchant technical pack answers them.
  - `payments.service.ts` — provider-agnostic: mandate checks, per-charge caps, idempotent charging (sha256(billId:pmId)), webhook replay protection (`WebhookEvent` unique on provider+eventId).
- `backend/src/common/membership.util.ts` — cross-building isolation; every building-scoped route goes through it.

## Invariants — do not break these

1. Money is integers in minor units everywhere. No floats, ever.
2. Issued bills are immutable. Corrections are new statements; readings used in a bill are locked (`USED_IN_BILL`).
3. Every bill line carries a `calculation` JSON proof. The tenant-facing transparency is the product.
4. No PAN/CVV ever reaches the backend. Tokenization happens in the PSP's hosted form/iframe; we store token + brand/last4 only. Keep it this way for PCI scope (SAQ-A) and BDL compliance.
5. The platform never holds tenant funds. PSP settles to the building's account; platform commission via PSP application fee or SaaS billing. This is the line between a software company and an unlicensed payment intermediary under BDL Basic Decision 13790 — legal review before real cards is mandatory (LAUNCH_GUIDE §6).
6. Charges are idempotent and webhooks are replay-protected. Preserve both when writing the Areeba adapter.

## Known MVP shortcuts to address before production

- No automated tests. Priority order: billing engine unit tests (rounding, arrears, credits, snapshot boundaries), payment idempotency tests, then E2E on the close-period flow. The billing service is pure enough to test without mocking much.
- Auth is JWT access-token only (7d). Add refresh tokens/rotation, rate limiting, and password reset.
- Validation is service-level. Add class-validator DTOs on controllers.
- Single-currency (USD) per building. Schema carries `currency`; LBP display and dual-pricing is a product decision.
- `photoUrl` fields exist but no upload pipeline. Wire S3-compatible storage with pre-signed URLs (meter photos, expense receipts).
- No notifications. Web Push + WhatsApp Business API for "bill issued / payment failed / vote closing".
- Arabic: schema is bilingual (`nameAr`, `titleAr`) but UI catalogs/RTL layouts are not built.
- No admin/back-office, no double-entry ledger, no reconciliation screens (blueprint Phase 3 — needed before serious volume).
- Autopay triggers on period close. A production system should also have a scheduled retry worker for failed charges (cron/BullMQ).
- Dependency versions were pinned without a live install in the build environment — expect minor version friction on first `npm install`; nothing architectural.

## Deployment sketch

- API: any Node host (Railway/Render/ECS). `prisma migrate deploy` on release. Managed Postgres with PITR backups. Env vars per `.env.example`.
- Web (portal + tenant PWA): Vercel or any Node host; set `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_STRIPE_PK`.
- Webhooks: expose `/v1/webhooks/payments/stripe` publicly; raw-body handling is already configured in `main.ts`.
- Staging and production must be separate DBs and separate PSP credentials (test/sandbox vs live).

## Suggested first sprint

1. `npm install` everything, run the seed, walk the full demo flow per LAUNCH_GUIDE §2–5 (Stripe test mode, 4242 card, autopay on close).
2. Fix any install/type friction; commit lockfiles.
3. Add the billing-engine test suite.
4. Send the Areeba RFP (LAUNCH_GUIDE §6) — their response time is the critical path to Lebanese production, so start it now.
5. Deploy staging.
