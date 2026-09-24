/*
 * Role permissions for the back office.
 *
 * Each staff role has one on/off permission per page. Saved permissions come
 * from the API (GET /settings/permissions). This file fills in anything the
 * API leaves out and applies the rules that must always hold.
 * Nothing is stored in the browser.
 */

/* -------------------------------------------------------------------------- */
/* Roles & permission keys                                                    */
/* -------------------------------------------------------------------------- */

// Staff roles that can use the back office.
export const STAFF_ROLES = ["administrator", "cashier", "inventory_manager"] as const;

// One permission per back-office page.
export const PERMISSION_KEYS = [
  "overview",
  "orders",
  "menuManagement",
  "menus",
  "stockManager",
  "userAccounts",
  "salesReports",
  "settings",
] as const;

// "NonNullRole" is a staff role (it excludes "customer" and null).
export type NonNullRole = (typeof STAFF_ROLES)[number];
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type RolePermissions = Record<PermissionKey, boolean>;
export type PermissionsMap = Record<NonNullRole, RolePermissions>;

/* -------------------------------------------------------------------------- */
/* Defaults & rules                                                           */
/* -------------------------------------------------------------------------- */

// Used for any permission the API does not return.
export const DEFAULT_PERMISSIONS: PermissionsMap = {
  administrator: {
    overview: true,
    orders: true,
    menuManagement: true,
    menus: true,
    stockManager: false,
    userAccounts: true,
    salesReports: true,
    settings: true,
  },
  cashier: {
    overview: false,
    orders: true,
    menuManagement: false,
    menus: true,
    stockManager: false,
    userAccounts: false,
    salesReports: true,
    settings: false,
  },
  inventory_manager: {
    overview: true,
    orders: true,
    menuManagement: true,
    menus: false,
    stockManager: true,
    userAccounts: false,
    salesReports: false,
    settings: false,
  },
};

// Permissions that are always on, whatever is saved.
// Administrators can never lock themselves out of these pages.
const REQUIRED_PERMISSIONS: Record<NonNullRole, PermissionKey[]> = {
  administrator: ["orders", "menus", "userAccounts", "settings"],
  cashier: ["orders"],
  inventory_manager: ["orders"],
};

/* -------------------------------------------------------------------------- */
/* Normalizing                                                                */
/* -------------------------------------------------------------------------- */

// Accepts true/false as well as 1/0 and "1"/"0", which some databases return.
function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

// Builds a complete permissions map from partial or untrusted input.
// Unknown roles and keys are ignored, missing values use the defaults,
// and the required permissions are always switched on.
export function normalizePermissionsMap(
  input?: Partial<Record<NonNullRole, Partial<RolePermissions>>> | null,
): PermissionsMap {
  const map = {} as PermissionsMap;

  for (const role of STAFF_ROLES) {
    const saved: Partial<Record<string, unknown>> = input?.[role] ?? {};
    const permissions = {} as RolePermissions;

    for (const key of PERMISSION_KEYS) {
      permissions[key] = toBoolean(saved[key], DEFAULT_PERMISSIONS[role][key]);
    }
    for (const key of REQUIRED_PERMISSIONS[role]) {
      permissions[key] = true;
    }

    map[role] = permissions;
  }

  return map;
}

// Returns a known role in lowercase, or null when the value is not a role.
export function normalizeRole(value: unknown): NonNullRole | "customer" | null {
  const role = String(value ?? "").trim().toLowerCase();
  const knownRoles: readonly string[] = [...STAFF_ROLES, "customer"];
  return knownRoles.includes(role) ? (role as NonNullRole | "customer") : null;
}

/* -------------------------------------------------------------------------- */
/* Legacy exports (temporary)                                                 */
/* -------------------------------------------------------------------------- */

/*
 * Kept so files that still import these names keep working. Permissions are
 * held in memory only, so they are cleared when the page reloads and nothing
 * is written to the browser. Remove this section once no file imports them.
 */

let loadedPermissions: PermissionsMap | null = null;

// Roles that can open the orders view. Cook is no longer a role.
export const COOK_VIEW_ROLES: readonly NonNullRole[] = STAFF_ROLES;

// Latest permissions loaded from the API during this session, or the defaults.
export function readCachedPermissions(): PermissionsMap {
  return loadedPermissions ?? normalizePermissionsMap();
}

export function hasCachedPermissions(): boolean {
  return loadedPermissions !== null;
}

// Shares the loaded permissions with the rest of the app and announces the change.
export function cachePermissions(permissions: PermissionsMap) {
  loadedPermissions = normalizePermissionsMap(permissions);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("permissionsChange"));
}