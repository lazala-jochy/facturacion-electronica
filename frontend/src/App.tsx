import { useMemo, useState } from "react";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ECF from "./pages/ECF";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import Invoices from "./pages/Invoices";
import Clients from "./pages/Clients";
import CotizacionCreate from "./pages/CotizacionCreate";
import { AUTH_STORAGE_KEY, type AuthSession } from "./types/session";
import CompanyProfile from "./pages/CompanyProfile";

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

  if (!session) {
    return <Auth onAuthenticated={handleAuthenticated} />;
  }

  const { company } = session;
  const RouterComponent = window.location.protocol === "file:" ? HashRouter : BrowserRouter;

  return (
    <RouterComponent>
      <Routes>
        <Route element={<AppLayout onLogout={handleLogout} />}>
          <Route path="/" element={<Dashboard company={company} />} />
          <Route path="/ecf" element={<ECF company={company} />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/cotizaciones/nueva" element={<CotizacionCreate />} />
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
