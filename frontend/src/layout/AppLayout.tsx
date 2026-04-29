import { Outlet, NavLink } from "react-router-dom";

export default function AppLayout({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="h-screen flex bg-gray-100">
      <aside className="w-64 bg-gray-900 text-white p-4 flex flex-col h-full">
        {/* TOP */}
        <div>
          <h1 className="text-xl font-bold mb-6">Facturación</h1>

          <nav className="space-y-2">
            <NavLink to="/" className="block p-2 rounded hover:bg-gray-700">
              Dashboard
            </NavLink>

            <NavLink to="/ecf" className="block p-2 rounded hover:bg-gray-700">
              e-CF
            </NavLink>

            <NavLink
              to="/clients"
              className="block p-2 rounded hover:bg-gray-700"
            >
              Clients
            </NavLink>

            <NavLink
              to="/invoices"
              className="block p-2 rounded hover:bg-gray-700"
            >
              Invoices
            </NavLink>
          </nav>
        </div>

        {/* BOTTOM */}
        <button
          onClick={onLogout}
          className="mt-auto w-full p-2 rounded hover:bg-red-600 transition"
        >
          Cerrar sesión
        </button>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
