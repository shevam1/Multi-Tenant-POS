import type { DomainModule, IndustryId } from './domain-module.contract';

/**
 * Registry of available domain modules. The API registers every shipped module
 * at boot; each tenant's `industry` selects which one is active for its requests.
 */
export class ModuleRegistry {
  private readonly modules = new Map<IndustryId, DomainModule>();

  register(module: DomainModule): this {
    if (this.modules.has(module.id)) {
      throw new Error(`Domain module already registered: ${module.id}`);
    }
    this.modules.set(module.id, module);
    return this;
  }

  get(id: IndustryId): DomainModule {
    const mod = this.modules.get(id);
    if (!mod) {
      throw new Error(`No domain module registered for industry: ${id}`);
    }
    return mod;
  }

  has(id: IndustryId): boolean {
    return this.modules.has(id);
  }

  list(): DomainModule[] {
    return [...this.modules.values()];
  }
}
