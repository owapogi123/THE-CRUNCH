import { useEffect, useMemo, useState, type ElementType } from "react";
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
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "../context/authcontext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useViewport } from "@/hooks/use-tablet";
import { api } from "@/lib/api";
import {
  cachePermissions,
  normalizePermissionsMap,
  normalizeRole,
  readCachedPermissions,
  type NonNullRole,
  type PermissionKey,
  type PermissionsMap,
} from "@/lib/permissions";
import { fetchGeneralSettings, GENERAL_SETTINGS_EVENT } from "@/lib/restaurantSettings";

/*
 * Slide-in navigation menu for staff users.
 * Which links appear depends on the permissions the API returns for the
 * signed-in role. The menu shows right away from the last loaded permissions
 * (kept in memory) or the defaults, then updates when the API responds.
 * Nothing is stored in the browser.
 */

/* -------------------------------------------------------------------------- */
/* Types & constants                                                          */
/* -------------------------------------------------------------------------- */

type Role = NonNullRole | "customer";

interface SidebarItem {
  label: string;
  path: string;
  permissionKey: PermissionKey;
  icon: ElementType;
}

const TABLET_BREAKPOINT = 1100;

const ROLE_LABELS: Record<Role, string> = {
  administrator: "Administrator",
  cashier: "Cashier",
  inventory_manager: "Inventory Manager",
  customer: "Customer",
};

// Every link the sidebar can show.
const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "Orders View", path: "/orders", permissionKey: "orders", icon: ShoppingCart },
  { label: "Overview", path: "/dashboard", permissionKey: "overview", icon: LayoutDashboard },
  { label: "Menu Management", path: "/inventory", permissionKey: "menuManagement", icon: UtensilsCrossed },
  { label: "Menu View", path: "/menu", permissionKey: "menus", icon: BookOpen },
  { label: "Stock Manager", path: "/stockmanager", permissionKey: "stockManager", icon: Package },
  { label: "User Accounts", path: "/users", permissionKey: "userAccounts", icon: Users },
  { label: "Sales & Reports", path: "/sales-reports", permissionKey: "salesReports", icon: BarChart2 },
  { label: "Settings", path: "/settings", permissionKey: "settings", icon: Settings },
];

/* -------------------------------------------------------------------------- */
/* Data hooks                                                                 */
/* -------------------------------------------------------------------------- */

// Role permissions. Starts from the last loaded copy (kept in memory) or the defaults,
// so the menu shows right away, then updates when the API responds.
function usePermissions(enabled: boolean) {
  const [permissions, setPermissions] = useState<PermissionsMap>(readCachedPermissions);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    api.get<Record<string, unknown>>("/settings/permissions")
      .then((data) => {
        if (cancelled || !data || typeof data !== "object") return;

        // The API may return { permissions: {...} } or the map itself.
        const raw = "permissions" in data ? data.permissions : data;
        const next = normalizePermissionsMap((raw as Partial<PermissionsMap> | null | undefined) ?? null);
        setPermissions(next);
        cachePermissions(next); // memory only, lets other pages start from the loaded permissions
      })
      .catch(() => {
        // Keep showing the current menu if the request fails.
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return permissions;
}

// Last restaurant name loaded from the API. Kept in memory so it shows
// immediately when moving between pages.
let lastRestaurantName = "";

// Loads the restaurant name and reloads it whenever the general settings change.
function useRestaurantName() {
  const [name, setName] = useState(lastRestaurantName);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchGeneralSettings()
        .then((settings) => {
          lastRestaurantName = settings.restaurantName;
          if (!cancelled) setName(settings.restaurantName);
        })
        .catch(() => {
          // Keep the current name if the request fails.
        });
    };

    load();
    window.addEventListener(GENERAL_SETTINGS_EVENT, load);

    return () => {
      cancelled = true;
      window.removeEventListener(GENERAL_SETTINGS_EVENT, load);
    };
  }, []);

  return name;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout, isOnline } = useAuth();
  const isMobile = useIsMobile();
  const { width } = useViewport();
  const isTablet = width < TABLET_BREAKPOINT;

  // Picks a value based on screen size: mobile, tablet or desktop.
  const byScreen = <T,>(mobile: T, tablet: T, desktop: T) =>
    isMobile ? mobile : isTablet ? tablet : desktop;

  const role = normalizeRole(String(user?.role || "").trim().toLowerCase());
  const staffRole = role && role !== "customer" ? role : null;

  const permissions = usePermissions(staffRole !== null);
  const restaurantName = useRestaurantName();

  // Only show the links this role is allowed to open.
  const visibleItems = useMemo(() => {
    if (!staffRole) return [];
    return SIDEBAR_ITEMS.filter((item) => permissions[staffRole][item.permissionKey] === true);
  }, [permissions, staffRole]);

  const closeSidebar = () => setIsOpen(false);

  const handleLogout = () => {
    logout();
    closeSidebar();
    navigate("/login");
  };

  const iconSize = isMobile ? "w-5 h-5" : "w-4 h-4";

  return (
    <>
      {/* Menu / close toggle */}
      <motion.button
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "fixed z-50 p-3 bg-white rounded-xl shadow-lg",
          byScreen("top-4 left-4", "top-5 left-5", "top-6 left-6"),
        )}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label={isOpen ? "Close menu" : "Open menu"}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={isOpen ? "close" : "menu"}
            initial={{ rotate: isOpen ? -90 : 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: isOpen ? 90 : -90, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {isOpen ? (
              <X className={cn(isMobile ? "w-5 h-5" : "w-6 h-6", "text-black")} />
            ) : (
              <Menu className={cn(isMobile ? "w-5 h-5" : "w-6 h-6", "text-black")} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.button>

      {/* Dimmed backdrop, click to close */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40"
            onClick={closeSidebar}
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
              byScreen("w-full max-w-[85vw]", "w-[22rem] max-w-[78vw]", "w-72"),
            )}
            style={{ fontFamily: "Poppins, sans-serif" }}
          >
            {/* Restaurant name */}
            <motion.div
              className="flex items-center justify-center mb-6 mt-8"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <span className={cn("font-bold text-black", isMobile ? "text-xl" : "text-2xl")}>
                {restaurantName}
              </span>
            </motion.div>

            {/* Signed-in user: online status, name and role */}
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
                  {role ? ROLE_LABELS[role] : user.role}
                </span>
              </motion.div>
            )}

            <div className="h-px bg-gray-100 mb-4" />

            <div className="text-xs text-gray-400 mb-4 uppercase tracking-wider font-medium px-2">
              Navigation
            </div>

            {/* Navigation links (scrollable, scrollbar hidden) */}
            <nav
              className={cn(
                "flex-1 space-y-1 overflow-y-auto",
                "[&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none]",
              )}
            >
              {visibleItems.map(({ label, path, icon: Icon }, index) => (
                <NavLink key={path} to={path} end onClick={closeSidebar}>
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
                            iconSize,
                            isActive ? "text-black" : "text-gray-400",
                          )}
                          strokeWidth={isActive ? 2.2 : 1.8}
                        />
                        <span className="truncate">{label}</span>
                      </Button>
                    </motion.div>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* Log out */}
            <motion.div
              className="mt-6 pt-6 border-t border-gray-100"
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
                onClick={handleLogout}
              >
                <LogOut className={cn("flex-shrink-0 text-gray-400", iconSize)} strokeWidth={1.8} />
                <span>Log Out</span>
              </Button>
            </motion.div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}