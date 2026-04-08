import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

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
    label: "Inventory",
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

  {label: "Sales & Reports", path: "/sales-reports", roles: ["administrator", "cashier"]},
];

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [userRole, setUserRole] = useState<Role>(
    () => localStorage.getItem("userRole") as Role,
  );
  const navigate = useNavigate();

  useEffect(() => {
    const syncRole = () =>
      setUserRole(localStorage.getItem("userRole") as Role);
    window.addEventListener("storage", syncRole);
    window.addEventListener("authChange", syncRole);
    return () => {
      window.removeEventListener("storage", syncRole);
      window.removeEventListener("authChange", syncRole);
    };
  }, []);

  const visibleItems = useMemo(() => {
    if (!userRole) return [];
    return SIDEBAR_ITEMS.filter((item) =>
      item.roles.includes(userRole as Exclude<Role, null>),
    );
  }, [userRole]);

  return (
    <>
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-6 left-6 z-50 p-3 bg-white rounded-xl shadow-lg"
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
              <X className="w-6 h-6 text-black" />
            </motion.div>
          ) : (
            <motion.div
              key="menu"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Menu className="w-6 h-6 text-black" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

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

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: -288, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -288, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 h-full w-72 bg-white p-6 flex flex-col shadow-2xl z-50"
            style={{ fontFamily: "Poppins, sans-serif" }}
          >
            <motion.div
              className="flex items-center justify-center mb-10 mt-8"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <span className="text-2xl font-bold text-black">The Crunch</span>
            </motion.div>

            <div className="text-xs text-gray-400 mb-4 uppercase tracking-wider font-medium px-2">
              Navigation
            </div>

            <nav className="flex-1 space-y-1.5">
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
                      )}
                    >
                      {item.label}
                    </Button>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="mt-6 pt-6 border-t border-gray-100">
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.45 }}
              >
                <Button
                  variant="ghost"
                  className="w-full justify-start rounded-xl text-sm text-black mt-6 transition-all duration-200 px-4 py-2.5 hover:bg-red-50 hover:text-red-600"
                  onClick={() => {
                    localStorage.removeItem("isAuthenticated");
                    localStorage.removeItem("authToken");
                    localStorage.removeItem("userName");
                    localStorage.removeItem("userRole");
                    localStorage.removeItem("userId");
                    window.dispatchEvent(new Event("authChange"));
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
