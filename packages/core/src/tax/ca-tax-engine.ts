/**
 * Province-aware Canadian sales tax engine.
 *
 * All money is handled in integer **cents** to avoid floating-point drift.
 * Rates are sourced from the functional specs and current (2026) federal/
 * provincial schedules. GST and PST/QST are both levied on the pre-tax
 * amount (Quebec de-compounded QST from GST in 2013).
 */

export type Province =
  | 'AB' | 'BC' | 'MB' | 'NB' | 'NL' | 'NS' | 'NT' | 'NU' | 'ON' | 'PE' | 'QC' | 'SK' | 'YT';

export type TaxComponent = 'GST' | 'HST' | 'PST' | 'QST';

export interface TaxRate {
  component: TaxComponent;
  /** Fractional rate, e.g. 0.13 for 13%. */
  rate: number;
}

/** Provincial tax matrix. Source of truth for the checkout engine. */
export const PROVINCIAL_TAX_MATRIX: Record<Province, TaxRate[]> = {
  AB: [{ component: 'GST', rate: 0.05 }],
  BC: [{ component: 'GST', rate: 0.05 }, { component: 'PST', rate: 0.07 }],
  MB: [{ component: 'GST', rate: 0.05 }, { component: 'PST', rate: 0.07 }],
  NB: [{ component: 'HST', rate: 0.15 }],
  NL: [{ component: 'HST', rate: 0.15 }],
  NS: [{ component: 'HST', rate: 0.14 }],
  NT: [{ component: 'GST', rate: 0.05 }],
  NU: [{ component: 'GST', rate: 0.05 }],
  ON: [{ component: 'HST', rate: 0.13 }],
  PE: [{ component: 'HST', rate: 0.15 }],
  QC: [{ component: 'GST', rate: 0.05 }, { component: 'QST', rate: 0.09975 }],
  SK: [{ component: 'GST', rate: 0.05 }, { component: 'PST', rate: 0.06 }],
  YT: [{ component: 'GST', rate: 0.05 }],
};

export interface TaxLineResult {
  component: TaxComponent;
  rate: number;
  /** Tax amount in cents. */
  amount: number;
}

export interface TaxResult {
  /** Pre-tax subtotal in cents. */
  subtotal: number;
  taxes: TaxLineResult[];
  /** Sum of all tax lines in cents. */
  totalTax: number;
  /** subtotal + totalTax in cents. */
  total: number;
}

/** Round to nearest cent (half away from zero). Input is a float cent value. */
function roundCents(value: number): number {
  return Math.round(value);
}

/**
 * Compute Canadian taxes on a pre-tax subtotal (in cents) for a province.
 *
 * @param subtotalCents pre-tax amount in cents (e.g. 250000 = $2,500.00)
 * @param province two-letter province code
 */
export function calculateTax(subtotalCents: number, province: Province): TaxResult {
  const rates = PROVINCIAL_TAX_MATRIX[province];
  if (!rates) {
    throw new Error(`Unknown province code: ${province}`);
  }

  const taxes: TaxLineResult[] = rates.map(({ component, rate }) => ({
    component,
    rate,
    amount: roundCents(subtotalCents * rate),
  }));

  const totalTax = taxes.reduce((sum, t) => sum + t.amount, 0);

  return {
    subtotal: subtotalCents,
    taxes,
    totalTax,
    total: subtotalCents + totalTax,
  };
}
