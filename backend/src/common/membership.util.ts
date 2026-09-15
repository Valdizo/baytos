import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Cross-building isolation: every building-scoped call passes through here.
export async function requireMembership(
  prisma: PrismaService,
  userId: string,
  buildingId: string,
  roles?: string[],
) {
  const m = await prisma.buildingMembership.findFirst({
    where: { userId, buildingId, endDate: null },
  });
  if (!m) throw new ForbiddenException('Not a member of this building');
  if (roles && !roles.includes(m.role)) throw new ForbiddenException('Insufficient role');
  return m;
}

export function isManagerRole(role: string) {
  return role === 'PRESIDENT' || role === 'MANAGER';
}
