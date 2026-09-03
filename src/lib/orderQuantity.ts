export const MAX_ORDER_ITEM_QUANTITY = 999;

export function getEffectiveMaxQuantity(availableStock: unknown): number {
  const stock = Number(availableStock);
  if (!Number.isFinite(stock) || stock <= 0) return 0;
  return Math.min(MAX_ORDER_ITEM_QUANTITY, Math.floor(stock));
}

export function clampOrderItemQuantity(
  requestedQuantity: unknown,
  availableStock: unknown,
): number {
  const effectiveMaximum = getEffectiveMaxQuantity(availableStock);
  if (effectiveMaximum === 0) return 0;
  const quantity = Number(requestedQuantity);
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(effectiveMaximum, Math.max(1, Math.floor(quantity)));
}
