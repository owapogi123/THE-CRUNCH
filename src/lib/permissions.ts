export type NonNullRole =
  | "administrator"
  | "cashier"
  | "cook"
  | "inventory_manager";

export type PermissionKey =
  | "overview"
  | "orders"
  | "menuManagement"
  | "menus"
  | "stockManager"
  | "userAccounts"
  | "salesReports"
  | "settings";

export type RolePermissions = Record<PermissionKey, boolean>;
export type PermissionsMap = Record<NonNullRole, RolePermissions>;

export const DEFAULT_PERMISSIONS: PermissionsMap = {
  administrator: {
    overview: true,
    orders: false,
    menuManagement: true,
    menus: false,
    stockManager: false,
    userAccounts: true,
    salesReports: true,
    settings: true,
  },
  cashier: {
    overview: false,
    orders: false,
    menuManagement: false,
    menus: true,
    stockManager: false,
    userAccounts: false,
    salesReports: true,
    settings: false,
  },
  cook: {
    overview: false,
    orders: true,
    menuManagement: false,
    menus: false,
    stockManager: false,
    userAccounts: false,
    salesReports: false,
    settings: false,
  },
  inventory_manager: {
    overview: true,
    orders: false,
    menuManagement: true,
    menus: false,
    stockManager: true,
    userAccounts: false,
    salesReports: false,
    settings: false,
  },
};

const PERMISSIONS_CACHE_KEY = "rolePermissions";

export function normalizePermissionsMap(
  input?: Partial<PermissionsMap> | null,
): PermissionsMap {
  const next: PermissionsMap = {
    administrator: {
      ...DEFAULT_PERMISSIONS.administrator,
      ...(input?.administrator ?? {}),
    },
    cashier: {
      ...DEFAULT_PERMISSIONS.cashier,
      ...(input?.cashier ?? {}),
    },
    cook: {
      ...DEFAULT_PERMISSIONS.cook,
      ...(input?.cook ?? {}),
    },
    inventory_manager: {
      ...DEFAULT_PERMISSIONS.inventory_manager,
      ...(input?.inventory_manager ?? {}),
    },
  };

  next.administrator.userAccounts = true;
  next.administrator.settings = true;

  return next;
}

export function readCachedPermissions(): PermissionsMap {
  if (typeof window === "undefined") {
    return normalizePermissionsMap(DEFAULT_PERMISSIONS);
  }

  try {
    const raw = localStorage.getItem(PERMISSIONS_CACHE_KEY);
    if (!raw) return normalizePermissionsMap(DEFAULT_PERMISSIONS);
    return normalizePermissionsMap(JSON.parse(raw) as Partial<PermissionsMap>);
  } catch {
    return normalizePermissionsMap(DEFAULT_PERMISSIONS);
  }
}

export function hasCachedPermissions(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(PERMISSIONS_CACHE_KEY);
}

export function cachePermissions(permissions: PermissionsMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    PERMISSIONS_CACHE_KEY,
    JSON.stringify(normalizePermissionsMap(permissions)),
  );
  window.dispatchEvent(new Event("permissionsChange"));
}

export function normalizeRole(value: unknown): NonNullRole | "customer" | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "administrator" ||
    normalized === "cashier" ||
    normalized === "cook" ||
    normalized === "inventory_manager" ||
    normalized === "customer"
  ) {
    return normalized;
  }
  return null;
}
