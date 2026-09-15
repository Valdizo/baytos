import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { requireMembership, isManagerRole } from '../common/membership.util';

@Injectable()
export class CommunityService {
  constructor(private prisma: PrismaService) {}

  // ---------------- Maintenance ----------------
  async createMaintenance(userId: string, buildingId: string, dto: any) {
    const m = await requireMembership(this.prisma, userId, buildingId);
    if (!dto?.title?.trim()) throw new BadRequestException('title required');
    return this.prisma.maintenanceRequest.create({
      data: {
        buildingId,
        unitId: dto.scope === 'PRIVATE_UNIT' ? m.unitId : null,
        reporterId: userId,
        scope: dto.scope || 'COMMON_AREA',
        category: dto.category,
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'MEDIUM',
        photoUrls: dto.photoUrls,
      },
    });
  }

  async listMaintenance(userId: string, buildingId: string) {
    const m = await requireMembership(this.prisma, userId, buildingId);
    // Tenants see common-area requests + their own; managers see everything.
    const where: any = { buildingId };
    if (!isManagerRole(m.role)) where.OR = [{ scope: 'COMMON_AREA' }, { reporterId: userId }];
    return this.prisma.maintenanceRequest.findMany({
      where,
      include: { reporter: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateMaintenance(userId: string, requestId: string, dto: { status: string; costMinor?: number }) {
    const req = await this.prisma.maintenanceRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    await requireMembership(this.prisma, userId, req.buildingId, ['PRESIDENT', 'MANAGER']);
    return this.prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: { status: dto.status as any, costMinor: dto.costMinor },
    });
  }

  // ---------------- Proposals & voting ----------------
  async createProposal(userId: string, buildingId: string, dto: any) {
    await requireMembership(this.prisma, userId, buildingId, ['PRESIDENT', 'MANAGER']);
    if (!dto?.titleEn?.trim()) throw new BadRequestException('titleEn required');
    return this.prisma.proposal.create({
      data: {
        buildingId,
        titleEn: dto.titleEn,
        titleAr: dto.titleAr,
        description: dto.description,
        estimatedCostMinor: dto.estimatedCostMinor,
        approvalThreshold: dto.approvalThreshold ?? 50,
        voterType: dto.voterType || 'BOTH',
        closesAt: new Date(dto.closesAt),
      },
    });
  }

  async listProposals(userId: string, buildingId: string) {
    await requireMembership(this.prisma, userId, buildingId);
    const proposals = await this.prisma.proposal.findMany({
      where: { buildingId },
      include: { votes: true },
      orderBy: { closesAt: 'desc' },
    });
    return proposals.map((p) => ({
      ...p,
      tally: {
        approve: p.votes.filter((v) => v.choice === 'APPROVE').length,
        reject: p.votes.filter((v) => v.choice === 'REJECT').length,
        abstain: p.votes.filter((v) => v.choice === 'ABSTAIN').length,
      },
      votes: undefined,
    }));
  }

  async vote(userId: string, proposalId: string, choice: string) {
    const proposal = await this.prisma.proposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== 'OPEN' || proposal.closesAt < new Date()) throw new BadRequestException('Voting is closed');
    const m = await requireMembership(this.prisma, userId, proposal.buildingId);
    if (!m.unitId) throw new BadRequestException('Only apartment members can vote');
    if (!['APPROVE', 'REJECT', 'ABSTAIN'].includes(choice)) throw new BadRequestException('Invalid choice');
    // One vote per apartment
    return this.prisma.vote.upsert({
      where: { proposalId_unitId: { proposalId, unitId: m.unitId } },
      create: { proposalId, unitId: m.unitId, userId, choice },
      update: { choice, userId, castAt: new Date() },
    });
  }

  async closeProposal(userId: string, proposalId: string) {
    const p = await this.prisma.proposal.findUnique({ where: { id: proposalId }, include: { votes: true } });
    if (!p) throw new NotFoundException('Proposal not found');
    await requireMembership(this.prisma, userId, p.buildingId, ['PRESIDENT', 'MANAGER']);
    const cast = p.votes.filter((v) => v.choice !== 'ABSTAIN').length;
    const approve = p.votes.filter((v) => v.choice === 'APPROVE').length;
    const approved = cast > 0 && (approve / cast) * 100 >= p.approvalThreshold;
    return this.prisma.proposal.update({ where: { id: proposalId }, data: { status: approved ? 'APPROVED' : 'REJECTED' } });
  }

  // ---------------- Project funds ----------------
  async createProject(userId: string, buildingId: string, dto: any) {
    await requireMembership(this.prisma, userId, buildingId, ['PRESIDENT', 'MANAGER']);
    if (!dto?.title?.trim()) throw new BadRequestException('title required');
    if (!dto?.targetMinor || dto.targetMinor <= 0) throw new BadRequestException('targetMinor must be positive');
    return this.prisma.projectFund.create({
      data: {
        buildingId,
        title: dto.title,
        description: dto.description,
        targetMinor: dto.targetMinor,
        monthlyPerUnitMinor: dto.monthlyPerUnitMinor,
        currency: dto.currency || 'USD',
      },
    });
  }

  async listProjects(userId: string, buildingId: string) {
    await requireMembership(this.prisma, userId, buildingId);
    const projects = await this.prisma.projectFund.findMany({
      where: { buildingId },
      include: { contributions: true },
      orderBy: { createdAt: 'desc' },
    });
    return projects.map((p) => {
      const collected = p.contributions.reduce((s, c) => s + c.amountMinor, 0);
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        targetMinor: p.targetMinor,
        monthlyPerUnitMinor: p.monthlyPerUnitMinor,
        collectedMinor: collected,
        progressPercent: p.targetMinor > 0 ? Math.min(100, Math.round((collected / p.targetMinor) * 100)) : 0,
        status: p.status,
      };
    });
  }

  async updateProjectStatus(userId: string, projectId: string, status: string) {
    const p = await this.prisma.projectFund.findUnique({ where: { id: projectId } });
    if (!p) throw new NotFoundException('Project not found');
    await requireMembership(this.prisma, userId, p.buildingId, ['PRESIDENT', 'MANAGER']);
    return this.prisma.projectFund.update({ where: { id: projectId }, data: { status: status as any } });
  }

  // ---------------- Reimbursements ----------------
  async createClaim(userId: string, buildingId: string, dto: any) {
    await requireMembership(this.prisma, userId, buildingId);
    if (!dto.amountMinor || dto.amountMinor <= 0) throw new BadRequestException('amountMinor must be positive');
    return this.prisma.reimbursementClaim.create({
      data: { buildingId, claimantId: userId, amountMinor: dto.amountMinor, description: dto.description, receiptUrl: dto.receiptUrl },
    });
  }

  async listClaims(userId: string, buildingId: string) {
    const m = await requireMembership(this.prisma, userId, buildingId);
    const where: any = { buildingId };
    if (!isManagerRole(m.role)) where.claimantId = userId; // tenants see only their own claims
    return this.prisma.reimbursementClaim.findMany({
      where,
      include: { claimant: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewClaim(userId: string, claimId: string, decision: 'APPROVED' | 'REJECTED') {
    const claim = await this.prisma.reimbursementClaim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException('Claim not found');
    await requireMembership(this.prisma, userId, claim.buildingId, ['PRESIDENT', 'MANAGER']);
    if (claim.status !== 'SUBMITTED') throw new BadRequestException('Claim already reviewed');
    // APPROVED claims automatically become credits on the unit's next statement.
    return this.prisma.reimbursementClaim.update({ where: { id: claimId }, data: { status: decision } });
  }
}
