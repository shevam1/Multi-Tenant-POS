/**
 * Canadian cash-rounding (penny elimination).
 *
 * Since the withdrawal of the Canadian penny, cash transactions are rounded
 * to the nearest $0.05. Electronic payments (card, mobile wallet) are charged
 * to the exact cent and must NOT be rounded.
 *
 * Rounding rule (nearest 5 cents, half rounded up):
 *   ...x1, ...x2 -> down       ...x3, ...x4 -> up to 5
 *   ...x6, ...x7 -> down to 5  ...x8, ...x9 -> up to next 0
 */

export type TenderType = 'CASH' | 'CARD' | 'MOBILE_WALLET' | 'GIFT_CARD' | 'STATEMENT_CREDIT';

/** Round an amount in cents to the nearest 5-cent increment. */
export function roundToNearestNickel(amountCents: number): number {
  return Math.round(amountCents / 5) * 5;
}

/**
 * Returns the amount actually payable for a given tender type.
 * Cash is nickel-rounded; everything else is charged to the exact cent.
 */
export function applyCashRounding(amountCents: number, tender: TenderType): number {
  return tender === 'CASH' ? roundToNearestNickel(amountCents) : amountCents;
}

/** The rounding adjustment (can be negative) applied for a cash tender, in cents. */
export function cashRoundingAdjustment(amountCents: number): number {
  return roundToNearestNickel(amountCents) - amountCents;
}
