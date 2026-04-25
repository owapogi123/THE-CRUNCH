import { Outlet } from "react-router-dom"
import { Sidebar } from "@/components/Sidebar"

export function MainLayout() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden">
      <Sidebar />
      <main className="w-full">
        <Outlet />
      </main>
    </div>
  )
}