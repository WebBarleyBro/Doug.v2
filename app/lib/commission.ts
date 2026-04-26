import { resolveTotal } from "./formatters";

type OrderLike = {
  status?: string;
  sent_at?: string | null;
  created_at?: string | null;
  commission_amount?: number | string | null;
  client_slug?: string | null;
  total_amount?: number | string | null;
  total?: number | string | null;
  po_line_items?: unknown[];
};

const ELIGIBLE_STATUSES = new Set(["sent", "fulfilled"]);

export function isCommissionEligible(status?: string | null): boolean {
  return ELIGIBLE_STATUSES.has((status || "").toLowerCase());
}

export function getEffectiveOrderDate(order: OrderLike): string {
  return order.sent_at || order.created_at || "";
}

export function getCommissionAmount(
  order: OrderLike,
  commissionRateByClient: Record<string, number>,
): number {
  const stored = Number(order.commission_amount) || 0;
  if (stored > 0) return stored;
  const base = Number(resolveTotal(order)) || 0;
  const rate = commissionRateByClient[order.client_slug || ""] || 0;
  return base * rate;
}

export function sumCommission(
  orders: OrderLike[],
  commissionRateByClient: Record<string, number>,
  predicate?: (order: OrderLike) => boolean,
): number {
  return orders.reduce((sum, order) => {
    if (!isCommissionEligible(order.status)) return sum;
    if (predicate && !predicate(order)) return sum;
    return sum + getCommissionAmount(order, commissionRateByClient);
  }, 0);
}
