import type { DomainModule } from '@omnipos/core';

/**
 * Pet Grooming domain module. Contributes terminology, the grooming workflow,
 * catalog templates, dynamic pricing rules, and mandatory consents on top of
 * the shared core (spec: Pet Groom OS).
 */

export const PET_GROOMING_MODULE_ID = 'PET_GROOMING' as const;

/** Ordered grooming workflow stages — each transition is timestamped. */
export const PET_WORKFLOW_STAGES = [
  'CHECK_IN',
  'BEFORE_PHOTOS',
  'BATH',
  'DRYING',
  'STYLING',
  'NAILS',
  'QUALITY_CHECK',
  'AFTER_PHOTOS',
  'READY',
] as const;

export type PetWorkflowStage = (typeof PET_WORKFLOW_STAGES)[number];

const STAGE_LABELS: Record<PetWorkflowStage, string> = {
  CHECK_IN: 'Check-in',
  BEFORE_PHOTOS: 'Before photos',
  BATH: 'Bath',
  DRYING: 'Drying',
  STYLING: 'Styling',
  NAILS: 'Nails',
  QUALITY_CHECK: 'Quality check',
  AFTER_PHOTOS: 'After photos',
  READY: 'Ready',
};

export const petGroomingModule: DomainModule = {
  id: PET_GROOMING_MODULE_ID,
  labels: {
    subject: 'Pet',
    staff: 'Groomer',
    booking: 'Appointment',
    board: 'Grooming Workflow',
  },
  workflowStages: PET_WORKFLOW_STAGES.map((id, i) => ({
    id,
    label: STAGE_LABELS[id],
    order: i,
    terminal: id === 'READY',
  })),
  catalogTemplates: [
    {
      kind: 'PACKAGE',
      name: 'Basic Groom',
      description: 'Bath, dry, ear cleaning, and perfume application.',
      basePriceCents: 4999,
      durationMin: 60,
    },
    {
      kind: 'PACKAGE',
      name: 'Premium Groom',
      description: 'Basic plus professional styling, nail trim, and paw treatment.',
      basePriceCents: 8999,
      durationMin: 120,
    },
    {
      kind: 'PACKAGE',
      name: 'Spa Package',
      description: 'Premium plus therapeutic massage, coat treatment, and de-shedding.',
      basePriceCents: 14999,
      durationMin: 150,
    },
    { kind: 'ADDON', name: 'Nail Trim', basePriceCents: 1500, durationMin: 15 },
    { kind: 'ADDON', name: 'Tick Treatment', basePriceCents: 2000, durationMin: 20 },
    { kind: 'ADDON', name: 'Dental Cleaning', basePriceCents: 2500, durationMin: 20 },
    { kind: 'ADDON', name: 'Paw Balm', basePriceCents: 1000, durationMin: 5 },
    { kind: 'RETAIL', name: 'Medicated Shampoo', basePriceCents: 2499, attributes: { sku: 'SKU-882' } },
  ],
  pricingRules: [
    // Larger breeds take more time/product.
    { type: 'BREED_SIZE', match: { sizeClass: 'LARGE' }, adjustment: 'MULTIPLIER', value: 1.25 },
    { type: 'BREED_SIZE', match: { sizeClass: 'XLARGE' }, adjustment: 'MULTIPLIER', value: 1.5 },
    // Gold members get a flat discount.
    { type: 'LOCATION_TIER', match: { tier: 'GOLD' }, adjustment: 'FLAT', value: -1000 },
    // Peak weekend slots.
    { type: 'PEAK_SURCHARGE', match: { isPeak: true }, adjustment: 'FLAT', value: 1500 },
    // Extra handling for flagged pets.
    { type: 'HANDLING_PREMIUM', match: { handling: 'AGGRESSIVE' }, adjustment: 'FLAT', value: 2000 },
  ],
  consentForms: [
    {
      formType: 'GROOMING_CONSENT',
      title: 'Grooming Consent & Liability',
      mandatory: true,
      fields: [
        { key: 'fitForGrooming', label: 'My pet is medically fit for grooming', type: 'checkbox', required: true },
        { key: 'emergencyVetAuth', label: 'I authorize emergency veterinary treatment', type: 'checkbox', required: true },
        { key: 'cancellationPolicy', label: 'I accept the cancellation, pickup, and late fee policies', type: 'checkbox', required: true },
        { key: 'signature', label: 'Signature', type: 'signature', required: true },
      ],
    },
    {
      formType: 'CAGE_FREE_CONSENT',
      title: 'Cage-Free Environment Acknowledgement',
      mandatory: true,
      fields: [
        { key: 'openLayout', label: 'I acknowledge the open, social salon layout', type: 'checkbox', required: true },
        { key: 'isolationPermission', label: 'Staff may briefly isolate my pet during behavioral emergencies', type: 'checkbox', required: true },
        { key: 'signature', label: 'Signature', type: 'signature', required: true },
      ],
    },
    {
      formType: 'MEDIA_CONSENT',
      title: 'Photo & Media Consent (optional)',
      mandatory: false,
      fields: [
        { key: 'marketingUse', label: 'You may use before/after photos in marketing', type: 'checkbox' },
        { key: 'socialMedia', label: 'You may post photos on social media', type: 'checkbox' },
      ],
    },
  ],
};

export default petGroomingModule;
