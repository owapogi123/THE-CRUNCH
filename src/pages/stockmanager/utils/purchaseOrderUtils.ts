import type { POItem } from "../types/inventory";
export { getPOItemDateTrackingType, getPOItemUsableUntil } from "./stockUtils";

export const calcPOTotal = (items: POItem[]) =>
  items.reduce((s, i) => s + i.quantity * Number(i.unitCost ?? 0), 0);
