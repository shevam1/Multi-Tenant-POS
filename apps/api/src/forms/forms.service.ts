import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRegistry } from '@omnipos/core';
import type { ConsentFormDef, IndustryId } from '@omnipos/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MODULE_REGISTRY } from '../modules/module-registry.token';

export interface FormFieldDef {
  key: string;
  label: string;
  type: 'text' | 'checkbox' | 'date' | 'signature';
  required?: boolean;
}

export interface SaveTemplateDto {
  formType: string;
  title: string;
  mandatory: boolean;
  fields: FormFieldDef[];
  dispatchHoursBefore?: number | null;
}

/** Unified form definition — whether module-default or custom. */
export interface EffectiveForm {
  formType: string;
  title: string;
  mandatory: boolean;
  fields: FormFieldDef[];
  source: 'MODULE' | 'CUSTOM';
  dispatchHoursBefore?: number | null;
}

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(MODULE_REGISTRY) private readonly registry: ModuleRegistry,
  ) {}

  /** Module-default forms for a tenant's industry. */
  private moduleForms(industry: IndustryId): EffectiveForm[] {
    if (!this.registry.has(industry)) return [];
    return this.registry.get(industry).consentForms.map((f: ConsentFormDef) => ({
      formType: f.formType,
      title: f.title,
      mandatory: f.mandatory,
      fields: f.fields as FormFieldDef[],
      source: 'MODULE' as const,
    }));
  }

  /**
   * All forms a tenant uses = module defaults + custom templates.
   * A custom template with the same formType overrides the module default.
   */
  async effectiveForms(tenantId: string): Promise<EffectiveForm[]> {
    const tenant = await this.prisma.asSystem(tx => tx.tenant.findUnique({ where: { id: tenantId } }));
    if (!tenant) throw new NotFoundException('Tenant not found');

    const defaults = this.moduleForms(tenant.industry as IndustryId);
    // Use explicit tenant-scoped client: this method is called from both the
    // authenticated builder AND the public (no-JWT) signing flow.
    const custom = await this.prisma.forTenant(tenantId).formTemplate.findMany({ where: { active: true } });

    const customForms: EffectiveForm[] = custom.map(t => ({
      formType: t.formType,
      title: t.title,
      mandatory: t.mandatory,
      fields: t.fields as unknown as FormFieldDef[],
      source: 'CUSTOM' as const,
      dispatchHoursBefore: t.dispatchHoursBefore,
    }));

    const customTypes = new Set(customForms.map(f => f.formType));
    return [...defaults.filter(d => !customTypes.has(d.formType)), ...customForms];
  }

  // ── Template CRUD (the "builder" persistence) ──────────────────────────────

  async listTemplates() {
    return this.prisma.db.formTemplate.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async saveTemplate(dto: SaveTemplateDto, tenantId: string) {
    const existing = await this.prisma.db.formTemplate.findFirst({ where: { formType: dto.formType } });
    const data = {
      title: dto.title,
      mandatory: dto.mandatory,
      fields: dto.fields as unknown as object,
      dispatchHoursBefore: dto.dispatchHoursBefore ?? null,
    };

    const template = existing
      ? await this.prisma.db.formTemplate.update({ where: { id: existing.id }, data })
      : await this.prisma.db.formTemplate.create({
          data: { tenantId, formType: dto.formType, ...data },
        });

    await this.audit.log({ action: existing ? 'FORM_TEMPLATE_UPDATE' : 'FORM_TEMPLATE_CREATE', entityType: 'form_template', entityId: template.id });
    return template;
  }

  async deleteTemplate(id: string) {
    await this.prisma.db.formTemplate.update({ where: { id }, data: { active: false } });
    await this.audit.log({ action: 'FORM_TEMPLATE_DELETE', entityType: 'form_template', entityId: id });
  }

  // ── Signature enforcement ──────────────────────────────────────────────────

  /**
   * Returns the mandatory forms for a booking that have NOT yet been signed.
   * Spec §6: "Appointments cannot move from Pending to Confirmed without a
   * verified digital signature."
   */
  async unsignedMandatoryForms(bookingId: string, tenantId: string): Promise<string[]> {
    const forms = await this.effectiveForms(tenantId);
    const mandatory = forms.filter(f => f.mandatory).map(f => f.formType);
    if (mandatory.length === 0) return [];

    const signed = await this.prisma.db.consentSubmission.findMany({
      where: { bookingId, signedAt: { not: null } },
      select: { formType: true },
    });
    const signedTypes = new Set(signed.map(s => s.formType));
    return mandatory.filter(t => !signedTypes.has(t));
  }
}
