import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { ContactMaskInterceptor } from './common/contact-mask.interceptor';
import { HealthController } from './health.controller';
import { ModuleRegistryModule } from './modules/module-registry';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Mounts an async context per request (before guards) so tenant id flows
    // from auth into the tenant-scoped Prisma client.
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    PrismaModule,
    AuditModule,
    ModuleRegistryModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ContactMaskInterceptor },
  ],
})
export class AppModule {}
