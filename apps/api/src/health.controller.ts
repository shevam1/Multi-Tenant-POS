import { Controller, Get } from '@nestjs/common';
import { PROVINCIAL_TAX_MATRIX } from '@omnipos/core';
import { Public } from './auth/decorators';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'omnipos-api',
      provincesSupported: Object.keys(PROVINCIAL_TAX_MATRIX).length,
      time: new Date().toISOString(),
    };
  }
}
