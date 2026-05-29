import { describe, expect, it } from 'vitest';
import { calculateTax } from './ca-tax-engine';
import { applyCashRounding, cashRoundingAdjustment, roundToNearestNickel } from './cash-rounding';

describe('calculateTax', () => {
  it('applies Ontario HST at 13% (spec invoice example)', () => {
    // $2,500 service + $800 add-on + $500 retail - $200 credit = $3,600 pre-tax
    const r = calculateTax(360000, 'ON');
    expect(r.taxes).toEqual([{ component: 'HST', rate: 0.13, amount: 46800 }]);
    expect(r.totalTax).toBe(46800);
    expect(r.total).toBe(406800); // $4,068.00 -> matches spec
  });

  it('applies BC GST 5% + PST 7% as separate lines', () => {
    const r = calculateTax(10000, 'BC');
    expect(r.taxes).toEqual([
      { component: 'GST', rate: 0.05, amount: 500 },
      { component: 'PST', rate: 0.07, amount: 700 },
    ]);
    expect(r.total).toBe(11200);
  });

  it('applies Quebec GST 5% + QST 9.975% on the pre-tax amount', () => {
    const r = calculateTax(10000, 'QC');
    expect(r.taxes).toEqual([
      { component: 'GST', rate: 0.05, amount: 500 },
      { component: 'QST', rate: 0.09975, amount: 998 }, // 997.5 -> 998
    ]);
    expect(r.total).toBe(11498);
  });

  it('applies Alberta GST only', () => {
    const r = calculateTax(10000, 'AB');
    expect(r.taxes).toEqual([{ component: 'GST', rate: 0.05, amount: 500 }]);
    expect(r.total).toBe(10500);
  });

  it('throws on unknown province', () => {
    expect(() => calculateTax(100, 'ZZ' as never)).toThrow();
  });
});

describe('cash rounding', () => {
  it('rounds to the nearest nickel', () => {
    expect(roundToNearestNickel(101)).toBe(100); // .01 -> .00
    expect(roundToNearestNickel(102)).toBe(100); // .02 -> .00
    expect(roundToNearestNickel(103)).toBe(105); // .03 -> .05
    expect(roundToNearestNickel(107)).toBe(105); // .07 -> .05
    expect(roundToNearestNickel(108)).toBe(110); // .08 -> .10
  });

  it('only rounds cash tenders', () => {
    expect(applyCashRounding(103, 'CASH')).toBe(105);
    expect(applyCashRounding(103, 'CARD')).toBe(103);
    expect(applyCashRounding(103, 'MOBILE_WALLET')).toBe(103);
  });

  it('reports the rounding adjustment', () => {
    expect(cashRoundingAdjustment(103)).toBe(2);
    expect(cashRoundingAdjustment(101)).toBe(-1);
  });
});
