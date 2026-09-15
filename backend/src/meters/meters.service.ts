import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { requireMembership, isManagerRole } from '../common/membership.util';

@Injectable()
export class MetersService {
  constructor(private prisma: PrismaService) {}

  async createMeter(userId: string, buildingId: string, dto: any) {
    await requireMembership(this.prisma, userId, buildingId, ['PRESIDENT', 'MANAGER']);
    return this.prisma.meter.create({
      data: {
        buildingId,
        unitId: dto.unitId || null,
        type: dto.type,
        serial: dto.serial,
        unitLabel: dto.unitLabel || (String(dto.type).includes('WATER') ? 'm3' : 'kWh'),
        multiplier: dto.multiplier ?? 1,
      },
    });
  }

  async createTariff(userId: string, buildingId: string, dto: any) {
    await requireMembership(this.prisma, userId, buildingId, ['PRESIDENT', 'MANAGER']);
    return this.prisma.tariff.create({
      data: {
        buildingId,
        meterType: dto.meterType,
        ratePerUnitMinor: dto.ratePerUnitMinor,
        fixedFeeMinor: dto.fixedFeeMinor ?? 0,
        currency: dto.currency || 'USD',
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
      },
    });
  }

  async listTariffs(userId: string, buildingId: string) {
    await requireMembership(this.prisma, userId, buildingId);
    return this.prisma.tariff.findMany({ where: { buildingId }, orderBy: { effectiveFrom: 'desc' } });
  }

  async submitReading(userId: string, meterId: string, dto: { value: string; photoUrl?: string; capturedAt?: string }) {
    const meter = await this.prisma.meter.findUnique({ where: { id: meterId } });
    if (!meter) throw new NotFoundException('Meter not found');
    const membership = await requireMembership(this.prisma, userId, meter.buildingId);

    // A tenant may only submit readings for their own apartment's meters.
    if (!isManagerRole(membership.role) && meter.unitId !== membership.unitId)
      throw new BadRequestException('You can only submit readings for your own apartment');

    const previous = await this.prisma.meterReading.findFirst({
      where: { meterId, status: { in: ['VERIFIED', 'USED_IN_BILL'] } },
      orderBy: { capturedAt: 'desc' },
    });

    const value = Number(dto.value);
    if (isNaN(value) || value < 0) throw new BadRequestException('Reading must be a positive number');
    if (previous && value < Number(previous.value)) {
      throw new BadRequestException(
        `METER_READING_BELOW_PREVIOUS: last verified reading is ${previous.value}. Report a meter replacement or correct the value.`,
      );
    }

    const reading = await this.prisma.meterReading.create({
      data: {
        meterId,
        value: dto.value,
        photoUrl: dto.photoUrl,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : new Date(),
        submittedById: userId,
        // Managers' readings are auto-verified; tenants' await manager verification.
        status: isManagerRole(membership.role) ? 'VERIFIED' : 'SUBMITTED',
      },
    });
    return { ...reading, previousVerifiedValue: previous?.value ?? null, delta: previous ? value - Number(previous.value) : null };
  }

  async verifyReading(userId: string, readingId: string) {
    const reading = await this.prisma.meterReading.findUnique({ where: { id: readingId }, include: { meter: true } });
    if (!reading) throw new NotFoundException('Reading not found');
    await requireMembership(this.prisma, userId, reading.meter.buildingId, ['PRESIDENT', 'MANAGER']);
    if (reading.status === 'USED_IN_BILL') throw new BadRequestException('Reading already used in an issued bill');
    return this.prisma.meterReading.update({ where: { id: readingId }, data: { status: 'VERIFIED' } });
  }

  async consumption(userId: string, meterId: string) {
    const meter = await this.prisma.meter.findUnique({ where: { id: meterId } });
    if (!meter) throw new NotFoundException('Meter not found');
    await requireMembership(this.prisma, userId, meter.buildingId);
    const readings = await this.prisma.meterReading.findMany({
      where: { meterId, status: { in: ['VERIFIED', 'USED_IN_BILL'] } },
      orderBy: { capturedAt: 'asc' },
      take: 24,
    });
    const points = readings.map((r, i) => ({
      capturedAt: r.capturedAt,
      value: r.value,
      consumption: i === 0 ? null : Number(r.value) - Number(readings[i - 1].value),
    }));
    return { meter, points };
  }

  async readingGrid(userId: string, buildingId: string) {
    await requireMembership(this.prisma, userId, buildingId, ['PRESIDENT', 'MANAGER']);
    const meters = await this.prisma.meter.findMany({
      where: { buildingId, active: true },
      include: {
        unit: true,
        readings: { where: { status: { in: ['SUBMITTED', 'VERIFIED', 'USED_IN_BILL'] } }, orderBy: { capturedAt: 'desc' }, take: 2 },
      },
    });
    return meters.map((m) => ({
      meterId: m.id,
      type: m.type,
      unitLabel: m.unitLabel,
      unitNumber: m.unit?.unitNumber || 'COMMON',
      latest: m.readings[0] || null,
      previous: m.readings[1] || null,
    }));
  }
}
