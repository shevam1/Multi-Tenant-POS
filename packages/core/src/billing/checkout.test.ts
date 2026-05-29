import { describe, expect, it } from 'vitest';
import { computeCheckout } from './checkout';
import { computePrice, type PricingRule } from '../pricing/pricing-engine';

describe('computeCheckout', () => {
  it('reproduces the spec Ontario invoice ($3,800 - $200 credit -> $4,068)', () => {
    const r = computeCheckout({
      province: 'ON',
      tender: 'CARD',
      discountCents: 20000, // $200 statement credit
      lines: [
        { description: 'Premium Groom', amountCents: 250000 },
        { description: 'Spa Care Package', amountCents: 80000 },
        { description: 'Medicated Shampoo (SKU-882)', amountCents: 50000 },
      ],
    });
    expect(r.subtotalCents).toBe(380000);
    expect(r.taxableBaseCents).toBe(360000);
    expect(r.totalTaxCents).toBe(46800);
    expect(r.cashRoundingCents).toBe(0);
    expect(r.totalCents).toBe(406800);
  });

  it('applies cash rounding only for cash tenders', () => {
    const base = {
      province: 'ON' as const,
      lines: [{ description: 'Nail Trim', amountCents: 999 }],
    };
    const card = computeCheckout({ ...base, tender: 'CARD' });
    const cash = computeCheckout({ ...base, tender: 'CASH' });
    // 999 + 13% = 1128.87 -> tax rounds to 130 => 1129; cash -> 1130
    expect(card.totalCents).toBe(1129);
    expect(cash.totalCents).toBe(1130);
    expect(cash.cashRoundingCents).toBe(1);
  });

  it('excludes non-taxable lines from the tax base', () => {
    const r = computeCheckout({
      province: 'ON',
      tender: 'CARD',
      lines: [
        { description: 'Groom', amountCents: 10000, taxable: true },
        { description: 'Gift card top-up', amountCents: 5000, taxable: false },
      ],
    });
    expect(r.taxableBaseCents).toBe(10000);
    expect(r.totalTaxCents).toBe(1300);
    expect(r.totalCents).toBe(16300);
  });
});

describe('computePrice', () => {
  const rules: PricingRule[] = [
    { type: 'BREED_SIZE', match: { sizeClass: 'LARGE' }, adjustment: 'MULTIPLIER', value: 1.25 },
    { type: 'PEAK_SURCHARGE', match: { isPeak: true }, adjustment: 'FLAT', value: 1500 },
    { type: 'HANDLING_PREMIUM', match: { handling: 'AGGRESSIVE' }, adjustment: 'FLAT', value: 2000 },
  ];

  it('applies a size multiplier', () => {
    const r = computePrice(8000, rules, { sizeClass: 'LARGE' });
    expect(r.finalCents).toBe(10000);
    expect(r.applied).toHaveLength(1);
  });

  it('compounds matching rules in order (multiplier then flats)', () => {
    const r = computePrice(8000, rules, {
      sizeClass: 'LARGE',
      isPeak: true,
      handling: 'AGGRESSIVE',
    });
    // 8000 * 1.25 = 10000, + 1500 + 2000 = 13500
    expect(r.finalCents).toBe(13500);
    expect(r.applied).toHaveLength(3);
  });

  it('ignores non-matching rules', () => {
    const r = computePrice(8000, rules, { sizeClass: 'SMALL' });
    expect(r.finalCents).toBe(8000);
    expect(r.applied).toHaveLength(0);
  });
});
