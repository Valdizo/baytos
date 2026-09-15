# Recover local dev environment after IntelliJ crash

## Task
IntelliJ crashed mid-setup on 2026-09-07. Verify what state the local Baytos
stack was actually in, then resume from wherever it stopped — without
restarting anything that was already working. End state: Postgres, NestJS
backend on :4000, and Next.js web on :3000 all running; auth flow understood.

## Files changed
- `claude-docs/` — created (did not exist before this session)
- No source files modified. `web/.env.local` and `backend/.env` were checked
  and found already correct; no edits needed.

## Flow documentation

### The bring-up flow this task walked through

**Purpose.** Get a developer from a cold machine (or a crashed IDE) to a
fully running Baytos stack without duplicating work that was already done in
a prior session. The state to check is spread across Docker, two `.env`
files, Prisma's migrations table, and two listening ports.

**Trigger.** Manual — developer opens a terminal after a crash and wants to
know "where was I?"

**End.** Both dev servers are listening (`:4000` backend, `:3000` web), the
database is reachable from the backend, and the browser at
`http://localhost:3000` returns HTTP 200.

**Step-by-step sequence:**

1. **Docker check** — `docker ps -a` to see whether `baytos-db-1` exists and
   is running. On this machine it was already up (started ~18 min earlier),
   mapped as `0.0.0.0:5434->5432/tcp`.
2. **Compose file read** — `docker-compose.yml` defines a single `db`
   service (postgres:16), `POSTGRES_USER/PASSWORD/DB=baytos`, host port
   `5434:5432`, volume `pgdata`. **Host port 5434 is deliberate** — see
   Notes.
3. **Backend env read** — `backend/.env` must have
   `DATABASE_URL="postgresql://baytos:baytos@localhost:5434/baytos?schema=public"`,
   `JWT_SECRET` (64-char hex), `PORT=4000`. All three were present. Also
   contains Stripe test placeholders and empty Areeba fields (unused in
   dev).
4. **Prisma state** — `backend/prisma/migrations/` contains one folder
   `20260906220016_init` with a `migration.sql`. Running
   `npx prisma migrate status` from `backend/` printed
   *"Database schema is up to date!"* — the migration was already applied.
5. **Seed check** — before running any seed, count rows in a table the seed
   populates:
   `docker exec baytos-db-1 psql -U baytos -d baytos -c 'SELECT count(*) FROM "User";'`
   Returned 2. Seed already ran; **skipped** `npm run seed`.
6. **Backend start** — `npm run dev` in `backend/` (script is `dev`, not the
   Nest default `start:dev`; it runs `nest start --watch`). Nest logged all
   `/v1/*` routes and printed `Baytos API running on :4000`. Verified with
   `lsof -iTCP:4000 -sTCP:LISTEN` (node PID listening) and
   `curl http://localhost:4000/v1/bills/mine` → `HTTP 401` (expected —
   `AuthGuard` rejects unauthenticated requests, meaning the app *and* the
   guard are working).
7. **Web env check** — `web/.env.local` existed and contained exactly
   `NEXT_PUBLIC_API_URL=http://localhost:4000`. No fix needed.
8. **Web start** — `npm run dev` in `web/` (`next dev -p 3000`). Log:
   `✓ Ready in 3.7s`. Verified with `lsof -iTCP:3000` and
   `curl http://localhost:3000` → `HTTP 200`.

**Branching / edge cases:**
- If `baytos-db-1` is stopped: `docker compose up -d` from repo root.
- If migration not applied: `npx prisma migrate deploy` (production-safe) or
  `npx prisma migrate dev` (dev, will regenerate the client).
- If seed table is empty: `npm run seed` in `backend/`.
- If `web/.env.local` is missing: create with the single line
  `NEXT_PUBLIC_API_URL=http://localhost:4000`.

**Databases / tables touched:** read-only `SELECT count(*) FROM "User"` for
the seed check. No writes performed by this task.

**External calls:** none.

### The auth / role / tenant onboarding flow (learned mid-task)

**Why documented.** The user asked "how do I sign in a tenant?" after
registering and being routed to what looked like an admin panel. The answer
is not obvious from the UI, so capturing it here for future sessions.

**Model.** `User` has no role field. Roles live in `BuildingMembership`
(`role: PRESIDENT | MANAGER | OWNER | TENANT`, scoped to a
`(userId, buildingId, unitId?)`). Registering only creates a `User`;
creating a building elevates that user to PRESIDENT/MANAGER of that
building, which is why the app routes them to the admin/building panel.

**Endpoints (backend):**
- `POST /v1/auth/register` `{email, name, password, phone?, locale?}` →
  `{accessToken}`. Just creates a User. No role assigned.
- `POST /v1/auth/login` `{email, password}` → `{accessToken}`.
- `GET  /v1/auth/me` → `{user, memberships[]}`. The web app uses
  `memberships` to decide which portal to show.
- `POST /v1/buildings` (auth required) — creates a building; the creator
  becomes PRESIDENT of it.
- `POST /v1/buildings/:id/units` `{units: [...]}` — admin adds units.
- `POST /v1/units/:unitId/invitations` `{role: "TENANT"}` — admin
  (PRESIDENT/MANAGER only; enforced by `requireMembership`) issues an
  8-char hex invite `code`, valid 14 days.
- `POST /v1/invitations/accept`
  `{code, readings?: {meterId: "value"}, moveDate?}` — the invited user
  (any authenticated User) redeems the code. In one transaction: creates
  the `BuildingMembership` with the invitation's role, marks the invitation
  accepted, and writes a `MoveInSnapshot`.

**Web routes:**
- `/` — register/login landing
- `/building/[id]` — admin/manager portal (auto-routed after building
  creation)
- `/tenant/join` — where a tenant pastes their invite code
- `/tenant/{bill,card,community,readings}` — tenant portal pages

**End-to-end tenant onboarding:**
1. Admin (existing account) adds a unit to their building.
2. Admin generates a TENANT invite for that unit → gets an 8-char code.
3. Tenant registers a *separate* User (different email).
4. Tenant navigates to `/tenant/join`, enters the code (+ optional meter
   readings + move-in date).
5. Backend creates `BuildingMembership(role=TENANT)` + `MoveInSnapshot`;
   from then on the tenant is routed to `/tenant/*`.

**Tables written by the accept step:** `BuildingMembership` (insert),
`Invitation` (update `acceptedAt`), `MoveInSnapshot` (insert) — all in a
single Prisma `$transaction`.

## Notes
- **Postgres runs on host port 5434, not the default 5432.** 5432 and 5433
  are occupied by other local Postgres instances on this machine (5433 is
  `erp-postgres`, unrelated). Do not "helpfully" change the compose file
  back to 5432 — it will conflict. Any code or env that references the DB
  must use `localhost:5434`.
- `backend/.env` was already configured before this session: `DATABASE_URL`
  (pointing at 5434), `JWT_SECRET`, `PORT=4000`. Don't overwrite from
  `.env.example` blindly — you'll lose the JWT secret.
- **Seed was already applied before this session** (User table had 2 rows on
  entry). Always `SELECT count(*)` on a seeded table before running
  `npm run seed` again — the seed is not idempotent in a way we've
  verified, and re-running could duplicate demo data or fail on unique
  constraints.
- **Demo logins seeded in the DB:**
  - `president@demo.lb` / `password123` — routes to the manager/admin
    portal (PRESIDENT membership on the demo building)
  - `tenant@demo.lb` / `password123` — routes to the tenant app
    (TENANT membership on a demo unit)
- **Both dev servers were left running in the background during this
  session:**
  - Backend: `npm run dev` from `backend/` (Nest watch, PID 19192 on :4000)
  - Web: `npm run dev` from `web/` (Next.js 14.2.35, PID 19276 on :3000)
  If you resume in a new terminal, check with
  `lsof -iTCP:4000,3000 -sTCP:LISTEN` before restarting — the previous
  process may still be alive.
- Nest `package.json` script is `dev` (custom), not the Nest CLI default
  `start:dev`. `npm run dev` from repo root happens to work because
  `nest-cli.json` lives inside `backend/` and `npm` walks up — but the
  explicit form is `cd backend && npm run dev`.
- A second Postgres container (`erp-postgres`) is running on host port 5433
  for an unrelated project. Leave it alone.

## Additional context
User explicitly requested the following be preserved in this doc, in their
own words (paraphrased into the Notes section above): the 5434 port choice
and *why* other ports are taken; the pre-existing `.env` state; not to
re-seed blindly; the two demo logins; and that both dev servers were left
running.
