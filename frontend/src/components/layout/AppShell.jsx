import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function AppShell() {
  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
