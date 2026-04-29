import { useMemo, useState } from "react";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ECF from "./pages/ECF";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import Invoices from "./pages/Invoices";
import Clients from "./pages/Clients";
import type { AuthCompany } from "./types/company";

const STORAGE_KEY = "fe_rd_session_company";

function App() {
  const initialCompany = useMemo<AuthCompany | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as AuthCompany;
    } catch {
      return null;
    }
  }, []);

  const [company, setCompany] = useState<AuthCompany | null>(initialCompany);

  const handleAuthenticated = (nextCompany: AuthCompany) => {
    setCompany(nextCompany);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCompany));
  };

  const handleLogout = () => {
    setCompany(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  if (!company) {
    return <Auth onAuthenticated={handleAuthenticated} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout onLogout={handleLogout} />}>
          <Route
            path="/"
            element={<Dashboard company={company} />}
          />
          <Route path="/ecf" element={<ECF company={company} />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/invoices" element={<Invoices />} />

          {/* fallback */}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
