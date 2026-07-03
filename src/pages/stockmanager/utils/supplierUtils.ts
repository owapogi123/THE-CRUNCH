export function parseSupplierProducts(products_supplied?: string): string[] {
  if (!products_supplied) return [];
  return products_supplied
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function mergeSupplierProducts(
  existing: string,
  incoming: string[],
): string {
  const existingArr = parseSupplierProducts(existing);
  const merged = [...new Set([...existingArr, ...incoming])];
  return merged.join(", ");
}
