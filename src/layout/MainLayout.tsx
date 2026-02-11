import { Outlet } from "react-router-dom"
import { Sidebar } from "@/components/ui/sidebar"

export function MainLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}