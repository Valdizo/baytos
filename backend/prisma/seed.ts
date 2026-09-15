// Demo seed: one building, 4 units, meters, tariffs, readings, an expense,
// a proposal and a project fund — so you can preview and close a period
// immediately after launching.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('password123', 10);
  const president = await prisma.user.create({
    data: { email: 'president@demo.lb', name: 'Joseph Khoury', passwordHash: hash },
  });
  const tenant = await prisma.user.create({
    data: { email: 'tenant@demo.lb', name: 'Rita Haddad', passwordHash: hash },
  });

  const building = await prisma.building.create({
    data: {
      nameEn: 'Cedar Residence',
      nameAr: 'سكن الأرز',
      address: 'Mina Street, Tripoli',
      currency: 'USD',
      memberships: { create: { userId: president.id, role: 'PRESIDENT' } },
    },
  });

  const units = await Promise.all(
    ['1A', '1B', '2A', '2B'].map((n, i) =>
      prisma.unit.create({ data: { buildingId: building.id, unitNumber: n, floor: Math.floor(i / 2) + 1, areaM2: 120 } }),
    ),
  );

  await prisma.buildingMembership.create({
    data: { userId: tenant.id, buildingId: building.id, unitId: units[0].id, role: 'TENANT' },
  });

  // Tariffs: generator $0.42/kWh, water $1.50/m3
  await prisma.tariff.createMany({
    data: [
      { buildingId: building.id, meterType: 'GENERATOR', ratePerUnitMinor: 42, fixedFeeMinor: 800 },
      { buildingId: building.id, meterType: 'COLD_WATER', ratePerUnitMinor: 150, fixedFeeMinor: 0 },
    ],
  });

  for (const unit of units) {
    const gen = await prisma.meter.create({
      data: { buildingId: building.id, unitId: unit.id, type: 'GENERATOR', unitLabel: 'kWh' },
    });
    const water = await prisma.meter.create({
      data: { buildingId: building.id, unitId: unit.id, type: 'COLD_WATER', unitLabel: 'm3' },
    });
    const edl = await prisma.meter.create({
      data: { buildingId: building.id, unitId: unit.id, type: 'EDL', unitLabel: 'kWh' },
    });
    const base = 4000 + Math.floor(Math.random() * 500);
    const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    await prisma.meterReading.createMany({
      data: [
        { meterId: gen.id, value: base, status: 'VERIFIED', capturedAt: monthAgo },
        { meterId: gen.id, value: base + 150 + Math.floor(Math.random() * 80), status: 'VERIFIED' },
        { meterId: water.id, value: 100, status: 'VERIFIED', capturedAt: monthAgo },
        { meterId: water.id, value: 100 + 8 + Math.floor(Math.random() * 6), status: 'VERIFIED' },
        { meterId: edl.id, value: 16000, status: 'VERIFIED', capturedAt: monthAgo },
        { meterId: edl.id, value: 16150, status: 'VERIFIED' },
      ],
    });
  }

  await prisma.expense.create({
    data: {
      buildingId: building.id,
      category: 'ELEVATOR',
      description: 'Elevator monthly maintenance',
      amountMinor: 8000, // $80 split equally
      allocation: 'EQUAL',
    },
  });

  const now = new Date();
  await prisma.billingPeriod.create({
    data: {
      buildingId: building.id,
      label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    },
  });

  await prisma.proposal.create({
    data: {
      buildingId: building.id,
      titleEn: 'Repaint the lobby',
      titleAr: 'إعادة طلاء المدخل',
      description: 'Fresh paint + new lighting for the entrance lobby.',
      estimatedCostMinor: 120000,
      closesAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    },
  });

  await prisma.projectFund.create({
    data: {
      buildingId: building.id,
      title: 'New elevator',
      description: 'Replace the 1994 elevator.',
      targetMinor: 2500000, // $25,000
      monthlyPerUnitMinor: 5000, // $50/unit/month
    },
  });

  console.log('Seeded. Login: president@demo.lb / password123 (web) and tenant@demo.lb / password123 (mobile)');
}

main().finally(() => prisma.$disconnect());
