import { useState } from "react"
import { Link, NavLink } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Menu, X } from "lucide-react"

const navigationItems = [
  { label: "Dashboard", path: "/home" },
  { label: "Order", path: "/orders" },
  { label: "Inventory", path: "/inventory" },
  { label: "Products", path: "/products" },
  { label: "Menus", path: "/menu" },
  { label: "Sales", path: "/sales" },
  { label: "Reports", path: "/reports" },
]

const additionalItems = [
  { label: "User Accounts", path: "/users" },
  { label: "Menu Management", path: "/menu-management" },
  { label: "Supplier Maintenance", path: "/suppliers" },
]

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
  
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-6 left-6 z-50 p-3 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-black" />
        ) : (
          <Menu className="w-6 h-6 text-black" />
        )}
      </button>


      {isOpen && (
        <div
          className="fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-all duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

  
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-72 bg-white p-6 flex flex-col shadow-2xl z-50 transition-all duration-300 ease-in-out font-['Poppins',sans-serif]",
          isOpen ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"
        )}
      >
        <div className="flex items-center justify-center mb-10 mt-8">
          <span className="text-2xl font-bold text-black">
            The Crunch
          </span>
        </div>

        <div className="text-xs text-gray-400 mb-4 uppercase tracking-wider font-medium px-2">
          Navigation
        </div>

      
        <nav className="flex-1 space-y-1.5">
          {navigationItems.map((item) => (
            <NavLink key={item.label} to={item.path} end>
              {({ isActive }) => (
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start rounded-xl text-sm transition-all duration-300 px-4 py-2.5",
                    "text-black hover:bg-gray-50 hover:shadow-sm hover:scale-[1.02] active:scale-95",
                    isActive && "bg-gray-100 text-black font-semibold"
                  )}
                >
                  {item.label}
                </Button>
              )}
            </NavLink>
          ))}
        </nav>

     
        <div className="space-y-1.5 mt-6 pt-6 border-t border-gray-100">
          {additionalItems.map((item) => (
            <NavLink key={item.label} to={item.path} onClick={() => setIsOpen(false)}>
              {({ isActive }) => (
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start rounded-xl text-sm transition-all duration-300 px-4 py-2.5",
                    "text-black hover:bg-gray-50 hover:shadow-sm hover:scale-[1.02] active:scale-95",
                    isActive && "bg-gray-100 text-black font-semibold"
                  )}
                >
                  {item.label}
                </Button>
              )}
            </NavLink>
          ))}

        <Link to="/login" className="w-full">
          <Button
            variant="ghost"
            className="w-full justify-start rounded-xl text-sm text-black mt-6 transition-all duration-300 px-4 py-2.5 hover:bg-red-50 hover:text-red-600 hover:shadow-sm hover:scale-[1.02] active:scale-95"
            onClick={() => setIsOpen(false)}
          >
            Log Out
          </Button>
          </Link>
        </div>
      </aside>
    </>
  )
} 