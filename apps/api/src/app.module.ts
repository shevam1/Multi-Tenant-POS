import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsModule } from 'nestjs-cls';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { BookingsModule } from './bookings/bookings.module';
import { ContactMaskInterceptor } from './common/contact-mask.interceptor';
import { CustomersModule } from './customers/customers.module';
import { HealthController } from './health.controller';
import { ModuleRegistryModule } from './modules/module-registry';
import { PosModule } from './pos/pos.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TenantsModule } from './tenants/tenants.module';
import { VaccinationsModule } from './vaccinations/vaccinations.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { FormsModule } from './forms/forms.module';
import { MembershipsModule } from './memberships/memberships.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { StripeModule } from './stripe/stripe.module';
import { StaffModule } from './staff/staff.module';
import { CatalogModule } from './catalog/catalog.module';
import { CouponsModule } from './coupons/coupons.module';
import { MessagingModule } from './messaging/messaging.module';
import { ProductsModule } from './products/products.module';
import { FinanceModule } from './finance/finance.module';
import { SettingsModule } from './settings/settings.module';
import { RolesAdminModule } from './roles/roles.module';
import { PetOptionsModule } from './pet-options/pet-options.module';
import { PayrollModule } from './payroll/payroll.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    ScheduleModule.forRoot(),
    StripeModule,
    PrismaModule,
    AuditModule,
    RealtimeModule,
    ModuleRegistryModule,
    AuthModule,
    CustomersModule,
    BookingsModule,
    PosModule,
    TenantsModule,
    VaccinationsModule,
    SchedulingModule,
    FormsModule,
    MembershipsModule,
    AnalyticsModule,
    StaffModule,
    CatalogModule,
    CouponsModule,
    MessagingModule,
    ProductsModule,
    FinanceModule,
    SettingsModule,
    RolesAdminModule,
    PetOptionsModule,
    PayrollModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ContactMaskInterceptor },
  ],
})
export class AppModule {}
