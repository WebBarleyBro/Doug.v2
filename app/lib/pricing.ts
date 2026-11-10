import type { Product } from './types'

/**
 * Quantity pricing: a product with `price_tiers` charges the case and bottle price of
 * the highest tier its case count reaches (e.g. 3 cases → the "3 or more" tier).
 * Returns the product with those prices applied; products without tiers are unchanged.
 */
export function applyPriceTier<T extends Product>(prod: T | undefined, cases: number): T | undefined {
  const tiers = prod?.price_tiers
  if (!prod || !tiers?.length) return prod
  const tier = [...tiers].sort((a, b) => b.min_cases - a.min_cases).find(tr => cases >= tr.min_cases)
  if (!tier) return prod
  return { ...prod, price: tier.price, bottle_price: tier.bottle_price ?? prod.bottle_price }
}
