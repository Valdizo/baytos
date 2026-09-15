import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './common/prisma.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { BuildingsController } from './buildings/buildings.controller';
import { BuildingsService } from './buildings/buildings.service';
import { MetersController } from './meters/meters.controller';
import { MetersService } from './meters/meters.service';
import { BillingController } from './billing/billing.controller';
import { BillingService } from './billing/billing.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { StripeAdapter } from './payments/stripe.adapter';
import { AreebaAdapter } from './payments/areeba.adapter';
import { CommunityController } from './community/community.controller';
import { CommunityService } from './community/community.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [
    AuthController,
    BuildingsController,
    MetersController,
    BillingController,
    PaymentsController,
    CommunityController,
  ],
  providers: [
    PrismaService,
    AuthService,
    BuildingsService,
    MetersService,
    BillingService,
    PaymentsService,
    StripeAdapter,
    AreebaAdapter,
    CommunityService,
  ],
})
export class AppModule {}
