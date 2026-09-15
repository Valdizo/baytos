# Baytos — Building management platform for Lebanon

MVP monorepo implementing the core loop of your blueprint:
**create building → apartments → invite tenants → meters → readings → expenses → billing preview → close period → tokenized card autopay → transparent statements**, plus maintenance requests, proposals/voting, project funds and reimbursement credits.

```
baytos/
├── backend/   NestJS + Prisma + PostgreSQL — REST API /v1, billing engine, PSP abstraction (Stripe live, Areeba skeleton)
├── web/       Next.js app — manager portal (desktop) + tenant mobile app at /tenant (installable PWA)
└── LAUNCH_GUIDE.md  ← start here
```

Demo logins after seeding: `president@demo.lb` / `password123` (manager portal) and `tenant@demo.lb` / `password123` (tenant app at `/tenant`).

The tenant app is a mobile-first PWA: open it in the phone's browser and use **Add to Home Screen** — it installs with its own icon and runs full-screen like a native app, with no app store, no Xcode/Android Studio, and instant updates when you redeploy.

Key design rules baked in (from the blueprint):
- All money is stored as **integers in minor units** (`amountMinor`), never floats.
- **Issued bills are immutable** — readings used in a bill are locked; corrections happen through new statements.
- Every bill line carries a **calculation JSON** (previous/current reading, rate, expense receipt) so tenants can tap any line and see the proof.
- **No card data ever touches the backend** — PSP tokenization only (PAN/CVV are never stored, only token + brand/last4).
- Autopay is a **versioned mandate with a per-charge cap**: bills above the tenant's cap are never auto-charged.
- Idempotency keys + webhook replay protection mean a retry can never double-charge.
- Cross-building isolation: every building-scoped endpoint verifies active membership.
