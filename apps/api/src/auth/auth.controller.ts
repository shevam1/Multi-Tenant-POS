import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { LoginDto } from './dto/login.dto';
import type { AuthUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** Returns the current authenticated user with live profile + permissions. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }

  /** Self-service profile update (any authenticated user, own record). */
  @Patch('me')
  updateProfile(@Body() dto: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return this.auth.updateProfile(user.userId, dto);
  }

  /** Self-service password change (requires current password). */
  @Post('me/password')
  changePassword(
    @Body() dto: { currentPassword: string; newPassword: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.auth.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }
}
