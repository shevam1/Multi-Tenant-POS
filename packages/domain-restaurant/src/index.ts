import type { DomainModule } from '@omnipos/core';

/**
 * Restaurant domain module — STUB.
 * Implements the same DomainModule contract as pet grooming to prove the
 * plugin pattern. Catalog/pricing/consents are intentionally minimal; the full
 * implementation (KDS, tables, aggregators) lands when restaurant is built.
 */

export const RESTAURANT_MODULE_ID = 'RESTAURANT' as const;

/** KDS lanes — the restaurant analogue of grooming workflow stages. */
export const RESTAURANT_KDS_LANES = [
  'INCOMING',
  'PREPARING',
  'READY',
  'DELAYED',
  'COMPLETED',
] as const;

export type RestaurantKdsLane = (typeof RESTAURANT_KDS_LANES)[number];

export const restaurantModule: DomainModule = {
  id: RESTAURANT_MODULE_ID,
  labels: {
    subject: 'Table',
    staff: 'Server',
    booking: 'Order',
    board: 'Kitchen Display',
  },
  workflowStages: RESTAURANT_KDS_LANES.map((id, i) => ({
    id,
    label: id.charAt(0) + id.slice(1).toLowerCase(),
    order: i,
    terminal: id === 'COMPLETED',
  })),
  catalogTemplates: [],
  pricingRules: [],
  consentForms: [],
};

export default restaurantModule;
