export type RootRouteRole =
  | "administrator"
  | "cashier"
  | "inventory_manager"
  | "customer"
  | null;

export const ROLE_HOME_PATHS: Record<Exclude<RootRouteRole, null>, string> = {
  administrator: "/dashboard",
  cashier: "/menu",
  inventory_manager: "/inventory",
  customer: "/",
};

export type RootRouteDecision =
  | { kind: "pending" }
  | { kind: "public" }
  | { kind: "redirect"; to: string };

export function resolveRootRoute({
  isInitialized,
  role,
  staffHomePath,
}: {
  isInitialized: boolean;
  role: RootRouteRole;
  staffHomePath: string;
}): RootRouteDecision {
  if (!isInitialized) return { kind: "pending" };
  if (!role || role === "customer") return { kind: "public" };
  return { kind: "redirect", to: staffHomePath };
}
