import { useEffect, useMemo, useState } from "react";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ECF from "./pages/ECF";
import ForgotPassword from "./pages/ForgotPassword";
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import DgiiPruebasLayout from "./layout/DgiiPruebasLayout";
import Invoices from "./pages/Invoices";
import Clients from "./pages/Clients";
import CotizacionCreate from "./pages/CotizacionCreate";
import CotizacionEdit from "./pages/CotizacionEdit";
import {
  AUTH_SESSION_INVALIDATED,
  AUTH_SESSION_UPDATED,
  proactiveRefreshIfNeeded,
} from "./services/api";
import { AUTH_STORAGE_KEY, type AuthSession } from "./types/session";
import CompanyProfile from "./pages/CompanyProfile";
import EcfExcelBatch from "./pages/EcfExcelBatch";
import DgiiAprobacionesComerciales from "./pages/DgiiAprobacionesComerciales";
import DgiiPruebasHub from "./pages/DgiiPruebasHub";
import DgiiEcfSimulacion from "./pages/DgiiEcfSimulacion";
import Formatos606607 from "./pages/Formatos606607";
import { documentTitleWithCompany } from "./utils/productBranding";

function App() {
  const initialSession = useMemo<AuthSession | null>(() => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored) as Partial<AuthSession>;
      if (parsed?.token && parsed?.user && parsed?.company) {
        return parsed as AuthSession;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const [session, setSession] = useState<AuthSession | null>(initialSession);

  useEffect(() => {
    if (!session?.company?.name) return;
    document.title = documentTitleWithCompany(session.company.name);
  }, [session?.company?.name]);

  useEffect(() => {
    if (!session?.refresh_token) return;
    void proactiveRefreshIfNeeded();
    const id = window.setInterval(() => {
      void proactiveRefreshIfNeeded();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [session?.token, session?.refresh_token]);

  useEffect(() => {
    const onInvalidated = () => setSession(null);
    const onUpdated = (e: Event) => {
      const next = (e as CustomEvent<AuthSession>).detail;
      if (next?.token && next?.user && next?.company) setSession(next);
    };
    window.addEventListener(AUTH_SESSION_INVALIDATED, onInvalidated);
    window.addEventListener(AUTH_SESSION_UPDATED, onUpdated);
    return () => {
      window.removeEventListener(AUTH_SESSION_INVALIDATED, onInvalidated);
      window.removeEventListener(AUTH_SESSION_UPDATED, onUpdated);
    };
  }, []);

  const handleAuthenticated = (next: AuthSession) => {
    setSession(next);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
  };

  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const handleProfileUpdated = (
    user: AuthSession["user"],
    company: AuthSession["company"],
  ) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user, company };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const RouterComponent = window.location.protocol === "file:" ? HashRouter : BrowserRouter;

  if (!session) {
    return (
      <RouterComponent>
        <Routes>
          <Route path="/recuperar" element={<ForgotPassword />} />
          <Route path="*" element={<Auth onAuthenticated={handleAuthenticated} />} />
        </Routes>
      </RouterComponent>
    );
  }

  const { company } = session;

  return (
    <RouterComponent>
      <Routes>
        <Route element={<AppLayout company={company} onLogout={handleLogout} />}>
          <Route path="/" element={<Dashboard company={company} user={session.user} />} />
          <Route path="/ecf" element={<ECF company={company} />} />
          <Route path="/606-607" element={<Formatos606607 />} />
          <Route path="/formatos-606-607" element={<Navigate to="/606-607" replace />} />
          <Route
            path="/dgii-pruebas"
            element={
              company.dgiiEnvironment === "PRODUCCION" ? (
                <Navigate to="/" replace />
              ) : (
                <DgiiPruebasLayout
                  company={company}
                  onCompanyUpdated={(c) => handleProfileUpdated(session.user, c)}
                />
              )
            }
          >
            <Route index element={<DgiiPruebasHub />} />
            <Route
              path="ecf-excel"
              element={
                <EcfExcelBatch
                  company={company}
                  onCompanyUpdated={(c) => handleProfileUpdated(session.user, c)}
                />
              }
            />
            <Route
              path="aprobaciones-comerciales"
              element={
                <DgiiAprobacionesComerciales
                  company={company}
                  onCompanyUpdated={(c) => handleProfileUpdated(session.user, c)}
                />
              }
            />
            <Route
              path="ecf-simulacion"
              element={
                <DgiiEcfSimulacion
                  company={company}
                  onCompanyUpdated={(c) => handleProfileUpdated(session.user, c)}
                />
              }
            />
          </Route>
          <Route path="/ecf-excel-batch" element={<Navigate to="/dgii-pruebas/ecf-excel" replace />} />
          <Route
            path="/dgii-aprobaciones-comerciales"
            element={<Navigate to="/dgii-pruebas/aprobaciones-comerciales" replace />}
          />
          <Route path="/clients" element={<Clients />} />
          <Route path="/cotizaciones/nueva" element={<CotizacionCreate />} />
          <Route path="/cotizaciones/:id/editar" element={<CotizacionEdit />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route
            path="/company-profile"
            element={
              <CompanyProfile
                session={session}
                onProfileUpdated={handleProfileUpdated}
              />
            }
          />
        </Route>
      </Routes>
    </RouterComponent>
  );
}

export default App;
