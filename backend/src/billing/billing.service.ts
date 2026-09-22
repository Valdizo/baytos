import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { requireMembership } from '../common/membership.util';
import { PaymentsService } from '../payments/payments.service';

type DraftLine = {
  description: string;
  category: string;
  quantity?: number;
  unitLabel?: string;
  amountMinor: number;
  calculation?: any;
};

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService, private payments: PaymentsService) {}

  async addExpense(userId: string, buildingId: string, dto: any) {
    await requireMembership(this.prisma, userId, buildingId, ['PRESIDENT', 'MANAGER']);
    if (!dto.amountMinor || dto.amountMinor <= 0) throw new BadRequestException('amountMinor must be positive (e.g. 1500 = $15.00)');
    return this.prisma.expense.create({
      data: {
        buildingId,
        category: dto.category,
        description: dto.description,
        amountMinor: dto.amountMinor,
        receiptUrl: dto.receiptUrl,
        allocation: dto.allocation || 'EQUAL',
        customSplit: dto.customSplit,
      },
    });
  }

  async listExpenses(userId: string, buildingId: string) {
    await requireMembership(this.prisma, userId, buildingId);
    return this.prisma.expense.findMany({ where: { buildingId }, orderBy: { incurredAt: 'desc' } });
  }

  async openPeriod(userId: string, buildingId: string, dto: { label: string; startDate: string; endDate: string }) {
    await requireMembership(this.prisma, userId, buildingId, ['PRESIDENT', 'MANAGER']);
    if (!dto?.label?.trim()) throw new BadRequestException('label required');
    const alreadyOpen = await this.prisma.billingPeriod.findFirst({ where: { buildingId, status: 'OPEN' } });
    if (alreadyOpen) throw new BadRequestException(`Period ${alreadyOpen.label} is still open — close it first`);
    try {
      return await this.prisma.billingPeriod.create({
        data: { buildingId, label: dto.label.trim(), startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) },
      });
    } catch (e: any) {
      // P2002 on (buildingId,label): that month was already billed. Say so instead
      // of leaking a 500 — and the caller can pick another label.
      if (e?.code === 'P2002')
        throw new BadRequestException(`A billing period labelled "${dto.label}" already exists for this building. Choose another label.`);
      throw e;
    }
  }

  // ----------------------------------------------------------------
  // The billing engine. Preview computes everything without writing;
  // close persists the same result immutably and schedules autopay.
  // ----------------------------------------------------------------
  private async computeDraft(buildingId: string, periodId: string) {
    const period = await this.prisma.billingPeriod.findUnique({ where: { id: periodId } });
    if (!period || period.buildingId !== buildingId) throw new NotFoundException('Billing period not found');

    const building = await this.prisma.building.findUnique({ where: { id: buildingId } });
    const units = await this.prisma.unit.findMany({ where: { buildingId }, orderBy: { unitNumber: 'asc' } });
    const tariffs = await this.prisma.tariff.findMany({ where: { buildingId }, orderBy: { effectiveFrom: 'desc' } });
    const pendingExpenses = await this.prisma.expense.findMany({ where: { buildingId, status: 'PENDING' } });
    const activeProjects = await this.prisma.projectFund.findMany({ where: { buildingId, status: 'FUNDING' } });

    const warnings: string[] = [];
    const perUnit: { unit: any; lines: DraftLine[]; totalMinor: number }[] = [];

    for (const unit of units) {
      const lines: DraftLine[] = [];

      // 1. Meter charges — the CURRENT reading must fall inside the period's
      //    date range; the PREVIOUS reading is whatever immediately preceded
      //    it (typically the prior period's USED_IN_BILL reading).
      const meters = await this.prisma.meter.findMany({ where: { buildingId, unitId: unit.id, active: true } });
      for (const meter of meters) {
        const current = await this.prisma.meterReading.findFirst({
          where: {
            meterId: meter.id,
            status: { in: ['VERIFIED', 'USED_IN_BILL'] },
            capturedAt: { gte: period.startDate, lte: period.endDate },
          },
          orderBy: { capturedAt: 'desc' },
        });
        if (!current) {
          warnings.push(`Unit ${unit.unitNumber}: ${meter.type} meter has no verified reading in this period — meter tracked but not billed`);
          continue;
        }
        const previous = await this.prisma.meterReading.findFirst({
          where: {
            meterId: meter.id,
            status: { in: ['VERIFIED', 'USED_IN_BILL'] },
            capturedAt: { lt: current.capturedAt },
          },
          orderBy: { capturedAt: 'desc' },
        });
        if (!previous) {
          warnings.push(`Unit ${unit.unitNumber}: ${meter.type} meter needs a prior baseline reading before ${period.startDate.toISOString().slice(0, 10)}`);
          continue;
        }
        const consumption =
          (Number(current.value) - Number(previous.value)) * Number(meter.multiplier);
        const tariff = tariffs.find((t) => t.meterType === meter.type && t.effectiveFrom <= period.endDate);
        if (!tariff) {
          if (meter.type !== 'EDL') warnings.push(`No tariff configured for ${meter.type} — meter tracked but not billed`);
          continue;
        }
        const amountMinor = Math.round(consumption * tariff.ratePerUnitMinor) + tariff.fixedFeeMinor;
        lines.push({
          description: `${meter.type} electricity/consumption`,
          category: meter.type,
          quantity: consumption,
          unitLabel: meter.unitLabel,
          amountMinor,
          calculation: {
            previousReading: previous.value,
            currentReading: current.value,
            multiplier: meter.multiplier,
            ratePerUnitMinor: tariff.ratePerUnitMinor,
            fixedFeeMinor: tariff.fixedFeeMinor,
            currentReadingId: current.id,
            previousReadingId: previous.id,
            currentPhotoUrl: current.photoUrl,
          },
        });
      }

      // 2. Shared expense allocations with deterministic rounding
      for (const exp of pendingExpenses) {
        let share = 0;
        if (exp.allocation === 'EQUAL') {
          const base = Math.floor(exp.amountMinor / units.length);
          const remainder = exp.amountMinor - base * units.length;
          const idx = units.findIndex((u) => u.id === unit.id);
          share = base + (idx < remainder ? 1 : 0); // first N units absorb the residual cents
        } else if (exp.allocation === 'AREA') {
          const totalArea = units.reduce((s, u) => s + Number(u.areaM2 || 0), 0);
          share = totalArea > 0 ? Math.round((Number(unit.areaM2 || 0) / totalArea) * exp.amountMinor) : 0;
        } else if (exp.allocation === 'OWNERSHIP') {
          const totalW = units.reduce((s, u) => s + Number(u.ownershipWeight), 0);
          share = Math.round((Number(unit.ownershipWeight) / totalW) * exp.amountMinor);
        } else if (exp.allocation === 'CUSTOM' && exp.customSplit) {
          share = (exp.customSplit as any)[unit.id] || 0;
        }
        if (share > 0) {
          lines.push({
            description: exp.description,
            category: 'EXPENSE',
            amountMinor: share,
            calculation: { expenseId: exp.id, totalMinor: exp.amountMinor, allocation: exp.allocation, receiptUrl: exp.receiptUrl },
          });
        }
      }

      // 3. Project fund contributions
      for (const project of activeProjects) {
        lines.push({
          description: `Project fund: ${project.title}`,
          category: 'PROJECT',
          amountMinor: project.monthlyPerUnitMinor,
          calculation: { projectId: project.id },
        });
      }

      // 4. Arrears — unpaid previous bills roll forward
      const unpaid = await this.prisma.bill.aggregate({
        where: { unitId: unit.id, status: { in: ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'] } },
        _sum: { totalMinor: true },
      });
      const arrears = unpaid._sum.totalMinor || 0;
      if (arrears > 0) {
        lines.push({ description: 'Previous unpaid balance', category: 'ARREARS', amountMinor: arrears });
      }

      // 5. Approved reimbursements become credits for the claimant's unit
      const memberIds = (
        await this.prisma.buildingMembership.findMany({ where: { unitId: unit.id, endDate: null } })
      ).map((m) => m.userId);
      const claims = await this.prisma.reimbursementClaim.findMany({
        where: { buildingId, claimantId: { in: memberIds }, status: 'APPROVED' },
      });
      for (const claim of claims) {
        lines.push({
          description: `Reimbursement credit: ${claim.description}`,
          category: 'CREDIT',
          amountMinor: -claim.amountMinor,
          calculation: { claimId: claim.id },
        });
      }

      const totalMinor = lines.reduce((s, l) => s + l.amountMinor, 0);
      perUnit.push({ unit, lines, totalMinor });
    }

    return { period, building, perUnit, warnings, expenses: pendingExpenses };
  }

  async preview(userId: string, buildingId: string, periodId: string) {
    await requireMembership(this.prisma, userId, buildingId, ['PRESIDENT', 'MANAGER']);
    const draft = await this.computeDraft(buildingId, periodId);
    return {
      periodId,
      label: draft.period.label,
      warnings: draft.warnings,
      units: draft.perUnit.map((d) => ({
        unitId: d.unit.id,
        unitNumber: d.unit.unitNumber,
        totalMinor: d.totalMinor,
        lines: d.lines,
      })),
      grandTotalMinor: draft.perUnit.reduce((s, d) => s + d.totalMinor, 0),
    };
  }

  async closePeriod(userId: string, buildingId: string, periodId: string, opts: { scheduleAutopay?: boolean } = {}) {
    await requireMembership(this.prisma, userId, buildingId, ['PRESIDENT', 'MANAGER']);
    const draft = await this.computeDraft(buildingId, periodId);
    if (draft.period.status === 'CLOSED') throw new BadRequestException('Period already closed');

    const dueAt = new Date(draft.period.endDate);
    dueAt.setDate(dueAt.getDate() + (draft.building.dueDay || 10));

    const billIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const d of draft.perUnit) {
        if (d.lines.length === 0) continue;
        const bill = await tx.bill.create({
          data: {
            unitId: d.unit.id,
            periodId,
            totalMinor: d.totalMinor,
            currency: draft.building.currency,
            dueAt,
            lineItems: {
              create: d.lines.map((l) => ({
                description: l.description,
                category: l.category,
                quantity: l.quantity,
                unitLabel: l.unitLabel,
                amountMinor: l.amountMinor,
                calculation: l.calculation,
              })),
            },
          },
        });
        billIds.push(bill.id);

        // Mark readings as consumed, arrears bills as rolled into this one, credits as applied
        for (const l of d.lines) {
          if (l.calculation?.currentReadingId)
            await tx.meterReading.update({ where: { id: l.calculation.currentReadingId }, data: { status: 'USED_IN_BILL' } });
          if (l.category === 'CREDIT' && l.calculation?.claimId)
            await tx.reimbursementClaim.update({ where: { id: l.calculation.claimId }, data: { status: 'CREDITED' } });
          if (l.category === 'PROJECT' && l.calculation?.projectId)
            await tx.projectContribution.create({
              data: { projectId: l.calculation.projectId, unitId: d.unit.id, amountMinor: l.amountMinor },
            });
        }
        if (d.lines.some((l) => l.category === 'ARREARS')) {
          await tx.bill.updateMany({
            where: { unitId: d.unit.id, status: { in: ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'] }, id: { not: bill.id } },
            data: { status: 'VOID' }, // rolled into the new statement
          });
        }
      }
      await tx.expense.updateMany({ where: { buildingId, status: 'PENDING' }, data: { status: 'ALLOCATED', periodId } });
      await tx.billingPeriod.update({ where: { id: periodId }, data: { status: 'CLOSED', closedAt: new Date() } });
      await tx.auditLog.create({
        data: { actorId: userId, buildingId, action: 'BILLING_PERIOD_CLOSED', resource: periodId, metadata: { billCount: billIds.length } },
      });
    });

    // Schedule autopay charges (outside the transaction; PSP is the source of truth)
    let paymentJobs = 0;
    if (opts.scheduleAutopay !== false) {
      for (const billId of billIds) {
        const charged = await this.payments.autochargeBill(billId).catch(() => false);
        if (charged) paymentJobs++;
      }
    }
    return { periodId, status: 'CLOSED', issuedBills: billIds.length, paymentJobsCreated: paymentJobs, warnings: draft.warnings };
  }

  async getBill(userId: string, billId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { lineItems: true, unit: true, period: { include: { building: true } }, payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!bill) throw new NotFoundException('Bill not found');
    const membership = await requireMembership(this.prisma, userId, bill.period.buildingId);
    // Tenants only see their own unit's bills
    if (!['PRESIDENT', 'MANAGER'].includes(membership.role) && membership.unitId !== bill.unitId)
      throw new NotFoundException('Bill not found');
    return bill;
  }

  async myBills(userId: string) {
    const memberships = await this.prisma.buildingMembership.findMany({ where: { userId, endDate: null, unitId: { not: null } } });
    return this.prisma.bill.findMany({
      where: { unitId: { in: memberships.map((m) => m.unitId) } },
      include: { period: { include: { building: { select: { nameEn: true, currency: true } } } } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async buildingBills(userId: string, buildingId: string) {
    await requireMembership(this.prisma, userId, buildingId, ['PRESIDENT', 'MANAGER']);
    return this.prisma.bill.findMany({
      where: { period: { buildingId } },
      include: { unit: true, period: true, payments: true },
      orderBy: { issuedAt: 'desc' },
    });
  }
}
