import { calculateTax, type Province, type TaxLineResult } from '../tax/ca-tax-engine';
import { roundToNearestNickel, type TenderType } from '../tax/cash-rounding';

/**
 * Pure checkout math. Aggregates line items, applies discounts/statement
 * credits (deducted before tax, per the spec invoice), computes province-aware
 * Canadian tax, adds tips, and applies $0.05 cash rounding for cash tenders.
 *
 * All amounts are in integer cents.
 */

export interface CheckoutLine {
  description: string;
  amountCents: number;
  /** Defaults to true; non-taxable lines are excluded from the tax base. */
  taxable?: boolean;
}

export interface CheckoutInput {
  lines: CheckoutLine[];
  province: Province;
  /** Discounts + statement credits, deducted from the subtotal before tax. */
  discountCents?: number;
  tipCents?: number;
  /** Tender determines whether cash rounding applies. */
  tender: TenderType;
}

export interface CheckoutResult {
  subtotalCents: number;
  discountCents: number;
  /** Taxable base after discount (clamped at 0). */
  taxableBaseCents: number;
  taxes: TaxLineResult[];
  totalTaxCents: number;
  tipCents: number;
  /** Total before cash rounding. */
  netTotalCents: number;
  /** Rounding adjustment for cash tenders (0 for electronic). */
  cashRoundingCents: number;
  /** Final amount payable. */
  totalCents: number;
}

export function computeCheckout(input: CheckoutInput): CheckoutResult {
  const discountCents = Math.max(0, input.discountCents ?? 0);
  const tipCents = Math.max(0, input.tipCents ?? 0);

  const subtotalCents = input.lines.reduce((sum, l) => sum + l.amountCents, 0);
  const taxableSubtotal = input.lines
    .filter((l) => l.taxable !== false)
    .reduce((sum, l) => sum + l.amountCents, 0);

  const taxableBaseCents = Math.max(0, taxableSubtotal - discountCents);
  const { taxes, totalTax } = calculateTax(taxableBaseCents, input.province);

  const netTotalCents = subtotalCents - discountCents + totalTax + tipCents;

  const totalCents =
    input.tender === 'CASH' ? roundToNearestNickel(netTotalCents) : netTotalCents;
  const cashRoundingCents = totalCents - netTotalCents;

  return {
    subtotalCents,
    discountCents,
    taxableBaseCents,
    taxes,
    totalTaxCents: totalTax,
    tipCents,
    netTotalCents,
    cashRoundingCents,
    totalCents,
  };
}
