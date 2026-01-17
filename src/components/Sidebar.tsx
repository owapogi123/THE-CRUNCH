import { NavLink } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navigationItems = [
  { label: "Dashboard", path: "/" },
  { label: "Order", path: "/orders" },
  { label: "Inventory", path: "/inventory" },
  { label: "Products", path: "/products" },
  { label: "Reports", path: "/reports" },
  { label: "Sales", path: "/sales" },
  { label: "Menu", path: "/menu" },
]

const additionalItems = [
  { label: "User Accounts", path: "/users" },
  { label: "Menu Management", path: "/menu-management" },
  { label: "Supplier Maintenance", path: "/suppliers" },
]

export function Sidebar() {
  return (
    <aside className="w-48 bg-[#F5EFE0] p-4 flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <img
          src="/src/assets/img/logo.jpg"
          alt="Logo"
          className="w-14 h-14 rounded-full"
        />
        <span className="text-lg font-semibold text-[#4A1C1C]">
          The Crunch
        </span>
      </div>

      <div className="text-xs text-gray-500 mb-3 uppercase">
        Navigation
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 space-y-2">
        {navigationItems.map((item) => (
          <NavLink key={item.label} to={item.path} end>
            {({ isActive }) => (
              <Button
                variant={isActive ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start rounded-xl text-sm",
                  isActive
                    ? "bg-[#8B3A3A] text-white hover:bg-[#8B3A3A]/90"
                    : "text-[#4A1C1C] hover:bg-[#8B3A3A] hover:text-white",
                )}
              >
                {item.label}
              </Button>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Additional Items */}
      <div className="space-y-2 mt-4">
        {additionalItems.map((item) => (
          <NavLink key={item.label} to={item.path}>
            {({ isActive }) => (
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start rounded-xl text-sm text-white bg-[#292929] hover:bg-[#3A3A3A]",
                  isActive && "ring-2 ring-[#8B3A3A]",
                )}
              >
                {item.label}
              </Button>
            )}
          </NavLink>
        ))}

        {/* Logout */}
        <Button
          variant="ghost"
          className="w-full justify-start rounded-xl text-sm text-[#4A1C1C] hover:bg-gray-100 mt-8"
        >
          Log Out
        </Button>
      </div>
    </aside>
  )
}
