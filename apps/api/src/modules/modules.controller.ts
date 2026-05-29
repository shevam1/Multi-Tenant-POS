import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { ModuleRegistry } from '@omnipos/core';
import type { IndustryId } from '@omnipos/core';
import { Public } from '../auth/decorators';
import { MODULE_REGISTRY } from './module-registry.token';

/** Exposes domain-module metadata so the front-ends can render generic UI. */
@Controller('modules')
export class ModulesController {
  constructor(@Inject(MODULE_REGISTRY) private readonly registry: ModuleRegistry) {}

  @Public()
  @Get()
  list() {
    return this.registry.list().map((m) => ({ id: m.id, labels: m.labels }));
  }

  @Public()
  @Get(':industry')
  get(@Param('industry') industry: string) {
    if (!this.registry.has(industry as IndustryId)) {
      throw new NotFoundException(`No module for industry: ${industry}`);
    }
    return this.registry.get(industry as IndustryId);
  }
}
