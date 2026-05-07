import React, { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Menu,
  X,
  LayoutDashboard,
  ShoppingCart,
  UtensilsCrossed,
  BookOpen,
  Package,
  Users,
  BarChart2,
  Settings,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/authcontext";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  PermissionKey,
  PermissionsMap,
  readCachedPermissions,
  normalizePermissionsMap,
  cachePermissions,
  normalizeRole,
} from "@/lib/permissions";

type Role =
  | "administrator"
  | "cashier"
  | "cook"
  | "inventory_manager"
  | "customer"
  | null;

type StaffRole = Exclude<Role, "customer" | null>;

interface SidebarItem {
  label: string;
  path: string;
  permissionKey: PermissionKey;
  icon: React.ElementType;
}

const ROLE_LABELS: Record<Exclude<Role, null>, string> = {
  administrator: "Administrator",
  cashier: "Cashier",
  cook: "Cook",
  inventory_manager: "Inventory Manager",
  customer: "Customer",
};

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "Overview",
    path: "/dashboard",
    permissionKey: "overview",
    icon: LayoutDashboard,
  },
  {
    label: "Order",
    path: "/orders",
    permissionKey: "orders",
    icon: ShoppingCart,
  },
  {
    label: "Menu Management",
    path: "/inventory",
    permissionKey: "menuManagement",
    icon: UtensilsCrossed,
  },
  {
    label: "Menus",
    path: "/menu",
    permissionKey: "menus",
    icon: BookOpen,
  },
  {
    label: "Stock Manager",
    path: "/stockmanager",
    permissionKey: "stockManager",
    icon: Package,
  },
  {
    label: "User Accounts",
    path: "/users",
    permissionKey: "userAccounts",
    icon: Users,
  },
  {
    label: "Sales & Reports",
    path: "/sales-reports",
    permissionKey: "salesReports",
    icon: BarChart2,
  },
  {
    label: "Settings",
    path: "/settings",
    permissionKey: "settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [permissions, setPermissions] = useState<PermissionsMap>(() =>
    readCachedPermissions(),
  );
  const navigate = useNavigate();
  const { user, logout, isOnline } = useAuth();
  const isMobile = useIsMobile();

  const normalizedRole = String(user?.role || "").trim().toLowerCase();
  const userRole = normalizeRole(normalizedRole) as Role;

  React.useEffect(() => {
    if (!userRole || userRole === "customer") return undefined;

    let cancelled = false;

    const syncPermissions = () => {
      const cached = readCachedPermissions();
      console.log("[Sidebar] cached permissions", cached);
      console.log("[Sidebar] role", normalizedRole);
      setPermissions(cached);
    };

    const loadPermissions = async () => {
      try {
        const res = await fetch("/api/settings/permissions");
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (cancelled || !data || typeof data !== "object") return;
        const next = normalizePermissionsMap(
          "permissions" in data
            ? (data.permissions as Partial<PermissionsMap> | null | undefined) ?? null
            : (data as Partial<PermissionsMap>),
        );
        console.log("[Sidebar] loaded permissions", next);
        setPermissions(next);
        cachePermissions(next);
      } catch {
        syncPermissions();
      }
    };

    syncPermissions();
    void loadPermissions();
    window.addEventListener("permissionsChange", syncPermissions);
    window.addEventListener("storage", syncPermissions);

    return () => {
      cancelled = true;
      window.removeEventListener("permissionsChange", syncPermissions);
      window.removeEventListener("storage", syncPermissions);
    };
  }, [normalizedRole, userRole]);

  const visibleItems = useMemo(() => {
    if (!userRole || userRole === "customer") return [];
    const staffRole = userRole as StaffRole;
    const items = SIDEBAR_ITEMS.filter((item) =>
      permissions[staffRole]?.[item.permissionKey] === true,
    );
    console.log("[Sidebar] permissions for role", permissions[staffRole]);
    console.log("[Sidebar] visibleItems", items.map((item) => item.label));
    return items;
  }, [permissions, userRole]);

  return (
    <>
      {/* Toggle button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed z-50 p-3 bg-white rounded-xl shadow-lg",
          isMobile ? "top-4 left-4" : "top-6 left-6",
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X
                className={cn(
                  isMobile ? "w-5 h-5" : "w-6 h-6",
                  "text-black",
                )}
              />
            </motion.div>
          ) : (
            <motion.div
              key="menu"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Menu
                className={cn(
                  isMobile ? "w-5 h-5" : "w-6 h-6",
                  "text-black",
                )}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: -288, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -288, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={cn(
              "fixed top-0 left-0 h-full bg-white p-6 flex flex-col shadow-2xl z-50",
              isMobile ? "w-full max-w-[85vw]" : "w-72",
            )}
            style={{ fontFamily: "Poppins, sans-serif" }}
          >
            {/* Business name */}
            <motion.div
              className="flex items-center justify-center mb-6 mt-8"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <span
                className={cn(
                  "font-bold text-black",
                  isMobile ? "text-xl" : "text-2xl",
                )}
              >
                The Crunch
              </span>
            </motion.div>

            {/* Profile card */}
            {user && (
              <motion.div
                className="flex flex-col gap-1 mb-6 px-2"
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.18 }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-2.5 h-2.5 rounded-full flex-shrink-0",
                      isOnline ? "bg-green-400" : "bg-gray-300",
                    )}
                  />
                  <span className="text-sm font-semibold text-gray-900 truncate">
                    {user.username}
                  </span>
                </div>
                <span className="text-xs text-gray-400 pl-[18px]">
                  {ROLE_LABELS[user.role as Exclude<Role, null>] ?? user.role}
                </span>
              </motion.div>
            )}

            <div className="h-px bg-gray-100 mb-4" />

            <div className="text-xs text-gray-400 mb-4 uppercase tracking-wider font-medium px-2">
              Navigation
            </div>

            {/* Nav links */}
            <nav
              className={cn(
                "flex-1 space-y-1 overflow-y-auto",
                "[&::-webkit-scrollbar]:hidden",
                "[scrollbar-width:none]",
                "[-ms-overflow-style:none]",
              )}
            >
              {visibleItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.label}
                    to={item.path}
                    end
                    onClick={() => setIsOpen(false)}
                  >
                    {({ isActive }) => (
                      <motion.div
                        initial={{ x: -16, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.1 + index * 0.045 }}
                      >
                        <Button
                          variant="ghost"
                          className={cn(
                            "w-full justify-start rounded-xl text-sm transition-all duration-200 px-4 py-2.5 gap-3 h-auto",
                            isActive
                              ? "bg-gray-100 text-black font-semibold"
                              : "text-gray-500 hover:text-black hover:bg-gray-50",
                            isMobile && "py-3 text-base",
                          )}
                        >
                          <Icon
                            className={cn(
                              "flex-shrink-0 transition-colors duration-200",
                              isMobile ? "w-5 h-5" : "w-4 h-4",
                              isActive
                                ? "text-black"
                                : "text-gray-350 group-hover:text-gray-600",
                            )}
                            strokeWidth={isActive ? 2.2 : 1.8}
                          />
                          <span className="truncate">{item.label}</span>
                        </Button>
                      </motion.div>
                    )}
                  </NavLink>
                );
              })}
            </nav>

            {/* Logout */}
            <div className="mt-6 pt-6 border-t border-gray-100">
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.45 }}
              >
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start rounded-xl text-sm text-gray-500 transition-all duration-200 px-4 py-2.5 gap-3 h-auto hover:bg-red-50 hover:text-red-500",
                    isMobile && "py-3 text-base",
                  )}
                  onClick={() => {
                    logout();
                    setIsOpen(false);
                    navigate("/login");
                  }}
                >
                  <LogOut
                    className={cn(
                      "flex-shrink-0 text-gray-350",
                      isMobile ? "w-5 h-5" : "w-4 h-4",
                    )}
                    strokeWidth={1.8}
                  />
                  <span>Log Out</span>
                </Button>
              </motion.div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
