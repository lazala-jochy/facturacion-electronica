import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex bg-gray-100">
      
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white p-4">
        <h1 className="text-xl font-bold mb-6">
          Facturación
        </h1>

        <nav className="space-y-2">
          <button className="w-full text-left p-2 hover:bg-gray-700 rounded">
            Dashboard
          </button>

          <button className="w-full text-left p-2 hover:bg-gray-700 rounded">
            Clients
          </button>

          <button className="w-full text-left p-2 hover:bg-gray-700 rounded">
            Invoices
          </button>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">
        {children}
      </main>

    </div>
  );
}