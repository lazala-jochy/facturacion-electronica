import { Outlet, NavLink } from "react-router-dom";
import { useState } from "react";
import type { AuthCompany } from "../types/session";
import { BuildingIcon } from "../icons/branding";
import { companyUploadedLogoUrl } from "../utils/companyLogo";

export default function AppLayout({
  company,
  onLogout,
}: {
  company: AuthCompany;
  onLogout: () => void;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const sidebarLogoUrl = companyUploadedLogoUrl(company);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-[#f5f6ff] via-[#f8f9ff] to-[#eef2ff]">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-white text-[#0b57d0] border border-slate-200 rounded-lg transition hover:scale-105 active:scale-95 shadow-sm"
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
        className={`fixed lg:sticky lg:self-start top-0 left-0 h-screen w-64 bg-white text-slate-700 p-4 flex flex-col z-40 transition-transform duration-300 lg:translate-x-0 border-r border-slate-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* TOP */}
        <div>
          <div className="flex items-start justify-between gap-2 mb-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="h-11 w-11 shrink-0 rounded-lg border border-slate-100 bg-white grid place-items-center overflow-hidden text-[#2563eb]">
                {sidebarLogoUrl ? (
                  <img
                    src={sidebarLogoUrl}
                    alt={company.name ? `${company.name} logo` : "Logo empresa"}
                    className="h-full w-full object-contain object-center p-1.5"
                  />
                ) : (
                  <BuildingIcon className="h-6 w-6 shrink-0" />
                )}
              </div>
              <div className="min-w-0">
                <p
                  className="text-sm font-semibold leading-snug text-slate-900 line-clamp-2"
                  title={company.name}
                >
                  {company.name || "Empresa"}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500 tabular-nums truncate" title={`RNC ${company.rnc}`}>
                  RNC {company.rnc}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-slate-600 p-1"
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
                `block p-2 rounded transition-all duration-200 ${
                  isActive
                    ? "bg-[#e9f9ef] text-[#15803d] border border-[#b7e7c7] shadow-inner"
                    : "hover:bg-slate-50 hover:translate-x-1"
                }`
              }
            >
              Inicio
            </NavLink>

            <NavLink
              to="/ecf"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block p-2 rounded transition-all duration-200 ${
                  isActive
                    ? "bg-[#e9f9ef] text-[#15803d] border border-[#b7e7c7] shadow-inner"
                    : "hover:bg-slate-50 hover:translate-x-1"
                }`
              }
            >
              e-CF
            </NavLink>

            <NavLink
              to="/ecf-excel-batch"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block p-2 rounded transition-all duration-200 ${
                  isActive
                    ? "bg-[#e9f9ef] text-[#15803d] border border-[#b7e7c7] shadow-inner"
                    : "hover:bg-slate-50 hover:translate-x-1"
                }`
              }
            >
              Casos DGII Excel
            </NavLink>

            <NavLink
              to="/clients"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block p-2 rounded transition-all duration-200 ${
                  isActive
                    ? "bg-[#e9f9ef] text-[#15803d] border border-[#b7e7c7] shadow-inner"
                    : "hover:bg-slate-50 hover:translate-x-1"
                }`
              }
            >
              Clientes
            </NavLink>

            <NavLink
              to="/cotizaciones/nueva"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block p-2 rounded transition-all duration-200 ${
                  isActive
                    ? "bg-[#e9f9ef] text-[#15803d] border border-[#b7e7c7] shadow-inner"
                    : "hover:bg-slate-50 hover:translate-x-1"
                }`
              }
            >
              Cotización
            </NavLink>

            <NavLink
              to="/invoices"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block p-2 rounded transition-all duration-200 ${
                  isActive
                    ? "bg-[#e9f9ef] text-[#15803d] border border-[#b7e7c7] shadow-inner"
                    : "hover:bg-slate-50 hover:translate-x-1"
                }`
              }
            >
              Reporte
            </NavLink>
          </nav>
        </div>

        {/* BOTTOM */}
        <div className="mt-auto relative">
          <button
            type="button"
            onClick={() => setAccountOpen((prev) => !prev)}
            className="w-full p-2 rounded bg-slate-100 hover:bg-slate-200 transition-all duration-200 hover:scale-[1.02] text-left flex items-center justify-between text-slate-700"
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
                  `block px-3 py-2 text-sm transition-all duration-200 ${
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
                className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-all duration-200"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full min-w-0 pt-16 lg:pt-0 px-3 py-4 sm:p-6 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
