import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(dto: { email: string; name: string; password: string; phone?: string; locale?: string }) {
    if (!dto?.email?.trim()) throw new BadRequestException('email required');
    if (!dto?.name?.trim()) throw new BadRequestException('name required');
    if (!dto?.password) throw new BadRequestException('password required');
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (exists) throw new BadRequestException('Email already registered');
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        phone: dto.phone,
        locale: dto.locale || 'en',
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
    });
    return this.issue(user.id, user.email);
  }

  async login(dto: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash)))
      throw new UnauthorizedException('Wrong email or password');
    return this.issue(user.id, user.email);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, locale: true },
    });
    const memberships = await this.prisma.buildingMembership.findMany({
      where: { userId, endDate: null },
      include: { building: { select: { id: true, nameEn: true, currency: true } }, unit: true },
    });
    return { user, memberships };
  }

  private async issue(sub: string, email: string) {
    return { accessToken: await this.jwt.signAsync({ sub, email }) };
  }
}
