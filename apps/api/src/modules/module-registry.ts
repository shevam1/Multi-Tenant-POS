import { Global, Module } from '@nestjs/common';
import { ModuleRegistry } from '@omnipos/core';
import petGroomingModule from '@omnipos/domain-pet';
import restaurantModule from '@omnipos/domain-restaurant';
import { ModulesController } from './modules.controller';
import { MODULE_REGISTRY } from './module-registry.token';

function createRegistry(): ModuleRegistry {
  return new ModuleRegistry().register(petGroomingModule).register(restaurantModule);
}

@Global()
@Module({
  controllers: [ModulesController],
  providers: [{ provide: MODULE_REGISTRY, useFactory: createRegistry }],
  exports: [MODULE_REGISTRY],
})
export class ModuleRegistryModule {}
