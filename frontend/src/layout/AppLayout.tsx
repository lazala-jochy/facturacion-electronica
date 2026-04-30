import { Outlet, NavLink } from "react-router-dom";
import { useState } from "react";

export default function AppLayout({ onLogout }: { onLogout: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gray-100">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-gray-900 text-white rounded-lg"
        aria-label="Toggle menu"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={sidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
          />
        </svg>
      </button>

      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:relative top-0 left-0 h-screen lg:h-auto w-64 bg-gray-900 text-white p-4 flex flex-col z-40 transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* TOP */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold">Facturación</h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-white p-1"
              aria-label="Close menu"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <nav className="space-y-2">
            <NavLink
              to="/"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block p-2 rounded transition ${
                  isActive ? "bg-gray-700" : "hover:bg-gray-700"
                }`
              }
            >
              Dashboard
            </NavLink>

            <NavLink
              to="/ecf"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block p-2 rounded transition ${
                  isActive ? "bg-gray-700" : "hover:bg-gray-700"
                }`
              }
            >
              e-CF
            </NavLink>

            <NavLink
              to="/clients"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block p-2 rounded transition ${
                  isActive ? "bg-gray-700" : "hover:bg-gray-700"
                }`
              }
            >
              Clientes
            </NavLink>

            <NavLink
              to="/cotizaciones/nueva"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block p-2 rounded transition ${
                  isActive ? "bg-gray-700" : "hover:bg-gray-700"
                }`
              }
            >
              Cotización
            </NavLink>

            <NavLink
              to="/invoices"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block p-2 rounded transition ${
                  isActive ? "bg-gray-700" : "hover:bg-gray-700"
                }`
              }
            >
              Invoices
            </NavLink>
          </nav>
        </div>

        {/* BOTTOM */}
        <div className="mt-auto relative">
          <button
            type="button"
            onClick={() => setAccountOpen((prev) => !prev)}
            className="w-full p-2 rounded bg-gray-800 hover:bg-gray-700 transition text-left flex items-center justify-between"
          >
            <span>Cuenta</span>
            <span className="text-xs">{accountOpen ? "▲" : "▼"}</span>
          </button>

          {accountOpen && (
            <div className="mt-2 w-full rounded-md bg-white text-slate-800 shadow-lg border border-slate-200 overflow-hidden">
              <NavLink
                to="/company-profile"
                onClick={() => {
                  setAccountOpen(false);
                  setSidebarOpen(false);
                }}
                className={({ isActive }) =>
                  `block px-3 py-2 text-sm transition ${
                    isActive ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50"
                  }`
                }
              >
                Perfil de empresa
              </NavLink>
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  onLogout();
                }}
                className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full pt-16 lg:pt-0 p-4 sm:p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
