import type {
  PricingAdjustmentKind,
  PricingRuleType,
} from '../module/domain-module.contract';

/**
 * Dynamic pricing engine (spec section 4).
 *
 * Adjusts a base price against real-time operational variables: breed/size
 * multipliers, location+tier matrix, peak surcharges, and behavioral handling
 * premiums. Rules apply sequentially in the given order so results are
 * deterministic and auditable:
 *   MULTIPLIER -> running = round(running * value)
 *   FLAT       -> running = running + value (cents)
 */

export interface PricingRule {
  id?: string;
  type: PricingRuleType;
  /** All keys must equal the matching key in the context for the rule to fire. */
  match: Record<string, string | number | boolean>;
  adjustment: PricingAdjustmentKind;
  value: number;
}

export type PricingContext = Record<string, string | number | boolean>;

export interface AppliedRule {
  type: PricingRuleType;
  adjustment: PricingAdjustmentKind;
  value: number;
  /** Price delta in cents contributed by this rule. */
  deltaCents: number;
}

export interface PriceResult {
  baseCents: number;
  finalCents: number;
  applied: AppliedRule[];
}

function ruleMatches(rule: PricingRule, ctx: PricingContext): boolean {
  return Object.entries(rule.match).every(([k, v]) => ctx[k] === v);
}

/** Compute the adjusted price (in cents) for a base price under a context. */
export function computePrice(
  baseCents: number,
  rules: PricingRule[],
  context: PricingContext,
): PriceResult {
  let running = baseCents;
  const applied: AppliedRule[] = [];

  for (const rule of rules) {
    if (!ruleMatches(rule, context)) continue;

    const before = running;
    running =
      rule.adjustment === 'MULTIPLIER'
        ? Math.round(running * rule.value)
        : running + rule.value;

    applied.push({
      type: rule.type,
      adjustment: rule.adjustment,
      value: rule.value,
      deltaCents: running - before,
    });
  }

  return { baseCents, finalCents: running, applied };
}
