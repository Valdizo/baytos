import { BillingService } from './billing.service';
import { MetersService } from '../meters/meters.service';
import { BadRequestException } from '@nestjs/common';

// ---------------------------------------------------------------------------
// A tiny in-memory Prisma stand-in. Only implements the tables and methods
// billing.service.ts + meters.service.ts actually touch. Every model gets its
// own `_rows` array so tests can seed data directly.
// ---------------------------------------------------------------------------

function makeMockPrisma() {
  const state: any = {
    buildingMembership: [] as any[],
    building: [] as any[],
    unit: [] as any[],
    tariff: [] as any[],
    expense: [] as any[],
    projectFund: [] as any[],
    meter: [] as any[],
    meterReading: [] as any[],
    bill: [] as any[],
    billLineItem: [] as any[],
    reimbursementClaim: [] as any[],
    projectContribution: [] as any[],
    billingPeriod: [] as any[],
    auditLog: [] as any[],
  };

  const matches = (row: any, where: any): boolean => {
    if (!where) return true;
    for (const [k, v] of Object.entries(where)) {
      if (v === null) {
        if (row[k] !== null && row[k] !== undefined) return false;
      } else if (typeof v === 'object' && !(v instanceof Date)) {
        const op: any = v;
        if ('in' in op) {
          if (!op.in.includes(row[k])) return false;
        } else if ('not' in op) {
          if (row[k] === op.not) return false;
        } else if ('gte' in op || 'lte' in op || 'gt' in op || 'lt' in op) {
          const val = row[k];
          if (val == null) return false;
          const t = val instanceof Date ? val.getTime() : val;
          const cmp = (x: any) => (x instanceof Date ? x.getTime() : x);
          if ('gte' in op && !(t >= cmp(op.gte))) return false;
          if ('lte' in op && !(t <= cmp(op.lte))) return false;
          if ('gt' in op && !(t > cmp(op.gt))) return false;
          if ('lt' in op && !(t < cmp(op.lt))) return false;
        } else {
          // nested object equality (rare) — deep compare
          if (JSON.stringify(row[k]) !== JSON.stringify(v)) return false;
        }
      } else {
        if (row[k] !== v) return false;
      }
    }
    return true;
  };

  const table = (name: string) => ({
    findFirst: async ({ where, orderBy }: any = {}) => {
      let rows = state[name].filter((r: any) => matches(r, where));
      if (orderBy) {
        const [k, dir] = Object.entries(orderBy)[0] as [string, string];
        rows = [...rows].sort((a, b) =>
          dir === 'desc' ? (a[k] < b[k] ? 1 : -1) : a[k] < b[k] ? -1 : 1,
        );
      }
      return rows[0] || null;
    },
    findUnique: async ({ where }: any) => {
      const [k, v] = Object.entries(where)[0] as [string, any];
      return state[name].find((r: any) => r[k] === v) || null;
    },
    findMany: async ({ where, orderBy, take }: any = {}) => {
      let rows = state[name].filter((r: any) => matches(r, where));
      if (orderBy) {
        const [k, dir] = Object.entries(orderBy)[0] as [string, string];
        rows = [...rows].sort((a, b) =>
          dir === 'desc' ? (a[k] < b[k] ? 1 : -1) : a[k] < b[k] ? -1 : 1,
        );
      }
      if (take) rows = rows.slice(0, take);
      return rows;
    },
    create: async ({ data }: any) => {
      const row = { id: data.id || `${name}_${state[name].length + 1}`, ...data };
      state[name].push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const [k, v] = Object.entries(where)[0] as [string, any];
      const row = state[name].find((r: any) => r[k] === v);
      if (!row) throw new Error(`${name} not found`);
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      const rows = state[name].filter((r: any) => matches(r, where));
      for (const r of rows) Object.assign(r, data);
      return { count: rows.length };
    },
    aggregate: async ({ where, _sum }: any) => {
      const rows = state[name].filter((r: any) => matches(r, where));
      const sum: any = {};
      for (const field of Object.keys(_sum || {})) {
        sum[field] = rows.reduce((s: number, r: any) => s + (r[field] || 0), 0);
      }
      return { _sum: sum };
    },
  });

  const prisma: any = {
    _state: state,
    buildingMembership: table('buildingMembership'),
    building: table('building'),
    unit: table('unit'),
    tariff: table('tariff'),
    expense: table('expense'),
    projectFund: table('projectFund'),
    meter: table('meter'),
    meterReading: table('meterReading'),
    bill: {
      ...table('bill'),
      create: async ({ data }: any) => {
        const { lineItems, ...rest } = data;
        const row = { id: `bill_${state.bill.length + 1}`, status: 'ISSUED', issuedAt: new Date(), ...rest };
        state.bill.push(row);
        if (lineItems?.create) {
          for (const li of lineItems.create) {
            state.billLineItem.push({ id: `li_${state.billLineItem.length + 1}`, billId: row.id, ...li });
          }
        }
        return row;
      },
    },
    billLineItem: table('billLineItem'),
    reimbursementClaim: table('reimbursementClaim'),
    projectContribution: table('projectContribution'),
    billingPeriod: table('billingPeriod'),
    auditLog: table('auditLog'),
    $transaction: async (fn: any) => fn(prisma),
  };
  return prisma;
}

// Membership always allows — we test billing math, not auth.
function seedManager(prisma: any, userId: string, buildingId: string) {
  prisma._state.buildingMembership.push({
    id: 'm1', userId, buildingId, unitId: null, role: 'PRESIDENT', endDate: null,
  });
}

// PaymentsService stub — closePeriod calls autochargeBill; we return false.
const payments: any = { autochargeBill: jest.fn(async () => false) };

// ---------------------------------------------------------------------------

describe('BillingService — pure computation', () => {
  const USER = 'user_manager';
  const B = 'bldg_1';

  let prisma: any;
  let svc: BillingService;

  beforeEach(() => {
    prisma = makeMockPrisma();
    seedManager(prisma, USER, B);
    svc = new BillingService(prisma, payments);

    prisma._state.building.push({ id: B, currency: 'USD', billingDay: 1, dueDay: 10, nameEn: 'Test' });
    prisma._state.billingPeriod.push({
      id: 'period_1', buildingId: B, label: '2026-09',
      startDate: new Date('2026-09-01'), endDate: new Date('2026-09-30'),
      status: 'OPEN',
    });
  });

  // --------------------------- 1. Meter charges ----------------------------
  describe('meter charge calculation', () => {
    function seedMeterWithReadings(type: string, tariffRate: number, prev: string, curr: string, opts: any = {}) {
      const unitId = 'unit_A';
      prisma._state.unit.push({ id: unitId, buildingId: B, unitNumber: '1', areaM2: 100, ownershipWeight: 1 });
      const meterId = `m_${type}`;
      prisma._state.meter.push({
        id: meterId, buildingId: B, unitId, type,
        unitLabel: type === 'COLD_WATER' ? 'm3' : 'kWh',
        multiplier: opts.multiplier ?? 1, active: true,
      });
      prisma._state.tariff.push({
        id: `t_${type}`, buildingId: B, meterType: type,
        ratePerUnitMinor: tariffRate, fixedFeeMinor: opts.fixedFeeMinor ?? 0,
        effectiveFrom: new Date('2026-01-01'),
      });
      prisma._state.meterReading.push({
        id: 'r_prev', meterId, value: prev, status: 'VERIFIED',
        capturedAt: new Date('2026-09-01T00:00:00Z'),
      });
      prisma._state.meterReading.push({
        id: 'r_curr', meterId, value: curr, status: 'VERIFIED',
        capturedAt: new Date('2026-09-30T00:00:00Z'),
      });
      return { unitId, meterId };
    }

    it('GENERATOR — kWh × rate rounds to the nearest cent', async () => {
      // 150.0 - 100.5 = 49.5 kWh × 42 cents = 2079 cents (exact, no rounding).
      seedMeterWithReadings('GENERATOR', 42, '100.5', '150.0');
      const preview = await svc.preview(USER, B, 'period_1');
      const line = preview.units[0].lines.find((l) => l.category === 'GENERATOR');
      expect(line).toBeDefined();
      expect(line!.quantity).toBeCloseTo(49.5, 6);
      expect(line!.amountMinor).toBe(2079);
    });

    it('COLD_WATER — fractional consumption rounds to nearest minor unit', async () => {
      // 12.345 - 10.000 = 2.345 m3 × 75 cents = 175.875 → rounds to 176.
      seedMeterWithReadings('COLD_WATER', 75, '10.000', '12.345');
      const preview = await svc.preview(USER, B, 'period_1');
      const line = preview.units[0].lines.find((l) => l.category === 'COLD_WATER');
      expect(line!.amountMinor).toBe(176);
    });

    it('EDL — fixed fee added on top of consumption charge', async () => {
      // 220 - 200 = 20 kWh × 30 cents = 600, + 250 fixed = 850.
      seedMeterWithReadings('EDL', 30, '200', '220', { fixedFeeMinor: 250 });
      const preview = await svc.preview(USER, B, 'period_1');
      const line = preview.units[0].lines.find((l) => l.category === 'EDL');
      expect(line!.amountMinor).toBe(850);
    });

    it('CT multiplier scales consumption before rate is applied', async () => {
      // (110 - 100) * multiplier 20 = 200 kWh × 10 cents = 2000 minor.
      seedMeterWithReadings('GENERATOR', 10, '100', '110', { multiplier: 20 });
      const preview = await svc.preview(USER, B, 'period_1');
      const line = preview.units[0].lines.find((l) => l.category === 'GENERATOR');
      expect(line!.amountMinor).toBe(2000);
    });
  });

  // --------------------------- 2. Expense allocation -----------------------
  describe('expense allocation — no rounding drift across units', () => {
    function seedUnits(specs: { id: string; area: number; weight: number }[]) {
      for (const s of specs) {
        prisma._state.unit.push({
          id: s.id, buildingId: B, unitNumber: s.id,
          areaM2: s.area, ownershipWeight: s.weight,
        });
      }
    }
    function seedExpense(amountMinor: number, allocation: string, customSplit?: any) {
      prisma._state.expense.push({
        id: 'exp_1', buildingId: B, category: 'ELEVATOR', description: 'Elevator repair',
        amountMinor, allocation, customSplit, status: 'PENDING',
      });
    }

    it('EQUAL — 1000 / 3 units = 334 + 333 + 333 (sums to 1000)', async () => {
      seedUnits([
        { id: 'u1', area: 100, weight: 1 },
        { id: 'u2', area: 100, weight: 1 },
        { id: 'u3', area: 100, weight: 1 },
      ]);
      seedExpense(1000, 'EQUAL');
      const preview = await svc.preview(USER, B, 'period_1');
      const shares = preview.units.map((u) =>
        u.lines.find((l) => l.category === 'EXPENSE')!.amountMinor,
      );
      expect(shares).toEqual([334, 333, 333]);
      expect(shares.reduce((s, x) => s + x, 0)).toBe(1000);
    });

    it('EQUAL — 100 / 7 units distributes the residual over the first N units', async () => {
      seedUnits(
        Array.from({ length: 7 }, (_, i) => ({ id: `u${i}`, area: 100, weight: 1 })),
      );
      seedExpense(100, 'EQUAL');
      const preview = await svc.preview(USER, B, 'period_1');
      const shares = preview.units.map((u) =>
        u.lines.find((l) => l.category === 'EXPENSE')!.amountMinor,
      );
      // 100 = 14 * 7 + 2 → 2 units get 15, 5 units get 14 = 30 + 70 = 100
      expect(shares.filter((s) => s === 15)).toHaveLength(2);
      expect(shares.filter((s) => s === 14)).toHaveLength(5);
      expect(shares.reduce((s, x) => s + x, 0)).toBe(100);
    });

    it('AREA — split proportional to areaM2 (drift acknowledged: sum may vary by ≤ N cents)', async () => {
      seedUnits([
        { id: 'u1', area: 100, weight: 1 },
        { id: 'u2', area: 50, weight: 1 },
        { id: 'u3', area: 50, weight: 1 },
      ]);
      seedExpense(2000, 'AREA');
      const preview = await svc.preview(USER, B, 'period_1');
      const shares = preview.units.map((u) =>
        u.lines.find((l) => l.category === 'EXPENSE')!.amountMinor,
      );
      // 100/200 * 2000 = 1000, 50/200 * 2000 = 500, 50/200 * 2000 = 500
      expect(shares).toEqual([1000, 500, 500]);
      expect(shares.reduce((s, x) => s + x, 0)).toBe(2000);
    });

    it('OWNERSHIP — split proportional to ownership weight', async () => {
      seedUnits([
        { id: 'u1', area: 100, weight: 2 },
        { id: 'u2', area: 100, weight: 1 },
        { id: 'u3', area: 100, weight: 1 },
      ]);
      seedExpense(400, 'OWNERSHIP');
      const preview = await svc.preview(USER, B, 'period_1');
      const shares = preview.units.map((u) =>
        u.lines.find((l) => l.category === 'EXPENSE')!.amountMinor,
      );
      // 2/4=200, 1/4=100, 1/4=100 → sum 400
      expect(shares).toEqual([200, 100, 100]);
      expect(shares.reduce((s, x) => s + x, 0)).toBe(400);
    });

    it('CUSTOM — uses caller-supplied per-unit amounts verbatim', async () => {
      seedUnits([
        { id: 'u1', area: 100, weight: 1 },
        { id: 'u2', area: 100, weight: 1 },
      ]);
      seedExpense(1000, 'CUSTOM', { u1: 700, u2: 300 });
      const preview = await svc.preview(USER, B, 'period_1');
      const shares = preview.units.map((u) =>
        u.lines.find((l) => l.category === 'EXPENSE')!.amountMinor,
      );
      expect(shares).toEqual([700, 300]);
      expect(shares.reduce((s, x) => s + x, 0)).toBe(1000);
    });
  });

  // --------------------------- 3. Arrears roll-forward ---------------------
  describe('arrears roll-forward', () => {
    it('unpaid prior bill appears as ARREARS line and is VOIDed on close', async () => {
      const unitId = 'u_arr';
      prisma._state.unit.push({ id: unitId, buildingId: B, unitNumber: '1', areaM2: 100, ownershipWeight: 1 });
      // A previous unpaid bill on a prior period.
      prisma._state.billingPeriod.push({
        id: 'period_0', buildingId: B, label: '2026-08',
        startDate: new Date('2026-08-01'), endDate: new Date('2026-08-31'),
        status: 'CLOSED',
      });
      prisma._state.bill.push({
        id: 'bill_prior', unitId, periodId: 'period_0',
        totalMinor: 5000, currency: 'USD', status: 'ISSUED',
        issuedAt: new Date('2026-08-05'), dueAt: new Date('2026-08-15'),
      });
      // Seed a current-period meter reading so a new bill is issued.
      prisma._state.meter.push({ id: 'm1', buildingId: B, unitId, type: 'GENERATOR', unitLabel: 'kWh', multiplier: 1, active: true });
      prisma._state.tariff.push({ id: 't1', buildingId: B, meterType: 'GENERATOR', ratePerUnitMinor: 10, fixedFeeMinor: 0, effectiveFrom: new Date('2026-01-01') });
      prisma._state.meterReading.push({ id: 'rp', meterId: 'm1', value: '100', status: 'VERIFIED', capturedAt: new Date('2026-09-01') });
      prisma._state.meterReading.push({ id: 'rc', meterId: 'm1', value: '150', status: 'VERIFIED', capturedAt: new Date('2026-09-30') });

      const preview = await svc.preview(USER, B, 'period_1');
      const arr = preview.units[0].lines.find((l) => l.category === 'ARREARS');
      expect(arr).toBeDefined();
      expect(arr!.amountMinor).toBe(5000);
      // Current bill total = 500 (meter) + 5000 (arrears) = 5500.
      expect(preview.units[0].totalMinor).toBe(5500);

      // Close the period and confirm the prior bill is VOIDed.
      await svc.closePeriod(USER, B, 'period_1');
      const prior = prisma._state.bill.find((b: any) => b.id === 'bill_prior');
      expect(prior.status).toBe('VOID');
      // A new bill was issued for period_1.
      const newBill = prisma._state.bill.find((b: any) => b.periodId === 'period_1');
      expect(newBill.totalMinor).toBe(5500);
      expect(newBill.status).toBe('ISSUED');
    });
  });

  // --------------------------- 4. Reimbursement credits --------------------
  describe('reimbursement credits', () => {
    it('APPROVED claim reduces the claimant unit total via a negative line', async () => {
      const unitId = 'u_r';
      prisma._state.unit.push({ id: unitId, buildingId: B, unitNumber: '1', areaM2: 100, ownershipWeight: 1 });
      const tenantId = 'tenant_1';
      prisma._state.buildingMembership.push({
        id: 'm_tenant', userId: tenantId, buildingId: B, unitId, role: 'TENANT', endDate: null,
      });
      // Seed a meter charge so the bill has a positive base.
      prisma._state.meter.push({ id: 'm1', buildingId: B, unitId, type: 'GENERATOR', unitLabel: 'kWh', multiplier: 1, active: true });
      prisma._state.tariff.push({ id: 't1', buildingId: B, meterType: 'GENERATOR', ratePerUnitMinor: 10, fixedFeeMinor: 0, effectiveFrom: new Date('2026-01-01') });
      prisma._state.meterReading.push({ id: 'rp', meterId: 'm1', value: '100', status: 'VERIFIED', capturedAt: new Date('2026-09-01') });
      prisma._state.meterReading.push({ id: 'rc', meterId: 'm1', value: '200', status: 'VERIFIED', capturedAt: new Date('2026-09-30') });
      prisma._state.reimbursementClaim.push({
        id: 'claim_1', buildingId: B, claimantId: tenantId,
        amountMinor: 300, description: 'lightbulbs', status: 'APPROVED',
      });

      const preview = await svc.preview(USER, B, 'period_1');
      const credit = preview.units[0].lines.find((l) => l.category === 'CREDIT');
      expect(credit).toBeDefined();
      expect(credit!.amountMinor).toBe(-300);
      // 1000 meter - 300 credit = 700.
      expect(preview.units[0].totalMinor).toBe(700);
    });
  });

  // --------------------------- 5. Period / snapshot boundaries -------------
  describe('period boundaries and reading reuse', () => {
    it('a USED_IN_BILL reading is not reused as the CURRENT reading of the next bill', async () => {
      // The engine picks the top-2 latest readings from {VERIFIED, USED_IN_BILL}.
      // If a prior bill consumed a reading (marked USED_IN_BILL) and a NEW
      // VERIFIED reading exists, then {new, used} become {current, previous} —
      // correct roll-over. But USED_IN_BILL as the CURRENT reading would mean
      // no new reading exists, so a fresh bill should NOT be re-charging the
      // same consumption. We assert the current reading is the newest one.
      const unitId = 'u_x';
      prisma._state.unit.push({ id: unitId, buildingId: B, unitNumber: '1', areaM2: 100, ownershipWeight: 1 });
      prisma._state.meter.push({ id: 'm1', buildingId: B, unitId, type: 'GENERATOR', unitLabel: 'kWh', multiplier: 1, active: true });
      prisma._state.tariff.push({ id: 't1', buildingId: B, meterType: 'GENERATOR', ratePerUnitMinor: 10, fixedFeeMinor: 0, effectiveFrom: new Date('2026-01-01') });
      // Prior period's readings: previous consumed as USED_IN_BILL, current also USED_IN_BILL.
      prisma._state.meterReading.push({ id: 'r1', meterId: 'm1', value: '100', status: 'USED_IN_BILL', capturedAt: new Date('2026-08-01') });
      prisma._state.meterReading.push({ id: 'r2', meterId: 'm1', value: '150', status: 'USED_IN_BILL', capturedAt: new Date('2026-08-30') });
      // New verified reading for the current period.
      prisma._state.meterReading.push({ id: 'r3', meterId: 'm1', value: '210', status: 'VERIFIED', capturedAt: new Date('2026-09-30') });

      const preview = await svc.preview(USER, B, 'period_1');
      const line = preview.units[0].lines.find((l) => l.category === 'GENERATOR');
      // Should be (210 - 150) * 10 = 600, NOT (150 - 100) * 10 = 500 or (210 - 100) * 10 = 1100.
      expect(line).toBeDefined();
      expect(line!.amountMinor).toBe(600);
      expect(line!.calculation.currentReadingId).toBe('r3');
      expect(line!.calculation.previousReadingId).toBe('r2');
    });

    it('stale VERIFIED reading is not picked when a newer in-period reading exists', async () => {
      // Regression: computeDraft used to take the top-2 readings by capturedAt
      // regardless of date. A tenant re-verifying a two-month-old reading
      // (e.g. after a delayed manager review) could have leapfrogged the
      // current in-period reading and been billed against the wrong baseline.
      const unitId = 'u_stale';
      prisma._state.unit.push({ id: unitId, buildingId: B, unitNumber: '1', areaM2: 100, ownershipWeight: 1 });
      prisma._state.meter.push({ id: 'm1', buildingId: B, unitId, type: 'GENERATOR', unitLabel: 'kWh', multiplier: 1, active: true });
      prisma._state.tariff.push({ id: 't1', buildingId: B, meterType: 'GENERATOR', ratePerUnitMinor: 10, fixedFeeMinor: 0, effectiveFrom: new Date('2026-01-01') });
      // Stale reading — two months before the period.
      prisma._state.meterReading.push({ id: 'r_stale', meterId: 'm1', value: '999', status: 'VERIFIED', capturedAt: new Date('2026-07-15') });
      // Baseline captured just before the period.
      prisma._state.meterReading.push({ id: 'r_baseline', meterId: 'm1', value: '100', status: 'USED_IN_BILL', capturedAt: new Date('2026-08-30') });
      // In-period reading.
      prisma._state.meterReading.push({ id: 'r_curr', meterId: 'm1', value: '160', status: 'VERIFIED', capturedAt: new Date('2026-09-30') });

      const preview = await svc.preview(USER, B, 'period_1');
      const line = preview.units[0].lines.find((l) => l.category === 'GENERATOR');
      expect(line).toBeDefined();
      // Correct: (160 - 100) * 10 = 600. Bug would have produced (999 - 160) * 10 = 8390 or similar.
      expect(line!.amountMinor).toBe(600);
      expect(line!.calculation.currentReadingId).toBe('r_curr');
      expect(line!.calculation.previousReadingId).toBe('r_baseline');
    });

    it('when no in-period reading exists, meter is warned + skipped (not billed)', async () => {
      const unitId = 'u_gap';
      prisma._state.unit.push({ id: unitId, buildingId: B, unitNumber: '5B', areaM2: 100, ownershipWeight: 1 });
      prisma._state.meter.push({ id: 'm1', buildingId: B, unitId, type: 'GENERATOR', unitLabel: 'kWh', multiplier: 1, active: true });
      prisma._state.tariff.push({ id: 't1', buildingId: B, meterType: 'GENERATOR', ratePerUnitMinor: 10, fixedFeeMinor: 0, effectiveFrom: new Date('2026-01-01') });
      // Only stale readings — none in Sept.
      prisma._state.meterReading.push({ id: 'r_old1', meterId: 'm1', value: '100', status: 'USED_IN_BILL', capturedAt: new Date('2026-07-01') });
      prisma._state.meterReading.push({ id: 'r_old2', meterId: 'm1', value: '150', status: 'USED_IN_BILL', capturedAt: new Date('2026-08-01') });

      const preview = await svc.preview(USER, B, 'period_1');
      expect(preview.units[0].lines.find((l) => l.category === 'GENERATOR')).toBeUndefined();
      expect(preview.warnings.some((w) => w.includes('5B') && w.includes('no verified reading in this period'))).toBe(true);
    });

    it('after closing a period, the current reading is marked USED_IN_BILL', async () => {
      const unitId = 'u_close';
      prisma._state.unit.push({ id: unitId, buildingId: B, unitNumber: '1', areaM2: 100, ownershipWeight: 1 });
      prisma._state.meter.push({ id: 'm1', buildingId: B, unitId, type: 'GENERATOR', unitLabel: 'kWh', multiplier: 1, active: true });
      prisma._state.tariff.push({ id: 't1', buildingId: B, meterType: 'GENERATOR', ratePerUnitMinor: 10, fixedFeeMinor: 0, effectiveFrom: new Date('2026-01-01') });
      prisma._state.meterReading.push({ id: 'rp', meterId: 'm1', value: '100', status: 'VERIFIED', capturedAt: new Date('2026-09-01') });
      prisma._state.meterReading.push({ id: 'rc', meterId: 'm1', value: '150', status: 'VERIFIED', capturedAt: new Date('2026-09-30') });

      await svc.closePeriod(USER, B, 'period_1');
      const curr = prisma._state.meterReading.find((r: any) => r.id === 'rc');
      expect(curr.status).toBe('USED_IN_BILL');
      // Period was also flipped to CLOSED.
      const period = prisma._state.billingPeriod.find((p: any) => p.id === 'period_1');
      expect(period.status).toBe('CLOSED');
    });
  });
});

// -----------------------------------------------------------------------
// 6. Immutability — verifyReading rejects an already USED_IN_BILL reading.
// -----------------------------------------------------------------------
describe('MetersService — immutability of consumed readings', () => {
  it('verifyReading throws when the reading is already USED_IN_BILL', async () => {
    const prisma = makeMockPrisma();
    const USER = 'user_manager';
    const B = 'bldg_1';
    seedManager(prisma, USER, B);
    prisma._state.meter.push({ id: 'm1', buildingId: B, unitId: 'u1', type: 'GENERATOR', unitLabel: 'kWh', multiplier: 1, active: true });
    prisma._state.meterReading.push({ id: 'r1', meterId: 'm1', value: '100', status: 'USED_IN_BILL', capturedAt: new Date() });
    // meters.service.verifyReading includes { meter: true }, so patch findUnique to hydrate it.
    const originalFindUnique = prisma.meterReading.findUnique;
    prisma.meterReading.findUnique = async ({ where }: any) => {
      const row = await originalFindUnique({ where });
      if (!row) return null;
      const meter = prisma._state.meter.find((m: any) => m.id === row.meterId);
      return { ...row, meter };
    };

    const meters = new MetersService(prisma);
    await expect(meters.verifyReading(USER, 'r1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
