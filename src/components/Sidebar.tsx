import { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/authcontext";
import { useIsMobile } from "@/hooks/use-mobile";

type Role =
  | "administrator"
  | "cashier"
  | "cook"
  | "inventory_manager"
  | "customer"
  | null;

interface SidebarItem {
  label: string;
  path: string;
  roles: Exclude<Role, null>[];
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
    roles: ["administrator", "inventory_manager"],
  },
  {
    label: "Order",
    path: "/orders",
    roles: ["administrator", "cashier", "cook"],
  },
  {
    label: "Menu Management",
    path: "/inventory",
    roles: ["administrator", "inventory_manager"],
  },
  { label: "Menus", path: "/menu", roles: ["administrator", "cashier"] },
  {
    label: "Stock Manager",
    path: "/stockmanager",
    roles: ["administrator", "inventory_manager"],
  },
  { label: "User Accounts", path: "/users", roles: ["administrator"] },
  {
    label: "Sales & Reports",
    path: "/sales-reports",
    roles: ["administrator", "cashier"],
  },

  {
    label: "Settings",
    path: "/settings",
    roles: ["administrator", "cashier"],
  },
];

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout, isOnline } = useAuth();
  const isMobile = useIsMobile();

  const userRole = user?.role as Role;

  const visibleItems = useMemo(() => {
    if (!userRole) return [];
    return SIDEBAR_ITEMS.filter((item) =>
      item.roles.includes(userRole as Exclude<Role, null>),
    );
  }, [userRole]);

  return (
    <>
      {/* Toggle button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed z-50 p-3 bg-white rounded-xl shadow-lg",
          isMobile ? "top-4 left-4" : "top-6 left-6"
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
              <X className={cn(isMobile ? "w-5 h-5" : "w-6 h-6", "text-black")} />
            </motion.div>
          ) : (
            <motion.div
              key="menu"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Menu className={cn(isMobile ? "w-5 h-5" : "w-6 h-6", "text-black")} />
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
              isMobile ? "w-full max-w-[85vw]" : "w-72"
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
              <span className={cn(
                "font-bold text-black",
                isMobile ? "text-xl" : "text-2xl"
              )}>
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

            {/* Nav links — scrollbar hidden across all browsers */}
            <nav
              className={cn(
                "flex-1 space-y-1.5 overflow-y-auto",
                // Webkit (Chrome, Safari, Edge)
                "[&::-webkit-scrollbar]:hidden",
                // Firefox
                "[scrollbar-width:none]",
                // IE / old Edge
                "[-ms-overflow-style:none]",
              )}
            >
              {visibleItems.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.path}
                  end
                  onClick={() => setIsOpen(false)}
                >
                  {({ isActive }) => (
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start rounded-xl text-sm transition-all duration-300 px-4 py-2.5",
                        "text-black hover:bg-gray-50 hover:shadow-sm hover:scale-[1.02] active:scale-95",
                        isActive && "bg-gray-100 text-black font-semibold",
                        isMobile && "py-3 text-base"
                      )}
                    >
                      {item.label}
                    </Button>
                  )}
                </NavLink>
              ))}
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
                    "w-full justify-start rounded-xl text-sm text-black mt-6 transition-all duration-200 px-4 py-2.5 hover:bg-red-50 hover:text-red-600",
                    isMobile && "py-3 text-base"
                  )}
                  onClick={() => {
                    logout();
                    setIsOpen(false);
                    navigate("/login");
                  }}
                >
                  Log Out
                </Button>
              </motion.div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}