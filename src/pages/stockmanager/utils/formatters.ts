export function toNumber(v: unknown, fb = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

export function fmtInt(v: unknown): string {
  return Math.round(toNumber(v)).toLocaleString();
}

export const fmtDate = (v?: string | null) => {
  if (!v) return "No expiry";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? "No expiry"
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
};

export const fmtReceivedDate = (v: string) => {
  const d = new Date(v);
  return isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};

export const fmtFilterDate = (v: string) => {
  if (!v) return "Select date";
  return fmtReceivedDate(v);
};

export function fmtDateTime(v?: string | null) {
  if (!v) return "Not set";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? "Not set"
    : d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function formatShelfLife(
  days?: number | null,
  hours?: number | null,
): string {
  const parts: string[] = [];
  if (toNumber(days) > 0) {
    const safeDays = Math.round(toNumber(days));
    parts.push(`${safeDays} day${safeDays === 1 ? "" : "s"}`);
  }
  if (toNumber(hours) > 0) {
    const safeHours = Math.round(toNumber(hours));
    parts.push(`${safeHours} hour${safeHours === 1 ? "" : "s"}`);
  }
  return parts.join(" / ") || "Not set";
}
