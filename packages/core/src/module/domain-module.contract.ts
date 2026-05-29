/**
 * DomainModule contract — the plugin interface every industry implements.
 *
 * The shared core stays terminology-agnostic. A domain module contributes the
 * vocabulary, workflow stages, catalog templates, pricing rules, and intake/
 * consent forms that specialize the platform for one industry. The admin/web
 * apps render generic UI driven by this metadata, so adding a new vertical
 * (e.g. restaurant) means shipping a new module — not changing the core.
 */

export type IndustryId = 'PET_GROOMING' | 'RESTAURANT';

/** Terminology overrides so generic UI reads naturally per industry. */
export interface TerminologyLabels {
  /** The thing being serviced: "Pet" / "Diner / Table". */
  subject: string;
  /** The front-line worker: "Groomer" / "Server". */
  staff: string;
  /** The unit of work: "Appointment" / "Order". */
  booking: string;
  /** The work board: "Grooming Workflow" / "Kitchen Display". */
  board: string;
}

export interface WorkflowStageDef {
  id: string;
  label: string;
  /** Render order on the board / job card. */
  order: number;
  /** Whether reaching this stage marks the booking ready for pickup/handoff. */
  terminal?: boolean;
}

export type CatalogItemKind = 'PACKAGE' | 'ADDON' | 'RETAIL';

export interface CatalogTemplate {
  kind: CatalogItemKind;
  name: string;
  description?: string;
  basePriceCents: number;
  durationMin?: number;
  attributes?: Record<string, unknown>;
}

export type PricingRuleType =
  | 'BREED_SIZE'
  | 'LOCATION_TIER'
  | 'PEAK_SURCHARGE'
  | 'HANDLING_PREMIUM';

export type PricingAdjustmentKind = 'MULTIPLIER' | 'FLAT';

export interface PricingRuleDef {
  type: PricingRuleType;
  /** Criteria matched against the pricing context (all keys must equal). */
  match: Record<string, string | number | boolean>;
  adjustment: PricingAdjustmentKind;
  /** MULTIPLIER: 1.25 = +25%. FLAT: value in cents. */
  value: number;
}

export type ConsentFieldType = 'text' | 'checkbox' | 'date' | 'signature';

export interface ConsentFieldDef {
  key: string;
  label: string;
  type: ConsentFieldType;
  required?: boolean;
}

export interface ConsentFormDef {
  formType: string;
  title: string;
  /** Must be signed before a booking can move PENDING -> CONFIRMED. */
  mandatory: boolean;
  fields: ConsentFieldDef[];
}

export interface DomainModule {
  id: IndustryId;
  labels: TerminologyLabels;
  workflowStages: WorkflowStageDef[];
  catalogTemplates: CatalogTemplate[];
  pricingRules: PricingRuleDef[];
  consentForms: ConsentFormDef[];
}
