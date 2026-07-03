export const isExpiringSoon = (e?: string | null) => {
  if (!e) return false;
  const d = (new Date(e).getTime() - Date.now()) / 86400000;
  return d <= 3 && d >= 0;
};

export const isExpired = (e?: string | null) =>
  !!e && new Date(e).getTime() < Date.now();

export const daysUntilExpiry = (e?: string | null): number | null => {
  if (!e) return null;
  const d = new Date(e);
  return isNaN(d.getTime())
    ? null
    : Math.floor((d.getTime() - Date.now()) / 86400000);
};

export const isDateInRange = (
  value: string | null | undefined,
  dateFrom: string,
  dateTo: string,
) => {
  if (!value) return false;
  const normalized = String(value).split("T")[0];
  if (!normalized) return false;
  if (dateFrom && normalized < dateFrom) return false;
  if (dateTo && normalized > dateTo) return false;
  return true;
};
