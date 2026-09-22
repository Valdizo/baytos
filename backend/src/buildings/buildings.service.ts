import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { requireMembership } from '../common/membership.util';
import { randomBytes } from 'crypto';

@Injectable()
export class BuildingsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: any) {
    if (!dto?.nameEn?.trim()) throw new BadRequestException('nameEn required');
    const building = await this.prisma.building.create({
      data: {
        nameEn: dto.nameEn,
        nameAr: dto.nameAr,
        address: dto.address,
        currency: dto.currency || 'USD',
        billingDay: dto.billingDay ?? 1,
        dueDay: dto.dueDay ?? 10,
        memberships: { create: { userId, role: 'PRESIDENT' } },
      },
    });
    await this.prisma.auditLog.create({
      data: { actorId: userId, buildingId: building.id, action: 'BUILDING_CREATED' },
    });
    return building;
  }

  async dashboard(userId: string, buildingId: string) {
    await requireMembership(this.prisma, userId, buildingId);
    const [building, units, openPeriod, unpaid, openMaintenance, openProposals, projects] = await Promise.all([
      this.prisma.building.findUnique({ where: { id: buildingId } }),
      this.prisma.unit.count({ where: { buildingId } }),
      this.prisma.billingPeriod.findFirst({ where: { buildingId, status: 'OPEN' } }),
      this.prisma.bill.aggregate({
        where: { period: { buildingId }, status: { in: ['ISSUED', 'OVERDUE', 'PARTIALLY_PAID'] } },
        _sum: { totalMinor: true },
        _count: true,
      }),
      this.prisma.maintenanceRequest.count({ where: { buildingId, status: { in: ['NEW', 'TRIAGED', 'APPROVED', 'IN_PROGRESS'] } } }),
      this.prisma.proposal.count({ where: { buildingId, status: 'OPEN' } }),
      this.prisma.projectFund.findMany({
        where: { buildingId, status: { in: ['FUNDING', 'FUNDED', 'IN_PROGRESS'] } },
        include: { contributions: true },
      }),
    ]);
    return {
      building,
      unitCount: units,
      openPeriod,
      unpaidTotalMinor: unpaid._sum.totalMinor || 0,
      unpaidBillCount: unpaid._count,
      openMaintenance,
      openProposals,
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        targetMinor: p.targetMinor,
        collectedMinor: p.contributions.reduce((s, c) => s + c.amountMinor, 0),
        status: p.status,
      })),
    };
  }

  // Building settings: Whish payment QR, currency, billing/due days.
  async updateSettings(userId: string, buildingId: string, dto: any) {
    await requireMembership(this.prisma, userId, buildingId, ['PRESIDENT', 'MANAGER']);
    const data: any = {};
    if (dto.whishQrData !== undefined) {
      if (dto.whishQrData && !/^data:image\/(png|jpe?g|webp);base64,/.test(dto.whishQrData))
        throw new BadRequestException('whishQrData must be a base64 image data URL');
      if (dto.whishQrData && dto.whishQrData.length > 400_000)
        throw new BadRequestException('QR image too large — keep it under ~300KB');
      data.whishQrData = dto.whishQrData || null;
    }
    if (dto.whishRecipient !== undefined) data.whishRecipient = dto.whishRecipient?.trim() || null;
    if (dto.currency !== undefined) data.currency = String(dto.currency).toUpperCase().slice(0, 3);
    if (dto.dueDay !== undefined) {
      const d = Number(dto.dueDay);
      if (!Number.isInteger(d) || d < 1 || d > 28) throw new BadRequestException('dueDay must be 1-28');
      data.dueDay = d;
    }
    if (!Object.keys(data).length) throw new BadRequestException('nothing to update');
    return this.prisma.building.update({ where: { id: buildingId }, data });
  }

  // A tenant moving out: close the membership instead of deleting it, so their
  // bills and readings stay attached to the apartment's history.
  async endMembership(userId: string, membershipId: string) {
    const m = await this.prisma.buildingMembership.findUnique({ where: { id: membershipId } });
    if (!m) throw new NotFoundException('Membership not found');
    await requireMembership(this.prisma, userId, m.buildingId, ['PRESIDENT', 'MANAGER']);
    if (m.endDate) throw new BadRequestException('This tenancy has already ended');
    return this.prisma.buildingMembership.update({ where: { id: membershipId }, data: { endDate: new Date() } });
  }

  async addUnits(userId: string, buildingId: string, units: any[]) {
    await requireMembership(this.prisma, userId, buildingId, ['PRESIDENT', 'MANAGER']);
    if (!Array.isArray(units) || units.length === 0) throw new BadRequestException('units array required');
    if (units.some((u) => !String(u?.unitNumber ?? '').trim())) throw new BadRequestException('unitNumber required for every unit');
    try {
      return await this.prisma.$transaction(
        units.map((u) =>
          this.prisma.unit.create({
            data: {
              buildingId,
              unitNumber: String(u.unitNumber),
              floor: u.floor ?? null,
              areaM2: u.areaM2 ?? null,
              ownershipWeight: u.ownershipWeight ?? 1,
            },
          }),
        ),
      );
    } catch (e: any) {
      // P2002 = unique constraint; the only one on Unit is (buildingId, unitNumber)
      if (e?.code === 'P2002') throw new BadRequestException('A unit with that number already exists in this building');
      throw e;
    }
  }

  async listUnits(userId: string, buildingId: string) {
    await requireMembership(this.prisma, userId, buildingId);
    return this.prisma.unit.findMany({
      where: { buildingId },
      include: {
        memberships: { where: { endDate: null }, include: { user: { select: { name: true, email: true } } } },
        meters: { where: { active: true } },
        mandate: true,
      },
      orderBy: { unitNumber: 'asc' },
    });
  }

  async invite(userId: string, unitId: string, role: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Unit not found');
    await requireMembership(this.prisma, userId, unit.buildingId, ['PRESIDENT', 'MANAGER']);
    // One active tenant per apartment: a second membership would mean two people
    // billed for and seeing the same statements.
    if ((role || 'TENANT') === 'TENANT') {
      const occupant = await this.prisma.buildingMembership.findFirst({
        where: { unitId, role: 'TENANT', endDate: null },
        include: { user: { select: { name: true } } },
      });
      if (occupant)
        throw new BadRequestException(
          `This apartment is occupied by ${occupant.user.name}. End their tenancy before inviting a new tenant.`,
        );
    }
    const code = randomBytes(4).toString('hex').toUpperCase();
    return this.prisma.invitation.create({
      data: {
        buildingId: unit.buildingId,
        unitId,
        role: (role as any) || 'TENANT',
        code,
        expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      },
    });
  }

  // Tenant joins with invite code; records move-in snapshot from provided readings.
  async acceptInvitation(userId: string, dto: { code: string; readings?: Record<string, string>; moveDate?: string }) {
    if (!dto?.code?.trim()) throw new BadRequestException('code required');
    const inv = await this.prisma.invitation.findUnique({ where: { code: dto.code }, include: { unit: true } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new BadRequestException('Invalid or expired invitation code');
    if (inv.role === 'TENANT') {
      const occupant = await this.prisma.buildingMembership.findFirst({
        where: { unitId: inv.unitId, role: 'TENANT', endDate: null },
      });
      if (occupant) throw new BadRequestException('This apartment already has an active tenant');
    }

    const [membership] = await this.prisma.$transaction([
      this.prisma.buildingMembership.create({
        data: { userId, buildingId: inv.buildingId, unitId: inv.unitId, role: inv.role },
      }),
      this.prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } }),
      this.prisma.moveInSnapshot.create({
        data: {
          unitId: inv.unitId,
          userId,
          moveDate: dto.moveDate ? new Date(dto.moveDate) : new Date(),
          readings: dto.readings || {},
          acceptedAt: new Date(),
        },
      }),
    ]);

    // Move-in readings become the tenant's verified baseline so they never pay old consumption.
    if (dto.readings) {
      for (const [meterId, value] of Object.entries(dto.readings)) {
        const meter = await this.prisma.meter.findFirst({ where: { id: meterId, unitId: inv.unitId } });
        if (meter) {
          await this.prisma.meterReading.create({
            data: { meterId, value, source: 'MANUAL', status: 'VERIFIED', submittedById: userId },
          });
        }
      }
    }
    return membership;
  }
}
