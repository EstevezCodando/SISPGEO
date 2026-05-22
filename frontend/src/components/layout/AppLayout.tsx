import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'
import { ProductTicker } from './ProductTicker'
import { DeadlineBanner } from './DeadlineBanner'

export function AppLayout() {
  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <Navbar />
      <ProductTicker />
      <DeadlineBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6 bg-zinc-950">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
